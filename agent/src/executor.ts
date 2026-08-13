import type { Address, PublicClient, WalletClient } from 'viem';

import type { PrivateKeyAccount } from 'viem/accounts';
import { aegisVaultAbi, policyRegistryAbi } from './chain/abis.js';

import { BPS_DENOMINATOR, type RiskAssessment } from './risk/engine.js';
import type { Logger } from './logger.js';

/**
 * The only component allowed to send state-changing transactions.
 *
 * Three guards sit between a risk assessment and a fund movement:
 *
 *   1. DRY_RUN — on by default, so a fresh checkout cannot move anything.
 *   2. A re-read of the on-chain policy immediately before acting, and a
 *      clamp of exitBps to that allowance. The contract enforces this too;
 *      doing it here means we never knowingly send a transaction that would
 *      revert, and the agent never even attempts to exceed the user's limit.
 *   3. Simulation before sending, so a revert surfaces as a readable error
 *      instead of a burnt transaction.
 *
 * There is deliberately no code path here that can transfer funds anywhere
 * other than via routeToEmergency, which has no recipient parameter.
 */

export interface ExecutorDeps {
  publicClient: PublicClient;
  walletClient: WalletClient;
  /**
   * The full local account object, NOT just its address.
   *
   * This distinction is load-bearing. viem treats a bare address string as a
   * JSON-RPC account — "the node holds this key" — so the simulated request
   * inherits that and writeContract dispatches `eth_sendTransaction`. A public
   * RPC holds no keys and simply never answers, so the exit times out at the
   * exact moment it is needed. Passing the account object makes it a LOCAL
   * account: viem signs in-process and sends `eth_sendRawTransaction`.
   *
   * Found by running the agent against live testnet, not by unit tests —
   * mocked clients accept either shape happily.
   */
  account: PrivateKeyAccount;

  vaultAddress: Address;
  policyRegistryAddress: Address;
  dryRun: boolean;
  logger: Logger;
}

export type ExecutionOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'dry-run'; intent: string }
  | { status: 'sent'; txHash: `0x${string}`; intent: string }
  | { status: 'failed'; error: string; intent: string };

export class Executor {
  constructor(private readonly deps: ExecutorDeps) {}

  /**
   * Re-read the owner's approved exit allowance straight from the chain.
   *
   * Deliberately NOT cached: the user may have tightened or deactivated their
   * policy since the monitoring pass began, and their most recent intent is
   * the one that must win.
   */
  private async readExitAllowance(
    positionId: bigint,
  ): Promise<{ allowanceBps: number; active: boolean }> {
    const [allowanceBps, active] = (await this.deps.publicClient.readContract({
      address: this.deps.policyRegistryAddress,
      abi: policyRegistryAbi,
      functionName: 'exitAllowanceBps',
      args: [positionId],
    })) as readonly [number, boolean];

    return { allowanceBps: Number(allowanceBps), active };
  }

  async execute(assessment: RiskAssessment): Promise<ExecutionOutcome> {
    const { logger } = this.deps;

    switch (assessment.action) {
      case 'none':
        return { status: 'skipped', reason: 'no action required' };

      case 'log':
        return this.logEvaluation(assessment);

      case 'pause':
        return this.pausePosition(assessment);

      case 'exit':
        return this.routeToEmergency(assessment);

      default: {
        // Exhaustiveness guard: a new action type must be handled explicitly
        // rather than silently falling through to "do nothing".
        const unreachable: never = assessment.action;
        logger.error('Unknown risk action', { action: unreachable });
        return { status: 'skipped', reason: `unknown action: ${String(unreachable)}` };
      }
    }
  }

  private async logEvaluation(assessment: RiskAssessment): Promise<ExecutionOutcome> {
    const intent = `logRiskEvaluation(position=${assessment.positionId}, score=${assessment.score})`;

    if (this.deps.dryRun) {
      this.deps.logger.info('[DRY RUN] would log evaluation', { intent });
      return { status: 'dry-run', intent };
    }

    try {
      const { request } = await this.deps.publicClient.simulateContract({
        address: this.deps.vaultAddress,
        abi: aegisVaultAbi,
        functionName: 'logRiskEvaluation',
        args: [assessment.positionId, BigInt(assessment.score), assessment.summary],
        account: this.deps.account,

      });

      const txHash = await this.deps.walletClient.writeContract(request);
      return { status: 'sent', txHash, intent };
    } catch (err) {
      return { status: 'failed', error: describeError(err), intent };
    }
  }

