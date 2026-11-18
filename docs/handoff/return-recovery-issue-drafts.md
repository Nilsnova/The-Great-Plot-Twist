# Return recovery issue drafts

Approved publication drafts for Ianno and the reviewer. The initial issue actions were rejected by automatic approval review; after Ianno explicitly approved publication to `Nilsnova/The-Great-Plot-Twist`, both were published on 2026-11-18:

- [#483 — Recover unfinished closed-wave rewards after returning](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/483).
- [#484 — Audit and reconcile confirmed historical missing revival payments](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/484).

## Recover unfinished closed-wave rewards after returning

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

Goal: after a full reload or reconnection, recover this authenticated player's unfinished closed protocol-2 wave rewards from saved participation/outcome records. Preserve the original recorded loot and existing exactly-once wallet reference. Support prior members, other islands, later waves and disabled feature admission. An empty result still returns fresh wallet and personal win progress after a lost response.

Contracts: authenticated `POST /api/waves/recover`, bounded batches of 20, response `{coins, wonWaveBest, recovered: [{waveId, wave, survived, loot}], hasMore}`. Additive service-only SQL functions and pending-participation index; no client checkpoint or outcome input. Ordinary late finishes and recovery share the saved entitlement. A background client uses session/provider lifetime guards and paced startup/reconnect/visible retries; historical quest progress cannot change current battle state or narration.

Acceptance: new red/green regressions; actual SQL/HTTP tests for late finishes, reset/membership changes, lost replies, repeated and concurrent settlement, bounded draining, malformed/open records, no duplicate host/HP effects; client identity/disposal/hidden/offline/backoff tests; fresh wallet display and persisted quest progress; documented verification and limits.

Branches: `fix/reward-return-recovery` and `fix/reward-return-client`; combined review checkout `fix/wave-return-recovery`. Development main base: `37eb70fa`; earlier local co-op fixes are retained as prerequisites.

## Audit and reconcile confirmed historical missing revival payments

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

Goal: provide a read-only-default, service-only audit and narrowly bounded reconciliation for verified old revival payments. Existing receipts lack positions and success markers; legacy room events and old unlinked generic journal commands must not be guessed as failures.

Refund only retained matching receipts/debits for closed protocol-2 waves with complete contiguous journals and no potentially matching revival command. Preserve active, legacy, gapped, reset and ambiguous history. Original valid live requests remain repeatable through the existing API; never synthesize old coordinates or revive a later fall. Refund exactly the original debit once through `admin_adjust` and a stable original-payment reference, rechecking evidence under locks.

Acceptance: dry-run immutability, old successful event and legacy negatives, incomplete/orphan/open negatives, exact amount and repeat/concurrency/rollback checks, denied browser grants, owner SQL instructions and actual scratch-PostgreSQL evidence. No new browser route, table or wallet reason. No production audit, affected-player count or compensation is claimed.

Branch: `fix/historical-revive-reconciliation`; combined review checkout `fix/wave-return-recovery`. The development checkpoint kept code local; publication now uses a separate review stack. Different human review and live application remain open.

## Publication stack

The development branch names above identify preserved worktrees. Publication is based on main
`db573347`: core draft [#485](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/485),
reward draft [#486](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/486), followed by
[historical draft #490](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/490) on
`fix/historical-revive-reconciliation-review`. Review in that order and retarget each descendant
onto main after its predecessor merges. No live database or deployment step has been performed.
