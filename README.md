# Aegis

Non-custodial AI guardian that protects RWA & DeFi positions on X Layer before losses compound.

## What it does

You deposit a supported asset — a stablecoin or an xStocks tokenized equity — into an `AegisVault`
position and describe your risk limits in plain English:

> "If drawdown > 8% in 24h or oracle deviation > 2%, exit 50% to USDC."

An LLM turns that into structured on-chain parameters. You review the parsed numbers and sign them
yourself. From then on the agent watches Chainlink prices against your thresholds and acts only
inside what you approved. Every decision is emitted as an on-chain event.

## Automated vs. user-signed — the exact split

This distinction is the product, so it is stated precisely rather than blurred.

**Fully autonomous, and provably bounded.** When a policy trips, the agent de-risks on its own: it
pauses the position, or routes the approved share to the time-locked `EmergencyVault`. That is the
whole of its authority. `routeToEmergency(positionId, exitBps)` takes no recipient and no calldata,
so the immutable `emergencyVault` is the only address funds can reach. The fuzz test
`testFuzz_AgentCannotDrainToArbitraryAddress` holds that line, and the executor independently
re-reads your policy and clamps the exit size before every action.

**One click, self-custodied.** Converting a recovered position to a stablecoin is your action, from
the dashboard or from your own wallet. Aegis builds the OKX DEX route; your wallet signs the
approval and the swap; the output lands in your wallet. Aegis is never the holder, the router, or
the recipient.

**Never gated.** Manual withdrawal was never subject to the time lock. You can withdraw and swap
immediately, without waiting on the `EmergencyVault` delay — the lock applies only to funds the
agent routed there, and only to protect against a compromised agent, never against you.

No swap-capable function was added to `AegisVault` on purpose. A vault method that approves a
router and executes agent-supplied calldata would be a drain path in a swap's clothing, and
shipping it would have meant deleting the fuzz test that makes the non-custodial claim true.

## Where the AI is

- **LLM policy parsing** — plain English to structured parameters. Output is untrusted: parsed as
  JSON, validated against a strict schema, shown to you, then signed by you. `setPolicy` is
  owner-only, so a hallucinated policy cannot take effect on its own.
- **Hybrid risk engine** — deterministic threshold checks plus a rolling z-score volatility layer.
  This is statistics, not a trained model, and the code says so. The z-score can escalate to a
  pause; it can never authorize an exit, because only a breach of a threshold you approved may move
  funds.
- **Two independent price sources** — a Chainlink feed for valuation, an OKX DEX quote for what the
  position can actually be sold for. The gap between them is the oracle deviation check.

## Layout

```
src/         Solidity contracts (AegisVault, EmergencyVault, PolicyRegistry, RiskOracle)
test/        Foundry tests, incl. the non-custodial fuzz invariant
script/      Deploy scripts
agent/       Off-chain guardian (TypeScript): monitor, risk engine, policy parser, executor
frontend/    Next.js dashboard: deposit, policy composer, pause/withdraw, self-custodied swap
```

## Run it

```bash
# Contracts
forge build && forge test

# Agent (DRY_RUN=true by default — it evaluates and logs, sends nothing)
cd agent && npm install && npm test && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

Configuration lives in a single gitignored root `.env`; copy `.env.example` and fill it in. The
agent and the Foundry scripts read it directly, and the frontend loads it via `next.config.mjs`.

OKX API credentials are used server-side only, for read-only price quotes and for building unsigned
swap calldata. They sign API requests, not transactions, and they never reach the browser bundle.

## Network facts

| Item | Value |
|---|---|
| Mainnet | chain ID `196`, `https://rpc.xlayer.tech` |
| Testnet | chain ID `1952`, `https://testrpc.xlayer.tech/terigon` |
| Gas token | OKB (both networks) |
| Oracle | Chainlink Data Feeds (`AggregatorV3Interface`) |
| DEX | OKX DEX aggregator, `chainIndex` 196 — mainnet liquidity only |

The `195` testnet chain ID in older guides is stale. On testnet the DEX-dependent features
(deviation check, swap panel) are disabled rather than pointed at a chain OKX does not index;
drawdown checks, pausing, policy signing and withdrawal all work there.
