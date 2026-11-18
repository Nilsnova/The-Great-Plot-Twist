# VIS-01: approved village visual contract

For Johannes Franz Lang (`frcola`), supporting issue #206. This branch records the
17 November approval and the world-art policy needed to implement it. Runtime
implementation starts from the unmerged perimeter candidate `9dc1bea5`.

The previous flat-painter proof did not satisfy the requested visual target.
The approved desktop, selected-wall and portrait concepts require richly shaded
buildings, continuous material walls, textured cliffs and vegetation, a readable
close village composition and compact touch controls. Generated concepts are
design references; actual game captures are the acceptance evidence.

Root coordinates docs/policy and shared interfaces. Independent writers claim
VIS-32 (asset provider), VIS-33 (framing), VIS-05 (hero building), VIS-14 (walls),
VIS-20 (terrain) and VIS-21 (nature) in their own clones and Draft PRs.

Original runtime image assets are approved for world art. The cold title,
intro/cutscenes and tutorial retain their existing source and load protections.
Logical terrain, placement, paid progression, health and deterministic combat
rules remain authoritative. No new app package or external service is needed.

No merge, deployment, live migration or production activation is performed.
Documentation link/content checks and exact implementation evidence will be
recorded before this handover is complete. Human review and explain-back remain.

## Recorded policy checks

The original no-raster cold-screen checks remain. World-only manifest/loader
modules have an explicit D063 boundary plus a new recursive static-import guard
from every cold screen root. No asset filename is concealed and no cold transfer
limit is increased. On this policy revision, `npm test -- --maxWorkers=1
tests/v3-raster-free.test.js tests/hires-art.test.js` passed2files/11tests in1.06s.
The integrated provider must run the same guards and actual cold network/budget
checks again; this pre-provider result is not an acceptance of future source.

## Presentation correction after the first actual checkpoint

[D064](../docs/DECISIONS.md#d064--shared-reference-village-projection-and-presentation-bounds--2026-11-17)
records the coordinator's shared ground mapping, legacy backdrop conversion,
measured Fit and working views, and tighter visual boxes after the first composed
material screenshot was rejected. The approved concepts remain the target;
neither the numeric coefficients nor the implemented scene have separate final
human acceptance. Desktop Work is 1.05×Fit; phone Work is at least **absolute**
zoom 0.9, with panning, rather than 0.9×Fit. Native source pixels, upright visual
boxes and unchanged logical tile/physics footprints remain distinct.

This followup changes documentation only. Content checks confirm the decision
anchor, internal links, declared coefficients and the distinction between source
paint units and displayed facade depth. No application tests or screenshots were
run for this documentation revision. Actual composed-scene evidence remains the
coordinator's VIS-31/intermediate-checkpoint work.
