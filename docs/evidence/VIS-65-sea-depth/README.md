# VIS65: sea depth and surface lighting

Presentation follow-up for Johannes Franz Lang (`frcola`), used by the visual review coordinator and a different human reviewer. Tracks [issue #442](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/442).

## Agreed scope

The existing sea looks flatter than the approved pirate-island reference. Refine the existing shader's broad depth, directional surface lighting and shallow-water reflections. Preserve the same coast distance field, projection, mesh, material, shared weather/clock, low-quality controls and resource ownership. No gameplay, land, dependency, service or texture change is planned.

The task is stacked on VIS61 source `1bce4309`, which retains current main `48aee0e7` and prior review `2a2e9651`.

## Verification status

Claim only: no source change or check has been run yet. Existing coast, clock, quality, beam-sharing and disposal assertions will remain unchanged. Root coordinates actual shader compilation and desktop/phone captures, including an intermediate screenshot. Pure checks do not establish visual acceptance or sustained performance.

All work remains Draft. No PR merge, deployment or live database work is authorized by this task.
