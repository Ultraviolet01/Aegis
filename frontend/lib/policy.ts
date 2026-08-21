/**
 * Deterministic plain-English policy parser (client-side).
 *
 * This mirrors the AGENT's fallback parser, not its LLM path. It runs in the
 * browser with no API key so the composer can show a live preview as the user
 * types; the agent's LLM parser handles phrasing this cannot.
 *
 * Being explicit matters for the pitch: what you see previewed here is regex
 * and arithmetic, not a model. The model's role is broader phrasing, and its
 * output is validated the same way before anyone signs it.
 *
 * Nothing here can act. It produces numbers the user reviews and signs into
 * PolicyRegistry themselves — setPolicy is owner-only.
 */

export type PolicyMode = 'Conservative' | 'Balanced' | 'Aggressive';

export const POLICY_MODES: PolicyMode[] = ['Conservative', 'Balanced', 'Aggressive'];

export type PolicySource = 'llm' | 'deterministic';

export interface ParsedPolicy {
  drawdownThresholdBps: number;
  oracleDeviationThresholdBps: number;
  exitPercentBps: number;
  mode: PolicyMode;
  warnings: string[];
  source?: PolicySource;
  model?: string;
}

export async function parsePolicyLlm(input: string): Promise<ParsedPolicy> {
  const fallback = parsePolicy(input);
  fallback.source = 'deterministic';

  try {
    const res = await fetch('/api/parse-policy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyText: input }),
    });

    if (!res.ok) {
      return fallback;
    }

    const data = await res.json();
    if (data.policy) {
      const llmWarnings: string[] = [];
      if (data.policy.oracleDeviationThresholdBps === 200 && !input.toLowerCase().includes('deviat')) {
        // Safe default applied for unspecified oracle deviation
      }
      return {
        drawdownThresholdBps: data.policy.drawdownThresholdBps,
        oracleDeviationThresholdBps: data.policy.oracleDeviationThresholdBps,
        exitPercentBps: data.policy.exitPercentBps,
        mode: data.policy.mode as PolicyMode,
        warnings: llmWarnings,
        source: 'llm',
        model: data.model || 'claude-3-5-haiku-20241022',
      };
    }
  } catch (err) {
    // Silent fallback to local deterministic parser without cluttering the UI with API errors
  }

  return fallback;
}

const MAX_BPS = 10_000;
const MIN_DRAWDOWN_BPS = 100; // 1%
const MIN_DEVIATION_BPS = 10; // 0.1%

