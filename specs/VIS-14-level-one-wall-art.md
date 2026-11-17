# VIS-14: level-one wall state identity

Issue: [#376](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/376).
Pinned integration dependency: `e37ebc71e759918905412c0722f5bfa60b3d0bce`.

## Goal

Fix the confirmed VIS-14 level-one damaged/broken artwork collision before final asset baking. `wallFrame(1, damaged|broken)` currently selects generic legacy IDs that are subsequently replaced by level-three aliases. A damaged level-one post can therefore display the wrong material tier.

Responsible teammate: Johannes Franz Lang (`frcola`), assisted by one wall-metadata agent in a separate clone. Parent: #219. Coordinator authorized this bounded correction; existing intact scene captures are unaffected.

## Scope

- Preserve generic damaged/broken legacy aliases as level three for existing callers.
- Give level-one damaged/broken canonical frames unambiguous IDs; keep intact and levels two through five unchanged.
- Keep all five tiers, three damage states, native source crops, feet, logical dimensions, footprints and gameplay rules.
- Change only wall family metadata, focused coverage and task documentation. Coordinate any discovered consumer changes with the integration owner.

Expected files: `frontend/src/art/village/walls.js`, focused wall metadata/atlas coverage tests, and a bounded spec.

## Acceptance

- Every canonical level/state maps to its own authored row and column; level-one canonical frames remain distinct from generic aliases.
- World and combat atlas canonical frame lists cover all fifteen level/state combinations without duplication.
- Existing generic aliases remain level three.
- Focused pure checks and build pass with exact results recorded. No Chrome work in this lane.
- Final baker includes the corrected raw metadata before publishing its final output; actual visual review remains the coordinator's responsibility.

## Limits

No new dependency, gameplay/HP/breach change, source-image editing, main push, force push, merge, live migration or production activation. Keep Draft for explain-back and a different human's review.

## Implemented correction

`wallFrame(1, 'damaged')` and `wallFrame(1, 'broken')` now return
`island-wall-l1-damaged` and `island-wall-l1-broken`. Level-one intact and
all level-two through level-five selectors retain their previous IDs. The
generic damaged/broken aliases retain the existing level-three source crops.
All canonical frames still share logical 48×32 dimensions and anchor 6; no
PNG bytes, coordinates, source feet or gameplay data changed.

The 32 metadata entries now represent 30 canonical atlas frames and two
separate legacy aliases. Both world and combat already import the same
canonical selector/list, so the correction reaches their batched UVs without
another renderer implementation. The final asset compiler must include this
metadata; its previous bake predates the two distinct L1 state entries.

## Exact verification

Verified runtime source: `813a08673c2f2159cb41612d1af784d157552800`.

Before the fix, `npx vitest run tests/art/wall-tier-identity.test.js` exited 1
with **3 failed tests**. It reproduced the wrong canonical L1 selector and
wrong actual world and combat UV rectangles for level-one damage. After the
fix, from `frontend/`:

```text
npx vitest run tests/art/wall-tier-identity.test.js tests/art/wall-atlas.test.js tests/art/village-activation.test.js tests/island/wall-shaded-preview.test.js
Test Files  4 passed (4)
Tests       14 passed (14)
Duration    1.13s

npm run build
Built in 1.01s
Spoiler guard: 244 text files, 12 protected lines, no suspect elimination data.

node scripts/report-budget.js --check
Exit 0; cold-title JavaScript 18,825 bytes, CSS 9,410 bytes.
```

From the repository root, `node scripts/text-lint/index.mjs` exited 0:
`4538 candidate strings in 528 source files; 0 errors, 8 report-only findings.`
The existing report-only findings were not modified.

The regression checks all 15 canonical tier/state crops against the authored
five-column/three-row source layout, their shared metrics, registration and
unique canonical atlas coverage. Separate actual Three.js buffer checks use
both world and combat consumers for all 15 states and inspect the post UVs;
these are pure geometry checks, not GPU screenshot acceptance. No Chrome
process was launched by this lane.

Not verified here: final baked asset output, combined screenshots, live
recovery behavior, full frontend suite, a11y/demo or production. A separate
integration finding remains: `structureRecoveryAppearance` in `world.js`
uses generic wall state IDs in its nonbatch fallback. The coordinator owns
that shared-file correction and its recovery tests. This metadata PR does
not claim to resolve it. Overall wall visual acceptance remains open.

## Explain-back

I keep the old generic aliases because an older caller may still expect
them to mean level three. The new renderer knows each wall's actual level,
so it uses an explicit level-one ID for damaged and broken artwork. This
prevents one dictionary entry from replacing another tier's source crop.
The image lookup changes; wall health, paid upgrades and breach behavior
do not. The focused tests inspect the actual selected UVs as well as the
metadata so they catch the error reaching either consumer.

1. Why did the generic damaged ID replace level-one artwork with level three?
2. Why do we preserve the generic alias while adding an explicit L1 ID?
3. How do the actual buffer checks prove the fix reaches both consumers?

Keep Draft for Johannes's explain-back and a different human's review.
