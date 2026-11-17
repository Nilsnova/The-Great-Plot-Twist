# VIS-09: shaded harpoon level and state artwork

Responsible human: Johannes Franz Lang (`frcola`). Issue #214. Branch:
`feat/vis-09-shaded-harpoons`; one writing agent in a separate clone.

## Goal, scope and shared contract

Supply original shaded pirate harpoon-ballista artwork for all five existing
tiers in intact, firing, damaged and broken states. Preserve canonical names
`island-harpoon[-lN]`, `island-harpoon-fire[-lN]` and the matching damage/ruin
suffixes. The coordinator owns central registration and combined-scene evidence.

The coordinator approved56×48/anchor7 presentation to match cannon and mortar
volume. Existing fallback metrics48×32/5 and the paid2×2 footprint remain; native
image pixels never change saved position, range, slowing effect, health or price.
The firing pose releases the harpoon and bowstring, without a gun muzzle flash.

## Bounded plan and acceptance

1. Confirm supported IDs, actual state selection and verified school Git identity.
2. Write source/footprint/normalizer tests and observe the missing-family failure.
3. Generate and inspect original transparent20-state source artwork.
4. Measure complete independent crops and shared per-tier root-relative fits.
5. Verify source integrity, alpha/gutters, canonical IDs and normalized feet/scale.
6. Build and check cold imports/budget/text lint; hand off exact commits.

## Risks and remaining proof

Thin bow limbs, rope and barbed tips can disappear at phone scale. Firing must
preserve the same base/foot; a smaller ruin must not enlarge to fill the intact
box. Misplaced crops can include neighboring tiers or state smoke. Source tests
cannot prove actual GPU appearance, firing/picking alignment or final style.
Actual1280×720/375×812 world/combat captures, quality modes, resource costs and
final shared-atlas parity follow after coordinator registration.

No app dependency, service/account, .env change, migration, production flag,
deployment or merge. Keep Draft for explain-back and a different human review.

## Implemented and verified

The source supplies all20 canonical frames with approved56×48/anchor7 metrics.
Each tier has one measured fitting box across intact, released, damaged and
collapsed states. The original PNG remains unchanged, with exact image-tool
prompts, rejected intermediate and SHA-256 in its provenance README.

Before source implementation, the new test failed because the family module was
missing (284ms). After implementation,
`npx vitest run tests/art/village-harpoons.test.js tests/v3-raster-free.test.js`:
**2 files passed,33 tests passed,1.01s**. Includes20 names/native crop/alpha/source
integrity cases and60 recording-canvas normalizations at1.5/2/4 density: same
per-tier scale to12 decimals and normalized foot(28,41). This proves metadata
geometry, not actual decoded-pixel/GPU parity or game appearance.

`npm run build`: built in1.02s; spoiler guard244 text files/12 protected lines,
no suspect elimination data. `node scripts/report-budget.js --check`: exit0,
initial JavaScript18,825 bytes/CSS9,410; limits21,080/12,000 unchanged.
`node scripts/text-lint/index.mjs`:4,538 candidate strings/530 source files,
0 errors,8 existing report-only findings. `git diff --check`: clean.

Not run: full suite, actual world/combat captures, firing/picking alignment,
a11y/demo/overlaps, live backend, full world-art payload/GPU costs and final
reference acceptance. The coordinator must register this family and include it
as a raw source in the final asset bake before those combined checks.

## Explain-back

I changed the harpoon drawing, keeping the existing requested level and state
names. The firing drawing removes the loaded shaft and releases the string;
the slowing effect remains the existing simulation's decision. Each tier shares
one fitting box, so low broken rubble does not grow into a standing tower.
The native image is original unchanged source, while tiny crop/foot metadata
lets the shared world and combat provider place it consistently. The bigger
visual box does not enlarge the paid tile or create a stronger weapon.

Questions: Why does the firing pose have no gun flash? How does one fit box
prevent a broken-state scale jump? Which actual-game checks are still needed
before accepting this family against the reference?
