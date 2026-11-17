# VIS58: quieter ground and clearer rock lighting

Used by: Johannes Franz Lang (`frcola`) and reviewers of the reference-village presentation follow-up. Tracks [issue #429](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/429).

## Goal and boundaries

The current grass and small pavers compete with the village artwork, while the existing cliff reads as a tiled plinth. Tune the supplied original terrain material's blend and scale, and strengthen lighting on the existing rock faces. This is a visual follow-up to the approved pirate-village concept, not a gameplay redesign.

Start from the current-main-preserving review checkpoint `6c87b8dcd2d7a1bb5376c3b64bbede27a144479e`. This leaf is based on `chore/vis-57-playtest-base`; its Draft PR must contain only the landscape follow-up.

## Scope

- `frontend/src/art/ground.js`: restrained grass blending and material use.
- `frontend/src/art/village/terrain-materials.js`: modestly larger path texture cells.
- `frontend/src/art/coast-cliffs.js`: improve material lighting within the existing face polygons.
- Focused tests, a browser parity helper and exact evidence/documentation.

Keep path coordinates and width, clearings, clipping, source rectangles, world anchoring, material ownership and D064 projection unchanged. Preserve the full analytic coast and decorative alpha, cliff depth 3.2, approach depth 0.35 and every naval cove. No water shader, collision, paid position, price, progression, combat, API, database or service changes. No new asset or package. Leave the old fallback artwork unchanged where possible.

## Plan

1. Claim a Draft before code, and preserve the exact parent source.
2. Add independent source-region, texture-scale and immutable-profile checks; run the intended new checks red.
3. Tune the existing grass/path sampling and rock light, reusing current paint operations.
4. Run the relevant pure terrain, coast, projection and lifetime checks.
5. Build, report the title budget and run text lint.
6. Let the coordinator run actual desktop/phone captures and exact browser alpha/coast parity on the composed source.
7. Record results, limits and explain-back; keep Draft for human review.

## Evidence and risks

The coordinator compares before/after images at the same time, paid layout and camera. A separate native painter helper compares source PNG hash, full alpha bytes, thresholded coast mask and exact profile. It is diagnostic terrain evidence, not a substitute for playing the full game. No passing browser claim is made before it runs.

Too little grass detail can flatten the island; too-dark rock can hide its shape. A parameter change is accepted only after actual screenshots. Preserve the ordinary failed attempts and check results. No main merge, force push, deployment, live migration, .env or production-flag changes.
