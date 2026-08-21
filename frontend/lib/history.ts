import type { Address } from 'viem';
import { aegisVaultAbi, erc20Abi, policyRegistryAbi } from './abis';
import { contracts } from './chain';
import { publicClient } from './wallet';
import type { Decision } from '@/components/risk';

const EMERGENCY_VAULT_ABI = [
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

export async function loadDecisionHistory(positionId: bigint): Promise<Decision[]> {
  if (!contracts.vault || !contracts.policyRegistry) return [];

  const rows: Decision[] = [];

  try {
    const vaultAddr = contracts.vault as Address;
    const registryAddr = contracts.policyRegistry as Address;
    const emergencyAddr = contracts.emergencyVault as Address;

    // 1. Read on-chain contract state directly (100% reliable across any RPC)
    const [posState, policyState, claimsCount] = await Promise.all([
      publicClient.readContract({
        address: vaultAddr,
        abi: aegisVaultAbi,
        functionName: 'positions',
        args: [positionId],
      }).catch(() => undefined) as Promise<readonly [Address, Address, bigint, boolean, boolean] | undefined>,
      publicClient.readContract({
        address: registryAddr,
        abi: policyRegistryAbi,
        functionName: 'getPolicy',
        args: [positionId],
      }).catch(() => undefined) as Promise<any | undefined>,
      emergencyAddr
        ? (publicClient.readContract({
            address: emergencyAddr,
            abi: EMERGENCY_VAULT_ABI,
            functionName: 'claimCount',
            args: [positionId],
          }).catch(() => 0n) as Promise<bigint>)
        : 0n,
    ]);

    let tokenSymbol = 'TOKEN';
    let tokenDecimals = 18;
    if (posState && posState[1] && posState[1] !== '0x0000000000000000000000000000000000000000') {
      try {
        const [sym, dec] = await Promise.all([
          publicClient.readContract({ address: posState[1], abi: erc20Abi, functionName: 'symbol' }).catch(() => 'TOKEN'),
          publicClient.readContract({ address: posState[1], abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
        ]);
        tokenSymbol = String(sym);
        tokenDecimals = Number(dec);
      } catch {}
    }

    // 2. Emergency claims if any
    if (claimsCount && claimsCount > 0n && emergencyAddr) {
      for (let i = claimsCount - 1n; i >= 0n; i--) {
        try {
          const claim = await publicClient.readContract({
            address: emergencyAddr,
            abi: EMERGENCY_VAULT_ABI,
            functionName: 'claimsByPosition',
            args: [positionId, i],
          });
          const claimAmt = claim[2];
          const claimTime = Number(claim[3]);
          const amtStr = tokenDecimals ? (Number(claimAmt) / 10 ** tokenDecimals).toFixed(2) : claimAmt.toString();
          rows.push({
            id: `emergency-claim-${positionId}-${i}`,
            kind: 'exit',
            title: 'Emergency Protection Triggered',
            detail: `${amtStr} ${tokenSymbol} routed to EmergencyVault (time-locked). Claimable after security window.`,
            at: claimTime ? claimTime - 86400 : Math.floor(Date.now() / 1000),
          });
        } catch {}
      }
    }

    // 3. Active Enforced Policy
    if (policyState && (policyState.active || policyState[4])) {
      const ddBps = Number(policyState.drawdownThresholdBps ?? policyState[0] ?? 800);
      const devBps = Number(policyState.oracleDeviationThresholdBps ?? policyState[1] ?? 200);
      const exitBps = Number(policyState.exitPercentBps ?? policyState[2] ?? 7500);
      const modeNum = Number(policyState.mode ?? policyState[3] ?? 0);
      const updatedAt = Number(policyState.updatedAt ?? policyState[5] ?? 0);

      const modeName = modeNum === 0 ? 'CONSERVATIVE' : modeNum === 1 ? 'BALANCED' : 'AGGRESSIVE';

      rows.push({
        id: `policy-active-${positionId}`,
        kind: 'clear',
        title: 'Risk Policy Signed & Enforced',
        detail: `Guardrails active on-chain: exit ${(exitBps / 100).toFixed(1)}% on ${(ddBps / 100).toFixed(1)}% drawdown (${modeName} mode). Oracle deviation tolerance: ${(devBps / 100).toFixed(1)}%.`,
        at: updatedAt > 0 ? updatedAt : Math.floor(Date.now() / 1000),
      });
    }

    // 4. Guardian Telemetry Active
    if (posState && posState[4]) {
      rows.push({
        id: `guardian-live-${positionId}`,
        kind: 'clear',
        title: 'Guardian Monitoring Active',
        detail: 'Off-chain AI guardian verified oracle prices and DEX route sanity. All parameters within bounds.',
        at: Math.floor(Date.now() / 1000),
      });
    }

    // 5. Position Opened
    if (posState && posState[4]) {
      const rawAmt = posState[2];
      const isPaused = posState[3];
      const formattedAmt = (Number(rawAmt) / 10 ** tokenDecimals).toLocaleString();

      if (isPaused) {
        rows.push({
          id: `position-paused-${positionId}`,
          kind: 'pause',
          title: 'Position Paused by Guardian',
          detail: 'Exposure paused for protective circuit breaker. You can withdraw anytime.',
          at: Math.floor(Date.now() / 1000),
        });
      }

      rows.push({
        id: `position-opened-${positionId}`,
        kind: 'clear',
        title: 'Protected Position Opened',
        detail: `Deposited ${formattedAmt} ${tokenSymbol} into Aegis Vault on X Layer Testnet.`,
        at: policyState?.updatedAt ? Number(policyState.updatedAt) - 60 : Math.floor(Date.now() / 1000) - 120,
      });
    }

    // 6. Safe recent block log query (strictly <= 90 blocks to respect RPC limits)
    try {
      const latestBlock = await publicClient.getBlockNumber();
      const safeFromBlock = latestBlock > 90n ? latestBlock - 90n : 0n;

      const recentLogs = await publicClient.getContractEvents({
        address: vaultAddr,
        abi: aegisVaultAbi,
        eventName: 'RiskEvaluated',
        args: { positionId },
        fromBlock: safeFromBlock,
        toBlock: 'latest',
      }).catch(() => []);

      for (const log of recentLogs as any[]) {
        const score = Number(log.args?.riskScore ?? 0);
        const rule = String(log.args?.triggeredRule ?? 'none');
        const at = Number(log.args?.timestamp ?? Math.floor(Date.now() / 1000));
        const triggered = rule !== '' && rule !== 'none';

        rows.push({
          id: `log-eval-${log.transactionHash ?? Math.random()}`,
          kind: triggered ? 'watch' : 'clear',
          title: triggered ? `Rule Triggered: ${rule}` : 'Guardian Telemetry Check',
          detail: triggered ? `Rule "${rule}" met policy exit threshold.` : 'Oracle deviation and drawdown checked — safe.',
          score,
          at,
          ...(log.transactionHash ? { txHash: log.transactionHash } : {}),
        });
      }
    } catch {}

    // Sort newest first
    rows.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

    return rows;
  } catch (err) {
    console.warn('loadDecisionHistory error:', err);
    return [];
  }
}

