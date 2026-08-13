# ✅ RESOLVED — OKX Network Probe & Demo Connectivity

**OKX DEX connectivity verified on current network (`GO`).** 
The previous transport-layer timeout was confirmed to be network-specific to the original build machine, not a code or credential defect. 

When probed via `node scripts/okx-quote-probe.mjs`:
- All OKX hosts (`web3.okx.com`, `www.okx.com`, etc.) reported **OPEN**.
- Credentials resolved from `.env` and authenticated properly.
- `OkxQuoteClient` successfully returned a live DEX quote (`1 GLDX -> USDC`, `chainIndex` 196).

> [!IMPORTANT]
> **Network Requirement for Demo & Operations:** All future OKX DEX testing, mainnet deployments, and the live demo **must run from this verified network** (or another network confirmed via `node scripts/okx-quote-probe.mjs`). Do not switch back to the original restricted network for any OKX-touching operations.

### Status: Phase 2 OKX DEX Work Unpaused
Phase 2 OKX DEX integration work is fully unpaused and active.

---

# Contracts — build & test status

**Toolchain:** Foundry 1.5.1-stable (installed to `%USERPROFILE%\.foundry\bin`, not on system PATH),
solc 0.8.33, OpenZeppelin + forge-std restored into `lib/`.

**Run tests:**
```
set "PATH=C:\Users\USER\.foundry\bin;%PATH%"
forge test
```

## Status: all 14 tests passing

```
[PASS] testFuzz_AgentCanExitAtOrBelowApprovedLimit(uint16,uint16)
[PASS] testFuzz_AgentCannotDrainToArbitraryAddress(uint16)
[PASS] testFuzz_AgentCannotExceedOwnerApprovedExitLimit(uint16,uint16)
[PASS] test_AgentCannotSetPolicyRegistry()
[PASS] test_AgentCannotWriteItsOwnPolicy()
[PASS] test_ClaimRevertsBeforeTimeLockElapses()
[PASS] test_ExitAtExactLimitAllowedOneBpOverRejected()
[PASS] test_NonAgentCannotRouteToEmergency()
[PASS] test_OnlyOriginalOwnerCanClaimFromEmergencyVault()
[PASS] test_OwnerCanAlwaysWithdrawEvenAfterAgentRoute()
[PASS] test_PausedPositionBlocksAgentButNotOwnerWithdraw()
[PASS] test_RouteRevertsAfterOwnerDeactivatesPolicy()
[PASS] test_RouteRevertsWhenPolicyRegistryNotSet()
[PASS] test_RouteRevertsWhenPositionHasNoPolicy()
```

The three fuzz invariants were additionally stressed at **25,000 runs each** (default is 256) —
75,001 total randomized cases — and all hold.

---

## Fixed: the fuzz test could never pass as written

`test/AegisVault.t.sol` panicked with `arithmetic underflow or overflow (0x11)` on every run.

**Cause — a test bug, not a contract bug.** The line

```solidity
uint256 expectedOut = (1_000e6 * exitBps) / 10_000;   // exitBps is uint16
```

combines a literal with a `uint16`, so the product is computed in a type too small to hold it and
panics. This happened *before any assertion executed*, which means **the non-custodial invariant was
never actually being verified** — the test was failing open.

**Fix (test-only, one line):** explicitly widen to `uint256` before multiplying.

```solidity
uint256 expectedOut = (1_000e6 * uint256(exitBps)) / 10_000;
```

**No core logic was changed.** `AegisVault.routeToEmergency` does its own math in `uint256`
(`p.amount * exitBps`) and was correct all along — the `-vvvv` trace confirms it routed
801,900,000 to the EmergencyVault, left 198,100,000 in the position, and never touched the
attacker address.

---

## Design observations — flagged, deliberately NOT changed

### 1. RESOLVED — policy exit ceiling is now enforced on-chain

Previously `routeToEmergency` accepted whatever `exitBps` the agent sent and never consulted
`PolicyRegistry`, so a compromised agent key could route 100% of a position even if the user's
policy said 50%. That gap is now closed:

- `AegisVault.policyRegistry` is set by an **owner-only** `setPolicyRegistry`. The agent cannot
  repoint the vault at a registry granting itself a larger allowance
  (`test_AgentCannotSetPolicyRegistry`).
