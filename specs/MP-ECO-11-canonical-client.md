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

## Unknown attachment during navigation

When an attachment's outcome is unknown and navigation changes, keep its exact captured intent
inert and release the old document lock. Do not replay that attachment to discover a generation,
create an old-island lease or send a guessed leave. Only the original server last_seen plus the
fixed sixty-second grace governs an uncertain old lease; navigation and retries cannot reset it.
A destination may remain controller_held until that deadline. It retries only its own captured
attachment and displays a waiting state. Returning to the original currently selected source may
resume its original stored request, followed by a fresh independent control read.

Known original proof follows durable immediate leave. Inert intent retention is distinct from
current controller authority and does not select a treasury source. Each origin's unresolved
attachment remains recoverable without allocating a replacement UID for it.

The unknown-navigation regressions first failed because the single current descriptor blocked
every destination; it now retains the old unresolved body in an inert origin entry. Destination
retries preserve only their own captured UID/body. A late old success starts no read, heartbeat
or control, and its original intent is retained. A resolved archived intent cannot be resurrected
after a later stale-controller refusal. Six session files passed 50 tests, including the real
cloned-tab and authenticated HTTP journeys, with scoped whitespace review clean.

## Known session departure

Navigation withdraws a known original session immediately. Persist the original leave UID,
actor, immutable origin and generation before sending, and release local control immediately.
Unknown outcomes and reauthentication retain that exact request. A destination attachment waits
until the old leave is confirmed; a historical leave receipt never supplies current control.
On reload, only an exclusive actor tab lock permits using a saved known generation for departure.
An unknown attachment has no known proof and follows the inert-retention policy above.
Late confirmations remove only their matching saved session, never a newer session descriptor.
A definitive stale_controller refusal retires only that exact obsolete departure and saved proof:
another document already rotated the generation. It supplies no successful leave fact or current
control. The next attachment and fresh read must establish any new authority. Unknown/401 remains held.

## Running-island session binding

Construct session transport after the island's authenticated transport exists. Acquire control only
after a canonical selected island advertises session availability and that island is physically on
screen. Use the fresh server nonce place verbatim for room/presence selection. Unknown shared
context yields no legacy room. Travel, selection and identity changes revoke local control and
withdraw known proof; blur/hidden documents disconnect into the server's fixed grace. Focus may
resume only through the persisted attachment and fresh read. No browser deadline withdraws a Captain.

## Native wave transport and operation retention

Shared start/current/join use only the dedicated version-2 proof contract and negotiated header.
Strictly validate frozen origin, complete initial Captain map, presentation metadata and nullable
live controller projection. Historical start confirms the original intent without activating a
fighter. A late arrival may replay the frozen battle as a spectator but cannot submit commands.
Persist bell requests by actor/selected code across epoch changes, and finish requests by actor/wave.
Unknown/401 retries preserve the entire original body, including proof/checkpoint. Definitive
health-sync refusal may replace a finish checkpoint; it cannot replace wave/actor/source identity.
Only validated current same-origin envelopes may reach the existing funding setter. Completion
receipts are the actor's immutable progression facts, never a personal coin balance.

Native replay seeds every frozen Captain from captainInitialState. Idle Captains do not use the
legacy eight-second presence expiry; only the trusted captain_withdrawn journal event withdraws
one at its effective tick. A permanent wave-local withdrawn state rejects later queued movement
and attacks. Native spectators cannot queue inputs, checkpoint HP or initiate closure. Own loadout
comes from the frozen participant row. Native auto-next waits for server current-wave polling and
does not fabricate a browser bell click.

The first native transport/replay increment passed 88 tests across eleven focused files, including
legacy recovery retries/closures, native malformed provenance, exact bell/finish retention and a
real Chromium island session binding. A strengthened three-file selection passed 14 tests and
proves the native simulation is running before testing command revocation. Build, spoiler guard
(257 text files, 12 protected lines) and whitespace review passed. Captain reporting, free revival,
shared settings/reset UI and concurrent-controller latency acceptance remain separate increments;
this increment does not enable server capabilities or claim live acceptance.

