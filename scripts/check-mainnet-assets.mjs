import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ethersPath = resolve(ROOT, 'agent/node_modules/ethers/lib.esm/index.js');
const { JsonRpcProvider, Contract } = await import(pathToFileURL(ethersPath).href);

const provider = new JsonRpcProvider('https://rpc.xlayer.tech');
const vaultAddress = '0x8066b72f9E87Ca2CFD29e41D6DEd92f6bD1aC675';

const vaultAbi = [
  'function supportedAssets(address asset) external view returns (bool)',
  'function agent() external view returns (address)',
  'function owner() external view returns (address)',
  'function emergencyVault() external view returns (address)',
  'function policyRegistry() external view returns (address)'
];

const vault = new Contract(vaultAddress, vaultAbi, provider);

const assets = {
  GLDX: '0x2380F2673C640fB67E2d6B55B44C62F0E0e69DA9',
  SPYX: '0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48',
  USDC: '0x74b7F16337b8972027F6196A17a631aC6dE26d22'
};

console.log('=== On-Chain AegisVault Configuration ===');
console.log('Agent:          ', await vault.agent());
console.log('Owner:          ', await vault.owner());
console.log('Emergency Vault:', await vault.emergencyVault());
console.log('Policy Registry:', await vault.policyRegistry());
console.log('\n=== Supported Assets ===');
for (const [symbol, addr] of Object.entries(assets)) {
  const supported = await vault.supportedAssets(addr);
  console.log(`${symbol} (${addr}): ${supported ? 'SUPPORTED ✓' : 'NOT SUPPORTED ✗'}`);
}