- `routeToEmergency` reads `PolicyRegistry.exitAllowanceBps(positionId)` and reverts
  `ExitBpsExceedsPolicy(positionId, requested, allowed)` if the agent asks for more than the
  owner approved. A dedicated error, not a reuse of `InvalidExitBps`, so "malformed" and
  "exceeded approval" are distinguishable by the frontend and the agent's logs.
- The agent still has **no write access** to `PolicyRegistry`, so it cannot raise its own ceiling
  (`test_AgentCannotWriteItsOwnPolicy`).

**Fail-closed semantics — documented and tested.** Absence of a policy means *zero* authority,
never unlimited:

| Situation | Behavior | Test |
|---|---|---|
| No policy ever set | revert `NoActivePolicy` | `test_RouteRevertsWhenPositionHasNoPolicy` |
| Owner deactivated the policy | revert `NoActivePolicy` | `test_RouteRevertsAfterOwnerDeactivatesPolicy` |
| Registry not yet wired | revert `PolicyRegistryNotSet` | `test_RouteRevertsWhenPolicyRegistryNotSet` |

The boundary is exact: `exitBps == allowedBps` succeeds, `allowedBps + 1` reverts
(`test_ExitAtExactLimitAllowedOneBpOverRejected`).

**Pitch wording is now literally true**: both the *destination* and the *amount* of any
agent-triggered movement are constrained on-chain by what the user approved.

Note this is a **two-step deployment** — `PolicyRegistry`'s constructor takes the vault address,
so the vault can only be pointed back at it afterwards. `script/DeployTestnet.s.sol` does both in
one batch so a deployment can't be left half-wired; if step 2 were ever missed, the agent would
have zero authority rather than unchecked authority.

### 2. Misleading error selectors (cosmetic, no safety impact)

- `routeToEmergency` reverts `PositionDoesNotExist` when a position is merely *paused* — the test
  even comments "PositionDoesNotExist reused as 'frozen'". A dedicated `PositionPaused` error would
  make debugging and the frontend's error surface much clearer.
- `pausePosition` reverts `NotAgent` when the caller is neither the agent nor the owner, which
  misdescribes the failure.

Both are error-naming only; behavior is correct. Left alone pending your call.

### 3. Non-issues, verified

- `EmergencyVault.setClaimDelay` cannot retroactively extend an existing lock — `claimableAt` is
  snapshotted at `notifyDeposit` time. Correct.
- `MockERC20.mint` is unpermissioned, which is fine for testnet and it's clearly marked
  testnet-only. **Must never reach mainnet** (see `PROJECT_BRIEF.md` §4).

---

## ✅ RESOLVED — Network Diagnosis & Environment Setup

**Network verified (`GO`).** The OKX host reachability issue was isolated to the original build environment (ISP/jurisdiction transport filter). 
Probing from the current working network confirmed:
- TCP reachability to `web3.okx.com` & `www.okx.com` is **OPEN**.
- Signed quotes and `OkxQuoteClient` function end-to-end (quote ID returned for GLDX -> USDC on `chainIndex` 196).
- V5 API deprecation messages are informational; `OkxQuoteClient` relies on the functional SDK/V6 path.

### Operational Rule
All future OKX DEX testing, mainnet deployments, and live demo runs **must take place on this verified network** (or another network verified via `node scripts/okx-quote-probe.mjs`). Do not attempt OKX operations from the original restricted network.

---

## ✅ RESOLVED — GLDX & SPYX Sourced from OKX DEX Quotes (Chainlink Dependency Removed)

The agent off-chain risk engine now reads reference prices for GLDX and SPYX directly from the **OKX DEX Quote Client** (`OkxQuoteClient`), removing any dependency on third-party Chainlink Aggregator feeds.

- **Architecture:** The off-chain agent queries `OkxQuoteClient` directly for real-time asset pricing against USDC (`chainIndex` 196). `RiskOracle.sol` remains in the repository as a generic fallback wrapper.
- **Fail-Safe Discipline:** If an OKX DEX quote call fails or times out, the agent logs a warning and skips the assessment pass — missing or stale price data is NEVER treated as 0 or price unchanged.
- **Verified On-Chain:** Proven via a live drawdown simulation on X Layer Testnet (`testnet-live-drawdown.mjs`). Upon detecting a 20% drawdown via the DEX quote price source path, the agent broadcasted a live `routeToEmergency` transaction on-chain:
  - **Transaction Hash:** `0xee4437f1503b394c384f62b2d4d23daa915a084025529683b56ae9e90980040e`
  - **Outcome:** Position #29 balance reduced from 10 tGLDX to 5 tGLDX (50% emergency exit), claim created on `EmergencyVault`.

