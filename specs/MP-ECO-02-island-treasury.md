# MP-ECO-02 Island treasury foundation

> **What this is:** exact island/run accounts and atomic financial primitives for the shared economy.
>
> **Who uses it:** the economy resolver, permission layer and later shared purchase/wave/Harbor tasks.

- **Status:** isolated foundation prepared; runtime integration and admission remain pending.
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
- Bind free, personal and paid request identities through the [operation registry](MP-ECO-02-operation-identities.md), with proven financial children and disjoint canonical system effects. Its cutover drains concurrent writers before DDL and rejects unsupported transaction isolation.
- Keep original personal wallets, ledger and legacy runtime untouched. No route calls the new admission function in this change.

**Likely files:** `backend/server/island/treasury*.py`, focused tests, and additive migrations `20261118050000_island_treasury.sql` / `20261118050100_island_treasury_functions.sql`.

## Accounting and identity

`balanceCoins` includes held principal, `committedCoins` is open principal, and `availableCoins = balanceCoins - committedCoins`. A normal purchase of price `q` changes `(balance, committed)` by `(-q, 0)`. Opening principal `s` with fee `f` requires `available >= s + f` and changes `(-f, +s)`. Settlement with verified returned payout `p` changes `(+p-s, -s)`; loss has `p=0`, principal refund `p=s`. Returned payout includes returned principal and is already net of any closing fee. The product caller computes that fee exactly once; the treasury does not deduct it again. A fee refund is included only when the product contract grants it.

Each ledger row binds account, run epoch, actor, operation UID, reason, immutable origin reference, request fingerprint, both deltas and balances/revision at commit. A reserve row holds principal and fee. A settle row uniquely resolves its source reserve; no mutable product row or second release can invent/reuse held principal. Retry returns the original receipt and fresh account state; altered payload for an existing key fails without mutation. Deterministic reason/reference uniqueness also protects canonical rewards under different request UIDs. Bet references identify the individual bet/reservation, not only its event: several affordable bets on one event must have distinct source references.

The persisted mode pointer pins the current account/epoch and active/paused admission. Retired accounts reject new member spending/reservations but still accept checked server-origin credits/settlements against their original scope. The foundation does not decide reset with outstanding bets or personal-balance conversion policy; those remain MP-ECO-01/16/17 gates.

## Authorization and locks

All new tables have RLS and no browser grants. Checked server reads provide member-facing state; only service-role RPCs mutate it. New spend/reserve verifies active membership and the current active account/epoch. Server-origin credit/settlement uses its saved origin instead of current membership; no client payer/account override is exposed by a route.

Global lock order follows MP-ECO-01: first acquire transaction advisory guards using `hashtextextended('island-economy:' || owner::text,0)`; multi-island operations sort distinct signed keys. Then lock accounts in UUID order, legacy wallets for conversion, dedicated personal Captain/Engineer rows, islands, admission/recovery, waves, assets, products and receipts/ledger. The advisory guard serializes first admission even when no account row exists. Existing accounts are locked before island/admission rows; a first account is inserted under the already-held scope guard. Do not treat an actor's legacy island row as an earlier personal-state lock. Monetary helpers do not make separate game mutations atomic by themselves.

## Out of scope

Game routes, feature flags/admission rollout, Captain/Engineer storage, wave reward conversion, Harbor product verification, Carpenter effects, reset/conversion policy and production data changes.

## Done when

- [x] Focused Python tests verify exact amounts above legacy/JavaScript limits, strict DTO parsing, context errors and retry/failure mapping.
- [x] Disposable full-chain PostgreSQL tests verify initial capital once, personal wallet preservation, read/write grants, atomic spend/reserve/settle, fingerprint mismatch, original-account settlement after departure/retirement, and simultaneous last-funds/duplicate operations.
- [x] Ledger cash/commitment sums reconcile to accounts; open principal reconciles to unresolved reserve rows.
- [x] Full additive migration chain parses and applies twice on the scratch database.
- [x] Relevant backend tests and Ruff pass; verification results are recorded below.
- [ ] A different human teammate reviews the change; the migration remains unapplied to production.

## Tests to write first

| Test | What it proves |
|---|---|
| `test_island_treasury.py` | Exact arithmetic, malformed/negative/fractional values, stable context and immutable receipt interpretation. |
| `test_island_treasury_store.py` | Service-only RPC shape and fail-closed unknown/unreadable/mismatched epoch handling. |
| `island_sql/test_island_treasury_sql.py` | Real transactions, authorization, cash/escrow conservation, retries, retirement and races. |

## Contracts touched

New server-only account/RPC contracts are documented in migration comments and this spec. The common envelope follows MP-ECO-01. Runtime integration requires matching INTERFACES and Supabase policy-matrix documentation before any route or admission path is enabled.

## Verification

From `backend/`, with the project's locked dependencies installed:

| Check | Result |
|---|---|
| `uv run --no-sync pytest -q` | 536,847 passed, 305 skipped in 629.57 seconds. SQL-only suites are opt-in or require test-only packages. |
| Final focused `uv run --no-sync pytest -q server/tests/test_island_treasury.py server/tests/test_island_treasury_store.py` | 36 passed after the public error-code and returned-payout contract alignment. |
| `CASE_PG_SCRATCH=1 uv run --no-sync --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_island_treasury_sql.py` | 19 passed; disposable full-chain PostgreSQL applies all migrations twice. |
| `uv run --no-sync ruff check .` | Passed. |
| Documented `pglast` parse of every migration | 66 files parsed. |
| Added documentation links and `git diff --check` | Four local links resolve; no whitespace errors. |

The final focused checks include exact 5,001-digit DTO values, reservation/purchase races,
duplicate admission/settlement, cross-island UID conflict rollback and closing-fee accounting.
No live database, authenticated browser flow or production shared-mode admission was exercised.
HTTP/game-route conversion and the explicit reset/deletion/conversion policies remain separate
integration prerequisites; this foundation alone must not enable existing-save admission.

After integration of the operation registry and current main (`f0c64442`), the combined focused Python suite passed **62 tests in 2.25s**, the three disposable PostgreSQL suites passed **54 tests in 22.36s**, and full Ruff passed. The PostgreSQL checks include 13 isolated first/repeated cutover, admission, nullable-FK, contention rollback and isolation cases; a separate rerun of those 13 also passed. These final focused checks do not replace the qualified earlier full-backend result above.

After updating to main `77a9e34d`, the focused Python suite passed **62 tests in 2.31s**, full Ruff passed, and the mixed-order PostgreSQL suite passed **89 tests in 25.59s** (54 treasury/registry/cutover plus 35 legacy cases). The documentation merge retains both the current Captain feedback contract and the treasury/operation sections.
