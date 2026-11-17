# VIS-34: combat consumers of the shared village projection

Responsible teammate: Johannes Franz Lang (`frcola`). Parent issue: #361.

This component builds on the shared projection math at `8cb47237`: displayed
X = 1.3x + 0.2z, displayed Y = -0.6z. The coordinator records the explicit D064
presentation revision and owns the world/camera/water consumers.

## Scope and evidence

- Convert combat sprite feet, effect/weapon anchors, fog inverse, pointer inverse,
  screen hit tests, facing and aim through the same projection functions.
- Transform guide ground geometry with its centers; keep badges, bars, sprite
  dimensions and vertical lifts upright in display space.
- Preserve simulation input, logical interpolation/distances, saved positions,
  collision, health, economy and painter ordering. No backend or rule edits.
- Focused tests will inspect real instance buffers, projected aim, pointer
  roundtrips and lifted target hit centers. Existing deterministic tests remain.
- Actual desktop/mobile wave captures belong to the coordinator's browser lane;
  this PR remains Draft until composed browser evidence and human review.

Likely files: `frontend/src/pirates/{render,battle-guide,index,interact,poses}.js`
and focused pirate tests. No new dependencies, environment changes or merge.
