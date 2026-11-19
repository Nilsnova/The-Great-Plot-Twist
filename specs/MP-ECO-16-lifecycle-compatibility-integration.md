# Shared lifecycle compatibility integration

This specification connects the existing reset treasury, canonical session and
arsenal hooks to the established reset and account-deletion routes. It preserves
the selected lifecycle policy; it does not define another authority or assignment
model. Responsible teammate: Ianno Hollensteiner. Scope: #500/#505 compatibility.

## Required behavior

Owner reset is one transaction: validate the typed island code and original
epoch, claim the existing global operation identity, require the canonical idle
boundary, dispose live island assets through their checked hooks and replace the treasury
through `island_economy_reset_treasury_locked`. Personal Captain progression stays
personal. The replacement receives exactly the configured server starting grant;
old cash, commitments, valid wagers and immutable receipts retain their original
account and epoch. Exact historical retries do not replace the current run again.
Countdown, active and expired-but-unsealed reservations block new reset claims;
the canonical closure/settlement must commit first. Reset never abandons a wave.
The public reset response always has `currentEconomy: null`: only a new canonical
island GET may adopt the replacement. The private treasury helper retains its
existing internal replacement projection; the public executor removes it.

Account deletion remains one database transaction, including the established
legacy crew handover and `auth.users` deletion. Deleting the owner of an admitted
island requires explicit `confirmOwnedIslandDeletion: true`; it deletes the live
owned island without succession or a new grant. Deleting a member preserves the
continuing island, its stock, other Captains and saved-origin settlement history.
The old one-argument deletion entry point must refuse shared-related deletion
unless the complete transaction prepares the required disposition.
Confirmed owner deletion requests canonical abandonment with deadline
normalization before disposing the owned island; this differs from reset's guard.

Discover every affected island before personal locks, acquire actor/island scope
and account locks in their common order, and revalidate discovery before applying
deletion. Session withdrawal revokes control immediately. A reserved copy remains
unavailable until its actual canonical closure; ordinary departure or a missing
profile never proves that personal completion may be omitted.

## Agreed integration boundaries

The existing canonical session implementation supplies private actor-owner
discovery, withdrawal, closure, deleted-slot marking and the exact predicate
`shared_session_personal_completion_omitted_locked(wave, actor)`. The accounting
closure uses that predicate only to omit a genuinely deleted player's personal
hook, while retaining its immutable completion receipt and all other effects.
Arsenal supplies private holder-owner discovery, exact-tenure deletion preparation
and account/epoch reset disposition. This integration owns no parallel leases,
assignments, wave store or arsenal holder foreign key.

The lifecycle integration owns retention of historical account ownership and
`wave_runs.started_by` identity. It detaches live-island foreign keys only after
retirement/disposition; it never retargets historical accounts to another player.

## Immediate deletion guard

CLI-generated migration `20261118223730_shared_player_deletion_guard.sql` creates
`island_deleted_player_dispositions(player_id, deleted_at)` without an Auth or
profile foreign key. It retains only the UUID and deletion time needed to prevent
reuse of a cached authenticated identity. The full deletion transaction inserts
the immutable row and deletes Auth in the same commit; rollback publishes neither.
No ordinary role can insert, update or delete it.

Service-only `island_lifecycle_actor_status(uuid)` returns exactly
`{status: 'active' | 'deleted'}`. A missing Auth user is also inactive. The Python
`shared_lifecycle.ensure_not_deleted(admin, actor)` refuses deleted actors with
401 and fails closed on unreadable/unavailable state. The application owner wires
this into authenticated dependencies; canonical database authority and mutations
independently reject a missing profile or a persisted deletion marker. Local cache
invalidation alone is insufficient across workers.

## Validation and scope

Write meaningful adapter and disposable PostgreSQL checks before implementation.
Use the actual private initialization/admission and canonical persisted session
implementation in integrated lifecycle tests, without replacing authority with a
fixture provider. Seeded local identities are test records, not provider-issued
authenticated acceptance. Verify reset retries/races/rollback, preserved old wager
settlement, deleted starter/member completion, copy disposition, explicit owner
confirmation, restrictive grants and replay after retirement. Apply the complete
local migration chain twice, run affected tests/Ruff/SQL parsing and review the diff.

No hosted database, production activation, conversion or admission policy is
changed. Actual-provider multi-client acceptance remains separate. The first guard
commit alone does not claim complete reset or deletion orchestration.

## Guard-stage verification

The initial adapter check failed collection because the module did not exist;
the initial three PostgreSQL checks failed on the absent function/table. After
implementation, six adapter checks passed in 0.65 seconds and three PostgreSQL
checks passed in 4.93 seconds. The disposable runner applied all 95 migration
files twice; the documented parser accepted those 95 files. These are schema and
adapter checks, not an authenticated reset/deletion flow.

