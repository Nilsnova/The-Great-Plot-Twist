# T58 Captain skills and wall research

> **What this is:** the implementation scope for removing obsolete Captain repair mechanics and defining shared research effects.
>
> **Who uses it:** Ianno, the T58 agent and the recovery-state/simulation implementers.

- **Status:** in progress; isolated implementation first, integration coordinated with T55/T57.
- **Branch:** `refactor/t58-captain-repair`
- **Issue:** [#124](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/124)

## Why

Captain repair skills and independent wall regeneration conflict with the approved single automatic recovery process. Implement [T54](T54-recovery-implementation-plan.md) without changing unrelated Captain abilities or silently changing legacy frozen waves. Ianno authorized this assignment after [PR #135](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/135) merged.

## What

- Retire the seven repair-only Shipwright choices and repair-triggered Engineer wall-HP bonus under the new policy, retaining ordinary point accounting, unrelated skills and the Engineer's 10% construction/upgrade discount.
- Define Quick Mend ×2, Mason Drill ×1.5 and Bastion ×3 plus +50% max HP as shared between-wave modifiers. Enforce Quick Mend/Bastion exclusivity; Mason stacks. No independent combat repair or paid-price discount.
- Begin with isolated Captain/Tech definitions, pure helpers, tests and skill UI. Coordinate exports with T55. T57 owns `sim.js`, `interact.js` and runtime E-action removal; provide the necessary contract and integration checks rather than editing its files concurrently.

**Files likely to change:** Captain definitions/stat helpers, Captain skill UI, campaign Tech definitions, isolated backend policy helpers and focused tests. Obtain an ownership handoff before touching shared backend service/catalogue files or migrations. T55 owns shared task boards and contract index during the parallel batch.

## Out of scope

No compensation/refund/respec subsystem, balance retune, paid transactions, broad simulation rewrites or T59 structure-card/renderer changes. No AGENTS/setup/instruction edits, live migration, activation or deployment. Preserve current behavior while the new policy is inactive.

## Done when (acceptance checks)

- [ ] Tests reject retired choices under the new policy, preserve valid normal point accounting and retained skills, and preserve legacy behavior.
- [ ] Tests prove approved factors, exclusivity, maximum ×20.25 rate, paused reservation effects and no repair-price discount or free HP from stat changes.
- [ ] Relevant backend/frontend checks and client build pass; skill UI has visual evidence when integrated. Document implemented behavior and outstanding T55/T57 dependencies accurately.
- [ ] No secrets or unrelated files are included; Ianno reviews and a different human approves the current revision before merge.

## Tests to write first

Retired-ID selection and accounting; Engineer discount isolation; research exclusivity and rate parity; legacy/new-policy behavior. Follow issue #124's full acceptance checks before readiness.

## Contracts touched

Version-aware Captain/Tech policy and shared rational rate modifiers from T54. Reuse existing configuration; do not invent a second healing engine. Coordinate exact exports with T55 before consumers depend on them.

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning; stronger-session orchestration and review.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and publication confirmation.
- **Last updated:** 2026-11-16.
