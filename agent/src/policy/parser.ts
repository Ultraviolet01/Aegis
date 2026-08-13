import {
  parsedPolicySchema,
  LOW_CONFIDENCE_THRESHOLD,
  type ParsedPolicy,
  type PolicyParseResult,
} from './schema.js';
import { BPS_DENOMINATOR } from '../risk/engine.js';

/**
 * Plain-English policy -> structured parameters.
 *
 * This is the actual AI surface of Aegis. Two hard rules govern it:
 *
 *   1. Model output is untrusted. It is parsed as JSON and validated against
 *      a strict zod schema before anything downstream touches it. It never
 *      becomes calldata directly.
 *   2. The parse result is a PROPOSAL. It is shown to the user, and the user's
 *      own wallet writes it on-chain — PolicyRegistry.setPolicy is owner-only
 *      and the agent has no write access. A hallucinated policy therefore
 *      cannot take effect without the user reading it and signing it.
 *
 * A deterministic regex parser is used when no API key is configured, and as
 * a fallback if the model fails or returns something invalid. That keeps the
 * demo working offline and means an LLM outage degrades the product rather
 * than breaking it.
 */

export class PolicyParseError extends Error {
  /** Named `reason` rather than `cause` to avoid shadowing Error.cause. */
  readonly reason: unknown;

  constructor(message: string, reason?: unknown) {
    super(message);
    this.name = 'PolicyParseError';
    this.reason = reason;
  }
}

const SYSTEM_PROMPT = `You convert a DeFi user's plain-English risk policy into strict JSON.

Return ONLY a JSON object with exactly these keys:
  drawdownThresholdBps        integer 0-10000, basis points of drawdown that trigger action
  oracleDeviationThresholdBps integer 0-10000, basis points of oracle/reference deviation
  exitPercentBps              integer 1-10000, portion of the position to move to safety
  mode                        "Conservative" | "Balanced" | "Aggressive"
  interpretation              one sentence restating the policy in plain English
  confidence                  number 0-1

Rules:
- 1% = 100 bps. 8% = 800 bps. 50% = 5000 bps.
- If the user gives no drawdown trigger, use 0. Same for deviation. At least one must be non-zero.
- exitPercentBps must be at least 1. Never 0.
- If the user's intent is ambiguous, choose the MORE CONSERVATIVE reading (smaller exit,
  tighter threshold) and lower your confidence accordingly.
- Never invent a trigger the user did not describe.
- Output raw JSON only. No markdown fences, no commentary.`;

interface LlmOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs?: number;
}

/**
 * Deterministic fallback parser.
 *
 * Regex-based, intentionally conservative: it only recognizes patterns it is
 * confident about, and it reports a lower confidence than the LLM path so the
 * UI can prompt the user to check the numbers.
 */
export function parsePolicyDeterministic(input: string): PolicyParseResult {
  const text = input.toLowerCase();
  const warnings: string[] = [];

  const pctToBps = (raw: string): number => Math.round(parseFloat(raw) * 100);

  // "drawdown > 8%", "drops 8%", "falls by 8 percent", "8% drawdown"
  const drawdownMatch =
    text.match(/(?:drawdown|draw down|drops?|falls?|declines?|loses?)[^0-9%]{0,20}(\d+(?:\.\d+)?)\s*%/) ??
    text.match(/(\d+(?:\.\d+)?)\s*%[^0-9%]{0,20}(?:drawdown|draw down|drop|fall|decline|loss)/);

  // "oracle deviation > 2%", "price deviates 2%"
  const deviationMatch =
    text.match(/(?:deviat\w*|divergen\w*|off[- ]peg|depeg\w*)[^0-9%]{0,20}(\d+(?:\.\d+)?)\s*%/) ??
    text.match(/(\d+(?:\.\d+)?)\s*%[^0-9%]{0,20}(?:deviat\w*|divergen\w*|depeg\w*)/);

  // "exit 50%", "move half", "sell 25% to USDC"
  const exitMatch = text.match(
    /(?:exit|sell|move|convert|route|withdraw|swap)[^0-9%]{0,25}(\d+(?:\.\d+)?)\s*%/,
  );

  const drawdownThresholdBps = drawdownMatch?.[1] ? pctToBps(drawdownMatch[1]) : 0;
  const oracleDeviationThresholdBps = deviationMatch?.[1] ? pctToBps(deviationMatch[1]) : 0;

  let exitPercentBps: number;
  if (exitMatch?.[1]) {
    exitPercentBps = pctToBps(exitMatch[1]);
  } else if (/\bhalf\b/.test(text)) {
    exitPercentBps = 5_000;
  } else if (/\b(everything|all of it|full|entire)\b/.test(text)) {
    exitPercentBps = BPS_DENOMINATOR;
  } else {
    // No exit size stated. Default to the most conservative meaningful
    // action rather than assuming the user wanted a large exit.
    exitPercentBps = 2_500;
    warnings.push(
      'No exit size found in your policy - defaulted to 25%. Please confirm or edit this before signing.',
    );
  }

  if (drawdownThresholdBps === 0 && oracleDeviationThresholdBps === 0) {
    throw new PolicyParseError(
      'Could not find a drawdown or oracle-deviation trigger in that policy. ' +
        'Try wording it like: "if drawdown exceeds 8% in 24h, exit 50% to USDC".',
    );
  }

  let mode: ParsedPolicy['mode'] = 'Balanced';
  if (/\b(conservative|cautious|careful|safe|protect)\b/.test(text)) mode = 'Conservative';
  else if (/\b(aggressive|fast|immediately|asap|quick)\b/.test(text)) mode = 'Aggressive';

  const policy: ParsedPolicy = parsedPolicySchema.parse({
    drawdownThresholdBps,
    oracleDeviationThresholdBps,
    exitPercentBps,
    mode,
    interpretation: buildInterpretation(
      drawdownThresholdBps,
      oracleDeviationThresholdBps,
      exitPercentBps,
    ),
    // Deliberately below LOW_CONFIDENCE_THRESHOLD: pattern matching is not
    // comprehension, and the UI should say so.
    confidence: 0.6,
  });

  warnings.push(
    'Parsed with the offline pattern matcher (no LLM configured). Please check the numbers carefully.',
  );

  return { policy, source: 'deterministic', warnings };
}

