# VIS-23: actual nautical-water component evidence

For Johannes Franz Lang (`frcola`); [issue #228](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/228),
[Draft #358](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/358).

## What changed

The existing single water shader now uses a deeper teal palette, short
domain-warped broken ripples, restrained near-shore caustics, broken surf and soft
sun flecks. The old long parallel marks and star-shaped glints are removed.
No extra image, water mesh, texture or draw is introduced by this slice.

The alpha-derived decorative coast field, missing/unreadable-place fallback,
shared lighthouse/weather uniforms, boss sea pace and reduced-motion time-zero
route remain. Low quality skips the new material branch and secondary moving
surf; its ordinary broad depth shading remains, so the entire low-quality sea
is not claimed to be motionless.

## Exact source and comparison

The v2 GPU source is [`5837335faa5122058a2105644bb6af1d40b58580`](https://github.com/Nilsnova/The-Great-Plot-Twist/tree/5837335faa5122058a2105644bb6af1d40b58580),
pinned on `review/vis-23-proof-5837335f`. It composes VIS-32's original provider,
VIS-20's verified 3.2 facade and VIS-23's corrected ripple style `672e3896`.
Its later QA envelope field does not change application rendering.

**This is before VIS-34's new presentation projection.** The report records the
actual backdrop matrix and envelope. The new projection/coast inverse requires
a separate combined recheck; this evidence does not claim that later source ran.

The Before frame uses the exact sea fragment/palette extracted from `9dc1bea5`,
with the **same candidate terrain, camera, weather and time** as After. It is a
water-only software comparison, not a full-old-game screenshot. All PNGs are
untouched Playwright captures of actual Three.js components with visible fixture
labels. There are no buildings, players or game transport in this fixture.

| Native viewport | Previous sea / same terrain | Corrected sea / same terrain |
|---|---|---|
| 1280×720 | [Before](before-1280x720.png) | [After](after-1280x720.png) |
| 375×812 | [Before](before-375x812.png) | [After](after-375x812.png) |

| Existing mode | Desktop | Phone |
|---|---|---|
| Low quality | [Low](low-1280x720.png) | [Low](low-375x812.png) |
| Reduced motion | [Reduced](reduced-1280x720.png) | [Reduced](reduced-375x812.png) |

The first technically passing v1 looked like regular pale dots and obvious
caustic webs. It was **rejected visually**, then corrected with the v2 style.
Its [historical report](historical-rejected-v1-report.json) and
[rejected image](historical-rejected-v1-after-1280x720.png) are diagnostic history,
not accepted appearance. The v2 has no regular standing-dot lattice and is ready
for a whole-scene comparison; final reference-quality acceptance remains open.

## Executed checks

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/art/coast-water.test.js tests/g20-weather-wiring.test.js tests/weather.test.js
```

Final corrected-style result: **3 files passed, 71 tests passed in 867ms**, exit 0.
The earlier 1.02s result covers the previous style; these overlapping counts are
not added. Cases cover distance scaling/row orientation, translated/current-place
mask, missing/unreadable fallback, beam/weather/quality reference ownership,
existing paced/reduced-motion clock and water resource disposal.

From the pinned composed checkout's repository root:

```sh
node frontend/scripts/check-nautical-water.mjs frontend <output-directory>
```

Actual result: `PASS: actual desktop/phone sea shaders, coast masking/fallback, low/reduced modes and unchanged2draw scene;0page errors/external requests`.

[Raw report](report.json) and [capture hashes](capture-hashes.json) preserve:

- Successful actual GPU compilation at both required sizes; no shader errors,
  page exceptions or external requests.
- No sampled water inside opaque central ground or four checked rock-face
  points; missing-coast fallback fills the open sea without a ghost rectangle.
- High-quality pixels change with the supplied time; repeated reduced-motion
  time-zero frames have identical pixel hashes at both sizes.
- Low quality is actually compiled, rendered and captured. Its fixed-pose v1/v2
  hashes match exactly while the high style changes. The test does not claim all
  low-quality shading is static or independently pixel-prove every effect branch.
- Both versions/modes retain **2 draws, 2 geometries and 2 textures** in this
  two-component scene. Those are not whole-village performance measurements.

The backend is Chromium WebGL2 via ANGLE/Vulkan **SwiftShader**. The eight-sample
GPU-synchronized wall timings are retained as debug observations; their coarse
timer resolution and static component workload do not establish a speedup,
sustained FPS, real-device acceptance or the whole-scene under-150-call gate.

Standalone VIS-23 `npm run build` and `node scripts/report-budget.js --check`
both exited0. The build/spoiler guard passed; cold-title JavaScript remains
18,698/21,080 bytes, CSS 9,410/12,000 bytes and title-image transfer 0. The combined
new-art candidate has its own source/budget checks.

## Remaining

The new VIS-34 presentation/coast inverse, complete game composition, actual
captain/hull/shore interactions, rainy/night visual review, repeated travel,
full client/accessibility/demo/overlap checks and physical devices/Safari remain
with root's combined scene. No full-game or final reference match is inferred
from these component pictures. Drafts remain unmerged; production is unchanged.
