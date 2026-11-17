# VIS51: selected-wall visibility evidence

Responsible teammate: Johannes Franz Lang (`frcola`). [Issue #417](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/417), [Draft #418](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/418), [spec](../../../specs/VIS-51-selected-wall-visibility.md).

## Source and exact behavior

Runtime source is `acc37240cba4c22fca903210d233ae2beae6e4f7`, following claim `3d67a9f5`. Its frontend source tree is `6e0c6b27b717a7b8eedcde498d7372de6f0942cb`. The immutable composed review base is `5e3dd6ccb3597617e67a8b720525d3add78c3704`; that is also the source of the actual before screenshots below. No source PNG, backend, dependency, collision, purchase, HP or placement rule changed.

The existing textured-wall builder has an optional ID filter. It retains the complete neighbor map, and extracts the exact selected post and its incident spans without inventing new ends. The small [drawing owner](../../../frontend/src/island/wall-selection.js) combines those ordinary position/UV/index quads in their existing painter order into one mesh at order 199. Its current wall material is borrowed, preserving the atlas, tint, alpha and single-pass state. Existing green corners remain at 200/201.

The foreground mesh owns only its geometry. Selection changes, accepted level/position/damage updates and successful atlas replacement rebuild that subset. Repeated frames retain it. Close, Move, battle, visitor transition, removal and disposal clear it. HP zero uses actual rubble and removes standing connections. Missing artwork gets no healthy fallback. The normal wall meshes and their exact position/UV/index bytes remain unchanged by selection.

## Before: actual composed game

| 1280×720 | 375×812 |
|---|---|
| [Desktop selected shore wall](before/reference-selected-level3-1280x720.png) | [Phone viewport selected shore wall](before/reference-selected-level3-375x812.png) |

These are unchanged stage-seven browser PNGs. The wall is largely covered by foliage, while its green corners show the selected paid tile. The [original capture execution receipt](before/execution.json) names its source, helper identity, command and completed capture. This is the existing declared local/offline fixture, not a live account or production recovery session. Its unknown health is truthfully labeled unavailable.

After screenshots, actual scene drawing counts and native visibility acceptance are **pending the coordinator's composed capture**. This task used no Chrome. One extra mesh is bounded to the current selection by construction; that is not a measured sustained-performance claim and does not raise the under-150 scene target.

## Pure verification and retained history

From `frontend/`:

~~~bash
npm test -- --maxWorkers=1 \
  tests/island/wall-selection.test.js \
  tests/island/wall-textured-batches.test.js \
  tests/island/wall-connections.test.js \
  tests/island/selection-bracket.test.js \
  tests/island/world-cohort.test.js \
  tests/island/wall-span-batches.test.js \
  tests/island/wall-shaded-preview.test.js --reporter=verbose
~~~

Exact final result: **Test Files 7 passed (7); Tests 50 passed (50); Duration 2.68s**, exit 0. `git diff --check` and `node --check frontend/src/island/wall-selection.js` also exited 0.

The test compares selected position/UV quads directly against independently observed ordinary batches. It snapshots all normal typed-array bytes before repeated select/switch/clear and verifies they remain identical. It also checks actual world update wiring, state changes, hidden-group restoration without allocation, shared-resource replacement/cleanup and absence of raycast intersections.

The unchanged [raw logs](logs/vis51-final-green.log) retain the result lines. Earlier [feature-red](logs/vis51-red.log) recorded 13 failures before implementation. The [first implementation run](logs/vis51-green.log) recorded 39 passed / 3 failed because `it.each` spread the array fixture into separate arguments; wrapping each row fixed the fixture without removing assertions, and the [next run](logs/vis51-green-02.log) passed 42 checks. A supplemental [visitor-transition regression](logs/vis51-visitor-red.log) then failed 1 / passed 12 before the immediate visitor/battle gate was added. The final seven-file run above includes the stronger exact-byte and hidden-group checks.

[manifest.json](manifest.json) records the copied files' original hashes, sizes and native image dimensions. Two independent source reviews found no concrete blocker. They ran no additional application/browser checks, and their review does not replace a different human's approval.

## Explain-back and remaining work

In my walkthrough I can say: "The wall already exists in the confirmed island drawing. Selecting it redraws those same pieces above trees so I can see what I am editing. It uses the same material and current damage state, and cannot create a wall, charge coins, move it or heal it. I own the extra geometry, and release it when selection ends; the ordinary wall owner still owns the shared texture."

Before Ready, explain why full neighbors are retained while drawing only a subset, which resources selection may dispose, and how broken or removed walls avoid becoming healthy. Native after captures, the combined full/build/UI checks, sustained device performance and final human appearance approval remain open. No PR merge to main, deployment, live migration or production flag change.
