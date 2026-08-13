import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ethersPath = resolve(ROOT, 'agent/node_modules/ethers/lib.esm/index.js');
const { JsonRpcProvider } = await import(pathToFileURL(ethersPath).href);

const provider = new JsonRpcProvider('https://rpc.xlayer.tech');

const addrs = {
  EmergencyVault: '0x55E943aeC4FB74Dd5c97a85BacddBDa4B98B5De2',
  AegisVault: '0x8066b72f9E87Ca2CFD29e41D6DEd92f6bD1aC675',
  PolicyRegistry: '0xf5c1c62bEEc5CDB4D3b596649C78f513BA5C869a',
  RiskOracle: '0x2a017C7eb8030eA7150a62Abb313cb4E358d1DA6'
};

for (const [name, addr] of Object.entries(addrs)) {
  const code = await provider.getCode(addr);
  console.log(`${name} (${addr}): length ${code.length}`);
}
