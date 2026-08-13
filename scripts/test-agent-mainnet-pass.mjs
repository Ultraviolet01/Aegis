import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const agentMain = resolve(ROOT, 'agent/dist/index.js');

// Run mainnet agent index pass
console.log('Running single pass of Agent service against X Layer Mainnet...');
const { runOnce } = await import(pathToFileURL(agentMain).href);
await runOnce();
console.log('Agent mainnet runOnce completed successfully.');
