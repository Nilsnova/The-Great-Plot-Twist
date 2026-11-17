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
