# Live captain attack feedback

What this is: presentation correction and review handover for [issue #476](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/476), following the diagnostic in [#421](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/421). Used by Ianno and the peer reviewer.

- Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), with Codex assistance and separate read-only reviews.
- Branch: `fix/captain-pose-feedback`, based on current main `37eb70fa`.
- Status: implementation and final verification in progress; human review is required before merge.

## Scope and evidence

The unchanged current-main multiplayer check reproduced the owner musket pose at only one of two viewports. A bounded native trace then captured an actually eligible and accepted legacy shot (distance 7.75, range 14, standing actor HP 100, target HP 24). The handler emitted it but supplied no pose. A provenance-only correction supplied the pose, but the next game-frame read occurred after its 600 ms lifetime and drew nothing. Combining live accepted feedback with one frame for movement, combat and animation supplied a firing image to the actual renderer. [Native stages, source limits and frame image](../docs/evidence/captain-pose-feedback/README.md).

## Implementation and contracts

- `live-attack-feedback.js` remembers only live local/validated-room input objects after admission catches up. It promotes only their accepted simulation outcomes to the body-pose channel. Duplicate/consumed markers and ambiguous same-actor inputs cannot borrow another accepted event. Original event order determines the latest pose.
- Generic renderer/audio freshness, simulation inputs/order, damage, wallet, protocol messages, pose duration, identity and projection remain unchanged. Recovery's existing predicted-feedback/dedup path remains in place.
- Hidden/travel/wave-stop/disposal clears the live markers; initial catch-up remains disarmed. A historical scheduled shot gets no promotion.
- `game.js` opts out of the pirate module's independent RAF and calls the existing update through `wireWaves.update`. The player controller's optional `beforeAnimate` callback samples combat **after movement/collision/facing and before the one animation call**. Existing two-argument callers keep their behavior. Blocked movement still permits the fight to update. Falling visibility is refreshed from that update before rendering.
- Decision D066 records this presentation contract. The separate boat/quest change remains in Draft #467; this task does not implement best-score payouts.

## Verification and acceptance

- Tests first: accepted live feedback under a visible 1.8 s stall failed; an older promoted event replacing a newer fresh event failed; movement/combat/draw phase ordering failed. All were corrected without changing expected outcomes/time budgets.
- Focused controller, pose, multiplayer/recovery and movement checks: **7 files / 83 tests passed**.
- Pending: final full frontend/build checks and the unchanged full native multiplayer journey. Preserve all failures, source boundaries and unrun later phases in the final evidence.
- No new dependency, backend/schema, live flag, service or account. No merge or deployment.

## Explain-back

An event can be valid for the simulation but too old for transient scenery. A recent player action still needs its own body feedback, so only a correlated accepted live input gets that exception. The game consumes that pose in the same frame that combat records it; extending animation time would hide the ordering problem. Movement remains first so simultaneous walking and shooting uses the same position sampling as before.
