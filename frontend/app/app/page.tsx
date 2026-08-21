'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { motion, AnimatePresence } from 'motion/react';
import AmbientMarginChart from '@/components/AmbientMarginChart';
import {
  activeChain,
  activeNetwork,
  contracts,
  contractsConfigured,
  explorerAddressUrl,
  explorerTxUrl,
  MAINNET_TOKENS,
  TESTNET_TOKENS,
  TOKENS,
  shortAddress,
} from '@/lib/chain';
import { aegisVaultAbi, emergencyVaultAbi, erc20Abi, policyRegistryAbi } from '@/lib/abis';
import {
  connectWallet,
  describeError,
  ensureCorrectChain,
  getChainId,
  getWalletClient,
  publicClient,
} from '@/lib/wallet';
import { bpsToPercent, parsePolicy, parsePolicyLlm, POLICY_MODES } from '@/lib/policy';
import { loadDecisionHistory } from '@/lib/history';
import { ToastProvider, useToast } from '@/components/toast';
import type { Decision } from '@/components/risk';

interface Position {
  id: bigint;
  asset: Address;
  amount: bigint;
  pausedByAgent: boolean;
  symbol: string;
  decimals: number;
}

export interface EmergencyClaimItem {
  positionId: bigint;
  positionNumber: number;
  claimIndex: bigint;
  asset: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
  formattedAmount: string;
  claimableAt: number;
  claimed: boolean;
  isReady: boolean;
}

interface OnChainPolicy {
  drawdownThresholdBps: number;
  oracleDeviationThresholdBps: number;
  exitPercentBps: number;
  mode: number;
  active: boolean;
  updatedAt: bigint;
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 15, filter: 'blur(3px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function AppPage() {
  return (
    <ToastProvider>
      <AppScreen />
    </ToastProvider>
  );
}

