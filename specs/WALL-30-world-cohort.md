# WALL-30: paid perimeter pieces in the village world

For Johannes Franz Lang (`frcola`), tracking [WALL-30 #292](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/292). A bounded dependent world slice on WALL-03/WALL-08/WALL-31; it does not grant purchase or placement authority.

Recognize only paid, finite positioned new wall rows in the existing island render/picking/zone/recovery lifecycle. Do not create116empty sites or mutate the static legacy/Pirate Point tables. Preserve actual coordinates, level/damage visuals, world connections and borrowed textures. Remove demolished/newly absent geometry, dispose owned resources, retain camera canceled-pick and builder preview hooks during integration. Hide D056 lane glow for accepted perimeter Move previews while retaining legacy behavior.

Focused world/cohort/placement tests and actual integrated desktop/phone captures are required. Keep runtime changes small; no package, env, migration, production activation or merge. Broader recovery, combat and art acceptance remain separate tasks.
