# Persisted arsenal holder deletion and frozen loadouts

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). This bounded #500
change composes existing arsenal storage with canonical session and account
deletion transactions. It creates no competing session, assignment or authority.
Migration `20261118223655_shared_arsenal_holder_lifecycle.sql` was generated with
the Supabase CLI; it changes only arsenal-owned relationships and private helpers.

The canonical session transaction owns scope/account locks, any early common
operation root, sorted personal anchors/state, island/session/wave rows and then
copy rows. It revokes controller input and releases only the matching global
Captain assignment before preparing an exact copy tenure. A trusted original
reservation retains that copy until canonical closure; outside a reservation the
copy returns immediately. The existing private holder/return helpers remain the
implementation of these state changes.

Upgrade `island_shared_arsenal_loadouts_locked(account, epoch, players)` to lock
target copies and reject unknown/unbound stock before returning its existing
`{playerId, weapon, copyId, generation}` rows. The caller persists this once in
its immutable accepted-bell session snapshot. The helper does not create a
session or make repeated projections immutable. A missing carried copy means the
free musket only after the target inventory has passed the scope checks.

Add private `island_shared_arsenal_prepare_holder_deletion_locked(account,
epoch, actor, copy, generation, now, wave)` to check the original copy/tenure and
delegate withdrawal. It accepts only the canonical caller's checked original
reservation, never client phase or a new assignment. Repeating an already
prepared matching pending return or exact completed release is harmless. Stale
tenures, different pending waves and changed scopes refuse the outer transaction.
The helper grants no physical-deletion authority and has no service/browser
execute grant.

Replace the holder-to-profile cascading foreign key. A bound shared pending copy
retains its historical holder UUID after profile deletion, so it stays unavailable
and retains its copy identity and tenure. Nulling a pending holder conflicts with
the existing invariant and could expose a reserved copy. A profile-delete asset
guard refuses any unprepared bound shared held copy. Truly legacy held copies
retain their existing deletion behavior. The coordinated account-deletion caller
must establish the canonical deleted-participant disposition before removing a
profile; this asset guard is not a substitute for that disposition.
New holder assignments retain the old live-profile existence check. Only an
unchanged bound pending copy/holder/tenure/origin/wave may retain a missing
profile UUID; it cannot be changed back into an active held copy after deletion.

This change does not alter `wave_runs.started_by`, historical treasury ownership,
account deletion routes or the reset executor. Those coordinated changes must
preserve continuing waves, retained origin receipts and other Captains. A missing
personal profile still cannot excuse a completion hook without a genuine saved
deleted-participant disposition.

Private `island_shared_arsenal_holder_owners(actor) RETURNS uuid[]` supplies sorted
distinct shared holder scopes before personal locks. It creates no rows and has
no service/browser execute grant. The encompassing deletion transaction must
revalidate discovery under all sorted scope/account locks.

Private `island_shared_arsenal_reset_locked(account, epoch, actor, now)` clears
only the current owner's matching live copy rows after real authority establishes
an idle target. Missing authority, pending returns or unclosed shared accounting
refuse; a closed legacy wave row alone cannot authorize clearing an unfinished
canonical attempt. The result is `{copiesCleared, historicalMovesRetained}` with
integer counts. Immutable shared receipts/roots/ledger and legacy movement rows
remain intact; the existing legacy movement foreign key nulls its live-copy
pointer. The complete reset/deletion caller owns the common receipt and must
roll back these asset changes together with every other domain on failure.

Tests first reproduce cascading loss of a prepared shared copy, unprepared
deletion and an unbound frozen-loadout fallback. Real disposable PostgreSQL then
checks immediate versus pending release, exact original-wave settlement, stale
generation/scope refusal, complete rollback, legacy compatibility and committed
grandfathered inventory above twenty copies. Private helper grants and complete
migration reapplication are verified. Canonical session and account-deletion
composition remain separate integration checks until their actual modules land.

No hosted migration, admission, publication or deployment is included.

## Verification

Three real PostgreSQL regressions first failed on the existing cascade,
unprepared deletion and unbound loadout fallback. Three further profile-integrity
regressions failed before adding the replacement live-holder guard. The final
holder/runtime/shared/legacy arsenal selection passes **94 tests in 23.88s**,
including **24 new domain cases**. The full 95-file migration chain applies twice
on disposable Unix-socket PostgreSQL. The grandfathered 24-copy case commits
physical deletion and then commits exact-wave return settlement without loss.
Real Captain/accounting hooks verify that closed legacy wave metadata cannot
hide an unclosed canonical accounting attempt.

The new test file passes Ruff; all **95** migration versions are unique and parse.
Full-backend Ruff identifies two inherited merge duplicates in
`server/tests/island_helpers.py` (repeated context handler/key); this domain change
does not edit that shared fixture. No integrated canonical session, deletion
orchestrator, hosted database or authenticated multiplayer pass is claimed here.
