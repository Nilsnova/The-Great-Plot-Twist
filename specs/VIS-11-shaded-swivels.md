# VIS11: shaded swivel-gun nest family

Responsible human: Johannes Franz Lang (`frcola`). Issue #216.
One writing agent on `feat/vis-11-shaded-swivels`, separate clone.

## Goal and scope

Replace the flat swivel nest appearance with original shaded pirate miniature
art matching the approved world direction. Preserve all20 existing canonical
IDs: levels1–5, intact, firing, damaged and broken. Keep the pellet unchanged.
The coordinator approved logical visual56×48/anchor7 to match the supplied
cannon/mortar families; paid2×2 footprints and every game value remain unchanged.

Scope is data-only `src/art/village/swivels.js`, original transparent PNG and
provenance, focused metadata/normalizer tests and this handover. The coordinator
owns registration, world/combat consumers, final source bake and screenshots.

## Acceptance and evidence

- Exact existing IDs, distinct level identity and damage state, safe native crops.
- A shared ground foot and per-tier fitting bounds across each four-state group.
- True alpha outside sprites, no smoke/neighbor bleed, same upper-left lighting.
- Source hash, dimensions and exact image-generation instructions preserved.
- Focused bounds/normalizer checks, build/cold-budget and text lint run honestly.
- Actual world/combat/portrait appearance, muzzle alignment and full desktop/phone
  comparisons remain pending coordinator composition; generated artwork alone
  does not prove those checks.

No dependency, .env, server state, migration, production flag or deployment
change. Keep Draft for explain-back and different-human review. No merge.

## Implemented source and verification

The final original1536×1024 RGBA PNG is2,610,002 encoded bytes, with809,064
fully transparent pixels and four zero-alpha corners. All20 measured source
rectangles are nonoverlapping and their edge alpha is at most4. The first haze
and residual-corner versions were rejected and corrected through image generation.
The final original bytes are unchanged in Git; README preserves all three exact
prompts and the source hash. Native alpha inspection used read-only image access.

`npx vitest run tests/art/village-swivels.test.js tests/v3-raster-free.test.js`:
**2 files /33 tests passed,753ms**. This includes the exact SWIVEL_ART canonical
set, original bytes/hash/native bounds, per-state safe source rectangles, and60
recording-canvas normalizations at1.5/2/4 with foot(28,41) and shared tier scale.
The pellet is explicitly absent from the raster replacement.

## Explain-back

I supplied one original sheet and data describing how to read its twenty pieces.
The game keeps selecting its real level and state; the new art supplies no stats
and grants no building permission. A source rectangle says which pixels to copy,
while the56×48 image box says how big the drawing appears. The ground foot stays
at(28,41), and a common fitting box within a tier prevents firing or low rubble
from being independently enlarged. The coordinator must still register these
frames, compile the shipped source and check the actual world/combat scene.

Ask-back: What makes a swivel nest visually distinct from a cannon? Why does a
short wreck retain its intact tier's fitting scale? Which checks would prove the
muzzle and health display align in the actual game, beyond the source tests?

`npm run build`: built in1.25s; spoiler guard244 text files/12 protected lines,
no suspect elimination data. `node scripts/report-budget.js --check`: exit0,
cold title18,825 JS bytes and9,410 CSS bytes, no title image and no unshipped
files in dist. `node scripts/text-lint/index.mjs`:4538 candidate strings/530
source files,0 errors and8 existing report-only findings. No Chrome, full suite,
a11y/demo/overlap or live verification ran in this isolated source lane.
