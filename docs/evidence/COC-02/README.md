# COC-02 camera evidence

This folder records the current-base fit view. Unit evidence is in
[the specification](../../../specs/COC-02-village-overview.md).

**Verified:** eight camera tests passed in 516 ms. Four real game screenshots
were generated and visually inspected at 1280 × 720 and 375 × 812. The initial
fixed-padding capture exposed an actual overlay problem; the final fit uses the
free region above the management/caption area and below the phone quest strip.

| View | Before fit | After fit |
|---|---|---|
| Desktop | [before](before-1280x720.png) | [after](after-1280x720.png) |
| Phone | [before](before-375x812.png) | [after](after-375x812.png) |

The fixture uses the real application renderer and existing local fake island
API. It gives a returning player a recorded budget/wave unlock, then uses normal
build/upgrade calls for the same 19 buildings. This is not production login,
earned live progression or a database migration. Before uses the five-feature
management preview without the camera slice; after adds this camera slice.
Other visible improvements in the scene belong to their own draft PRs.

Commands, from this branch's frontend directory:

```sh
node scripts/capture-village-overview.mjs /workspace/coc-overnight/camera-baseline/frontend docs/evidence/COC-02 before
node scripts/capture-village-overview.mjs /workspace/coc-overnight/preview/frontend docs/evidence/COC-02 after
```

Both runs verified two viewports, an intact WebGL context, positive draw calls,
zero page errors and zero external requests. The after run additionally verifies
that sampled current land and a tall-building point clear the actual HUD/bar
bounds, a distant tower remains on screen and pickable, the Exit button wins a
real hit-test, and normal captain framing returns after exit.

Reports: [before](report-before.json), [after](report-after.json). Desktop after:
land y=118.99–442.61, safe y=80–487.91. Phone after: see the exact measured bounds
in the JSON. These are actual renderer measurements, not concept images.

Broader build/budget/full-suite/UI checks are still pending at this commit. No
merge, production, Safari or physical-device result is claimed.
