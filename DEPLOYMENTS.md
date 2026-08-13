# Aegis — Deployment Record

## X Layer Testnet (chain ID 1952)

Deployed 2026-08-09 with Foundry (`script/DeployTestnet.s.sol`).
RPC: `https://testrpc.xlayer.tech/terigon`

**Compiler: solc 0.8.33** (`v0.8.33+commit.64118f21`), optimizer **disabled**,
evmVersion `prague`. Note the source pragma is a *floating* `^0.8.24`, so the
version that actually ran is whatever Foundry resolved — 0.8.33, not 0.8.24.
This file previously said 0.8.24; that was the pragma, not the compiler, and
submitting it to a verifier would have failed with a bytecode mismatch.
Confirmed byte-for-byte against on-chain code by `scripts/verify-xlayer.mjs preflight`.

### Primary deployment (production-shaped, 24h time-lock)

All four are **source-verified on OKLink** (see "Contract verification" below).

| Contract | Address | Verified |
|---|---|---|
| AegisVault | `0xc96d34534270B3ff41b5b4e30731c980FdfEd8DB` | ✓ |
| EmergencyVault | `0xA33e3050b185B9289C1732d71C53B0c36A25Fe61` | ✓ |
| PolicyRegistry | `0x90346e8ebB6fb000c97BbcdE93D7C5C192396Fd2` | ✓ |
| RiskOracle | `0xEB0538B1c199eC063B7E6e785572ed4402D94074` | ✓ |

Testnet-only mock assets (**never deploy these to mainnet**):

| Mock | Address |
|---|---|
| tUSDC | `0x7d2a9f61f641538787ba6052A8C496C749AfBfd1` |
| tGLDX | `0xa7218E99738F3d83f6c2B85b2b5f13f6E709a3DF` |
| tSPYX | `0x28AD1826640A3B840bD13e0C0900dE8C75C6491C` |

### Roles

| Role | Address |
|---|---|
| Owner / deployer | `0x296136A59463174f02898dE2C53b4a036eFC8c5e` |
| Agent | `0xF14671A7966F8877fa597877D2072e8841d0bb52` |

The agent key is a **separate key from the deployer** — the deploy script refuses
to run if they match. The agent holds a small gas float only; it has no authority
to move funds anywhere except the immutable EmergencyVault address.

### Secondary deployment (60s time-lock, used only to prove the claim path live)

Time cannot be warped on a live chain, so a throwaway instance with a 60-second
delay was deployed to prove that a claim *succeeds* after expiry — the primary
instance can only prove that an early claim is *rejected* without waiting 24h.

| Contract | Address |
|---|---|
| AegisVault | `0x7B82aa3ab8e73A10B036B714e77899D35833Ce25` |
| EmergencyVault | `0xF7089dd83A28Bae34F253E4e10EB3a7310313313` |
| PolicyRegistry | `0x0E863831454E9c430B939C45f872af340b7fbbed` |
| tGLDX (mock) | `0xbFEA452E4CB0F37C4bA775879Ede906C82fce5C2` |

---

## Contract verification (OKLink) — DONE

All four core contracts are source-verified on X Layer testnet:

```
AegisVault:     Pass - Verified
EmergencyVault: Pass - Verified
PolicyRegistry: Pass - Verified
RiskOracle:     Pass - Verified
```

Reproduce with one command (idempotent — re-running reports "already verified"):

```
scripts\verify-testnet.cmd          verify all four
scripts\verify-testnet.cmd check    status only
```

### What actually unblocked this

The blocker was recorded as "waiting on an OKLink API key". That was wrong on
both counts, established by direct test rather than assumption:

1. **The testnet verification endpoint requires no API key at all.** Verified by
   control experiment: submitting the tGLDX mock with the deliberately invalid
   key `totally-invalid-key-12345` moved it from `Fail - Unable to verify` to
   `Pass - Verified`. The `--api-key` flag is required by Foundry's CLI, but
   OKLink's `verify-source-code-plugin/XLAYER_TESTNET` route does not check it.
   Any non-empty placeholder works. **This finding is scoped to testnet only —
   see "Mainnet verification" below.**
