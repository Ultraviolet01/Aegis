import type { Address, PublicClient } from 'viem';
import { aegisVaultAbi, erc20Abi, policyRegistryAbi, riskOracleAbi } from './chain/abis.js';
import {
  assessRisk,
  BPS_DENOMINATOR,
  POLICY_MODES,
  type PolicyMode,
  type PriceSample,
  type RiskAssessment,
  type RiskPolicy,
} from './risk/engine.js';

import type { Executor } from './executor.js';
import type { Logger } from './logger.js';
import type { OkxQuoteClient } from './okx/quote.js';

/**
 * The monitoring loop: read positions -> read prices -> assess -> execute.
 *
 * Price history and peak tracking live in memory here because AegisVault.Position
 * intentionally stores no price data — keeping price bookkeeping off-chain
 * avoids paying gas to record something that is only ever an input to an
 * off-chain decision.
 *
 * The tradeoff is explicit: history does NOT survive a restart. On restart the
 * peak re-seeds from the current price, so a drawdown already in progress
 * reads as 0% until a new peak forms. That is the SAFE direction to fail —
 * it can delay an exit, never cause an unrequested one. Persisting this is a
 * post-MVP concern, noted rather than hidden.
 */

export interface PositionState {
  positionId: bigint;
  owner: Address;
  asset: Address;
  amount: bigint;
  pausedByAgent: boolean;
  exists: boolean;
}

interface AssetTracking {
  peakPrice: number;
  history: PriceSample[];
  /**
   * Set once the agent has actually exited for the drawdown event in progress.
   *
   * Without this, a persistently depressed price re-satisfies the same
   * threshold on every pass and the agent exits again, and again — observed
   * live on testnet routing 200 -> 100 -> 50 in consecutive passes. "Exit 50%
   * if drawdown > 8%" means 50% for that event, not 50% every poll interval.
   */
  lastExit?: { atPrice: number; atTime: number };
}


export interface MonitorDeps {
  publicClient: PublicClient;
  vaultAddress: Address;
  policyRegistryAddress: Address;
  riskOracleAddress: Address;
  executor: Executor;
  logger: Logger;
  historySize: number;
  /**
   * Optional OKX DEX quote client. Absent on testnet (the aggregator indexes
   * mainnet liquidity only) and absent when credentials are unset — in both
   * cases the deviation check stays skipped rather than inventing a number.
   */
  quoteClient?: OkxQuoteClient;
  /** Quote denominator, e.g. USDC. Required when quoteClient is set. */
  quoteToken?: { address: Address; decimals: number };
  /**
   * Minimum seconds between two exits on the same position. A floor on how
   * fast the agent can act, independent of how the price moves.
   */
  exitCooldownSeconds: number;
}


export class Monitor {
  /** positionId -> tracking. Keyed per position, not per asset, because two
   *  positions in the same asset can be opened at different peaks. */
  private readonly tracking = new Map<string, AssetTracking>();

  constructor(private readonly deps: MonitorDeps) {}

  /** Enumerate live positions. Fine for MVP scale; an indexer would replace
   *  this if position counts ever got large. */
  async loadPositions(): Promise<PositionState[]> {
    const nextId = (await this.deps.publicClient.readContract({
      address: this.deps.vaultAddress,
      abi: aegisVaultAbi,
      functionName: 'nextPositionId',
    })) as bigint;

    const positions: PositionState[] = [];

    for (let id = 1n; id < nextId; id++) {
      try {
        const result = (await this.deps.publicClient.readContract({
          address: this.deps.vaultAddress,
          abi: aegisVaultAbi,
          functionName: 'positions',
          args: [id],
        })) as readonly [Address, Address, bigint, boolean, boolean];

        const [owner, asset, amount, pausedByAgent, exists] = result;

        // Skip closed/withdrawn positions — nothing to protect.
        if (!exists || amount === 0n) continue;

        positions.push({ positionId: id, owner, asset, amount, pausedByAgent, exists });
      } catch (err) {
        // One unreadable position must not stop the whole sweep; the other
        // positions still need guarding.
        this.deps.logger.error('Failed to read position', { positionId: id, error: String(err) });
      }
    }

    return positions;
  }

