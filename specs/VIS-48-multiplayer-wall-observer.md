# VIS48: observe current wall batches in multiplayer QA

Responsible teammate: Johannes Franz Lang (`frcola`). Issue [#411](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/411).

The unchanged browser check on `8db343ba` failed after 65.84 s at its first
level-one wall observation: actual `{level: 0, pips: 0}`, expected
`{level: 1, pips: 0}`. Textured walls now live in indexed atlas batches rather
than the individual wall/pip meshes this observer searches.

This task changes QA only. Observe real batch material/geometry and current
logical diagnostic rows together; rows alone must never establish a visible
wall. Preserve legacy/tower observations and every existing synchronization,
card, economy, wave, timing and error assertion. No runtime/assets/packages.

Focused regressions and the real local multiplayer browser command must provide
their own exact results. The baseline failure is retained by the coordinator at
`multiplayer-baseline-8db`. No passing native result is claimed at task start.

Review base: immutable `review/vis48-mp-8db343ba`. The candidate already has
current-main ancestry. Keep this small task Draft; never merge the aggregate
preview or this PR without the requested human review.

## Implementation and explain-back

[Draft #412](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/412) changes
only the multiplayer audit. Its page-local observer is imported before the
timed synchronization actions. Legacy wall/tower sprite levels and actual pip
counts remain available. A textured wall instead requires its exact projected
post or straight cap, current-tier UV rectangle, indexed triangles inside the
real draw range, visible material and all thirty prepared PNG receipts with
matching dimensions. Diagnostic rows identify the intended post but never prove
that it was drawn. Actual individual pip count must be zero for this renderer;
the existing legacy route still requires its real level pips.

I keep the last successfully observed quad in a weak map keyed by scene. I use
it only to reject stale teardown remnants; I never use that memory as proof
that a wall exists now. A wall never observed successfully cannot pass the
teardown check. Even an old visible quad with a wrong UV, missing texture or
moved ancestor prevents a false teardown success. The current-tier presence
check remains stricter and requires valid artwork and unchanged transforms.

The atlas shelf layout follows the existing 256-logical-pixel/three-pixel-padding
wall atlas. This dependency is deliberate and the native check must fail if the
runtime layout changes without updating its observer. The audit is not a pixel
quality, physical-device or production multiplayer test. Shared rendering unit
tests and the real local browser scenario provide different evidence.

## Exact verification

The unchanged native baseline is **failed**, not a corrected native pass:
`node scripts/check-multiplayer.js <baseline-folder>` on `8db343ba`, exit 1,
65.84 s, line 570. Its actual result was `{level:0,pips:0}` where the old check
required `{level:1,pips:0}`. Host/friend lobby roles, Start, a cannon and the
cooperative wall setup completed before that assertion.

Meaningful pure regressions were run before their fixes: a fresh diagnostic
without a removed drawn wall produced **2 failed / 26 passed**. Wrong-UV,
missing-texture and moved-ancestor teardown remnants then produced
**3 failed / 28 passed**. No assertion or runtime behavior was weakened to make
these cases pass.

Final command from `frontend/`:

~~~bash
npm test -- --maxWorkers=1 tests/multiplayer-map-observer.test.js tests/island/wall-textured-batches.test.js
~~~

Exact result: **Test Files 2 passed (2); Tests 38 passed (38); Duration 968ms**.
Both script syntax checks and `git diff --check` also passed.

**Not run here:** corrected native multiplayer, complete frontend suite, build,
accessibility or device checks. The coordinator runs Chrome sequentially; this
task did not start a browser or claim its outcome.

Review commits: claim `fba6ad77`, QA `8723fe00`, stale-remnant follow-up
`b516334c`. No application source, assets, package manifests or lockfiles changed.

## Review questions

1. How can a fresh diagnostic wall level coexist with an old drawn level, and
   which indexed attributes expose that mismatch?
2. Why are zero wall pips correct for this renderer while the legacy check
   still requires level pips?
3. Why may the weak-map history reject a teardown remnant but never establish
   that a wall is currently present?

Remaining: corrected native/local shared-wave verification and current-head
independent human review. Keep Draft; no merge, rollout or production changes.
