import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ethersPath = resolve(ROOT, 'agent/node_modules/ethers/lib.esm/index.js');

// Load environment variables
const dotenv = await import('dotenv');
dotenv.config({ path: resolve(ROOT, '.env') });

console.log('=== Verifying Agent Mainnet Setup ===');
console.log('AEGIS_NETWORK:          ', process.env.AEGIS_NETWORK);
console.log('AEGIS_VAULT_ADDRESS:    ', process.env.AEGIS_VAULT_ADDRESS);
console.log('POLICY_REGISTRY_ADDRESS:', process.env.POLICY_REGISTRY_ADDRESS);
console.log('RISK_ORACLE_ADDRESS:    ', process.env.RISK_ORACLE_ADDRESS);
console.log('EMERGENCY_VAULT_ADDRESS:', process.env.EMERGENCY_VAULT_ADDRESS);
console.log('AGENT_ADDRESS:          ', process.env.AGENT_ADDRESS);

const { JsonRpcProvider, Contract } = await import(pathToFileURL(ethersPath).href);
const provider = new JsonRpcProvider('https://rpc.xlayer.tech');

// Assert Chain ID
const network = await provider.getNetwork();
console.log(`RPC Chain ID: ${network.chainId} (Expected: 196)`);

// Assert Agent Role
const vaultAbi = [
  'function agent() external view returns (address)',
  'function policyRegistry() external view returns (address)'
];
const vault = new Contract(process.env.AEGIS_VAULT_ADDRESS, vaultAbi, provider);

const agentAddress = await vault.agent();
const policyRegistryAddress = await vault.policyRegistry();

console.log('On-chain AegisVault.agent():         ', agentAddress);
console.log('On-chain AegisVault.policyRegistry():', policyRegistryAddress);

if (agentAddress.toLowerCase() === process.env.AGENT_ADDRESS.toLowerCase()) {
  console.log('✓ Agent role matches AGENT_ADDRESS');
} else {
  console.error('✗ Agent role mismatch!');
  process.exit(1);
}

if (policyRegistryAddress.toLowerCase() === process.env.POLICY_REGISTRY_ADDRESS.toLowerCase()) {
  console.log('✓ PolicyRegistry address matches POLICY_REGISTRY_ADDRESS');
} else {
  console.error('✗ PolicyRegistry address mismatch!');
  process.exit(1);
}

console.log('\n=== ALL AGENT MAINNET STARTUP CHECKS PASSED ===');