  /** Read the on-chain policy for a position. */
  async loadPolicy(positionId: bigint): Promise<RiskPolicy | undefined> {
    try {
      const policy = (await this.deps.publicClient.readContract({
        address: this.deps.policyRegistryAddress,
        abi: policyRegistryAbi,
        functionName: 'getPolicy',
        args: [positionId],
      })) as {
        drawdownThresholdBps: number;
        oracleDeviationThresholdBps: number;
        exitPercentBps: number;
        mode: number;
        active: boolean;
        updatedAt: bigint;
      };

      // updatedAt === 0 means the owner has never set a policy. Treated as
      // "no policy", never as a permissive default.
      if (policy.updatedAt === 0n) return undefined;

      const mode: PolicyMode = POLICY_MODES[policy.mode] ?? 'Conservative';

      return {
        drawdownThresholdBps: Number(policy.drawdownThresholdBps),
        oracleDeviationThresholdBps: Number(policy.oracleDeviationThresholdBps),
        exitPercentBps: Number(policy.exitPercentBps),
        mode,
        active: policy.active,
      };
    } catch (err) {
      this.deps.logger.error('Failed to read policy', { positionId, error: String(err) });
      return undefined;
    }
  }

  /**
   * Read a Chainlink Data Feeds price via RiskOracle, normalized by the feed's
   * own decimals.
   *
   * Returns undefined when no feed is configured or the price is stale — the
   * contract reverts with NoFeedForAsset / StalePrice, and an unpriced asset
   * must never be treated as "price unchanged".
   */
  /**
   * Read the reference price for an asset.
   *
   * Primary source: OKX DEX quote client (direct DEX quote price).
   * Fallback source: On-chain RiskOracle (Chainlink-shaped interface).
   *
   * Fail-safe discipline:
   * Returns `undefined` when both sources fail, time out, or are unconfigured.
   * An unpriced asset is logged and skipped — NEVER treated as 0 or price unchanged.
   */
  async loadPrice(asset: Address, amount?: bigint): Promise<number | undefined> {
    // 1. Try OKX DEX quote client directly if available
    if (this.deps.quoteClient && this.deps.quoteToken) {
      try {
        const dexPrice = await this.loadReferencePrice(asset, amount ?? 0n);
        if (dexPrice !== undefined && Number.isFinite(dexPrice) && dexPrice > 0) {
          this.deps.logger.debug('Using OKX DEX quote reference price', { asset, dexPrice });
          return dexPrice;
        }
      } catch (err) {
        this.deps.logger.warn('OKX DEX quote price fetch failed - falling back to RiskOracle', {
          asset,
          error: String(err).slice(0, 160),
        });
      }
    }

    // 2. Fallback to RiskOracle contract if set
    try {
      const [price, decimals] = (await this.deps.publicClient.readContract({
        address: this.deps.riskOracleAddress,
        abi: riskOracleAbi,
        functionName: 'getPrice',
        args: [asset],
      })) as readonly [bigint, number];

      const oraclePrice = Number(price) / 10 ** Number(decimals);
      if (Number.isFinite(oraclePrice) && oraclePrice > 0) {
        return oraclePrice;
      }
      return undefined;
    } catch (err) {
      this.deps.logger.warn('No usable price for asset (DEX quote unavailable and RiskOracle feed unset or stale)', {
        asset,
        error: String(err).slice(0, 160),
      });
      return undefined;
    }
  }

  /**
   * Asset decimals, cached. Immutable per token, so one read each is enough —
   * and it must be read, not assumed: xStocks are 18-decimal while USDC is 6,
   * and hardcoding either would misprice the other by 10^12.
   */
  private readonly decimalsCache = new Map<Address, number>();

