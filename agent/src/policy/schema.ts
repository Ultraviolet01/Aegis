import { z } from 'zod';
import { BPS_DENOMINATOR, POLICY_MODES } from '../risk/engine.js';

/**
 * The ONLY shape an LLM is allowed to produce.
 *
 * Everything the model returns is untrusted input. It is validated against
 * this schema before it can become a policy, and the policy is written
 * on-chain by the USER's own wallet (PolicyRegistry.setPolicy is owner-only,
 * the agent has no write access at all). So the model cannot set a policy
 * even if it produces something hostile — but validating hard here means a
 * bad parse fails loudly at the source instead of surfacing as a confusing
 * wallet prompt.
 */

/** bps must be a whole number in [0, 10000]. Rejects NaN, floats, negatives. */
const bpsSchema = z
  .number()
  .int('must be a whole number of basis points')
  .min(0, 'cannot be negative')
  .max(BPS_DENOMINATOR, 'cannot exceed 10000 bps (100%)');

export const parsedPolicySchema = z
  .object({
    drawdownThresholdBps: bpsSchema,
    oracleDeviationThresholdBps: bpsSchema,
    /**
     * Exit size. Must be > 0 — a policy that exits 0% is not a policy, it's a
     * no-op that would look protective while doing nothing.
     */
    exitPercentBps: bpsSchema.refine((v) => v > 0, {
      message: 'exitPercentBps must be greater than 0 - a 0% exit would silently do nothing',
    }),
    mode: z.enum(['Conservative', 'Balanced', 'Aggressive']),
    /** The model's own plain-English restatement, shown back to the user. */
    interpretation: z.string().min(1).max(500),
    /**
     * 0-1. The model's stated confidence. Low confidence does not block the
     * parse; it surfaces a warning so the UI can push the user to review the
     * numbers before signing.
     */
    confidence: z.number().min(0).max(1),
  })
  .strict() // reject unknown keys outright rather than silently ignoring them
  .refine((p) => p.drawdownThresholdBps > 0 || p.oracleDeviationThresholdBps > 0, {
    message:
      'At least one trigger (drawdown or oracle deviation) must be non-zero, ' +
      'otherwise the guardian can never fire.',
  });

export type ParsedPolicy = z.infer<typeof parsedPolicySchema>;

/** Confidence below this surfaces a "please review" warning in the UI. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** On-chain enum index for a mode name. Order must match PolicyRegistry.Mode. */
export function modeToEnumIndex(mode: ParsedPolicy['mode']): number {
  const index = POLICY_MODES.indexOf(mode);
  if (index < 0) {
    // Unreachable via the schema, but throwing beats silently sending 0
    // (Conservative) for an unrecognized mode.
    throw new Error(`Unknown policy mode: ${mode}`);
  }
  return index;
}

export interface PolicyParseResult {
  policy: ParsedPolicy;
  /** 'llm' or 'deterministic' — surfaced so the UI can be honest about it. */
  source: 'llm' | 'deterministic';
  warnings: string[];
}
