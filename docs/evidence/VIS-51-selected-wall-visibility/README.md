# VIS51: selected-wall visibility evidence

Responsible teammate: Johannes Franz Lang (`frcola`). [Issue #417](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/417), [Draft #418](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/418), [spec](../../../specs/VIS-51-selected-wall-visibility.md).

## Source and exact behavior

Runtime source is `acc37240cba4c22fca903210d233ae2beae6e4f7`, following claim `3d67a9f5`. Its frontend source tree is `6e0c6b27b717a7b8eedcde498d7372de6f0942cb`. The immutable composed review base is `5e3dd6ccb3597617e67a8b720525d3add78c3704`; that is also the source of the actual before screenshots below. No source PNG, backend, dependency, collision, purchase, HP or placement rule changed.

The existing textured-wall builder has an optional ID filter. It retains the complete neighbor map, and extracts the exact selected post and its incident spans without inventing new ends. The small [drawing owner](../../../frontend/src/island/wall-selection.js) combines those ordinary position/UV/index quads in their existing painter order into one mesh at order 199. Its current wall material is borrowed, preserving the atlas, tint, alpha and single-pass state. Existing green corners remain at 200/201.

The foreground mesh owns only its geometry. Selection changes, accepted level/position/damage updates and successful atlas replacement rebuild that subset. Repeated frames retain it. Close, Move, battle, visitor transition, removal and disposal clear it. HP zero uses actual rubble and removes standing connections. Missing artwork gets no healthy fallback. The normal wall meshes and their exact position/UV/index bytes remain unchanged by selection.

## Actual before and after

| Viewport | Before: stage seven | After: stage eight |
|---|---|---|
| 1280×720 | [Desktop before](before/reference-selected-level3-1280x720.png) | [Desktop after](after/reference-selected-level3-1280x720.png) |
| 375×812 | [Phone viewport before](before/reference-selected-level3-375x812.png) | [Phone viewport after](after/reference-selected-level3-375x812.png) |

All four are unchanged actual browser PNGs. Stage seven shows the wall largely covered by foliage while its green corners identify the paid tile. Stage eight paints the same current post and incident spans above foliage. Mixed-level neighbors keep their actual connecting material; selection does not change their level or topology. The [before execution receipt](before/execution.json) and [after execution receipt](after/execution.json) name each source, helper identity, command and completed capture.

The coordinator's full stage-eight capture exited **0 in 200.36s**. Its exact [selected-state metadata](after/selected-report.json) retains both original selected JSON subtrees, original error arrays and the full source report's hash/size. This bounded metadata extraction is derived JSON; the image bytes are untouched.

| Selected-state measurement | Desktop | Phone viewport |
|---|---:|---:|
| Stage-seven drawing calls | 118 | 115 |
| Stage-eight drawing calls | 119 | 116 |
| Added selected-wall drawing calls | 1 | 1 |
| JavaScript page errors | 0 | 0 |
| External requests | 0 | 0 |
| Expected offline 503 console diagnostics | 1 | 1 |

The native images were captured at screenshot pixel ratio 1/high quality; prior adaptive drawing ratios remain in the raw selected metadata rather than being hidden. These samples preserve the under-150 target and establish one added draw in this scenario. Sustained performance and final human appearance acceptance remain open. This writing agent ran no Chrome; the coordinator supplied the original native receipts.

### Composed capture boundary

| Identity | Exact value |
|---|---|
| Stage-eight actual runtime | `91c1f9d57c1edd957d26588b99fbb1489e575127` |
| Frontend source tree, identical to VIS51 source | `6e0c6b27b717a7b8eedcde498d7372de6f0942cb` |
| Public artwork tree, unchanged | `9306942db1050d728799cee2fbdc8e8960f14ad2` |
| Composed backend tree | `c785196095edef4f5416744b46435ab564da4e9c` |
| Composed Supabase tree | `6e52a63b87028291127dbae8c344c9f49a73896d` |

The capture includes the separate VIS50 recovery-checkpoint guard, whereas this focused branch retains its pre-VIS50 backend. The only backend/Supabase differences are that task's new SQL regression file and forward migration. Frontend source and public artwork are byte-identical; this task does not claim its own backend tree is the newer composed tree.

The scenario remains the declared local/offline **legacy recovery version 0** fixture. It pays for the wall and its actual level-three upgrade and shows the same 6,620 remaining coins. Unknown health stays truthfully labeled unavailable. These images do not establish live production HP, rollout, a physical phone or Safari behavior.

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

[manifest.json](manifest.json) records the original hashes/sizes and native dimensions of all four PNGs, the original execution receipts, raw pure logs and the explicitly derived selected metadata. Two independent source reviews found no concrete blocker. They ran no additional application/browser checks, and their review does not replace a different human's approval.

## Explain-back and remaining work

In my walkthrough I can say: "The wall already exists in the confirmed island drawing. Selecting it redraws those same pieces above trees so I can see what I am editing. It uses the same material and current damage state, and cannot create a wall, charge coins, move it or heal it. I own the extra geometry, and release it when selection ends; the ordinary wall owner still owns the shared texture."

Before Ready, explain why full neighbors are retained while drawing only a subset, which resources selection may dispose, and how broken or removed walls avoid becoming healthy. Native before/after captures and selected-state counts are now recorded above. The combined full/frontend/UI/build checks are **pending** on the coordinator's later frozen candidate; this document claims no complete-suite pass. Sustained device performance, explain-back and final human appearance approval remain open. No PR merge to main, deployment, live migration or production flag change.
