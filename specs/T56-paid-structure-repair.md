# T56 Paid instant structure repair

> **What this is:** the implementation scope for one atomic, priced Repair now action.
>
> **Who uses it:** Ianno, the T56 agent and recovery API/client implementers.

- **Status:** core paid-repair implementation merged through PR #203. The 18 Nov full wave-end recovery rule keeps the paid price, shared allowance and receipt contract unchanged.
- **Branch:** `feat/t56-paid-structure-repair`
- **Issue:** [#122](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/122)
- **Dependency:** [T55 PR #136](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/136); its pinned state/schema and read adapter are integrated on this task branch.

## Why

The approved [T54 plan](T54-recovery-implementation-plan.md), merged in [PR #135](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/135), replaces wall-only repair with the same selected-target restore for walls and five tower kinds. Ianno authorized these assignments after Franz's merge and explicitly requested more agents. Existing legacy behavior stays compatible; the new feature remains inactive.

## What

- Fixed incremental current-base-level pricing, request validation and stable intent/receipt semantics follow T54's contract.
- A service-only transaction commits the payer wallet debit, full target HP, durable event, immutable receipt and shared quota together, using T55's canonical state and lock order.
- Exactly three successful actions share each island reservation UUID from accepted bell through preparation and combat until canonical closure. The API has no quota outside reservations, but normal full wave-end recovery leaves intact targets, which refuse without charge.
- Same UID returns its original receipt plus current state, never re-heals later damage or charges/uses a slot again. Invalid/intact/unaffordable/stale/exhausted actions do not commit a paid repair.

**Implementation files:** paid-repair request/receipt models, fixed-price rules, service, POST route, additive migration `20261117030000_paid_structure_repair.sql`, and focused HTTP/real-SQL tests. T55 owns shared state/schema and its canonical read API.

## Out of scope

No parallel rewrite of T55 state, legacy simulation, Captain policy or UI. No new wallet reason, dependency upgrade, live migration, flag activation or deployment. Repair spending is not refundable construction contribution.

## Done when (acceptance checks)

- [x] All six kinds/levels use server catalogue price independent of damage/payer; wall levels cost 10/20/40/80/160.
- [x] API and disposable PostgreSQL tests prove atomic rollback, shared last-use race, both phases, fresh-wave quota, same/changed UID, old receipt after new damage or demolition, stale quote/instance/reset/finish/expiry/upgrade refusals and history retention.
- [x] Focused backend tests and Ruff pass; full-chain disposable PostgreSQL applies/reapplies the migrations and checks the service grant. Ianno reviews; a different human approves the current revision before merge.

## Verification completed

Pure price/fingerprint validation, HTTP success/stale responses, authorization-before-UID and retry handling, disposable PostgreSQL rollback/race/quota/phase/price/refusal behavior, and stale-quote rejection after reset/demolition/upgrade/finish/expiry. Historical automatic-healing fixtures checked intact-target refusal; current verification must confirm that full wave-end restoration likewise refuses an intact target without charge/use and preserves immutable closed HP history.

## Contracts touched

T54's `/api/island/structures/repair`, caller wallet versus immutable receipt balance, repair-sequence guards, service-only receipt/event/quota transaction and canonical locks. T55 owns exact table signatures; reserve a separate later migration timestamp. Reuse `building_purchase` with `structure_repair:<uid>`.

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and explicit publication confirmation.
- **Last updated:** 2026-11-18.
