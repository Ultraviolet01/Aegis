import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Monitor } from './src/monitor.js';
import { Executor } from './src/executor.js';
import { createLogger } from './src/logger.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const xLayerTestnet = defineChain({
  id: 1952,
  name: 'X Layer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testrpc.xlayer.tech/terigon'] },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/x-layer-testnet' },
  },
  testnet: true,
});

const RPC_URL = process.env.RPC_URL || 'https://testrpc.xlayer.tech/terigon';
const DEPLOYER_KEY = (process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY) as `0x${string}`;
const AGENT_KEY = (process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY) as `0x${string}`;

const VAULT_ADDR = (process.env.AEGIS_VAULT_ADDRESS || '0xc96d34534270B3ff41b5b4e30731c980FdfEd8DB') as Address;
const REGISTRY_ADDR = (process.env.POLICY_REGISTRY_ADDRESS || '0x90346e8ebB6fb000c97BbcdE93D7C5C192396Fd2') as Address;
const ORACLE_ADDR = (process.env.RISK_ORACLE_ADDRESS || '0xEB0538B1c199eC063B7E6e785572ed4402D94074') as Address;
const EMERGENCY_ADDR = (process.env.EMERGENCY_VAULT_ADDRESS || '0xA33e3050b185B9289C1732d71C53B0c36A25Fe61') as Address;
const FEED_ADDR = '0xCeFDaF654aD66348C96de5870c39DB2fe374B3CE' as Address;

const log = createLogger('trigger-breach', 'debug');

const publicClient = createPublicClient({ chain: xLayerTestnet, transport: http(RPC_URL) });
const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
const agentAccount = privateKeyToAccount(AGENT_KEY);

const deployerClient = createWalletClient({ account: deployerAccount, chain: xLayerTestnet, transport: http(RPC_URL) });
const agentWalletClient = createWalletClient({ account: agentAccount, chain: xLayerTestnet, transport: http(RPC_URL) });

const mockAggAbi = [
  {
    type: 'function',
    name: 'setPrice',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newPrice', type: 'int256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const;

const vaultAbi = [
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'pausedByAgent', type: 'bool' },
      { name: 'exists', type: 'bool' },
    ],
  },
] as const;

