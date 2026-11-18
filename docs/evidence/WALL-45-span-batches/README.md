# WALL-45: actual paired span-batching measurements

For Johannes Franz Lang (`frcola`) and the rendering reviewers; captured by the WALL-24 QA agent for [Draft PR #338](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/338). These are actual local game screenshots and WebGL renderer counters, not concept images.

## Matched source and fixture

Before runtime: `b1755351b07e5c7e76c22de199ab5ddb70068d0c`. After runtime: `74d895b1f9bdf85cedc877a58f066dd596fe038d`. QA/helper: `250f9824937e7170ac827e3b698dd1c9273528bd`. Later evidence-only commits do not change that captured runtime.

Each pair uses the same declared local fixture: 8,000 starting coins, best wave 40, seven paid buildings, the 102-piece paid ring and one wall upgrade. The final paid state is byte-equivalent within each pair (6,660 coins); raw reports retain the complete paid positions/levels. These scenes do not reload, so their cached resource counts must be compared within the pair rather than against an earlier reloaded capture.

Desktop is 1280×720; phone is 375×812. Both use the existing low-to-high preference refresh, after which the renderer reports high quality, density 1 and native drawing size at pixel ratio 1. The reports retain the pre-refresh renderer state as well. No canvas or DOM painting/hiding is used. Cameras match within 0.01 units and zoom within 0.005. No other browser job ran concurrently.

## Actual result

Both viewport pairs measured exactly the same counters:

| Counter | Before | After | Change |
|---|---:|---:|---:|
| Logical wall links | 106 | 106 | 0 |
| Span draw meshes | 106 | 36 | −70 |
| Actual WebGL draw calls | 375 | 235 | −140 |
| GPU geometries | 330 | 260 | −70 |
| Textures | 38 | 38 | 0 |
| Page errors / external requests | 0 / 0 | 0 / 0 | 0 |

The shared transparent DoubleSide material is unchanged. Installed Three.js `WebGLRenderer.renderObject` uses back/front passes when `transparent`, `DoubleSide` and `forceSinglePass === false`, so removing 70 meshes saves 140 calls in these actual frames. The pure numeric-buffer parity tests separately prove identical positions, colors, indices and exact painter layers, including broken-span removal/restoration.

The total remains **235 calls**, above the unchanged target below 150 in `frontend/GRAPHICS.md`. This is a bounded rendering improvement, not whole-game performance acceptance. Wall-post/other sprite batching and sustained physical-device frame-time/thermal measurements remain follow-ups. No Safari, production deployment, live database or durable recovery claim is supplied by these captures.

## Reproduction

From the QA checkout at helper commit `250f9824`:

```sh
node frontend/scripts/probe-perimeter-wave.mjs /workspace/village-perimeter-work/wall-45-metric-before/frontend /workspace/village-perimeter-work/wall-45-metrics/before-desktop metrics
node frontend/scripts/probe-perimeter-wave.mjs /workspace/village-perimeter-work/wall-45/frontend /workspace/village-perimeter-work/wall-45-metrics/after-desktop metrics
node frontend/scripts/probe-perimeter-wave.mjs /workspace/village-perimeter-work/wall-45-metric-before/frontend /workspace/village-perimeter-work/wall-45-metrics/before-phone metrics-phone
node frontend/scripts/probe-perimeter-wave.mjs /workspace/village-perimeter-work/wall-45/frontend /workspace/village-perimeter-work/wall-45-metrics/after-phone metrics-phone
```

The before checkout is detached at `b1755351`; the after checkout is frozen at runtime `74d895b1`. The helper pays through the public local controllers. It does not bypass placement, quote or payment. All four probes passed. The copied reports/PNGs are untouched; [manifest.json](manifest.json) records their hashes and provenance.

## Screenshots

| Viewport | Before | After |
|---|---|---|
| Desktop | [Before desktop](before-desktop.png) | [After desktop](after-desktop.png) |
| Phone | [Before phone](before-phone.png) | [After phone](after-phone.png) |

Full reports: [before desktop](before-desktop.json), [after desktop](after-desktop.json), [before phone](before-phone.json), [after phone](after-phone.json).
