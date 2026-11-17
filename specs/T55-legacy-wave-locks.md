# T55 Legacy wave database locks

> **What this is:** the independent compatibility slice of T55's approved persistence work.
>
> **Who uses it:** Ianno and the wave/recovery implementers and reviewers.

- **Status:** in progress; depends on T55's additive state migration.
- **Branch:** `fix/t55-legacy-wave-locks`
- **Issue:** [#121](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/121)

## Why

Existing wave finish locks the wave before island progress, while reset locks the island before the wave. The approved [T54 plan](T54-recovery-implementation-plan.md) requires consistent order before new recovery admission. The old paid-wall API also needs an atomic guard against modifying a recovery-v1 island. This slice lets the new lifecycle APIs proceed independently.

## What

- Preserve existing signatures and business behavior for legacy waves while aligning locks in `wave_start/12`, `wave_join/2`, and both `wave_finish/8` and `/11` overloads.
- Guard legacy `island_wall_restore/6` and `island_walls_record/3` against recovery-v1 writes under canonical locks.
- Use one additive migration, `20261117025000_legacy_wave_locks.sql`, after T55's state schema. Keep payer wallets first, changed island rows sorted, then recovery state, wave, participants and buildings. Revalidate ownership after discovery and locks.

**Files likely to change:** that migration, focused disposable PostgreSQL compatibility/concurrency tests, this spec and the owning Supabase contract notes by coordinated handoff. New recovery-v1 lifecycle APIs remain in the main T55 slice.

## Out of scope

No new v1 start/finish implementation, mutation/research/layout rewrite, paid transaction, client changes, balance/timing changes or live database work. No new wallet reasons, dependencies or settings changes. Preserve D060 extra plots and unrelated old behavior.

## Done when (acceptance checks)

- [ ] All six final function bodies retain their existing signatures and legacy success/idempotency/loot/timing behavior.
- [ ] Scratch PostgreSQL apply/reapply, grants and legacy regression tests pass; reset versus finish and concurrent caller/owner cases have actual evidence without weakened timeouts.
- [ ] Legacy repair/record cannot change new-policy health or bypass new-policy rules; old frozen-wave handling agrees with T55 dispatch.
- [ ] Full diff and relevant contracts are reviewed; no secrets/unrelated files, migration application, activation or deployment. Ianno manually reviews; Franz approves the current revision before a human merge.

## Tests to write first

Legacy start/join/finish parity, both live finish overloads, duplicate finish, unchanged loot/timing, reset/finish serialization, service-only permissions and new-policy legacy-wall write refusal. Use the existing private Unix-socket PostgreSQL fixture; never live credentials.

## Contracts touched

Final legacy RPC signatures and lock order from T54. Legacy `wave_start`, `wave_join`, both `wave_finish` overloads, and `island_wall_restore` return `{status: refused, reason: client_update_required, recoveryVersion: 1, waveProtocol: 2}` when the legacy call would enter or mutate a protocol-2 recovery wave/policy. The API mapper translates that reason to HTTP 409. `island_walls_record` returns its existing `{status: skipped}` shape when recovery-v1 owns island health. Existing legacy successful responses stay unchanged.

## Owner and reviewer

- **Responsible teammate:** Ianno (@Iannomh123456).
- **Coding agent:** `gpt-6-luna`, high reasoning.
- **Human reviewer:** Franz (@frcola), after Ianno's manual review and publication confirmation.
- **Last updated:** 2026-11-17.