  private async assetDecimals(asset: Address): Promise<number | undefined> {
    const cached = this.decimalsCache.get(asset);
    if (cached !== undefined) return cached;

    try {
      const decimals = (await this.deps.publicClient.readContract({
        address: asset,
        abi: erc20Abi,
        functionName: 'decimals',
      })) as number;

      this.decimalsCache.set(asset, Number(decimals));
      return Number(decimals);
    } catch (err) {
      this.deps.logger.warn('Could not read token decimals - skipping reference price', {
        asset,
        error: String(err).slice(0, 160),
      });
      return undefined;
    }
  }

  /**
   * Independent reference price from an OKX DEX quote, denominated in the
   * quote token (USDC).
   *
   * Returns undefined whenever a real quote is unavailable, so the check is
   * skipped rather than run against a fabricated number.
   */
  async loadReferencePrice(asset: Address, amount: bigint): Promise<number | undefined> {
    const { quoteClient, quoteToken } = this.deps;
    if (!quoteClient || !quoteToken) return undefined;

    // Quoting an asset against itself would trivially return 1.0 and read as
    // 0% deviation — worse than no data, because it looks like confirmation.
    if (asset.toLowerCase() === quoteToken.address.toLowerCase()) return undefined;

    const decimals = await this.assetDecimals(asset);
    if (decimals === undefined) return undefined;

    // Quote position size if provided, otherwise default to 1 token unit
    const quoteAmount = amount > 0n ? amount : BigInt(10 ** decimals);

    const quote = await quoteClient.getReferencePrice({
      fromTokenAddress: asset,
      toTokenAddress: quoteToken.address,
      amount: quoteAmount.toString(),
      fromDecimals: decimals,
      toDecimals: quoteToken.decimals,
    });

    return quote?.price;
  }

  /** Record a sample and return the running peak for this position. */
  private track(positionId: bigint, price: number, timestamp: number): AssetTracking {
    const key = positionId.toString();
    let entry = this.tracking.get(key);

    if (!entry) {
      entry = { peakPrice: price, history: [] };
      this.tracking.set(key, entry);
    }

    if (price > entry.peakPrice) entry.peakPrice = price;

    entry.history.push({ price, timestamp });
    if (entry.history.length > this.deps.historySize) {
      entry.history.splice(0, entry.history.length - this.deps.historySize);
    }

    return entry;
  }

  /**
   * Decide whether an exit the engine wants is a NEW event or a repeat of one
   * already acted on.
   *
   * The engine is stateless and correct: while price sits below the threshold,
   * "drawdown > 8%" stays true forever, so it keeps returning `exit`. Acting
   * on every one of those compounds a single user instruction into an
   * unbounded series of withdrawals — live testnet run took 200 -> 100 -> 50
   * in two passes and would have continued to dust.
   *
   * Two ways past the latch:
   *   1. The price fell materially FURTHER (another full threshold below the
   *      price at the last exit) and the cooldown has elapsed — a real
   *      escalation, which the user's policy does intend to act on.
   *   2. Otherwise: suppress. Same event, already handled.
   *
   * Clearing the latch on recovery is deliberately NOT done here — see
   * rearmIfRecovered, which must run on every pass.
   */
  private exitSuppression(
    entry: AssetTracking,
    price: number,
    policy: RiskPolicy,
    now: number,
  ): { suppress: false } | { suppress: true; reason: string } {
    const last = entry.lastExit;
    if (!last) return { suppress: false };

    const elapsed = now - last.atTime;

    if (elapsed < this.deps.exitCooldownSeconds) {
      return {
        suppress: true,
        reason: `cooldown active (${elapsed}s of ${this.deps.exitCooldownSeconds}s since last exit)`,
      };
    }

    // 1. Genuine escalation since the last exit?
    const furtherDeclineBps =
      last.atPrice > 0 ? ((last.atPrice - price) / last.atPrice) * BPS_DENOMINATOR : 0;

    if (furtherDeclineBps >= policy.drawdownThresholdBps) {
      return { suppress: false };
    }

    // 2. Same event, already acted on.
    return {
      suppress: true,
      reason: 'already exited for this drawdown event; price has not fallen further',
    };
  }

