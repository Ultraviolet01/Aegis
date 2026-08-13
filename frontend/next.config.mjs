import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load the repo-root .env so the frontend, the agent, and the Foundry scripts
// all read one file. Next only auto-loads env files inside its own directory,
// so without this the OKX credentials would appear unset and every swap quote
// would fail with an opaque auth error.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  ...(process.env.VERCEL ? {} : { outputFileTracingRoot: resolve(here, '..') }),

  devIndicators: false,

  // NOTE: nothing here exposes OKX credentials to the browser. They are read
  // only inside route handlers (server-side). Adding them to `env` or to any
  // NEXT_PUBLIC_ variable would inline them into the client bundle and leak
  // the API secret to every visitor.
  env: {
    NEXT_PUBLIC_AEGIS_NETWORK: process.env.NEXT_PUBLIC_AEGIS_NETWORK ?? process.env.AEGIS_NETWORK ?? 'mainnet',
    NEXT_PUBLIC_AEGIS_VAULT_ADDRESS: process.env.NEXT_PUBLIC_AEGIS_VAULT_ADDRESS ?? process.env.AEGIS_VAULT_ADDRESS ?? '',
    NEXT_PUBLIC_POLICY_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_POLICY_REGISTRY_ADDRESS ?? process.env.POLICY_REGISTRY_ADDRESS ?? '',
    NEXT_PUBLIC_RISK_ORACLE_ADDRESS: process.env.NEXT_PUBLIC_RISK_ORACLE_ADDRESS ?? process.env.RISK_ORACLE_ADDRESS ?? '',
    NEXT_PUBLIC_EMERGENCY_VAULT_ADDRESS: process.env.NEXT_PUBLIC_EMERGENCY_VAULT_ADDRESS ?? process.env.EMERGENCY_VAULT_ADDRESS ?? '',
  },
};

export default nextConfig;