## Captain checkpoints and committed revival replay

Before ordered hold start and completion, flush queued inputs, fetch a complete stored sealed
prefix, replay through that seal, then report every retained Captain's normalized HP, fall tick
and applied revive basis. Only the accepted report supplies server fall IDs. Report responses
bind metadata to the exact reported prefix and never patch simulated HP. Source freshness remains
strict when another controller advances the seal; the same completion UID must survive retries.

A native free captain_revive journal entry requires UUID operation/fall/hold markers, matching
frozen helper/target tokens, frozen helper loadout and the target's exact original fall tick.
Its committed restore is applied at the journal effective tick and records serverSeq as the
target's revive basis. Do not reauthorize helper standing/reach or restore its earlier coordinates
after the source transaction already committed. A withdrawn target, another fall or duplicate
sequence cannot be healed. Legacy paid events and raw input behavior remain separate.

The Captain/revival increment passed 88 focused tests across fourteen files in 22.50 seconds,
including original paid health/recovery behavior, actual native controller admission, committed
50/75/100-percent frozen restores, malformed fall evidence, delayed cancellation ownership,
unknown/401 completion retention, native standing-body rendering and explicit-null presence routing.
The build and spoiler guard passed (257 text files, 12 protected lines), with whitespace review clean.
The phone HUD component preview was generated and visually inspected under
`docs/evidence/MP-ECO-native-revival/`; it makes no authenticated acceptance claim.

Native standing bodies and health bars use retained journal positions rather than presence figures.
Presence loss cannot make a retained Captain invisible, and duplicate matched presence bodies are
hidden. An explicit unknown presence room suppresses reporting instead of falling back to a static
world room. Actual simultaneous controllers with realistic latency and native gameplay falls remain
an acceptance gate. Separate report/start/complete round trips preserve the server proof contract.
The original reader-dependent exact-current-seal gate reproduced starvation at realistic latency;
the revised source contract accepts only a recently accepted complete prefix within two seconds,
with monotonic basis/CAS checks. The browser adds no clock/HP authority or poll suppression.

## Shared settings and owner reset

Session settings use the actual proof-qualified endpoint and a durable original settings request.
An unresolved change retains its original UID/body through unknown/401 and reload. Current settings
come only from a separate fresh session read after confirmation. Native auto-next is server driven;
the browser switch submits a setting and never simulates an automatic bell click. The bell displays
waiting/spectator state and the server countdown instead of promising a local fixed duration.

Shared owner reset uses the existing fresh-start endpoint with the negotiated four-field economy,
typed own code and one actor/code-scoped original UID retained across a newly observed epoch.
Validate the exact common reset receipt, retired money conservation and replacement identities;
currentEconomy must remain null. Only a fresh canonical island GET adopts replacement context.
Reset clears island assets/control, while each player's personal Captain and progression are kept.
Unknown context, a visited island and unavailable reset capability do not select a legacy reset.
Only a fully validated personal Captain v1 profile changes the explicit legacy reset disclosure to
say personal level/skills are preserved; an unavailable personal read cannot infer that state.

Confirmed reset retires only matching original local session descriptors. A newer lock/proof and
unknown attachment archives survive. A member's definitive 409 economy_epoch_mismatch can retire
known old departure only when a fresh same-owner replacement has both a different account and run
epoch. Cross-owner movement, reconnect_required, unknown outcomes and 401 do not qualify. New
control still requires attach plus fresh read. Historical reset confirmation after replacement was
already read does not clear newer assets/flow or start another run.

The settings/reset increment passed 102 tests in fifteen focused files, covering durable settings,
cloned-tab control, same-source retirement, original reset retry after a new epoch, corrupt storage,
unknown/401 outcomes and failed post-reset reads. A final four-file reset/copy selection passed
23 tests after the validated personal-Captain disclosure adjustment. Build passed in 2.81 seconds,
with the spoiler guard clean (257 text files, 12 protected lines) and whitespace review clean.
The actual Settings reset section was captured at 375 × 812 and visually inspected under
`docs/evidence/MP-ECO-shared-reset/`. These component checks do not claim authenticated reset or
concurrent native gameplay acceptance.

