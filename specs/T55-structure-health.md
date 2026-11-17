# T55 Save wall and tower health

> **What this is:** the implementation scope for persistent, phase-aware structure HP.
>
> **Who uses it:** Ianno, the T55 agent and dependent repair-task implementers.

- **Status:** implementation merged to main via [PR #203](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/203); this compatibility follow-up is in progress.
- **Branch:** `fix/t55-existing-defenses`
- **Issue:** [#121](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/121)

## Why

Only walls persist damage today; towers start each wave healthy. The approved [T54 contract](T54-recovery-implementation-plan.md) replaces this with actual HP, consistent shared state and between-wave recovery. Ianno authorized T55–T60 assignments after Franz merged the plan; that condition was met on 16 November 2026.

## What

- Implement T54's additive, service-only state, versioned configuration, integer HP projection and canonical reservation lifecycle for walls and five tower kinds, including D060 extra plots.
- Preserve immutable initial snapshots separately from ordered inputs, health checkpoints, repair segments and quota history. Implement the persistence/API foundation T56 and T57 need.
- Cover offline settlement, expiry, stale reports, reset/instance fences, legacy compatibility and consistent transaction lock order. Repair pauses at accepted bell, not combat start; no quiet timer exists.

**Files likely to change:** `backend/server/island/`, wave/recovery routes, additive migrations and focused backend/SQL tests; `docs/INTERFACES.md` and `supabase/README.md`. T55 owns shared task-board updates during this parallel batch.

## Out of scope

Paid transactions belong to T56; simulation wiring to T57; Captain/research cleanup to T58; cards/bars to T59; integrated release evidence to T60. No live migrations, flag activation or deployment. Preserve existing runtime behind the off-by-default policy boundary.

## Done when (acceptance checks)

- [ ] Meaningful tests cover all supported kinds, 50→60→50 HP, zero/positive HP, offline time, accepted-bell pause and canonical finish/expiry resumption.
- [ ] Real disposable PostgreSQL tests cover permissions, additive migration/reapplication, identity/history preservation, lock order, stale/duplicate/reordered checkpoints and finish/reset/upgrade races.
- [ ] Backend pytest and Ruff, SQL parsing and relevant contract/parity checks pass with exact evidence. Full diff and documentation are reviewed; unresolved integration or trust limits are explicit.
- [ ] No secrets, private data or generated caches are included; a different human approves the current revision before merge.

## Tests to write first

Test deterministic HP projection and phase boundaries, then authenticated state/checkpoint APIs and disposable-SQL lifecycle/concurrency. Follow the full acceptance matrix in issue #121 and T54; do not substitute mock-only tests for database guarantees.

## Contracts touched

T54 recovery version 1 / wave protocol 2, `structure_recovery` off-by-default flag, service-only recovery tables, state/journal/checkpoint APIs and canonical locks. Document exact implemented shapes in the owning modules/migrations and contract index. Existing wallet reasons remain unchanged.

## Compatibility follow-up verification

On 2026-11-17, the complete island SQL suite passed 370 tests in 31.39 seconds, and the focused recovery UI/controller/policy/snapshot suite passed 76 tests across 11 files in 28.41 seconds. These checks include saved-v1 gated structures with availability flags off. Commands run from the indicated directory:

```sh
# From backend/
UV_CACHE_DIR=/tmp/t55-followup-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql

# From frontend/
npm test -- tests/island/structure-recovery-api.test.js tests/island/structure-recovery-policy.test.js tests/island/structure-recovery-model.test.js tests/island/structure-recovery-card.test.js tests/island/structure-recovery-card-dom.test.js tests/island/structure-recovery-upgrade-dom.test.js tests/island/captain-recovery-tree.test.js tests/pirates/defenses-v2.test.js tests/pirates/recovery-controller.test.js tests/pirates/recovery-snapshot.test.js tests/pirates/recovery-policy.test.js
```

Earlier focused checks for this compatibility change are recorded in [STATUS](../docs/STATUS.md). These are disposable local tests; no live database, migration, feature activation or deployment was involved. Human review and release gates remain.

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and publication confirmation.
- **Last updated:** 2026-11-16.
