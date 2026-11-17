# Perimeter defense implementation and review guide

Responsible teammate: Johannes Franz Lang (`frcola`), assisted by coding agents.
Documentation task [#331](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/331),
Draft [#332](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/332). Source audit:
`f8a22d904dfd3518d9e47793ff46108e1612b6e6`. The
[integration preview](https://github.com/Nilsnova/The-Great-Plot-Twist/tree/chore/perimeter-integration-review)
collects the candidate; its final evidence must name the exact tested revision.
This guide is not a deployment, activation, merge or human approval record.

Read the [API/policy contract](../INTERFACES.md#12-perimeter-defense-candidate)
and [six-migration runbook](../../supabase/README.md#perimeter-defense-candidate-six-migration-additions)
for exact shared interfaces. [D061](../DECISIONS.md#d061--full-perimeter-wall-building--2026-11-17)
and [WALL-01](../../specs/WALL-01-perimeter-defense.md) define the accepted wall
boundary. The broader illustrated target and proposed future tasks remain in
[planning Draft #239](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/239)
and [visual epic #205](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/205).
The implemented wall slices are tracked under
[Wall Gameplay #241](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/241).

## What the player can do

The candidate adds real paid, saved, connected wall runs around the island’s
buildable perimeter or around internal compartments. It keeps the existing
island, economy, progression and wave/high-score loop. Players do not need a new
online opponent, account provider or external service to use this building model.
Existing visits and cooperative play are not a prerequisite for the solo flow.

| Before, for a legacy island | Candidate, after explicit owner admission |
|---|---|
| Twelve stable wall IDs, constrained to D056 pirate lanes | Up to 128 stable wall IDs on valid free-grid positions |
| Move/build each existing reserved site | Draft and quote up to 32 connected pieces, then purchase the whole run atomically |
| Wall identity has a template reservation | Added IDs have no default position: purchase and saved coordinates commit together |
| Fit-only village management on the original runtime baseline | A working village camera with bounded zoom/pan, plus snapped construction ghosts and fine draft positioning |
| Existing tower/wall levels, coin prices and wave unlocks | Those upgrade and unlock rules remain; more wall pieces do not grant free levels or land |

Admission preserves effective old purchases, coordinates, levels and payer
contributions. It does not build a free ring. The allowance includes the original
twelve pieces, so 116 additional IDs are available as inventory. A measured valid
ring fixture uses 102 pieces on the current land shape; it is purchased in four
bounded runs. Capacity is a safety bound, not a guarantee that every shoreline
object can be enclosed. Fixed coastal services can remain outside an inset ring;
movable buildings can be relocated through ordinary Move.

Walls share full edges when their centers are two world units apart. Centers snap
to a half-unit grid, so exact positioning remains possible between those larger
piece spacings. Existing keep-outs, non-wall route checks and center-on-land
semantics still apply. A decorative cliff edge does not create buildable ground.
Walls have real health: hostile boarders must go through a gap or breach a standing
barrier. Naval/projectile attacks still operate, and friendly captain collision is
unchanged. Closing a ring is legal because walls can be destroyed.

### The construction flow

1. Enter your own village management view. Build walls is offered when the actual
   perimeter feature flag is on, or when your island already has saved policy 1.
   The latter keeps a previous receipt reachable if new offers pause; it is not
   permission to make a new purchase.
2. Open wall construction. First admission is an owner-only, between-wave action.
   The server must support the policy, migrations and recovery prerequisite.
   A visitor or current wave cannot grant construction authority.
3. Tap a valid anchor to start. Tap farther along an axis or use the existing arrow
   keys to add connected pieces and turns. The preview shows actual snapped
   positions; explicit status text explains unchecked/refused states.
4. For small screens, open Fine position to shift the whole **unpaid** draft one
   grid square (0.5) at a time. First/last anchors are visible. This keeps the ordered
   run connected, clears any old quote and requires a new price check. It does not
   move paid walls or edit an unknown purchase.
5. Get the price. The server chooses eligible IDs, checks the entire final layout,
   applies the actual payer’s price rule and returns the total. Remaining capacity
   is measured **after** this proposed run, not before it.
6. Confirm the shown total. The client freezes ordered placements, price, reset
   epoch and action UID. SQL either commits every piece/payment/contribution and
   the receipt, or commits none of the purchase.
7. If the outcome is unknown, use Check previous build. Close/reopen retains the
   same pending intent in the current live session. Closing does not cancel an
   already submitted payment. Never treat a timeout as permission for a new UID.
8. Inspect the saved walls and use the ordinary selected-building Move, upgrade,
   repair or demolition actions as supported. New construction is between waves.
   Current damage, recovery and frozen-wave restrictions still apply.

The toolbar uses actual server results, not a simulated success message. A full
page reload is not promised to preserve an unsent/held browser draft or UID; the
receipt itself is durable on the server. If an ambiguous intent is lost through
a reload, inspect current state rather than inventing proof that it failed.

Working-camera integration follow-up [Draft #327](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/327)
keeps temporary Tab overview independent of the saved working view: hold Tab to
fit the whole island, then release it to restore the prior village pan/zoom. This
is a later integration slice, not code in the pinned documentation audit snapshot.
The dedicated Zoom/Fit controls and construction positioning remain separate.

### Progression and current limits

Wall and cannon-slot defenses retain their existing manually purchased levels
1–5, prices and wave unlocks. They do not automatically buy upgrades as time passes.
Existing tower-tree and research rules remain separate. Gradual health recovery
is not a level upgrade; instant repair is a separate paid action with its own
per-instance/window checks. An upgrade cannot be used to evade a damaged or
reserved recovery guard.

This candidate does not add automatic island growth, new coast/land ownership,
dragging a paid wall group, batch upgrades, new enemy archetypes or the complete
illustrated building art. Those are separate tasks requiring their own bounded
contracts. A raised-cliff visual trial and working camera are included slices;
they do not establish final reference-image quality or physical-phone acceptance.

Existing score/reward semantics are preserved, but a larger inventory is not proof
of balanced competition. Late-wave difficulty and ranking comparability with up
to 128 walls, plus real-device performance at that density, remain **unaccepted
release work** under [WALL-24 #265](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/265)
and the [BASE-45 record/run gate #186](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/186).
Review the strategy/high-score experience and measured hardware behavior before
release; this handover does not authorize an economy change or an unmeasured retune.

## Why the implementation is built this way

### Separate layout storage, wall policy and client capability

`layout.version` already meant fixed versus stored coordinates. Reusing it to
authorize free-grid walls would reinterpret old saves, so admission persists the
separate owner policy 1/128. No row means legacy 0/12. All views use the target
owner’s policy, not the visitor’s. Pausing new offers never changes the meaning of
paid coordinates. Unsupported policy pairs fail explicitly.

The atomic layout reader returns complete rows, policy and reset epoch together.
Admission materializes old effective positions; Move/build compare the exact raw
rows and policy they checked. This prevents charging against geometry that another
action changed. Reserved D060 sites remain read-only occupancy even when their
purchase offers pause. An added paid wall without a coordinate is a data error;
it cannot be hidden, placed at zero or assigned a guessed default.

`wallClientVersion:1` on wave start means the browser understands perimeter
geometry. It does not admit an island or grant membership. Config’s feature flag
means new offers are available; no new perimeter key is added to the public
`capabilities` map. Treating these three meanings as one boolean would allow old
clients or paused offers to reinterpret saved state.

### Payment, reset and unknown-outcome safety

One run carries one immutable intent and UID, with a separate reference/payment
and contribution for each piece. SQL validates the whole batch under current
permission and locks. A child failure rolls back the run. The actual payer’s role
determines per-piece rounding; prices are recomputed before a fresh purchase.

Receipt lookup comes before today’s eligibility checks, after current access.
Otherwise a successful build whose reply was lost would fail its retry because
the pieces are already built. An old receipt can also reconcile after price/role
changes, demolition, reset or paused offers. It describes past payment; the
separate current-island response describes what exists now. Replay never builds
or heals a replacement instance, and lost membership prevents private disclosure.

The quote’s server epoch binds a fresh purchase to the correct reset. Layout,
wave and role can look identical across resets, so those checks alone are
insufficient. A fresh old-epoch build refuses without spending; an already
committed old receipt remains history. Browser reset generations/session tickets
also prevent late replies from repainting a different island or reset view.
Production island responses do not guarantee a top-level epoch, so the UI does
not infer that a missing field makes all resets equivalent.

### Real combat and complete health

Production perimeter waves use existing recovery version 1 and wave protocol 2,
with frozen real defenses/coordinates/levels/HP and durable accepted repair events.
The internal SQL recovery template stays config version 1. After validating it,
the API exposes public snapshot config version 2 as a perimeter-geometry fence.
These are different version domains, not a second recovery system. Old or
incomplete clients must refuse rather than simulate an unrelated layout.

Pathing uses real standing-wall footprints and exterior landing rules. Breaches
and accepted restoration update both barriers and connection drawing. The guide
cache accounts for durability and actual policy/routing mode; health research
preview must agree with simulation. Route-clearance follow-up
[Draft #323](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/323) is part of
the integration review, not proof supplied by this documentation snapshot alone.

The legacy health endpoint must read all 128 canonical walls; V1 recovery includes
139 damageable defenses. The watchtower/houses remain outside that HP vector.
Overflow, duplicate identities/instances, unsupported IDs, malformed health/time
and missing saved coordinates fail rather than truncate paid state. Size increases
do not relax per-instance repair or frozen membership checks. Existing supported
tower aliases normalize before duplicates; wall aliases remain invalid.

### Local demo versus production proof

`?islands=fake&fakeflags=perimeter_walls,pathing` selects the declared local fake
offers/rules; it does not enable a live server feature. Normal progression and
funds still apply. Automated acceptance fixtures declare their extra coins and
progress explicitly. The fake can freeze `perimeterDemo.version:1` with legacy
headers and run the real deterministic simulation. It is explicitly bound to wave,
seed, start time and epoch; later mutable getters cannot replace its inputs.

Production never emits `perimeterDemo`. A successful local ring/breach/finish
proves local wiring, not durable V1 recovery, concurrent production participants,
live migrations or Safari. Separate real HTTP/private-PostgreSQL tests exercise
the actual paid and public snapshot boundaries. Neither substitutes for the
actual browser interaction/evidence gate or independent human acceptance.

## Source and draft review map

Use the exact source/PR revisions in the evidence; a draft title is not proof of
completion. Dependencies remain separate drafts, and aggregate previews must not
be confused with main. The docs PR itself targets an immutable snapshot branch so
its diff contains only this handover.

| Concern | Source/spec entry points | Review slices |
|---|---|---|
| Product boundary and persisted admission | [WALL-01](../../specs/WALL-01-perimeter-defense.md), [WALL-25](../../specs/WALL-25-policy-admission.md) | [#273](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/273), [#279](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/279) |
| Owner views, reserved occupancy and action routing | [service.py](../../backend/server/island/service.py), [layout_store.py](../../backend/server/island/layout_store.py), [WALL-28](../../specs/WALL-28-owner-policy-view.md) | [#285](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/285) |
| Canonical price/IDs and atomic transaction | [wall_chain.py](../../backend/server/island/wall_chain.py), [WALL-12](../../specs/WALL-12-atomic-construction.md), [migration runbook](../../supabase/README.md#perimeter-defense-candidate-six-migration-additions) | [#294](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/294), [#300](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/300), [pressure #306](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/306) |
| Authenticated offer/payment transport | [island_walls.py](../../backend/server/routes/island_walls.py), [wall_build.py](../../backend/server/island/wall_build.py), [WALL-33](../../specs/WALL-33-paid-build-api.md) | [#302](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/302), [#308](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/308) |
| Actual construction UI and safe pending intent | [wall-builder-mode.js](../../frontend/src/island/wall-builder-mode.js), [wall-builder-bar.js](../../frontend/src/island/wall-builder-bar.js), [WALL-37](../../specs/WALL-37-fine-position.md) | [#282](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/282), [#296](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/296), [#316](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/316) |
| World display and full health reads | [WALL-30](../../specs/WALL-30-world-cohort.md), [WALL-39](../../specs/WALL-39-complete-health-reads.md), [WALL-40](../../specs/WALL-40-health-reads.md) | [#307](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/307), [#318](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/318), [#321](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/321) |
| Durable wave admission, repair and refunds | [WALL-22](../../specs/WALL-22-perimeter-wave-state.md), [WALL-36](../../specs/WALL-36-v1-lifecycle.md) | [#297](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/297), [#304](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/304), [#283](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/283), [#291](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/291), [#313](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/313) |
| Exterior entry and local frozen fight | [perimeter-landing.js](../../frontend/src/pirates/perimeter-landing.js), [WALL-35](../../specs/WALL-35-local-wave-demo.md) | [#290](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/290), [#310](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/310) |
| Camera, cliff trial and compact builder controls | [BASE-02](../../specs/BASE-02-working-camera.md), [VIS-19](../../specs/VIS-19-raised-cliffs.md) | [#270](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/270), [Tab working view #327](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/327), [#299](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/299), [compact controls #330](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/330) |

## Evidence and what it proves

Existing actual-game before/after captures are available at both required sizes:

| Slice | 1280×720 | 375×812 | Limits |
|---|---|---|---|
| Working camera | [Before](../evidence/BASE-02-working-camera/before-1280x720.png) / [After](../evidence/BASE-02-working-camera/after-1280x720.png) | [Before](../evidence/BASE-02-working-camera/before-375x812.png) / [After](../evidence/BASE-02-working-camera/after-375x812.png) | Local Chromium fake fixtures; exact source/interaction metadata in [manifest](../evidence/BASE-02-working-camera/README.md) |
| Raised cliff trial | [Before](../evidence/VIS-19/before-overview-1280x720.png) / [After](../evidence/VIS-19/after-overview-1280x720.png) | [Before](../evidence/VIS-19/before-overview-375x812.png) / [After](../evidence/VIS-19/after-overview-375x812.png) | Local Chromium, unchanged walkable top; shore/raster/ship-center checks and limits in [manifest](../evidence/VIS-19/README.md) |

These captures document those bounded slices, not the complete illustrated target
or a final integrated perimeter build. The real playable perimeter browser journey
is tracked separately in [WALL-24 Draft #322](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/322).
Its final manifest must identify source, exact viewport, declared progression,
receipt/wallet assertions and unedited screenshots. Do not label concept artwork
or a single zoomed crop as before/after gameplay proof.

| Evidence | Recorded result/provenance | Practical boundary |
|---|---|---|
| API to real private PostgreSQL | [WALL-38](../../specs/WALL-38-http-sql.md), Draft [#319](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/319): 2 passed in 5.23s | Real HTTP/RPC ring purchase, retry, current reads, reset fence and negotiated snapshot; mocked sign-in/weather, no live server/browser |
| Composed V1 lifecycle | [WALL-36](../../specs/WALL-36-v1-lifecycle.md), Draft #313 | Direct disposable-SQL recovery/payment/instance/refund lifecycle; read exact recorded command/results there |
| Full client read decoder | [WALL-40](../../specs/WALL-40-health-reads.md), Draft #321: 80 tests/5 files, 1.86s | Actual API decoder through full 128/139 bounds, malformed/duplicate state and world appearance; not HTTP/browser |
| Explicit local fight | [WALL-35](../../specs/WALL-35-local-wave-demo.md), Draft #310: 78 tests/6 files, 5.97s | Purchased 102-piece ring, frozen start/current/join/reload, deterministic breaches/finish; not production V1 |
| Complete island SQL directory | Coordinator-reported backend source `51b566b4173fb50ab6fc89e79db3f48150061911`: 609 passed in 25.19s | Disposable PostgreSQL, complete `server/tests/island_sql`; includes earlier selected subsets rather than adding their counts |
| Final integrated suites/build/browser | Coordinator-owned final record | Pending final evidence here; never infer a green complete run from focused slices |

Results quoted from linked specs/coordinator reports were not rerun by this
docs-only task. The exact complete-SQL command is in the
[migration runbook](../../supabase/README.md#review-and-application-sequence).
Do not sum overlapping checks or transfer a result to a different source revision
without checking runtime parity. Production deployment, live schema/flags,
Safari, real touch hardware and final reference-style visual acceptance are not
established by these records.

## Human review and release sequence

1. Read the requested behavior and limits in WALL-01. Confirm the target is a
   playable perimeter/base-building improvement within the current game, rather
   than an unreviewed expansion of land, economy or online requirements.
2. Compare API/policy/epoch models and the six migrations. Trace one new purchase
   from ordered cells through canonical quote, exact intent, atomic SQL and saved
   current view. Check every service-only grant and the prerequisite schema order.
3. Trace lost-reply retry after a changed price, reset, demolition and membership
   loss. Explain which requests reconcile history and which must refuse before
   payment. Verify no automatic replacement UID or missing-RPC success path.
4. Review a complete paid ring, gap and compartment at desktop and phone sizes.
   Check camera, snapped ghosts, fine positioning, target sizes, price/capacity,
   cancel/unknown feedback and restored ordinary Move. Include keyboard and
   reduced-motion/low-quality checks in the integrated evidence where applicable.
5. Trace a real production V1 start/current/join snapshot and accepted repair.
   Verify exterior entry, gap/breach/restoration, complete health, saved instances,
   upgrades, paid repair and contributor refunds. Local demo proof is supplemental.
6. Read the exact final suite/build/budget/accessibility/demo/browser results,
   late-wave/ranking comparability evidence and real-device performance, including
   every remaining limitation. A different human teammate reviews the current
   revisions; assistance from another agent does not count as that approval.
7. Complete explain-back before marking the draft ready. Keep merges, live schema
   application, feature activation and production release separate. No agent
   merges these drafts, applies live migrations or enables an automatic merge.

Suggested human split: Ianno reviews the recovery/instance/payment boundary;
Nils reviews placement, simulation and rendering; Johannes explains his changes
and reviews the actual player flow with another teammate. This is a proposed
review split, not a sent GitHub review request or a claim of approval. Team policy
allows any different human teammate to review; nobody is a mandatory sole gate.

If new offers must pause, retain saved policy, paid data, receipts and compatible
read/recovery/combat support. Do not reverse the schema or replace admitted
coordinates with twelve defaults. The migration runbook describes this precise
rollback limit. A future safe policy downgrade or land-growth transition needs its
own reviewed design and migration.

## Explain-back in Johannes’s words

I wanted players to build a defense layout with useful walls instead of placing
more decorations. I kept the current island and coin/wave rules, then added a
separate saved wall policy so older islands keep their original behavior. New
wall IDs are inventory until a real purchase saves their coordinates.

I ask the server to quote an ordered run before payment. The purchase keeps that
exact run, price, reset epoch and UID. SQL commits all pieces and contributions
together. If a reply is lost, I retry the same action and read its receipt; I do
not assume failure and pay again. The receipt is history, so it never rebuilds a
wall that was later removed.

The battle must use frozen real geometry and health. I distinguish the small local
demo from production’s durable recovery protocol, and I read every supported wall
instead of silently dropping rows after an old list limit. The current limits are
128 walls, the existing land shape and manual upgrades. More land, batch actions
or richer art can be added later as separately reviewed changes without weakening
these payment and save rules. This draft still needs human review and final
integrated evidence; it is not a live release.

Before the draft is marked ready, answer without reading the source:

1. A build succeeds but its reply is lost, then the island resets. What must a retry
   preserve, what does the receipt prove, and why must it not rebuild those pieces?
2. Why are `layout.version`, wall policy 1/128, `wallClientVersion`, recovery
   version 1 and public snapshot config version 2 separate concepts?
3. Which tests prove real payment/recovery behavior, which prove local browser or
   simulation behavior, and what must still happen before anyone calls this a
   production-ready visual/gameplay release?
