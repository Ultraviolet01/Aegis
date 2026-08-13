/**
 * OKX DEX quote reachability probe.
 *
 * Answers one question with evidence: can this machine actually fetch a live
 * OKX DEX aggregator quote — the reference price the oracle-deviation check
 * depends on — or not?
 *
 * It hits the REAL quote endpoint with REAL signed credentials, the same
 * request the agent's OkxQuoteClient makes in production. It also runs the
 * agent's own client if the SDK is installed, so we test the actual code path
 * and not just a hand-rolled approximation of it.
 *
 * Run:  node scripts/okx-quote-probe.mjs
 */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Resolve everything from the repo root so the probe works from any cwd.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');


const HOST = 'web3.okx.com';
const QUOTE_PATH = '/api/v5/dex/aggregator/quote';

// X Layer mainnet. GLDX -> USDC, matching PROJECT_BRIEF.md section 4.
const CHAIN_INDEX = '196';
const GLDX = '0x2380f2673c640fb67e2d6b55b44c62f0e0e69da9';
const USDC = '0x74b7F16337b8972027F6196A17a631aC6dE26d22';
const AMOUNT = '1000000000000000000'; // 1 GLDX

/**
 * Load .env with the same precedence the agent uses: agent/.env first, then the
 * repo root, first-wins per key. Provenance is recorded so the output can name
 * *which file* and *which variable* supplied each credential — "credentials
 * present" is not a useful answer when two candidate files and two accepted
 * spellings of the secret are in play.
 */
function loadEnv() {
  const env = {};
  const from = {};
  for (const rel of ['agent/.env', '.env']) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (val && env[key] === undefined) {
        env[key] = val;
        from[key] = rel;
      }
    }
  }
  return { env, from };
}

const { env, from } = loadEnv();

// The secret has two accepted spellings: .env.example says OKX_API_SECRET, while
// the OKX portal labels it "Secret Key". Same for the passphrase. Resolve the
// same way agent/src/config.ts does, and remember which one actually won.
const secretVar = env.OKX_API_SECRET ? 'OKX_API_SECRET' : 'OKX_SECRET_KEY';
const passVar = env.OKX_API_PASSPHRASE ? 'OKX_API_PASSPHRASE' : 'OKX_PASSPHRASE';

const creds = {
  apiKey: env.OKX_API_KEY,
  secret: env[secretVar],
  passphrase: env[passVar],
  projectId: env.OKX_PROJECT_ID,
};

/** Identify a secret without disclosing it. */
const fingerprint = (v) =>
  v ? `sha256:${createHash('sha256').update(v).digest('hex').slice(0, 8)} (len ${v.length})` : '—';

const varNames = {
  apiKey: 'OKX_API_KEY',
  secret: secretVar,
  passphrase: passVar,
  projectId: 'OKX_PROJECT_ID',
};

const missing = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
console.log('=== credentials (provenance shown; values never printed) ===');
for (const [field, varName] of Object.entries(varNames)) {
  const src = from[varName] ?? 'NOT FOUND';
  console.log(
    `  ${field.padEnd(10)} <- ${varName.padEnd(19)} from ${src.padEnd(11)} ${fingerprint(creds[field])}`,
  );
}
console.log(missing.length ? `  MISSING: ${missing.join(', ')}` : '  all four resolved');

/** Raw TCP reachability, so we can tell "blocked" apart from "rejected". */
function tcpProbe(host, port = 443, timeout = 8000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = connect({ host, port });
    const done = (result) => {
      sock.destroy();
      resolve({ ...result, ms: Date.now() - started });
    };
    sock.setTimeout(timeout);
    sock.on('connect', () => done({ ok: true }));
    sock.on('timeout', () => done({ ok: false, reason: 'TCP timeout (silently dropped)' }));
    sock.on('error', (e) => done({ ok: false, reason: e.code || e.message }));
  });
}

function sign(ts, method, requestPath, body = '') {
  return createHmac('sha256', creds.secret)
    .update(ts + method + requestPath + body)
    .digest('base64');
}

