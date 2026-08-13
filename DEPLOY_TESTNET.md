# Testnet deploy runbook — X Layer Testnet, chain ID 1952

Verified against the live network on Aug 9, 2026:

```
cast chain-id --rpc-url xlayer_testnet   ->  1952   matches PROJECT_BRIEF.md section 3
cast chain-id --rpc-url xlayer_mainnet   ->  196    matches PROJECT_BRIEF.md section 3
```

A full dry-run simulation against the live testnet RPC **passed**, deploying and wiring all
seven contracts. Estimated cost:

```
gas price      0.04 gwei
total gas      10,362,407
cost           ~0.000415 OKB
```

That is far below the faucet's 0.2 OKB/day, so a single faucet claim covers many deploys.

---

## 1. Prerequisites

Foundry is installed at `%USERPROFILE%\.foundry\bin` and is **not** on the system PATH.
Every command below assumes you've prepended it for the session:

```bat
set "PATH=C:\Users\USER\.foundry\bin;%PATH%"
```

## 2. Create two separate keys

The deployer owns the contracts; the agent only ever holds the narrow agent role. Keeping them
separate is what makes `setAgent` rotation meaningful — one key holding both roles would collapse
that separation, so the deploy script **rejects** an agent address equal to the deployer.

```bat
cast wallet new          :: run twice - once for deployer, once for agent
```

Copy `.env.example` to `.env` and fill in:

- `DEPLOYER_PRIVATE_KEY` — the deployer's key
- `AGENT_ADDRESS` — the agent's **address only**. Its private key belongs with the off-chain
  agent (Phase 1) and is never needed for deployment.

`.env`, `*.key`, and `keystore/` are gitignored. So are `cache/` and `broadcast/`, which matters
because `forge script` writes a "sensitive values" file into `cache/` on every run.

## 3. Fund the deployer

https://web3.okx.com/xlayer/faucet — 0.2 OKB/day per wallet. Connect your wallet on chain 1952
**before** claiming, or the faucet will target the wrong network.

```bat
cast balance <DEPLOYER_ADDRESS> --rpc-url xlayer_testnet
```

## 4. Dry run (no broadcast, but simulated against real chain state)

```bat
forge script script/DeployTestnet.s.sol:DeployTestnet --rpc-url xlayer_testnet -vvvv
```

## 5. Broadcast

```bat
forge script script/DeployTestnet.s.sol:DeployTestnet --rpc-url xlayer_testnet --broadcast -vvvv
```

Record the seven addresses from the console output — the agent and frontend both need them.

## 6. Verify on the explorer

X Layer verifies through OKLink's plugin endpoint using Foundry's dedicated `oklink` verifier
(not the etherscan-compatible flow), so verification is driven by CLI flags rather than an
`[etherscan]` block in `foundry.toml`.

**Requires an OKLink API key** — request one in OKLink account settings. The same key covers
testnet and mainnet, so get it before mainnet launch rather than during it.

```bat
forge verify-contract <ADDRESS> src/AegisVault.sol:AegisVault ^
  --verifier oklink ^
  --verifier-url https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER_TESTNET ^
  --api-key %OKLINK_API_KEY% ^
  --constructor-args $(cast abi-encode "constructor(address,address,address)" <EMERGENCY> <AGENT> <OWNER>)
```

Swap the trailing path segment per network:

| Network | Chain ID | Path segment |
|---|---|---|
| X Layer Testnet | 1952 | `XLAYER_TESTNET` |
| X Layer Mainnet | 196 | `XLAYER` |

Constructor args per contract:

| Contract | Constructor |
|---|---|
| `EmergencyVault` | `(uint256 claimDelay, address owner)` |
| `AegisVault` | `(address emergencyVault, address agent, address owner)` |
| `PolicyRegistry` | `(address vault)` |
| `RiskOracle` | `(address owner)` |
| `MockERC20` | `(string name, string symbol, uint8 decimals)` |

## 7. Post-deploy smoke test

```bat
:: agent role is set correctly
cast call <VAULT> "agent()(address)" --rpc-url xlayer_testnet

:: registry is wired - if this returns the zero address, routeToEmergency
:: will revert PolicyRegistryNotSet and the agent has no authority at all
cast call <VAULT> "policyRegistry()(address)" --rpc-url xlayer_testnet

:: emergency vault is immutable and correct
cast call <VAULT> "emergencyVault()(address)" --rpc-url xlayer_testnet

:: vault is authorized to notify the emergency vault
cast call <EMERGENCY> "authorizedVaults(address)(bool)" <VAULT> --rpc-url xlayer_testnet
```

Mint yourself test tokens (`MockERC20.mint` is intentionally unpermissioned on testnet):

```bat
cast send <tGLDX> "mint(address,uint256)" <YOUR_ADDR> 1000000000000000000000 ^
  --rpc-url xlayer_testnet --private-key %DEPLOYER_PRIVATE_KEY%
```

---

## Deliberately deferred

**Chainlink feeds are not set.** `RiskOracle` deploys unconfigured. Until a feed is set,
`getPrice` reverts cleanly with `NoFeedForAsset` — the safe failure mode. A guessed address
would instead feed garbage prices into risk decisions, so pull the real ones at the moment you
wire `setPriceFeed`, from either:

- https://docs.chain.link/data-feeds/price-feeds/addresses (filter to X Layer)
- https://data.chain.link/feeds (network filter set to X Layer)

Do not take these from search results, memory, or training data.

**Oracle architecture: Data Feeds for the MVP, deliberately.** OKX's RWA/AI-track messaging for
X Layer highlights Chainlink **Data Streams** (pull-based — off-chain report fetch plus an
on-chain Verifier call). `RiskOracle.sol` implements classic **Data Feeds** (push-based
`AggregatorV3Interface`), which is simpler and already built and tested. The MVP stays on Data
Feeds. If there's genuine spare time near the end, Data Streams would be **additive** — a second
oracle path alongside this one, never a replacement for the working path.

**Mainnet is a separate script.** `DeployTestnet` hard-requires `block.chainid == 1952` and
aborts otherwise, so it cannot accidentally put `MockERC20` on mainnet. The mainnet script will
point at the real token addresses in `PROJECT_BRIEF.md` section 4 and deploy no mocks — and still
needs the two truncated addresses (USDT, USDC.e) resolved from OKLink first.
