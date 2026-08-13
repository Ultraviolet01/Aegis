# Project Brief: Aegis — GROUND TRUTH

> This file is the authoritative reference for this project. Sections 3 and 4 are fixed
> facts, not suggestions. If an address, feed URL, or parameter is needed and is not
> listed here, STOP AND ASK rather than guessing or reusing a value from general
> Solidity/EVM training knowledge. X Layer-specific values (chain IDs, oracle provider,
> token addresses) have already caused incorrect assumptions earlier in this project's
> research and were corrected against live sources.

---

## 1. What we're building

**Aegis** — a non-custodial AI risk-guardian for RWA & DeFi positions on X Layer.

**Tagline:** "Non-custodial AI guardian that protects RWA & DeFi positions on X Layer before losses compound."

**Core mechanic:** A user deposits a supported asset (a stablecoin or an xStocks tokenized-equity
token) into an `AegisVault` position. They set a risk policy in plain English (e.g. "if drawdown
> 8% in 24h or oracle deviation > 2%, exit 50% to USDC"). An off-chain agent parses that into
structured on-chain parameters, continuously evaluates risk using a hybrid deterministic +
lightweight statistical engine, and — only within the policy the user approved — can pause the
position or route a portion of it to a time-locked `EmergencyVault`. The agent can never withdraw
funds to itself or to any address other than the EmergencyVault; the user can always withdraw
their own remaining balance at any time. Every decision is emitted as an on-chain event for full
transparency.

## 2. Non-negotiable requirements (hackathon rules)

- Must incorporate AI into the product and deploy on **X Layer**.
- Must deploy to **X Layer Testnet during the hackathon**, then launch on **Mainnet** — both are required.
- Must have a **dedicated, active project X account** throughout the project's lifetime.
- Submission post **must tag @XLayerOfficial**.
- Submit via the official Google Form **before Aug 21, 2026, 23:59 UTC**.
- Judging criteria: AI application, innovation, product completeness, user value, X Layer integration, growth potential.
- Separate **$50K Liquidity Grant** for the AI-RWA track — Aegis is scoped to compete for this
  directly by guarding real tokenized-equity (xStocks) positions.

**Submission form:** https://docs.google.com/forms/d/e/1FAIpQLSfgU_3zcXdxK0GJQxj33QeUWdEcAaYnieVe9p5cFDb2JFQa4Q/viewform

## 3. Verified network facts — do not hardcode anything not listed here

| Item | Value |
|---|---|
| Mainnet Chain ID | `196` (0xC4) |
| Mainnet RPC | `https://rpc.xlayer.tech`, `https://xlayerrpc.okx.com` |
| Testnet Chain ID | `1952` (the old `195` is stale — ignore any guide referencing it) |
| Testnet RPC | `https://testrpc.xlayer.tech/terigon`, `https://xlayertestrpc.okx.com/terigon` |
| Gas token (both networks) | OKB |
| VM | Full EVM equivalence (OP Stack + AggLayer) |
| Deploy tooling | Foundry (officially documented; contracts were built and tested with it) |
| Oracle | **Chainlink** Data Feeds (`AggregatorV3Interface`, standard pull) + Chainlink Data Streams (low-latency, live on mainnet, explicitly positioned by OKX for RWA/equities pricing). **Not Pyth** — do not integrate Pyth. |
| Attestation | EAS is a live predeploy at `0x4200000000000000000000000000000000000021`, SchemaRegistry at `...0020` |
| Testnet faucet | https://web3.okx.com/xlayer/faucet — 0.2 OKB/day per wallet, connect on chain ID 1952 before claiming |

## 4. Verified real asset addresses (X Layer mainnet)

Do not deploy mock tokens to mainnet — use these real addresses.
Source: OKLink X Layer token list, confirmed Aug 8, 2026.

| Token | Symbol | Mainnet Address |
|---|---|---|
| SP500 xStock | SPYX | `0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48` |
| Wrapped SP500 xStock | WSPYX | `0xe7e553cd128f0011777323a0b44a7b96ea1cb540` |
| Nasdaq xStock | QQQX | `0xa753a7395cae905cd615da0b82a53e0560f250af` |
| Wrapped Nasdaq xStock | WQQQX | `0x4c1ae29c159838fc1b224636e28e086eb69101f7` |
| ASML xStock | ASMLX | `0xc0b417e7f83db438631eb5e096684dd742e5294f` |
| Wrapped ASML xStock | WASMLX | `0x9147b03c16b18fc4f686f610f189f91ddf4347b4` |
| Sandisk xStock | SNDKX | `0xb63efbc28860c8097e341de1fcf59456161e9d98` |
| Wrapped Sandisk xStock | WSNDKX | `0x75e82e2884ea10f72fca777449b73377f4646219` |
| Micron xStock | MUX | `0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4` |
| Wrapped Micron xStock | WMUX | `0xe2047ee3bddb5c99ae428ab83df63f8730698e30` |
| Gold xStock | GLDX | `0x2380f2673c640fb67e2d6b55b44c62f0e0e69da9` |
| Wrapped Gold xStock | WGLDX | `0x735f1509bff25e27cd442b9bfb231324648ead9b` |
| USDC | USDC | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` |
| USDT | USDT | `0x1E4a...D41d` — **INCOMPLETE, look up on OKLink before use** |
| USDC.e | USDC.e | `0xA8CE...C035` — **INCOMPLETE, look up on OKLink before use** |

**MVP asset picks:** GLDX (gold — low-drama demo asset) and SPYX (flagship index-exposure story).

**Testnet gap:** No official USDC or xStocks testnet deployment is confirmed. Deploy a `MockERC20`
for testnet only, and switch to the real mainnet addresses above at mainnet launch — never deploy
MockERC20 to mainnet.

More xStocks tickers (NVDAX, AAPLX, TSLAX, etc.) exist further down the 27-page OKLink token
list: https://www.oklink.com/x-layer/token-list

## 5. Contracts already written and compiling — build on these

Packaged as `aegis-contracts.zip` (`src/`, `test/`, `foundry.toml`, `remappings.txt`). Compiles
clean with `forge build` (Solidity 0.8.24) after restoring the two stripped dependencies:

```
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

A fuzz test in `test/AegisVault.t.sol` proves the core non-custodial invariant (agent can never
route funds to an arbitrary address).

- `src/AegisVault.sol` — position holder. Owner deposits/withdraws freely; agent can only
  `pausePosition`, `logRiskEvaluation`, or `routeToEmergency` (no recipient parameter — it can
  only ever send to the immutable `emergencyVault` address).
- `src/EmergencyVault.sol` — receives routed funds, time-locks them (default 1 day in tests),
  pays out only to the original position owner after the lock.
- `src/PolicyRegistry.sol` — stores each position's plain-English-derived policy (drawdown bps,
  oracle deviation bps, exit % bps, mode). Only the position owner can write; the agent has no
  write access at all.
