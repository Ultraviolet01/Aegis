#!/usr/bin/env node
/**
 * X Layer contract verification — preflight, submit, poll.
 *
 * Three subcommands:
 *
 *   node scripts/verify-xlayer.mjs preflight
 *       Compares the locally compiled runtime bytecode against what is actually
 *       deployed on chain, for every contract in the deployment table. Needs no
 *       API key — only the public RPC. If this passes, the compiler settings
 *       below are provably the ones that produced the deployed code, so a
 *       verification submission cannot fail for a settings mismatch.
 *
 *   node scripts/verify-xlayer.mjs submit [contract]
 *       POSTs standard-json-input to the verification API and prints the guid.
 *
 *   node scripts/verify-xlayer.mjs poll <guid> [contract]
 *       Polls a previously returned guid for status.
 *
 * Auth: OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-PASSPHRASE / OK-ACCESS-TIMESTAMP.
 * The key is taken from OKLINK_API_KEY, falling back to OKX_API_KEY. If a secret
 * and passphrase are present the full signed scheme is used; if only a bare key
 * is present (OKLink's own scheme) it is sent as the single Ok-Access-Key header.
 *
 * Endpoint host is overridable so this works against whichever host is
 * reachable and whichever one ends up holding the credential:
 *   VERIFY_HOST=https://www.oklink.com   (default; reachable from here)
 *   VERIFY_HOST=https://web3.okx.com     (X Layer Data API; blocked from here)
 */
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  return { ...out, ...process.env };
}
const env = loadEnv();

// ---------------------------------------------------------------------------
// Compiler settings — READ FROM THE BUILD ARTIFACTS, not from documentation.
//
// The source pragma is a floating `^0.8.24`, so the version that actually ran
// is whatever solc Foundry resolved (0.8.33), NOT 0.8.24. DEPLOYMENTS.md said
// 0.8.24; submitting that would fail verification with a confusing bytecode
// mismatch. `preflight` below proves which is right against on-chain code.
// ---------------------------------------------------------------------------
const RPC_URL = env.XLAYER_RPC_URL ?? 'https://testrpc.xlayer.tech/terigon';
const CHAIN_SHORT_NAME = env.CHAIN_SHORT_NAME ?? 'XLAYER_TESTNET'; // mainnet: XLAYER
const VERIFY_HOST = (env.VERIFY_HOST ?? 'https://www.oklink.com').replace(/\/$/, '');

/** Deployed contracts, from broadcast/DeployTestnet.s.sol/1952/run-*.json. */
const DEPLOYMENTS = {
  AegisVault:     { address: '0xc96d34534270B3ff41b5b4e30731c980FdfEd8DB', path: 'src/AegisVault.sol' },
  EmergencyVault: { address: '0xA33e3050b185B9289C1732d71C53B0c36A25Fe61', path: 'src/EmergencyVault.sol' },
  PolicyRegistry: { address: '0x90346e8ebB6fb000c97BbcdE93D7C5C192396Fd2', path: 'src/PolicyRegistry.sol' },
  RiskOracle:     { address: '0xEB0538B1c199eC063B7E6e785572ed4402D94074', path: 'src/RiskOracle.sol' },
};

const artifactOf = (name) =>
  JSON.parse(readFileSync(resolve(ROOT, `out/${name}.sol/${name}.json`), 'utf8'));

/** Full solc version string, e.g. "v0.8.33+commit.64118f21" — read from metadata. */
function compilerVersion(name) {
  return `v${artifactOf(name).metadata.compiler.version}`;
}

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

/**
 * Blank out the byte ranges solc reserved for immutables.
 *
 * Immutables are baked into the runtime code at construction time, so on-chain
 * bytecode legitimately differs from the compiled artifact at exactly those
 * offsets. Comparing without masking them would report a false mismatch on any
 * contract with an `immutable` field — which all of these have.
 */
function maskImmutables(hexNo0x, immutableReferences) {
  const bytes = Buffer.from(hexNo0x, 'hex');
  for (const refs of Object.values(immutableReferences ?? {})) {
    for (const { start, length } of refs) bytes.fill(0, start, start + length);
  }
  return bytes.toString('hex');
}

async function preflight() {
  console.log(`RPC:   ${RPC_URL}`);
  console.log(`Chain: ${await rpc('eth_chainId', []).then((c) => parseInt(c, 16))}\n`);
  let allMatch = true;

  for (const [name, { address }] of Object.entries(DEPLOYMENTS)) {
    const artifact = artifactOf(name);
    const local = artifact.deployedBytecode.object.replace(/^0x/, '');
    const onchainRaw = (await rpc('eth_getCode', [address, 'latest'])).replace(/^0x/, '');

    const immRefs = artifact.deployedBytecode.immutableReferences;
    const localMasked = maskImmutables(local, immRefs);
    const chainMasked = maskImmutables(onchainRaw, immRefs);

    const exact = localMasked === chainMasked;
    // The trailing CBOR metadata blob encodes the IPFS hash of the source
    // metadata; strip the last 53 bytes to see whether only *that* differs,
    // which would mean the code is identical but the source text is not.
    const trim = (s) => s.slice(0, Math.max(0, s.length - 106));
    const codeOnly = trim(localMasked) === trim(chainMasked);

    const status = exact ? 'EXACT MATCH' : codeOnly ? 'code matches, metadata differs' : 'MISMATCH';
    if (!exact) allMatch = false;
    console.log(`${name.padEnd(15)} ${address}`);
    console.log(`  compiler ${compilerVersion(name)}  optimizer=${artifact.metadata.settings.optimizer.enabled} runs=${artifact.metadata.settings.optimizer.runs}  evm=${artifact.metadata.settings.evmVersion}`);
    console.log(`  on-chain ${onchainRaw.length / 2} bytes / local ${local.length / 2} bytes  ->  ${status}`);
    console.log(`  immutable slots masked: ${Object.values(immRefs ?? {}).flat().length}\n`);
  }

  console.log(allMatch
    ? 'All deployed contracts match the local build exactly.\nThese compiler settings are confirmed correct for verification.'
    : 'At least one contract did not match — do NOT submit until resolved.');
  return allMatch;
}

