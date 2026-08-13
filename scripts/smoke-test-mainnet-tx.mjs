import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ethersPath = resolve(ROOT, 'agent/node_modules/ethers/lib.esm/index.js');
const { JsonRpcProvider, Contract, Wallet } = await import(pathToFileURL(ethersPath).href);

const dotenv = await import('dotenv');
dotenv.config({ path: resolve(ROOT, '.env') });

const provider = new JsonRpcProvider('https://rpc.xlayer.tech');
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const wallet = new Wallet(deployerKey, provider);

const vaultAddr = '0x8066b72f9E87Ca2CFD29e41D6DEd92f6bD1aC675';
const evaultAddr = '0x55E943aeC4FB74Dd5c97a85BacddBDa4B98B5De2';
const registryAddr = '0xf5c1c62bEEc5CDB4D3b596649C78f513BA5C869a';
const oracleAddr = '0x2a017C7eb8030eA7150a62Abb313cb4E358d1DA6';

const vaultAbi = [
  'function nextPositionId() external view returns (uint256)',
  'function agent() external view returns (address)',
  'function owner() external view returns (address)',
  'function emergencyVault() external view returns (address)',
  'function policyRegistry() external view returns (address)',
  'function supportedAssets(address) external view returns (bool)'
];

const evaultAbi = [
  'function authorizedVaults(address) external view returns (bool)',
  'function claimDelay() external view returns (uint256)',
  'function owner() external view returns (address)'
];

const registryAbi = [
  'function vault() external view returns (address)',
  'function getPolicy(uint256 positionId) external view returns (tuple(uint16 drawdownThresholdBps, uint16 oracleDeviationThresholdBps, uint16 exitPercentBps, uint8 mode, bool active, uint256 updatedAt))',
  'function setPolicy(uint256 positionId, uint16 drawdownThresholdBps, uint16 oracleDeviationThresholdBps, uint16 exitPercentBps, uint8 mode) external'
];

const oracleAbi = [
  'function owner() external view returns (address)'
];

console.log('=== Aegis X Layer Mainnet Live Smoke Test ===');
console.log('Wallet Address:', wallet.address);

const vault = new Contract(vaultAddr, vaultAbi, provider);
const evault = new Contract(evaultAddr, evaultAbi, provider);
const registry = new Contract(registryAddr, registryAbi, wallet);
const oracle = new Contract(oracleAddr, oracleAbi, provider);

console.log('\n--- 1. Verification of Contract Wiring & State ---');
const nextId = await vault.nextPositionId();
const vaultAgent = await vault.agent();
const vaultOwner = await vault.owner();
const vaultEVault = await vault.emergencyVault();
const vaultRegistry = await vault.policyRegistry();
const isVaultAuthorized = await evault.authorizedVaults(vaultAddr);
const claimDelay = await evault.claimDelay();
const registryVault = await registry.vault();
const oracleOwner = await oracle.owner();

console.log('nextPositionId:         ', nextId.toString());
console.log('AegisVault.agent:       ', vaultAgent);
console.log('AegisVault.owner:       ', vaultOwner);
console.log('AegisVault.eVault:      ', vaultEVault);
console.log('AegisVault.registry:    ', vaultRegistry);
console.log('EVault.authorizedVault: ', isVaultAuthorized);
console.log('EVault.claimDelay:      ', claimDelay.toString(), 'seconds (24 hours)');
console.log('Registry.vault:         ', registryVault);
console.log('Oracle.owner:           ', oracleOwner);

console.log('\n--- 2. Live On-Chain Transaction: Setting Policy for Position #1 ---');
console.log('Submitting setPolicy(positionId=1, drawdown=800 (8%), deviation=200 (2%), exit=7500 (75%), mode=1 (Conservative))...');

const tx = await registry.setPolicy(1, 800, 200, 7500, 1);
console.log('Tx Submitted! Hash:', tx.hash);
console.log('Waiting for block confirmation...');
const receipt = await tx.wait();
console.log(`Tx Confirmed in block ${receipt.blockNumber}! Gas used: ${receipt.gasUsed.toString()}`);

console.log('\n--- 3. Reading Policy State Back from Mainnet ---');
const policy = await registry.getPolicy(1);
console.log('Position #1 On-Chain Policy:');
console.log(`  drawdownThresholdBps:        ${policy.drawdownThresholdBps} (${policy.drawdownThresholdBps / 100}%)`);
console.log(`  oracleDeviationThresholdBps: ${policy.oracleDeviationThresholdBps} (${policy.oracleDeviationThresholdBps / 100}%)`);
console.log(`  exitPercentBps:              ${policy.exitPercentBps} (${policy.exitPercentBps / 100}%)`);
console.log(`  mode:                        ${policy.mode} (Conservative)`);
console.log(`  active:                      ${policy.active}`);
console.log(`  updatedAt timestamp:         ${policy.updatedAt.toString()}`);

console.log('\n=== SMOKE TEST TRANSACTION PASSED ON-CHAIN ===');
console.log('Tx Hash:', tx.hash);
console.log('OKLink Tx URL:', `https://www.oklink.com/x-layer/tx/${tx.hash}`);
