# Village art download size (perf/art-size)

Before = `840549a5` (Franz integration, PNG art). After = `687f516a` (WebP shipping transport, see [VIS-30 README](../../VIS-30-world-art/README.md#lossy-webp-shipping-transport-perfart-size-2026-11-18) and [ship-report.json](../../VIS-30-world-art/ship-report.json)). Main = `9f8468ab` (before the integration), probe only.

Captured with `node scripts/capture-home-island-waves.mjs` (fake API, production flags; desktop 1280×800 at DPR 2, phone 375×812 at DPR 3), software WebGL in a shared 4-core container (load average 4–9 from other sessions).

| | Main | Before | After |
|---|---:|---:|---:|
| World art fetched on the home island (bytes) | 0 | 12,366,289 desktop / 12,950,770 phone | 2,715,772 desktop / 2,868,430 phone |
| World art in the build (bytes) | 0 | 12,950,770 | 2,868,430 |
| All images in the build (`report-budget.js`) | 826 KB | 13,776,877 | 3,694,537 |
| Build output (`dist`) | 6.26 MB | 19,313,055 | 9,233,729 |
| Draw calls, desktop between / wave | 130 / 70 | 112 / 70–73 | 112 / 67–71 |
| GPU texture estimate (probe, with mips), between / wave | – | 30.4 / 58.3 MiB | 30.4 / 58.3 MiB |
| Frame ms desktop between waves (3 runs; median) | 50, 46 | 111, 109, 64 (109) | 98, 65, 99 (98) |
| Frame ms desktop in a wave | 109, 75 | 147, 164, 147 (147) | 88, 89, 150 (89) |
| Frame ms phone between waves | 38, 35 | 42, 45, 35 (42) | 39, 36, 48 (39) |
| Frame ms phone in a wave | 40, 29 | 49, 35, 46 (46) | 33, 32, 51 (33) |

Main's build and image sizes are the coordinator's earlier figures; everything else is measured here. Frame times swing by up to 2× between identical runs on this machine, so they do not show a difference between before and after. None was expected: the GPU textures are re-rasterised at the same runtime density from either file, so texture count, size and draw calls are unchanged.

Frame time is not back to main's level. In `probe-logs/sea-aniso-experiments.log` (pixel ratio fixed at 0.75), hiding the sea plane cut the desktop between-wave frame from 70–83 to 42 ms. Switching off the sea's detail branch or texture anisotropy made no repeatable difference. The remaining gap to main comes from the scene and sea work in the integration, not from the art files.

Real-hardware display size (frame budget not scaled down): the home island draws about 4.0 device px per logical px at zoom 1 on the desktop and 4.4 on the phone, and up to twice that at zoom 2. That matches the 4× masters, so they are not downscaled. In software WebGL the frame budget drops to 0.5, so the probe's `devicePxPerLogicalPx` is about 1.6 there.

Files: `before-840549a5-*.png`, `after-687f516a-*.png` (between waves and during a wave, desktop and phone); `sheet-crop-png-vs-webp-houses-2x.png` (a master crop beside its WebP, 2× nearest-neighbour); `probe-logs/` (per-run metrics and texture probes).
