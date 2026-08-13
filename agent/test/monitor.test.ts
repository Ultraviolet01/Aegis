import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';
import { Monitor } from '../src/monitor.js';
import type { Executor, ExecutionOutcome } from '../src/executor.js';
import type { Logger } from '../src/logger.js';

/**
 * Regression tests for exit de-duplication.
 *
 * These exist because of a live testnet run, not a hypothetical. The agent
 * correctly detected a 12% drawdown and routed 50% to the emergency vault —
 * then did it again on the very next pass, taking the position 200 -> 100 -> 50
 * while the price simply sat still. The risk engine was right every time; the
 * missing piece was that nothing recorded the event as already handled.
 *
 * "Exit 50% if drawdown > 8%" describes one action per event. A test suite
 * with mocked clients passed throughout, because the bug only appears when the
 * same true condition is evaluated twice.
 */

const OWNER = '0x296136A59463174f02898dE2C53b4a036eFC8c5e' as Address;
const ASSET = '0xa7218E99738F3d83f6c2B85b2b5f13f6E709a3DF' as Address;

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Mutable price the fake oracle reports, in whole dollars. */
let currentPrice = 100;

function fakePublicClient(): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case 'nextPositionId':
          return 2n;

        case 'positions':
          // [owner, asset, amount, pausedByAgent, exists]
          return [OWNER, ASSET, 200n * 10n ** 18n, false, true];

        case 'getPolicy':
          return {
            drawdownThresholdBps: 800, // 8%
            oracleDeviationThresholdBps: 200,
            exitPercentBps: 5000, // 50%
            mode: 0,
            active: true,
            updatedAt: 1n,
          };

        case 'getPrice':
          // Chainlink-style: 8 decimals alongside the value.
          return [BigInt(Math.round(currentPrice * 1e8)), 8];

        default:
          throw new Error(`unexpected read: ${functionName}`);
      }
    },
  } as unknown as PublicClient;
}

/** Records every execution the monitor asks for. */
function fakeExecutor(calls: string[]): Executor {
  return {
    execute: async (assessment: { action: string; positionId: bigint }) => {
      calls.push(assessment.action);
      return {
        status: 'sent',
        txHash: '0xtest',
        intent: `${assessment.action}(${assessment.positionId})`,
      } as ExecutionOutcome;
    },
  } as unknown as Executor;
}

function buildMonitor(calls: string[], exitCooldownSeconds = 900) {
  return new Monitor({
    publicClient: fakePublicClient(),
    vaultAddress: OWNER,
    policyRegistryAddress: OWNER,
    riskOracleAddress: OWNER,
    executor: fakeExecutor(calls),
    logger: silentLogger,
    historySize: 30,
    exitCooldownSeconds,
  });
}

describe('Monitor exit de-duplication', () => {
  beforeEach(() => {
    currentPrice = 100;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exits once for a single drawdown event, not once per pass', async () => {
    const calls: string[] = [];
    const monitor = buildMonitor(calls);

    // Establish the peak at $100.
    await monitor.runOnce();
    expect(calls).toEqual([]);

    // Drop 12% — past the 8% threshold.
    currentPrice = 88;
    await monitor.runOnce();
    expect(calls).toEqual(['exit']);

    // Price sits still. The condition is still true, but it is the SAME event.
    // This is the exact scenario that drained 200 -> 100 -> 50 on testnet.
    await monitor.runOnce();
    await monitor.runOnce();
    expect(calls).toEqual(['exit']);
  });

  it('re-arms once the drawdown recovers, so a genuinely new event still acts', async () => {
    const calls: string[] = [];
    const monitor = buildMonitor(calls);

    await monitor.runOnce();
    currentPrice = 88;
    await monitor.runOnce();
    expect(calls).toEqual(['exit']);

    // Recovery to the peak clears the event.
    currentPrice = 100;
    await monitor.runOnce();

    // A fresh decline is a new event and must be acted on, even though the
    // cooldown window has not elapsed — recovery is stronger evidence than time.
    currentPrice = 88;
    await monitor.runOnce();
    expect(calls).toEqual(['exit', 'exit']);
  });

  it('acts again when the decline genuinely deepens after the cooldown', async () => {
    const calls: string[] = [];
    const monitor = buildMonitor(calls);

    await monitor.runOnce();
    currentPrice = 88;
    await monitor.runOnce();
    expect(calls).toEqual(['exit']);

    // Cooldown elapses, but the price has not moved further: still one event.
    vi.advanceTimersByTime(901_000);
    await monitor.runOnce();
    expect(calls).toEqual(['exit']);

    // Now it falls another 11% below the price at the last exit. That is a
    // real escalation, and the user's policy does intend to act on it.
    currentPrice = 78;
    await monitor.runOnce();
    expect(calls).toEqual(['exit', 'exit']);
  });

  it('holds the line during the cooldown even as the price keeps sliding', async () => {
    const calls: string[] = [];
    const monitor = buildMonitor(calls);

    await monitor.runOnce();
    currentPrice = 88;
    await monitor.runOnce();
    expect(calls).toEqual(['exit']);

    // Deeper decline, but only seconds later. The cooldown is a floor on how
    // fast the agent can compound its own actions.
    currentPrice = 70;
    vi.advanceTimersByTime(30_000);
    await monitor.runOnce();
    expect(calls).toEqual(['exit']);
  });
});