Whole-backend Ruff at the initial guard stage reported two inherited duplicate
declarations in the merged `server/tests/island_helpers.py` context fixture.
That increment left the shared fixture to its owner and checked its own files.

## Executor checkpoint

CLI-generated `20261118230046_shared_lifecycle_transactions.sql` composes the
provided hooks. New service entries are `island_lifecycle_reset` and
`island_lifecycle_delete_player`, plus the status guard. The established
`delete_player(uuid)` enters the same private composition in legacy-only mode;
it refuses shared-related actors. Its original crew handover/Auth implementation
is retained privately, without a direct service grant.

Deletion captures all held-copy owners, including legacy stock, actor-started
legacy waves and authored checkpoint cleanup owners. Distinct signed Class 0
keys precede account rows, the actor wallet, legacy crew/Auth rows and sorted
personal anchors. A final actor `FOR UPDATE` fence prevents new FK references;
changed discovery retries the whole guarded savepoint before domain effects.
No lower-order scope is acquired late. Historical accounts, wave starters/owners,
recovery owners and shared checkpoint actors retain their original UUIDs with
live-parent checks on new records. Explicit legacy-only history purge preserves
the original unadopted deletion semantics.

The public reset result contains the original common receipt and
`currentEconomy: null`. The immutable result retains the provided foundation's
`newAccountId`, `newRunEpoch`, `retiredTreasury`, `startingCoins`, `grantReceiptId`,
`grantPolicyVersion` and integer `effects`. Fresh canonical GET selects the
replacement. Paused account deletion does not unpause; reset remains active-only.
Pure legacy deletion adds no new permanent UUID disposition; missing Auth still
fails the status guard immediately.

The provided canonical controller, arsenal holder and paused-disposition fixes
are local dependencies. The shared fixture duplicate noted above is resolved by
its separately supplied integration fix. This checkpoint passed:

- 64 lifecycle adapter, existing deletion-route and provided reset-parser checks
  in 3.91 seconds.
- 13 full-chain PostgreSQL lifecycle checks and 15 historical crew-version
  regressions, **28 passed in 13.21 seconds**. The new checks use the actual
  persisted authority without replacing it; seeded identities remain fixtures.
- Whole-backend Ruff, 98-file migration parsing and whitespace checks.

Actual native active-wave production/closure and the committed legacy-copy,
wallet and inventory-expansion races remain follow-up checks. This checkpoint
does not label those gates complete or imply provider-issued authentication.

## Committed legacy-writer races

Three additional real PostgreSQL checks passed in 5.25 seconds. A published
legacy arsenal return holds its island scope while waiting for a copy; deletion
waits for that exact scope before taking the actor profile. An accepted private
wallet transaction commits before deletion upgrades the profile. A new legacy
copy is acquired after deletion captures its initial scope set; the new island
has an earlier signed scope key. After its FK fence detects the change, deletion
releases its previous profile lock and waits on the newly discovered scope before
continuing. The tests assert actual `pg_blocking_pids` wait edges and independently
probe profile locks, then commit both real operations. No domain helper or
authority provider is replaced for these checks.

## Existing membership compatibility boundary

The existing service signatures `game_join(uuid, uuid, integer)` and
`game_leave(uuid, uuid)` must also use the canonical lifecycle. A separate
CLI-generated migration will preserve their original implementations privately.
Shared calls acquire the provided captured scope/account plan and personal/domain
rows before the established membership writer. Missing/deleted actors fail closed.
An actual active-to-left transition withdraws only that island's frozen slots and
held-copy tenure, rotates its topic and invokes canonical normalization in the
same transaction. A host-leave refusal changes neither control nor topic. A new
membership or rejoin rotates the topic once; a redundant active join preserves
its topic generation. No second membership API or assignment store is added.

## Reset phase correction and retained legacy behavior

Review against the provided lifecycle foundation corrected an earlier integration
assumption: owner reset must refuse reservations, while confirmed owner deletion
may abandon them. Four negative boundary fixtures initially exposed the reset's
attempt to invoke canonical closure. New claims now check both the recovery
reservation and unclosed accounting before asset/control mutation; their refused
root claims roll back. Idle reset records `wavesClosed: 0`. Original receipt replay
still precedes a later run's reservation. These fixtures test fail-closed phase
boundaries; native accepted bell/closure remains a separate integration check.

