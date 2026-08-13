import { describe, it, expect } from 'vitest';
import {
  assessRisk,
  computeDrawdownBps,
  computeDeviationBps,
  computeStatisticalSignal,
  BPS_DENOMINATOR,
  MIN_SAMPLES_FOR_ZSCORE,
  type PriceSample,
  type RiskPolicy,
} from '../src/risk/engine.js';

const basePolicy: RiskPolicy = {
  drawdownThresholdBps: 800, // 8%
  oracleDeviationThresholdBps: 200, // 2%
  exitPercentBps: 5_000, // 50%
  mode: 'Balanced',
  active: true,
};

/** Flat history long enough to satisfy the z-score minimum. */
function flatHistory(price: number, count = 12): PriceSample[] {
  return Array.from({ length: count }, (_, i) => ({ price, timestamp: 1_000 + i * 30 }));
}

describe('computeDrawdownBps', () => {
  it('measures drawdown from peak in bps', () => {
    expect(computeDrawdownBps(100, 92)).toBe(800); // 8%
    expect(computeDrawdownBps(100, 50)).toBe(5_000); // 50%
  });

  it('never reports negative drawdown when price is above its peak', () => {
    // A gain is not a small loss - it's zero drawdown. Returning a negative
    // number here would corrupt every downstream comparison.
    expect(computeDrawdownBps(100, 120)).toBe(0);
    expect(computeDrawdownBps(100, 100)).toBe(0);
  });

  it('handles a zero or negative peak without dividing by zero', () => {
    expect(computeDrawdownBps(0, 50)).toBe(0);
    expect(computeDrawdownBps(-5, 50)).toBe(0);
  });
});

describe('computeDeviationBps', () => {
  it('is symmetric - direction does not matter, only magnitude', () => {
    expect(computeDeviationBps(102, 100)).toBe(200);
    expect(computeDeviationBps(98, 100)).toBe(200);
  });

  it('returns 0 for a non-positive reference price rather than Infinity', () => {
    expect(computeDeviationBps(100, 0)).toBe(0);
  });
});

describe('computeStatisticalSignal', () => {
  it('reports insufficient data below the sample minimum', () => {
    const signal = computeStatisticalSignal(flatHistory(100, MIN_SAMPLES_FOR_ZSCORE - 1), 100);
    expect(signal.sufficientData).toBe(false);
    expect(signal.anomalous).toBe(false);
  });

  it('never divides by zero on a perfectly flat series', () => {
    // stdDev is 0 here; a naive z-score would be Infinity or NaN and would
    // then compare truthy against the anomaly threshold, firing constantly.
    const signal = computeStatisticalSignal(flatHistory(100), 100);
    expect(signal.stdDev).toBe(0);
    expect(Number.isFinite(signal.zScore)).toBe(true);
    expect(signal.zScore).toBe(0);
    expect(signal.anomalous).toBe(false);
  });

  it('flags a price far outside its recent distribution', () => {
    const history: PriceSample[] = [100, 101, 99, 100, 102, 98, 101, 100, 99, 101].map(
      (price, i) => ({ price, timestamp: 1_000 + i * 30 }),
    );

    const signal = computeStatisticalSignal(history, 130);
    expect(signal.sufficientData).toBe(true);
    expect(signal.anomalous).toBe(true);
    expect(signal.zScore).toBeGreaterThan(2);
  });

  it('uses the sample standard deviation (n-1), not the population one', () => {
    // For [2,4,4,4,5,5,7,9]: population sd = 2, sample sd is about 2.138.
    const history: PriceSample[] = [2, 4, 4, 4, 5, 5, 7, 9].map((price, i) => ({
      price,
      timestamp: i,
    }));
    const signal = computeStatisticalSignal(history, 5);
    expect(signal.mean).toBe(5);
    expect(signal.stdDev).toBeCloseTo(2.138, 2);
  });
});

describe('assessRisk - the statistical layer can never move funds on its own', () => {
  it('escalates an anomaly to pause at most, never to exit', () => {
    // Big upward spike: statistically anomalous, but no drawdown and no
    // deviation reference, so no user-approved threshold has been crossed.
    const history: PriceSample[] = [100, 100, 101, 99, 100, 100, 101, 100, 99, 100].map(
      (price, i) => ({ price, timestamp: i * 30 }),
    );

    const result = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 140,
      peakPrice: 140,
      history,
    });

    expect(result.statistical.anomalous).toBe(true);
    expect(result.action).not.toBe('exit');
    expect(result.exitBps).toBe(0);
  });

  it('does nothing at all when the owner has deactivated the policy', () => {
    const result = assessRisk({
      positionId: 1n,
      policy: { ...basePolicy, active: false },
      currentPrice: 50, // catastrophic drop
      peakPrice: 100,
      history: flatHistory(100),
    });

    expect(result.action).toBe('none');
    expect(result.exitBps).toBe(0);
    expect(result.score).toBe(0);
  });
});

