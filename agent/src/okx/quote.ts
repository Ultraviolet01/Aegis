import { OKXDexClient } from '@okx-dex/okx-dex-sdk';
import type { Logger } from '../logger.js';

/**
 * OKX DEX quote client — used as an INDEPENDENT reference price.
 *
 * Why this exists: the oracle-deviation check needs a second opinion. Comparing
 * the Chainlink feed against itself would always read 0% deviation and give
 * false reassurance, so Phase 1 deliberately left `referencePrice` undefined.
 * A live DEX quote is a genuinely independent source — it reflects what the
 * asset can actually be sold for right now, which is exactly the number that
 * matters when deciding whether to exit.
 *
 * This module is READ-ONLY. It never signs or sends anything. Quote requests
 * carry no private key and cannot move funds.
 *
 * ---------------------------- MAINNET ONLY ----------------------------
 * The SDK ships network configs for chainIndex "196" (X Layer mainnet) and
 * has no entry for 1952 (testnet) — the OKX DEX aggregator does not index
 * testnet liquidity. On testnet, quotes are unavailable and the deviation
 * check stays skipped rather than falling back to a fabricated number.
 * ----------------------------------------------------------------------
 */

/** X Layer mainnet chainIndex, confirmed against the SDK's own network table. */
export const XLAYER_MAINNET_CHAIN_INDEX = '196';

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  apiPassphrase: string;
  projectId: string;
}

export interface QuoteRequest {
  /** Token being valued (the position's asset). */
  fromTokenAddress: string;
  /** Quote denominator — USDC for a USD-denominated reference price. */
  toTokenAddress: string;
  /** Raw amount in the asset's smallest unit. */
  amount: string;
  fromDecimals: number;
  toDecimals: number;
}

export interface QuoteReference {
  /** Unit price of fromToken denominated in toToken. */
  price: number;
  /** Raw output amount for the requested input. */
  toAmount: string;
  /** OKX's own price-impact estimate, when provided. */
  priceImpactPercent?: number;
  fetchedAt: number;
}

/**
 * Thin wrapper over the SDK's quote endpoint.
 *
 * Deliberately narrow: this class exposes only `getReferencePrice`. It holds
 * no wallet and has no swap method, so there is no code path from a quote to
 * a fund movement.
 */
export class OkxQuoteClient {
  private readonly client: OKXDexClient;

  constructor(
    credentials: OkxCredentials,
    private readonly logger: Logger,
    private readonly chainIndex: string = XLAYER_MAINNET_CHAIN_INDEX,
  ) {
    // No `evm` wallet config is passed on purpose. Without it the SDK cannot
    // sign, which makes "quotes only" a structural property rather than a
    // convention someone could accidentally break later.
    this.client = new OKXDexClient({
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
      apiPassphrase: credentials.apiPassphrase,
      projectId: credentials.projectId,
      timeout: 15_000,
      maxRetries: 2,
    });
  }

  /**
   * Fetch a unit price for `fromToken` denominated in `toToken`.
   *
   * Returns undefined on any failure. That is intentional: a failed quote must
   * leave the deviation check skipped, never substitute a stale or guessed
   * price. Undefined means "no second opinion available", which the risk
   * engine already handles correctly.
   */
  async getReferencePrice(request: QuoteRequest): Promise<QuoteReference | undefined> {
    try {
      const response = await this.client.dex.getQuote({
        chainIndex: this.chainIndex,
        fromTokenAddress: request.fromTokenAddress,
        toTokenAddress: request.toTokenAddress,
        amount: request.amount,
        slippagePercent: '0.005',
      });

      const quote = response.data?.[0];
      if (!quote) {
        this.logger.warn('OKX quote returned no route', {
          fromToken: request.fromTokenAddress,
          toToken: request.toTokenAddress,
        });
        return undefined;
      }

      const toAmountRaw = quote.toTokenAmount;
      if (!toAmountRaw) {
        this.logger.warn('OKX quote missing toTokenAmount');
        return undefined;
      }

      // Normalize both sides by their own decimals before dividing. Skipping
      // this would silently scale the price by 10^(fromDecimals-toDecimals),
      // e.g. an 18-decimal asset quoted into 6-decimal USDC would read as a
      // trillion-fold price change and trigger an instant false exit.
      const fromAmount = Number(request.amount) / 10 ** request.fromDecimals;
      const toAmount = Number(toAmountRaw) / 10 ** request.toDecimals;

      if (!Number.isFinite(fromAmount) || fromAmount <= 0) {
        this.logger.warn('Invalid quote input amount', { amount: request.amount });
        return undefined;
      }
      if (!Number.isFinite(toAmount) || toAmount <= 0) {
        this.logger.warn('Invalid quote output amount', { toAmountRaw });
        return undefined;
      }

      const impact = Number(quote.priceImpactPercent);

      return {
        price: toAmount / fromAmount,
        toAmount: String(toAmountRaw),
        ...(Number.isFinite(impact) ? { priceImpactPercent: impact } : {}),
        fetchedAt: Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      // Quote failures are expected and survivable: rate limits, thin
      // liquidity, or an unsupported pair. Log and degrade rather than
      // stopping the monitoring loop.
      this.logger.warn('OKX quote failed - deviation check will be skipped this pass', {
        error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      });
      return undefined;
    }
  }
}
