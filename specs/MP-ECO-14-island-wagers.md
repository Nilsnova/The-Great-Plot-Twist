# MP-ECO-14: Island wager accounting rules

> **What this is:** Exact whole-coin wager calculations and treasury settlement arguments for shared island market calls and football bets.
>
> **Who uses it:** Harbor services and reviewers preparing versioned economy integration.

- **Status:** In progress; runtime integration depends on treasury and permission implementations.
- **Branch:** `feat/island-funded-bets`
- **Issue:** [#503](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/503)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`). Codex assists with implementation and checks.

## Scope

Add isolated server rules for any positive whole-coin stake, exact opening fees, fee-aware all-in quotes, market call outcomes and verified football result payouts. Add an argument builder for the exact `island_treasury_settle` primitive specified in [#493](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/493). Settlements identify only the source reservation; they never accept a current recipient, island or epoch. Legacy wallets, routes and their existing limits stay unchanged until versioned admission is integrated.

All stake and fee arithmetic uses integers, including balances above legacy wallet and JavaScript safe-integer limits. Opening stake `s` and fee `f` require available funds of at least `s + f`; the treasury applies cash/commitment deltas `(-f, +s)`. A returned payout includes principal after closing fees; treasury settlement applies `(p - s, -s)` using the persisted source reservation. A loss pays zero; an unchanged market price or void fixture returns principal. A correct market call or football pick pays twice the stake under the existing product rules. Missing or unusable market readings refund principal after the existing 24-hour price wait, authorized by the server clock rather than a recorded/stale result. There is no stake ceiling, daily budget, open-count or one-bet-per-event rule in this package.

## Files and boundaries

- `backend/server/island/wager_rules.py`: stake, opening-cost and all-in calculations; supported-product guard.
- `backend/server/island/wager_results.py`: deterministic market and football result checks using server evidence.
- `backend/server/island/wager_settlement.py`: exact source-reservation settlement arguments.
- `backend/server/tests/test_shared_wager_*.py`: arithmetic, source freshness, outcome, argument and failure checks.

No competing treasury, permission, receipt, lock ordering or run-epoch model is introduced. No route, shared frontend callback, feature flag, existing migration or shared interface file changes are included. Exchange positions, prediction pools and duels remain unsupported in shared mode and must fail explicitly rather than fall back to private funds.

## Acceptance checks and tests first

- One coin and stakes above every legacy ceiling are accepted; zero, negative, boolean, fractional and string stakes are refused.
- All available funds can be quoted and wagered without a fee; fees are rounded upward exactly and all-in includes them.
- Opening validation refuses insufficient available funds; it is advisory and never substitutes for an atomic database mutation.
- Winning, losing, tied/refunded and void results compute uncapped whole-coin payouts. Invalid, stale, future, recorded, wrong-event and premature evidence cannot authorize a payout.
- Settlement arguments match #493 exactly, serialize numeric values without floats and preserve one reservation/reference/action identity across retries.
- `cd backend && uv run pytest -q server/tests/test_shared_wager_rules.py server/tests/test_shared_wager_results.py server/tests/test_shared_wager_settlement.py` and `uv run ruff check .`; run relevant legacy Harbor tests and inspect `git diff --check`.

## Remaining integration requirements

At implementation start, `treasury.py`, `treasury_store.py` and `economy_permissions.py` are absent from current main. #494 must provide a transaction seam that creates the product commitment and treasury reservation atomically, checks membership/epoch/price/funds under the common lock order, and binds altered replays to `idempotency_conflict`. #495 must supply the shared action authorization. Opening must not call a reserve function separately from inserting its bet.

Product tables must persist the source reservation and immutable account/island/epoch association before routes can use these rules. Settlement must atomically record the verified result with the treasury settlement (or use a durable retry-safe settlement intent); a separate payout then product update is insufficient. The product verifier must pass only server-fetched evidence. Read pagination must not covertly impose an open-count cap. Settlement workers must retain old account recipients after member departure/reset and keep original personal bets personal. Capability and old-client rejection, unlimited shared request/UI amounts, treasury races and authenticated multi-client acceptance remain unverified until prerequisites are available. No feature completion or activation is claimed by isolated tests.

## Review

A different human teammate reviews the current change under `CONTRIBUTING.md`. No push, PR, production migration, activation or deployment is included.
