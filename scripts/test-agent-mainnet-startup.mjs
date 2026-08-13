import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const agentDir = resolve(ROOT, 'agent');

console.log('Testing off-chain agent startup against X Layer Mainnet...');

const result = spawnSync('npm', ['test'], {
  cwd: agentDir,
  encoding: 'utf8',
  stdio: 'inherit',
  shell: true
});

console.log('Agent unit tests exit code:', result.status);
