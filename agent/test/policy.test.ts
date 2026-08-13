import { describe, it, expect } from 'vitest';
import { parsedPolicySchema, modeToEnumIndex } from '../src/policy/schema.js';
import { parsePolicy, parsePolicyDeterministic, PolicyParseError } from '../src/policy/parser.js';

/**
 * These tests exist because model output becomes on-chain parameters. Anything
 * the schema lets through is something a user could be asked to sign, so the
 * hostile cases matter more than the happy path.
 */

const validPolicy = {
  drawdownThresholdBps: 800,
  oracleDeviationThresholdBps: 200,
  exitPercentBps: 5_000,
  mode: 'Balanced' as const,
  interpretation: 'Exit half if drawdown exceeds 8%.',
  confidence: 0.9,
};

describe('parsedPolicySchema - rejecting bad model output', () => {
  it('accepts a well-formed policy', () => {
    expect(parsedPolicySchema.safeParse(validPolicy).success).toBe(true);
  });

  it('rejects bps above 100%', () => {
    const result = parsedPolicySchema.safeParse({ ...validPolicy, exitPercentBps: 10_001 });
    expect(result.success).toBe(false);
  });

  it('rejects negative bps', () => {
    const result = parsedPolicySchema.safeParse({ ...validPolicy, drawdownThresholdBps: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects fractional bps', () => {
    // Fractional bps would be silently truncated by the ABI encoder into a
    // different number than the user was shown.
    const result = parsedPolicySchema.safeParse({ ...validPolicy, exitPercentBps: 5_000.5 });
    expect(result.success).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    expect(parsedPolicySchema.safeParse({ ...validPolicy, exitPercentBps: NaN }).success).toBe(
      false,
    );
    expect(
      parsedPolicySchema.safeParse({ ...validPolicy, exitPercentBps: Infinity }).success,
    ).toBe(false);
  });

  it('rejects a 0% exit that would look protective while doing nothing', () => {
    const result = parsedPolicySchema.safeParse({ ...validPolicy, exitPercentBps: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a policy with no triggers at all', () => {
    // Both thresholds zero means the guardian could never fire - a policy
    // that silently protects nothing is worse than no policy.
    const result = parsedPolicySchema.safeParse({
      ...validPolicy,
      drawdownThresholdBps: 0,
      oracleDeviationThresholdBps: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown mode instead of coercing it', () => {
    const result = parsedPolicySchema.safeParse({ ...validPolicy, mode: 'YOLO' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys rather than ignoring them', () => {
    // .strict() matters: a model inventing `recipient` must fail loudly, not
    // have the field quietly dropped.
    const result = parsedPolicySchema.safeParse({
      ...validPolicy,
      recipient: '0x1234567890123456789012345678901234567890',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a string where a number is required', () => {
    const result = parsedPolicySchema.safeParse({ ...validPolicy, exitPercentBps: '5000' });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range confidence', () => {
    expect(parsedPolicySchema.safeParse({ ...validPolicy, confidence: 1.5 }).success).toBe(false);
    expect(parsedPolicySchema.safeParse({ ...validPolicy, confidence: -0.1 }).success).toBe(false);
  });
});

describe('modeToEnumIndex', () => {
  it('maps modes to the on-chain enum order', () => {
    // Must match PolicyRegistry.Mode exactly or the wrong mode gets stored.
    expect(modeToEnumIndex('Conservative')).toBe(0);
    expect(modeToEnumIndex('Balanced')).toBe(1);
    expect(modeToEnumIndex('Aggressive')).toBe(2);
  });
});

describe('parsePolicyDeterministic', () => {
  it('parses the canonical example from the brief', () => {
    const { policy } = parsePolicyDeterministic(
      'if drawdown > 8% in 24h or oracle deviation > 2%, exit 50% to USDC',
    );

    expect(policy.drawdownThresholdBps).toBe(800);
    expect(policy.oracleDeviationThresholdBps).toBe(200);
    expect(policy.exitPercentBps).toBe(5_000);
  });

  it('handles decimal percentages', () => {
    const { policy } = parsePolicyDeterministic('if drawdown exceeds 7.5%, exit 25%');
    expect(policy.drawdownThresholdBps).toBe(750);
    expect(policy.exitPercentBps).toBe(2_500);
  });

  it('understands "half"', () => {
    const { policy } = parsePolicyDeterministic('if it drops 10%, move half to safety');
    expect(policy.exitPercentBps).toBe(5_000);
  });

  it('warns instead of guessing when no exit size is given', () => {
    const { policy, warnings } = parsePolicyDeterministic('if drawdown exceeds 8%, protect me');
    expect(policy.exitPercentBps).toBe(2_500); // conservative default
    expect(warnings.some((w) => w.toLowerCase().includes('exit size'))).toBe(true);
  });

  it('throws rather than inventing a trigger it did not find', () => {
    // The dangerous failure is a confident wrong parse. An error the user can
    // see is strictly better than a silently fabricated threshold.
    expect(() => parsePolicyDeterministic('please keep my money safe')).toThrow(PolicyParseError);
  });

  it('reports low confidence and says it used the offline parser', () => {
    const { policy, source, warnings } = parsePolicyDeterministic(
      'if drawdown exceeds 8%, exit 50%',
    );
    expect(source).toBe('deterministic');
    expect(policy.confidence).toBeLessThan(0.7);
    expect(warnings.some((w) => w.includes('offline pattern matcher'))).toBe(true);
  });

  it('detects conservative and aggressive wording', () => {
    expect(
      parsePolicyDeterministic('be conservative: if drawdown exceeds 5%, exit 30%').policy.mode,
    ).toBe('Conservative');
    expect(
      parsePolicyDeterministic('aggressive: if drawdown exceeds 5%, exit 30%').policy.mode,
    ).toBe('Aggressive');
  });
});

describe('parsePolicy - input guards', () => {
  it('rejects empty input', async () => {
    await expect(parsePolicy('   ')).rejects.toThrow(PolicyParseError);
  });

  it('rejects overlong input', async () => {
    // A guard against prompt-stuffing and runaway token spend.
    await expect(parsePolicy('a'.repeat(2_001))).rejects.toThrow(PolicyParseError);
  });

  it('falls back to the offline parser when no LLM is configured', async () => {
    const result = await parsePolicy('if drawdown exceeds 8%, exit 50%');
    expect(result.source).toBe('deterministic');
  });
});
