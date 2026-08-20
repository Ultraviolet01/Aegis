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
  TOKENS,
  shortAddress,
} from '@/lib/chain';
import { aegisVaultAbi, erc20Abi, policyRegistryAbi } from '@/lib/abis';
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
    for (const id of targetIds) {
      const [posOwner, asset, amount, pausedByAgent, exists] = (await publicClient.readContract({
        address: contracts.vault as Address,
        abi: aegisVaultAbi,
        functionName: 'positions',
        args: [id],
      })) as readonly [Address, Address, bigint, boolean, boolean];

      if (!exists || amount === 0n) continue;
      if (posOwner.toLowerCase() !== owner.toLowerCase()) continue;

      const [decimals, symbol] = await Promise.all([
        publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
        publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'symbol' }).catch(() => 'TOKEN') as Promise<string>,
      ]);
      found.push({ id, asset, amount, pausedByAgent, symbol, decimals: Number(decimals) });
    }
    setPositions(found);
    if (found.length > 0) {
      setSelectedId(found[0]!.id.toString());
      setPolicyText(`If ${found[0]!.symbol} drops more than 8%, move 75% to USDC cautiously.`);
    }
  }, [ready]);

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

    const posId = activeSelected ? activeSelected.id : 1n;
    setBusy('sign');
    try {
      toast({ kind: 'info', title: 'Preparing signature', description: 'Opening wallet for transaction approval...' });
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
      
      const policy = (await publicClient.readContract({
        address: contracts.policyRegistry as Address,
        abi: policyRegistryAbi,
        functionName: 'getPolicy',
        args: [posId],
      }).catch(() => undefined)) as OnChainPolicy | undefined;
      setOnChainPolicy(policy);
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

  const withdrawPosition = async (positionId: bigint) => {
    if (!account) return;
    setBusy(`withdraw-${positionId.toString()}`);
    try {
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
              
              {['Overview', 'Positions', 'Policies', 'Activity', 'Contracts'].map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <motion.div 
                    key={tab}
                    className={`navitem ${isActive ? 'active' : ''}`} 
                    onClick={() => setActiveTab(tab)}
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.18 }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeSidebarPill"
                        className="active-pill-bg"
                        transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
                      />
                    )}
                    <span style={{ position: 'relative', zIndex: 2 }}>{tab}</span>
                  </motion.div>
                );
              })}

              <div className="sidefoot">
                <div style={{ font: '600 10px var(--mono)', color: 'var(--mint)' }}>CONTROL ROOM MODE</div>
              </div>
            </motion.aside>
            
            <div className="mainapp">
              <div className="mobile-nav-bar">
                {['Overview', 'Positions', 'Policies', 'Activity', 'Contracts'].map((tab) => (
                  <button
                    key={tab}
                    className={`mobile-nav-tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
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
                                No Policy Set for Position #{activeSelected.id.toString()} ({activeSelected.symbol})
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
                                Active policy · {symbol}
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

                      {activePositions.length > 0 ? activePositions.map(pos => (
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
                              <h4>Position #{pos.id.toString()} · {pos.symbol}</h4>
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
                                Active Enforced On-Chain Policy {activeSelected ? `(${activeSelected.symbol})` : ''}
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

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h4 style={{ margin: 0 }}>
                            {activePolicy?.active ? 'Update / Re-Sign Policy' : 'Write New Policy'}{policyAssetSymbol ? ` for ${policyAssetSymbol}` : ''}
                          </h4>
                          <span style={{ fontSize: '12px', color: '#7a9b90' }}>
                            Select RWA asset to apply policy to:
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {!isCustomPolicyAsset ? (
                          <select
                            value={policyAsset}
                            onChange={(e) => {
                              setPolicyAsset(e.target.value);
                              const sym = TOKENS[e.target.value as keyof typeof TOKENS]?.symbol ?? e.target.value;
                              setPolicyText(`If ${sym} drops more than 8%, move 75% to USDC cautiously.`);
                            }}
                            style={{
                              background: '#10231e',
                              border: '1px solid rgba(79, 224, 168, 0.4)',
                              color: 'var(--mint)',
                              padding: '8px 14px',
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontFamily: 'var(--mono)',
                              outline: 'none',
                              flex: '1',
                              minWidth: '180px'
                            }}
                          >
                            <option value="SPYX">{TOKENS.SPYX.symbol} — Tokenized S&P 500</option>
                            <option value="GLDX">{TOKENS.GLDX.symbol} — Tokenized Gold</option>
                            <option value="USDC">{TOKENS.USDC.symbol} — USD Stablecoin</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={customPolicyAssetAddress}
                            onChange={(e) => setCustomPolicyAssetAddress(e.target.value)}
                            placeholder="0x... (ERC20 RWA Token Address)"
                            style={{
                              background: '#10231e',
                              border: '1px solid rgba(79, 224, 168, 0.4)',
                              color: 'var(--mint)',
                              padding: '8px 14px',
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontFamily: 'var(--mono)',
                              outline: 'none',
                              flex: '1',
                              minWidth: '180px'
                            }}
                          />
                        )}
                        <button
                          onClick={() => {
                            setIsCustomPolicyAsset(!isCustomPolicyAsset);
                            if (!isCustomPolicyAsset) {
                              setPolicyText('If [token] drops more than 8%, move 75% to USDC cautiously.');
                            } else {
                              const sym = TOKENS[policyAsset as keyof typeof TOKENS]?.symbol ?? policyAsset;
                              setPolicyText(`If ${sym} drops more than 8%, move 75% to USDC cautiously.`);
                            }
                          }}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(79, 224, 168, 0.3)',
                            color: 'var(--mint)',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontFamily: 'var(--mono)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {isCustomPolicyAsset ? '← Preset RWAs' : '+ Custom Token'}
                        </button>
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
                          onClick={account ? signPolicy : connect} 
                          disabled={busy === 'sign' || busy === 'connect'} 
                          className="btn-primary btn-primary-full"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {busy === 'sign' || busy === 'connect' ? (
                            <span className="spinner" style={{ borderColor: 'var(--ink)' }} />
                          ) : account ? (
                            `Sign ${policyAssetSymbol || ''} Policy On-Chain`
                          ) : (
                            'Connect Wallet'
                          )}
                        </motion.button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'Activity' && (
                    <div className="activity">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0 }}>Full Agent Log</h4>
                        {loadingHistory && <span className="spinner" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />}
                      </div>
                      
                      {activeHistory.length > 0 ? activeHistory.map((event, i) => (
                        <div key={event.id} className="event">
                          <span>{event.at ? formatTime(event.at) : 'Just now'}</span>
                          <div>
                            {event.title}
                            {event.detail && <div style={{ fontSize: '11px', color: '#6d7b74', marginTop: '4px' }}>{event.detail}</div>}
                          </div>
                          <div className="status">{event.kind === 'clear' ? 'CLEAR' : 'MATCH'}</div>
                        </div>
                      )) : (
                        <div style={{ fontSize: '12px', color: '#78968b', padding: '13px 0' }}>No history recorded yet.</div>
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
