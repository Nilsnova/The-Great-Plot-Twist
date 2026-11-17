# VIS-07: shaded cannon family

For Johannes Franz Lang (`frcola`), issue #212. The approved reference-village
appearance replaces the earlier rejected flat-painter proof. Build on `9dc1bea5`
and the shared VIS-32 source, with original transparent artwork and native source
rectangles recorded separately from logical frame metrics.

Scope: five cannon levels, intact/firing/damaged/broken, shared world/combat
material source. Gameplay prices, unlocks, aim, HP and two-unit footprint remain.
Explicit visual-box adjustments belong to VIS-04 and need matching anchor,
muzzle/health-bar, picking and atlas-budget evidence before acceptance.

First generate and inspect the complete material/state sheet, then register
exact IDs through the shared provider. Keep every foot and actual state stable.
Source assets are not runtime proof: capture the actual game at1280×720 and
375×812 and compare it with the approved mockups before extending the family.

No dependency, service, live migration, flag activation, merge or deployment.
Keep Draft for explain-back and different-human review. Commands and exact
results follow as the source and integrated provider become available.

## Source handover

All20 existing names have original shaded artwork and explicit native source
rectangles. The approved logical box is56×48/7, with no gameplay-footprint change.
Per-level `fitBounds` keeps intact/firing/damaged/broken at one scale while clean
broken crops exclude neighboring row pixels. VIS-32 owns the shared normalization.

Source checks:29tests passed in528ms; a recording-canvas probe of the actual
VIS-32 normalizer passed60 density/state cases. [Exact asset/probe evidence](../docs/evidence/VIS-07-cannons/README.md)
distinguishes these checks from the still-required actual-game comparison.

Explain-back: Why is the visual box separate from the2×2 footprint? Why does a
broken pose need virtual fitting headroom? Why do source tests not prove that the
actual renderer matches the approved mockup?
