# VIS51: readable selected walls

Responsible teammate: Johannes Franz Lang (`frcola`). Issue [#417](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/417). This is a bounded follow-up to the actual reference-village capture, using composed source `5e3dd6ccb3597617e67a8b720525d3add78c3704` (including current-main snapshot `ee5677ff`).

## Problem and contract

The selected shore wall can sit behind decorative foliage. Its green corners identify the tile, but its actual artwork is hard to read. Repaint only that selected wall's existing post and incident spans in one foreground mesh below the green corners. The geometry, UVs, material, damage state and connections come from the same current wall batches; no new collider, HP state, paid position or authority is introduced.

Normal unselected batches remain unchanged. The extra mesh owns its geometry and borrows the wall material/texture. It clears on Close, Move, battle handoff, removal and disposal. A different selection, accepted wall update or artwork replacement refreshes the subset; unchanged frames allocate nothing. Missing artwork stays missing/retryable. Broken walls retain rubble rather than becoming healthy.

## Plan and evidence

1. Add an optional ID filter to the existing textured geometry builder.
2. Combine its selected subset into one mesh at painter order 199, below brackets 200/201.
3. Refresh on selection, accepted wall state and art changes; preserve resource ownership.
4. Wire current selection into the world update and clear during Move.
5. Verify exact actual quad/UV subset, states, topology, switching and resource cleanup with pure tests.
6. Coordinator captures before/after at 1280×720 and 375×812 and checks scene drawing counts without changing the under-150 target.

Implementation, pure checks and native visual acceptance are pending at this claim. No Chrome/full-suite/build check has run for this task. It stays Draft until the composed runtime is verified, Johannes completes explain-back and a different human reviews the current revision. No PR merge to main, live migration, deployment or production flag change.
