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

Whole-backend Ruff currently reports two inherited duplicate declarations in the
merged `server/tests/island_helpers.py` context fixture. This increment leaves
that shared fixture to its owner and checks its own files separately.
