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
