# Canonical shared island client

Browser session, wave and revival integration for the authenticated shared-island runtime.
Responsible teammate: Ianno Hollensteiner. No deployment or activation is included.

## Bounded implementation

Use the existing authenticated transport, actor getter and accepted island economy view. Shared
requests never fall back to legacy routes. Keep the installed quoted core, Harbor, boat, Arsenal,
paid repair and personal Captain clients. Session/reset capabilities remain unavailable until
actual handlers are installed; component tests may supply explicit supported fixtures.

The first increment implements strict session metadata/proof adapters, durable original attach
requests, a document-held actor-global Web Lock and fresh-read controller admission. A stored
attach response, session UUID or connection generation never grants control. Without a Web Lock,
or while another tab holds it, only a fresh read without controller proof is permitted. Cloned
session storage therefore cannot create a second controlling tab. A reload with a known lease
reattaches with the original session UUID and expected generation to fence obsolete callbacks.

Follow-up increments wire that session into actual island load/travel/lifecycle, canonical waves,
journal/HP reporting, free revival and reset UI. The shared reset intent remains keyed by actor
and island code across an observed new epoch; receipt success never grants new control.

## Frozen HTTP contracts

All calls carry `X-Island-Economy-Version: 1`. The server owns membership, generation, leadership,
clock and grace. The shared economy assertion is exactly mode/version/islandOwner/runEpoch;
accountId is retained privately only to check the captured original source.

- GET `/api/island/session?islandOwner=<uuid>&runEpoch=<uuid>` optionally adds the caller's
  sessionId and decimal-string connectionGeneration. It returns `{status:'done',economy,session}`.
- POST `/api/island/session/attach`: `{economy,sessionId,expectedGeneration,actionUid}`. Generation
  is a canonical unsigned decimal string; initial expected generation is `'0'`. The returned
  metadata is an immutable historical attach projection. Always make an independent fresh GET
  with its returned proof before control, heartbeat, wave input or room attachment.
- POST `/api/island/session/heartbeat` and `/disconnect`: `{economy,sessionId,connectionGeneration}`.
  They return the same metadata shape. Heartbeat every five seconds; server detection is fifteen
  seconds. Silent grace ends sixty seconds after the last accepted proof, explicit disconnect
  fixes its server deadline at sixty seconds. Browser clocks never extend grace.
- POST `/api/island/session/leave`: proof plus actionUid. Settings uses proof plus actionUid and
  at least one of breakPaused/autoNext/countdownSeconds (integer zero through sixty). Both return
  common immutable receipts and independently authorized nullable economy/session projections.
  A historical replay has null live projections. Read afresh before applying current control.

Metadata has sessionId, connectionGeneration, isController/isSpectator, nullable leaderId and
nullable graceUntil, place, topicGeneration, breakPaused, autoNext and countdownSeconds. A
spectator receives no controller UUID/generation. The exact server place
`isle_<five-symbol-code>_<24-lowercase-hex>` is used verbatim; no room is reconstructed from code.

Native shared wave requests use protocol 2 and the exact economy/sessionId/connectionGeneration
proof. Existing legacy, class and Pirate Point contexts keep their explicit protocol.

Captain HP POST `/api/waves/{waveId}/captains` binds checkpointUid/throughTick/inputHeadSeq and the
complete active/grace token roster. Each Captain has normalized hpUnits, downAtTick and
reviveBasisSeq; the response adds the server fallId. Positions come from accepted movement inputs.
Flush journal and report the stored sealed prefix before ordered hold start and completion.

Hold start is exactly `{type:'captain_revive_hold_start',targetId,fallId}`; cancel is exactly
`{type:'captain_revive_hold_cancel'}` through the ordered input UID/counter journal. Completion
POST `/api/island/revive` sends economy/actionUid/waveId/targetToken/fallId/holdId/sessionId/
connectionGeneration. It returns a common `wave_revive` receipt. Never submit raw captain_revive,
patch current HP from a historical receipt, derive fallId from downAt or post elapsed duration.
Retry the same completion UID on health_sync_required and hold_incomplete; unknown/401 retries
retain the exact original body. A definitive refusal may refresh hold/session proof without
replacing the immutable wave/target/fall operation identity.

Shared POST `/api/island/fresh-start` sends economy/actionUid/confirmCode. Its `reset`
receipt records the original origin and new account/run facts; currentEconomy is null. A fresh
canonical island read adopts the replacement, independently of the original receipt.

## Verification required

Write and observe failures for strict metadata/proof validation, historical attach versus fresh
read, cloned-storage simultaneous tabs, original UID/body after unknown/401, scope/actor changes
during awaits and lock release/dispose. Then exercise actual assembly, fixed generation wave
transport, journal/HP/hold ordering, reset across epoch, and authenticated acceptance separately.
No local fixture is a substitute authority provider or deployment proof.

## Initial control increment verification

The isolated control increment passed 41 tests across five files:

```sh
cd frontend
npm test -- --maxWorkers=1 tests/island/shared-session-api.test.js \
  tests/island/shared-session-lock.test.js tests/island/shared-session-client.test.js \
  tests/island/shared-session-tab-dom.test.js tests/island/shared-session-http.test.js
npm run build
```

The Chromium journey opens a real popup whose sessionStorage is cloned by the browser. The
second document cannot attach while the first holds the actor-global Web Lock. After release,
it rotates the saved generation and performs an independent fresh read before exposing proof.
The HTTP journey uses the actual private panel lease and authenticated HTTP adapter with injected
responses; both attach and read retain the negotiated capability and session-owned authentication.
It does not parse or store a login token.

The initial implementation had no session modules and failed the new imports. Additional observed
counterexamples were JSON assertion key-order rejection and overlapping heartbeat requests; both
were corrected and their regressions passed. Corrupt retry storage refuses new attachment, exact
unknown/401 bodies survive reload, and actor/origin changes fence pending replies. The production
build and spoiler guard passed (256 text files, 12 protected lines), as did whitespace review.

This first increment does not wire the session into the running game, activate any capability,
implement durable leave/settings UI, accept native wave/HP/hold input, or complete shared reset.
The existing runtime remains guarded while the next integration increment is implemented.

A read-only peer review found an obsolete lock could survive an actor/origin change while an
attach, fresh read or heartbeat was pending. Three new regressions reproduced the blockage of
a second document. Late exits now release their captured obsolete lock; they clear local state
only when the matching request ticket is still current. An old completion cannot release a newer
actor's lock. A scheduled heartbeat also releases ownership when identity is no longer current.
The final five-file session selection, including scheduled identity loss and the real-popup
journey, passed 46 tests. The timer test waits for asynchronous Web Lock release before checking
that another document can acquire it.
