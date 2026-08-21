/**
 * Full end-to-end live testnet verification:
 *   mint (faucet) → approve → openPosition → setPolicy
 *   → agent detects breach → routeToEmergency → verify on-chain state
 *
 * Uses TypeScript sources directly via tsx.
 * Run from: agent/ directory
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Monitor } from './src/monitor.js';
import { Executor } from './src/executor.js';

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(AGENT_DIR, '..');

// ── Load env ─────────────────────────────────────────────────────────────────
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [resolve(ROOT, '.env'), resolve(AGENT_DIR, '.env')]) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  return { ...out, ...process.env };
}
const env = loadEnv();

// ── Chain & addresses ─────────────────────────────────────────────────────────
const RPC_URL = 'https://testrpc.xlayer.tech/terigon';
const CHAIN_ID = 1952;

// Testnet primary deployment (24h timelock)
const VAULT_ADDR    = '0xc96d34534270B3ff41b5b4e30731c980FdfEd8DB' as Address;
const REGISTRY_ADDR = '0x90346e8ebB6fb000c97BbcdE93D7C5C192396Fd2' as Address;
const ORACLE_ADDR   = '0xEB0538B1c199eC063B7E6e785572ed4402D94074' as Address;
const EMERGENCY_ADDR= '0xA33e3050b185B9289C1732d71C53B0c36A25Fe61' as Address;
const TGLDX_ADDR    = '0xa7218E99738F3d83f6c2B85b2b5f13f6E709a3DF' as Address;

const chainDef = {
  id: CHAIN_ID,
  name: 'X Layer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

const publicClient = createPublicClient({ chain: chainDef, transport: http(RPC_URL) });

const deployerAccount = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
const agentAccount    = privateKeyToAccount(env.AGENT_PRIVATE_KEY as `0x${string}`);

const deployerClient = createWalletClient({ account: deployerAccount, chain: chainDef, transport: http(RPC_URL) });
const agentWalletClient = createWalletClient({ account: agentAccount, chain: chainDef, transport: http(RPC_URL) });

// ── Minimal ABIs ──────────────────────────────────────────────────────────────
const erc20Abi = [
  { type:'function', name:'mint',      stateMutability:'nonpayable', inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}], outputs:[] },
  { type:'function', name:'approve',   stateMutability:'nonpayable', inputs:[{name:'spender',type:'address'},{name:'amount',type:'uint256'}], outputs:[{name:'',type:'bool'}] },
  { type:'function', name:'balanceOf', stateMutability:'view',       inputs:[{name:'account',type:'address'}], outputs:[{name:'',type:'uint256'}] },
  { type:'function', name:'allowance', stateMutability:'view',       inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}], outputs:[{name:'',type:'uint256'}] },
] as const;

const vaultAbi = [
  { type:'function', name:'openPosition',   stateMutability:'nonpayable', inputs:[{name:'asset',type:'address'},{name:'amount',type:'uint256'}], outputs:[{name:'positionId',type:'uint256'}] },
  { type:'function', name:'nextPositionId', stateMutability:'view',       inputs:[], outputs:[{name:'',type:'uint256'}] },
  { type:'function', name:'positions',      stateMutability:'view',       inputs:[{name:'',type:'uint256'}], outputs:[{name:'owner',type:'address'},{name:'asset',type:'address'},{name:'amount',type:'uint256'},{name:'pausedByAgent',type:'bool'},{name:'exists',type:'bool'}] },
] as const;

const registryAbi = [
  { type:'function', name:'setPolicy', stateMutability:'nonpayable', inputs:[{name:'positionId',type:'uint256'},{name:'drawdownThresholdBps',type:'uint16'},{name:'oracleDeviationThresholdBps',type:'uint16'},{name:'exitPercentBps',type:'uint16'},{name:'mode',type:'uint8'}], outputs:[] },
] as const;

const oracleAbi = [
  { type:'function', name:'setPriceFeed', stateMutability:'nonpayable', inputs:[{name:'asset',type:'address'},{name:'feed',type:'address'}], outputs:[] },
  { type:'function', name:'getPrice',     stateMutability:'view',       inputs:[{name:'asset',type:'address'}], outputs:[{name:'price',type:'uint256'},{name:'decimals',type:'uint8'}] },
] as const;

const emergencyAbi = [
  { type:'function', name:'claimCount',        stateMutability:'view', inputs:[{name:'positionId',type:'uint256'}], outputs:[{name:'',type:'uint256'}] },
  { type:'function', name:'claimsByPosition',  stateMutability:'view', inputs:[{name:'positionId',type:'uint256'},{name:'index',type:'uint256'}], outputs:[{name:'owner',type:'address'},{name:'asset',type:'address'},{name:'amount',type:'uint256'},{name:'claimableAt',type:'uint256'},{name:'claimed',type:'bool'}] },
] as const;

// MockAggregatorV3 ABI (deploy + setPrice)
const mockAggAbi = [
  { type:'constructor', inputs:[{name:'decimals_',type:'uint8'},{name:'initialAnswer',type:'int256'},{name:'description_',type:'string'}], stateMutability:'nonpayable' },
  { type:'function', name:'setPrice', stateMutability:'nonpayable', inputs:[{name:'_answer',type:'int256'}], outputs:[] },
  { type:'function', name:'latestRoundData', stateMutability:'view', inputs:[], outputs:[{name:'roundId',type:'uint80'},{name:'answer',type:'int256'},{name:'startedAt',type:'uint256'},{name:'updatedAt',type:'uint256'},{name:'answeredInRound',type:'uint80'}] },
] as const;

// Load MockAggregatorV3 bytecode from Foundry artifacts
const mockArtifact = JSON.parse(readFileSync(resolve(ROOT, 'out/MockAggregatorV3.sol/MockAggregatorV3.json'), 'utf8'));
const mockBytecode = mockArtifact.bytecode.object as `0x${string}`;

// ── Logger ────────────────────────────────────────────────────────────────────
const log = {
  info:  (msg: string, ctx?: object) => console.log(`  [INFO]  ${msg}`, ctx ? JSON.stringify(ctx, (_,v) => typeof v === 'bigint' ? v.toString() : v) : ''),
  warn:  (msg: string, ctx?: object) => console.log(`  [WARN]  ${msg}`, ctx ? JSON.stringify(ctx, (_,v) => typeof v === 'bigint' ? v.toString() : v) : ''),
  error: (msg: string, ctx?: object) => console.log(`  [ERROR] ${msg}`, ctx ? JSON.stringify(ctx, (_,v) => typeof v === 'bigint' ? v.toString() : v) : ''),
  debug: (_msg: string, _ctx?: object) => {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function waitFor(hash: `0x${string}`, label: string) {
  process.stdout.write(`  ⏳ Waiting for "${label}" tx ${hash.slice(0,10)}...`);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(' confirmed ✅');
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  AEGIS FULL E2E TEST — X Layer Testnet (Chain 1952)          ║');
  console.log('║  mint → deposit → setPolicy → breach → routeToEmergency      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const chainId = await publicClient.getChainId();
  console.log(`✅ RPC connected. Chain ID: ${chainId}`);
  console.log(`   Deployer: ${deployerAccount.address}`);
  console.log(`   Agent:    ${agentAccount.address}\n`);

  const deployerOkb = await publicClient.getBalance({ address: deployerAccount.address });
  const agentOkb    = await publicClient.getBalance({ address: agentAccount.address });
  console.log(`   Deployer OKB balance: ${formatEther(deployerOkb)} OKB`);
  console.log(`   Agent OKB balance:    ${formatEther(agentOkb)} OKB\n`);

  if (deployerOkb === 0n) {
    console.error('❌ Deployer has no OKB gas. Get some from https://web3.okx.com/xlayer/faucet');
    process.exit(1);
  }

  // ── Step 1: Deploy fresh MockAggregatorV3 price feed ──────────────────────
  console.log('══ Step 1: Deploy MockAggregatorV3 (initial price = $2,000.00) ══');
  const mockHash = await deployerClient.deployContract({
    abi: mockAggAbi,
    bytecode: mockBytecode,
    args: [8, 200000000000n, 'E2E tGLDX/USD'],
  });
  await waitFor(mockHash, 'deploy MockAggregatorV3');
  const mockReceipt = await publicClient.getTransactionReceipt({ hash: mockHash });
  const mockAddr = mockReceipt.contractAddress as Address;
  console.log(`   MockAggregatorV3 deployed at: ${mockAddr}\n`);

  // ── Step 2: Wire feed to RiskOracle ───────────────────────────────────────
  console.log('══ Step 2: Wire MockAggregatorV3 to RiskOracle for tGLDX ══');
  const wireHash = await deployerClient.writeContract({
    address: ORACLE_ADDR, abi: oracleAbi, functionName: 'setPriceFeed',
    args: [TGLDX_ADDR, mockAddr],
  });
  await waitFor(wireHash, 'setPriceFeed');
  const [readPrice, readDec] = await publicClient.readContract({ address: ORACLE_ADDR, abi: oracleAbi, functionName: 'getPrice', args: [TGLDX_ADDR] }) as [bigint, number];
  console.log(`   RiskOracle tGLDX price: $${Number(readPrice) / 10 ** Number(readDec)}\n`);

  // ── Step 3: Faucet — mint tGLDX ───────────────────────────────────────────
  console.log('══ Step 3: Faucet — mint 100 tGLDX to deployer wallet ══');
  const balBefore = await publicClient.readContract({ address: TGLDX_ADDR, abi: erc20Abi, functionName: 'balanceOf', args: [deployerAccount.address] }) as bigint;
  console.log(`   tGLDX balance before mint: ${formatEther(balBefore)}`);
  const mintHash = await deployerClient.writeContract({
    address: TGLDX_ADDR, abi: erc20Abi, functionName: 'mint',
    args: [deployerAccount.address, parseEther('100')],
  });
  await waitFor(mintHash, 'mint tGLDX');
  const balAfter = await publicClient.readContract({ address: TGLDX_ADDR, abi: erc20Abi, functionName: 'balanceOf', args: [deployerAccount.address] }) as bigint;
  console.log(`   tGLDX balance after mint:  ${formatEther(balAfter)}\n`);

  // ── Step 4: Approve + openPosition (deposit to Aegis Vault) ───────────────
  console.log('══ Step 4: Approve tGLDX + openPosition (deposit 10 tGLDX) ══');
  const allowance = await publicClient.readContract({ address: TGLDX_ADDR, abi: erc20Abi, functionName: 'allowance', args: [deployerAccount.address, VAULT_ADDR] }) as bigint;
  if (allowance < parseEther('10')) {
    const approveHash = await deployerClient.writeContract({
      address: TGLDX_ADDR, abi: erc20Abi, functionName: 'approve',
      args: [VAULT_ADDR, parseEther('10000')],
    });
    await waitFor(approveHash, 'approve tGLDX for vault');
  } else {
    console.log(`   Allowance already sufficient: ${formatEther(allowance)} tGLDX`);
  }

  const posId = await publicClient.readContract({ address: VAULT_ADDR, abi: vaultAbi, functionName: 'nextPositionId' }) as bigint;
  const openHash = await deployerClient.writeContract({
    address: VAULT_ADDR, abi: vaultAbi, functionName: 'openPosition',
    args: [TGLDX_ADDR, parseEther('10')],
  });
  await waitFor(openHash, `openPosition #${posId}`);
  const [,, vaultAmount] = await publicClient.readContract({ address: VAULT_ADDR, abi: vaultAbi, functionName: 'positions', args: [posId] }) as [Address, Address, bigint, boolean, boolean];
  console.log(`   Position #${posId} opened. Vault balance: ${formatEther(vaultAmount)} tGLDX\n`);

  // ── Step 5: setPolicy ─────────────────────────────────────────────────────
  console.log('══ Step 5: Sign policy on-chain (drawdown > 10% → exit 50%) ══');
  const policyHash = await deployerClient.writeContract({
    address: REGISTRY_ADDR, abi: registryAbi, functionName: 'setPolicy',
    args: [posId, 1000, 500, 5000, 0],  // 10% drawdown, 5% deviation, 50% exit, Conservative
  });
  await waitFor(policyHash, 'setPolicy');
  console.log(`   Policy active for position #${posId}: exit 50% if drawdown > 10%\n`);

  // ── Step 6: Agent pass 1 — no breach ($2,000) ─────────────────────────────
  console.log('══ Step 6: Agent monitoring pass 1 — price $2,000 (no breach expected) ══');
  let mockQuotePrice = 2000.0;
  const mockQuoteClient = {
    async getReferencePrice(_req: unknown) {
      return { price: mockQuotePrice, toAmount: String(Math.round(mockQuotePrice * 1e6)), fetchedAt: Math.floor(Date.now() / 1000) };
    },
  };

  const executor = new Executor({
    publicClient,
    walletClient: agentWalletClient,
    account: agentAccount,
    vaultAddress: VAULT_ADDR,
    policyRegistryAddress: REGISTRY_ADDR,
    dryRun: false,
    logger: log,
  });

  const monitor = new Monitor({
    publicClient,
    vaultAddress: VAULT_ADDR,
    policyRegistryAddress: REGISTRY_ADDR,
    riskOracleAddress: ORACLE_ADDR,
    executor,
    logger: log,
    historySize: 10,
    exitCooldownSeconds: 5,
    quoteClient: mockQuoteClient,
    quoteToken: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  });

  const pass1 = await monitor.runOnce();
  const p1 = pass1.find((a: any) => a.positionId === posId);
  const [,, balP1] = await publicClient.readContract({ address: VAULT_ADDR, abi: vaultAbi, functionName: 'positions', args: [posId] }) as [Address, Address, bigint, boolean, boolean];
  console.log(`   Pass 1 action: ${p1?.action ?? 'none'}`);
  console.log(`   Vault balance unchanged: ${formatEther(balP1)} tGLDX`);
  if (!p1 || p1.action === 'none') console.log('   ✅ PASS: No exit at $2,000\n');
  else { console.error('   ❌ FAIL: Unexpected exit triggered at $2,000'); process.exit(1); }

  // ── Step 7: Crash price to $1,600 ─────────────────────────────────────────
  console.log('══ Step 7: Crash price $2,000 → $1,600 (−20%) ══');
  mockQuotePrice = 1600.0;
  const crashHash = await deployerClient.writeContract({
    address: mockAddr, abi: mockAggAbi, functionName: 'setPrice',
    args: [160000000000n],
  });
  await waitFor(crashHash, 'setPrice $1,600 on MockAggregatorV3');
  console.log(`   Oracle price now $1,600. DEX quote: $${mockQuotePrice}\n`);

  // ── Step 8: Agent pass 2 — breach detected, routeToEmergency ──────────────
  console.log('══ Step 8: Agent monitoring pass 2 — breach expected → routeToEmergency ══');
  console.log('   (20% drawdown > 10% threshold — agent should fire routeToEmergency)');
  const pass2 = await monitor.runOnce();
  const p2 = pass2.find((a: any) => a.positionId === posId);
  console.log(`   Pass 2 action: ${p2?.action ?? 'none'}`);
  console.log('   Waiting 5s for block inclusion...');
  await new Promise(r => setTimeout(r, 5000));

  // ── Step 9: Verify on-chain state ─────────────────────────────────────────
  console.log('\n══ Step 9: Verify on-chain state ══');
  const [,, balFinal] = await publicClient.readContract({ address: VAULT_ADDR, abi: vaultAbi, functionName: 'positions', args: [posId] }) as [Address, Address, bigint, boolean, boolean];
  const claimCount = await publicClient.readContract({ address: EMERGENCY_ADDR, abi: emergencyAbi, functionName: 'claimCount', args: [posId] }) as bigint;

  console.log(`   AegisVault position #${posId} balance:   ${formatEther(balFinal)} tGLDX (expected: 5.0)`);
  console.log(`   EmergencyVault claim count:             ${claimCount} (expected: ≥1)`);

  if (claimCount > 0n) {
    const claim = await publicClient.readContract({ address: EMERGENCY_ADDR, abi: emergencyAbi, functionName: 'claimsByPosition', args: [posId, claimCount - 1n] }) as [Address, Address, bigint, bigint, boolean];
    console.log(`   Claim details:`);
    console.log(`     owner:       ${claim[0]}`);
    console.log(`     asset:       ${claim[1]}`);
    console.log(`     amount:      ${formatEther(claim[2])} tGLDX`);
    console.log(`     claimableAt: ${new Date(Number(claim[3]) * 1000).toISOString()} (24h lock)`);
    console.log(`     claimed:     ${claim[4]}`);
  }

  // ── Final result ──────────────────────────────────────────────────────────
  console.log('');
  if (balFinal === parseEther('5') && claimCount >= 1n) {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ E2E TEST PASSED — ALL 9 STEPS SUCCESSFUL                 ║');
    console.log('║                                                              ║');
    console.log('║  mint (faucet) .............. ✅                             ║');
    console.log('║  approve .................... ✅                             ║');
    console.log('║  openPosition (deposit) ..... ✅                             ║');
    console.log('║  setPolicy (sign policy) .... ✅                             ║');
    console.log('║  pass 1: no breach at $2k ... ✅                             ║');
    console.log('║  price crash to $1,600 ...... ✅                             ║');
    console.log('║  pass 2: breach detected .... ✅                             ║');
    console.log('║  routeToEmergency fired ..... ✅                             ║');
    console.log('║  on-chain state verified .... ✅ 10 → 5 tGLDX, claim logged  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    process.exit(0);
  } else {
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ❌ E2E TEST FAILED                                          ║');
    console.error(`║  Expected: 5 tGLDX remaining, ≥1 claim                       ║`);
    console.error(`║  Got:      ${formatEther(balFinal)} tGLDX remaining, ${claimCount} claims               ║`);
    console.error('╚══════════════════════════════════════════════════════════════╝');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message ?? err);
  process.exit(1);
});
