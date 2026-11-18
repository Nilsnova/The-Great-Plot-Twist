# T55 Keep recovery consistent through island changes

**18 Nov rule update:** this subslice records its original implementation/evidence. Current [T54](T54-recovery-implementation-plan.md) and [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16) replace gradual repair/rate-change expectations with full current-health restoration at canonical wave end. Keep immutable closed combat HP and frozen history. Obsolete new-v1 purchase retirement is tracked by [#456](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/456); earlier test results below do not verify that later revision.

> **What this is:** the database mutation slice of T55's approved persistent-health implementation.
>
> **Who uses it:** Ianno and contributors implementing or reviewing the recovery database contracts.

- **Status:** in progress; tracking draft only, no review or merge requested.
- **Responsible teammate:** Ianno (@Iannomh123456).
- **Branch:** `feat/t55-recovery-mutations`.
- **Parent issue:** [#121](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/121).
- **Coding agent:** `gpt-6-luna`, high reasoning.

## Problem and scope

Building, upgrading, moving, demolishing, resetting, hiring and research can change structure identity, maximum HP or recovery speed. The approved T54 rules require those changes to settle eligible healing using the previous configuration, preserve actual normalized HP, and refresh the future configuration atomically. An accepted bell reservation locks wall and tower base-level upgrades throughout preparation and combat.

Implement the affected existing mutation functions in an additive migration, with disposable PostgreSQL tests. Preserve legacy behavior outside recovery v1, existing wallet accounting and immutable repair/wave history. Retired repair-only Captain skills cannot be newly purchased under v1; existing saved IDs retain ordinary point accounting.

The hook migration replaces only `island_build/6`, `island_upgrade/6`, `island_hire/5`, `island_research/9`, `island_specialise/7`, `island_tower_tree/10`, `island_move/6`, `island_demolish/5`, `island_fresh_start/4`, and `island_learn_skill/5`. Successful v0 changes increment the recovery revision without creating recovery health. V1 mutations settle under the old configuration before changing the island, then refresh current health/configuration from the frozen manifest and current stored layout. A fresh structure instance starts full; same-instance mutations preserve normalized actual health. Wall and tower level upgrades refuse damaged or reserved v1 structures before charging. Existing move/research/demolition/reset active-wave restrictions use canonical post-lock phase in v1 and keep their legacy guard in v0; reset does not cancel a reserved wave. After finish or expiry, reset advances the recovery epoch and clears phase/current health while retaining the recovery policy and historical wave, journal, and repair receipt rows.

## Ownership and dependencies

This branch owns `20261117050000_structure_recovery_mutations.sql` and its focused SQL tests. The T55 state foundation owns state tables/projection; draft #199 owns the new wave RPCs and shared `structure_recovery_refresh_locked` helper; draft #197 owns the six legacy wave/wall RPC fences. Do not duplicate their function bodies or edit their worktrees.

## Verification and risks

The focused SQL suite covers v0 revision increments, v1 full-health new instances, damaged and reserved-upgrade refusals without charge, normalized-health preservation on a maximum-HP change, settle-before-rate-change for Carpenter and wall research, stored workshop layout at the radius boundary, in-wave mutation with a frozen snapshot and canonical expiry followed by exact projected healing, retired-skill refusal, demolition/reset current-health cleanup with wave, journal and receipt history preserved, failed-refresh rollback of a build charge/revision/history deletion, service-role-only grants, and a two-connection reset-versus-upgrade lock race. Reapply migrations, verify service-only permissions, run SQL parsing and relevant backend checks. Changes to lock order or legacy wallet behavior require particular review.

No live migration, feature activation or deployment is authorized. Instruction/setup files remain unchanged; STATUS is append-only. Ianno reviews before publication confirmation; Franz (@frcola) must approve the current revision before human merge. Agents never merge PRs or enable auto-merge.