## Frozen weather decoding

The native producer freezes numerical weather in initialSnapshot.weather and the canonical kind
in initialSnapshot.createWave.weatherKind. Validate outer kind against that frozen kind, ships/fog
against frozen numerical weather and label against weatherLabel. An optional snapshot weather.kind
must agree when present; its absence is valid. Preserve strict provenance and all other DTO checks.
The server-to-client producer roundtrip is a separate cross-language regression.

The focused weather regression first rejected both calm/storm producer shapes, then passed all
21 tests across the actual three-file shapes/transport/native-controller selection. Contradictory
frozen kind, optional kind, ships, fog and label remain rejected. Whitespace review passed.

## Confirmed attachment hydration

After an attachment is independently confirmed by a fresh controlling session GET, reread personal
Captain progress and the defended island once for that confirmed attachment. A visited island also
requires the actor's own personal snapshot: visitor quote state must not substitute for the personal
profile used by Captain cards and loadout. Heartbeats do not repeat these domain reads. Capture
actor, authentication generation, original economy and selected visit before the reads, and reject
late application after any changes. A failed domain read supplies no default profile or authority;
normal guarded reload remains available. Frozen wave construction and first-bell preparation stay
unchanged.

The attachment hydration regression first failed for both owner and visitor profiles and for the
fresh-confirmation hook. The final focused session, real Chromium assembly, wallet ordering,
shared-core and rejoin selection passed 75 tests across six files in 40.00 seconds. It covers
immediate owner/visitor profile and quote refresh, no heartbeat reread, delayed actor/selection
rejection and obsolete lock release. Build and spoiler guard passed (257 text files, 12 protected
lines); whitespace review passed.

## Final regression corrections

Restore the existing personal legacy recovery-protocol-two paid-revival request from the current
main implementation: finite helper coordinates within the existing bounds, protocol marker and a
journaled success requirement. Keep the shared/unknown-context refusal before this legacy branch;
ordinary protocol-one requests retain their prior shape. This repairs a client reconciliation
regression without adding authority to coordinates or opening shared fallback.

Legacy card tests must use the negotiated explicit personal_legacy marker and an authenticated UUID
for the positive legacy path; unmarked live reads must still refuse mutation and leave funds unknown.
Funding notifications may repeat while world/source selection is reasserted. Validate every amount
and its explicit legacy funding context, compact only adjacent identical amount/context pairs, then
require the original ordered balance transitions. Do not suppress real source notifications merely
to obtain the former callback count.

Review new correctly spelled English vocabulary under the existing text-lint policy before adding
it to the project dictionary. No rule, extraction path, exclusion or timeout changes are permitted.
The original full frozen regression result, including capacity-related ENOSPC failures and skipped
cases, remains separate evidence; these corrections do not relabel it as a pass.

The original full frozen run completed all 499 files: 470 passed and 29 failed; 5,262 test cases
passed, four failed and 121 were skipped. Twenty-six suite hooks failed with explicit ENOSPC,
which JUnit records as additional synthetic failure cases. The four actual test failures were
reviewed vocabulary, the two legacy card contracts and the lost paid-revival DTO. The original
normal build and spoiler guard passed; the frozen source stayed clean before and after.

The paid-revival restoration first failed eleven bounded cases, then the paid-revival and text
selection passed all 33 cases in 5.19 seconds. The three affected real-DOM cases passed in
21.37 seconds; six other cases were intentionally outside that focused selection. A final paid
selection passed all fifteen cases after strengthening the valid shared-context refusal check.
Whitespace review passed. A new complete regression run remains required after these corrections
and restored disk capacity; the earlier failed/skipped cases remain recorded as such.

## Idle lookup stability

