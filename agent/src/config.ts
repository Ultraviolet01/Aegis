import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { isAddress, type Address, type Hex } from 'viem';

/** Resolve a path relative to this file, tolerating Windows drive letters. */
function localPath(relative: string) {
  return new URL(relative, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
}

// Two env files, loaded most-specific first.
//
// - agent/.env  : agent-only secrets (OKX API creds, OpenAI key)
// - <root>/.env : shared with the Foundry deploy scripts (addresses, keys)
//
// dotenv does not overwrite a variable that is already set, so the agent-local
// file wins on any overlap. Loading only the root file would silently ignore
// anything placed in agent/.env, which is the more intuitive location for
// agent credentials — and a silently ignored API key looks identical to an
// invalid one, which is a miserable thing to debug.
loadEnv({ path: localPath('../.env') });
loadEnv({ path: localPath('../../.env') });

const addressSchema = z
  .string()
  .refine((v) => isAddress(v), { message: 'must be a 0x-prefixed 20-byte address' })
  .transform((v) => v as Address);

const privateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex private key')
  .transform((v) => v as Hex);

/**
 * X Layer network parameters. Chain IDs verified against the live RPCs:
 * testnet 1952, mainnet 196. The older 195 seen in some guides is stale.
 * Gas token is OKB on both networks.
 */
export const NETWORKS = {
  testnet: {
    chainId: 1952,
    name: 'X Layer Testnet',
    rpcUrl: 'https://testrpc.xlayer.tech/terigon',
    fallbackRpcUrl: 'https://xlayertestrpc.okx.com/terigon',
  },
  mainnet: {
    chainId: 196,
    name: 'X Layer',
    rpcUrl: 'https://rpc.xlayer.tech',
    fallbackRpcUrl: 'https://xlayerrpc.okx.com',
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;

const envSchema = z.object({
  AEGIS_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),

  /**
   * The agent's OWN key — deliberately a separate variable from
   * DEPLOYER_PRIVATE_KEY so the deployer/owner key is never even loaded into
   * this process. The owner can rotate the agent via setAgent(); reusing one
   * key for both roles would make that rotation meaningless.
   */
  AGENT_PRIVATE_KEY: privateKeySchema,

  AEGIS_VAULT_ADDRESS: addressSchema,
  POLICY_REGISTRY_ADDRESS: addressSchema,
  RISK_ORACLE_ADDRESS: addressSchema,

  /** Seconds between monitoring passes. */
  POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),

  /**
   * Price samples retained per asset for the volatility layer. 30 samples at
   * a 30s poll is ~15 minutes of history — enough for a z-score to mean
   * something without pretending to be a long-horizon model.
   */
  PRICE_HISTORY_SIZE: z.coerce.number().int().min(10).default(30),

  /**
   * Minimum seconds between two agent-initiated exits on the same position.
   *
   * A depressed price keeps satisfying "drawdown > X%" on every pass, so
   * without a floor here the agent re-exits each poll and compounds one user
   * instruction into many. 15 minutes is long enough that a single move
   * produces a single exit, short enough to still react within the same
   * trading session if the decline genuinely deepens.
   */
  EXIT_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(900),


  /**
   * When true the agent evaluates and logs but never sends a state-changing
   * transaction. Default true so a fresh checkout cannot move funds by
   * accident — acting is opt-in, not opt-out.
   */
  DRY_RUN: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** Optional: LLM policy parsing. Absent = deterministic parser only. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),

  /**
   * OKX DEX API credentials (Phase 2). All four are required together or the
   * integration stays off — three of four would fail at request time with an
   * opaque signature error instead of a clear config error.
   *
   * Used ONLY for read-only quotes, which serve as the independent reference
   * price for the oracle-deviation check. These credentials cannot move funds:
   * the API signs requests, not transactions.
   */
  OKX_API_KEY: z.string().min(1).optional(),
  /**
   * The SDK calls this `secretKey`. Accepting both spellings because the repo's
   * .env.example says OKX_API_SECRET while OKX's own portal labels it
   * "Secret Key" — a mismatch here reads as "credentials rejected", so it is
   * cheaper to accept both than to debug it later.
   */
  OKX_API_SECRET: z.string().min(1).optional(),
  OKX_SECRET_KEY: z.string().min(1).optional(),
  OKX_API_PASSPHRASE: z.string().min(1).optional(),
  /** Alias — the portal calls this simply "Passphrase". */
  OKX_PASSPHRASE: z.string().min(1).optional(),
  OKX_PROJECT_ID: z.string().min(1).optional(),

  /**
   * Quote denominator for the reference price. Defaults to real X Layer
   * mainnet USDC, verified from the project brief's confirmed token list.
   */
  OKX_QUOTE_TOKEN_ADDRESS: addressSchema.default(
    '0x74b7F16337b8972027F6196A17a631aC6dE26d22',
  ),
  OKX_QUOTE_TOKEN_DECIMALS: z.coerce.number().int().min(0).max(36).default(6),
});

export type AgentConfig = ReturnType<typeof loadConfig>;

let cached: z.infer<typeof envSchema> | undefined;

export function loadConfig() {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new Error(
        `Invalid agent configuration:\n${issues}\n\n` +
          'Copy .env.example to .env and fill in the missing values. ' +
          'Contract addresses come from the DeployTestnet script output.',
      );
    }
    cached = parsed.data;
  }

  const network = NETWORKS[cached.AEGIS_NETWORK];

  // Accept either spelling of the secret; the SDK field is `secretKey`.
  const okxSecret = cached.OKX_SECRET_KEY ?? cached.OKX_API_SECRET;
  const okxPassphrase = cached.OKX_API_PASSPHRASE ?? cached.OKX_PASSPHRASE;

  const okxCredentials =
    cached.OKX_API_KEY && okxSecret && okxPassphrase && cached.OKX_PROJECT_ID
      ? {
          apiKey: cached.OKX_API_KEY,
          secretKey: okxSecret,
          apiPassphrase: okxPassphrase,
          projectId: cached.OKX_PROJECT_ID,
        }
      : undefined;

  /**
   * The OKX DEX aggregator indexes mainnet liquidity only — the SDK ships a
   * network config for chainIndex 196 and none for 1952. Requesting testnet
   * quotes would return errors or, worse, prices for a different chain's
   * token at the same address. Gate on network, not just on credentials.
   */
  const okxQuotesAvailable = okxCredentials !== undefined && cached.AEGIS_NETWORK === 'mainnet';

  return {
    ...cached,
    network,
    pollIntervalMs: cached.POLL_INTERVAL_SECONDS * 1000,
    /** LLM parsing is only available when a key is configured. */
    llmEnabled: cached.OPENAI_API_KEY !== undefined,
    okxCredentials,
    okxQuotesAvailable,
  };
}

/** Test seam: clears the memoized env so tests can re-load with new values. */
export function resetConfigCache() {
  cached = undefined;
}
