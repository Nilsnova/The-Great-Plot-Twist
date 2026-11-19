# Legacy wave entry fences

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). This bounded #501
compatibility change prevents old RPCs from bypassing canonical shared sessions.
It creates no second wave, assignment, provider or reward writer.

Use the exact CLI-generated additive migration
`20261118225937_shared_legacy_wave_fences.sql`. Preserve all sixteen public
signatures, parameter names and defaults: `wave_start`, `wave_join`,
`wave_current`, both `wave_finish` overloads, `wave_revive`,
`wave_revive_charge`, and recovery start/join/current/finish, both input
overloads, event pages, health reports and revive. Capture each original once
under a private alias and restore the same wrappers on complete reapplication.
Browser roles and `service_role` cannot execute those aliases.

Before new legacy work, discover the actual immutable wave target and acquire
distinct actor/target advisory scopes in signed-hash order. Persisted shared
state, including paused admission, refuses before wallet/profile/island/domain
effects. Then hold the actor's public profile anchor before legacy wallet/island
locks and refuse a managed global Captain, independently of the target economy.
That anchor serializes against real adoption on another island. No failed schema
or missing function selects a legacy fallback. The actor-free `wave_current`
signature can fence only its target/owner; authenticated actor preflight remains
the HTTP caller's responsibility.

Closed retained personal obligations are different from new legacy controls.
Before adding any new scope or personal lock, a read-only retained predicate
requires the original participant, a closed run and no shared accounting row.
Protocol two also requires its valid canonical closed-health evidence. An
already completed participant may replay its old immutable result. An unpaid
participant must match the stored terminal outcome, and a retained win must
already have its legacy flag counted. This excludes a late claimed win that
would change a replacement island's progress. Eligible retained finish delegates
to the original body without a late profile lock or a new payout algorithm.

`recovery_wave_reward_is_closed` additionally excludes every
`island_wave_accounting` row. The existing legacy reward-recovery route remains
available for genuine old saved sources after personal adoption, departure,
deadline or island replacement. Shared accounting is never paid by that private
wallet path and never occupies its pending recovery batch.

The native session producer never calls these public old RPCs. Existing private
append-event, health-locked, last-tick, structure refresh and real Captain/wave
accounting/arsenal hooks remain untouched. Python refusal mapping and HTTP actor
preflight belong to their existing route owners.

Tests first reproduce an admitted-target legacy start and managed Captain start.
Real PostgreSQL checks every guarded signature, admission/adoption lock waits,
private alias ACLs, full migration reapplication and retained old payouts. The
existing personal freeze/legacy-finish concurrency test uses an actual closed
preconversion unpaid source before adoption; its positive payout and deadlock
assertions remain. Ordinary legacy wave/recovery/reward suites must still pass.

No hosted database operation, publication or feature activation is included.

## Verification

The admitted-target and managed-actor starts first reproduced two failures before
this migration. The ten-file wave, Captain, accounting, input, revive and reward
selection then passed **196 PostgreSQL cases in 31.30s**. A final test-only
extension separately verifies both direct unpaid protocol-two finish after
adoption and changed-input replay after recovery: the complete new fence file
passes **55 cases in 9.54s**. The disposable fixture applies all **97 migrations
twice**; the documented parser check accepts all 97 unique migration versions.
Full backend `ruff check .` and `git diff --check` pass.

The concurrency cases observe real advisory/profile waits against admission and
adoption. Private alias execution is tested as the SQL owner to retain the old
financial and accounting guard regressions; those fixtures are explicitly not a
native producer or authenticated session acceptance. Real HP expiry with shared
accounting verifies that closed shared history is excluded from personal reward
selection. The original personal freeze/legacy finish test still asserts a
positive genuine retained payout and no profile foreign-key deadlock.

The actor-free SQL read remains target-only. Its authenticated actor preflight,
HTTP refusal translation and the new canonical native producer are separate
integration work. No hosted or live database was used, and no publication,
feature activation or second authority source is included.
