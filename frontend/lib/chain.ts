import { defineChain } from 'viem';

/**
 * X Layer network definitions.
 *
 * Chain IDs verified against the live RPCs: mainnet 196, testnet 1952. The
 * `195` in older guides is stale — using it silently points the app at nothing
 * and every read fails with a confusing network error. Gas token is OKB on
 * both networks.
 */

export const xLayerMainnet = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'] },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/x-layer' },
  },
});

export const xLayerTestnet = defineChain({
  id: 1952,
  name: 'X Layer Testnet',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://testrpc.xlayer.tech/terigon', 'https://xlayertestrpc.okx.com/terigon'],
    },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/x-layer-testnet' },
  },
  testnet: true,
});

export type NetworkName = 'mainnet' | 'testnet';

export const activeNetwork: NetworkName = 'testnet';

export const activeChain = xLayerTestnet;

/**
 * Deployed contract addresses on X Layer Testnet (Chain ID 1952).
 */
export const contracts = {
  vault: '0xc96d34534270B3ff41b5b4e30731c980FdfEd8DB' as `0x${string}`,
  policyRegistry: '0x90346e8ebB6fb000c97BbcdE93D7C5C192396Fd2' as `0x${string}`,
  riskOracle: '0xEB0538B1c199eC063B7E6e785572ed4402D94074' as `0x${string}`,
  emergencyVault: '0xA33e3050b185B9289C1732d71C53B0c36A25Fe61' as `0x${string}`,
};

export function contractsConfigured(): boolean {
  return Boolean(contracts.vault) && Boolean(contracts.policyRegistry);
}

/**
 * Deployed X Layer Testnet MockERC20 token addresses.
 * Source: DEPLOYMENTS.md — primary deployment (production-shaped, 24h time-lock).
 */
export const TESTNET_TOKENS = {
  USDC: { address: '0x7d2a9f61f641538787ba6052A8C496C749AfBfd1', symbol: 'tUSDC', decimals: 6,  faucetAmount: '1000' },
  GLDX: { address: '0xa7218E99738F3d83f6c2B85b2b5f13f6E709a3DF', symbol: 'tGLDX', decimals: 18, faucetAmount: '100'  },
  SPYX: { address: '0x28AD1826640A3B840bD13e0C0900dE8C75C6491C', symbol: 'tSPYX', decimals: 18, faucetAmount: '100'  },
} as const;

/**
 * Real X Layer MAINNET token addresses, from the verified list in the project brief.
 */
export const MAINNET_TOKENS = {
  USDC: { address: '0x74b7F16337b8972027F6196A17a631aC6dE26d22', symbol: 'USDC', decimals: 6 },
  GLDX: { address: '0x2380f2673c640fb67e2d6b55b44c62f0e0e69da9', symbol: 'GLDX', decimals: 18 },
  SPYX: { address: '0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48', symbol: 'SPYX', decimals: 18 },
} as const;

export const TOKENS = TESTNET_TOKENS;

/** Truncate an address for display without hiding the checksum tail. */
export function shortAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function explorerTxUrl(hash: string): string {
  return `${activeChain.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${activeChain.blockExplorers.default.url}/address/${address}`;
}
