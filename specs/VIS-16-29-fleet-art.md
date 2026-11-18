# Fleet materials and combat effects

Johannes Franz Lang (`frcola`) is the responsible teammate for the combined review of [VIS-16](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/221) and [VIS-29](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/234).

## Art and runtime contracts

[fleet.js](../frontend/src/art/fleet.js) paints original cloth folds, layered wood, gunboat metal and bow foam within the existing sloop, brig, flagship, warship and gunboat silhouettes. Each hull retains three frames. The existing anchor is measured upward from the bottom to the waterline. The mast and hull bob around it while the foam maintains contact with the water.

The smoke uses a translucent fill across the joined lobes. The muzzle and impact frames retain a small bright center with warmer edges so the effect reads over both water and land. The new splash crests meet the established waterline at every phase.

The wave renderer still applies the ship’s real health tint, fire, slowdown, gunboat jam and targeting cues. It chooses effect frames from existing combat events and applies the current quality and motion settings. The session’s simulation remains the authority for hit resolution. The same named frames are rasterized once for each atlas density.

## Verification

The [native Chrome raster tests](../frontend/tests/art/combat-effect-frames.test.js) check the 12 effect frames and all 15 fleet frames at 1.5×, 2× and 4×. They verify water contact, frame bounds, the narrow gunboat finial fringe, and the smoke’s descending peak opacity. The [test map](../docs/TEST-MAP.md) lists the related gameplay checks. Actual game review uses matching desktop and phone-width browser captures. The sprite sheet is a separate material and silhouette check.