The expanded lifecycle transaction file passed 21 checks in 9.30 seconds. It also
proves current-wrapper mystery-crew handover/version increments once, explicit
legacy-only checkpoint and unlinked recovery-history purge, private helper grants,
and an actual saved-origin market wager settling once after reset and physical
member/owner deletion. Market evidence and clock advancement are labelled test
fixtures; authority remains the real persisted provider. The replacement account
receives no portion of the old wager's payout.

## Membership compatibility checkpoint

CLI-generated `20261119000309_canonical_membership_lifecycle.sql` implements the
existing join/leave wrappers and keeps both original aliases private. Target
withdrawal cannot revoke a controller or assignment on another island. Stock
without a controlling lease still returns at an idle boundary. Shared membership
and topic changes roll back together if its exact copy disposition fails. Inactive
actors are refused by the database even through the legacy service signatures.

Eight new membership cases first produced seven failures on the old behavior.
After implementation, the combined membership, original game-room, lifecycle and
committed race suite passed **40 checks in 20.09 seconds**. The complete 99-file
migration chain was executed twice by the disposable runner. Whole-backend Ruff,
99-file SQL parsing, unique migration versions and whitespace checks passed.
Native reserved-slot leave and active owner-delete closure checks remain separate
until the supplied accepted-bell/canonical-close implementation is committed.

The committed-race file now also runs simultaneous identical/distinct reset UIDs
and duplicate deletion requests through the actual public lifecycle executors.
Both reset races create one replacement and one immutable receipt; a new
connection with changed grant configuration recovers the original successful
UID. Concurrent deletion commits one disposition and the other attempt observes
`not_found`. Together with the three legacy-writer cases, **six checks passed in
8.47 seconds**; no extra schema or runtime behavior changed in this increment.

## Legacy mystery-crew lock compatibility

The existing seat-transfer RPC takes the actor profile before its draft/target
crew rows, while established deletion preserves crew/Auth-before-profile ordering.
A committed published-RPC probe reproduced a real `40P01` cycle. The deletion
composer must capture affected crew IDs and all their owner/participant profile
IDs before Class 0 locks, include them in the fixed guard batch and revalidate
the complete inventory. Every profile acquisition after crew rows uses `NOWAIT`;
contention retries the whole guarded savepoint, releasing crew locks so the
accepted profile-first writer can finish. The existing crew APIs stay unchanged.
Actual actor-transfer and survivor-handover races must prove both operations
commit, alongside the existing copy, wallet and newly discovered scope checks.

Both published seat-transfer cases first failed with PostgreSQL `40P01`. After
the fixed crew/profile inventory and nonblocking personal stage were implemented,
the eight committed races plus lifecycle/membership regressions passed **37
checks in 22.42 seconds**. The new-earlier-stock test now holds the early accepted
wallet writer while the copy commits, so it tests scope discovery independently
of intentional profile-contention refusal. The real native bell producer is an
additional provided dependency in this run; all 100 migrations applied twice.
Whole-backend Ruff, 100-file parsing/version uniqueness and diff checks passed.

## Actual accepted-bell reset boundary

Four additional checks use the committed native bell producer with real attached
controllers, personal assignments, full frozen roster and persisted authority.
Countdown, combat and an actually elapsed one-second expiry all refuse a new
reset without withdrawing either slot, clearing assignments, sealing accounting
or retaining a reset root. After an idle reset, a canonical context read supplies
the new run; its next native bell carries the new original account/epoch while
the prior reset UID still returns its immutable old receipt. **Four passed in
7.05 seconds**. Local identities and combat configuration remain test fixtures;
these are real domain transactions rather than provider-issued session evidence.

## Actual canonical closure and deletion

The provided native closure/finish/worker and captured-time health correction
unblock full lifecycle composition. Ten native cases passed in 8.90 seconds:

- A member starts the actual accepted wave, sends a real command and accepted
  structure-health checkpoint, then physically deletes Auth. The original wave
  starter UUID, immutable snapshot and shared checkpoint proof survive; the
  journal actor is cleared while its participant token remains. A survivor's
  actual finish pays one original-account reward, writes both global completion
  receipts, advances the survivor's personal milestone and releases the exact
  pending copy generation. A lost-response finish retry adds no effect.
- Confirmed owner deletion closes actual countdown/combat attempts as abandoned
  and an actually elapsed attempt as expired before live-island/Auth cascades.
  Original wave/recovery ownership, snapshot and retired account remain, while
  the other Captain's assignment is released and their profile preserved.
- Actual member leave keeps a copy pending until canonical finish, including a
  member who held stock without any controlling lease or frozen roster slot.

The earlier native reset gates and replacement-bell replay cases are included
in this ten-case total. The complete 101-migration local chain executes twice.
Seeded Auth identities and trusted combat configuration are fixture provenance,
not provider-issued authentication or an independent per-hit combat verifier.
