# T60 Verify shared structure recovery

> **What this is:** the integrated regression and evidence task for T55–T59's approved repair implementation.
>
> **Who uses it:** Ianno and contributors validating the feature before human review.

- **Status:** in progress; integration dependencies remain unfinished.
- **Responsible teammate:** Ianno (@Iannomh123456).
- **Branch:** `test/t60-structure-recovery`.
- **Issue:** [#126](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/126).
- **Coding agent:** `gpt-6-luna`, high reasoning.

## Scope

Prepare and run a repeatable local integration harness using disposable PostgreSQL, the actual API services and the production replay/client modules. Test two participants, accepted-bell pause, shared paid-repair ordering and quota, reconnect, duplicate payment retries after new damage, canonical finish and immediate between-wave recovery. Reuse existing fixtures and test tools; never access live player data or introduce a new dependency without agreement.

Record exact commands, source revisions, seeds and results, including baseline failures and any limits. Collect game screenshots or a short demo at desktop and phone sizes where they substantiate UI behavior. A DTO fixture or mocked transport screenshot is not evidence of real database or multiplayer behavior.

## Dependencies and ownership

T55 owns recovery state, Python lifecycle and SQL RPCs; T56 owns paid repair; T57 owns wave replay and controller wiring; T58 owns Captain/Tech policy; T59 owns cards and repair adapters. This branch owns integrated tests, diagnostics and `docs/evidence/T60-structure-recovery/`, plus relevant verification/release documentation. Report implementation bugs to their owning agents rather than editing the same production files concurrently. Do useful harness work while dependencies finish, then merge tested dependency commits on this branch while preserving all historical logs.

## Acceptance and risks

- [ ] Real database and actual API/replay paths agree on HP, identity, event order and shared remaining uses for two participants.
- [ ] Accepted bell, preparation, combat, finish/expiry, offline settlement and the next reservation follow the approved boundaries.
- [ ] Failed, repeated, stale and raced requests preserve wallets, quota and immutable history correctly.
- [ ] Evidence covers the changed UI and states its fixture, browser and trust limits accurately.
- [ ] Relevant documented checks pass; remaining failures or balance concerns are explicit.

No live migration, deployment or flag activation. No skipped assertions or relaxed timeouts to manufacture passes. Do not modify instruction/setup files. STATUS is append-only, with new entries starting `Ianno /`. Ianno reviews before publication confirmation; Franz (@frcola) must approve the current revision before human merge. Agents never merge PRs or enable auto-merge.
