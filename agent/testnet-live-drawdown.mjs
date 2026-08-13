import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { Monitor } from './src/monitor.js';
import { Executor } from './src/executor.js';

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(AGENT_DIR, '..');

function loadEnv() {
  const out = {};
  for (const file of [resolve(ROOT, '.env'), resolve(AGENT_DIR, '.env')]) {
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
const mockArtifactPath = resolve(ROOT, 'out/MockAggregatorV3.sol/MockAggregatorV3.json');
const mockArtifact = JSON.parse(readFileSync(mockArtifactPath, 'utf8'));

const RPC_URL = env.TESTNET_RPC_URL || 'https://testrpc.xlayer.tech';
const provider = new ethers.JsonRpcProvider(RPC_URL);

const deployerWallet = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY, provider);
const agentWallet = new ethers.Wallet(env.AGENT_PRIVATE_KEY, provider);

// Fresh nonce helper
async function getFreshNonce(addr) {
  const hex = await provider.send('eth_getTransactionCount', [addr, 'pending']);
  return parseInt(hex, 16);
}

async function sendTx(wallet, contract, method, args = []) {
  const nonce = await getFreshNonce(wallet.address);
  const tx = await contract[method](...args, { nonce });
  return await tx.wait(1);
}

// Contract Addresses on X Layer Testnet (Chain ID 1952)
const VAULT_ADDR = '0xc96d34534270B3ff41b5b4e30731c980FdfEd8DB';
const EMERGENCY_ADDR = '0xA33e3050b185B9289C1732d71C53B0c36A25Fe61';
const REGISTRY_ADDR = '0x90346e8ebB6fb000c97BbcdE93D7C5C192396Fd2';
const ORACLE_ADDR = '0xEB0538B1c199eC063B7E6e785572ed4402D94074';
const TGLDX_ADDR = '0xa7218E99738F3d83f6c2B85b2b5f13f6E709a3DF';

const vaultAbi = [
  'function openPosition(address asset, uint256 amount) external returns (uint256)',
  'function positions(uint256) external view returns (address owner, address asset, uint256 amount, bool pausedByAgent, bool exists)',
  'function nextPositionId() external view returns (uint256)',
];

const registryAbi = [
  'function setPolicy(uint256 positionId, uint16 maxDrawdownBps, uint16 maxPriceDevBps, uint16 exitPercentBps, uint8 mode) external',
];

const oracleAbi = [
  'function setPriceFeed(address asset, address feed) external',
  'function getPrice(address asset) external view returns (uint256 price, uint8 decimals)',
];

const emergencyAbi = [
  'function claimCount(uint256 positionId) external view returns (uint256)',
  'function claimsByPosition(uint256 positionId, uint256 index) external view returns (address owner, address asset, uint256 amount, uint256 claimableAt, bool claimed)',
];

const erc20Abi = [
  'function mint(address to, uint256 amount) external',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

const vault = new ethers.Contract(VAULT_ADDR, vaultAbi, deployerWallet);
const registry = new ethers.Contract(REGISTRY_ADDR, registryAbi, deployerWallet);
const oracle = new ethers.Contract(ORACLE_ADDR, oracleAbi, deployerWallet);
const emergency = new ethers.Contract(EMERGENCY_ADDR, emergencyAbi, deployerWallet);
const tGLDX = new ethers.Contract(TGLDX_ADDR, erc20Abi, deployerWallet);

const safeStr = (obj) => JSON.stringify(obj, (k, v) => (typeof v === 'bigint' ? v.toString() : v));

const dummyLogger = {
  info: (msg, ctx) => console.log(`[LOGGER INFO] ${msg}`, ctx ? safeStr(ctx) : ''),
  warn: (msg, ctx) => console.log(`[LOGGER WARN] ${msg}`, ctx ? safeStr(ctx) : ''),
  error: (msg, ctx) => console.log(`[LOGGER ERROR] ${msg}`, ctx ? safeStr(ctx) : ''),
  debug: (msg, ctx) => {}, // quiet debug logs
};

async function main() {
  console.log('================================================================');
  console.log('    REAL ON-CHAIN DRAWDOWN-TRIGGERED AGENT EXIT DEMO (1952)     ');
  console.log('    (OKX DEX Quote Price Source Path)                           ');
  console.log('================================================================\n');

  const network = await provider.getNetwork();
  console.log(`Connected to RPC. Chain ID: ${network.chainId}`);
  console.log(`Deployer Address: ${deployerWallet.address}`);
  console.log(`Agent Address:    ${agentWallet.address}\n`);

  // Step 1: Deploy fresh MockAggregatorV3 with initial price = $2,000.00 (8 decimals)
  console.log('Step 1: Deploying fresh MockAggregatorV3 (initial price = $2,000.00)...');
  const factory = new ethers.ContractFactory(mockArtifact.abi, mockArtifact.bytecode.object, deployerWallet);
  const nonce = await getFreshNonce(deployerWallet.address);
  const mockAggregator = await factory.deploy(8, 200000000000n, 'Live Demo tGLDX/USD Feed', { nonce });
  await mockAggregator.waitForDeployment();
  const mockAddr = await mockAggregator.getAddress();
  console.log(`✅ Deployed MockAggregatorV3 at ${mockAddr}`);

  // Step 2: Register MockAggregatorV3 as price feed for tGLDX on RiskOracle
  console.log('\nStep 2: Wiring MockAggregatorV3 to RiskOracle for tGLDX...');
  await sendTx(deployerWallet, oracle, 'setPriceFeed', [TGLDX_ADDR, mockAddr]);
  const [readPrice, readDecimals] = await oracle.getPrice(TGLDX_ADDR);
  console.log(`✅ RiskOracle tGLDX price: $${Number(readPrice) / 10 ** Number(readDecimals)}`);

  // Step 3: User opens position on AegisVault
  console.log('\nStep 3: User opens position on AegisVault with 10 tGLDX...');
  const bal = await tGLDX.balanceOf(deployerWallet.address);
  if (bal < ethers.parseEther('20')) {
    await sendTx(deployerWallet, tGLDX, 'mint', [deployerWallet.address, ethers.parseEther('100')]);
  }
  const allow = await tGLDX.allowance(deployerWallet.address, VAULT_ADDR);
  if (allow < ethers.parseEther('20')) {
    await sendTx(deployerWallet, tGLDX, 'approve', [VAULT_ADDR, ethers.MaxUint256]);
  }

  const posId = await vault.nextPositionId();
  await sendTx(deployerWallet, vault, 'openPosition', [TGLDX_ADDR, ethers.parseEther('10')]);
  console.log(`✅ Opened Position #${posId} with 10 tGLDX`);

  // Step 4: User sets policy on PolicyRegistry
  console.log('\nStep 4: User sets risk policy on PolicyRegistry...');
  // Max drawdown = 1000 bps (10%), Max deviation = 500 bps (5%), Exit = 5000 bps (50%), Mode = 0 (Conservative)
  await sendTx(deployerWallet, registry, 'setPolicy', [posId, 1000, 500, 5000, 0]);
  console.log(`✅ Set Policy for Position #${posId}: Exit 50% if drawdown > 10%`);

  // Step 5: Setup Agent Monitor & Executor using Viem
  console.log('\nStep 5: Initializing Agent Monitor & Executor with OKX DEX Quote Client...');
  const chainConfig = {
    id: 1952,
    name: 'X Layer Testnet',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  };

  const publicClient = createPublicClient({ chain: chainConfig, transport: http(RPC_URL) });
  const agentAccount = privateKeyToAccount(env.AGENT_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account: agentAccount,
    chain: chainConfig,
    transport: http(RPC_URL),
  });

  const executor = new Executor({
    publicClient,
    walletClient,
    account: agentAccount,
    vaultAddress: VAULT_ADDR,
    policyRegistryAddress: REGISTRY_ADDR,
    dryRun: false,
    logger: dummyLogger,
  });

  // OKX DEX quote client mock for live drawdown test
  let currentDexQuotePrice = 2000.0;
  const mockDexQuoteClient = {
    async getReferencePrice(request) {
      return {
        price: currentDexQuotePrice,
        toAmount: String(Math.round(currentDexQuotePrice * 1e6)),
        fetchedAt: Math.floor(Date.now() / 1000),
      };
    },
  };

  const monitor = new Monitor({
    publicClient,
    vaultAddress: VAULT_ADDR,
    policyRegistryAddress: REGISTRY_ADDR,
    riskOracleAddress: ORACLE_ADDR,
    executor,
    logger: dummyLogger,
    historySize: 10,
    exitCooldownSeconds: 10,
    quoteClient: mockDexQuoteClient,
    quoteToken: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  });

  // Step 6: Monitor Pass 1 — Price = $2000 (0% drawdown)
  console.log('\nStep 6: Running Agent Monitor Pass 1 via OKX DEX Quote Path (Price = $2,000.00)...');
  const pass1Assessments = await monitor.runOnce();
  const pos1Assessment = pass1Assessments.find((a) => a.positionId === posId);
  console.log(`Pass 1 Assessment Action for Position #${posId}: [${pos1Assessment?.action ?? 'none'}]`);

  const pos1State = await vault.positions(posId);
  if ((!pos1Assessment || pos1Assessment.action === 'none') && pos1State.amount === ethers.parseEther('10')) {
    console.log(`✅ PASS: No exit triggered at $2,000. Position balance intact at 10 tGLDX`);
  } else {
    console.error(`❌ FAIL: Unexpected action or balance modification in Pass 1`);
    process.exit(1);
  }

  // Step 7: Simulate price drop ($2,000 -> $1,600, a 20% drawdown)
  console.log('\nStep 7: Simulating market crash — updating OKX DEX quote reference price ($2,000 -> $1,600.00) [-20%]...');
  currentDexQuotePrice = 1600.0;
  const setPriceNonce = await getFreshNonce(deployerWallet.address);
  const setPriceTx = await mockAggregator.setPrice(160000000000n, { nonce: setPriceNonce });
  await setPriceTx.wait(1);
  
  console.log(`✅ OKX DEX Quote reference price updated to: $${currentDexQuotePrice} (-20%)`);

  // Step 8: Monitor Pass 2 — Price = $1600 (20% drawdown > 10% threshold)
  console.log('\nStep 8: Running Agent Monitor Pass 2 via OKX DEX Quote Path (Price = $1,600.00)...');
  console.log('Expecting Agent to detect drawdown from OKX DEX quote and broadcast live routeToEmergency transaction...');
  const pass2Assessments = await monitor.runOnce();
  const pos2Assessment = pass2Assessments.find((a) => a.positionId === posId);
  console.log(`Pass 2 Assessment Action for Position #${posId}: [${pos2Assessment?.action}]`);

  // Wait for block mining of the exit transaction sent by Agent
  console.log('Waiting 5 seconds for block inclusion of Agent exit transaction...');
  await new Promise((r) => setTimeout(r, 5000));

  // Step 9: Reconcile On-Chain Contract State
  console.log('\nStep 9: Reconciling On-Chain State on X Layer Testnet...');
  const pos2State = await vault.positions(posId);
  const claimsCount = await emergency.claimCount(posId);

  console.log(`Position #${posId} Amount on AegisVault: ${ethers.formatEther(pos2State.amount)} tGLDX (Initial: 10 tGLDX)`);
  console.log(`EmergencyVault Claim Count for Position #${posId}: ${claimsCount}`);

  if (claimsCount > 0n) {
    const claim0 = await emergency.claimsByPosition(posId, claimsCount - 1n);
    console.log(`Recorded Claim: owner=${claim0.owner}, asset=${claim0.asset}, amount=${ethers.formatEther(claim0.amount)} tGLDX`);
  }

  const expectedVal = ethers.parseEther('5');
  if (pos2State.amount === expectedVal && claimsCount >= 1n) {
    console.log('\n================================================================');
    console.log('  ✅ LIVE ON-CHAIN DRAWDOWN EXIT DEMO SUCCESSFUL!              ');
    console.log('  - OKX DEX quote price drop ($2,000 -> $1,600) detected by Agent ');
    console.log('  - Live routeToEmergency tx sent and confirmed on Testnet     ');
    console.log('  - Position amount reduced 10 tGLDX -> 5 tGLDX (50% exit)       ');
    console.log('  - EmergencyVault deposit claim recorded for Position Owner   ');
    console.log('================================================================');
    process.exit(0);
  } else {
    console.error('❌ FAIL: On-chain state did not reflect expected 50% exit');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in live drawdown demo script:', err);
  process.exit(1);
});
