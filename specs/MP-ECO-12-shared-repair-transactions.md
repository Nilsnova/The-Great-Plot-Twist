# MP-ECO-12: Atomic shared repair transaction integration

> **What this is:** a service-only treasury/structure repair transaction and explicitly blocked revival integration seam.
>
> **Who uses it:** the versioned economy and recovery integration, SQL tests and reviewers.

- **Status:** shared-repair consumer implemented and locally verified; activation and timed revival remain dependency-blocked. No existing route is activated.
- **Branch:** `feat/shared-repair-transactions`
- **Issue:** [#502](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/502).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`). Coding assistance: Codex.

## Bounded implementation

Add `20261118051200_shared_combat_repairs.sql`, dedicated Python adapters/models and tests.
The service-only repair RPC locks the common island scope, originating treasury account,
root operation, island, recovery state, wave and structures in that order. It uses the
common immutable global root operation and a derived `fx_` treasury child; it introduces
no competing treasury or general receipt registry. Every business refusal after the root
claim rolls back that claim and every tentative domain/financial effect together.

A fresh action rechecks the exact common `island_economy_authority` response and actual
membership under locks. Missing or malformed authority fails closed. An existing matching
successful operation returns its immutable receipt before current phase, price, HP or quota
checks, and never heals, pays or increments a use again. Historical receipt reads bind the
authenticated actor to the original root and account, without requiring new spending rights.
The immutable common receipt uses `receiptId`, `actionUid`, `action`, `actorId`, `origin`
and `result`, with the original financial receipt nested in the result. Historical replay
returns no fresh treasury snapshot. A root UID cannot be retargeted across domains, accounts,
epochs, targets or paid intents. Mutable wave and repair cursors remain fresh-operation
concurrency guards, excluded from the immutable paid intent as in the existing repair contract;
a refreshed cursor on a successful UID still returns the old effect only.

New repairs require an active shared account, explicit matching economy run epoch, distinct
matching recovery epoch, an open protocol-2 accepted reservation including countdown, a
matching immutable wave/account binding, frozen exact current-level price and current
instance/level/repair cursor. Only the existing read-only recovery phase and journal-HP
helpers are reused; no old wave/recovery SQL function is replaced. Existing canonical
wave-end restoration remains responsible for win/loss/expiry/abandonment healing.

The transaction spends only `balance_coins - committed_coins` and commits debit, full
normalized HP, shared three-success quota, ordered `structure_repaired` event and immutable
domain receipt together. It never writes demolition contributions, discounts an Engineer
repair, spends personal coins, accepts client HP or accepts a client payment receipt.
New shared repairs fail closed for a legacy snapshot lacking canonical economy binding.

The wave binding must be supplied by the canonical reservation implementation, using the
common economy context. This package does not create a reservation, admission or assignment
API. The consumer requires strict `initial_snapshot.economy` fields `mode`, `version`,
`islandOwner`, `accountId` and `runEpoch`, matching the common context. This gated
consumer precondition is implemented here; no published producer writes it, and producer
agreement remains required before activation.

Revival must use target-bound uninterrupted canonical hold/fall/session provenance, a unique
wave/target/fall claim and an ordered event with zero coin debit. That provenance is not
available yet. A guarded Python seam may surface the missing dependency; this package must
not mint a revival from client timing, distance, HP, claims or caller-selected statistics.

## Tests before code and evidence limits

Disposable PostgreSQL tests exercise the actual new RPC, common treasury/root functions and
existing recovery tables. A clearly labeled test-only authority RPC may supply the exact
published authority response; it is not authenticated runtime acceptance. Cover countdown,
exact price/no Engineer discount, reserved-fund refusal and races, last allowed repair races,
receipt-first retries after damage/end, altered root replay, member rejection, distinct epochs,
legacy binding rejection, immutable receipts and rollback after injected post-debit failure.
Pure adapter tests cover strict contexts, historical replay, unavailable authority, receipt
validation and a missing revival provenance seam.

Run targeted pytest, Ruff, disposable SQL and full migration parse checks; report actual
commands/results separately. Existing routes, frontend callbacks, flags, account deletion,
INTERFACES and migration application/deployment remain outside this local change.


## Delivered interfaces and verification

The service-only transaction is `island_shared_structure_repair(actor, owner, account,
run_epoch, action_uid, recovery_epoch, wave_id, spot, instance_id, level, repair_seq, price)`.
`island_shared_repair_replay` reads the authenticated actor's matching original root; its
optional server-side account filter may be absent so a reset cannot redirect a historical
receipt. `island_shared_repair_receipts` links common operation and financial UUIDs to the
immutable domain result. RLS is enabled; browsers have no table or function privileges.
No new grants allow browser mutation, and repairs add no refundable building contribution.

`shared_combat_repair.py` uses common permissions for a fresh action and calls this one SQL
transaction. It reads an owned historical receipt before current permissions and never
returns a fresh treasury on that path. `shared_repair_transaction_models.py` validates the
common receipt header and cross-checks actor, account, epoch, target, price and exact derived
financial child. Current state is separate and present only on a newly authorized mutation.
The guarded revival entry point remains unavailable even after permission succeeds, because
canonical uninterrupted target/fall-bound hold provenance is still absent; it calls no
legacy paid-revival function and performs no persistence.

Actual local verification:

- New real PostgreSQL transaction/concurrency suite: **39 passed in 7.87 s**, including both browser-role RPC denial checks.
- New adapter plus earlier pure repair/revival policies: **88 passed**.
- Extended existing/new backend selection: **185 passed, 2 failed**. The two failures are
  unchanged existing recovery route assertions expecting all building prices, while the
  current adapter supplies repairable-kind prices. An untouched export of base `1f2fb0c5`
  reproduces both failures (**2 failed, 1 passed** for that route file). No existing route or
  test was changed to hide these failures. The failing checks are
  `test_owned_structure_state_uses_canonical_wire_fields_without_wallet` and
  `test_member_can_read_a_shared_island_but_outsider_cannot` in
  `backend/server/tests/test_structure_recovery_routes.py`.
- `cd backend && uv run ruff check .`: passed.
- Documented `uv run --with pglast` parse command: **69 migration files parse**.
- Independent source review covered SQL lock/rollback behavior, immutable intent and receipt
  handling, strict authority/binding gates and the guarded revival dependency.

The disposable SQL suite runs with `CASE_PG_SCRATCH=1 uv run --with pgserver --with
'psycopg[binary]' pytest -q server/tests/island_sql/test_shared_combat_repairs_sql.py`.
It applies the full migration chain twice to a private Unix-socket database and executes
real transaction/concurrency checks. Its authority and frozen economy binding are injected
fixtures and do not establish authenticated runtime readiness. Canonical producer agreement,
real session/hold authority, route/client integration, both-protocol authenticated acceptance
and deployment remain unverified.
