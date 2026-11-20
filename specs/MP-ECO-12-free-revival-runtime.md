# MP-ECO-12: Free shared Captain revival

> **What this is:** canonical ordered hold proofs and an atomic free revival effect.
>
> **Who uses it:** shared-wave controllers, the session input writer and the authenticated client.

- **Status:** specified before implementation; hold/completion source is implemented against the
  actual canonical session hooks. Native bell/input/Captain-report acceptance remains a coordinated
  dependency for gameplay verification and activation.
- **Issue:** [#502](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/502).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
- **Branch:** `feat/shared-free-revival-runtime`.

## Authority and scope

Use the existing recovery wave, immutable accepted-bell economy binding, journal and the actual
MP-ECO-11 session/Captain source. Do not create another controller, assignment, Captain HP or
fall store. Personal Captain snapshots and arsenal tenure freeze at accepted bell; current
legacy island skills or weapons cannot replace them. Treasury run epoch and recovery reset
epoch remain separate. Three paid structure repairs still use the existing accepted reservation
UUID and shared paid-used counter; this free action uses neither allowance nor money.

The canonical session input writer accepts exactly `captain_revive_hold_start` with
`{type,targetId,fallId}` and `captain_revive_hold_cancel` with `{type}`. UUIDs identify the target
token and current server fall. Existing authenticated input UID/counter ordering applies before
calling the hold hooks; input replay does not restart a hold or repeat cancellation. Shared
raw `captain_revive` input is refused. The session writer supplies one post-lock server timestamp,
verified session/generation and the actual accepted Captain state. No browser elapsed time,
HP, down flag, distance, position, role, skill or paid receipt authorizes completion.

MP-ECO-11 retains the current combat-report trust limit: authenticated accepted reports tied to
the exact sealed journal frontier, rather than proof of every hit. It owns current fall identity,
pose revisions and revive basis. Legitimate Tavern regeneration uses its server-derived frozen
geometry/accepted-pose allowance; a naive decreasing full-HP vector must not disable healing.

## Private hook contract

All hooks are owner-defined with empty search paths and no standalone service/browser execution.
The canonical caller preholds sorted common actor/target/roster scope keys, original account,
sorted personal anchors/states, island/recovery and wave locks. Session slot locks follow in
player UUID order; no lower-order account/personal lock is introduced afterward.

MP-ECO-11 provides:

- `shared_session_revival_context_locked(actor uuid,wave uuid,target uuid,session uuid,generation numeric)`.
  It checks current controller, assignment, membership, open frozen origin and retained target
  fall. Facts contain helper/target tokens, fall UUID and down tick, both pose revisions/positions,
  HP units, target maximum HP, frozen helper skills/Captain metadata, server revive reach,
  required milliseconds and restore HP units. Ordinary holds require 2000 ms; Medic requires
  1200 ms. Restoration uses the actual frozen Medic/Field Surgeon rule.
- `shared_session_revive_consume_locked(wave uuid,target uuid,fall uuid,reviveSeq bigint,restoreHPUnits integer)`.
  After the event is inserted in the same transaction it consumes exactly that fall and advances
  the canonical accepted HP/revive basis. It cannot accept an unrelated or already consumed fall.

This package provides:

- `shared_revival_hold_start_locked(actor uuid,wave uuid,target uuid,fall uuid,session uuid,generation numeric,inputUid text,actorCounter bigint,serverNow timestamptz)`.
- `shared_revival_hold_cancel_locked(actor uuid,wave uuid,session uuid,generation numeric,inputUid text,actorCounter bigint,serverNow timestamptz)`.
- `shared_revival_hold_context_locked(actor uuid,wave uuid,hold uuid,target uuid,fall uuid,session uuid,generation numeric,serverNow timestamptz)`.

The only hold store records server creation time, accepted input identity, frozen origin,
session/generation, helper/target/fall, pose revisions and the existing helper revive basis.
Falling and being revived at the same position also invalidates the old interval. It is proof of this ordered hold,
not a second source of Captain state. New starts replace an earlier active hold; repeated starts
retain their original time. Cancel counters cannot cancel later starts. Any accepted pose change,
target/fall change, control-generation change, withdrawal or closure makes the proof unusable.
Completion compares actual server elapsed time and current range against the frozen requirement.
The canonical context requires the helper/target's current accepted party prefix to be complete,
covered by the stored seal, and at most exactly 2000 ms old on the trusted server clock. Its
input head and genuine revival bases must be covered at that prefix. Reader-only seal movement
does not invalidate recent facts. An old standing checkpoint cannot be renewed by a new UID;
the client performs a fresh accepted sync before completion. Current pose/fall/control/life
checks remain independent. This retains bounded authenticated-report trust and does not claim
instantaneous wall-clock HP or proof of every hit.

## Atomic completion and HTTP

The strict shared completion request contains the published economy intent, root `actionUid`,
wave UUID, target token, server fall UUID, server hold UUID and session/generation fences. It has
no navigation code, payer/account selector, HP, coordinates, down tick, elapsed time or price.
The server resolves the original account. Owned common receipt lookup precedes current
membership/epoch/hold/phase checks. Session and hold guards may refresh without changing the
immutable target-wave/fall intent.

A fresh effect claims one common root, validates the real hold/context under canonical locks,
rechecks the current recovery reservation and its separate reset epoch,
appends exactly one existing `captain_revive` event with genuine frozen helper metadata and
server-derived down tick/position, consumes that current fall and stores its immutable common
receipt. All effects commit or roll back together, including root rollback on business refusal.
Two helpers racing the same fall yield one event. Replay cannot heal another fall or update
current HP. The client waits for ordered journal replay rather than patching from the receipt.

No wallet read, treasury availability check, financial child, ledger entry, debit or paid-use
increment occurs. Zero available island coins and zero personal coins remain valid. Missing
canonical hooks or malformed facts fail closed. The new router is registered by the common
runtime integration; existing wave route dispatch and client wiring stay with that integration.
Explicit legacy paid revival and historical reconciliation retain their already guarded behavior.

`POST /api/island/revive` requires `X-Island-Economy-Version: 1` and exactly:

```json
{
  "economy": {"mode": "island_shared", "version": 1, "islandOwner": "uuid", "runEpoch": "uuid"},
  "actionUid": "player_action_uid",
  "waveId": "uuid",
  "targetToken": "uuid",
  "fallId": "uuid",
  "holdId": "uuid",
  "sessionId": "uuid",
  "connectionGeneration": "1"
}
```

Success contains only `status: "done"`, `repeat` and the immutable common `wave_revive`
receipt. Its result has `waveId`, `targetToken`, `fallId`, original `holdId`, `downAtTick`,
`eventSeq`, equal `reviveSeq` and `restoredHPUnits`. Those are original effect facts, not current
HP or funds. Network, server and reauthentication uncertainty retains the exact durable body
and UID. `health_sync_required` requires reading/replaying the actual fixed journal prefix and
submitting the complete accepted Captain report before retrying the same completion UID.
Definitive hold refusals roll back the new root; replacement hold/session fences may refresh
without retargeting the wave, target or fall. Client timers only display progress.

## Test-first acceptance

Before implementation, add strict body/receipt/route projection tests. Disposable PostgreSQL
must use the actual canonical session/context/consume source, never test functions returning
fabricated standing/held facts. Cover normal/Medic time, early finish, ordered release/restart,
pose/target/fall/generation invalidation, genuine Tavern recovery, zero coins, same-fall helper
races, exact UID replay after later damage/fall/closure/departure and rollback on event/receipt
failure. Assert no wallet/treasury/financial-child/quota effect and no surviving refused root.
Run relevant existing repair/revival regressions, Ruff, SQL parsing, apply/reapply and full diff
review. Local fixture results do not by themselves establish authenticated two-browser gameplay.
No publication, live migration, admission, activation or deployment is authorized here.
