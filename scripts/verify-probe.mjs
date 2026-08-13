#!/usr/bin/env node
/**
 * Probe: can the EXISTING OKX DEX credentials authenticate a contract-verification
 * API, so verification is unblocked without waiting on a separate OKLink key?
 *
 * This script only READS. It sends no verification payload and cannot change
 * on-chain state. It prints response codes and messages so the failure mode is
 * explicit (auth error vs. network error vs. wrong scope) rather than guessed.
 *
 * Secrets are never printed — only their lengths and a 4-char prefix.
 *
 * Run:  node scripts/verify-probe.mjs
 */
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env reader — agent/.env first, then root .env (same precedence the agent uses). */
function loadEnv() {
  const out = {};
  for (const file of [resolve(ROOT, '.env'), resolve(ROOT, 'agent/.env')]) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const env = loadEnv();
const API_KEY = env.OKX_API_KEY ?? '';
const SECRET = env.OKX_SECRET_KEY ?? env.OKX_API_SECRET ?? '';
const PASSPHRASE = env.OKX_API_PASSPHRASE ?? '';
const PROJECT = env.OKX_PROJECT_ID ?? '';

const mask = (s) => (s ? `${s.slice(0, 4)}…(len ${s.length})` : '<empty>');

console.log('Credentials found in .env');
console.log('  OKX_API_KEY        ', mask(API_KEY));
console.log('  OKX_SECRET_KEY     ', mask(SECRET));
console.log('  OKX_API_PASSPHRASE ', mask(PASSPHRASE));
console.log('  OKX_PROJECT_ID     ', mask(PROJECT));
console.log('  OKLINK_API_KEY     ', mask(env.OKLINK_API_KEY ?? ''));
console.log();

if (!API_KEY || !SECRET || !PASSPHRASE) {
  console.error('Missing OKX credentials — nothing to probe.');
  process.exit(1);
}

/** OKX signature: base64(HMAC-SHA256(timestamp + METHOD + requestPath + body, secret)). */
function signedHeaders(method, requestPath, body = '') {
  const ts = new Date().toISOString();
  const sign = createHmac('sha256', SECRET).update(ts + method.toUpperCase() + requestPath + body).digest('base64');
  return {
    'OK-ACCESS-KEY': API_KEY,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': PASSPHRASE,
    ...(PROJECT ? { 'OK-ACCESS-PROJECT': PROJECT } : {}),
    'Content-Type': 'application/json',
  };
}

async function probe(label, { url, method = 'GET', headers = {}, body, timeoutMs = 20000 }) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  process.stdout.write(`── ${label}\n   ${method} ${url}\n`);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { /* non-JSON (HTML error page) */ }
    const ms = Date.now() - started;
    if (parsed) {
      console.log(`   HTTP ${res.status} in ${ms}ms  code=${parsed.code ?? '?'}  msg=${JSON.stringify(parsed.msg ?? parsed.message ?? '')}`);
      if (parsed.data) console.log(`   data: ${JSON.stringify(parsed.data).slice(0, 300)}`);
    } else {
      console.log(`   HTTP ${res.status} in ${ms}ms  (non-JSON, ${text.length} bytes) ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
    }
    return { ok: res.ok, status: res.status, parsed };
  } catch (err) {
    console.log(`   NETWORK FAILURE after ${Date.now() - started}ms: ${err.cause?.code ?? err.name}: ${err.message}`);
    return { ok: false, networkError: true };
  } finally {
    clearTimeout(timer);
    console.log();
  }
}

const results = {};

// 1) Reachability + auth on the OKX-hosted X Layer Data API (check-verify-result via POST).
results.okxWeb3 = await probe('OKX web3 host — X Layer check-verify-result endpoint (signed POST)', {
  url: 'https://web3.okx.com/api/v5/xlayer/contract/check-verify-result',
  method: 'POST',
  body: JSON.stringify({ chainShortName: 'XLAYER', guid: 'probe' }),
  headers: signedHeaders('POST', '/api/v5/xlayer/contract/check-verify-result', JSON.stringify({ chainShortName: 'XLAYER', guid: 'probe' })),
  timeoutMs: 15000,
});

// 2) Same credentials, OKLink host, OKLink's simple single-header scheme.
results.oklinkSimple = await probe('OKLink host — explorer summary, Ok-Access-Key = OKX_API_KEY', {
  url: 'https://www.oklink.com/api/v5/explorer/blockchain/summary?chainShortName=XLAYER',
  headers: { 'Ok-Access-Key': API_KEY, 'Content-Type': 'application/json' },
});

// 3) Same credentials, OKLink host, full OK-ACCESS-* signed scheme.
results.oklinkSigned = await probe('OKLink host — explorer summary, full OK-ACCESS-* signed scheme', {
  url: 'https://www.oklink.com/api/v5/explorer/blockchain/summary?chainShortName=XLAYER',
  headers: signedHeaders('GET', '/api/v5/explorer/blockchain/summary?chainShortName=XLAYER'),
});

// 4) Is the newer /xlayer/ route mirrored on the reachable OKLink host?
results.oklinkXlayerRoute = await probe('OKLink host — /api/v5/xlayer/ check-verify-result route (signed)', {
  url: 'https://www.oklink.com/api/v5/xlayer/contract/check-verify-result?chainShortName=XLAYER_TESTNET&guid=probe',
  headers: signedHeaders('GET', '/api/v5/xlayer/contract/check-verify-result?chainShortName=XLAYER_TESTNET&guid=probe'),
});

// 5) Does the chainShortName XLAYER_TESTNET exist? Answerable only once a key authenticates.
results.oklinkTestnet = await probe('OKLink host — chainShortName=XLAYER_TESTNET sanity check', {
  url: 'https://www.oklink.com/api/v5/explorer/blockchain/summary?chainShortName=XLAYER_TESTNET',
  headers: { 'Ok-Access-Key': API_KEY, 'Content-Type': 'application/json' },
});

console.log('══ Verdict ══');
const authed = Object.entries(results).filter(([, r]) => r.parsed && String(r.parsed.code) === '0');
if (authed.length) {
  console.log(`Existing OKX credentials ARE accepted by: ${authed.map(([k]) => k).join(', ')}`);
} else {
  console.log('No probe authenticated with the existing OKX credentials.');
  if (results.okxWeb3?.networkError) {
    console.log('NOTE: web3.okx.com failed at the NETWORK layer (not auth) — the host is unreachable');
    console.log('      from this machine, so that endpoint cannot be evaluated here at all.');
  }
  for (const [k, r] of Object.entries(results)) {
    if (r.parsed) console.log(`  ${k}: HTTP ${r.status} code=${r.parsed.code} msg=${JSON.stringify(r.parsed.msg ?? '')}`);
  }
}
