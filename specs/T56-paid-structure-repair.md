# T56 Paid instant structure repair

> **What this is:** the implementation scope for one atomic, priced Repair now action.
>
> **Who uses it:** Ianno, the T56 agent and recovery API/client implementers.

- **Status:** in progress; isolated contracts/tests first, transaction integration follows T55.
- **Branch:** `feat/t56-paid-structure-repair`
- **Issue:** [#122](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/122)

## Why

The approved [T54 plan](T54-recovery-implementation-plan.md), merged in [PR #135](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/135), replaces wall-only repair with the same selected-target restore for walls and five tower kinds. Ianno authorized these assignments after Franz's merge and explicitly requested more agents. Existing legacy behavior stays compatible; the new feature remains inactive.

## What

- Implement fixed incremental current-base-level pricing, request validation and stable intent/receipt semantics against T54's contract.
- Integrate one service-only transaction committing payer wallet debit, full target HP, durable event, immutable receipt and shared quota together, using T55's canonical state and lock order.
- Permit unlimited paid repair between reservations; exactly three successful actions per island reservation UUID, shared from accepted bell through preparation and combat until canonical finish/expiry.
- Same UID returns its original receipt plus current state, never re-heals later damage or charges/uses a slot again. Invalid/intact/unaffordable/stale/exhausted actions have no side effects.

**Files likely to change:** isolated paid-repair models/rules/services, a coordinated additive migration after T55, focused API/real-SQL tests and the owning contract documentation. T55 owns shared state/schema and task-board/INTERFACES edits; agree exact integration handoffs first.

## Out of scope

No parallel rewrite of T55 state, legacy simulation, Captain policy or UI. No new wallet reason, dependency upgrade, live migration, flag activation or deployment. Repair spending is not refundable construction contribution.

## Done when (acceptance checks)

- [ ] All six kinds/levels use server catalogue price independent of damage/payer; wall levels cost 10/20/40/80/160.
- [ ] API and disposable PostgreSQL tests prove atomic rollback, shared last-use race, both phases, fresh-wave quota, same/changed UID, old receipt after new damage, stale quote/instance/reset/finish/upgrade races and history retention.
- [ ] Backend pytest/Ruff and SQL parse/apply/reapply/grant checks pass; exact contract and remaining trust/integration limits are documented. Ianno reviews; a different human approves the current revision before merge.

## Tests to write first

Pure fixed-price and stable-intent cases; validation/auth/refusal APIs; real SQL transaction/idempotency/concurrency, including paid repair racing automatic completion and old UID after new damage. Follow issue #122 and T54's full acceptance matrix.

## Contracts touched

T54's `/api/island/structures/repair`, caller wallet versus immutable receipt balance, repair-sequence guards, service-only receipt/event/quota transaction and canonical locks. T55 owns exact table signatures; reserve a separate later migration timestamp. Reuse `building_purchase` with `structure_repair:<uid>`.

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning; stronger-session orchestration and review.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and explicit publication confirmation.
- **Last updated:** 2026-11-16.