### Redefinition of "Oracle Deviation" Check
Because GLDX and SPYX reference prices now originate directly from single-source OKX DEX quotes rather than comparing two separate multi-source feeds (which no longer exist), the **Oracle Deviation** check is redefined to measure **consecutive-poll quote volatility**:
- **Mechanism:** The risk engine compares the current poll's DEX quote (`currentPrice`) against the previous poll's DEX quote (`previousQuote` / `referencePrice`).
- **Trigger Condition:** If the quote jumps up or down suddenly between consecutive monitoring passes by an amount equal to or exceeding `oracleDeviationThresholdBps` (e.g. > 2.00%), an `oracle_deviation` breach is triggered.
- **Compatibility:** The on-chain contract parameters, policy schemas (`oracleDeviationThresholdBps`), CLI output, and UI plain-English descriptions remain **100% identical and unchanged** — only the underlying reference calculation source changes from multi-oracle comparison to consecutive-poll quote jump detection.

---

## Open items blocking later phases


| Needed for | Item | Status |
|---|---|---|
| Testnet verify | OKLink verifier API URL for `forge verify-contract` | **RESOLVED — all four contracts verified.** URL and gotchas in `foundry.toml`; one-shot runner is `scripts\verify-testnet.cmd`. Needed **no API key**: the testnet route ignores the value (proved by verifying with a deliberately invalid key). The real trap was the compiler version — the floating `^0.8.24` pragma actually built with **0.8.33**, optimizer **off** |
| Mainnet verify | Mainnet contract verification strategy | **RESOLVED — Primary & Fallback set.** <br>• **Primary**: X Layer Data API (`POST /api/v5/xlayer/contract/verify-source-code` and `check-verify-result`, `chainShortName: XLAYER`) — fully credentialed and tested with existing `.env` keys.<br>• **Fallback**: OKLink verifier via `forge verify-contract` — proven on testnet, no key required on testnet (mainnet behavior unconfirmed). Separate OKLink dashboard key setup is dropped. |
| Mainnet deploy | Full USDT address | **RESOLVED.** Verified on OKX DEX V6 (`chainIndex` 196): `0x1e4a5963abfd975d8c9021ce480b42188849d41d` (`USDT_Bridged` / Tether USD) |
| Mainnet deploy | Full USDC / USDC.e address | **RESOLVED.** Verified on OKX DEX V6 (`chainIndex` 196): `0x74b7f16337b8972027f6196a17a631ac6de26d22` (`USDC_Bridged` / USD Coin) |
| `RiskOracle` wiring | Chainlink feed addresses for GLDX / SPYX on X Layer | **RESOLVED / NOT USED.** Dependency removed — GLDX & SPYX reference prices are fetched directly via `OkxQuoteClient` (OKX DEX quotes). |
| Phase 2 (OKX DEX) | OKX Developer Portal API key / secret / passphrase / Project ID | All four present in **root `.env`** and verified via network probe |
| Phase 2 (OKX DEX) | **Confirm OKX is reachable from the demo network** | **RESOLVED — Verified (`GO`).** Reached OKX hosts and returned real DEX quotes (`chainIndex` 196) for both GLDX (`0x2380...9da9`) and SPYX (`0x90a2...dd48`) to USDC (`HTTP 200 code=0`). Note: `all-tokens` endpoint is a curated top-liquidity list, while `getQuote` routes all RWA pairs seamlessly. Demo & ops must stay on verified network |
| Phase 2 (OKX DEX) | X Layer `chainIndex` | **RESOLVED.** Verified `chainIndex` 196 for X Layer mainnet |
| Phases 4 & 5 | Deployer key + separate agent-role key (never the same key) | Not yet created — see `DEPLOY_TESTNET.md` §2 |

---

## Deployment

Chain IDs verified against the live RPCs: **testnet 1952**, **mainnet 196** — both match the
brief. A full dry-run of `script/DeployTestnet.s.sol` passed against live testnet state at a cost
of ~0.000415 OKB. See `DEPLOY_TESTNET.md` for the runbook.
