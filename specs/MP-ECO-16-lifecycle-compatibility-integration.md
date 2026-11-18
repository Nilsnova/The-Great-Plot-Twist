# Shared lifecycle compatibility integration

This specification connects the existing reset treasury, canonical session and
arsenal hooks to the established reset and account-deletion routes. It preserves
the selected lifecycle policy; it does not define another authority or assignment
model. Responsible teammate: Ianno Hollensteiner. Scope: #500/#505 compatibility.

## Required behavior

Owner reset is one transaction: validate the typed island code and original
epoch, claim the existing global operation identity, close canonical reservations,
dispose live island assets through their checked hooks and replace the treasury
through `island_economy_reset_treasury_locked`. Personal Captain progression stays
personal. The replacement receives exactly the configured server starting grant;
old cash, commitments, valid wagers and immutable receipts retain their original
account and epoch. Exact historical retries do not replace the current run again.
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
