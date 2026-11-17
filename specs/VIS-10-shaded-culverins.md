# VIS-10: shaded culverin family

Responsible human: Johannes Franz Lang (`frcola`). Issue #215.
Writing agent: `culverin_art`; branch `feat/vis-10-shaded-culverins`.
Pinned composed review base: `68330ddf9b66a2657f482c50eb60243498775fdc`.

Replace the existing culverin family's presentation with an original transparent
sprite sheet: five actual levels, intact/firing/damaged/broken state IDs. Reuse
VIS32's shared world/atlas normalizer; the coordinator serializes registration.
The long barrel must distinguish this weapon from the cannon and mortar.

The coordinator authorized visual dimensions56×48/anchor7, matching cannon and
mortar volume. Paid2×2 footprint, source simulation coordinates, targeting,
health, costs, unlocks and damage remain authoritative and unchanged. Common
per-tier fit bounds preserve hardware scale and ground feet across all states.

Expected files: village/culverins.js metadata, original PNG/README, focused
source/bounds/normalization tests and source audit. No shared runtime edits,
new dependency, .env change, live flag, migration, deployment or merge.

Before activation, inspect original alpha/bounds, canonical IDs, complete crops,
nonoverlap and shared feet/scales at densities1.5/2/4; run build/cold guard/text
lint. Actual composed world/combat/phone appearance, muzzle alignment, screenshots
and lifecycle checks remain coordinator work. This claim does not assert checks
or final style acceptance passed. Draft pending explain-back and human review.

## Source and verification handoff

Original final PNG `culverins-v1.png`:1536×1024 RGBA,2,257,251 bytes,
SHA-256`c1d8549fd93913df9dfa9ad5977bc77e5a236347dfbc852cdf0ac61875612377`.
The seven image-tool requests and rejected alternatives are preserved in
`docs/evidence/VIS-10-culverins/generation-record.json`. The final file is copied
unchanged; read-only alpha analysis found964,000 exactalpha0pixels, allfour
corners alpha0 and maximum crop-edge alpha3/255. All20 separate rectangles keep
3px gutters; no rectangular crop contains a neighboring tier/state. Frames use
shared per-tier root-relative fit bounds and measured base-center feet.

Executed: `npx vitest run tests/art/village-culverins.test.js tests/v3-raster-free.test.js`
from frontend:2 files passed,33 tests passed,953ms. This includes60 recording
normalizations at densities1.5/2/4 with exact logicalfoot28,41, equal per-tier
scale and contained source/destination bounds. Recording-canvas tests do not
prove actual image pixels. `npm run build`: built in1.08s; spoiler guard244text
files/12protectedlines/no suspect elimination data. `node scripts/report-budget.js --check`:
exit0, coldJS18,825 bytes/CSS9,410 bytes/titleimageabsent. Repository textlint:
4,538candidate strings/530sourcefiles,0errors and8existing report-only findings.

Not run: actual world/combat GPU parity, muzzle/health-bar alignment, desktop/
phone screenshots, full frontend suite, a11y/demo/overlap, Safari or live backend.
Coordinator activation/bake/combined evidence remain required. No gameplay,
flag, price, health, footprint or shared dispatcher change is included here.

## Explain-back practice

The metadata maps each existing culverin ID to one measured original-image
rectangle. The normalizer reuses a common fitting box per level, so a short
wreck does not grow just to fill the image. The56×48 visual box is independent
of the server's2×2 paid placement footprint. The source tests catch missing
states, crop bleed, foot jumps and accidental source changes. They cannot prove
the final lighting/style or muzzle alignment in the game; those need actual
combined renderer captures. Future art can replace the source and measured
rectangles while retaining the existing identity/state contract.

Questions for Johannes before review: Which ID is selected for a damaged
level-four culverin? Why must all four tier states share fit bounds? Which
checks remain necessary before claiming the world and combat look identical?
