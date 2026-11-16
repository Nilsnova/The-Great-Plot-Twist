# T55 Save wall and tower health

> **What this is:** the implementation scope for persistent, phase-aware structure HP.
>
> **Who uses it:** Ianno, the T55 agent and dependent repair-task implementers.

- **Status:** in progress after Ianno confirmed approval of merged [PR #135](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/135).
- **Branch:** `feat/t55-structure-health`
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

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning; stronger-session orchestration and review.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and publication confirmation.
- **Last updated:** 2026-11-16.
