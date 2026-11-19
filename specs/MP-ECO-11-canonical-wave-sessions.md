# Canonical shared wave sessions

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). Issue #501 owns the
persisted controller, assignment integration, accepted-bell roster, reconnect and
succession lifecycle. The imported core API explicitly leaves this provider open;
MP-ECO-03 explicitly requires this implementation. This package completes that
boundary against the actual imported Captain and wave accounting hooks.

Status: the canonical controller/provider, native accepted bell, frozen-roster
journal, checkpoints, terminal settlement and autonomous deadline processing are
implemented. Session settings, auto-next pacing, runnable worker and full client
acceptance follow in dependent increments. No release or activation is implied.

## Existing sources and ownership

- `personal_captain_profiles.assignment_wave_id` is the sole global combat
  assignment. Use `personal_captain_lock_state_locked`,
  `personal_captain_attach_wave_locked`,
  `personal_captain_release_assignment_locked` and completion hooks; never create
  a second assignment table or initialize personal progress on a read.
- `wave_runs` and `recovery_wave_states` remain the canonical wave reservation,
  timing, journal and outcome stores. `island_wave_accounting`, participation,
  closure and completion receipts remain the immutable accounting history.
- Accounting roster slots remain exactly `{playerId,controllingSessionId,
  engineerCommitmentId}`. Freeze Arsenal copy/tenure separately through the actual
  private Arsenal loadout hook; expose its weapon in the combat snapshot.
- Successful `island_economy_authority(actor,owner)` responses retain exactly
  `actor_id,island_owner,is_member,reservation_id,session_leader_id,
  actor_assignment_wave_id`. The provider is read-only, lock-preserving and has
  no read-triggered expiry. Missing/deleted actors fail closed, including owners.

## Canonical persistence and clock

Add controller leases keyed by player, leader/settings/topic state keyed by
island, and frozen/dynamic participant slots keyed by existing wave/player.
These are controller/participant records, not another wave or assignment source.
All tables have RLS, no browser policy and no direct service write rights.

A lease stores controlling session UUID, server generation, continuous active
start, last accepted heartbeat, detection deadline and optional grace deadline. Browser presence
and client clocks grant no rights. Heartbeats renew a 15-second connection lease;
clients send them every 5 seconds. A reported disconnect fixes grace at the
server time plus 60 seconds. An unreported loss fixes it at the last accepted
heartbeat plus 60 seconds; the 15-second detection lease adds no extra grace.
Workers never reset either deadline to their processing time. Every mutator normalizes
elapsed deadlines under locks, independently of worker timing.

One player has one controlling lease globally. Attaching with the same session
and expected generation rotates the server generation atomically; exact request
replay returns the same attachment. A second session cannot acquire an occupied
lease. This fences duplicate tabs and obsolete disconnect/reconnect callbacks.
Released leases retain a per-player generation counter with no active island or
epoch, so reusing a tab UUID never reuses a previous connection generation.
Reconnect within grace retains the frozen slot, HP, fallen state, position,
cooldowns and complete journal. It grants no heal, revive, participation or new
fighter. At the deadline the slot withdraws and only the matching personal
assignment releases. Explicit departure or lost membership withdraws immediately.

The eligible incumbent leader survives absence strictly before that same grace
deadline. Thereafter elect the longest continuously connected eligible member,
with stable UUID tie break. Owner rights do not follow leadership. Break pause
only pauses automatic next-bell pacing; combat, journals and wagers keep running.

## Accepted bell and combat transport

Native shared waves require protocol 2. Protocol 1 shared requests refuse before
legacy writers; unadopted legacy/class/Pirate Point behavior remains compatible.
Unsupported legacy wave paths for an adopted Captain refuse rather than bypass
the global assignment or Engineer commitment. Existing route dispatch and legacy
SQL wrappers are integrated separately with the same shared module.

The accepted-bell SQL transaction acquires sorted signed Class 0 island guards,
account rows, sorted personal anchors/states, then island/admission/recovery,
wave and domain rows. It rechecks current membership, leadership, origin,
generation and idle assignments; freezes every eligible connected roster slot,
actual Captain profile/active skills/Engineer generation and Arsenal tenure;
creates the existing wave/recovery rows; then freezes accounting in the same
transaction. Difficulty and roster never shrink after bell.

`initial_snapshot.economy` is inserted immutably as exactly
`{mode:'island_shared',version:1,islandOwner,accountId,runEpoch}`. Recovery
`islandEpoch/reset_epoch` is a separate identity. The full token roster and frozen
Captain stats exist at bell. Public participant rows retain opaque tokens, with
no player/profile/account IDs added to those rows. Late arrivals are spectators.

Shared input acceptance authenticates the current controller/generation and
matching personal assignment under the same locks as journal insertion. Only a
post-combat-start active acknowledgment creates the existing participation
receipt. Membership, countdown-only connection and spectator reads do not.
Stored participation survives withdrawal and later disconnect.

