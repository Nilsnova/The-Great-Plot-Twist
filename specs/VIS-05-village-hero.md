# VIS-05: approved village hero artwork

For Johannes Franz Lang (`frcola`), assisted by a building-art agent. Tracks
[issue #210](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/210), on the
unmerged perimeter candidate `9dc1bea505fe3b26bd56d6ad02c21a2db8bd8be9`.

The approved 17 November visual concepts select richly shaded original world
artwork. The earlier flat-painter trial did not meet that visual target. The
coordinator owns the explicit world-art exception and shared policy record;
title, intro, cutscene and tutorial transfer protections remain.

## Bounded task

Replace the existing `cabin` appearance with a substantial pirate village hero
building: navy slate roof, warm timber framing, stone foundation, restrained gold
trim, warm windows and a recognizable entrance. This is still the existing cabin,
not a new headquarters system. It gains no levels, resources, unlocks or services.

Files owned by this slice are the original transparent asset under
`frontend/public/village/`, its provenance, and the declarative family mapping
`frontend/src/art/village/buildings.js`. The VIS-32 writer owns loading and shared
world/combat registration. The coordinator serializes those hooks.

## Plan

1. Claim the task with this spec and a Draft before application changes.
2. Generate original transparent art using the approved village as the style
   reference; inspect the actual alpha, resolution and visual result.
3. Record its exact source hash, native dimensions, visible bounds and foot point.
4. Supply the shared raster provider with the existing `cabin` identity and agreed
   frame geometry. Native image resolution never changes a gameplay coordinate.
5. Verify loading/bounds/fallback behavior through the selected shared provider.
6. Capture the actual game at 1280×720 and 375×812 in the coordinated browser lane.
7. Record exact checks, explain-back questions and limits; keep the PR Draft.

## Contracts and risks

- The baseline cabin frame is 96×96 logical pixels with anchor 12. Any larger
  visible box requires a coordinated shared visual-metrics decision.
- Preserve its existing ground point, collider, interaction zone and Move rules.
- The painted plinth and contact shadow add no buildable land or collision.
- Alpha margins must not clip a flag, roof, foundation or shadow.
- World and combat consumers must use the same normalized source and foot point.
- A generated asset image is supplementary art evidence, not actual gameplay.
- No new dependencies, backend changes, live migrations, production flags,
  deployment, main push, force push or merge belongs to this task.

## Evidence and remaining work

Implementation and runtime proof were pending at claim time. Relevant commands are
the selected provider/frame checks, `npm run build`, transfer budget, text lint,
and the coordinator's browser/complete-client checks. Actual-game captures must
state exact source, fixture, viewport, quality and browser/device limits.

Before review, Johannes should explain which identity and foot point stay fixed,
why native pixels differ from gameplay geometry, and what the actual-game proof
does not establish. A different human reviews the current revision.

## Authored-source handoff

The original transparent cabin source, data-only VIS-32 mapping and measured alpha
report are implemented. [Source evidence and exact checks](../docs/evidence/VIS-05-hero/README.md)
record the unchanged bytes, native geometry and logical foot boundary. Focused
source/registry checks:2 files /6 tests passed in1.13s; build/spoiler guard,
cold-title transfer limits and text lint passed. Shared provider registration and
actual-game1280×720 /375×812 captures remain coordinated work, not a claimed pass.
