# T55 Keep recovery consistent through island changes

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

## Ownership and dependencies

This branch owns `20261117050000_structure_recovery_mutations.sql` and its focused SQL tests. The T55 state foundation owns state tables/projection; draft #199 owns the new wave RPCs and shared `structure_recovery_refresh_locked` helper; draft #197 owns the six legacy wave/wall RPC fences. Do not duplicate their function bodies or edit their worktrees.

## Verification and risks

Test phase and damaged-upgrade refusals without charge, settle-before-rate-change, new instance initialization, no free HP from upgrades/research/reload, reset/demolition stale fences and history preservation, and meaningful two-connection lock races. Reapply migrations, verify service-only permissions, run SQL parsing and relevant backend checks. Changes to lock order or legacy wallet behavior require particular review.

No live migration, feature activation or deployment is authorized. Instruction/setup files remain unchanged; STATUS is append-only. Ianno reviews before publication confirmation; Franz (@frcola) must approve the current revision before human merge. Agents never merge PRs or enable auto-merge.
