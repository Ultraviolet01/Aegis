import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
const forgeBin = 'C:\\Users\\USER\\.foundry\\bin\\forge.exe';

console.log('Running mainnet deployment broadcast...');
console.log('DEPLOYER_PRIVATE_KEY set:', !!env.DEPLOYER_PRIVATE_KEY);
console.log('AGENT_ADDRESS:', env.AGENT_ADDRESS);

const result = spawnSync(
  forgeBin,
  [
    'script',
    'script/DeployMainnet.s.sol:DeployMainnet',
    '--rpc-url',
    'https://rpc.xlayer.tech',
    '--broadcast',
    '-vvvv'
  ],
  {
    cwd: ROOT,
    env: env,
    encoding: 'utf8',
    stdio: 'inherit'
  }
);

if (result.error) {
  console.error('Error launching forge:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