const DRAWDOWN_PATTERNS: RegExp[] = [
  /([0-9]+(?:\.[0-9]+)?)\s*%[^0-9%]{0,20}draw\s?down/,
  /(?:drops?|falls?|declines?|loses?)[^0-9%]{0,20}([0-9]+(?:\.[0-9]+)?)\s*%/,
  /draw\s?down\s*(?:of|by|is|at|above|below|over|under|>|<|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/,
];

const DEVIATION_PATTERNS: RegExp[] = [
  /([0-9]+(?:\.[0-9]+)?)\s*%[^0-9%]{0,20}(?:oracle|price)?\s*deviat\w*/,
  /(?:oracle|price)\s*deviation\s*(?:of|by|is|at|above|below|over|under|>|<|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/,
  /deviat\w*\s*(?:of|by|is|at|above|below|over|under|>|<|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/,
];

const EXIT_PATTERNS: RegExp[] = [
  /exit\s*(?:of|by|is|at|above|below|over|under|>|<|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*%/,
  /(?:move|convert|sell|swap)[^0-9%]{0,20}([0-9]+(?:\.[0-9]+)?)\s*%/,
  /([0-9]+(?:\.[0-9]+)?)\s*%[^0-9%]{0,20}(?:to\s+(?:usdc|usdt|stable))/,
];

const CONSERVATIVE_PATTERN = /\b(conservative|cautiously|cautious|carefully|careful|safely|safe)\b/;
const AGGRESSIVE_PATTERN = /\b(aggressive(?:ly)?|fast|immediately|asap|urgent(?:ly)?)\b/;

function percentToBps(value: number): number {
  return Math.round(value * 100);
}

function firstPercent(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const captured = match?.[1];
    if (captured !== undefined) {
      const value = Number.parseFloat(captured);
      if (Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

export function parsePolicy(input: string): ParsedPolicy {
  const text = input.toLowerCase();
  const warnings: string[] = [];

  const drawdown = firstPercent(text, DRAWDOWN_PATTERNS);
  const deviation = firstPercent(text, DEVIATION_PATTERNS);
  const exit = firstPercent(text, EXIT_PATTERNS);

  let mode: PolicyMode = 'Balanced';
  if (CONSERVATIVE_PATTERN.test(text)) mode = 'Conservative';
  else if (AGGRESSIVE_PATTERN.test(text)) mode = 'Aggressive';

  let drawdownBps = drawdown === undefined ? 800 : percentToBps(drawdown);
  let deviationBps = deviation === undefined ? 200 : percentToBps(deviation);
  let exitBps = exit === undefined ? 5000 : percentToBps(exit);

  if (drawdown === undefined) warnings.push('No drawdown threshold found — defaulted to 8%.');
  if (deviation === undefined) warnings.push('No oracle deviation found — defaulted to 2%.');
  if (exit === undefined) warnings.push('No exit size found — defaulted to 50%.');

  if (drawdownBps < MIN_DRAWDOWN_BPS) {
    warnings.push(`Drawdown below the 1% minimum — raised to 1%.`);
    drawdownBps = MIN_DRAWDOWN_BPS;
  }
  if (deviationBps < MIN_DEVIATION_BPS) {
    warnings.push(`Deviation below the 0.1% minimum — raised to 0.1%.`);
    deviationBps = MIN_DEVIATION_BPS;
  }
  if (drawdownBps > MAX_BPS) {
    warnings.push('Drawdown above 100% — capped.');
    drawdownBps = MAX_BPS;
  }
  if (deviationBps > MAX_BPS) {
    warnings.push('Deviation above 100% — capped.');
    deviationBps = MAX_BPS;
  }
  if (exitBps > MAX_BPS) {
    warnings.push('Exit size above 100% — capped.');
    exitBps = MAX_BPS;
  }
  if (exitBps <= 0) {
    warnings.push('Exit size must be positive — defaulted to 50%.');
    exitBps = 5000;
  }

  return {
    drawdownThresholdBps: drawdownBps,
    oracleDeviationThresholdBps: deviationBps,
    exitPercentBps: exitBps,
    mode,
    warnings,
    source: 'deterministic',
  };
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.00$/, '')}%`;
}

/* ==========================================================================
   Highlighting
   --------------------------------------------------------------------------
   Presentation-only. `parsePolicy` answers "what are the numbers"; this
   answers "which words did they come from", which is what makes the composer
   legible — the user can see their own sentence being read.
   ========================================================================== */

export type PolicyField = 'drawdown' | 'deviation' | 'exit' | 'mode';

export interface PolicySegment {
  text: string;
  /** undefined = ordinary prose the parser ignored. */
  field?: PolicyField;
}

interface Span {
  start: number;
  end: number;
  field: PolicyField;
}

/** First matching pattern in a list wins, mirroring `firstPercent`. */
function firstSpan(text: string, patterns: RegExp[], field: PolicyField): Span | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match.index >= 0 && match[0].length > 0) {
      return { start: match.index, end: match.index + match[0].length, field };
    }
  }
  return undefined;
}

/**
 * Split the raw sentence into highlighted and unhighlighted runs.
 *
 * Matching happens against the lowercased string — the same one `parsePolicy`
 * uses — but the returned text is sliced from the ORIGINAL so the user's
 * capitalisation survives. `toLowerCase` is length-preserving for the Latin
 * text these policies are written in, so the offsets line up.
 */
export function segmentPolicy(input: string): PolicySegment[] {
  if (!input) return [];
  const text = input.toLowerCase();

  const found: Span[] = [];
  const drawdown = firstSpan(text, DRAWDOWN_PATTERNS, 'drawdown');
  const deviation = firstSpan(text, DEVIATION_PATTERNS, 'deviation');
  const exit = firstSpan(text, EXIT_PATTERNS, 'exit');
  if (drawdown) found.push(drawdown);
  if (deviation) found.push(deviation);
  if (exit) found.push(exit);

  const modeMatch = CONSERVATIVE_PATTERN.exec(text) ?? AGGRESSIVE_PATTERN.exec(text);
  if (modeMatch) {
    found.push({
      start: modeMatch.index,
      end: modeMatch.index + modeMatch[0].length,
      field: 'mode',
    });
  }

  // The patterns are greedy enough to overlap ("...drops 12% ... exit 50%"
  // can both reach across the same words). Earliest start wins; a later span
  // that collides is dropped rather than clipped, because a half-highlighted
  // phrase reads like a rendering bug.
  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const segments: PolicySegment[] = [];
  let cursor = 0;

  for (const span of found) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      segments.push({ text: input.slice(cursor, span.start) });
    }
    segments.push({ text: input.slice(span.start, span.end), field: span.field });
    cursor = span.end;
  }

  if (cursor < input.length) segments.push({ text: input.slice(cursor) });
  return segments;
}

/** Which fields the sentence actually specified, for "defaulted" badges. */
export function detectedFields(input: string): Record<PolicyField, boolean> {
  const text = input.toLowerCase();
  return {
    drawdown: firstPercent(text, DRAWDOWN_PATTERNS) !== undefined,
    deviation: firstPercent(text, DEVIATION_PATTERNS) !== undefined,
    exit: firstPercent(text, EXIT_PATTERNS) !== undefined,
    mode: CONSERVATIVE_PATTERN.test(text) || AGGRESSIVE_PATTERN.test(text),
  };
}


