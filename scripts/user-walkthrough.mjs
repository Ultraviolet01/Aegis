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

const mockArtifactPath = resolve(ROOT, 'out/MockAggregatorV3.sol/MockAggregatorV3.json');
const mockArtifact = JSON.parse(readFileSync(mockArtifactPath, 'utf8'));

const RPC_URL = env.TESTNET_RPC_URL || 'https://testrpc.xlayer.tech/terigon';
const provider = new ethers.JsonRpcProvider(RPC_URL);

const deployerWallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
const agentWallet = new ethers.Wallet(env.AGENT_PRIVATE_KEY, provider);

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

// 60s Timelock Contracts for complete claim demonstration
const SEC_VAULT_ADDR = '0x7B82aa3ab8e73A10B036B714e77899D35833Ce25';
const SEC_EMERGENCY_ADDR = '0xF7089dd83A28Bae34F253E4e10EB3a7310313313';
const SEC_REGISTRY_ADDR = '0x0E863831454E9c430B939C45f872af340b7fbbed';
const SEC_ORACLE_ADDR = '0xEB0538B1c199eC063B7E6e785572ed4402D94074';
const SEC_TGLDX_ADDR = '0xbFEA452E4CB0F37C4bA775879Ede906C82fce5C2';

const vaultAbi = [
  'function openPosition(address asset, uint256 amount) external returns (uint256)',
  'function deposit(uint256 positionId, uint256 amount) external',
  'function withdraw(uint256 positionId, uint256 amount) external',
  'function routeToEmergency(uint256 positionId, uint16 exitBps) external',
  'function positions(uint256) external view returns (address owner, address asset, uint256 amount, bool pausedByAgent, bool exists)',
  'function nextPositionId() external view returns (uint256)',
];

const registryAbi = [
  'function setPolicy(uint256 positionId, uint16 maxDrawdownBps, uint16 maxPriceDevBps, uint16 exitPercentBps, uint8 mode) external',
  'function getPolicy(uint256 positionId) external view returns (uint16 maxDrawdownBps, uint16 maxPriceDevBps, uint16 exitPercentBps, uint8 mode, bool active)',
];

const oracleAbi = [
  'function setPriceFeed(address asset, address feed) external',
  'function getPrice(address asset) external view returns (uint256 price, uint8 decimals)',
];

const emergencyAbi = [
  'function claim(uint256 positionId, uint256 claimIndex) external',
  'function claimCount(uint256 positionId) external view returns (uint256)',
  'function claimsByPosition(uint256 positionId, uint256 index) external view returns (address owner, address asset, uint256 amount, uint256 claimableAt, bool claimed)',
];