function buildInterpretation(drawdownBps: number, deviationBps: number, exitBps: number): string {
  const triggers: string[] = [];
  if (drawdownBps > 0) triggers.push(`drawdown exceeds ${(drawdownBps / 100).toFixed(2)}%`);
  if (deviationBps > 0) triggers.push(`oracle deviation exceeds ${(deviationBps / 100).toFixed(2)}%`);
  return `If ${triggers.join(' or ')}, move ${(exitBps / 100).toFixed(2)}% of the position to the emergency vault.`;
}

/** Strips ```json fences some models add despite being told not to. */
function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

async function callLlm(userPolicy: string, opts: LlmOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);

  try {
    const response = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        // Deterministic-as-possible: this is a parsing task, not a creative one.
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPolicy },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new PolicyParseError(`LLM request failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new PolicyParseError('LLM returned an empty response');

    try {
      return JSON.parse(stripCodeFences(content));
    } catch (err) {
      throw new PolicyParseError('LLM did not return valid JSON', err);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse a plain-English policy, preferring the LLM and falling back to the
 * deterministic parser.
 *
 * The fallback is not silent: the returned `source` and `warnings` say which
 * path produced the result, so the UI can show the user what actually
 * happened rather than implying an AI parse that didn't occur.
 */
export async function parsePolicy(
  input: string,
  llm?: LlmOptions,
): Promise<PolicyParseResult> {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new PolicyParseError('Policy text is empty');
  }
  if (trimmed.length > 2_000) {
    throw new PolicyParseError('Policy text is too long (max 2000 characters)');
  }

  if (!llm) return parsePolicyDeterministic(trimmed);

  let raw: unknown;
  try {
    raw = await callLlm(trimmed, llm);
  } catch (err) {
    const fallback = parsePolicyDeterministic(trimmed);
    fallback.warnings.unshift(
      `LLM parse failed (${err instanceof Error ? err.message : 'unknown error'}); used the offline parser instead.`,
    );
    return fallback;
  }

  // Untrusted model output meets the strict schema here, before it can go
  // anywhere near a transaction.
  const validated = parsedPolicySchema.safeParse(raw);

  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    const fallback = parsePolicyDeterministic(trimmed);
    fallback.warnings.unshift(
      `LLM output failed validation (${issues}); used the offline parser instead.`,
    );
    return fallback;
  }

  const warnings: string[] = [];
  if (validated.data.confidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push(
      `The parser is only ${Math.round(validated.data.confidence * 100)}% confident it understood this. Please review the numbers before signing.`,
    );
  }
  if (validated.data.exitPercentBps === BPS_DENOMINATOR) {
    warnings.push('This policy allows exiting 100% of the position. Confirm that is intended.');
  }

  return { policy: validated.data, source: 'llm', warnings };
}
