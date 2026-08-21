'use client';

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type EIP1193Provider,
} from 'viem';
import { activeChain } from './chain';

/**
 * Minimal wallet plumbing over the injected EIP-1193 provider.
 *
 * No WalletConnect/RainbowKit: for a hackathon demo they add a large
 * dependency tree and a project ID to provision, and every judge testing this
 * will have an injected wallet already.
 */

export function getProvider(): EIP1193Provider | undefined {
  if (typeof window === 'undefined') return undefined;
  const win = window as unknown as { okxwallet?: EIP1193Provider; ethereum?: EIP1193Provider & { providers?: EIP1193Provider[] } };
  if (win.okxwallet) return win.okxwallet;
  if (win.ethereum?.providers?.length) {
    const okx = win.ethereum.providers.find((p: any) => p.isOkxWallet || p.isOKExWallet);
    if (okx) return okx;
  }
  return win.ethereum;
}

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(activeChain.rpcUrls.default.http[0]),
});

export function getWalletClient(account: Address) {
  const provider = getProvider();
  if (!provider) throw new Error('No injected wallet found.');

  return createWalletClient({ account, chain: activeChain, transport: custom(provider) });
}

export async function connectWallet(): Promise<Address> {
  const provider = getProvider();
  if (!provider) {
    throw new Error('No wallet detected. Install OKX Wallet or MetaMask to continue.');
  }

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as Address[];
  const account = accounts[0];
  if (!account) throw new Error('Wallet returned no accounts.');

  return account;
}

export async function getChainId(): Promise<number | undefined> {
  const provider = getProvider();
  if (!provider) return undefined;

  const hex = (await provider.request({ method: 'eth_chainId' })) as string;
  return Number.parseInt(hex, 16);
}

/**
 * Switch to X Layer, adding the network if the wallet doesn't know it.
 *
 * 4902 means "unrecognized chain" — expected for X Layer in most wallets, so
 * it is handled as a normal path rather than an error. Signing on the wrong
 * chain is the failure this prevents: the transaction would either revert or,
 * worse, hit a different contract living at the same address elsewhere.
 */
export async function ensureCorrectChain(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error('No injected wallet found.');

  const target = `0x${activeChain.id.toString(16)}`;
  const current = await getChainId();
  if (current === activeChain.id) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: target }],
    });
  } catch (err: any) {
    const code = err?.code ?? err?.data?.originalError?.code;
    const msg = String(err?.message ?? '');

    if (code === 4902 || code === -32603 || msg.includes('4902') || msg.includes('Unrecognized chain') || msg.includes('wallet_addEthereumChain') || msg.includes('not found')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: target,
            chainName: activeChain.name,
            nativeCurrency: activeChain.nativeCurrency,
            rpcUrls: [...activeChain.rpcUrls.default.http],
            blockExplorerUrls: [activeChain.blockExplorers.default.url],
          },
        ],
      });
      return;
    }

    throw err;
  }
}

/** Human-readable message from a wallet/contract error. */
export function describeError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { shortMessage?: string; message?: string; code?: number };

    // 4001 = user rejected. Not an error worth alarming anyone about.
    if (e.code === 4001) return 'Transaction rejected in wallet.';
    if (e.shortMessage) return e.shortMessage;
    if (e.message) return e.message.split('\n')[0] ?? e.message;
  }

  return String(err);
}