2. **The compiler version in this file was wrong** (0.8.24 vs the actual 0.8.33).
   That, not the key, is what would have made a verification attempt fail.

### Mainnet verification — deliberately NOT attempted yet

Mainnet (`XLAYER`, chain 196) verification is **untested on purpose**, and is not
being pre-tested against the testnet contracts. There is nothing deployed to
mainnet to verify, and probing the mainnet route with testnet addresses would
only produce a misleading result.

When the mainnet deploy happens, **re-establish every finding from scratch with
the same rigor** rather than inheriting testnet's answers:

1. **Re-run the bytecode preflight first** — `node scripts/verify-xlayer.mjs preflight`
   against the mainnet addresses. Confirm the local build matches the deployed
   runtime code byte-for-byte (immutables masked) *before* submitting anything.
   The mainnet build may resolve a different solc version than 0.8.33, exactly as
   it drifted from the documented 0.8.24 here.
2. **Assume mainnet requires a real `OKLINK_API_KEY` until proven otherwise.**
   The keyless behaviour observed on `XLAYER_TESTNET` is a property of that
   route, not a documented guarantee. Test it explicitly with a deliberately
   invalid key, the same control used here — if it verifies, it's keyless; if it
   returns an auth error, get a key from the OKLink dashboard.
3. **Verify the result independently.** A `Response: ok` on submission is not
   proof — this endpoint returns a GUID that is just the contract address. Only
   `Pass - Verified` from `verify-check`, plus a control on an unrelated
   unverified address returning `Fail`, establishes that the check discriminates.

### Verification API probe & key scoping results

Probing the verification endpoints directly from the working network with corrected parameters:
1. **X Layer Data API (`web3.okx.com`) — CONFIRMED WORKING**:
   - **Submit**: `POST https://web3.okx.com/api/v5/xlayer/contract/verify-source-code` with `chainShortName: "XLAYER"` returned **`HTTP 200 code=0`** and generated valid verification GUIDs (e.g., `5e229428eaf147bcb8c351c46982ff3d`).
   - **Poll**: `POST https://web3.okx.com/api/v5/xlayer/contract/check-verify-result` (POST with `{ chainShortName: "XLAYER", guid }`) returned **`HTTP 200 code=0`** and status.
2. **OKLink Explorer API**: Returned `HTTP 401 (Invalid OK-ACCESS-KEY)`, confirming those credentials are scoped to the DEX Aggregator / Web3 APIs, not OKLink explorer.

**Mainnet Verification Strategy**:
- **Primary Route**: X Layer Data API (`POST /api/v5/xlayer/contract/verify-source-code` and `check-verify-result` on `web3.okx.com`) — fully credentialed and tested with existing `.env` HMAC keys (`HTTP 200 code=0`).
- **Fallback Route**: OKLink verifier via `forge verify-contract` — proven on testnet, no key required on testnet (mainnet behavior unconfirmed). All fallback scripts and code remain intact in the codebase. Pursuit of a separate OKLink dashboard key is dropped.

---

## Post-deploy verification (all run against live chain state, not local tests)

### Wiring

| Check | Result |
|---|---|
| `AegisVault.agent()` | agent address ✓ |
| `AegisVault.policyRegistry()` | registry address ✓ |
| `AegisVault.emergencyVault()` | emergency vault address ✓ |
| `AegisVault.owner()` | deployer ✓ |
| `EmergencyVault.authorizedVaults(vault)` | `true` ✓ |
| `EmergencyVault.claimDelay()` | `86400` ✓ |
| `PolicyRegistry.vault()` | points back at AegisVault ✓ |

### Happy path (primary instance, position 1)

1. `approve` + `openPosition(tGLDX, 100e18)` → position 1 opened
2. `setPolicy(1, 800, 200, 5000, Conservative)` → stored as `800 200 5000 0 true`
   (8% drawdown, 2% oracle deviation, 50% exit)
3. Agent `routeToEmergency(1, 5000)` → 50e18 moved to EmergencyVault, claim
   recorded with `claimableAt` = +24h, position balance 50e18
4. Owner `withdraw(1, 50e18)` → succeeded, **not** gated by the time-lock

