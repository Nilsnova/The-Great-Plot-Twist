# WALL-29: exterior entry for perimeter defenses

Responsible teammate: Johannes Franz Lang (`frcola`). [WALL-29 #287](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/287), native child of the Wall Gameplay epic #241. Branch: `fix/wall-29-exterior-landing`; base `569d8fda3474cb84af36af190853d1a0e02b7abf`.

## Reproduction and approved contract

The measured 102-piece closed ring can contain a fresh boarder spawn. Seed 15838, wave 8 produces five such entries on the current simulation; the first is near (-19.32, .8) inside wall_2 centered at (-18.5, 0). The existing repaired-around-an-occupant egress exception then allows that unit to move through a standing wall. That exception must remain for genuine existing occupants; new units must instead begin on the exterior side.

The trusted frozen `createWave` option `perimeterWalls: true` **requires** `pathing: true`; unsupported combinations throw at the simulation boundary. Absent/false preserves existing legacy simulation behavior and random draws. W22 owns trusted V1 snapshot transport; a browser request cannot choose this authority independently.

## Plan and boundaries

1. Commit a measured-ring regression fixture and observe the original failing selected-mode case.
2. Add a pure helper deriving a guaranteed exterior ray origin beyond all standing wall footprints plus BODY clearance.
3. Reuse the existing continuous wall intersection rule, clamping the old spawn immediately before the first live barrier crossed from outside.
4. Hook only selected perimeter-wave landing and keep crowd/fleet random draws unchanged.
5. Check the ring across deterministic seeds, gaps, rubble, live barrier changes, legitimate occupant egress and default/false compatibility.
6. Run focused checks, inspect the diff and hand over exact evidence, without rollout or merge.

No simulation walking, wall-in-way egress, captain/projectile rules, HP, prices, path-grid generation, controller/render/placement or recovery transport changes belong to this slice. W22 freezes pathing and the new option together. The helper handles valid arbitrary wall coordinates; a fixed extra radial offset is insufficient because a legal coastal wall can extend into the surf.

## Required evidence and limits

The measured legacy defect must reproduce before implementation. Selected mode must have no newly spawned or normally walking boarder inside a standing ring piece; blocked exterior units should hack and progress when a breach opens. Real gaps and zero-health pieces are not barriers. Same seed/layout/inputs must replay exactly. An existing occupant can leave a restored footprint under the unchanged shared egress rule.

Simulation fixtures are not paid persisted layouts, production, browser screenshots or whole-perimeter rollout proof. The selected option changes entry geometry, so it needs its frozen compatibility path and human review before activation. No new package, migration application, flag activation, deployment or merge.
