# MP-ECO-14: Atomic shared wager transactions

> **What this is:** Server-only product persistence atomically coupled to the common island treasury and global operation registry.
>
> **Who uses it:** Harbor integration and database reviewers.

- **Status:** Domain transactions implemented and locally verified; route integration remains gated.
- **Branch:** `feat/shared-wager-transactions`
- **Issue:** [#503](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/503)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

## Scope and contracts

Migration `20261118051400_shared_island_wagers.sql` adds immutable shared market-call/football wager and settlement records with foreign keys to the existing operation registry, account/epoch and treasury receipts. Opening receives a verified actor, intended island/run, client operation identity and product terms; it derives the current paying account on the server. Product evidence comes from trusted server sources. No client account, fee, payout or outcome authorizes payment.

An opening takes the common scope guard and account lock, claims the global root with a fingerprint of product/event/pick/stake, and resolves replay before mutable membership, price or event validation. New actions lock island/admission state and recheck the exact reserved `island_economy_authority(actor, owner)` RPC. Missing or unreadable authority refuses the operation. Market/football bets are allowed during reservations. A server-generated `fx_<operation>_stake` identifies the common treasury reserve. The root, reserve and wager either all commit or all roll back, including business refusals after the claim. Supported fixed-odds products have zero opening/closing fees. Exchange positions remain explicitly unavailable in shared mode.

Settlement reads immutable wager origin, takes its scope/account locks followed by the product lock, computes payout from server evidence, and uses the exact `island_treasury_settle(reservation, returned_payout, reference, action_uid)` primitive. `sys_<wager>_settle` identifies autonomous completion. The product result and treasury effect commit together; no current member or current-account check changes the recipient. Loss pays zero, correct picks pay twice principal, ties/voids refund principal. Market no-price refunds follow the existing 24-hour wait and server clock. Repeated completion returns the stored original settlement. A fresh account projection is separate and is redacted for departed actors or retired/non-current origins.

Domain receipts use the common `receiptId`, `actionUid`, `action`, `actorId`, `origin` and `result` fields. The immutable opening receipt remains an opening receipt even after later settlement. `island_wager_replay` resolves the authenticated actor's original root before current mutation preflight or provider requests. Source product/root/financial links are enforced by insert triggers. Current island wave progress enforces existing campaign unlocks (market calls after wave 4, football after wave 7); another Captain's record grants no shortcut.

Reset may retire an account with wagers outstanding. Tests can model a retired-origin account with a replacement pointer to prove original settlement, but cannot claim the separately owned reset API is implemented. Legacy personal bets and routes are untouched.

## Files

- New migration, `wager_store.py` and `wager_service.py`: checked server adapters, trusted source evidence and existing common policy/registry/treasury helpers.
- Existing isolated `wager_settlement.py`: use the foundation's exact decimal formatter rather than Python's capped integer string conversion.
- New focused Python and disposable SQL tests: atomicity, identity, permissions, whole-coin amounts, source validation and concurrency.

No shared route, wave, account-deletion, flag, frontend, README or INTERFACES edit is included. The actual authority RPC is still absent from the prerequisite permission implementation. Integration fails closed until it exists; clearly labeled disposable fixture authority enables domain SQL tests without representing runtime authorization acceptance.

## Acceptance and verification

Write tests before implementation. Check no artificial economic caps; multiple valid same-event bets; exact all-in funds; changed/cross-domain UID conflicts; insufficient-funds and post-reserve failures roll back roots; immutable result/retry; invalid/stale/recorded evidence; last-coin spend/reserve races; concurrent identical opens/settlements; departed actors and retired origins; table/function privileges. A 5001-digit settlement-adapter test must avoid Python's integer-to-string ceiling.

Run focused `uv run pytest`, complete Python `uv run ruff check .`, the documented SQL parser and opt-in `CASE_PG_SCRATCH=1 uv run --with pgserver --with psycopg pytest` tests on disposable Unix-socket PostgreSQL. Record actual results separately from planned checks. SQL fixtures never read database URLs or credentials. Real authenticated browser, production migration, feature activation and deployment remain outside this change. Human review follows `CONTRIBUTING.md`.

## Actual local verification

- Focused wager unit/adaptor suites: **133 passed in 1.01s**.
- Disposable full-chain PostgreSQL, with the migration applied twice and explicit test-only authority: **56 passed in 7.32s**. Every successful domain SQL response is also parsed by the checked Python store, including a 5001-digit stake/payout.
- Common treasury/operation/permission and existing Harbor route regressions: **217 passed, 2 skipped in 6.68s**. The two existing skips remain skipped; this is not evidence of those cases.
- Whole backend Ruff: **All checks passed**. PostgreSQL parser: **69 migration files parse**.
- Independent source review found no actionable accounting/provenance issue in this guarded domain scope.

No actual permission/controlling-session RPC is supplied by this package. Authenticated runtime, capability forwarding, new Harbor routes/UI, account-deletion guards, the actual reset API and production verification remain outstanding. The retired-account test explicitly models account retirement and pointer replacement; it is not reset-API acceptance.