### Negative tests — each reverted with the specific expected custom error

| Attempt | Selector | Decoded |
|---|---|---|
| Agent routes 100% when policy allows 50% | `0x38b1c8d9` | `ExitBpsExceedsPolicy(1, 10000, 5000)` |
| Agent calls `withdraw` | `0x606840e0` | `NotPositionOwner(1, agent)` |
| Agent calls `setPolicy` | `0x606840e0` | `NotPositionOwner(1, agent)` |
| Owner claims before lock expiry | `0x33ef4963` | `ClaimNotYetAvailable(unlockAt, now)` |
| Claim same entry twice | `0x6bd4745f` | `AlreadyClaimed(1, 0)` |

Selectors were decoded against the source signatures rather than assumed —
`ExitBpsExceedsPolicy` in particular confirms the *policy clamp* fired, not an
incidental revert.

### Full time-lock cycle (secondary instance, 60s delay)

Route 50% → early claim rejected → wait out lock → `claim(1, 0)` **succeeded**,
owner received 50e18, EmergencyVault balance returned to 0, claim marked
`claimed = true`, and the repeat claim reverted.

**Net effect:** the agent moved user funds only into the time-locked vault, only
up to the percentage the user themselves authorised, and the funds landed back
with the owner and nobody else.

---

## Off-chain agent against the live deployment

`npm test` in `agent/`: **51/51 passing** (3 files).

Running the agent against the deployed testnet contracts (`DRY_RUN=true`), all
four startup assertions passed before the first monitoring pass:

1. RPC chain ID is actually 1952
2. the configured key genuinely holds the agent role on the vault
3. the vault's `policyRegistry()` is set **and** matches `.env`
4. agent gas balance is non-zero (0.0199 OKB)

It then correctly reported that OKX DEX deviation checks stay **skipped** on
testnet, because the aggregator indexes mainnet liquidity only — it declines to
compare against a chain OKX is not quoting rather than inventing a number.

### Fail-closed behaviour, observed live

With a funded position 2 (200e18 tGLDX, policy set) the monitoring pass logged:

```
[WARN] No usable price for asset (feed unset or stale)  → NoFeedForAsset
[WARN] Skipping assessment - no price available          positionId: 2
[DEBUG] Monitoring pass complete                         positionsAssessed: 0
```

The agent saw a real position it had authority over, could not obtain a
trustworthy price, and **did nothing**. No price means no assessment means no
action — the failure mode is inaction, never action on a bad number.

---

## Known gaps before mainnet


- ~~Contract verification on OKLink is not done~~ — **DONE** for all four testnet
  contracts, and it needed no API key. See "Contract verification" above.
  Mainnet verification is intentionally deferred to the mainnet deploy itself,
  and must be re-established with a fresh bytecode preflight and a fresh
  key-requirement test — do not assume testnet's keyless behaviour carries over.
- ~~The OKX DEX integration cannot work from the original build network~~ — **RESOLVED.** Verified working on current network via `node scripts/okx-quote-probe.mjs` (`GO`, returned quote `2920163260507730001`). All future OKX DEX testing, mainnet deploy, and the live demo must remain on this verified network.
- ~~RiskOracle has no feeds set / Chainlink dependency~~ — **RESOLVED / REMOVED.** Reference prices for GLDX and SPYX are read directly from `OkxQuoteClient` (OKX DEX quotes). The off-chain agent queries OKX DEX quotes directly and enforces fail-safe handling (skipping assessment if quote calls fail or time out). Verified on-chain with live exit tx `0xee4437f1503b394c384f62b2d4d23daa915a084025529683b56ae9e90980040e`.
- **Mainnet deploy must use a freshly generated deployer key.** The key currently
  in `.env` was pasted through chat and must be treated as compromised — it is
  fine for throwaway testnet contracts, and must never hold mainnet funds.
- Mainnet deploy must swap mock assets for the real addresses in `PROJECT_BRIEF.md`
  section 4 (MVP picks: GLDX `0x2380f2673c640fb67e2d6b55b44c62f0e0e69da9`,
  SPYX `0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48`).

---

## X Layer Mainnet (chain ID 196)

