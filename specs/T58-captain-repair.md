# T58 Captain skills and wall research

> **What this is:** the implementation scope for removing obsolete Captain repair mechanics and defining shared research effects.
>
> **Who uses it:** Ianno, the T58 agent and the recovery-state/simulation implementers.

- **Status:** original Captain cleanup merged through PR #203; Workshop-copy follow-up #240 merged on 17 Nov. The 18 Nov full wave-end rule retires repair-only purchases; implementation is in [#456](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/456), paired with UI [#457](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/457). Current source/release evidence is separate.
- **Current branch:** `fix/wave-end-repair-options` (earlier follow-up: `test/t58-captain-recovery-followup`)
- **Issue:** [#124](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/124)

## Why

Full free restoration at wave end makes healing-speed purchases ineffective. New recovery-v1 purchases must not spend coins or progression on those effects. Implement [T54](T54-recovery-implementation-plan.md) without changing unrelated Captain abilities or silently changing legacy frozen waves. Ianno authorized this assignment after [PR #135](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/135) merged.

## What

- Retire the seven repair-only Shipwright choices and repair-triggered Engineer wall-HP bonus under the new policy, retaining ordinary point accounting, unrelated skills and the Engineer's 10% construction/upgrade discount.
- Retire new Carpenter hires, Workshop role selection, Quick Mend and Mason Drill under recovery v1. Reject them authoritatively before spending/progression changes, including policy-admission races; preserve successful old-UID retries and existing saved IDs.
- Keep Bastion selectable with +50% maximum wall HP, without its obsolete repair multiplier. No independent combat repair, replacement role, compensation or paid-price discount. Preserve frozen legacy behavior and unrelated crew/house/research choices.
- Begin with isolated Captain/Tech definitions, pure helpers, tests and skill UI. Coordinate exports with T55. T57 owns `sim.js`, `interact.js` and runtime E-action removal; provide the necessary contract and integration checks rather than editing its files concurrently.

**Files likely to change:** Captain definitions/stat helpers, Captain skill UI, campaign Tech definitions, isolated backend policy helpers and focused tests. Obtain an ownership handoff before touching shared backend service/catalogue files or migrations. T55 owns shared task boards and contract index during the parallel batch.

## Historical implementation evidence · before 18 Nov

These paragraphs describe the former gradual-recovery implementation and its captures. Its rate/Workshop claims are superseded by the current scope above; they remain provenance, not current player guidance.

The frontend has an isolated version-aware policy module at `frontend/src/campaign/captain-repair-policy.js`. `recoveryRateFactor()` accepts the island owner's Carpenter count, nearby Workshop count, supported structure kind, one wall's equipped `wallSpec`, island `wallResearch` and a between-wave boolean. It returns 0 during a reservation, applies Quick Mend or equipped Bastion only to walls, applies Mason Drill only to walls, and leaves other valid wall choices neutral. `isRetiredCaptainSkill()` and `captainBranchesForPolicy()` retain legacy behavior by default; under recovery v1 they hide the seven repair-only Captain choices without deleting stored ids or changing spent points. Captain stats accept an explicit `{recoveryVersion}` option so existing callers remain legacy by default. `skillsModel()` and `techModel()` also accept a `recoveryVersion`, defaulting to legacy 0.

The canonical GET `/api/island/structures` getter provides the saved recovery version, and the island integration passes it into Captain and Tech models. Tutorial help now selects a recovery-v1 copy from that same persisted version while preserving the original version-0 pages. In recovery v1, damaged/reserved structure cards disable level upgrades, and the raw catalogue wall value is labelled base strength so it is not confused with recovery-modified maximum HP. Focused model, integration and help tests plus production-UI fixture captures are documented in [T58 evidence](../docs/evidence/T58-captain-repair/README.md). The captures use controlled fixture data and do not demonstrate live API state, multiplayer, a deployed feature flag, or production activation. T55/T57/T59/T60 combined review, full acceptance checks and release checks remain pending.

The house-role card also uses this saved version: legacy islands retain the frozen Workshop repair/rebuild wording, while recovery v1 says that walls and towers within 10 units recover 30% faster between waves and nearby Workshops add up to 50%. This keeps the displayed policy aligned with the recovery projection for every supported structure. Desktop and phone captures of the selected Workshop row are in the [T58 evidence](../docs/evidence/T58-captain-repair/README.md); they use a local fake-island fixture and crop the production card to that row.

## Out of scope

No compensation/refund/respec subsystem, balance retune, paid transactions, broad simulation rewrites or T59 structure-card/renderer changes. No AGENTS/setup/instruction edits, live migration, activation or deployment. Preserve current behavior while the new policy is inactive.

## Done when (acceptance checks)

- [ ] Tests reject retired choices under the new policy, preserve valid normal point accounting and retained skills, and preserve legacy behavior.
- [ ] Tests prove obsolete new-policy requests do not spend/change progression, unchanged saved IDs do not block unrelated work/admission, and frozen legacy behavior remains valid. Bastion HP, Engineer discount and other house/crew/research choices remain effective; no free reserved-wave heal or repair-price discount.
- [ ] Relevant backend/frontend checks and client build pass; skill UI has visual evidence when integrated. Document implemented behavior and outstanding T55/T57 dependencies accurately.
- [ ] No secrets or unrelated files are included; Ianno reviews and a different human approves the current revision before merge.

## Tests to write first

New-v1 retired-option refusal and transaction rollback; successful-UID retry; stored-ID preservation; Engineer discount and Bastion HP isolation; legacy/new-policy behavior. Follow issue #124's full acceptance checks before readiness.

## Contracts touched

Version-aware Captain/Tech/crew/house availability and full wave-end restoration from T54. Historical rate wire fields may remain for compatibility, without offering a current healing-speed effect. Coordinate exact exports with T55 before consumers depend on them.

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and publication confirmation.
- **Last updated:** 2026-11-18.
