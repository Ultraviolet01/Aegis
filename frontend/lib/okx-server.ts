import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * OKX DEX REST client — SERVER ONLY.
 *
 * The `server-only` import above is load-bearing: if any client component ever
 * imports this file, the build fails instead of silently shipping the API
 * secret to every visitor's browser. That is the single worst mistake
 * available in this file, so it is made impossible rather than discouraged.
 *
 * The credentials sign API *requests*. They cannot sign transactions and
 * cannot move funds. Swap calldata returned here is unsigned — it only becomes
 * a transaction when the user's own wallet approves it.
 *
 * Implemented against the REST API directly rather than the Node SDK: the SDK
 * bundles wallet/signing machinery for Solana, Sui and EVM that a request
 * signer has no business carrying, and its `executeSwap` would sign with a
 * server-held key, which is exactly the custody model Aegis avoids.
 */

const OKX_BASE_URL = 'https://web3.okx.com';

/** X Layer mainnet. The DEX aggregator does not index testnet liquidity. */
export const XLAYER_CHAIN_INDEX = '196';
export const XLAYER_CHAIN_ID = 196;

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  projectId: string;
}

export class OkxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OkxConfigError';
  }
}

export class OkxApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'OkxApiError';
  }
}

/**
 * Read credentials from the environment.
 *
 * Both spellings of secret and passphrase are accepted because OKX's portal
 * and this repo's .env.example disagree on the labels, and a name mismatch
 * surfaces as "invalid signature" — an error that sends you looking at the
 * signing code instead of at the variable name.
 */
export function getOkxCredentials(): OkxCredentials {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY ?? process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE ?? process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  const missing = [
    !apiKey && 'OKX_API_KEY',
    !secretKey && 'OKX_SECRET_KEY (or OKX_API_SECRET)',
    !passphrase && 'OKX_API_PASSPHRASE (or OKX_PASSPHRASE)',
    !projectId && 'OKX_PROJECT_ID',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new OkxConfigError(`Missing OKX credentials: ${missing.join(', ')}`);
  }

  return {
    apiKey: apiKey!,
    secretKey: secretKey!,
    passphrase: passphrase!,
    projectId: projectId!,
  };
}

/** True when all four credentials are present, without throwing. */
export function okxConfigured(): boolean {
  try {
    getOkxCredentials();
    return true;
  } catch {
    return false;
  }
}

/**
 * OKX request signature: base64(HMAC-SHA256(timestamp + method + path, secret)).
 * The signed path must include the query string exactly as sent, or the
 * signature will not match.
 */
function sign(secretKey: string, timestamp: string, method: string, path: string): string {
  return createHmac('sha256', secretKey).update(`${timestamp}${method}${path}`).digest('base64');
}

async function okxGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const credentials = getOkxCredentials();

  const query = new URLSearchParams(params).toString();
  const requestPath = `${path}?${query}`;
  const timestamp = new Date().toISOString();
  const signature = sign(credentials.secretKey, timestamp, 'GET', requestPath);

  const response = await fetch(`${OKX_BASE_URL}${requestPath}`, {
    method: 'GET',
    headers: {
      'OK-ACCESS-KEY': credentials.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': credentials.passphrase,
      'OK-ACCESS-PROJECT': credentials.projectId,
      'Content-Type': 'application/json',
    },
    // Prices move; a cached quote is a wrong quote.
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new OkxApiError(`OKX API returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as { code?: string; msg?: string; data?: T[] };

  // OKX returns HTTP 200 with a non-zero `code` on failure, so checking
  // response.ok alone would treat an error as a successful empty result.
  if (body.code !== undefined && body.code !== '0') {
    throw new OkxApiError(body.msg || `OKX API error code ${body.code}`, body.code);
  }

  return body.data ?? [];
}

export interface OkxQuote {
  fromTokenAmount: string;
  toTokenAmount: string;
  priceImpactPercent?: string;
  fromToken?: { tokenSymbol?: string; decimal?: string };
  toToken?: { tokenSymbol?: string; decimal?: string };
}

/** Price/route preview. Read-only — returns no transaction data. */
export async function getQuote(args: {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
}): Promise<OkxQuote | undefined> {
  const data = await okxGet<OkxQuote>('/api/v5/dex/aggregator/quote', {
    chainIndex: XLAYER_CHAIN_INDEX,
    chainId: XLAYER_CHAIN_INDEX,
    fromTokenAddress: args.fromTokenAddress,
    toTokenAddress: args.toTokenAddress,
    amount: args.amount,
  });

  return data[0];
}

/**
 * The router address a user must approve before swapping.
 *
 * Fetched from OKX rather than hardcoded: the spender differs per chain and
 * can change. A stale hardcoded spender would produce an approval that the
 * swap cannot use, leaving the user with a pointless allowance and a failed
 * transaction they still paid gas for.
 */
export async function getApproveSpender(): Promise<string | undefined> {
  const data = await okxGet<{ dexTokenApproveAddress?: string }>(
    '/api/v5/dex/aggregator/supported/chain',
    { chainIndex: XLAYER_CHAIN_INDEX, chainId: XLAYER_CHAIN_INDEX },
  );

  return data[0]?.dexTokenApproveAddress;
}

export interface OkxSwapTx {
  to: string;
  data: string;
  value: string;
  gas?: string;
  gasPrice?: string;
  minReceiveAmount?: string;
}

export interface OkxSwapResponse {
  tx: OkxSwapTx;
  quote: OkxQuote;
}

/**
 * Build unsigned swap calldata for the user's wallet to sign.
 *
 * `userWalletAddress` is both the sender and the implicit recipient. There is
 * no separate receiver parameter by design — the output must land back in the
 * user's own wallet, never anywhere Aegis controls.
 */
export async function getSwapTransaction(args: {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  slippagePercent: string;
}): Promise<OkxSwapResponse | undefined> {
  const data = await okxGet<{
    tx?: OkxSwapTx;
    routerResult?: OkxQuote;
  }>('/api/v5/dex/aggregator/swap', {
    chainIndex: XLAYER_CHAIN_INDEX,
    chainId: XLAYER_CHAIN_INDEX,
    fromTokenAddress: args.fromTokenAddress,
    toTokenAddress: args.toTokenAddress,
    amount: args.amount,
    userWalletAddress: args.userWalletAddress,
    swapReceiverAddress: args.userWalletAddress,
    slippage: args.slippagePercent,
  });

  const first = data[0];
  if (!first?.tx || !first.routerResult) return undefined;

  return { tx: first.tx, quote: first.routerResult };
}
