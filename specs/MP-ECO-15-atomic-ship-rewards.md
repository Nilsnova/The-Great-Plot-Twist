# MP-ECO-15 Atomic ship reward transactions

> **What this is:** server-bound boat rounds and atomic shared reward accounting on the common treasury.
>
> **Who uses it:** future versioned boat adapters and reviewers of the SQL transaction boundary.

- **Status:** atomic transaction preparation verified; persisted authority and route activation remain pending.
- **Branch:** `feat/shared-ship-reward-transactions`
- **Issue:** [#504](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/504)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), with Codex assistance.

## Bounded implementation

Add migration `20261118051500_shared_ship_rewards.sql`, dedicated server adapter/store,
and meaningful disposable PostgreSQL tests. The existing public boat routes and personal
wallets remain unchanged. No shared frontend, wave route, global flag, account deletion,
README, or INTERFACES change is included. A different human review remains required.

A server-only round-start transaction creates an immutable round UUID, binds authenticated
actor, original island/account/run epoch, game, canonical island record and frozen reward
formula, and records its common operation identity. Clients may later identify that round
and submit 0–3 stars; they cannot choose original account, record, reward amount or formula.
A round completes once. New play uses a new round. Score claims retain the existing browser
score-trust limitation: validation of stars is not proof of the achieved score.

All members share one reward bucket per account/epoch/game/new island record. Existing
formula is `stars * (6 + floor(min(record, 100) / 5))`; only positive differences are credited.
Ten members, separate rounds and parallel improvements share the three-star maximum.
Original round record and account never change if the island advances or resets.
Fresh old-run completions fail; exact committed receipts remain replayable without paying
again after departure or reset, without revealing fresh treasury state. Every claim,
including a zero payout, has an immutable domain receipt and common player-operation binding. Changed input with a used UID conflicts.

## Authority and transaction order

Use exactly `island_economy_authority(p_actor_id,p_island_owner)` and the published treasury
and operation helpers. Missing or malformed persisted authority fails closed; no browser
presence or legacy membership fallback replaces it. The adapter passes authenticated actor
and explicit expected epoch directly to the transaction; SQL enforces the boat's between-reservation phase, unlock wave 30 and repaired wreck goal 500 under locks.
Existing catalogue values are frozen by round start and guarded by parity tests.

Lock order is common island scope, account, common operation claim, island, admission,
then round/product bucket. No transaction first locks an island and later acquires its account.
Replays resolve the immutable complete receipt before mutable phase/record/membership checks.
Downstream refusal rolls back the common root claim. Positive rewards call
`island_treasury_record_locked` inside the same transaction with a disjoint common effect UID.
The bucket, unique round result, domain receipt and financial effect commit or roll back
as one unit. They are not separate network calls.

## Verification plan

Tests precede implementation. Use opt-in disposable PostgreSQL with private Unix sockets,
explicit migration chain, and test-only fixture authority. Cover ten concurrent members,
parallel score improvements, lost-response retries, changed-UID payload conflicts, single
round completion, scoped account-retirement/epoch switches, island changes, record advancement,
authorization and reservation failures, free repeat scores, rollback injection, grants
and immutable history.
Fixture authority and committed PostgreSQL races are separate from authenticated runtime
acceptance; the latter remains unavailable until the persisted authority integration lands.

Run targeted adapter/unit and SQL tests, real SQL parse, full Ruff, relevant legacy boat
regressions, and diff/content review. Record actual results after execution. No migration
application to a configured database, deployment, admission, activation or external write
is part of this package.

## Receipt contract

Both free starts and reward claims return the common immutable header:
`receiptId`, `actionUid`, `action`, `actorId`, and
`origin: {mode, version, islandOwner, accountId, runEpoch}`, followed by domain `result`.
Start result is `{round}`; claim result records round/game/record/stars, exact decimal
coins/cumulative/maximum, and the optional treasury receipt ID. Historical claim replay
always returns `currentEconomy: null`, while a new authorized claim returns its originating
common account envelope separately. No current money projection is inferred from an old receipt.

## Actual verification

All database checks used disposable PostgreSQL on private Unix sockets with explicit
TEST-ONLY authority. No configured database or authenticated user session was used.
Account-retirement and epoch-switch fixtures directly update account/state rows under the
documented scope/account lock boundary; the actual island reset RPC was **not exercised**.
These checks establish that old ship claims cannot credit a new account, rather than
acceptance of the complete reset workflow.
From `backend/`, with writable `UV_CACHE_DIR` configured:

- `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_shared_ship_rewards_sql.py server/tests/test_shared_boat_adapters.py`: **51 passed in 6.07s** on the final start/claim receipt projection.
- Expanded ship SQL, authority fixture, adapters, pure accounting, legacy boat routes and wallet migration compatibility run: **191 passed in 14.21s**. After the final start receipt alignment, the affected SQL/adapter subset was rerun above.
- `uv run ruff check .`: **All checks passed!**
- Documented `pglast` parse command: **SQL parses: 69 file(s)**.
- `git diff --cached --check`: passed; complete new diff reviewed.

An independent source review found no remaining accounting, grant or provenance defect.
Production `island_economy_authority` implementation, public capability/admission guards,
route/UI integration, authenticated multiple clients, live migration/deployment and full
application acceptance remain unverified and inactive. Browser stars are range checked,
not independently proven as an achieved score. The earlier isolated accounting spec remains
historical preparation; this package adds real transaction evidence without claiming the
missing authority/runtime prerequisites are complete.
