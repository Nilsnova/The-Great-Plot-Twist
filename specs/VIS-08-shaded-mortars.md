# VIS-08: shaded mortar level and state artwork

Responsible human: Johannes Franz Lang (`frcola`). Issue #213. Branch:
`feat/vis-08-shaded-mortars`; one writing agent in a separate clone.

## Goal and scope

Replace the flat mortar artwork with an original shaded pirate miniature family
matching the approved reference-village direction. Supply all five existing
levels in intact, firing, damaged and broken states through data-only metadata.
The coordinator owns shared registration and combined-scene activation.

The current canonical logical box is48×32/anchor5. Native PNG pixels, crop and
source feet are independent of the existing2×2 paid gameplay footprint. A changed
visual box requires explicit coordinator agreement; no gameplay statistics,
collisions, costs, unlocks or repair rules change here.

## Acceptance and bounded plan

1. Confirm actual frame names, metrics and state consumers.
2. Generate original transparent source artwork with consistent per-level feet.
3. Inspect the source alpha, crop boundaries and authored state/level identity.
4. Supply metadata with shared per-level fitting bounds, preserving rubble scale.
5. Test supported IDs, crop containment, transparency, source integrity and feet.
6. Build, check cold imports and text lint; hand off exact commits to integration.

## Evidence limits and risks

This asset task does not establish whole-game reference acceptance. Actual world
and combat screenshots at1280×720 and375×812, firing alignment, selection/picking,
quality modes, resource costs and final atlas parity follow after registration.
Dense detail can become unreadable at phone scale; incorrect fit boxes can cause
pose jumps or include neighboring cells. Registered failures must remain visible
and retryable through the shared provider. No new packages, services, production
flags, .env changes, live migrations, deployment or merges.

Draft until combined verification, explain-back and a different human review.

## Implemented and verified

The coordinator approved56×48/anchor7 on17 November2026, matching the cannon's
presentation volume. Native per-state feet and per-tier common fit bounds keep
firing smoke and low rubble at the same source scale. All20 existing IDs remain.
The source is an unchanged original transparent image; the provenance README
records all three image-tool requests and rejected intermediates.

`npx vitest run tests/art/village-mortars.test.js tests/v3-raster-free.test.js`:
**2 files passed,33 tests passed,579ms**. Includes native source SHA/alpha/crop
bounds,20 canonical states, no neighbor sampling and60 recording-canvas
normalizations at1.5/2/4 density with foot(28,41). Scale equality uses12-decimal
tolerance for floating-point division (measured maximum difference5.55e-17),
not a relaxed source/foot requirement. This is geometry/metadata evidence, not
actual pixel/GPU parity.

`npm run build`: built in797ms; spoiler guard244 text files,12 protected lines,
no suspect elimination data. `node scripts/report-budget.js --check`: exit0,
initial JavaScript18,825 bytes/CSS9,410; existing limits21,080/12,000 unchanged.
`node scripts/text-lint/index.mjs`:4,538 candidate strings/528 source files,
0 errors,8 existing report-only findings.

Not run: full suite, browser/GPU world/combat captures, final reference comparison,
a11y/demo/overlaps, live backend. Registration is coordinator-owned and pending;
source art approval does not assert that the whole scene or payload budget passes.

## Explain-back

I replaced only the mortar drawing source. The game still requests the same
level/state names and uses its existing paid positions and combat values. Each
level shares one fitting box, so a short pile of rubble does not grow to fill the
normal mortar height. The images include real transparent gutters to avoid
sampling another state. The provider can render both world and combat from the
same metadata, but that combined path still needs actual screenshots and tests.

Questions: Why is a logical visual box different from a paid tile footprint?
Why must the broken frame share the intact frame's fitting box? What additional
evidence is needed before saying this artwork matches the approved game scene?
