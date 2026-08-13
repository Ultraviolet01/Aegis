import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parsePolicy } from '@/lib/policy';

const DEFAULT_DRAWDOWN_BPS = 800; // 8%
const DEFAULT_DEVIATION_BPS = 200; // 2%
const DEFAULT_EXIT_BPS = 5000; // 50%

const parsedPolicySchema = z.object({
  drawdownThresholdBps: z.number().int().transform((val) => (val <= 0 ? DEFAULT_DRAWDOWN_BPS : val)),
  oracleDeviationThresholdBps: z.number().int().transform((val) => (val <= 0 ? DEFAULT_DEVIATION_BPS : val)),
  exitPercentBps: z.number().int().transform((val) => (val <= 0 ? DEFAULT_EXIT_BPS : val)),
  mode: z.enum(['Conservative', 'Balanced', 'Aggressive']),
  interpretation: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export async function POST(req: Request) {
  let policyText = '';
  try {
    const body = await req.json();
    policyText = body.policyText;
    if (!policyText || typeof policyText !== 'string') {
      return NextResponse.json({ error: 'policyText string is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      const model = 'claude-3-5-haiku-20241022';

      const tools = [
        {
          name: 'extract_policy_parameters',
          description: 'Extract structured risk policy parameters from plain English text. IMPORTANT: All threshold fields must be strictly positive non-zero integers (min 1 BPS).',
          input_schema: {
            type: 'object',
            properties: {
              drawdownThresholdBps: {
                type: 'integer',
                description: 'Basis points of drawdown that trigger action (1% = 100 bps, 8% = 800 bps). If unspecified in policy, default to 800 bps (8%). MUST BE > 0.'
              },
              oracleDeviationThresholdBps: {
                type: 'integer',
                description: 'Basis points of oracle/reference deviation (10 = 0.1%, 50 = 0.5%, 200 = 2%). If unspecified in policy, default to 200 bps (2%). MUST BE > 0.'
              },
              exitPercentBps: {
                type: 'integer',
                description: 'Portion of position to move to safety in basis points (1% = 100 bps, 50% = 5000 bps). If unspecified, default to 5000 bps (50%). MUST BE > 0.'
              },
              mode: {
                type: 'string',
                enum: ['Conservative', 'Balanced', 'Aggressive'],
                description: 'Execution mode specified or inferred.'
              },
              interpretation: {
                type: 'string',
                description: 'One sentence restating the parsed policy in plain English.'
              },
              confidence: {
                type: 'number',
                description: 'Confidence score from 0.0 to 1.0.'
              }
            },
            required: [
              'drawdownThresholdBps',
              'oracleDeviationThresholdBps',
              'exitPercentBps',
              'mode',
              'interpretation',
              'confidence'
            ]
          }
        }
      ];

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          tools,
          tool_choice: { type: 'tool', name: 'extract_policy_parameters' },
          messages: [
            {
              role: 'user',
              content: `Convert this plain-English risk policy into structured parameters: "${policyText}"`
            }
          ]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const toolUseBlock = data.content?.find((block: { type: string }) => block.type === 'tool_use');
        if (toolUseBlock && toolUseBlock.input) {
          const validated = parsedPolicySchema.safeParse(toolUseBlock.input);
          if (validated.success) {
            return NextResponse.json({
              policy: validated.data,
              source: 'llm',
              model,
              rawUsage: data.usage
            });
          }
        }
      }
    }
  } catch (err: unknown) {
    // Continue to graceful fallback
  }

  // Graceful Server-Side Fallback using deterministic parser
  const fallback = parsePolicy(policyText || 'If SPYX drops more than 8%, move 75% to USDC cautiously.');
  return NextResponse.json({
    policy: {
      drawdownThresholdBps: fallback.drawdownThresholdBps,
      oracleDeviationThresholdBps: fallback.oracleDeviationThresholdBps,
      exitPercentBps: fallback.exitPercentBps,
      mode: fallback.mode,
      interpretation: `Extracted ${fallback.drawdownThresholdBps / 100}% drawdown and ${fallback.exitPercentBps / 100}% exit threshold.`,
      confidence: 0.95
    },
    source: 'deterministic',
    model: 'regex-parser'
  });
}
