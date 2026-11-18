# VIS67: independent upright wall observer

Used by Johannes Franz Lang (`frcola`) and a different human reviewer to assess the QA follow-up to the revised wall presentation.

Issue: [#449](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/449). This branch is stacked on VIS61's current-main-preserving review base. It owns the independent multiplayer wall observer and its direct regression fixtures only. The product changes are separate VIS63/VIS64 drafts.

## What was wrong

The previous observer independently expected cap heights
`[.95, 1.15, 1.25, 1.35, 1.43]` and a `.28` half-width. VIS64 deliberately
revised the wall presentation to upright posts and thicker spans. With that new
product source, the unchanged observer suite failed **61 cases and passed 90**.
Those failures are retained in [red.log](red.log), rather than relabeled as a
passing run.

The corrected QA contract explicitly names heights
`[1.45, 1.70, 1.95, 2.10, 2.20]` and a `.40` half-width. It continues to inspect
the actual indexed position/UV buffers, visible unchanged object transforms,
texture dimensions and per-frame original-art receipts. The expected shape is
not imported from the production batching helper.

VIS63 also makes a selected straight wall draw its full authored post once in
its ordinary depth layer. Selection is established only through that renderer's
read-only `wallSelectedId` diagnostic, which is null for unknown, removed or
disposed selections. An unexpected full post cannot pass merely because some
other wall is selected. QA never infers selection from whichever buffers happen
to be present. The existing green footprint brackets remain separate untextured
indicators; they do not prove that an opaque wall was drawn.

## Exact checks and evidence

The [machine-readable record](checks.json) binds the tested observer/test file
hashes, product dependency commits and original test prefix. The final pure run
was executed from working files subsequently committed byte-for-byte as
`b21cda306ae57e192753cf1a14a9897d551a5edd`; documentation commits change HEAD only.

| Check | Actual result | Original log |
|---|---|---|
| Old observer against the new profile source | **61 failed / 90 passed**, 151 cases, 1.42s | [Tests-first failure](red.log) |
| Corrected dimensions with all original cases unchanged | **151 passed**, 860ms | [Original-case green](green-existing.log) |
| Additional old-height/old-width buffer attacks | **171 passed**, 692ms | [Expanded green](green-expanded.log) |
| Selected-state tests before the observer recognized the exact selected ID | **20 failed / 171 passed**, 191 cases, 1.00s | [Selection tests-first failure](red-selected.log) |
| Final observer, wall/art/selection lifecycle selection | **254 passed / seven files**, 3.41s | [Final focused green](green-final.log) |

The initial three observer-only commands were:

```sh
cd frontend
npx vitest run tests/multiplayer-map-observer.test.js --maxWorkers=1 --reporter=verbose
```

The same command established the selected-state red. The final selection was:

```sh
npx vitest run tests/multiplayer-map-observer.test.js \
  tests/island/wall-connections.test.js tests/island/wall-selection.test.js \
  tests/island/wall-batch-options.test.js tests/island/wall-tier-detail.test.js \
  tests/art/wall-upright-volume.test.js tests/pirates/wall-connections.test.js \
  --maxWorkers=1 --reporter=verbose
```

All **151 existing observer cases remain byte-for-byte unchanged**, not merely
equal in number. Their original 8,675-byte prefix has SHA-256
`ae0bfd36f8480706d98834f051f94e0951bc558ed8f0324b832680b98ed1a5e1`.
The 40 appended cases exercise every tier in horizontal and vertical runs:

- Replace the real indexed center cap with the old height or old cross-section;
  the fresh tier diagnostic must not turn that stale geometry into success.
- Select the exact center wall, observe its ordinary-depth full post, then clear
  selection and observe its cap again.
- Replace an unselected cap with correctly textured authored-post geometry while
  another wall is selected. It must fail. Rebuilding the actual selected center
  post then restores success.

Every original UV/position/index corruption, stale tier, visibility, transformed
ancestor, manual matrix, draw-range, empty/placeholder receipt and teardown
negative control remains. The QA source changes only three expectation lines.
No native action, synchronization collector, timeout, minimum paired-tick count
or tolerance is edited.

## Integration and limits

Product dependencies are separate work: VIS64 API `bdf54f43`, upright source
`15d8362f` and exact compiled family `76e7949f`; VIS63 ordinary selection
`3866a92f` and read-only selection diagnostic `52b6f921`. The branch includes
those dependencies for meaningful pure checks. Only the two VIS67 QA commits
(`977f1eda`, then `b21cda30`) change the observer and appended direct cases.

Root owns Chrome. **No native multiplayer, application screenshots, full
frontend, backend, build/budget or sustained-performance run was performed by
this QA writer.** Pure results establish the named buffer and lifecycle
contracts; they do not prove the complete game journey, visible aesthetic
quality, network persistence or resolution of the earlier input/pose failures.
The issue remains open and the PR remains Draft pending coordinator evidence,
Johannes's explain-back and a different human's review. No PR merge, deployment,
live database operation or dependency change was performed.

## Explain-back

In my words: I changed the measuring ruler after the wall's agreed shape changed.
The ruler still reads the actual texture and geometry; it cannot accept a fresh
label with stale drawing. A selected full post is legitimate only for the
renderer-selected wall, so selecting a neighbor cannot hide a wrong cap. The
buffer tests can reject these concrete faults, but a real browser run and human
visual review are still necessary.

Before readiness, rehearse:

1. Why does the verifier name its own expected dimensions instead of importing
   the production shape helper?
2. Why must a full post on an unselected straight wall still fail when a neighbor
   is selected?
3. Which failures can these pure buffer checks detect, and which game/browser
   claims still need separate evidence?