// --- Verification API ------------------------------------------------------

function authHeaders(method, requestPath, body = '') {
  const key = env.OKLINK_API_KEY || env.OKX_API_KEY || '';
  const secret = env.OKLINK_API_SECRET || env.OKX_SECRET_KEY || env.OKX_API_SECRET || '';
  const passphrase = env.OKLINK_API_PASSPHRASE || env.OKX_API_PASSPHRASE || '';
  if (!key) throw new Error('No API key. Set OKLINK_API_KEY in .env (see DEPLOY_TESTNET.md).');

  const headers = { 'Ok-Access-Key': key, 'Content-Type': 'application/json' };
  if (secret && passphrase) {
    const ts = new Date().toISOString();
    headers['OK-ACCESS-KEY'] = key;
    headers['OK-ACCESS-SIGN'] = createHmac('sha256', secret)
      .update(ts + method.toUpperCase() + requestPath + body).digest('base64');
    headers['OK-ACCESS-TIMESTAMP'] = ts;
    headers['OK-ACCESS-PASSPHRASE'] = passphrase;
    if (env.OKX_PROJECT_ID) headers['OK-ACCESS-PROJECT'] = env.OKX_PROJECT_ID;
  }
  return headers;
}

async function submit(name) {
  const target = DEPLOYMENTS[name];
  if (!target) throw new Error(`Unknown contract "${name}". One of: ${Object.keys(DEPLOYMENTS).join(', ')}`);

  const standardInputPath = resolve(ROOT, `verify/${name}.standard-input.json`);
  if (!existsSync(standardInputPath)) {
    throw new Error(`Missing ${standardInputPath}. Regenerate with:\n  forge verify-contract --show-standard-json-input 0x0 ${target.path}:${name} > verify/${name}.standard-input.json`);
  }

  const requestPath = '/api/v5/xlayer/contract/verify-source-code';
  const payload = JSON.stringify({
    chainShortName: CHAIN_SHORT_NAME,
    contractAddress: target.address,
    contractName: `${target.path}:${name}`,
    sourceCode: readFileSync(standardInputPath, 'utf8'),
    codeFormat: 'solidity-standard-json-input',
    compilerVersion: compilerVersion(name),
    // Read from the artifact, never assumed: this build has the optimizer OFF.
    optimization: artifactOf(name).metadata.settings.optimizer.enabled ? '1' : '0',
    optimizationRuns: String(artifactOf(name).metadata.settings.optimizer.runs),
  });

  console.log(`POST ${VERIFY_HOST}${requestPath}`);
  console.log(`  ${name} @ ${target.address} on ${CHAIN_SHORT_NAME}, ${compilerVersion(name)}, payload ${payload.length} bytes`);

  const res = await fetch(`${VERIFY_HOST}${requestPath}`, {
    method: 'POST',
    headers: authHeaders('POST', requestPath, payload),
    body: payload,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { /* HTML error page */ }
  if (!json) {
    console.log(`  HTTP ${res.status} (non-JSON, ${text.length} bytes) — endpoint likely not present on this host.`);
    return;
  }
  console.log(`  HTTP ${res.status} code=${json.code} msg=${JSON.stringify(json.msg ?? '')}`);
  const guid = json.data?.[0]?.guid ?? json.data?.guid;
  if (guid) {
    mkdirSync(resolve(ROOT, 'verify'), { recursive: true });
    writeFileSync(resolve(ROOT, `verify/${name}.guid.txt`), guid);
    console.log(`  guid: ${guid}  (saved)\n  Poll: node scripts/verify-xlayer.mjs poll ${guid} ${name}`);
  } else {
    console.log(`  raw: ${JSON.stringify(json).slice(0, 400)}`);
  }
}

async function poll(guid) {
  const requestPath = '/api/v5/xlayer/contract/check-verify-result';
  const payload = JSON.stringify({ chainShortName: CHAIN_SHORT_NAME, guid });
  for (let attempt = 1; attempt <= 10; attempt++) {
    const res = await fetch(`${VERIFY_HOST}${requestPath}`, {
      method: 'POST',
      headers: authHeaders('POST', requestPath, payload),
      body: payload,
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { /* HTML */ }
    if (!json) { console.log(`attempt ${attempt}: HTTP ${res.status} non-JSON`); return; }
    const status = Array.isArray(json.data) ? json.data[0] : (json.data?.status ?? json.data ?? '?');
    console.log(`attempt ${attempt}: HTTP ${res.status} code=${json.code} status=${status} msg=${JSON.stringify(json.msg ?? '')}`);
    if (['SUCCESS', 'FAIL', 'FAILURE', 'PASS'].includes(String(status).toUpperCase())) return;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'preflight') process.exit((await preflight()) ? 0 : 1);
  else if (cmd === 'submit') {
    const names = rest.length ? rest : Object.keys(DEPLOYMENTS);
    for (const n of names) await submit(n);
  } else if (cmd === 'poll') {
    if (!rest[0]) throw new Error('poll needs a guid');
    await poll(rest[0]);
  } else {
    console.log('Usage:\n  node scripts/verify-xlayer.mjs preflight\n  node scripts/verify-xlayer.mjs submit [Contract...]\n  node scripts/verify-xlayer.mjs poll <guid>');
    process.exit(1);
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