  /**
   * Clear the exit latch once the drawdown has recovered below the threshold.
   *
   * This runs on EVERY pass, not only when an exit is proposed. That
   * distinction is the whole point: at a recovered price the engine returns
   * `none`, so anything gated behind an exit proposal would never see the
   * recovery and the latch would stay set forever — permanently disarming the
   * guardian after its first action. A regression test covers exactly this.
   */
  private rearmIfRecovered(entry: AssetTracking, price: number, policy: RiskPolicy): void {
    if (!entry.lastExit) return;

    const drawdownBps =
      entry.peakPrice > 0 ? ((entry.peakPrice - price) / entry.peakPrice) * BPS_DENOMINATOR : 0;

    if (drawdownBps < policy.drawdownThresholdBps) {
      delete entry.lastExit;
      this.deps.logger.debug('Drawdown recovered - re-armed for the next risk event', {
        price,
        peakPrice: entry.peakPrice,
      });
    }
  }


  /** One full monitoring pass over every live position. */

  async runOnce(): Promise<RiskAssessment[]> {
    const { logger } = this.deps;
    const positions = await this.loadPositions();

    if (positions.length === 0) {
      logger.debug('No open positions to monitor');
      return [];
    }

    const now = Math.floor(Date.now() / 1000);
    const assessments: RiskAssessment[] = [];

    for (const position of positions) {
      const policy = await this.loadPolicy(position.positionId);

      if (!policy) {
        logger.debug('Skipping position with no policy', { positionId: position.positionId });
        continue;
      }

      const price = await this.loadPrice(position.asset, position.amount);

      if (price === undefined) {
        // Without a trustworthy price there is no honest risk assessment to
        // make. Skipping is correct: acting on a missing price would be
        // acting on a guess.
        logger.warn('Skipping assessment - no price available', {
          positionId: position.positionId,
          asset: position.asset,
        });
        continue;
      }

      const tracking = this.track(position.positionId, price, now);
      const { peakPrice, history } = tracking;

      // Re-arm before assessing, every pass. A recovered price produces an
      // action of 'none', so this cannot live behind the exit branch below.
      this.rearmIfRecovered(tracking, price, policy);


      // Reference price for the deviation check.
      // Redefined for single-source OKX DEX quotes: compares current poll quote against
      // previous poll quote (history[history.length - 2].price) to detect sudden quote jumps/spikes.
      const previousQuote = history.length > 1 ? history[history.length - 2].price : undefined;
      const referencePrice = previousQuote ?? (await this.loadReferencePrice(position.asset, position.amount));

      const assessment = assessRisk({
        positionId: position.positionId,
        policy,
        currentPrice: price,
        peakPrice,
        referencePrice,
        history,
      });

      assessments.push(assessment);

      if (assessment.action !== 'none') {
        logger.info('Risk assessment', {
          positionId: assessment.positionId,
          score: assessment.score,
          action: assessment.action,
          summary: assessment.summary,
        });

        // De-duplicate exits against the event already acted on. Applies only
        // to 'exit': pausing and logging are idempotent and harmless to repeat,
        // while an exit moves funds and therefore compounds.
        if (assessment.action === 'exit') {
          const gate = this.exitSuppression(tracking, price, policy, now);


          if (gate.suppress) {
            logger.info('Exit suppressed - not a new risk event', {
              positionId: assessment.positionId,
              reason: gate.reason,
            });
            continue;
          }
        }

        const outcome = await this.deps.executor.execute(assessment);
        logger.info('Execution outcome', { positionId: assessment.positionId, ...outcome });

        // Latch only on a confirmed send. A failed or skipped attempt moved
        // nothing, so it must stay eligible to retry on the next pass.
        if (assessment.action === 'exit' && outcome.status === 'sent') {
          tracking.lastExit = { atPrice: price, atTime: now };
        }
      }

    }

    return assessments;
  }
}
