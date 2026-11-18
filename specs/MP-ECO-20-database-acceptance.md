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
