#!/usr/bin/env node
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

const RPC_URL = 'https://rpc.xlayer.tech';
const CHAIN_SHORT_NAME = 'XLAYER';
const VERIFY_HOST = 'https://web3.okx.com';

const DEPLOYMENTS = {
  EmergencyVault: { address: '0x55E943aeC4FB74Dd5c97a85BacddBDa4B98B5De2', path: 'src/EmergencyVault.sol' },
  AegisVault:     { address: '0x8066b72f9E87Ca2CFD29e41D6DEd92f6bD1aC675', path: 'src/AegisVault.sol' },
  PolicyRegistry: { address: '0xf5c1c62bEEc5CDB4D3b596649C78f513BA5C869a', path: 'src/PolicyRegistry.sol' },
  RiskOracle:     { address: '0x2a017C7eb8030eA7150a62Abb313cb4E358d1DA6', path: 'src/RiskOracle.sol' },
};

const artifactOf = (name) =>
  JSON.parse(readFileSync(resolve(ROOT, `out/${name}.sol/${name}.json`), 'utf8'));

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
    ? 'All deployed mainnet contracts match the local build exactly.\nThese compiler settings are confirmed correct for verification.'
    : 'At least one contract did not match — do NOT submit until resolved.');
  return allMatch;
}

function authHeaders(method, requestPath, body = '') {
  const key = env.OKX_API_KEY || env.OKLINK_API_KEY || '';
  const secret = env.OKX_SECRET_KEY || env.OKLINK_API_SECRET || '';
  const passphrase = env.OKX_API_PASSPHRASE || env.OKLINK_API_PASSPHRASE || '';
  if (!key) throw new Error('No API key in .env');

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
  if (!target) throw new Error(`Unknown contract "${name}".`);

  const standardInputPath = resolve(ROOT, `verify/${name}.standard-input.json`);
  if (!existsSync(standardInputPath)) {
    console.log(`Generating standard input for ${name}...`);
    const forgeBin = 'C:\\Users\\USER\\.foundry\\bin\\forge.exe';
    const { spawnSync } = await import('node:child_process');
    const res = spawnSync(forgeBin, ['verify-contract', '--show-standard-json-input', '0x0', `${target.path}:${name}`], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    mkdirSync(resolve(ROOT, 'verify'), { recursive: true });
    writeFileSync(standardInputPath, res.stdout);
  }

  const requestPath = '/api/v5/xlayer/contract/verify-source-code';
  const payload = JSON.stringify({
    chainShortName: CHAIN_SHORT_NAME,
    contractAddress: target.address,
    contractName: `${target.path}:${name}`,
    sourceCode: readFileSync(standardInputPath, 'utf8'),
    codeFormat: 'solidity-standard-json-input',
    compilerVersion: compilerVersion(name),
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
  let json; try { json = JSON.parse(text); } catch {}
  if (!json) {
    console.log(`  HTTP ${res.status} (non-JSON, ${text.length} bytes)`);
    return;
  }
  console.log(`  HTTP ${res.status} code=${json.code} msg=${JSON.stringify(json.msg ?? '')}`);
  const guid = json.data?.[0]?.guid ?? json.data?.guid;
  if (guid) {
    mkdirSync(resolve(ROOT, 'verify'), { recursive: true });
    writeFileSync(resolve(ROOT, `verify/mainnet_${name}.guid.txt`), guid);
    console.log(`  guid: ${guid}  (saved)`);
    return guid;
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
    let json; try { json = JSON.parse(text); } catch {}
    if (!json) { console.log(`attempt ${attempt}: HTTP ${res.status} non-JSON`); return; }
    const status = Array.isArray(json.data) ? json.data[0] : (json.data?.status ?? json.data ?? '?');
    console.log(`attempt ${attempt}: HTTP ${res.status} code=${json.code} status=${JSON.stringify(status)} msg=${JSON.stringify(json.msg ?? '')}`);
    if (json.code === '0' || ['SUCCESS', 'FAIL', 'FAILURE', 'PASS'].includes(String(status).toUpperCase())) return status;
    await new Promise((r) => setTimeout(r, 4000));
  }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'preflight') process.exit((await preflight()) ? 0 : 1);
  else if (cmd === 'submit') {
    const names = rest.length ? rest : Object.keys(DEPLOYMENTS);
    for (const n of names) {
      const guid = await submit(n);
      if (guid) await poll(guid);
    }
  } else if (cmd === 'poll') {
    if (!rest[0]) throw new Error('poll needs a guid');
    await poll(rest[0]);
  } else {
    console.log('Usage:\n  node scripts/verify-mainnet-xlayer.mjs preflight\n  node scripts/verify-mainnet-xlayer.mjs submit [Contract...]\n  node scripts/verify-mainnet-xlayer.mjs poll <guid>');
    process.exit(1);
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
