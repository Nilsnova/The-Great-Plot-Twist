# MP-ECO-02 Island treasury foundation

> **What this is:** exact island/run accounts and atomic financial primitives for the shared economy.
>
> **Who uses it:** the economy resolver, permission layer and later shared purchase/wave/Harbor tasks.

- **Status:** in progress.
- **Branch:** `feat/mp-eco-02-treasury`.
- **Issue:** [MP-ECO-02 #494](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/494), epic #492; accepted target in documentation PR #491.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Reviewer:** a different human teammate, not yet assigned.

## Why

Personal wallets cannot fund a persistent shared island without conflating the actor and payer. This foundation stores a separate account for each island/run and one immutable record for every cash or commitment change. It introduces no automatic admission, live migration or game-route conversion.

## What

- Add persisted `island_economy_state`, immutable-identity `island_economy_accounts` and append-only `island_treasury_transactions`.
- Store finite integral PostgreSQL `numeric` balances without a gameplay ceiling. Python uses integers; JSON money/revision fields are canonical decimal strings.
- Define `EconomyContext` and `resolve_economy_context(admin, actor_id, island_owner, *, expected_epoch=None)` in `server.island.treasury`. Resolution distinguishes legacy only after a successful known-island read; database failure never means legacy. Membership is the permission layer's responsibility.
- Supply server-only explicit admission, spend, origin credit, reserve and settlement primitives. Future purchases must call primitives within the same SQL transaction as the asset mutation, never debit over the network and then perform another mutation.
- Keep original personal wallets, ledger and legacy runtime untouched. No route calls the new admission function in this change.

**Likely files:** `backend/server/island/treasury*.py`, focused tests, and additive migrations `20261118050000_island_treasury.sql` / `20261118050100_island_treasury_functions.sql`.

## Accounting and identity

`balanceCoins` includes held principal, `committedCoins` is open principal, and `availableCoins = balanceCoins - committedCoins`. A normal purchase of price `q` changes `(balance, committed)` by `(-q, 0)`. Opening principal `s` with fee `f` requires `available >= s + f` and changes `(-f, +s)`. Settlement with verified returned payout `p` changes `(+p-s, -s)`; loss has `p=0`, principal refund `p=s`. Returned payout includes returned principal and is already net of any closing fee. The product caller computes that fee exactly once; the treasury does not deduct it again. A fee refund is included only when the product contract grants it.

Each ledger row binds account, run epoch, actor, operation UID, reason, immutable origin reference, request fingerprint, both deltas and balances/revision at commit. A reserve row holds principal and fee. A settle row uniquely resolves its source reserve; no mutable product row or second release can invent/reuse held principal. Retry returns the original receipt and fresh account state; altered payload for an existing key fails without mutation. Deterministic reason/reference uniqueness also protects canonical rewards under different request UIDs.

The persisted mode pointer pins the current account/epoch and active/paused admission. Retired accounts reject new member spending/reservations but still accept checked server-origin credits/settlements against their original scope. The foundation does not decide reset with outstanding bets or personal-balance conversion policy; those remain MP-ECO-01/16/17 gates.

## Authorization and locks

All new tables have RLS and no browser grants. Checked server reads provide member-facing state; only service-role RPCs mutate it. New spend/reserve verifies active membership and the current active account/epoch. Server-origin credit/settlement uses its saved origin instead of current membership; no client payer/account override is exposed by a route.

Global lock order follows MP-ECO-01: first acquire transaction advisory guards using `hashtextextended('island-economy:' || owner::text,0)`; multi-island operations sort distinct signed keys. Then lock accounts in UUID order, legacy wallets for conversion, dedicated personal Captain/Engineer rows, islands, admission/recovery, waves, assets, products and receipts/ledger. The advisory guard serializes first admission even when no account row exists. Existing accounts are locked before island/admission rows; a first account is inserted under the already-held scope guard. Do not treat an actor's legacy island row as an earlier personal-state lock. Monetary helpers do not make separate game mutations atomic by themselves.

## Out of scope

Game routes, feature flags/admission rollout, Captain/Engineer storage, wave reward conversion, Harbor product verification, Carpenter effects, reset/conversion policy and production data changes.

## Done when

- [ ] Focused Python tests verify exact amounts above legacy/JavaScript limits, strict DTO parsing, context errors and retry/failure mapping.
- [ ] Disposable full-chain PostgreSQL tests verify initial capital once, personal wallet preservation, read/write grants, atomic spend/reserve/settle, fingerprint mismatch, original-account settlement after departure/retirement, and simultaneous last-funds/duplicate operations.
- [ ] Ledger cash/commitment sums reconcile to accounts; open principal reconciles to unresolved reserve rows.
- [ ] Full additive migration chain parses and applies twice on the scratch database.
- [ ] Relevant backend tests and Ruff pass; exact commands/results are recorded in the local handover.
- [ ] A different human teammate reviews the change; the migration remains unapplied to production.

## Tests to write first

| Test | What it proves |
|---|---|
| `test_island_treasury.py` | Exact arithmetic, malformed/negative/fractional values, stable context and immutable receipt interpretation. |
| `test_island_treasury_store.py` | Service-only RPC shape and fail-closed unknown/unreadable/mismatched epoch handling. |
| `island_sql/test_island_treasury_sql.py` | Real transactions, authorization, cash/escrow conservation, retries, retirement and races. |

## Contracts touched

New server-only account/RPC contracts are documented in migration comments and this spec. The common envelope follows MP-ECO-01. Runtime integration requires matching INTERFACES and Supabase policy-matrix documentation before any route or admission path is enabled.
