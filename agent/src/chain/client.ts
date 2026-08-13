import {
  createPublicClient,
  createWalletClient,
  defineChain,
  fallback,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { NETWORKS, type NetworkName } from '../config.js';

/**
 * viem chain definitions for X Layer.
 *
 * Chain IDs verified against the live RPCs (testnet 1952, mainnet 196).
 * The gas token is OKB, not ETH — getting `nativeCurrency` wrong would make
 * every logged fee figure silently mislabeled.
 */
export function defineXLayer(network: NetworkName) {
  const net = NETWORKS[network];
  return defineChain({
    id: net.chainId,
    name: net.name,
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrls: {
      default: { http: [net.rpcUrl, net.fallbackRpcUrl] },
    },
    testnet: network === 'testnet',
  });
}

export interface ChainClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: ReturnType<typeof privateKeyToAccount>;
  chainId: number;
}

/**
 * Build the read and write clients.
 *
 * Both RPCs are wired through viem's `fallback` transport so a single
 * endpoint outage doesn't stall the monitoring loop — for a risk guardian,
 * silently stopping is a real failure mode, not a minor one.
 */
export function createChainClients(network: NetworkName, agentPrivateKey: Hex): ChainClients {
  const chain = defineXLayer(network);
  const net = NETWORKS[network];

  const transport = fallback([http(net.rpcUrl), http(net.fallbackRpcUrl)]);

  const account = privateKeyToAccount(agentPrivateKey);

  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  return { publicClient, walletClient, account, chainId: chain.id };
}

/**
 * Fail fast if the RPC isn't the chain we think it is.
 *
 * Cheap to check, and it prevents the worst-case confusion of pointing at
 * mainnet while believing it's testnet.
 */
export async function assertCorrectChain(
  publicClient: PublicClient,
  expectedChainId: number,
): Promise<void> {
  const actual = await publicClient.getChainId();
  if (actual !== expectedChainId) {
    throw new Error(
      `Chain mismatch: RPC reports chain ${actual}, expected ${expectedChainId}. ` +
        'Check AEGIS_NETWORK and the RPC URL before running the agent.',
    );
  }
}

/**
 * Verify this key actually holds the agent role on the vault.
 *
 * Without this, a misconfigured key would fail only at the moment it tries to
 * act — i.e. during an emergency, which is the worst possible time to find
 * out. Checking at startup turns that into an immediate, obvious error.
 */
export async function assertAgentRole(
  publicClient: PublicClient,
  vaultAddress: Address,
  agentAddress: Address,
  vaultAbi: readonly unknown[],
): Promise<void> {
  const onChainAgent = (await publicClient.readContract({
    address: vaultAddress,
    abi: vaultAbi as never,
    functionName: 'agent',
  })) as Address;

  if (onChainAgent.toLowerCase() !== agentAddress.toLowerCase()) {
    throw new Error(
      `This key is not the vault's agent.\n` +
        `  vault.agent(): ${onChainAgent}\n` +
        `  this key:      ${agentAddress}\n` +
        'The owner must call setAgent(), or AGENT_PRIVATE_KEY is wrong.',
    );
  }
}