const erc20Abi = [
  'function mint(address to, uint256 amount) external',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

const vault = new ethers.Contract(SEC_VAULT_ADDR, vaultAbi, deployerWallet);
const registry = new ethers.Contract(SEC_REGISTRY_ADDR, registryAbi, deployerWallet);
const oracle = new ethers.Contract(SEC_ORACLE_ADDR, oracleAbi, deployerWallet);
const emergency = new ethers.Contract(SEC_EMERGENCY_ADDR, emergencyAbi, deployerWallet);
const tGLDX = new ethers.Contract(SEC_TGLDX_ADDR, erc20Abi, deployerWallet);

const agentVault = new ethers.Contract(SEC_VAULT_ADDR, vaultAbi, agentWallet);

async function runWalkthrough() {
  console.log('\n================================================================');
  console.log('       AEGIS COMPLETE ON-CHAIN STEP-BY-STEP WALKTHROUGH        ');
  console.log('================================================================\n');

  console.log(`User / Connected Wallet: ${deployerWallet.address}`);
  console.log(`Agent Signer Wallet:     ${agentWallet.address}`);
  console.log(`Target Network:         X Layer Testnet (Chain ID 1952)\n`);

  const txLogs = [];

  // ---------------------------------------------------------------------------
  // STEP 1: MINT MOCK TEST TOKENS (tGLDX)
  // ---------------------------------------------------------------------------
  console.log('--- STEP 1: Mint Mock Test Tokens (tGLDX) ---');
  const mintAmount = ethers.parseEther('100');
  const mintReceipt = await sendTx(deployerWallet, tGLDX, 'mint', [deployerWallet.address, mintAmount]);
  const balAfterMint = await tGLDX.balanceOf(deployerWallet.address);
  
  console.log(`✅ Minted 100 tGLDX directly to wallet ${deployerWallet.address}`);
  console.log(`   Tx Hash: ${mintReceipt.hash}`);
  console.log(`   Block #: ${mintReceipt.blockNumber}`);
  console.log(`   New tGLDX Balance: ${ethers.formatEther(balAfterMint)} tGLDX\n`);
  txLogs.push({ Step: '1. Mint tGLDX', TxHash: mintReceipt.hash, Result: `Minted 100 tGLDX` });

  // ---------------------------------------------------------------------------
  // STEP 2: OPEN POSITION (REAL DEPOSIT TX)
  // ---------------------------------------------------------------------------
  console.log('--- STEP 2: Open Position (Real Deposit Tx) ---');
  const depositAmount = ethers.parseEther('20');
  
  // Approve vault if needed
  const currentAllowance = await tGLDX.allowance(deployerWallet.address, SEC_VAULT_ADDR);
  if (currentAllowance < depositAmount) {
    const approveReceipt = await sendTx(deployerWallet, tGLDX, 'approve', [SEC_VAULT_ADDR, ethers.MaxUint256]);
    console.log(`   Approval Tx Hash: ${approveReceipt.hash}`);
  }

  // Open position
  const posId = await vault.nextPositionId();
  const openReceipt = await sendTx(deployerWallet, vault, 'openPosition', [SEC_TGLDX_ADDR, depositAmount]);
  const posState = await vault.positions(posId);

  console.log(`✅ Opened Position #${posId} with ${ethers.formatEther(depositAmount)} tGLDX`);
  console.log(`   Tx Hash: ${openReceipt.hash}`);
  console.log(`   Block #: ${openReceipt.blockNumber}`);
  console.log(`   Position On-Chain Balance: ${ethers.formatEther(posState.amount)} tGLDX\n`);
  txLogs.push({ Step: `2. Open Position #${posId}`, TxHash: openReceipt.hash, Result: `Deposited 20 tGLDX` });

  // ---------------------------------------------------------------------------
  // STEP 3: WRITE & SIGN POLICY
  // ---------------------------------------------------------------------------
  console.log('--- STEP 3: Write & Sign Policy On-Chain ---');
  // Drawdown limit: 1000 BPS (10%), Price Dev: 500 BPS (5%), Exit Percent: 5000 BPS (50%), Mode: Conservative (0)
  const policyReceipt = await sendTx(deployerWallet, registry, 'setPolicy', [posId, 1000, 500, 5000, 0]);
  const policyOnChain = await registry.getPolicy(posId);

  console.log(`✅ Policy Signed On-Chain for Position #${posId}`);
  console.log(`   Tx Hash: ${policyReceipt.hash}`);
  console.log(`   Block #: ${policyReceipt.blockNumber}`);
  console.log(`   Policy Parameters: Drawdown Max ${Number(policyOnChain.maxDrawdownBps) / 100}%, Exit ${Number(policyOnChain.exitPercentBps) / 100}%, Active: ${policyOnChain.active}\n`);
  txLogs.push({ Step: `3. Sign Policy #${posId}`, TxHash: policyReceipt.hash, Result: `Max Drawdown 10%, Exit 50%` });

  // ---------------------------------------------------------------------------
  // STEP 4: DRIVE MOCK PRICE FEED & TRIGGER REAL BREACH
  // ---------------------------------------------------------------------------
  console.log('--- STEP 4: Drive Mock Price Feed to Trigger Real Breach ---');
  
  // 4.1 Deploy Mock Price Feed at $2,000
  const factory = new ethers.ContractFactory(mockArtifact.abi, mockArtifact.bytecode.object, deployerWallet);
  const mockAggregator = await factory.deploy(8, 200000000000n, 'Walkthrough tGLDX Feed', { nonce: await getFreshNonce(deployerWallet.address) });
  await mockAggregator.waitForDeployment();
  const mockAddr = await mockAggregator.getAddress();
  await sendTx(deployerWallet, oracle, 'setPriceFeed', [SEC_TGLDX_ADDR, mockAddr]);
  console.log(`   Initial Price Feed set at $2,000.00 (${mockAddr})`);

  // 4.2 Drop Price to $1,600 (-20% breach)
  const setPriceNonce = await getFreshNonce(deployerWallet.address);
  const priceTx = await mockAggregator.setPrice(160000000000n, { nonce: setPriceNonce });
  await priceTx.wait(1);
  console.log(`   Price feed updated: $2,000 -> $1,600 (-20% drawdown, breaches 10% limit)`);
  console.log(`   Price Update Tx: ${priceTx.hash}`);

  // 4.3 Agent executes routeToEmergency on-chain
  console.log('   Agent executing routeToEmergency(positionId, 5000 BPS)...');
  const routeReceipt = await sendTx(agentWallet, agentVault, 'routeToEmergency', [posId, 5000]);
  console.log(`✅ Agent routeToEmergency Executed On-Chain!`);
  console.log(`   Tx Hash: ${routeReceipt.hash}`);
  console.log(`   Block #: ${routeReceipt.blockNumber}\n`);
  txLogs.push({ Step: `4. Breach & Route Exit`, TxHash: routeReceipt.hash, Result: `Agent routed 10 tGLDX (50%)` });

  // ---------------------------------------------------------------------------
  // STEP 5: CONFIRM routeToEmergency FIRES & SHOWS IN ACTIVITY
  // ---------------------------------------------------------------------------
  console.log('--- STEP 5: Confirm routeToEmergency Execution & State ---');
  const posAfterExit = await vault.positions(posId);
  const claimCount = await emergency.claimCount(posId);
  const claimInfo = await emergency.claimsByPosition(posId, Number(claimCount) - 1);
  const claimableDate = new Date(Number(claimInfo.claimableAt) * 1000).toLocaleTimeString();

  console.log(`✅ On-Chain State Confirmed:`);
  console.log(`   Position #${posId} AegisVault Balance: ${ethers.formatEther(posAfterExit.amount)} tGLDX (Remaining 50%)`);
  console.log(`   EmergencyVault Pending Claim Index: #${Number(claimCount) - 1}`);
  console.log(`   Emergency Claim Amount: ${ethers.formatEther(claimInfo.amount)} tGLDX`);
  console.log(`   Claimable At: ${claimableDate} (60-second test timelock)\n`);
  txLogs.push({ Step: `5. Verify On-Chain Activity`, TxHash: routeReceipt.hash, Result: `50% AegisVault, 50% EmergencyVault` });

  // ---------------------------------------------------------------------------
  // STEP 6: WAIT OUT TIMELOCK & CLAIM FROM EMERGENCYVAULT
  // ---------------------------------------------------------------------------
  console.log('--- STEP 6: Wait Out Timelock & Claim from EmergencyVault ---');
  console.log('⏳ Waiting for the 60s test timelock to elapse...');
  
  const targetTime = Number(claimInfo.claimableAt) * 1000;
  while (Date.now() < targetTime + 2000) {
    const remainingSec = Math.max(0, Math.ceil((targetTime + 2000 - Date.now()) / 1000));
    process.stdout.write(`   Waiting for timelock unlock... ${remainingSec}s remaining\r`);
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('\n   Timelock elapsed! Claiming emergency funds now...');

  const userBalBeforeClaim = await tGLDX.balanceOf(deployerWallet.address);
  const claimReceipt = await sendTx(deployerWallet, emergency, 'claim', [posId, Number(claimCount) - 1]);
  const userBalAfterClaim = await tGLDX.balanceOf(deployerWallet.address);
  const claimedDiff = userBalAfterClaim - userBalBeforeClaim;

  console.log(`✅ Claimed Funds from EmergencyVault!`);
  console.log(`   Tx Hash: ${claimReceipt.hash}`);
  console.log(`   Block #: ${claimReceipt.blockNumber}`);
  console.log(`   Claimed Amount Returned to User Wallet: ${ethers.formatEther(claimedDiff)} tGLDX\n`);
  txLogs.push({ Step: `6. Claim Emergency Deposit`, TxHash: claimReceipt.hash, Result: `Claimed ${ethers.formatEther(claimedDiff)} tGLDX` });

  // ---------------------------------------------------------------------------
  // STEP 7: WITHDRAW REMAINING BALANCE FROM AEGISVAULT
  // ---------------------------------------------------------------------------
  console.log('--- STEP 7: Withdraw Remaining Balance from AegisVault ---');
  const posBeforeWithdraw = await vault.positions(posId);
  const remainingAmount = posBeforeWithdraw.amount;

  console.log(`   Remaining Position #${posId} Balance: ${ethers.formatEther(remainingAmount)} tGLDX`);
  const withdrawReceipt = await sendTx(deployerWallet, vault, 'withdraw', [posId, remainingAmount]);
  const posAfterWithdraw = await vault.positions(posId);

  console.log(`✅ Withdrew Remaining Funds from AegisVault!`);
  console.log(`   Tx Hash: ${withdrawReceipt.hash}`);
  console.log(`   Block #: ${withdrawReceipt.blockNumber}`);
  console.log(`   Final Position #${posId} Balance: ${ethers.formatEther(posAfterWithdraw.amount)} tGLDX\n`);
  txLogs.push({ Step: `7. Withdraw Remaining Balance`, TxHash: withdrawReceipt.hash, Result: `Withdrew ${ethers.formatEther(remainingAmount)} tGLDX` });

  // ---------------------------------------------------------------------------
  // SUMMARY TABLE
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('                   FULL WALKTHROUGH TX REPORT                  ');
  console.log('================================================================');
  console.table(txLogs);
}

runWalkthrough().catch(err => {
  console.error('Fatal walkthrough error:', err);
  process.exit(1);
});