An accepted current-wave lookup returning null while the flow already has no current wave changes
no flow state. Continue the actual request, DTO/origin checks and transport-side economy/session
updates, but do not notify the card renderer for that empty-to-empty result. A real new wave,
nonempty result, clearing an existing wave, admission and closure retain their existing notifications.
This prevents idle polling from replacing a focused construction button between pointer down/up.
Verify exact DOM identity and focus across repeated accepted null reads, actual continued request
count and one ordinary pointer action through the client construction transport. The component
transport is synthetic and does not establish a real provider/SQL construction transaction.

The idle-poll regression first failed in the real DOM component: the focused original node became
disconnected and an accepted null reply between ordinary pointer down/up produced zero client
construction submissions. Two flow checks also failed on redundant notifications. After the bounded
empty/current-null guard, all 40 cases in five focused flow/lobby/component files passed in
8.76 seconds. The final component check passed again with exact request-count, retained focus,
single construction submission and refreshed treasury revision/balance assertions. Normal build
passed in 1.06 seconds, spoiler guard passed (257 text files, 12 protected lines), and whitespace
review was clean. This is transport-stub component evidence; real provider pointer acceptance is
still a separate check.

## Native clock correction and incomplete holds

Apply the existing timed/clockOffset policy to accepted native start, current and join delegates,
just as for personal legacy waves. Preserve its existing arrival-time measurement, slack and
one-day limit; add no independent clock authority or DTO fields. The existing flow event then
carries clockOffsetMs to the actual controller.

A definitive hold_incomplete means the original ordered interval is still valid but too young.
Keep its hold ID/start time and retry completion after the existing backoff with the same fall
intent/UID and current proof. Only hold_invalidated or hold_missing starts a new ordered interval.
Unknown/401 completion retention and authoritative journal-only HP restoration remain unchanged.
Verify a six-second fast browser through the native API/flow/controller chain, plus a controlled
clock-drift retry using the production revival orchestrator and durable completion adapter against
a synthetic server that requires the original two seconds. A new start UID really cancels/restarts
the prior hold in the existing server source, so repeated start must not be used to wait out age.
These component checks do not establish actual provider gameplay or server-time acceptance.

The native-clock regression first failed five cases: missing offsets on all three delegates,
zero offset in the actual API/flow/controller chain, and six ordered hold starts without completion
within 2.25 server seconds under a six-second fast client clock. After the bounded correction,
36 cases across seven focused native/legacy clock, controller, flow and revival files passed in
6.54 seconds. The strengthened six-case clock selection passed in 2.46 seconds and checks the
original start timestamp, at least 400 ms between completion attempts, identical completion
body/UID/proof and no local HP restore. Normal build passed in 3.05 seconds, spoiler guard passed
(257 text files, 12 protected lines), and whitespace review was clean. Synthetic clock/transport
results remain distinct from actual rendered provider acceptance.

## Definitive controller-refusal retry

The free-revival server replays an owned receipt before checking fresh controller authority; a
new operation refused as not_controller rolls back its root and effect. Its public response is
403/not_controller. Allow exactly that definitive refusal to refresh the existing durable request's
hold/session fences after validating the same actor, original origin and a fresh controlling proof.
Keep the original action UID, wave, target and fall. Do not broaden other 403 responses or treat
unknown/401/429/server failures as permission to replace the captured body. A changed actor during
response handling must keep the original record inert. A replacement origin or missing fresh
proof must not send a refreshed request. Historical successful receipts remain immutable facts.

The reconnect regression first failed three cases: a legitimate new controller still submitted
the old generation, and absent/replacement-scope proofs failed to gate a previously refused record.
After the exact refusal classification change, 30 cases in four focused adapter/orchestration files
passed in 3.04 seconds. The strengthened thirteen-case reconnect selection passed again, including
unchanged storage when a fresh proof cannot be validated. Normal build passed in 1.32 seconds,
spoiler guard passed (257 text files, 12 protected lines), and whitespace review was clean. The
component transport is synthetic; no provider reconnect or SQL transaction was executed here.
