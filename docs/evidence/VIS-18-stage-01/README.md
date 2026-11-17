# VIS-18 stage one: actual materials, visual acceptance rejected

For Johannes Franz Lang (`frcola`), VIS-18 #223 / Draft #357. Actual Chromium
runtime `54c7f6137c94a250a395c6fb86319b1a8ddd8a1b`; unedited captures and
[report](report.json), with [file hashes](hashes.json). These are game renders,
not generated concepts.

| View | Close entry | Complete-island Fit |
|---|---|---|
| 1280×720 | [Entry](materials-entry-1280x720.png) | [Fit](materials-fit-1280x720.png) |
| 375×812 | [Entry](materials-entry-375x812.png) | [Fit](materials-fit-375x812.png) |

## Functional result

The declared progressed local fake starts8000coins/best40, pays for seven
ordinary buildings and102walls in four actual quoted runs, then upgrades one
wall for20coins. It ends with6660coins and the same saved wall coordinates.
Long paid preparation uses public controllers; entry/Fit/Tab/drag and actual
remote building picking use normal controls. No paid saves or successful
outcomes are injected after setup.

Both viewports passed the entry, drag, Fit, held Tab, remote ground-pick,
unchanged-wallet/captain and44px/readable-text controls checks. Both report0page
exceptions/external requests, with declared offline-service console diagnostics.
Actual scene meshes identify the PNG hero/houses/nature/watchtower source.
Each viewport independently passed12 shared world/atlas PNG cases at requested
low1.5/high2/high4 density, **maximum pixel delta0**. This is source/renderer
parity, not sustained performance or final art acceptance.

## Visual result: rejected as the final reference appearance

The rich asset materials survive the real renderer. The scene still fails the
approved reference composition: absolute Work zoom1 crops too much, the old Fit
is too small, oversized flat milestones/guide graphics dominate, the water and
walls remain visibly from the old style, and static bell/services are not yet
refreshed to their registered sources. House source margins also make the bodies
too small. Neither this functional pass nor a generated source asset closes
VIS-31.

Followups: VIS-34 coherent forward/inverse display projection and measured
composition, VIS-35 existing core/milestone presentation, VIS-18 static/error
refresh, VIS-14/27 connected wall material/ghosts, VIS-23 natural water, BASE-06
selection dock and bounded source-fit fixes. All remain unmerged. The earlier
D063 .72-presentation checkpoint is historical; D064 records the coordinated
presentation revision without changing saved logical positions or simulation.

Command from the coordinator integration checkout:

```sh
node frontend/scripts/capture-village-composition.mjs \
  /workspace/reference-village-work/integration/frontend \
  /workspace/reference-village-work/stage-01-materials materials
```

Actual exit0; no live backend, production durability, physical device/Safari,
full reference match or rollout is established by this fixture.