async function realQuote() {
  const qs = new URLSearchParams({
    chainIndex: CHAIN_INDEX,
    chainId: CHAIN_INDEX,
    amount: AMOUNT,
    fromTokenAddress: GLDX,
    toTokenAddress: USDC,
  }).toString();
  const requestPath = `${QUOTE_PATH}?${qs}`;
  const ts = new Date().toISOString();

  const headers = {
    'OK-ACCESS-KEY': creds.apiKey,
    'OK-ACCESS-SIGN': sign(ts, 'GET', requestPath),
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': creds.passphrase,
    'OK-ACCESS-PROJECT': creds.projectId,
    'Content-Type': 'application/json',
  };

  const res = await fetch(`https://${HOST}${requestPath}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 400) };
}

const OKX_HOSTS = [HOST, 'www.okx.com'];
const reachable = {};
let quoteOk = false;

console.log('\n=== TCP reachability (is the host even routable?) ===');
for (const host of [...OKX_HOSTS, 'www.oklink.com', 'testrpc.xlayer.tech']) {
  const r = await tcpProbe(host);
  const label = host.endsWith('okx.com') ? '' : '   <- control';
  reachable[host] = r.ok;
  console.log(`${r.ok ? 'OPEN   ' : 'BLOCKED'} ${host}:443  ${r.ok ? `${r.ms}ms` : r.reason}${label}`);
}

console.log('\n=== live signed DEX quote (1 GLDX -> USDC, chainIndex 196) ===');
if (missing.length) {
  console.log('skipped - credentials incomplete');
} else {
  try {
    const { status, body } = await realQuote();
    console.log(`HTTP ${status}`);
    console.log(body);
    if (status === 200 && body.includes('"code":"0"')) {
      quoteOk = true;
      console.log('\nRESULT: quotes WORK from this machine.');
    } else {
      console.log('\nRESULT: reached OKX but the request was rejected (see code/msg above).');
    }
  } catch (e) {
    console.log(`network failure: ${e.cause?.code || e.name}: ${e.message}`);
    console.log('\nRESULT: could not reach OKX at all - transport blocked, not a credential problem.');
  }
}

console.log('\n=== agent\'s own OkxQuoteClient (real production code path) ===');
try {
  // The SDK lives in agent/node_modules, so import it by explicit path rather
  // than by bare specifier — this script sits in scripts/ and would not resolve it.
  const sdkPath = join(ROOT, 'agent', 'node_modules', '@okx-dex', 'okx-dex-sdk', 'dist', 'index.js');
  const { OKXDexClient } = await import(pathToFileURL(sdkPath).href);
  const client = new OKXDexClient({
    apiKey: creds.apiKey,
    secretKey: creds.secret,
    apiPassphrase: creds.passphrase,
    projectId: creds.projectId,
    // Mirror agent/src/okx/quote.ts exactly. Omitting these makes the SDK retry
    // forever on a blocked network — the probe hung for minutes before this was
    // added. The agent itself was always correct; this script was not.
    timeout: 15_000,
    maxRetries: 2,
  });
  const started = Date.now();
  const quote = await client.dex.getQuote({
    chainIndex: CHAIN_INDEX,
    fromTokenAddress: GLDX,
    toTokenAddress: USDC,
    amount: AMOUNT,
    slippagePercent: '0.005',
  });
  console.log(`SDK quote succeeded in ${Date.now() - started}ms:`, JSON.stringify(quote).slice(0, 300));
} catch (e) {
  if (e.code === 'ERR_MODULE_NOT_FOUND') {
    console.log('SDK not installed here - run `npm install` in agent/ to include this leg.');
  } else {
    // The failure mode itself is the finding: a transport error here means the
    // agent's real quote path dies on this network too, exactly as predicted.
    const cause = e.cause?.code ? ` (${e.cause.code})` : '';
    console.log(`SDK failed${cause}: ${e.message?.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Single unambiguous verdict. This script exists to be run on a candidate demo
// network and answer one yes/no question, so it ends with one line and an exit
// code rather than leaving the reader to interpret the output above.
// ---------------------------------------------------------------------------
const hostsOpen = OKX_HOSTS.every((h) => reachable[h]);
console.log('\n' + '='.repeat(64));
if (hostsOpen && quoteOk) {
  console.log('GO  - OKX reachable and a live quote came back. Demo-safe network.');
} else if (hostsOpen) {
  console.log('NO-GO - OKX hosts are reachable but no live quote returned.');
  console.log('        Network is fine; this is now a credential/scope issue.');
  console.log('        Read the HTTP status and code/msg printed above.');
} else {
  const blocked = OKX_HOSTS.filter((h) => !reachable[h]).join(', ');
  console.log(`NO-GO - OKX unreachable at the transport layer: ${blocked}`);
  console.log('        Do NOT demo the OKX DEX leg on this network.');
  console.log('        Retry on a mobile hotspot, a different ISP, or a VPS.');
}
console.log('='.repeat(64));
process.exit(hostsOpen && quoteOk ? 0 : 1);