- `src/RiskOracle.sol` — wraps a Chainlink `AggregatorV3Interface` feed per asset, with staleness
  protection.
- `src/mocks/MockERC20.sol` — testnet-only mintable token.

Extend/wire these into the off-chain agent and frontend rather than redesigning the contract
architecture. Flag any suspected bug before changing core logic — the non-custodial invariant is
the most safety-critical part of this project.

## 6. Build plan phases

1. **Off-chain agent** (Node.js/TypeScript): monitoring loop (poll positions + Chainlink prices) →
   hybrid risk scoring (deterministic drawdown/deviation/volume checks + a simple z-score
   volatility layer — be explicit in code comments that this is statistical, not a trained model,
   so the pitch stays honest) → LLM-based plain-English policy parser that outputs strict JSON
   validated server-side before ever becoming calldata → execution via `routeToEmergency`, using a
   dedicated agent-role key, never the deployer key.
2. **OKX DEX integration** for the exit execution path (quote → approve-transaction → swap), both
   for UX and because it generates the trading volume the Launch Grant is scored on. Needs an OKX
   Developer Portal API key/secret/passphrase/Project ID — register early, provisioning takes time.
   Confirm X Layer's `chainIndex` via the `/supported/chain` endpoint before wiring swap calls.
3. **Frontend** (Next.js): wallet connect, deposit flow, plain-English policy composer with a
   parsed-parameter preview before signing, live risk dashboard, manual pause/emergency-exit button.
4. **Testnet deploy** on chain ID 1952, verify contracts on the explorer.
5. **Mainnet deploy** on chain ID 196, swap MockERC20 references for the real addresses in
   section 4, wire the real Chainlink feed addresses (confirm exact feed addresses via Chainlink's
   official X Layer feed directory before hardcoding).
6. **Submission**: X account launch post tagging @XLayerOfficial, then the Google Form.

## 7. Explicit non-goals for the hackathon MVP

Do not build these now — future scope, mention only in the pitch/writeup: `AgentIdentity` soulbound
NFT, agent-to-agent query API, multi-position portfolio view (single position is fine for the demo),
a separate `DecisionLogger` contract (events on `AegisVault` cover this for MVP), automatic
rebalancing, cross-chain monitoring, x402 monetization.

## 8. Key links

- Hackathon page: https://web3.okx.com/xlayer/build-x-series
- X Layer developer docs: https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/network-information
- X Layer contracts/predeploys reference: https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/contracts
- Deploy guide (Foundry/Hardhat/Truffle): https://web3.okx.com/xlayer/docs/developer/deploy-a-smart-contract/deploying-contract
- Testnet faucet: https://web3.okx.com/xlayer/faucet
- Token list / address lookup: https://www.oklink.com/x-layer/token-list
- Submission form: https://docs.google.com/forms/d/e/1FAIpQLSfgU_3zcXdxK0GJQxj33QeUWdEcAaYnieVe9p5cFDb2JFQa4Q/viewform
