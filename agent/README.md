# Aegis Agent

Off-chain risk guardian for Aegis positions on X Layer. Polls positions and
Chainlink prices, scores risk, and acts only inside the policy each user
approved on-chain.

## Run it

```bash
cd agent
npm install
cp ../.env.example ../.env   # then fill in the deployed addresses
npm run dev                  # monitoring loop
npm test                     # 55 tests

npm run parse -- "if drawdown > 8% in 24h or oracle deviation > 2%, exit 50% to USDC"
```

`npm run parse` needs no chain connection or API key, which makes it the
easiest thing to demo.

## Where the AI actually is

The LLM does one job: turn a plain-English policy into structured parameters
(`src/policy/parser.ts`). Its output is untrusted — parsed as JSON, validated
against a strict zod schema (`src/policy/schema.ts`), and shown to the user,
who signs it with their own wallet. `PolicyRegistry.setPolicy` is owner-only,
so a hallucinated policy cannot take effect on its own.

The risk engine (`src/risk/engine.ts`) is **not** ML. It is deterministic
threshold checks plus a rolling z-score. The code says so, and the pitch
should too. The z-score layer can raise the score and escalate to a pause; it
can never authorize an exit, because only a breach of a user-approved
threshold may move funds.

Without an `OPENAI_API_KEY` the parser falls back to regex matching. The
fallback is never silent: `source` and `warnings` report which path ran and
the confidence drops below the review threshold.

## OKX DEX integration

Quotes are **read-only**. `OkxQuoteClient` is constructed without the SDK's
`evm` wallet config, so it has no signing capability at all — "quotes only" is
structural, not a convention. Its single method returns a reference price and
there is no code path from a quote to a fund movement.

The quote asks for the position's *actual* size, not a nominal one token,
because price impact scales with size — a 1-token quote would understate what
a large position can really exit at, hiding the slippage risk that matters
most. Both sides are normalized by their own decimals before dividing;
skipping that would scale an 18-decimal asset quoted into 6-decimal USDC by
10^12 and trigger an instant false exit.

Every failure path returns `undefined` rather than a fallback number. A zero
or stale price read against a live oracle would look like 100% deviation and
fire an exit on what is really just missing data.

Credentials live in `agent/.env` or the root `.env` (agent-local wins on
overlap). Both are gitignored.

## One risk event, one exit

The risk engine is stateless: while the price sits below the user's threshold,
"drawdown > 8%" is true on *every* pass, so it keeps returning `exit`. Acting on
each of those turns one user instruction into an unbounded series of
withdrawals. This was not theoretical — a live testnet run took a position
200 → 100 → 50 tokens in consecutive passes before it was stopped, and the
mocked test suite passed the whole time, because the bug only appears when the
same true condition is evaluated twice.

The monitor now latches each exit against the drawdown event that caused it:

- **Same event, price flat or slightly lower** → suppressed, with the reason logged.
- **Cooldown** (`EXIT_COOLDOWN_SECONDS`, default 900) → a floor on how fast the
  agent can compound its own actions, regardless of price.
- **Genuine escalation** — another full threshold below the price at the last
  exit, after the cooldown → acts again, which is what the policy intends.
- **Recovery above the threshold** → re-arms immediately for the next event.

The re-arm check runs on every pass rather than only when an exit is proposed.
At a recovered price the engine returns `none`, so a re-arm gated behind an exit
proposal would never run and the latch would stay set forever — silently
disarming the guardian after its first action. A regression test covers exactly
that case; it failed on the first version of this fix.

Verified on X Layer testnet with a mock Chainlink feed: one 12% drop produced
exactly one `routeToEmergency`, followed by suppressed assessments while the
price stayed down.

## Safety model


The agent's authority is deliberately narrow, enforced in three places:

1. **On-chain** — `routeToEmergency` has no recipient parameter, so funds can
   only reach the immutable `emergencyVault`. Proven by fuzz test
   `testFuzz_AgentCannotDrainToArbitraryAddress`.
2. **Executor** — re-reads the policy from chain immediately before acting and
   clamps `exitBps` to the owner's current allowance, then simulates before
   sending.
3. **DRY_RUN** — on by default. A fresh checkout evaluates and logs but sends
   nothing until you explicitly set `DRY_RUN=false`.

Startup refuses to proceed unless the RPC chain ID matches, the key holds the
`agent` role, and `vault.policyRegistry()` matches the configured address. A
mismatch would mean every exit reverts, and finding that out during a real
drawdown is the worst possible time.

Use a dedicated agent key, never the deployer key. The agent only ever needs
gas, never token allowances.

## Known limits

- **Price history is in-memory.** `Position` stores no price data on-chain, so
  peak tracking resets on restart and a drawdown already underway reads as 0%
  until a new peak forms. This delays an exit, never causes an unrequested one
  — the safe direction. Persistence is post-MVP.
- **The oracle-deviation check is mainnet-only.** It uses an OKX DEX quote as
  its independent reference price, but the aggregator indexes mainnet
  liquidity only (chainIndex 196; there is no 1952 entry). On testnet, and
  whenever a quote fails, `referencePrice` stays undefined and the check is
  skipped rather than comparing the oracle against itself. Drawdown and
  volatility checks are unaffected.
- **Position enumeration is a linear scan** over `nextPositionId`. Fine at MVP
  scale, would need an indexer at volume.

## Layout

```
src/
  config.ts            env validation, network constants (196 / 1952)
  logger.ts            structured logs, BigInt-safe
  monitor.ts           polling loop, peak + history tracking
  executor.ts          the only component that sends transactions
  chain/
    abis.ts            narrow ABIs, verified against `forge inspect`
    client.ts          viem clients w/ RPC fallback + startup assertions
  policy/
    schema.ts          strict zod schema for model output
    parser.ts          LLM parser + deterministic fallback
  risk/
    engine.ts          deterministic checks + statistical layer
  okx/
    quote.ts           read-only DEX quotes -> reference price
  cli/
    parse-policy.ts    demo CLI
test/
  engine.test.ts       19 tests
  policy.test.ts       22 tests
  quote.test.ts        10 tests
  monitor.test.ts       4 tests  exit de-duplication (from a live bug)

```
