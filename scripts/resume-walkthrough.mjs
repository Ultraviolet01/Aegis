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
const { ethers } = await import(pathToFileURL(ethersPath).href);

const RPC_URL = env.TESTNET_RPC_URL || 'https://testrpc.xlayer.tech/terigon';
const provider = new ethers.JsonRpcProvider(RPC_URL);

const deployerWallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);

async function getFreshNonce(addr) {
  const hex = await provider.send('eth_getTransactionCount', [addr, 'pending']);
  return parseInt(hex, 16);
}

async function sendTx(wallet, contract, method, args = []) {
  const nonce = await getFreshNonce(wallet.address);
  const tx = await contract[method](...args, { nonce });
  const receipt = await tx.wait(1);
  return receipt;
}

const SEC_VAULT_ADDR = '0x7B82aa3ab8e73A10B036B714e77899D35833Ce25';
const SEC_EMERGENCY_ADDR = '0xF7089dd83A28Bae34F253E4e10EB3a7310313313';
const SEC_TGLDX_ADDR = '0xbFEA452E4CB0F37C4bA775879Ede906C82fce5C2';

const vaultAbi = [
  'function withdraw(uint256 positionId, uint256 amount) external',
  'function positions(uint256) external view returns (address owner, address asset, uint256 amount, bool pausedByAgent, bool exists)',
];

const emergencyAbi = [
  'function claim(uint256 positionId, uint256 claimIndex) external',
  'function claimCount(uint256 positionId) external view returns (uint256)',
];

const erc20Abi = [
  'function balanceOf(address account) external view returns (uint256)',
];

const vault = new ethers.Contract(SEC_VAULT_ADDR, vaultAbi, deployerWallet);
const emergency = new ethers.Contract(SEC_EMERGENCY_ADDR, emergencyAbi, deployerWallet);
const tGLDX = new ethers.Contract(SEC_TGLDX_ADDR, erc20Abi, deployerWallet);

async function runFinish() {
  const posId = 7;
  console.log(`Resuming Steps 6 & 7 for Position #${posId}...`);

  // Step 6: Claim emergency deposit
  const claimCount = await emergency.claimCount(posId);
  console.log(`Claiming Emergency Index #${Number(claimCount) - 1} for Position #${posId}...`);
  
  const userBalBeforeClaim = await tGLDX.balanceOf(deployerWallet.address);
  const claimReceipt = await sendTx(deployerWallet, emergency, 'claim', [posId, Number(claimCount) - 1]);
  const userBalAfterClaim = await tGLDX.balanceOf(deployerWallet.address);
  const claimedDiff = userBalAfterClaim - userBalBeforeClaim;

  console.log(`✅ Step 6 Complete: Claimed Funds from EmergencyVault!`);
  console.log(`   Tx Hash: ${claimReceipt.hash}`);
  console.log(`   Block #: ${claimReceipt.blockNumber}`);
  console.log(`   Claimed Amount Returned to Wallet: ${ethers.formatEther(claimedDiff)} tGLDX\n`);

  // Step 7: Withdraw remaining balance from AegisVault
  const posState = await vault.positions(posId);
  console.log(`Withdrawing remaining ${ethers.formatEther(posState.amount)} tGLDX from AegisVault...`);
  const withdrawReceipt = await sendTx(deployerWallet, vault, 'withdraw', [posId, posState.amount]);
  const posAfterWithdraw = await vault.positions(posId);

  console.log(`✅ Step 7 Complete: Withdrew Remaining Balance from AegisVault!`);
  console.log(`   Tx Hash: ${withdrawReceipt.hash}`);
  console.log(`   Block #: ${withdrawReceipt.blockNumber}`);
  console.log(`   Final Position #${posId} On-Chain Balance: ${ethers.formatEther(posAfterWithdraw.amount)} tGLDX\n`);
}

runFinish().catch(err => {
  console.error('Error resuming:', err);
  process.exit(1);
});
