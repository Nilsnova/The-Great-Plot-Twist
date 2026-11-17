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
