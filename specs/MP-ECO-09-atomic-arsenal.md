# MP-ECO-09 Atomic shared arsenal transactions

> **What this is:** inactive persisted copy transactions using the common treasury and operation identity.
>
> **Who uses it:** shared arsenal integration and disposable PostgreSQL acceptance tests.

- **Status:** implementation; runtime admission remains blocked on persisted session authority.
- **Issue:** [#499](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/499), with lifecycle seams for [#500](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/500).
- **Branch:** `feat/shared-arsenal-transactions`
- Responsible teammate: Ianno Hollensteiner (`Iannomh123456`); Codex assistance.

## Scope and transaction

Add nullable account/run and holder-tenure metadata to `arsenal_copies`, preserving
legacy defaults. New shared copies bind their original account/run. Existing stock
must be explicitly bound by the conversion implementation before shared mutations;
this package performs no lazy conversion and never deletes grandfathered excess.
The total shared limit is 20 carried plus stored copies; returns need no capacity.
The existing deferred capacity trigger becomes version-aware: legacy stock retains
its exact 20-stored rule, explicitly bound grandfathered shared stock may return
above 20, and new shared purchases remain capped at 20 total. Scope changes check
both affected owners. Regression tests force deferred checks for returns and
canonical pending settlement, rather than relying only on rolled-back transactions.

One service-only RPC handles buy/take/swap/return. Its server-built fingerprint
contains immutable request intent, excluding today's catalogue price/unlock. It
locks island scope, account, common operation root, actor profile, island, admission
and ordered copies. New operations recheck current membership/phase through the
exact reserved `island_economy_authority(actor, owner)` RPC under those locks.
Missing or malformed authority fails closed; no alternative session API is added.

Buy checks island `wave_best`, total copies and treasury available funds, records
one `fx_<operation>_charge` ledger child, creates the copy and writes an immutable
domain receipt in the same exception/savepoint boundary. Every refusal after root
claim rolls back root, money, copy and receipt. Replay retrieves the original
receipt before current membership, phase, price or unlock checks. Historical replay
omits fresh treasury/copy state. Receipts use the common `receiptId`, `actionUid`,
`action`, `actorId`, `origin` and `result` envelope. Changed intent
or scope conflicts through the common global root namespace. A return/take uses
the selected copy's exact tenure generation; swaps release the old copy first.

The trusted server supplies catalogue price/unlock, never a client amount. The
strict Python adapter accepts an authenticated actor's persisted original context
and invokes exactly one domain RPC; it does not call a separate financial mutation
or require current-membership preflight before an original receipt replay. New
SQL operations independently enforce authority. A content parity test guards the
weapon whitelist; prices/unlocks come from the existing server catalogue only.

## Wave and lifecycle seam

Shared rows retain copy identity, holder generation, pending-return wave and
disconnect deadline for the existing isolated lifecycle rules. A future accepted
bell transaction must freeze these values together with roster/world state under
the same scope/account/personal/island ordering. This package adds no wave write,
receipt family, assignment authority or independent scheduler.

Private lock-preserving SQL helpers persist trusted disconnect/reconnect/withdrawal
intents and release pending copies only for their matching canonical wave. They
have no service-role execute grant: a future owner-defined session transaction
must verify original account/wave/tenure, acquire the common locks and revoke
control atomically before using them. Stale tenure/wave events are no-ops, repeated
disconnect cannot extend a deadline, and returns work above capacity. These are
lifecycle storage helpers, not independent canonical completion authority.

Member-account deletion still needs coordinated replacement of the legacy holder
`ON DELETE CASCADE`; this change does not modify that foreign key or the deletion
transaction. Legacy arsenal APIs are not converted here and must be fenced before
admission. No route, global flag, existing-save conversion or deployment is enabled.

## Tests first and verification

Use module-private disposable PostgreSQL applying the full migration chain twice.
The missing persisted authority is replaced only by a clearly marked test fixture
with the reserved response shape; this proves atomic treasury/copy/root behavior,
not real session integration or authenticated runtime acceptance.

- Buy records actual treasury child; free mutations claim the same global root.
- Last-coins wager/purchase and last-slot purchase races commit only valid effects.
- Same-UID retries create one copy/debit; altered/free/paid reuse conflicts.
- Invalid authority, stale holder, phase, unlock, excess stock and funds refusals
  leave no root/copy/debit; injected late failure rolls back all effects.
- Island veteran progress cannot unlock a new island's stock; 20 total copies
  and grandfathered returns preserve identity and tenure.
- Strict adapter rejects unreadable replies and maps the common refusal codes.

Run focused Python tests, full Ruff, documented pglast migration parsing and
`CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q
server/tests/island_sql/test_shared_arsenal_sql.py`. Inspect `git diff --check`.
Actual results will be recorded separately. Real authority, lifecycle worker,
canonical wave integration, deletion and authenticated browsers remain unverified.

## Actual local verification

- Focused arsenal rules/lifecycle/store plus legacy arsenal route suites:
  **77 passed in 4.91 seconds**.
- Disposable PostgreSQL shared arsenal, legacy arsenal, host-console and treasury
  suites: **85 passed in 18.45 seconds**, including 34 new atomic/lifecycle tests.
  The full migration chain applies twice in each private scratch cluster.
- Full backend Ruff: **All checks passed**.
- Documented pglast parser: **69 migration files parse**.
- Whitespace/diff inspection and changed specification content: passed.
- Independent deferred-capacity reproduction plus new SQL/adapter checks:
  **59 passed in 14.39 seconds**. A valid legacy 20-stored/four-carried inventory
  can convert and return all copies with deferred constraints forced immediately.

Those SQL results use the explicitly test-only reserved authority provider. They
establish real treasury/copy/root atomicity and lifecycle storage, without proving
the missing persisted authority, a worker, canonical wave closure, account deletion,
admitted legacy-route fencing or authenticated multiplayer execution. The schema
has not been applied to a configured database. A different human review remains
required before merge under the repository workflow.