describe('assessRisk - deterministic triggers', () => {
  it('exits when drawdown crosses the approved threshold', () => {
    const result = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 91, // 9% below peak, threshold is 8%
      peakPrice: 100,
      history: flatHistory(100),
    });

    expect(result.action).toBe('exit');
    expect(result.exitBps).toBe(basePolicy.exitPercentBps);
    expect(result.triggered.map((t) => t.rule)).toContain('drawdown');
  });

  it('treats the threshold as inclusive - exactly at the line fires', () => {
    const atThreshold = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 92, // exactly 8%
      peakPrice: 100,
      history: flatHistory(100),
    });
    expect(atThreshold.action).toBe('exit');

    const justUnder = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 92.5, // 7.5%
      peakPrice: 100,
      history: flatHistory(100),
    });
    expect(justUnder.action).not.toBe('exit');
    expect(justUnder.exitBps).toBe(0);
  });

  it('skips the deviation check entirely when no reference price exists', () => {
    // A missing reference must never be read as agreement between sources.
    const result = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 100,
      peakPrice: 100,
      referencePrice: undefined,
      history: flatHistory(100),
    });

    expect(result.triggered.map((t) => t.rule)).not.toContain('oracle_deviation');
    expect(result.action).not.toBe('exit');
  });

  it('exits on an oracle deviation breach', () => {
    const result = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 103,
      peakPrice: 103,
      referencePrice: 100, // 3% apart, threshold is 2%
      history: flatHistory(103),
    });

    expect(result.action).toBe('exit');
    expect(result.triggered.map((t) => t.rule)).toContain('oracle_deviation');
  });

  it('triggers oracle deviation on sudden quote jump between consecutive polls', () => {
    const history: PriceSample[] = [
      { price: 100, timestamp: 1000 },
      { price: 100, timestamp: 1030 },
    ];

    // Current poll quote jumps to 105 (+5% jump between polls, threshold is 2%)
    const result = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 105,
      peakPrice: 105,
      referencePrice: 100, // previous poll quote
      history,
    });

    expect(result.action).toBe('exit');
    expect(result.triggered.map((t) => t.rule)).toContain('oracle_deviation');
    expect(result.triggered.find((t) => t.rule === 'oracle_deviation')?.detail).toContain(
      'Quote jumped 5.00% between consecutive polls',
    );
  });

  it('never proposes an exit larger than the policy allows', () => {
    // Even a total collapse cannot widen the exit beyond the approved size.
    const result = assessRisk({
      positionId: 1n,
      policy: { ...basePolicy, exitPercentBps: 2_500 },
      currentPrice: 1,
      peakPrice: 100,
      history: flatHistory(100),
    });

    expect(result.action).toBe('exit');
    expect(result.exitBps).toBe(2_500);
  });

  it('clamps a malformed policy exit size to 100%', () => {
    const result = assessRisk({
      positionId: 1n,
      policy: { ...basePolicy, exitPercentBps: 50_000 },
      currentPrice: 50,
      peakPrice: 100,
      history: flatHistory(100),
    });

    expect(result.exitBps).toBe(BPS_DENOMINATOR);
  });

  it('ignores a zero threshold instead of treating it as always-breached', () => {
    // 0 means "the user did not set this trigger". Treating 0 as a threshold
    // would make every position instantly breach on any drawdown at all.
    const result = assessRisk({
      positionId: 1n,
      policy: { ...basePolicy, drawdownThresholdBps: 0 },
      currentPrice: 99,
      peakPrice: 100,
      history: flatHistory(100),
    });

    expect(result.triggered.map((t) => t.rule)).not.toContain('drawdown');
    expect(result.action).not.toBe('exit');
  });

  it('scales the score with breach severity', () => {
    const mild = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 92,
      peakPrice: 100,
      history: flatHistory(100),
    });

    const severe = assessRisk({
      positionId: 1n,
      policy: basePolicy,
      currentPrice: 70,
      peakPrice: 100,
      history: flatHistory(100),
    });

    expect(severe.score).toBeGreaterThan(mild.score);
    expect(severe.score).toBeLessThanOrEqual(100);
  });
});
