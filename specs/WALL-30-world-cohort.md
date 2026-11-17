# WALL-30: paid perimeter pieces in the village world

For Johannes Franz Lang (`frcola`), tracking [WALL-30 #292](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/292). A bounded dependent world slice on WALL-03/WALL-08/WALL-31; it does not grant purchase or placement authority.

Recognize only paid, finite positioned new wall rows in the existing island render/picking/zone/recovery lifecycle. Do not create 116 empty sites or mutate the static legacy/Pirate Point tables. Preserve actual coordinates, level/damage visuals, world connections and borrowed textures. Remove demolished/newly absent geometry, dispose owned resources, retain camera canceled-pick and builder preview hooks during integration. Hide D056 lane glow for accepted perimeter Move previews while retaining legacy behavior.

Focused world/cohort/placement tests and actual integrated desktop/phone captures are required. Keep runtime changes small; no package, env, migration, production activation or merge. Broader recovery, combat and art acceptance remain separate tasks.

## Implementation and evidence

The world keeps its static legacy/Pirate Point table and appends only offered paid positioned inventory rows. Added walls get actual stand-ins or loaded level/ruin art, picking, zones, recovery anchors and joins; they never allocate empty marker sets. Removal and world disposal release their own geometry/material exactly once while retaining borrowed family textures. The existing asset pipeline remains unchanged.

V1 zero-health ruins now also open between-wave joins, with positive restoration closing the real contact again. Legacy lane glow remains; an accepted perimeter Move preview hides that misleading restriction. Camera cancellation and builder preview hooks remain owned by their separate drafts and must be preserved in the combined branch.

Focused command: `npm test -- --maxWorkers=1 tests/island/world-cohort.test.js tests/island/world-art.test.js tests/island/wall-connections.test.js tests/island/wall-cohort.test.js tests/island/structure-recovery-world.test.js`. Initial result 54 tests / 5 files passed, 1.84s; final run adds a direct still-pending stand-in disposal assertion. Canvas painting and indicator drawing are stubbed only in the new fast geometry/lifecycle tests; actual rendering, UI captures, build/budget and broader checks belong to root's coordinated integration lane. No actual browser/device/production result is claimed here.

## Explain-back

I extended the current world list only with paid pieces that have real coordinates. New inventory does not create 116 glowing sites. The same level art and connection code can then draw the larger wall set. When a piece disappears, I free its own geometry and material but keep the shared texture available to other walls.

1. Why does knowing wall_128's identity not mean it has a world position?
2. Why must a removed piece not dispose the wall family's shared texture?
3. Why must zero-health connection geometry agree with the ruin artwork?
