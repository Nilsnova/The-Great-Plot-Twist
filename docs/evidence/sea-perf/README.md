# Sea frame cost (perf/sea, 2026-11-18)

**Change.** The sea (`frontend/src/world/water.js`) used to be one 400 × 300 plane over the whole view. Its fragment shader discards every pixel the coast field calls land, but a discarded pixel still runs the whole shader first, and on the home island the land fills most of the screen. The sea now draws a **sea outline** instead: 1 × 1 backdrop-unit cells, merged into runs per row, kept only when at least one non-land coast-field texel is within the bilinear lookup's reach (one texel of margin), plus a frame around the backdrop out to the old plane. It is rebuilt with the coast field on every place change (`setCoast`). Without a coast it falls back to the full plane. The shader, colours, quality levels, reduced motion and CSP are unchanged. 174 triangles replace 2. Unit test: `tests/art/coast-water.test.js` checks that every point the shader keeps on a sheared backdrop is covered and that most inland points are skipped.

**Visual cost: none.** Every pixel the old plane drew is still drawn by the same shader. On one frozen frame, rendered with each geometry, the only differences are float rounding of the interpolated world position (the noise hashes amplify the last bit). They are the same size as moving the old plane's corners by 1/1000 unit ([pixel-diff.log](probe-logs/pixel-diff.log)):

| Frozen frame (drawing buffer) | Outline vs full plane: pixels differing / > 8 levels | Control, full plane vs nudged full plane |
|---|---:|---:|
| Desktop between waves (910 × 569) | 4,489 / 10 (0.9 % / 0.002 %) | 3,503 / 3 |
| Desktop in a wave | 20,596 / 29 | 38,587 / 120 |
| Phone between waves (337 × 730) | 4,302 / 0 | 3,613 / 0 |
| Phone in a wave (281 × 609) | 9,205 / 20 | 1,249 / 0 |

## Frame cost

Software WebGL (SwiftShader) in a shared 4-core container (load average 4–9 from other sessions). Desktop 1280 × 800 at DPR 2 and phone 375 × 812 at DPR 3; the frame budget runs at density 0.5–0.75 here, as on main. Times swing by up to 2× between runs, so three methods:

**1. Render time on a frozen frame** (the same scene rendered 8 times per variant, variants alternating, 18 samples each, 3 sessions; [render-bench.log](probe-logs/render-bench.log)). This is the cleanest measure of what the sea costs.

| Median ms per render | Full plane (before) | Sea outline (after) | Sea hidden (floor) | Outline, detail off |
|---|---:|---:|---:|---:|
| Desktop between waves | 55.8 | **35.4** | 30.9 | 33.5 |
| Desktop in a wave | 53.5 | **46.5** | 29.1 | 46.0 |
| Phone between waves | 41.1 | **27.9** | 22.1 | 28.3 |
| Phone in a wave | 21.8 | **19.2** | 9.8 | 16.1 |

Note: "detail off" is the outline with `uDetail = 0` (6 samples, one session). It saves 0–2 ms against detail on (3 ms on the phone in a wave), in line with the earlier `sea-aniso-experiments.log`: in software WebGL the per-pixel noise count is not what costs, the number of sea pixels is.

**2. Live frame interval, A/B in one session** (full plane / outline / sea hidden swapped every 3 s, 6 rounds × 2 sessions; [frame-interval-ab.log](probe-logs/frame-interval-ab.log)).

| Median frame ms | Full plane | Sea outline | Sea hidden |
|---|---:|---:|---:|
| Desktop between waves | 66.5 | **42.9** | 40.2 |
| Desktop in a wave | 100.2 | **62.2** | 44.6 |
| Phone between waves | 31.9 | **24.0** | 19.2 |
| Phone in a wave | 31.4 | 39.1 | 29.0 |

The phone wave row follows the wave's own state (draw calls 62–73 between rounds; sea hidden ranges 17–38 ms), not the sea: the island is small at that zoom, and method 1 shows the outline slightly cheaper there.

**3. Whole capture runs** (`scripts/capture-home-island-waves.mjs`, alternating base `db573347` and this branch, 5 runs each; [capture-*.log](probe-logs/), order and load in [run-order-and-load.txt](probe-logs/run-order-and-load.txt)).

| Median frame ms (runs) | Before (`db573347`) | After |
|---|---:|---:|
| Desktop between waves | 64 (64, 60.6, 61.2, 103.3, 66.5) | 69 (43.3, 71.9, 44.6, 69, 72.7) |
| Desktop in a wave | 92.5 (87.3, 89, 92.5, 139.4, 122.3) | 82.9 (81, 145, 82.7, 82.9, 140.8) |
| Phone between waves | 36.7 | 32.7 |
| Phone in a wave | 48.3 | 41.2 |

Runs 4–5 ran at load average above 7 and the desktop rows split into a fast and a slow cluster on both sides; methods 1 and 2 control for that. Pre-art main measured 46–50 ms between waves and 75–109 ms in a wave by this method ([franz-1118/size](../franz-1118/size/README.md)).

**Result.** Between waves the desktop is back to (below) pre-art level: the sea now costs 2–5 ms over no sea at all, against 25 ms before. In a wave, where more than half the view is open sea, the sea's cost on the desktop drops by about 30 % on a frozen frame (24 to 17 ms) and by about two thirds in the live A/B (56 to 18 ms). Draw calls are unchanged (112 between, 67–75 in a wave).

## Options evaluated and not taken

- **Baking static terms / fewer octaves / noise texture / mediump:** almost every sea term moves with time, so little is static, and switching the whole detail branch off (6 of the 9 noise lookups) does not change software-WebGL frame time, so a lighter shader cannot be shown to help here, while it would change the look. Not done.
- **Half-resolution sea:** would cut the in-wave remainder, but the foam lines, caustic contours and coast edge are 1–2 px antialiased lines that would blur. Not done; it remains the next lever if the in-wave sea needs to get cheaper.
- **Detail off when zoomed out:** no measurable gain (above). The low quality setting still switches it off, as before.
- **Wave atlas (2080 × 3315, about 35 MiB with mips):** it holds every wave sprite (ships, boarders, every tower kind, level, firing and damage frame) because towers can be built, upgraded and broken during a wave; per-wave subsets would mean rebuilding the atlas mid-battle. It is mipmapped, so its size does not drive frame time, and it already fits its 40 MiB budget (`ATLAS_BUDGET`). Unchanged.

## Files

- `*-whole.png`: one frozen frame, the old full plane (left) and the outline (right), desktop and phone, between waves and in a wave.
- `*-wave-shoreline-2x.png`: a shoreline crop (cliff foot, foam, shallows) of the same frames, 2× nearest neighbour.
- `*-difference-x16.png`: per-channel difference × 16 (black = identical).
- `probe-logs/sea-ab-bench.mjs`: the script behind methods 1–2 and the frames (run from `frontend/`).
