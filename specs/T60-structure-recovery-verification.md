# T60 Verify shared structure recovery

> **What this is:** the integrated regression and evidence task for T55–T59's approved repair implementation.
>
> **Who uses it:** Ianno and contributors validating the feature before human review.

- **Status:** core integration merged through PR #203; local fake-room browser follow-up #343 merged on 17 Nov. Its historical passing run does not prove the later full wave-end rule/option cleanup. Authenticated recovery, broader balance and release gates remain open.
- **Responsible teammate:** Ianno (@Iannomh123456).
- **Branch:** `test/t60-browser-recovery-followup`.
- **Issue:** [#126](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/126).
- **Coding agent:** `gpt-6-luna`, high reasoning.

## Scope

Prepare and run a repeatable local integration harness using disposable PostgreSQL, the actual API services and the production replay/client modules. Test two participants, accepted-bell pause, shared paid-repair ordering and quota, reconnect, duplicate payment retries after new damage, canonical finish/expiry/abandonment and immediate full restoration of every supported current structure, without altering the closed combat vector. Include obsolete-purchase refusal and preserved Bastion/Engineer/unrelated choices. Reuse existing fixtures and test tools; never access live player data or introduce a new dependency without agreement.

Record exact commands, source revisions, seeds and results, including baseline failures and any limits. Collect game screenshots or a short demo at desktop and phone sizes where they substantiate UI behavior. A DTO fixture or mocked transport screenshot is not evidence of real database or multiplayer behavior.

## Dependencies and ownership

T55 owns recovery state, Python lifecycle and SQL RPCs; T56 owns paid repair; T57 owns wave replay and controller wiring; T58 owns Captain/Tech policy; T59 owns cards and repair adapters. This branch owns integrated tests, diagnostics and `docs/evidence/T60-structure-recovery/`, plus relevant verification/release documentation. Report implementation bugs to their owning agents rather than editing the same production files concurrently. Do useful harness work while dependencies finish, then merge tested dependency commits on this branch while preserving all historical logs.

## Acceptance and risks

### Current browser follow-up

- [x] Restore normal captain defense after the deliberate fall/revive setup; use ordinary controls to reach the existing break and boss assertions without changing game health, seeds, timing limits or outcomes.
- [x] Keep visitor pages outside the roster until actual mid-wave Join, observe a fresh shot and its short musket mesh before the animation expires, and read the finisher midpoint before screenshot overhead consumes it.
- [x] The documented `npm run test:mp` journey passes with four local fake-room pages. Exact source hash, command, output and representative desktop/phone captures are in [the evidence](../docs/evidence/T60-structure-recovery/README.md#2026-11-17-local-multiplayer-browser-follow-up).

### Wider integration and release gates

- [ ] Real database and actual API/replay paths agree on HP, identity, event order and shared remaining uses for two participants.
- [ ] Accepted bell, preparation, combat, finish/expiry, canonical offline closure and the next reservation follow the approved boundaries; no gradual timer/ETA or free reserved-wave repair remains.
- [ ] Failed, repeated, stale and raced requests preserve wallets, quota and immutable history correctly.
- [ ] Evidence covers the changed UI and states its fixture, browser and trust limits accurately.
- [ ] Relevant documented checks pass; remaining failures or balance concerns are explicit.

No live migration, deployment or flag activation. No skipped assertions or relaxed timeouts to manufacture passes. Do not modify instruction/setup files. STATUS is append-only, with new entries starting `Ianno /`. Ianno reviews before publication confirmation; Franz (@frcola) must approve the current revision before human merge. Agents never merge PRs or enable auto-merge.