function AppScreen() {
  const { toast } = useToast();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [busy, setBusy] = useState<string>();
  
  const [claims, setClaims] = useState<EmergencyClaimItem[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [onChainPolicy, setOnChainPolicy] = useState<OnChainPolicy>();
  const [history, setHistory] = useState<Decision[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');

  // Policy Writer State
  const [policyText, setPolicyText] = useState('If SPYX drops more than 8%, move 75% to USDC cautiously.');
  const [parsedPolicy, setParsedPolicy] = useState(() => parsePolicy(policyText));

  useEffect(() => {
    // Instant sync update with regex parser
    setParsedPolicy(parsePolicy(policyText));

    // Debounced async call to real Anthropic LLM API route
    const timer = setTimeout(() => {
      void parsePolicyLlm(policyText).then((res) => {
        setParsedPolicy(res);
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [policyText]);

  const ready = contractsConfigured();

  const demoPositions: Position[] = useMemo(() => [], []);

  const demoPolicy: OnChainPolicy = useMemo(() => ({
    drawdownThresholdBps: 800,
    oracleDeviationThresholdBps: 200,
    exitPercentBps: 7500,
    mode: 1,
    active: false,
    updatedAt: 0n,
  }), []);

  const demoHistory: Decision[] = useMemo(() => [], []);

  const activePositions = account ? positions : demoPositions;
  const activeSelectedId = selectedId || (activePositions[0] ? activePositions[0].id.toString() : '');
  const activeSelected = activePositions.find((p) => p.id.toString() === activeSelectedId);
  const activeIndex = activePositions.findIndex((p) => p.id.toString() === activeSelectedId);
  const activePositionNumber = activeIndex !== -1 ? activeIndex + 1 : 1;
  const activePolicy = account ? onChainPolicy : (demoPolicy.active ? demoPolicy : undefined);
  const activeHistory = account ? history : demoHistory;
  
  const latestScore = activeHistory.find((d) => d.score !== undefined)?.score ?? 0;
  const hasScore = latestScore !== undefined;

  const loadPositions = useCallback(async (owner: Address) => {
    if (!ready) return;

    // Reset current position & policy state immediately to avoid stale flash from previous wallet
    setPositions([]);
    setSelectedId('');
    setOnChainPolicy(undefined);
    setHistory([]);
    setClaims([]);

    // Scalable per-wallet position lookup via getLogs on PositionOpened event (filtered by owner topic)
    let targetIds: bigint[] = [];
    try {
      const logs = await publicClient.getLogs({
        address: contracts.vault as Address,
        event: {
          type: 'event',
          name: 'PositionOpened',
          inputs: [
            { name: 'positionId', type: 'uint256', indexed: true },
            { name: 'owner', type: 'address', indexed: true },
            { name: 'asset', type: 'address', indexed: true },
            { name: 'amount', type: 'uint256', indexed: false },
          ],
        },
        args: {
          owner,
        },
        fromBlock: 0n,
      });

      const uniqueIds = new Set<bigint>();
      for (const log of logs) {
        if (log.args.positionId !== undefined) {
          uniqueIds.add(log.args.positionId);
        }
      }
      targetIds = Array.from(uniqueIds);
    } catch {
      // Fallback: scan nextPositionId if log querying fails on certain RPC nodes
      const nextId = (await publicClient.readContract({
        address: contracts.vault as Address,
        abi: aegisVaultAbi,
        functionName: 'nextPositionId',
      })) as bigint;
      for (let id = 1n; id < nextId; id++) {
        targetIds.push(id);
      }
    }

    const found: Position[] = [];
    const userClaims: EmergencyClaimItem[] = [];

    for (const id of targetIds) {
      const [posOwner, asset, amount, pausedByAgent, exists] = (await publicClient.readContract({
        address: contracts.vault as Address,
        abi: aegisVaultAbi,
        functionName: 'positions',
        args: [id],
      })) as readonly [Address, Address, bigint, boolean, boolean];

      if (!exists) continue;
      if (posOwner.toLowerCase() !== owner.toLowerCase()) continue;

      const [decimals, symbol] = await Promise.all([
        publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
        publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'symbol' }).catch(() => 'TOKEN') as Promise<string>,
      ]);

      if (amount > 0n) {
        found.push({ id, asset, amount, pausedByAgent, symbol, decimals: Number(decimals) });
      }

      // Query emergency claims on this position
      if (contracts.emergencyVault) {
        try {
          const count = (await publicClient.readContract({
            address: contracts.emergencyVault as Address,
            abi: emergencyVaultAbi,
            functionName: 'claimCount',
            args: [id],
          })) as bigint;

          for (let i = 0n; i < count; i++) {
            const claim = (await publicClient.readContract({
              address: contracts.emergencyVault as Address,
              abi: emergencyVaultAbi,
              functionName: 'claimsByPosition',
              args: [id, i],
            })) as readonly [Address, Address, bigint, bigint, boolean];

            const [claimOwner, claimAsset, claimAmount, claimableAt, claimed] = claim;
            if (claimOwner.toLowerCase() === owner.toLowerCase()) {
              const isReady = Math.floor(Date.now() / 1000) >= Number(claimableAt);
              userClaims.push({
                positionId: id,
                positionNumber: found.length || 1,
                claimIndex: i,
                asset: claimAsset,
                symbol,
                decimals: Number(decimals),
                amount: claimAmount,
                formattedAmount: (Number(claimAmount) / 10 ** Number(decimals)).toFixed(2),
                claimableAt: Number(claimableAt),
                claimed,
                isReady,
              });
            }
          }
        } catch {}
      }
    }

    setPositions(found);
    setClaims(userClaims);

    if (found.length > 0) {
      setSelectedId(found[0]!.id.toString());
      setPolicyText(`If ${found[0]!.symbol} drops more than 8%, move 75% to USDC cautiously.`);
    }
  }, [ready]);

  const claimEmergencyFunds = async (claimItem: EmergencyClaimItem) => {
    if (!account || !contracts.emergencyVault) return;
    try {
      await ensureCorrectChain();
    } catch {}

    const key = `claim-${claimItem.positionId}-${claimItem.claimIndex}`;
    setBusy(key);
    try {
      const wallet = await getWalletClient(account);
      const hash = await wallet.writeContract({
        account,
        address: contracts.emergencyVault as Address,
        abi: emergencyVaultAbi,
        functionName: 'claim',
        args: [claimItem.positionId, claimItem.claimIndex],
      });
      toast({ kind: 'success', title: 'Claim submitted', description: 'Transaction broadcasted on X Layer.' });
      await publicClient.waitForTransactionReceipt({ hash });
      toast({ kind: 'success', title: 'Funds claimed!', description: `${claimItem.formattedAmount} ${claimItem.symbol} received in your wallet.` });
      await loadPositions(account);
    } catch (err: any) {
      toast({ kind: 'error', title: 'Claim failed', description: describeError(err) });
    } finally {
      setBusy(undefined);
    }
  };

  useEffect(() => {
    if (!activeSelected || !ready) {
      if (account) setOnChainPolicy(undefined);
      if (account) setHistory([]);
      return;
    }
    if (!account) return;

    let cancelled = false;
    const positionId = activeSelected.id;

    void (async () => {
      setLoadingHistory(true);
      try {
        const policy = (await publicClient.readContract({
          address: contracts.policyRegistry as Address,
          abi: policyRegistryAbi,
          functionName: 'getPolicy',
          args: [positionId],
        }).catch(() => undefined)) as OnChainPolicy | undefined;

        const decisions = await loadDecisionHistory(positionId);
        if (cancelled) return;
        setOnChainPolicy(policy);
        setHistory(decisions);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeSelected, ready, account]);

  // Listen for wallet account switches and handle instant state reset
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).ethereum) return;
    const ethereum = (window as any).ethereum;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAccount(undefined);
        setPositions([]);
        setSelectedId('');
        setOnChainPolicy(undefined);
        setHistory([]);
      } else {
        const newAddress = accounts[0] as Address;
        setAccount(newAddress);
        void loadPositions(newAddress);
      }
    };

    ethereum.on?.('accountsChanged', handleAccountsChanged);
    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  }, [loadPositions]);

  const connect = async () => {
    setBusy('connect');
    try {
      toast({ kind: 'info', title: 'Connecting wallet...', description: 'Please approve the connection in OKX Wallet / MetaMask.' });
      const address = await connectWallet();
      await ensureCorrectChain();
      setAccount(address);
      setChainId(await getChainId());
      await loadPositions(address);
      toast({ kind: 'success', title: 'Wallet Connected', description: `Connected to ${address.slice(0, 6)}...${address.slice(-4)}` });
    } catch (err) {
      toast({ kind: 'error', title: 'Connect failed', description: describeError(err) });
    } finally {
      setBusy(undefined);
    }
  };

  const signPolicy = async () => {
    if (!account) {
      toast({ kind: 'error', title: 'Wallet not connected', description: 'Please connect your wallet first.' });
      return;
    }

    if (!activeSelected) {
      toast({
        kind: 'error',
        title: 'No Deposited Position',
        description: 'You must deposit an asset into Aegis Vault first before setting an on-chain risk policy.',
      });
      setShowDepositModal(true);
      return;
    }

    const posId = activeSelected.id;
    setBusy('sign');
    try {
      await ensureCorrectChain();
      toast({ kind: 'info', title: 'Preparing signature', description: `Opening wallet to sign policy for Position #${posId.toString()}...` });
      const wallet = await getWalletClient(account);
      const modeIdx = POLICY_MODES.indexOf(parsedPolicy.mode);
      const args = [
        posId,
        parsedPolicy.drawdownThresholdBps,
        parsedPolicy.oracleDeviationThresholdBps,
        parsedPolicy.exitPercentBps,
        modeIdx === -1 ? 1 : modeIdx,
      ] as const;

      let hash: Address;
      try {
        const { request } = await publicClient.simulateContract({
          account,
          address: contracts.policyRegistry as Address,
          abi: policyRegistryAbi,
          functionName: 'setPolicy',
          args,
        });
        hash = await wallet.writeContract(request);
      } catch (_simErr) {
        // Fallback: direct contract write if RPC simulation fails
        hash = await wallet.writeContract({
          account,
          address: contracts.policyRegistry as Address,
          abi: policyRegistryAbi,
          functionName: 'setPolicy',
          args,
        });
      }

      toast({ kind: 'success', title: 'Policy signed', description: 'Transaction submitted on-chain.' });
      await publicClient.waitForTransactionReceipt({ hash });
      toast({ kind: 'success', title: 'Policy active', description: 'Agent is now enforcing your boundaries.' });
      
      const [policy, decisions] = await Promise.all([
        publicClient.readContract({
          address: contracts.policyRegistry as Address,
          abi: policyRegistryAbi,
          functionName: 'getPolicy',
          args: [posId],
        }).catch(() => undefined) as Promise<OnChainPolicy | undefined>,
        loadDecisionHistory(posId).catch(() => []),
      ]);
      setOnChainPolicy(policy);
      setHistory(decisions);
      setActiveTab('Overview');
    } catch (err) {
      toast({ kind: 'error', title: 'Failed to sign policy', description: describeError(err) });
    } finally {
      setBusy(undefined);
    }
  };

  // Deposit Modal State
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAsset, setDepositAsset] = useState<string>(TOKENS.SPYX.address);
  const [isCustomAsset, setIsCustomAsset] = useState(false);
  const [customAssetAddress, setCustomAssetAddress] = useState('');
  const [depositAmount, setDepositAmount] = useState('1.0');

  // Policy target asset selector state
  const [policyAsset, setPolicyAsset] = useState<string>('SPYX');
  const [isCustomPolicyAsset, setIsCustomPolicyAsset] = useState(false);
  const [customPolicyAssetAddress, setCustomPolicyAssetAddress] = useState('');
  const policyAssetSymbol = isCustomPolicyAsset
    ? (customPolicyAssetAddress ? 'Custom RWA' : '')
    : TOKENS[policyAsset as keyof typeof TOKENS]?.symbol ?? policyAsset;

  const depositPosition = async () => {
    if (!account) {
      toast({ kind: 'error', title: 'Wallet not connected', description: 'Please connect your wallet first.' });
      return;
    }
    
    const targetAsset = isCustomAsset ? customAssetAddress.trim() : depositAsset;
    if (!targetAsset || !targetAsset.startsWith('0x') || targetAsset.length !== 42) {
      toast({ kind: 'error', title: 'Invalid Contract Address', description: 'Please enter a valid 0x ERC20 token address.' });
      return;
    }

    setBusy('deposit');
    try {
      await ensureCorrectChain();
      const wallet = await getWalletClient(account);
      const tokenAddress = targetAsset as Address;

      const [decimals, symbol] = await Promise.all([
        publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
        publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }).catch(() => 'TOKEN') as Promise<string>,
      ]);

      const parsedAmt = parseUnits(depositAmount, Number(decimals));

      const currentAllowance = (await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [account, contracts.vault as Address],
      })) as bigint;

      if (currentAllowance < parsedAmt) {
        toast({ kind: 'info', title: 'Step 1/2: Approval required', description: `Opening wallet to approve Aegis Vault to spend ${symbol}...` });
        let appHash: Address;
        try {
          const { request: appReq } = await publicClient.simulateContract({
            account,
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [contracts.vault as Address, parsedAmt],
          });
          appHash = await wallet.writeContract(appReq);
        } catch (_sim) {
          appHash = await wallet.writeContract({
            account,
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [contracts.vault as Address, parsedAmt],
          });
        }
        toast({ kind: 'info', title: 'Approval submitted', description: 'Waiting for transaction receipt on-chain...' });
        await publicClient.waitForTransactionReceipt({ hash: appHash });
        toast({ kind: 'success', title: 'Approved!', description: 'Proceeding to deposit...' });
      }

      toast({ kind: 'info', title: 'Step 2/2: Opening position', description: `Opening wallet to deposit ${depositAmount} ${symbol} into Aegis Vault...` });
      let depHash: Address;
      try {
        const { request: depReq } = await publicClient.simulateContract({
          account,
          address: contracts.vault as Address,
          abi: aegisVaultAbi,
          functionName: 'openPosition',
          args: [tokenAddress, parsedAmt],
        });
        depHash = await wallet.writeContract(depReq);
      } catch (_sim) {
        depHash = await wallet.writeContract({
          account,
          address: contracts.vault as Address,
          abi: aegisVaultAbi,
          functionName: 'openPosition',
          args: [tokenAddress, parsedAmt],
        });
      }

      toast({ kind: 'info', title: 'Deposit submitted', description: 'Waiting for transaction receipt on-chain...' });
      await publicClient.waitForTransactionReceipt({ hash: depHash });

      toast({ kind: 'success', title: 'Position opened!', description: `Successfully deposited ${depositAmount} ${symbol} into Aegis Vault.` });
      setShowDepositModal(false);
      await loadPositions(account);
    } catch (err) {
      toast({ kind: 'error', title: 'Deposit failed', description: describeError(err) });
    } finally {
      setBusy(undefined);
    }
  };

  // ── Testnet faucet ────────────────────────────────────────────────────────
  const [mintingToken, setMintingToken] = useState<string>();
  const [mintSuccess, setMintSuccess] = useState<{ symbol: string; amount: string; txHash: string } | null>(null);

  const mintTestTokens = async (symbol: keyof typeof TESTNET_TOKENS) => {
    if (!account) {
      toast({ kind: 'error', title: 'Wallet not connected', description: 'Connect your wallet first.' });
      return;
    }
    const token = TESTNET_TOKENS[symbol];
    setMintingToken(symbol);
    try {
      await ensureCorrectChain();
      const wallet = await getWalletClient(account);
      const amount = parseUnits(token.faucetAmount, token.decimals);
      toast({ kind: 'info', title: `Minting ${token.faucetAmount} ${token.symbol}...`, description: 'Approve the transaction in your wallet.' });
      let hash: `0x${string}`;
      try {
        const { request } = await publicClient.simulateContract({
          account,
          address: token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'mint',
          args: [account, amount],
        });
        hash = await wallet.writeContract(request);
      } catch (_simErr) {
        hash = await wallet.writeContract({
          account,
          address: token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'mint',
          args: [account, amount],
        });
      }
      toast({ kind: 'info', title: 'Transaction submitted', description: 'Waiting for on-chain confirmation...' });
      try {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 45_000 });
      } catch (receiptErr) {
        console.warn('Receipt poll warning:', receiptErr);
      }
      setMintSuccess({ symbol: token.symbol, amount: token.faucetAmount, txHash: hash });
      toast({
        kind: 'success',
        title: `${token.faucetAmount} ${token.symbol} successfully minted`,
        description: 'Tokens are now in your wallet. You can now deposit them into Aegis Vault.',
      });
    } catch (err) {
      toast({ kind: 'error', title: 'Mint failed', description: describeError(err) });
    } finally {
      setMintingToken(undefined);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  const withdrawPosition = async (positionId: bigint) => {
    if (!account) return;
    setBusy(`withdraw-${positionId.toString()}`);
    try {
      await ensureCorrectChain();
      const wallet = await getWalletClient(account);
      const pos = positions.find((p) => p.id === positionId);
      const amountToWithdraw = pos ? pos.amount : 0n;
      const { request } = await publicClient.simulateContract({
        account,
        address: contracts.vault as Address,
        abi: aegisVaultAbi,
        functionName: 'withdraw',
        args: [positionId, amountToWithdraw],
      });
      const hash = await wallet.writeContract(request);
      toast({ kind: 'info', title: 'Withdrawal initiated', description: 'Transaction submitted' });
      await publicClient.waitForTransactionReceipt({ hash });
      toast({ kind: 'success', title: 'Withdrawn!', description: 'Position withdrawn back to your wallet.' });
      await loadPositions(account);
    } catch (err) {
      toast({ kind: 'error', title: 'Withdrawal failed', description: describeError(err) });
    } finally {
      setBusy(undefined);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ background: '#0e211c', minHeight: '100vh', color: 'var(--white)', position: 'relative' }}>
      <AmbientMarginChart />
      <section className="app" id="app" style={{ paddingTop: '40px', position: 'relative', zIndex: 1 }}>
        <div className="wrap">
          <div className="appgrid">
            <motion.aside 
              className="sidebar"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link className="sbrand" href="/" style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'var(--white)' }}>
                <span className="mark"></span>
                Aegis
              </Link>
              
              {[...['Overview', 'Positions', 'Emergency Claims', 'Policies', 'Activity', 'Contracts'], ...(activeNetwork === 'testnet' ? ['Faucet'] : [])].map((tab) => {
                const isActive = activeTab === tab;
                const isFaucet = tab === 'Faucet';
                const isEmergency = tab === 'Emergency Claims';
                const unclaimedCount = claims.filter(c => !c.claimed).length;

                return (
                  <motion.div 
                    key={tab}
                    className={`navitem ${isActive ? 'active' : ''}`} 
                    onClick={() => setActiveTab(tab)}
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.18 }}
                    style={isFaucet ? { marginTop: '8px', borderTop: '1px solid rgba(79,224,168,0.12)', paddingTop: '8px' } : {}}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeSidebarPill"
                        className="active-pill-bg"
                        transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
                      />
                    )}
                    <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span>{tab}</span>
                      {isEmergency && unclaimedCount > 0 && (
                        <span style={{
                          background: '#ff5442',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 700,
                          borderRadius: '999px',
                          padding: '1px 6px',
                          fontFamily: 'var(--mono)'
                        }}>
                          {unclaimedCount}
                        </span>
                      )}
                    </span>
                  </motion.div>
                );
              })}

              <div className="sidefoot">
                <div style={{ font: '600 10px var(--mono)', color: 'var(--mint)' }}>CONTROL ROOM MODE</div>
              </div>
            </motion.aside>
            
            <div className="mainapp">
              <div className="mobile-nav-bar">
                {[...['Overview', 'Positions', 'Emergency Claims', 'Policies', 'Activity', 'Contracts'], ...(activeNetwork === 'testnet' ? ['Faucet'] : [])].map((tab) => {
                  const isEmergency = tab === 'Emergency Claims';
                  const unclaimedCount = claims.filter(c => !c.claimed).length;
                  return (
                    <button
                      key={tab}
                      className={`mobile-nav-tab ${activeTab === tab ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {tab}{isEmergency && unclaimedCount > 0 ? ` (${unclaimedCount})` : ''}
                    </button>
                  );
                })}
              </div>
              <Reveal delay={0.2} className="apptop">
                <div>
                  <h3>Guardian {activeTab.toLowerCase()}</h3>
                  <div style={{ font: '400 11px var(--mono)', color: '#4d7a6a', marginTop: '3px' }}>
                    CONTROL ROOM · ON-CHAIN AGENT MONITORING
                  </div>
                </div>
                {account ? (
                  <span className="walletpill">{shortAddress(account)} · connected</span>
                ) : (
                  <motion.button 
                    onClick={connect} 
                    disabled={busy === 'connect'} 
                    className="btn-primary" 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {busy === 'connect' ? <span className="spinner"></span> : 'Connect Wallet'}
                  </motion.button>
                )}
              </Reveal>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {activeTab === 'Overview' && (
                    <>
                      {claims.filter(c => !c.claimed).length > 0 && (
                        <div style={{
                          background: 'linear-gradient(135deg, rgba(231, 76, 60, 0.14) 0%, rgba(230, 126, 34, 0.08) 100%)',
                          border: '1px solid rgba(231, 76, 60, 0.45)',
                          borderRadius: '16px',
                          padding: '18px 22px',
                          marginBottom: '20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '16px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '10px',
                              background: 'rgba(231, 76, 60, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '20px'
                            }}>
                              🚨
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h4 style={{ margin: 0, color: '#ff8575', fontSize: '15px', fontWeight: 600 }}>
                                  Emergency Protection Active
                                </h4>
                                <span style={{
                                  background: 'rgba(231, 76, 60, 0.25)',
                                  color: '#ff9d91',
                                  fontSize: '10px',
                                  fontFamily: 'var(--mono)',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '4px'
                                }}>
                                  {claims.filter(c => !c.claimed).length} CLAIM IN EMERGENCY VAULT
                                </span>
                              </div>
                              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#b2c8bf' }}>
                                Guardian executed risk policy exit: <b>{claims.filter(c => !c.claimed).map(c => `${c.formattedAmount} ${c.symbol}`).join(', ')}</b> secured in EmergencyVault.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setActiveTab('Emergency Claims')}
                            className="btn-primary"
                            style={{
                              background: '#ff5442',
                              borderColor: '#ff5442',
                              color: '#fff',
                              padding: '9px 18px',
                              fontSize: '13px',
                              borderRadius: '8px',
                              cursor: 'pointer'
                            }}
                          >
                            View & Claim in Emergency Vault ↗
                          </button>
                        </div>
                      )}

                      <div className="appcards">
                        <div className="appcard light">
                          <h4>Protected balance</h4>
                          <div className="balance">
                            <motion.span
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.5 }}
                            >
                              {activeSelected ? formatUnits(activeSelected.amount, activeSelected.decimals) : "$0.00"}
                            </motion.span>
                          </div>
                          <div className="sub">{activePositions.length} position{activePositions.length !== 1 ? 's' : ''} active</div>
                          
                          {/* Animated Radial Gauge */}
                          <div className="gauge-wrap">
                            <svg className="gauge-svg" viewBox="0 0 100 100">
                              <circle className="gauge-bg" cx="50" cy="50" r="40" style={{ stroke: 'rgba(16,35,30,0.12)' }} />
                              <circle 
                                className="gauge-fill" 
                                cx="50" 
                                cy="50" 
                                r="40"
                                strokeDasharray={251.2}
                                strokeDashoffset={251.2 - (251.2 * Math.min(100, latestScore)) / 100}
                                style={{ stroke: '#173b31' }}
                              />
                            </svg>
                            <div className="gauge-val" style={{ color: '#173b31' }}>
                              {latestScore}
                              <small style={{ color: '#52625b' }}>Risk</small>
                            </div>
                          </div>
                          <div className="sub" style={{ textAlign: 'center', color: '#4f5f58' }}>Current risk score <b style={{ color: '#173b31' }}>{latestScore} / 100</b> (Low Risk)</div>
                        </div>
                        
                        <div className="appcard dark">
                          <h4>Guardian state</h4>
                          <div className="guardstate">
                            <span className="guarddot live" /> 
                            {activeSelected?.pausedByAgent ? 'PAUSED BY GUARDIAN' : 'WATCHING · ENFORCING BOUNDARIES'}
                          </div>
                          <div className="guardlabel">
                            {activeSelected?.pausedByAgent ? 'Action taken.' : 'Watching, not touching.'}
                          </div>
                          <div className="sub" style={{ marginTop: '12px' }}>
                            {loadingHistory ? 'Syncing chain telemetry...' : `Last verified ${activeHistory.length > 0 ? 'recently on-chain' : 'never'}`}
                          </div>
                        </div>
                      </div>

                      {/* Active Position & Policy Card */}
                      {(() => {
                        if (!activeSelected) {
                          return (
                            <div className="active-policy-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
                              <div style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '50%',
                                background: 'rgba(16, 35, 30, 0.06)',
                                color: '#173b31',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 14px auto',
                                fontSize: '20px'
                              }}>
                                🛡️
                              </div>
                              <h3 style={{
                                margin: 0,
                                font: '600 20px var(--display)',
                                color: '#10231e',
                                letterSpacing: '-0.01em'
                              }}>
                                No Active Position Selected
                              </h3>
                              <p style={{
                                font: '400 13px var(--sans)',
                                color: '#52625b',
                                margin: '8px auto 20px auto',
                                maxWidth: '440px',
                                lineHeight: '1.5'
                              }}>
                                {account
                                  ? 'You have not deposited any assets into Aegis Vault yet. Deposit GLDX, SPYX, or USDC to set an automated risk policy.'
                                  : 'Connect your wallet to view or deposit protected positions on X Layer.'}
                              </p>
                              {account ? (
                                <button
                                  onClick={() => setShowDepositModal(true)}
                                  className="btn-primary"
                                  style={{ padding: '9px 20px', fontSize: '13px', borderRadius: '8px' }}
                                >
                                  + Deposit New Position
                                </button>
                              ) : (
                                <button
                                  onClick={connect}
                                  disabled={busy === 'connect'}
                                  className="btn-primary"
                                  style={{ padding: '9px 20px', fontSize: '13px', borderRadius: '8px' }}
                                >
                                  Connect Wallet
                                </button>
                              )}
                            </div>
                          );
                        }

                        if (!activePolicy || !activePolicy.active) {
                          return (
                            <div className="active-policy-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
                              <h3 style={{
                                margin: 0,
                                font: '600 20px var(--display)',
                                color: '#10231e'
                              }}>
                                No Policy Set for Position #{activePositionNumber} ({activeSelected.symbol})
                              </h3>
                              <p style={{
                                font: '400 13px var(--sans)',
                                color: '#52625b',
                                margin: '8px 0 20px 0'
                              }}>
                                This position is deposited, but has no active risk enforcement policy. Configure drawdown and deviation thresholds to enable Guardian protection.
                              </p>
                              <button
                                onClick={() => setActiveTab('Policies')}
                                className="btn-primary"
                                style={{ padding: '9px 20px', fontSize: '13px', borderRadius: '8px' }}
                              >
                                Configure Risk Policy →
                              </button>
                            </div>
                          );
                        }

                        const symbol = activeSelected.symbol;
                        const drawdown = bpsToPercent(activePolicy.drawdownThresholdBps);
                        const oracleDev = bpsToPercent(activePolicy.oracleDeviationThresholdBps);
                        const exitSize = bpsToPercent(activePolicy.exitPercentBps);
                        const route = '→ USDC VAULT';

                        return (
                          <div className="active-policy-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h3 style={{
                                margin: 0,
                                font: '600 24px var(--display)',
                                color: '#10231e',
                                letterSpacing: '-0.02em'
                              }}>
                                Active policy · Position #{activePositionNumber} ({symbol})
                              </h3>

                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: '#e2f7ed',
                                color: '#2d6b56',
                                border: '1px solid rgba(79, 224, 168, 0.4)',
                                padding: '5px 12px',
                                borderRadius: '999px',
                                font: '600 11px var(--mono)',
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2d6b56' }} />
                                POLICY HEALTHY
                              </div>
                            </div>

                            <div className="stat-tile-grid">
                              <div className="stat-tile">
                                <small style={{ font: '500 10px var(--mono)', color: '#7a8f87', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
                                  DRAWDOWN
                                </small>
                                <div style={{ font: '600 20px var(--mono)', color: '#10231e' }}>
                                  {drawdown}
                                </div>
                              </div>

                              <div className="stat-tile">
                                <small style={{ font: '500 10px var(--mono)', color: '#7a8f87', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
                                  ORACLE DEVIATION
                                </small>
                                <div style={{ font: '600 20px var(--mono)', color: '#10231e' }}>
                                  {oracleDev}
                                </div>
                              </div>

                              <div className="stat-tile">
                                <small style={{ font: '500 10px var(--mono)', color: '#7a8f87', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
                                  APPROVED EXIT
                                </small>
                                <div style={{ font: '600 20px var(--mono)', color: '#10231e' }}>
                                  {exitSize}
                                </div>
                              </div>

                              <div className="stat-tile">
                                <small style={{ font: '500 10px var(--mono)', color: '#7a8f87', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
                                  ROUTE
                                </small>
                                <div style={{ font: '600 16px var(--mono)', color: '#10231e', whiteSpace: 'nowrap' }}>
                                  {route}
                                </div>
                              </div>
                            </div>

                            {/* Sparkline Chart */}
                            <div className="sparkwrap" style={{ marginTop: '20px' }}>
                              <svg viewBox="0 0 400 60" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="spark-grad-light" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#173b31" stopOpacity="0.25" />
                                    <stop offset="100%" stopColor="#173b31" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                <line x1="0" y1="48" x2="400" y2="48" stroke="#f47c6c" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8" />
                                <path d="M0,15 Q50,22 100,12 T200,28 T300,18 T400,22 L400,60 L0,60 Z" fill="url(#spark-grad-light)" />
                                <path d="M0,15 Q50,22 100,12 T200,28 T300,18 T400,22" stroke="#173b31" strokeWidth="2" fill="none" />
                                <circle cx="400" cy="22" r="3.5" fill="#173b31">
                                  <animate attributeName="r" values="3.5;5.5;3.5" dur="2s" repeatCount="indefinite" />
                                </circle>
                              </svg>
                            </div>
                            <div className="spark-labels">
                              <span style={{ color: '#68766f' }}>-12h (Oracle base)</span>
                              <span style={{ color: '#d9534f' }}>── {drawdown} Max Drawdown Threshold</span>
                              <span style={{ color: '#173b31', fontWeight: 600 }}>Current: 0.00% (Safe)</span>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="activity" style={{ marginTop: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                          <h4 style={{ margin: 0 }}>
                            <span className="act-live" /> Recent verification events
                          </h4>
                          {loadingHistory ? (
                            <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
                          ) : (
                            <span style={{ font: '400 10px var(--mono)', color: '#4d7a6a' }}>Live feed active</span>
                          )}
                        </div>
                        
                        {/* Ongoing pulse checking line */}
                        <div className="checking-row">
                          <span className="spinner" style={{ width: '8px', height: '8px', borderWidth: '1.5px', borderColor: 'rgba(79,224,168,0.3)', borderTopColor: 'var(--mint)' }} />
                          <span>Guardian checking oracle deviation across X Layer block telemetry...</span>
                        </div>

                        {activeHistory.length > 0 ? activeHistory.map((event, i) => (
                          <motion.div 
                            key={event.id} 
                            className="event"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.35, delay: i * 0.08 }}
                          >
                            <span>{event.at ? formatTime(event.at) : 'Just now'}</span>
                            <div>
                              <div className="event-title">{event.title}</div>
                              {event.detail && <div className="event-detail">{event.detail}</div>}
                            </div>
                            <div className={`status ${event.kind}`}>
                              {event.kind === 'clear' ? 'CLEAR' : event.kind.toUpperCase()}
                            </div>
                          </motion.div>
                        )) : (
                          <div style={{ fontSize: '12px', color: '#78968b', padding: '13px 0' }}>No history recorded yet.</div>
                        )}
                      </div>
                    </>
                  )}

                  {activeTab === 'Positions' && (
                    <div className="appcards" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {/* Position Management Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <div>
                          <h4 style={{ margin: 0 }}>Protected Vault Positions</h4>
                          <span style={{ fontSize: '12px', color: '#7a9b90' }}>Deposit RWA positions into Aegis Vault or withdraw to your wallet anytime.</span>
                        </div>
                        <motion.button
                          onClick={() => setShowDepositModal(true)}
                          className="btn-primary"
                          style={{ padding: '8px 16px', fontSize: '13px' }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          + Deposit New Position
                        </motion.button>
                      </div>

                      {activePositions.length > 0 ? activePositions.map((pos, idx) => (
                        <div 
                          key={pos.id.toString()} 
                          className="appcard" 
                          style={{ cursor: 'pointer', border: pos.id.toString() === selectedId ? '1px solid var(--mint)' : '' }}
                          onClick={() => {
                            setSelectedId(pos.id.toString());
                            setPolicyText(`If ${pos.symbol} drops more than 8%, move 75% to USDC cautiously.`);
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <h4>Position #{idx + 1} · {pos.symbol}</h4>
                              <div className="balance" style={{ fontSize: '24px', marginTop: '4px' }}>{formatUnits(pos.amount, pos.decimals)}</div>
                              <div className="sub" style={{ marginTop: '6px', color: pos.pausedByAgent ? '#e74c3c' : 'var(--mint)' }}>
                                {pos.pausedByAgent ? 'PAUSED BY GUARDIAN' : 'ACTIVE · PROTECTED'}
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <motion.button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(pos.id.toString());
                                  setPolicyText(`If ${pos.symbol} drops more than 8%, move 75% to USDC cautiously.`);
                                  setActiveTab('Policies');
                                }}
                                className="mono"
                                style={{
                                  background: 'rgba(79, 224, 168, 0.12)',
                                  color: 'var(--mint)',
                                  border: '1px solid rgba(79, 224, 168, 0.3)',
                                  padding: '8px 14px',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                              >
                                📜 Policy
                              </motion.button>

                              <motion.button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void withdrawPosition(pos.id);
                                }}
                                disabled={busy === `withdraw-${pos.id.toString()}` || !account}
                                className="mono"
                                style={{
                                  background: 'rgba(231,76,60,0.12)',
                                  color: '#f47c6c',
                                  border: '1px solid rgba(231,76,60,0.3)',
                                  padding: '8px 14px',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                              >
                                {busy === `withdraw-${pos.id.toString()}` ? <span className="spinner" /> : 'Withdraw All'}
                              </motion.button>
                            </div>
                          </div>

                          {/* Position Emergency Claim Notice if any */}
                          {claims.filter(c => c.positionId === pos.id && !c.claimed).length > 0 && (
                            <div style={{
                              marginTop: '14px',
                              paddingTop: '12px',
                              borderTop: '1px solid rgba(231, 76, 60, 0.2)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '8px'
                            }}>
                              <span style={{ fontSize: '12px', color: '#ff8e80' }}>
                                🚨 {claims.filter(c => c.positionId === pos.id && !c.claimed).map(c => `${c.formattedAmount} ${c.symbol}`).join(', ')} protected in EmergencyVault
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveTab('Emergency Claims');
                                }}
                                style={{
                                  background: 'rgba(231, 76, 60, 0.2)',
                                  border: '1px solid rgba(231, 76, 60, 0.4)',
                                  color: '#ff8e80',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  fontFamily: 'var(--mono)'
                                }}
                              >
                                Claim in Vault ↗
                              </button>
                            </div>
                          )}
                        </div>
                      )) : (
                        <div className="appcard" style={{ textAlign: 'center', padding: '30px 20px' }}>
                          <div style={{ fontSize: '15px', color: '#a0b3ab', marginBottom: '12px' }}>No active positions found in vault.</div>
                          <motion.button
                            onClick={() => setShowDepositModal(true)}
                            className="btn-primary"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Deposit First Position
                          </motion.button>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'Emergency Claims' && (
                    <div className="appcard-full">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '20px', color: 'var(--white)' }}>
                            Emergency Vault Claims
                          </h4>
                          <div style={{ fontSize: '13px', color: '#7a9b90', marginTop: '6px' }}>
                            Non-custodial timelocked security vault on X Layer Testnet
                          </div>
                        </div>
                        <div style={{
                          background: 'rgba(79, 224, 168, 0.08)',
                          border: '1px solid rgba(79, 224, 168, 0.25)',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          fontSize: '12px',
                          color: 'var(--mint)',
                          fontFamily: 'var(--mono)'
                        }}>
                          Contract: {shortAddress(contracts.emergencyVault)}
                        </div>
                      </div>

                      <div style={{
                        background: 'rgba(16, 35, 30, 0.4)',
                        border: '1px solid rgba(79, 224, 168, 0.15)',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginBottom: '24px',
                        fontSize: '13px',
                        color: '#95b3a6',
                        lineHeight: '1.6'
                      }}>
                        <b style={{ color: 'var(--white)' }}>Non-Custodial Guarantee:</b> When an automated risk policy triggers an emergency exit, the Guardian agent routes your assets into <code style={{ color: 'var(--mint)' }}>EmergencyVault.sol</code>. Neither the agent nor any admin can withdraw or touch these funds — <b>only your connected wallet</b> ({account ? shortAddress(account) : 'owner'}) can execute the final claim.
                      </div>

                      {claims.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          {claims.map((claim) => {
                            const isBusyClaiming = busy === `claim-${claim.positionId}-${claim.claimIndex}`;
                            return (
                              <div
                                key={`${claim.positionId}-${claim.claimIndex}`}
                                style={{
                                  background: claim.claimed ? 'rgba(255,255,255,0.02)' : 'rgba(231, 76, 60, 0.06)',
                                  border: claim.claimed ? '1px solid rgba(255,255,255,0.08)' : claim.isReady ? '1px solid rgba(79, 224, 168, 0.5)' : '1px solid rgba(231, 76, 60, 0.3)',
                                  borderRadius: '14px',
                                  padding: '20px 24px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  gap: '16px'
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--mono)' }}>
                                      {claim.formattedAmount} {claim.symbol}
                                    </span>
                                    <span
                                      style={{
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontFamily: 'var(--mono)',
                                        fontWeight: 700,
                                        background: claim.claimed ? 'rgba(255,255,255,0.1)' : claim.isReady ? 'rgba(79, 224, 168, 0.2)' : 'rgba(231, 76, 60, 0.2)',
                                        color: claim.claimed ? '#a0b3ab' : claim.isReady ? 'var(--mint)' : '#ff8e80'
                                      }}
                                    >
                                      {claim.claimed ? 'CLAIMED ✅' : claim.isReady ? 'READY TO CLAIM 🟢' : 'TIMELOCKED ⏳'}
                                    </span>
                                  </div>

                                  <div style={{ fontSize: '12px', color: '#7a9b90', marginTop: '6px' }}>
                                    Routed from Position #{claim.positionNumber} (ID: {claim.positionId.toString()})
                                  </div>

                                  <div style={{ fontSize: '11px', color: '#5e7a70', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                                    {claim.claimed ? (
                                      'Claim confirmed on-chain'
                                    ) : claim.isReady ? (
                                      'Security timelock expired — available for immediate withdrawal'
                                    ) : (
                                      `Unlocks: ${new Date(claim.claimableAt * 1000).toLocaleString()} (${Math.max(0, Math.ceil((claim.claimableAt - Math.floor(Date.now() / 1000)) / 3600))}h remaining)`
                                    )}
                                  </div>
                                </div>

                                <div>
                                  {claim.claimed ? (
                                    <button
                                      disabled
                                      style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#6e857c',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        padding: '10px 18px',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        cursor: 'not-allowed'
                                      }}
                                    >
                                      Claimed ✓
                                    </button>
                                  ) : (
                                    <motion.button
                                      onClick={() => claimEmergencyFunds(claim)}
                                      disabled={isBusyClaiming || !claim.isReady}
                                      className="btn-primary"
                                      whileHover={claim.isReady ? { scale: 1.03 } : {}}
                                      whileTap={claim.isReady ? { scale: 0.97 } : {}}
                                      style={
                                        !claim.isReady
                                          ? {
                                              background: 'rgba(231, 76, 60, 0.15)',
                                              borderColor: 'rgba(231, 76, 60, 0.3)',
                                              color: '#ff8e80',
                                              cursor: 'not-allowed',
                                              opacity: 0.8,
                                              padding: '10px 18px',
                                              fontSize: '13px'
                                            }
                                          : {
                                              padding: '10px 20px',
                                              fontSize: '13px'
                                            }
                                      }
                                    >
                                      {isBusyClaiming ? (
                                        <span className="spinner" />
                                      ) : claim.isReady ? (
                                        `Claim ${claim.formattedAmount} ${claim.symbol}`
                                      ) : (
                                        `Locked (24h Window)`
                                      )}
                                    </motion.button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#7a9b90' }}>
                          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛡️</div>
                          <div style={{ fontSize: '15px', color: 'var(--white)', fontWeight: 600 }}>No Emergency Claims Active</div>
                          <div style={{ fontSize: '13px', marginTop: '6px', maxWidth: '420px', margin: '6px auto 0 auto' }}>
                            When a risk condition breaches your signed policy, the Guardian agent routes protected portions directly here.
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <a
                          href={explorerAddressUrl(contracts.emergencyVault)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--mint)', textDecoration: 'none', fontSize: '12px', fontFamily: 'var(--mono)' }}
                        >
                          View EmergencyVault Contract on OKLink Explorer ↗
                        </a>
                        <button
                          onClick={() => account && loadPositions(account)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#7a9b90',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontFamily: 'var(--mono)'
                          }}
                        >
                          ↻ Refresh Claims
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'Policies' && (
                    <div className="appcard-full">
                      {activePolicy?.active && (
                        <div style={{
                          marginBottom: '20px',
                          padding: '16px',
                          borderRadius: '12px',
                          background: 'rgba(79, 224, 168, 0.05)',
                          border: '1px solid rgba(79, 224, 168, 0.25)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="act-live" />
                              <h5 style={{ margin: 0, font: '600 14px var(--sans)', color: 'var(--white)' }}>
                                Active Enforced On-Chain Policy · Position #{activePositionNumber} {activeSelected ? `(${activeSelected.symbol})` : ''}
                              </h5>
                            </div>
                            <span style={{ font: '500 10px var(--mono)', color: 'var(--mint)', background: 'rgba(79,224,168,0.15)', padding: '3px 8px', borderRadius: '4px' }}>
                              SIGNED & ACTIVE
                            </span>
                          </div>
                          
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', fontSize: '13px', margin: '12px 0' }}>
                            <div><span style={{ color: '#7a9b90', display: 'block', fontSize: '11px', fontFamily: 'var(--mono)' }}>DRAWDOWN LIMIT</span> <b>{bpsToPercent(activePolicy.drawdownThresholdBps)}</b></div>
                            <div><span style={{ color: '#7a9b90', display: 'block', fontSize: '11px', fontFamily: 'var(--mono)' }}>ORACLE DEVIATION</span> <b>{bpsToPercent(activePolicy.oracleDeviationThresholdBps)}</b></div>
                            <div><span style={{ color: '#7a9b90', display: 'block', fontSize: '11px', fontFamily: 'var(--mono)' }}>EXIT PORTION</span> <b>{bpsToPercent(activePolicy.exitPercentBps)}</b></div>
                            <div><span style={{ color: '#7a9b90', display: 'block', fontSize: '11px', fontFamily: 'var(--mono)' }}>MODE</span> <b style={{ color: 'var(--mint)' }}>{activePolicy.mode === 0 ? 'CONSERVATIVE' : activePolicy.mode === 1 ? 'BALANCED' : 'AGGRESSIVE'}</b></div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <button
                              onClick={() => {
                                const modeStr = activePolicy.mode === 0 ? 'conservatively' : activePolicy.mode === 1 ? 'balanced' : 'aggressively';
                                setPolicyText(`If ${activeSelected?.symbol || 'asset'} drops more than ${bpsToPercent(activePolicy.drawdownThresholdBps)}, move ${bpsToPercent(activePolicy.exitPercentBps)} to USDC ${modeStr}.`);
                                toast({ kind: 'info', title: 'Loaded active policy', description: 'Modify text below and click Sign to update on-chain.' });
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid rgba(79, 224, 168, 0.4)',
                                color: 'var(--mint)',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontFamily: 'var(--sans)',
                                fontWeight: 500
                              }}
                            >
                              ✏️ Edit & Re-Sign Policy
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Position Selector or Deposit Warning */}
                      {account && positions.length === 0 && (
                        <div style={{
                          marginBottom: '20px',
                          padding: '16px 20px',
                          borderRadius: '12px',
                          background: 'rgba(255, 180, 50, 0.08)',
                          border: '1px solid rgba(255, 180, 50, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                          flexWrap: 'wrap'
                        }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f39c12', fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                              ⚠️ No Open Vault Position Found
                            </div>
                            <p style={{ margin: 0, fontSize: '13px', color: '#c8a060', lineHeight: '1.5' }}>
                              A policy is signed on-chain for a specific deposited position. Mint tokens from the Faucet and deposit them into Aegis Vault first.
                            </p>
                          </div>
                          <button
                            onClick={() => setShowDepositModal(true)}
                            className="btn-primary"
                            style={{ padding: '8px 16px', fontSize: '13px', whiteSpace: 'nowrap' }}
                          >
                            + Deposit Position First
                          </button>
                        </div>
                      )}

                      {account && positions.length > 0 && (
                        <div style={{
                          marginBottom: '20px',
                          padding: '14px 18px',
                          borderRadius: '12px',
                          background: 'rgba(79, 224, 168, 0.08)',
                          border: '1px solid rgba(79, 224, 168, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}>
                          <div>
                            <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--mint)', textTransform: 'uppercase', marginBottom: '4px' }}>
                              Target Position to Protect
                            </div>
                            <div style={{ fontSize: '13px', color: '#a0b8b0' }}>
                              Selecting: <b>Position #{activePositionNumber}</b> ({activeSelected ? formatUnits(activeSelected.amount, activeSelected.decimals) : ''} {activeSelected?.symbol})
                            </div>
                          </div>
                          <select
                            value={activeSelectedId}
                            onChange={(e) => {
                              setSelectedId(e.target.value);
                              const pos = positions.find(p => p.id.toString() === e.target.value);
                              if (pos) {
                                setPolicyText(`If ${pos.symbol} drops more than 8%, move 75% to USDC cautiously.`);
                              }
                            }}
                            style={{
                              background: '#10231e',
                              border: '1px solid rgba(79, 224, 168, 0.4)',
                              color: 'var(--mint)',
                              padding: '8px 14px',
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontFamily: 'var(--mono)',
                              outline: 'none'
                            }}
                          >
                            {positions.map((p, idx) => (
                              <option key={p.id.toString()} value={p.id.toString()}>
                                Position #{idx + 1} · {formatUnits(p.amount, p.decimals)} {p.symbol}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h4 style={{ margin: 0 }}>
                            {activePolicy?.active ? 'Update / Re-Sign Policy' : 'Write New Policy'}{activeSelected ? ` for Position #${activePositionNumber} (${activeSelected.symbol})` : ''}
                          </h4>
                          <span style={{ fontSize: '12px', color: '#7a9b90' }}>
                            Describe emergency risk thresholds in plain English or select presets:
                          </span>
                        </div>
                      </div>
                      
                      <p style={{ fontSize: '13px', color: '#7a9b90', margin: '0 0 16px' }}>
                        Describe emergency guardrails in plain English. Aegis extracts exact BPS thresholds deterministically without giving away custody.
                      </p>
                      
                      <textarea 
                        value={policyText}
                        onChange={e => setPolicyText(e.target.value)}
                        placeholder="e.g. If SPYX drops more than 8%, move 75% to USDC cautiously."
                        style={{
                          width: '100%', height: '90px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(79,224,168,0.2)',
                          color: 'var(--white)', padding: '14px', borderRadius: '12px', fontSize: '15px',
                          fontFamily: 'var(--sans)', resize: 'none', outline: 'none'
                        }}
                      />
                      
                      <div className="parse-preview">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div style={{ font: '500 10px var(--mono)', textTransform: 'uppercase', letterSpacing: '.1em', color: '#5a7a70' }}>
                            STRUCTURED PARSER PREVIEW
                          </div>
                          <span className="mono" style={{ 
                            fontSize: '11px', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            background: parsedPolicy.source === 'llm' ? 'rgba(79,224,168,0.15)' : 'rgba(255,255,255,0.06)',
                            color: parsedPolicy.source === 'llm' ? 'var(--mint)' : '#8ba097',
                            border: parsedPolicy.source === 'llm' ? '1px solid rgba(79,224,168,0.3)' : '1px solid rgba(255,255,255,0.1)'
                          }}>
                            {parsedPolicy.source === 'llm' ? '🤖 Aegis Bot' : '⚡ Instant Regex Fallback'}
                          </span>
                        </div>
                        <div className="parse-row">
                          <span>Detected Drawdown Threshold</span>
                          <b>{bpsToPercent(parsedPolicy.drawdownThresholdBps)} ({parsedPolicy.drawdownThresholdBps} BPS)</b>
                        </div>
                        <div className="parse-row">
                          <span>Detected Oracle Deviation</span>
                          <b>{bpsToPercent(parsedPolicy.oracleDeviationThresholdBps)} ({parsedPolicy.oracleDeviationThresholdBps} BPS)</b>
                        </div>
                        <div className="parse-row">
                          <span>Detected Route Exit Size</span>
                          <b>{bpsToPercent(parsedPolicy.exitPercentBps)} ({parsedPolicy.exitPercentBps} BPS)</b>
                        </div>
                        <div className="parse-row">
                          <span>Detected Execution Mode</span>
                          <b className={parsedPolicy.mode.toLowerCase()}>{parsedPolicy.mode.toUpperCase()}</b>
                        </div>

                        {parsedPolicy.warnings.length > 0 && (
                          <div className="policy-warning">
                            {parsedPolicy.warnings.map((w, idx) => <div key={idx}>• {w}</div>)}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                        <motion.button 
                          onClick={account ? (positions.length > 0 ? signPolicy : () => setShowDepositModal(true)) : connect} 
                          disabled={busy === 'sign' || busy === 'connect'} 
                          className="btn-primary btn-primary-full"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {busy === 'sign' || busy === 'connect' ? (
                            <span className="spinner" style={{ borderColor: 'var(--ink)' }} />
                          ) : !account ? (
                            'Connect Wallet'
                          ) : positions.length === 0 ? (
                            '+ Deposit Position to Enable Policy'
                          ) : (
                            `Sign Policy for Position #${activePositionNumber} (${activeSelected?.symbol})`
                          )}
                        </motion.button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'Activity' && (
                    <div className="activity">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                          <h4 style={{ margin: 0 }}>On-Chain Activity & Guardian Audit Trail</h4>
                          <span style={{ fontSize: '12px', color: '#7a9b90' }}>
                            {activeSelected ? `Showing verifiable events for Position #${activePositionNumber} (${activeSelected.symbol})` : 'Recent on-chain events'}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            if (activeSelected) {
                              setLoadingHistory(true);
                              try {
                                const decisions = await loadDecisionHistory(activeSelected.id);
                                setHistory(decisions);
                              } finally {
                                setLoadingHistory(false);
                              }
                            }
                          }}
                          disabled={loadingHistory || !activeSelected}
                          style={{
                            background: 'rgba(79, 224, 168, 0.1)',
                            border: '1px solid rgba(79, 224, 168, 0.3)',
                            color: 'var(--mint)',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontFamily: 'var(--mono)'
                          }}
                        >
                          {loadingHistory ? <span className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1.5px' }} /> : '↻ Refresh'}
                        </button>
                      </div>
                      
                      {activeHistory.length > 0 ? activeHistory.map((event, i) => (
                        <div key={event.id} className="event" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                          <span style={{ minWidth: '70px', fontSize: '11px', color: '#5e7a70', fontFamily: 'var(--mono)' }}>
                            {event.at ? formatTime(event.at) : 'Just now'}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div className="event-title" style={{ fontWeight: 600, color: 'var(--white)', fontSize: '14px' }}>
                              {event.title}
                            </div>
                            {event.detail && (
                              <div className="event-detail" style={{ fontSize: '12px', color: '#7a9b90', marginTop: '3px', lineHeight: '1.4' }}>
                                {event.detail}
                              </div>
                            )}
                            {event.txHash && (
                              <div style={{ marginTop: '4px' }}>
                                <a
                                  href={explorerTxUrl(event.txHash)}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: 'var(--mint)', fontSize: '11px', fontFamily: 'var(--mono)', textDecoration: 'none' }}
                                >
                                  View TX ↗
                                </a>
                              </div>
                            )}
                          </div>
                          <div
                            className={`status ${event.kind}`}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '10px',
                              fontFamily: 'var(--mono)',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em'
                            }}
                          >
                            {event.kind === 'clear' ? 'CONFIRMED' : event.kind === 'exit' ? 'EMERGENCY' : event.kind === 'pause' ? 'PAUSED' : event.kind === 'withdraw' ? 'WITHDRAWN' : 'ALERT'}
                          </div>
                        </div>
                      )) : (
                        <div style={{ fontSize: '13px', color: '#78968b', padding: '24px 0', textAlign: 'center' }}>
                          No on-chain activity recorded for this position yet. Deposit assets or sign a policy to start the audit log.
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'Contracts' && (
                    <div className="appcards" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <div className="appcard dark">
                        <h4>Aegis Vault Contract</h4>
                        <div className="mono" style={{ fontSize: '13px', marginTop: '10px', wordBreak: 'break-all' }}>{contracts.vault}</div>
                        <div className="sub" style={{ marginTop: '10px' }}><a href={explorerAddressUrl(contracts.vault)} target="_blank" rel="noreferrer" style={{ color: 'var(--mint)', textDecoration: 'none' }}>View Contract on OKX Explorer ↗</a></div>
                      </div>
                      <div className="appcard dark">
                        <h4>Policy Registry Contract</h4>
                        <div className="mono" style={{ fontSize: '13px', marginTop: '10px', wordBreak: 'break-all' }}>{contracts.policyRegistry}</div>
                        <div className="sub" style={{ marginTop: '10px' }}><a href={explorerAddressUrl(contracts.policyRegistry)} target="_blank" rel="noreferrer" style={{ color: 'var(--mint)', textDecoration: 'none' }}>View Contract on OKX Explorer ↗</a></div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'Faucet' && activeNetwork === 'testnet' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Header */}
                      <div style={{ padding: '20px 22px', borderRadius: '14px', background: 'rgba(79,224,168,0.06)', border: '1px solid rgba(79,224,168,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '22px' }}>🚰</span>
                          <h4 style={{ margin: 0, font: '600 16px var(--display)', color: 'var(--white)' }}>Testnet Token Faucet</h4>
                          <span style={{ marginLeft: 'auto', font: '600 10px var(--mono)', background: 'rgba(79,224,168,0.15)', color: 'var(--mint)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(79,224,168,0.3)' }}>X LAYER TESTNET</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: '#7a9b90', lineHeight: '1.6' }}>
                          Mint free mock tokens directly to your wallet — no real funds needed. Each mint gives you a batch of tokens you can deposit into Aegis Vault to test the full risk guardian flow.
                        </p>
                        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,200,100,0.06)', border: '1px solid rgba(255,200,100,0.2)', fontSize: '12px', color: '#c8a060' }}>
                          ⛽ You need a small amount of <b>testnet OKB</b> for gas.{' '}
                          <a href="https://web3.okx.com/xlayer/faucet" target="_blank" rel="noreferrer" style={{ color: '#e8b870', textDecoration: 'underline' }}>Get 0.2 OKB/day from the X Layer Faucet ↗</a>
                        </div>
                      </div>

                      {/* Mint Success Banner */}
                      {mintSuccess && (
                        <div style={{
                          padding: '16px 20px',
                          borderRadius: '14px',
                          background: 'rgba(79,224,168,0.12)',
                          border: '1px solid var(--mint)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                          flexWrap: 'wrap'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>🎉</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--mint)' }}>
                                {mintSuccess.amount} {mintSuccess.symbol} successfully minted!
                              </div>
                              <div style={{ fontSize: '12px', color: '#a0c4b8', marginTop: '2px' }}>
                                Tokens are now in your wallet. You can deposit them into Aegis Vault to open a protected position.
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <a
                              href={explorerTxUrl(mintSuccess.txHash)}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                background: 'rgba(79,224,168,0.15)',
                                color: 'var(--mint)',
                                border: '1px solid rgba(79,224,168,0.3)',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                textDecoration: 'none',
                                fontFamily: 'var(--mono)',
                                fontWeight: 600
                              }}
                            >
                              View TX ↗
                            </a>
                            <button
                              onClick={() => setShowDepositModal(true)}
                              className="btn-primary"
                              style={{ padding: '8px 16px', fontSize: '12px' }}
                            >
                              + Deposit into Vault
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Token cards */}
                      {(Object.entries(TESTNET_TOKENS) as [keyof typeof TESTNET_TOKENS, typeof TESTNET_TOKENS[keyof typeof TESTNET_TOKENS]][]).map(([key, token]) => (
                        <div key={key} style={{
                          padding: '18px 20px',
                          borderRadius: '14px',
                          background: '#0e211c',
                          border: '1px solid rgba(79,224,168,0.14)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          flexWrap: 'wrap'
                        }}>
                          {/* Token badge */}
                          <div style={{
                            width: '44px', height: '44px', borderRadius: '50%',
                            background: 'rgba(79,224,168,0.1)', border: '1px solid rgba(79,224,168,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            font: '700 13px var(--mono)', color: 'var(--mint)', flexShrink: 0
                          }}>
                            {key}
                          </div>

                          {/* Token info */}
                          <div style={{ flex: 1, minWidth: '140px' }}>
                            <div style={{ font: '600 14px var(--sans)', color: 'var(--white)', marginBottom: '2px' }}>
                              {token.symbol}
                              {key === 'GLDX' && <span style={{ fontSize: '11px', color: '#7a9b90', marginLeft: '8px' }}>Tokenized Gold</span>}
                              {key === 'SPYX' && <span style={{ fontSize: '11px', color: '#7a9b90', marginLeft: '8px' }}>Tokenized S&P 500</span>}
                              {key === 'USDC' && <span style={{ fontSize: '11px', color: '#7a9b90', marginLeft: '8px' }}>USD Stablecoin</span>}
                            </div>
                            <div style={{ font: '400 11px var(--mono)', color: '#4d7a6a', wordBreak: 'break-all' }}>
                              {token.address.slice(0, 10)}...{token.address.slice(-6)}
                            </div>
                          </div>

                          {/* Drip amount */}
                          <div style={{ textAlign: 'center', minWidth: '80px' }}>
                            <div style={{ font: '700 20px var(--mono)', color: 'var(--mint)' }}>{token.faucetAmount}</div>
                            <div style={{ font: '400 10px var(--mono)', color: '#4d7a6a', textTransform: 'uppercase' }}>per mint</div>
                          </div>

                          {/* Mint button */}
                          <motion.button
                            onClick={account ? (() => void mintTestTokens(key)) : connect}
                            disabled={!!mintingToken || busy === 'connect'}
                            style={{
                              padding: '10px 20px',
                              borderRadius: '9px',
                              background: mintingToken === key ? 'rgba(79,224,168,0.15)' : 'var(--mint)',
                              color: mintingToken === key ? 'var(--mint)' : 'var(--ink)',
                              border: mintingToken === key ? '1px solid rgba(79,224,168,0.4)' : 'none',
                              font: '600 13px var(--sans)',
                              cursor: mintingToken ? 'not-allowed' : 'pointer',
                              minWidth: '110px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                            whileHover={!mintingToken ? { scale: 1.04 } : {}}
                            whileTap={!mintingToken ? { scale: 0.96 } : {}}
                          >
                            {mintingToken === key ? (
                              <><span className="spinner" style={{ borderColor: 'rgba(79,224,168,0.3)', borderTopColor: 'var(--mint)', width: '12px', height: '12px', borderWidth: '2px' }} /> Minting...</>
                            ) : account ? (
                              `Mint ${token.faucetAmount} ${token.symbol}`
                            ) : (
                              'Connect Wallet'
                            )}
                          </motion.button>
                        </div>
                      ))}

                      {/* After getting tokens nudge */}
                      <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(23,59,49,0.4)', border: '1px solid rgba(79,224,168,0.1)', fontSize: '12px', color: '#7a9b90', lineHeight: '1.6' }}>
                        <b style={{ color: 'var(--mint)' }}>Next steps:</b> Once you have tokens, go to <button onClick={() => setActiveTab('Positions')} style={{ background: 'none', border: 'none', color: 'var(--mint)', cursor: 'pointer', fontWeight: 600, fontSize: '12px', padding: 0, textDecoration: 'underline' }}>Positions</button> → Deposit New Position, then set a risk policy in <button onClick={() => setActiveTab('Policies')} style={{ background: 'none', border: 'none', color: 'var(--mint)', cursor: 'pointer', fontWeight: 600, fontSize: '12px', padding: 0, textDecoration: 'underline' }}>Policies</button> to activate Guardian protection.
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* Deposit Modal */}
      <AnimatePresence>
        {showDepositModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(6px)',
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={() => setShowDepositModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="appcard light"
              style={{
                width: '100%',
                maxWidth: '440px',
                background: '#F2EFE6',
                color: '#10231e',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                border: '1px solid rgba(23,59,49,0.2)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, font: '600 18px var(--serif)', color: '#10231e' }}>Deposit Position into Aegis</h3>
                <button
                  onClick={() => setShowDepositModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#52625b' }}
                >
                  ✕
                </button>
              </div>

              <p style={{ fontSize: '13px', color: '#52625b', margin: '0 0 20px' }}>
                Transfer asset tokens into the Aegis Non-Custodial Vault to enable AI risk boundary monitoring and automated protection.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ font: '500 11px var(--mono)', textTransform: 'uppercase', color: '#52625b' }}>
                    Select Asset / Token
                  </label>
                  <button
                    onClick={() => setIsCustomAsset(!isCustomAsset)}
                    style={{ background: 'none', border: 'none', font: '500 11px var(--mono)', color: '#2d6b56', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {isCustomAsset ? '← Choose Preset RWA' : '+ Custom Token Address'}
                  </button>
                </div>

                {isCustomAsset ? (
                  <input
                    type="text"
                    value={customAssetAddress}
                    onChange={(e) => setCustomAssetAddress(e.target.value)}
                    placeholder="0x... (ERC20 Token Contract Address)"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(16,35,30,0.2)',
                      background: '#fff',
                      color: '#10231e',
                      fontSize: '13px',
                      fontFamily: 'var(--mono)'
                    }}
                  />
                ) : (
                  <select
                    value={depositAsset}
                    onChange={(e) => setDepositAsset(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(16,35,30,0.2)',
                      background: '#fff',
                      color: '#10231e',
                      fontSize: '14px',
                      fontFamily: 'var(--sans)'
                    }}
                  >
                    <option value={TOKENS.SPYX.address}>SPYX ({TOKENS.SPYX.symbol} Tokenized Stock)</option>
                    <option value={TOKENS.GLDX.address}>GLDX ({TOKENS.GLDX.symbol} Tokenized Commodity)</option>
                    <option value={TOKENS.USDC.address}>USDC ({TOKENS.USDC.symbol} Stablecoin)</option>
                  </select>
                )}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', font: '500 11px var(--mono)', textTransform: 'uppercase', color: '#52625b', marginBottom: '6px' }}>
                  Deposit Amount
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="1.0"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(16,35,30,0.2)',
                    background: '#fff',
                    color: '#10231e',
                    fontSize: '16px',
                    fontFamily: 'var(--sans)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowDepositModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(16,35,30,0.2)',
                    background: 'transparent',
                    color: '#52625b',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  Cancel
                </button>

                <motion.button
                  onClick={account ? (() => void depositPosition()) : connect}
                  disabled={busy === 'deposit' || busy === 'connect'}
                  className="btn-primary"
                  style={{ flex: 1.5, padding: '12px', fontSize: '14px' }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {busy === 'deposit' || busy === 'connect' ? (
                    <span className="spinner" style={{ borderColor: 'var(--ink)' }} />
                  ) : account ? (
                    'Confirm Deposit'
                  ) : (
                    'Connect Wallet'
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