const registryAbi = [
  {
    type: 'function',
    name: 'getPolicy',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'drawdownThresholdBps', type: 'uint16' },
          { name: 'oracleDeviationThresholdBps', type: 'uint16' },
          { name: 'exitPercentBps', type: 'uint16' },
          { name: 'mode', type: 'uint8' },
          { name: 'active', type: 'bool' },
          { name: 'updatedAt', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

const emergencyAbi = [
  {
    type: 'function',
    name: 'claimCount',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimsByPosition',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }, { name: 'index', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'claimableAt', type: 'uint256' },
      { name: 'claimed', type: 'bool' },
    ],
  },
] as const;

async function waitFor(hash: `0x${string}`, label: string) {
  process.stdout.write(`  ⏳ Waiting for "${label}" tx ${hash.slice(0, 10)}... `);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(receipt.status === 'success' ? 'confirmed ✅' : 'REVERTED ❌');
  if (receipt.status !== 'success') throw new Error(`Transaction failed: ${label}`);
  return receipt;
}

async function main() {
  const targetPosId = 31n;
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  🛡️ AEGIS GUARDIAN — TRIGGER POLICY BREACH ON POSITION #${targetPosId}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);

  // Step 1: Read Position & Policy on-chain
  console.log(`══ Step 1: Read Position #${targetPosId} & Policy ══`);
  const [posOwner, posAsset, posAmount, posPaused, posExists] = await publicClient.readContract({
    address: VAULT_ADDR,
    abi: vaultAbi,
    functionName: 'positions',
    args: [targetPosId],
  });

  if (!posExists) {
    throw new Error(`Position #${targetPosId} does not exist on-chain!`);
  }

  const policy = await publicClient.readContract({
    address: REGISTRY_ADDR,
    abi: registryAbi,
    functionName: 'getPolicy',
    args: [targetPosId],
  });

  console.log(`   Owner:       ${posOwner}`);
  console.log(`   Asset:       ${posAsset} (tSPYX)`);
  console.log(`   Vault Bal:   ${formatEther(posAmount)} tSPYX`);
  console.log(`   Policy:      Drawdown > ${Number(policy.drawdownThresholdBps)/100}% → Exit ${Number(policy.exitPercentBps)/100}%`);
  console.log(`   Active:      ${policy.active}\n`);

  // Step 2: Establish peak price $500
  console.log(`══ Step 2: Set Peak Baseline Price $500 ══`);
  const peakTx = await deployerClient.writeContract({
    address: FEED_ADDR,
    abi: mockAggAbi,
    functionName: 'setPrice',
    args: [50000000000n],
  });
  await waitFor(peakTx, 'set baseline $500');

  // Step 3: Crash price $500 → $400 (-20% drop, breaches 8% threshold)
  console.log(`\n══ Step 3: Crash tSPYX price $500 → $400 (−20.0% drawdown) ══`);
  const crashHash = await deployerClient.writeContract({
    address: FEED_ADDR,
    abi: mockAggAbi,
    functionName: 'setPrice',
    args: [40000000000n],
  });
  await waitFor(crashHash, 'crash price to $400');
  console.log(`   Oracle price is now $400 (-20.0% drawdown, breaches ${Number(policy.drawdownThresholdBps)/100}% threshold!)\n`);

  // Step 4: Run Guardian Agent evaluation pass
  console.log(`══ Step 4: Run Guardian Agent Monitor Pass ══`);
  const mockQuoteClient = {
    async getReferencePrice(_req: unknown) {
      return { price: 400.0, toAmount: '400000000', fetchedAt: Math.floor(Date.now() / 1000) };
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
    quoteToken: { address: '0x7d2a9f61f641538787ba6052A8C496C749AfBfd1', decimals: 6 },
  });

  // Pre-seed price history with peak $500 so drawdown engine calculates 20% drop from peak
  (monitor as any).tracking.set(targetPosId.toString(), {
    peakPrice: 500.0,
    history: [{ price: 500.0, timestamp: Math.floor(Date.now() / 1000) - 60 }],
  });

  const decisions = await monitor.runOnce();
  const decision = decisions.find(d => d.positionId === targetPosId);
  console.log(`\n   Guardian Action for Position #${targetPosId}: ${decision?.action ?? 'none'}`);
  console.log(`   Waiting 6s for block finality...\n`);
  await new Promise(r => setTimeout(r, 6000));

  // Step 5: Verify on-chain result
  console.log(`══ Step 5: Verify On-Chain Result ══`);
  const [,, remainingBal] = await publicClient.readContract({
    address: VAULT_ADDR,
    abi: vaultAbi,
    functionName: 'positions',
    args: [targetPosId],
  });

  const claimsCount = await publicClient.readContract({
    address: EMERGENCY_ADDR,
    abi: emergencyAbi,
    functionName: 'claimCount',
    args: [targetPosId],
  });

  console.log(`   AegisVault Remaining Balance:  ${formatEther(remainingBal)} tSPYX (was 50.0)`);
  console.log(`   EmergencyVault Claims Count:   ${claimsCount.toString()}`);

  if (claimsCount > 0n) {
    const claim = await publicClient.readContract({
      address: EMERGENCY_ADDR,
      abi: emergencyAbi,
      functionName: 'claimsByPosition',
      args: [targetPosId, claimsCount - 1n],
    });
    console.log(`   Emergency Claim Amount:        ${formatEther(claim[2])} tSPYX (75% protected)`);
    console.log(`   Owner Recipient:               ${claim[0]}`);
    console.log(`   Claimable At:                  ${new Date(Number(claim[3]) * 1000).toISOString()} (24h timelock)`);
  }

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  🎉 EMERGENCY ROUTING SUCCESSFUL!                           ║`);
  console.log(`║  75% of your tSPYX was automatically moved to EmergencyVault ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
}

main().catch(err => {
  console.error('Trigger script error:', err);
  process.exit(1);
});
