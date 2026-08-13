import { parsePolicy, PolicyParseError } from '../policy/parser.js';
import { modeToEnumIndex } from '../policy/schema.js';

/**
 * Policy parser CLI — the demo surface for the AI piece.
 *
 *   npm run parse -- "if drawdown exceeds 8% in 24h, exit 50% to USDC"
 *
 * Prints the structured parameters and the exact setPolicy() arguments the
 * user's wallet would sign. Nothing is sent: PolicyRegistry.setPolicy is
 * owner-only, so a policy can only ever be written by the position's owner.
 */
async function main() {
  const input = process.argv.slice(2).join(' ').trim();

  if (!input) {
    console.error('Usage: npm run parse -- "<your policy in plain English>"');
    console.error('Example: npm run parse -- "if drawdown exceeds 8% in 24h, exit 50% to USDC"');
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const llm = apiKey
    ? {
        apiKey,
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      }
    : undefined;

  if (!llm) {
    console.log('(no OPENAI_API_KEY set - using the offline pattern matcher)\n');
  }

  try {
    const { policy, source, warnings } = await parsePolicy(input, llm);

    console.log(`Input:  "${input}"`);
    console.log(`Parser: ${source}\n`);
    console.log('Parsed policy');
    console.log('-------------');
    console.log(`  drawdown trigger    ${(policy.drawdownThresholdBps / 100).toFixed(2)}%  (${policy.drawdownThresholdBps} bps)`);
    console.log(`  deviation trigger   ${(policy.oracleDeviationThresholdBps / 100).toFixed(2)}%  (${policy.oracleDeviationThresholdBps} bps)`);
    console.log(`  exit size           ${(policy.exitPercentBps / 100).toFixed(2)}%  (${policy.exitPercentBps} bps)`);
    console.log(`  mode                ${policy.mode} (enum ${modeToEnumIndex(policy.mode)})`);
    console.log(`  confidence          ${(policy.confidence * 100).toFixed(0)}%`);
    console.log(`\n  "${policy.interpretation}"`);

    if (warnings.length > 0) {
      console.log('\nWarnings');
      console.log('--------');
      for (const w of warnings) console.log(`  - ${w}`);
    }

    console.log('\nThe owner would sign:');
    console.log(
      `  setPolicy(<positionId>, ${policy.drawdownThresholdBps}, ` +
        `${policy.oracleDeviationThresholdBps}, ${policy.exitPercentBps}, ` +
        `${modeToEnumIndex(policy.mode)})`,
    );
    console.log(
      '\nNote: only the position owner can write this on-chain. The agent has no\n' +
        'write access to PolicyRegistry, so it cannot set or widen its own limits.',
    );
  } catch (err) {
    if (err instanceof PolicyParseError) {
      console.error(`\nCould not parse that policy:\n  ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
