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
const ethersPath = resolve(ROOT, 'agent/node_modules/ethers/lib.esm/index.js');
const { Wallet, JsonRpcProvider, formatEther } = await import(pathToFileURL(ethersPath).href);

if (!env.DEPLOYER_PRIVATE_KEY) {
  console.error('ERROR: DEPLOYER_PRIVATE_KEY not set in .env');
  process.exit(1);
}

const mainnetProvider = new JsonRpcProvider('https://rpc.xlayer.tech');
const wallet = new Wallet(env.DEPLOYER_PRIVATE_KEY, mainnetProvider);

console.log('Deployer Address:', wallet.address);
console.log('Agent Address:   ', env.AGENT_ADDRESS);

const balanceWei = await mainnetProvider.getBalance(wallet.address);
console.log('Mainnet OKB Balance:', formatEther(balanceWei), 'OKB');

const chainId = (await mainnetProvider.getNetwork()).chainId;
console.log('Connected Chain ID:', chainId.toString());