  private async pausePosition(assessment: RiskAssessment): Promise<ExecutionOutcome> {
    const intent = `pausePosition(position=${assessment.positionId})`;

    if (this.deps.dryRun) {
      this.deps.logger.warn('[DRY RUN] would pause position', {
        intent,
        reason: assessment.summary,
      });
      return { status: 'dry-run', intent };
    }

    try {
      const { request } = await this.deps.publicClient.simulateContract({
        address: this.deps.vaultAddress,
        abi: aegisVaultAbi,
        functionName: 'pausePosition',
        args: [assessment.positionId],
        account: this.deps.account,

      });

      const txHash = await this.deps.walletClient.writeContract(request);
      this.deps.logger.warn('Position paused', { positionId: assessment.positionId, txHash });
      return { status: 'sent', txHash, intent };
    } catch (err) {
      return { status: 'failed', error: describeError(err), intent };
    }
  }

  private async routeToEmergency(assessment: RiskAssessment): Promise<ExecutionOutcome> {
    const { logger } = this.deps;
    const positionId = assessment.positionId;

    // --- Guard: re-read the user's current on-chain approval ---
    const { allowanceBps, active } = await this.readExitAllowance(positionId);

    if (!active || allowanceBps === 0) {
      // The contract would revert NoActivePolicy. Skipping here keeps the
      // failure quiet and free rather than burning gas on a certain revert.
      logger.warn('Skipping exit: no active policy on-chain', { positionId, allowanceBps, active });
      return { status: 'skipped', reason: 'no active policy on-chain' };
    }

    // --- Guard: clamp to the approved ceiling ---
    const requestedBps = assessment.exitBps;
    const exitBps = Math.min(requestedBps, allowanceBps, BPS_DENOMINATOR);

    if (exitBps < requestedBps) {
      // Not an error — the user tightened their policy and that takes
      // precedence. Logged loudly because it's a meaningful divergence
      // between what the engine wanted and what the user permits.
      logger.warn('Clamping exit to the owner-approved allowance', {
        positionId,
        requestedBps,
        allowanceBps,
        actualBps: exitBps,
      });
    }

    if (exitBps === 0) {
      return { status: 'skipped', reason: 'clamped exit size is zero' };
    }

    const intent = `routeToEmergency(position=${positionId}, exitBps=${exitBps})`;

    if (this.deps.dryRun) {
      logger.warn('[DRY RUN] would route funds to the emergency vault', {
        intent,
        reason: assessment.summary,
        triggered: assessment.triggered.map((t) => t.detail),
      });
      return { status: 'dry-run', intent };
    }

    try {
      // Simulate first: turns a would-be revert into a readable error
      // instead of a failed on-chain transaction.
      const { request } = await this.deps.publicClient.simulateContract({
        address: this.deps.vaultAddress,
        abi: aegisVaultAbi,
        functionName: 'routeToEmergency',
        args: [positionId, exitBps],
        account: this.deps.account,

      });

      const txHash = await this.deps.walletClient.writeContract(request);

      logger.warn('Routed funds to the emergency vault', {
        positionId,
        exitBps,
        txHash,
        reason: assessment.summary,
      });

      return { status: 'sent', txHash, intent };
    } catch (err) {
      logger.error('Emergency route failed', { positionId, error: describeError(err) });
      return { status: 'failed', error: describeError(err), intent };
    }
  }
}

/**
 * Readable error text, preferring viem's decoded custom-error name.
 * `ExitBpsExceedsPolicy` is far more actionable than a raw revert blob.
 */
function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { shortMessage?: string; message?: string; metaMessages?: string[] };
    const parts = [e.shortMessage ?? e.message ?? String(err)];
    if (e.metaMessages?.length) parts.push(e.metaMessages.slice(0, 2).join(' '));
    return parts.join(' | ').slice(0, 400);
  }
  return String(err);
}
