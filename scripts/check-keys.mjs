import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
console.log('DEPLOYER_PRIVATE_KEY set:', !!env.DEPLOYER_PRIVATE_KEY);
console.log('AGENT_PRIVATE_KEY set:', !!env.AGENT_PRIVATE_KEY);
console.log('AGENT_ADDRESS:', env.AGENT_ADDRESS);
console.log('TESTNET_RPC_URL:', env.TESTNET_RPC_URL || 'https://testrpc.xlayer.tech/terigon');

try {
  const ethersPath = resolve(ROOT, 'agent/node_modules/ethers/lib.esm/index.js');
  const { Wallet } = await import(pathToFileURL(ethersPath).href);
  if (env.DEPLOYER_PRIVATE_KEY) {
    const wallet = new Wallet(env.DEPLOYER_PRIVATE_KEY);
    console.log('Deployer Address:', wallet.address);
  }
  if (env.AGENT_PRIVATE_KEY) {
    const wallet = new Wallet(env.AGENT_PRIVATE_KEY);
    console.log('Agent Signer Address:', wallet.address);
  }
} catch (e) {
  console.log('Ethers import error:', e.message);
}
