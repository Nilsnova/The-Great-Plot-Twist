# MP-ECO-20 database acceptance follow-up

> **What this is:** focused acceptance of shared domain transactions against the published treasury foundation.
>
> **Who uses it:** implementers and reviewers of shared arsenal, repair, wager and ship accounting.

- **Status:** in progress; full runtime acceptance remains incomplete.
- **Branch:** `test/shared-economy-database-acceptance`.
- **Issue:** [#505](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/505).
- **Dependencies:** draft [contract #515](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/515),
  [permissions #516](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/516) and
  [treasury/operations #517](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/517).

## Bounded scope

Reuse the foundation's exact decimal conversion so 5,001-digit balances and signed
ledger deltas remain valid without changing Python's global conversion limit.
Run the evidence tool as a Python module from `backend/` so it can import that
shared helper. Preserve strict canonical strings and every existing refusal.

Provide a reusable **test-only** six-field `island_economy_authority` fixture for
disposable PostgreSQL domain checks. Real `islands`/`island_members` determine
membership; reservation, leader and assignment are explicitly injected test
values. Install it only where the production RPC is absent. This fixture does not
implement or prove persistent session, Captain, journal or assignment authority.
It lives under `backend/server/tests/`, never in production migrations.

Once actual domain RPCs are available, exercise their persisted financial/domain
effects, global root identity, rollback and two-connection cross-domain races.
Use isolated module-local scratch clusters for committed race setup. Reuse the
real treasury/registry; do not replace domain functions with test-only mutation
wrappers. An absent implementation remains an explicit dependency.

Update [the acceptance matrix](../docs/economy/ACCEPTANCE.md) with published
dependencies, actual executed evidence and remaining authority/profile/reset gaps.
The selected reset permits open wagers settling only against the old account;
owner deletion deletes the island and preserves other players' Captain progress.
These policies still require their owning transaction/schema implementations.

## Files and exclusions

Change only the acceptance tool/tests/docs, this specification, and isolated
test-only PostgreSQL support. No public routes, frontend, feature flags, account
deletion, treasury implementation, shared INTERFACES or Supabase README edits.
No live database, migration application, feature activation or deployment.

Two existing structure-read route tests still expect the general construction
price table. The version-one health manifest and read DTO support exactly wall,
cannon, mortar, harpoon, swivel and culverin; house/watchtower are not repairable,
and saved culverins retain their prices when new availability is disabled. Correct
only those stale expectations to explicit catalogue increments for these six
kinds. Preserve their membership, canonical wire and no-wallet assertions. Record
the reproduced pre-existing failures separately from the corrected test run.

## Acceptance checks and tests first

- A new 5,001-digit snapshot and signed-delta regression fails with the old `int`
  parser, then passes using `treasury_models.decimal_integer`.
- CLI module invocation preserves source/evidence checks and meaningful exit codes.
- Disposable fixture tests verify exact six-field shape, real current membership,
  explicit nulls, missing-state refusal and service-only execution.
- Actual domain SQL tests assert receipts, operations, assets/events, available
  funds and immutable ledger reconciliation after retries, conflicts and races.
- Run focused Python and disposable PostgreSQL tests, Ruff, complete migration
  parsing where new SQL is integrated, documentation links and diff checks.
- Report SQL/fixture-auth evidence separately from authenticated browsers and
  physical devices. Do not repeat the unrelated exhaustive settings suite.

## Responsibility

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Coding assistance:** Codex; the teammate remains responsible.
- **Human reviewer:** pending a different teammate's review.
- **Last updated:** 2026-11-18.


## Verification against updated main

The previous 1,043-Python/387-SQL results above belong to their recorded earlier
source. Verification was repeated after updating to main
`d58d924617319cd166a637618d780665b462b39a`, including its paid-revival journal,
historical reconciliation and saved legacy reward recovery. The published
treasury schema now uses migration version `20261118050050`; all migration
versions remain unique. Upstream's equivalent repair-price expectation correction
was retained without rewriting that test file. Contract PR #515 is already part
of this main snapshot. No dependency PR or main branch was modified here.

The tested production/test source is `ce8d63b18fdbc70a716a6521e6fbf6a2a6e867a2`;
subsequent changes are documentation only. With disposable PostgreSQL and explicit
TEST-ONLY authority/snapshot inputs:

- Affected Python, foundation and legacy regression selection: **1,078 passed in
  39.91s**, process exit 0, no skips. This includes migration-version uniqueness,
  saved reward recovery and house-role parity.
- Mixed actual PostgreSQL selection across 24 suites: **450 passed in 106.58s**,
  process exit 0, no skips. All eight cross-domain cases are included. The
  selection also covers the new paid-revival/reconciliation/reward HTTP/database
  paths and existing recovery contracts.
- Full backend Ruff: **All checks passed!**
- Production migration parser: **75 files parse; all 75 timestamp versions are
  unique**. Whitespace and added documentation links were checked.

The domain SQL command in the transaction overview and the individual specs
reproduce the principal component checks. The complete long regression selections
were captured with their actual results; neither a full backend run nor frontend
acceptance is claimed for this increment. Production authority, canonical frozen
economy and hold/participation producers, lifecycle workers, legacy guards, actual
reset/deletion and authenticated clients remain explicit integration gates. New
legacy `/api/waves/recover` obligations must retain their original accounting mode
before any shared admission; no personal payout fallback is introduced here.
