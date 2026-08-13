import { loadConfig } from './config.js';
import { createChainClients, assertCorrectChain, assertAgentRole } from './chain/client.js';
import { aegisVaultAbi } from './chain/abis.js';
import { Executor } from './executor.js';
import { Monitor } from './monitor.js';
import { createLogger } from './logger.js';
import { OkxQuoteClient } from './okx/quote.js';

/**
 * Agent entrypoint.
 *
 * Startup order matters: every safety assertion runs BEFORE the first
 * monitoring pass, so a misconfiguration surfaces immediately instead of
 * during an actual risk event.
 */
async function main() {
  const logger = createLogger(process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info');
  const config = loadConfig();

  const { publicClient, walletClient, account, chainId } = createChainClients(
    config.AEGIS_NETWORK,
    config.AGENT_PRIVATE_KEY,
  );

  logger.info('Aegis agent starting', {
    network: config.network.name,
    chainId,
    agent: account.address,
    dryRun: config.DRY_RUN,
    llmPolicyParsing: config.llmEnabled,
    pollIntervalSeconds: config.POLL_INTERVAL_SECONDS,
  });

  if (config.DRY_RUN) {
    logger.warn('DRY_RUN is enabled - the agent will evaluate and log but send no transactions.');
    logger.warn('Set DRY_RUN=false in .env to let the agent act within each user policy.');
  }

  // 1. The RPC must be the chain we think it is.
  await assertCorrectChain(publicClient, chainId);

  // 2. This key must actually hold the agent role.
  await assertAgentRole(publicClient, config.AEGIS_VAULT_ADDRESS, account.address, aegisVaultAbi);

  // 3. The vault must be wired to a PolicyRegistry. Without it,
  //    routeToEmergency reverts PolicyRegistryNotSet — the agent would have
  //    zero authority, which is safe but means the deploy is incomplete.
  const wiredRegistry = (await publicClient.readContract({
    address: config.AEGIS_VAULT_ADDRESS,
    abi: aegisVaultAbi,
    functionName: 'policyRegistry',
  })) as `0x${string}`;

  if (wiredRegistry === '0x0000000000000000000000000000000000000000') {
    throw new Error(
      'Vault has no PolicyRegistry set. The owner must call setPolicyRegistry() ' +
        'before the agent can act at all (routeToEmergency reverts until then).',
    );
  }

  if (wiredRegistry.toLowerCase() !== config.POLICY_REGISTRY_ADDRESS.toLowerCase()) {
    // A mismatch means this agent is reading allowances from a different
    // registry than the one the vault enforces against. Every exit would
    // revert, so fail loudly now.
    throw new Error(
      `PolicyRegistry mismatch:\n` +
        `  vault.policyRegistry(): ${wiredRegistry}\n` +
        `  POLICY_REGISTRY_ADDRESS: ${config.POLICY_REGISTRY_ADDRESS}\n` +
        'Fix .env to match the vault, or the vault to match your deployment.',
    );
  }

  // 4. Gas check. An agent that cannot pay for a transaction cannot protect
  //    anything, and OKB is the gas token on both X Layer networks.
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    logger.warn('Agent has 0 OKB - it cannot send transactions. Fund it via the X Layer faucet.', {
      agent: account.address,
      faucet: 'https://web3.okx.com/xlayer/faucet',
    });
  }

  logger.info('Startup checks passed', {
    vault: config.AEGIS_VAULT_ADDRESS,
    policyRegistry: wiredRegistry,
    riskOracle: config.RISK_ORACLE_ADDRESS,
    agentBalanceWei: balance,
  });

  const executor = new Executor({
    publicClient,
    walletClient,
    account,
    vaultAddress: config.AEGIS_VAULT_ADDRESS,
    policyRegistryAddress: config.POLICY_REGISTRY_ADDRESS,
    dryRun: config.DRY_RUN,
    logger,
  });

  // OKX DEX quotes supply the independent reference price for the deviation
  // check. Read-only: this client holds no wallet and cannot move funds.
  //
  // Availability is narrow on purpose. The aggregator indexes mainnet
  // liquidity only, so on testnet the deviation check stays skipped rather
  // than comparing against a chain OKX is not quoting.
  const quoteClient = config.okxQuotesAvailable
    ? new OkxQuoteClient(config.okxCredentials!, logger)
    : undefined;

  if (quoteClient) {
    logger.info('OKX DEX quotes enabled - oracle deviation check is active', {
      quoteToken: config.OKX_QUOTE_TOKEN_ADDRESS,
      chainIndex: '196',
    });
  } else if (config.okxCredentials && config.AEGIS_NETWORK !== 'mainnet') {
    logger.warn(
      'OKX credentials are set but the DEX aggregator is mainnet-only. ' +
        'Oracle deviation checks stay SKIPPED on testnet; drawdown checks are unaffected.',
    );
  } else {
    logger.warn(
      'OKX credentials not configured - oracle deviation checks will be SKIPPED. ' +
        'Drawdown and volatility checks still run.',
    );
  }

  const monitor = new Monitor({
    publicClient,
    vaultAddress: config.AEGIS_VAULT_ADDRESS,
    policyRegistryAddress: config.POLICY_REGISTRY_ADDRESS,
    riskOracleAddress: config.RISK_ORACLE_ADDRESS,
    executor,
    logger,
    historySize: config.PRICE_HISTORY_SIZE,
    exitCooldownSeconds: config.EXIT_COOLDOWN_SECONDS,

    ...(quoteClient
      ? {
          quoteClient,
          quoteToken: {
            address: config.OKX_QUOTE_TOKEN_ADDRESS,
            decimals: config.OKX_QUOTE_TOKEN_DECIMALS,
          },
        }
      : {}),
  });

  let running = true;
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down after the current pass`);
    running = false;
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  while (running) {
    try {
      const assessments = await monitor.runOnce();
      logger.debug('Monitoring pass complete', { positionsAssessed: assessments.length });
    } catch (err) {
      // Never exit the loop on a transient error. An RPC hiccup must not
      // silently end the guardian's watch — that failure would be invisible
      // right when protection matters.
      logger.error('Monitoring pass failed, continuing', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }

  logger.info('Aegis agent stopped');
}

main().catch((err) => {
  console.error(`\nAgent failed to start:\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