Shared Captain state/checkpoints bind the accepted sealed journal frontier,
normalized HP, fallen nonce/tick, position, cooldown state and revival basis.
Reconnect replays that same history. During absence the frozen Captain remains
stationary and targetable until withdrawal; existing short presence timeouts
cannot remove it. Authenticated combat reports retain the existing report trust
boundary; this package does not claim a server implementation of every hit.
HP increases require a checked revival basis or bounded healing allowance from
frozen Tavern geometry and accepted pose/time intervals; natural Tavern recovery
must not silently disappear.

Ordered commands `captain_revive_hold_start:{type,targetId,fallId}` and
`captain_revive_hold_cancel:{type}` call MP-ECO-12 private hold hooks only after
input UID/counter ordering is accepted. Retry does not restart a hold. Raw client
`captain_revive` is refused. MP-ECO-12 owns the sole durable hold records and
completion receipt; it consumes the checked current fall through the private
session context/consume hooks in the same journal transaction.

The native producer compares the prepared static `expectedSource` and health
revision under its locks before inserting the bell. An accepted start root is
replayed before template preparation or current membership, phase and generation
checks. Its historical result has no current treasury, session or fighter proof.
Read-only members may page the journal without a controlling proof; only the
current frozen controller may append commands or report combat checkpoints.
Checkpoint HP increases are limited to actual ordered revival events and bounded
Tavern healing. A revival basis whose effective tick has not been replayed cannot
authorize a later fall report.

## Closure, deletion and autonomous progress

Canonical close normalizes deadlines before selecting an outcome: overall
expiry is terminal, and no eligible remaining Captain after grace is abandonment.
It closes existing wave/recovery state and structure HP, settles accounting once,
applies real personal completion effects and returns matching pending Arsenal
copies atomically. Active normal holders retain their copies. A late victory
cannot overwrite abandonment, defeat or expiry.

The native finish wrapper reads the actor's immutable completion first, before
current membership, epoch or control checks. Its response contains the five-field
original origin and that actor's completion only. Fresh economy/session fields
are nullable and appear only when the actor still belongs to that same current
account and epoch. The private close hook is also the single terminal path used
by reset/deletion and the autonomous worker. Worker discovery captures owners
before locking and rechecks every deadline under the common lock plan; it cannot
extend a silent-loss deadline or close a different wave discovered later.

Private actor-owner discovery includes an actor's lease and every open frozen
slot, including withdrawn slots awaiting eventual completion. Deletion marks a
durable per-slot disposition before physical deletion; only that exact marker
plus a missing live profile may authorize omission of a personal completion
hook. Ordinary membership departure never qualifies. Lifecycle integration owns
the immutable deleted-player tombstone and protects `wave_runs.started_by` from
destructive profile cascades. Cached JWTs cannot restore deleted-actor authority.

The independent worker uses durable due discovery and lock/recheck processing;
it needs no connected browser or HTTP read to release slots, elect leaders,
abandon/expire attempts, return pending copies or execute enabled auto-next.
Provide a runnable CLI worker plus bounded service RPCs. Actual deployment/worker
activation remains outside this local task; daily keepalive and five-minute
wager polling are not a substitute for this worker.

## Private channel generations

Per-island state stores a server-generated 24-hex topic nonce, yielding
`isle_<lowercase five-symbol code>_<nonce>` within the current place-length limit.
Rotate on admission, membership departure, deletion and reset. Metadata is
member-authorized. Fresh RLS checks require exact current nonce and membership
for every persisted shared island. Shared clients publish only to that current
namespace. Legacy cached channels may remain connected but receive no new shared
frames. This extends the earlier fresh-authorization fix into actual lifecycle
privacy; browser presence still does not grant combat or economic authority.

## Validation before delivery

Write failing real PostgreSQL tests before each implementation increment. Verify
the exact provider with actual production tables/hooks, no authority fixtures;
duplicate tabs/islands and generations; immutable bell roster/loadouts; countdown
versus active participation; before/at grace boundaries; deterministic succession;
late spectator and retained reconnect; membership/deletion and cached-JWT denial;
atomic rollback and original-account settlement; no-browser autonomous worker;
topic rotation and private channel behavior. Run relevant API/client integration
tests, full Ruff, migration parse/double-application and inspect the diff.

No local foundation result alone proves full browser/runtime acceptance. Keep
remaining integration checks explicit, and perform no push, publication, live
migration, conversion or activation as part of this task.

### Controller foundation verification

The first actual PostgreSQL regression failed because the production authority
RPC did not exist. The controller/provider, lifecycle identity guard, nonce-aware
RLS and existing guest-policy suites now pass **65 checks in 16.64 seconds**,
including a committed two-tab race and rollback of the refused root claim. The
normal fixture applies the complete **96-migration sorted chain twice**; no
authority fixture is installed. The lifecycle guard is the actual separate
dependency, defined after this migration, rather than a test substitute.

Changed Python paths pass Ruff, every migration parses and the diff has no
whitespace errors. Full-branch Ruff encounters two existing duplicate definitions
in the imported shared test fixture; those are fixed separately in the combined
integration branch. The native bell/input/checkpoint/close producer, HTTP/client
wiring, autonomous closure/auto-next and real revival happy-path proofs remain
the next increments; defining their private context signatures is not acceptance
of an unimplemented producer.