Deployed 2026-08-13 with Foundry (`script/DeployMainnet.s.sol`).
RPC: `https://rpc.xlayer.tech`

**Compiler: solc 0.8.33** (`v0.8.33+commit.64118f21`), optimizer **disabled**, evmVersion `prague`.

### Primary Mainnet Deployment

All four core mainnet contracts are **source-verified on OKLink**.

| Contract | Address | Verified | OKLink Explorer Link |
|---|---|---|---|
| AegisVault | `0x8066b72f9E87Ca2CFD29e41D6DEd92f6bD1aC675` | ✓ `Pass - Verified` | [OKLink AegisVault](https://www.oklink.com/x-layer/address/0x8066b72f9E87Ca2CFD29e41D6DEd92f6bD1aC675) |
| EmergencyVault | `0x55E943aeC4FB74Dd5c97a85BacddBDa4B98B5De2` | ✓ `Pass - Verified` | [OKLink EmergencyVault](https://www.oklink.com/x-layer/address/0x55E943aeC4FB74Dd5c97a85BacddBDa4B98B5De2) |
| PolicyRegistry | `0xf5c1c62bEEc5CDB4D3b596649C78f513BA5C869a` | ✓ `Pass - Verified` | [OKLink PolicyRegistry](https://www.oklink.com/x-layer/address/0xf5c1c62bEEc5CDB4D3b596649C78f513BA5C869a) |
| RiskOracle | `0x2a017C7eb8030eA7150a62Abb313cb4E358d1DA6` | ✓ `Pass - Verified` | [OKLink RiskOracle](https://www.oklink.com/x-layer/address/0x2a017C7eb8030eA7150a62Abb313cb4E358d1DA6) |

### Supported Real Mainnet Assets

No MockERC20 tokens are included on mainnet:

| Asset | Address | Status |
|---|---|---|
| GLDX | `0x2380F2673C640fB67E2d6B55B44C62F0E0e69DA9` | ✓ Supported |
| SPYX | `0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48` | ✓ Supported |
| USDC | `0x74b7F16337b8972027F6196A17a631aC6dE26d22` | ✓ Supported |

### Roles & Security Controls

| Role | Address |
|---|---|
| Owner / Deployer | `0x3A29893814c82A6047E4Aa56dec640A5e65985c1` |
| Agent Role | `0xF14671A7966F8877fa597877D2072e8841d0bb52` |

### Verification Path & Credentials

- **Verification Endpoint**: Verified via **X Layer Data API** (`POST https://web3.okx.com/api/v5/xlayer/contract/verify-source-code` with `chainShortName: XLAYER`).
- **Authentication**: **Real API Credentials Required**. Unlike testnet's keyless route behavior, mainnet submission required active API keys (`OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_API_PASSPHRASE`, `OKX_PROJECT_ID`) with signed HMAC-SHA256 headers (`OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`).
- **Preflight Bytecode Verification**: Pre-submission preflight (`scripts/verify-mainnet-xlayer.mjs preflight`) confirmed a **100% exact match** between local build artifacts (`solc 0.8.33`, optimizer disabled, `evmVersion prague`) and on-chain runtime bytecode (masked immutables).

### Known Limitations & Testing Scope

- **Deployer Gas Balance**: `0.0113226 OKB` (~$0.55 USD) is available in the deployer wallet, which provides sufficient gas buffer for standard mainnet transactions (~0.0003 OKB/tx).
- **Real Asset Deposit/Withdraw Round Trip**: **Explicit Known Limitation**. Neither the deployer wallet (`0x3A29893814c82A6047E4Aa56dec640A5e65985c1`) nor agent wallet (`0xF14671A7966F8877fa597877D2072e8841d0bb52`) holds live mainnet GLDX, SPYX, or USDC tokens on X Layer Mainnet (`balanceOf = 0.0`). As acquiring live mainnet asset tokens was not feasible at deployment time, the real-asset `deposit` $\rightarrow$ `withdraw` round trip was **skipped** and is explicitly recorded here as an unverified execution path on mainnet. All contract wiring, ownership assertions, and policy signature flows were verified on-chain.



