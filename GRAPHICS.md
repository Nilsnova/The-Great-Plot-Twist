# Lighthouse Isle graphics foundation

An original, procedural, low-poly island for The Great Plot Twist. Plain JavaScript, Three.js and Vite; one local explorer; no story engine or external service. The supplied task is saved as `20261105_Graphics-Brief.txt`. Work belongs to Nils on `feat/graphics-foundation`; local commits only, awaiting human review.

## Run

Use Node **22.12+, 24.x or 26+** (the exact supported ranges are in `package.json`). From this repository root:

```sh
npm install
npm run dev
```

Open the local address Vite prints. Click **Step ashore** for a four-second camera flight; **Esc** skips it. Reduced-motion preferences skip the flight automatically. To review the static build, run `npm run build` and then `npm run preview`. `dist/` contains the deployable files; no deployment has been made. Relative asset URLs support hosting below a subfolder.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Walk relative to the camera |
| Shift | Run |
| Left mouse drag | Orbit camera |
| Mouse wheel | Zoom, within safe limits |
| E | Emit the active interaction once per key press |
| T | Toggle accelerated time, 0.8 game hours per second |
| 1 / 2 / 3 / 4 | Clear / overcast / storm / fog |
| Bottom-right settings button | Hour slider, weather presets and high/low quality |
| Esc | Skip arrival, close settings and return keyboard focus to the game |

The clock normally advances 0.003 game hours per real second. The game pauses simulation when the tab is hidden. Form controls keep their own keyboard input; closing settings restores game focus. The cottage has a real doorway. Its roof is hidden inside so the player can see and approach the writing desk. The pier is walkable; the surrounding sea is blocked.

## Integration contracts

World coordinates use +Y up, with X/Z on the ground. Units are arbitrary metres. Land, paths, foundations and player height use the same `terrainHeight(x, z)`. Static art is batched by material, so semantic gameplay locations use plain data rather than mesh names.

```js
import { on } from './src/core/events.js';
const unsubscribe = on('interact', event => {
  // event is exactly { type: 'interact', id: 'desk' }, for example.
  // Connect the story engine here. This foundation supplies no story outcome.
});
// Call unsubscribe() when that story listener is no longer needed.
```

`emit(event)` is also exported. `src/world/zones.js` exports `zones` and the pure `findZone({ x, y, z }, optionalZones)`, returning `cottage`, `desk`, `shore`, `tower_door` or `null`. A height check rejects players on a different floor; overlapping zones use normalised distance. The desk trigger is on its accessible side, not inside the furniture.

```js
import { setWeather, getWeather } from './src/world/weather.js';
setWeather({ rain: 0.8, wind: 0.6 });
// cloudCover and fog keep their existing values.
const snapshot = getWeather();
```

All four weather fields are numbers from 0 to 1. Finite inputs are clamped; missing, unknown and non-finite values are ignored. `getWeather` and `setWeather` return copies. Sky, light, rain, fog, waves and boat movement read this shared state; no API is contacted. `presets` and the pure `clampWeather(previous, changes)` are exported too.

`src/world/lighthouse.js` exports plain named points `stairwell` and `lamp_room`, also available in `anchors`. The camera rig from `createCamera(input, obstacles)` exposes `pause()` and `start(true)` so a later cutscene can pause follow, move its `camera` to an anchor, choose a look target, and resume immediately. Anchors do not teleport the player; the lighthouse interior is for later story work.

`createCharacter()` in `src/player/character.js` returns `{ group, animate(delta, speed) }`. A remote-player package can create another model, add `group` to the scene, update its transform, and animate it from received movement. Do not attach the local controller or local input to remote characters. Their added rendering cost has not been benchmarked.

Quality defaults to `settings.quality` in `src/config.js`. Low disables shadows, reduces rain to 350 possible points, changes the water grid from 64 to 40 segments, and caps pixel ratio at 1. High allows 900 rain points and pixel ratio up to 1.25, chosen after Retina profiling to meet the 60 FPS target on this integrated GPU. Runtime changes go through the `quality(name)` wiring in `main.js`; future settings UI should call that function rather than just change the label.

## File map and changes

Every source file begins with its purpose. Application JavaScript files are under 150 lines. Generated lockfiles and build output are not intended for line-by-line teaching.

| File | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json` | Run/test commands, dependency versions and reproducible npm installation |
| `index.html` | Accessible HTML entry point, local module and favicon |
| `vite.config.js` | Relative static asset paths and Vitest test discovery |
| `.gitignore` | Exclude dependencies, static builds, local environment files and macOS metadata |
| `public/favicon.svg` | Original small lighthouse icon |
| `src/main.js` | Connect modules, consume debug keys, update/render and clean up on reload |
| `src/config.js` | Palette, layout, player dimensions, time and quality profiles |
| `src/core/math.js` | Pure sun position, interpolation, clamping and seeded randomness |
| `src/core/renderer.js` | WebGL renderer, colour output, resize and quality changes |
| `src/core/loop.js` | Frame timing, bounded simulation delta and hidden-tab pause |
| `src/core/input.js` | Keys, one-press actions, pointer drag/zoom and blur cleanup |
| `src/core/events.js` | Tiny subscribe/emit/unsubscribe event bus |
| `src/world/terrain.js` | Pure island heights, level building pads and vertex-coloured terrain |
| `src/world/island.js` | Island assembly, material batching, colliders and cottage roof cutaway |
| `src/world/primitives.js` | Readable mesh/box/cylinder/roof/rail helpers and shared materials |
| `src/world/paths.js` | Sand path ribbon following terrain up to the tower |
| `src/world/scenery.js` | Deterministic trees, rocks, flowers and cliff fence |
| `src/world/buildings.js` | Enterable cottage, writing desk, boathouse and wall/furniture colliders |
| `src/world/lighthouse.js` | Striped tower, iron door, lantern, halo, sweep and named anchors |
| `src/world/beam.js` | One soft-edged, fading beam cone; no post-processing |
| `src/world/water.js` | Vertex-displaced low-poly sea, calm far sea and quality-dependent grid |
| `src/world/boat.js` | Jetty, open rowing boat, oar and wind-dependent bobbing |
| `src/world/sky.js` | Gradient sky, sun disc, stars, fog and day/night lighting |
| `src/world/weather.js` | Public weather state, clamping, presets and rain particles |
| `src/world/zones.js` | Exact four story ids and pure zone selection |
| `src/player/character.js` | Original primitive explorer and walking animation |
| `src/player/collision.js` | Shore/pier safety, circle/box tests and wall sliding |
| `src/player/controller.js` | Camera-relative walking/running, grounding and turning |
| `src/player/camera.js` | Arrival, orbit/follow/zoom, terrain clearance and obstacle raycast |
| `src/ui/hud.js`, `src/ui/styles.css` | Arrival card, controls, interaction prompt, atmosphere settings and dev-only FPS |
| `tests/world.test.js` | Terrain, sun, weather, interactions, anchors, shore/wall safety and actual cottage access |
| `tests/input.test.js` | One E event while held, opposing movement keys, blur and listener cleanup |
| `scripts/check-browser.js` | Installed-Chrome interaction/quality/performance smoke checks and screenshots |
| `scripts/check-production.js` | Built-site check, UI controls, keyboard focus and removal of dev-only features |
| `ASSETS.md` | Original asset provenance and dependency licences |
| `captures/20261105_*.png` | Dusk, daylight, exploration, midnight, storm and Retina review screenshots |
| `captures/20261105_*-Checks.json` | Browser, production and Retina measurements |

## Verification and measured performance

`npm test` passed **14 tests in 2 files**. `npm run build` passed. `npm run test:browser` runs a dev server on 5174 and checks real controls, all four E events, weather/quality modes, render budgets, settings focus and absence of external requests/errors. `npm run test:production` rebuilds and checks the static preview on 4175; production contains no FPS element or dev inspection global. Browser scripts use installed Chrome, not a downloaded browser; set `CHROME_PATH` on other systems.

Measured on 5 November 2026, headless Chrome 157 on this Intel i5-8259U Mac with Iris Plus 655 / ANGLE Metal. At **1440 × 900, DPR 1**, the final sampled dusk, midnight, storm, fog and noon overview scenes reached **57–60 FPS**, with **up to 89 draw calls and 30,428 submitted triangles**, including the shadow pass. Low sampled **59–60 FPS**, at **up to 49 calls and approximately 20,600 triangles**. These are short, warmed-up samples, not a sustained hardware benchmark; first-start samples were slower before batching/warm-up.

At device DPR 2, an initial profiling sample at pixel ratio 1.5 measured 55 FPS. The final high profile at **1.25** measured **60 FPS with shadows enabled**; low at **1** also measured **60 FPS**. The high cap remains within the task's maximum of 1.5. Choose low on slower laptops. Evidence is in the JSON files under `captures/`; full-island overview samples exercise the major art together, but other viewpoints can change visible counts. Frame rate on other hardware remains unverified.

Budgets are **<150,000 triangles**, **<150 draw calls**, pixel ratio **≤1.5**, one shadow-casting directional light with a **2048²** map, and no large textures. Night uses that same directional light as cool moonlight; the small lantern point light casts no shadows. Rain/stars use one points draw each; static primitives are merged by material. There is no bloom/composer/render-target chain.

## Limits and next teammate work

- Tested visually and automatically in local Chrome only. Safari, Firefox, other laptops, long sessions and multiplayer loads remain unverified. Keyboard/mouse gameplay requires a desktop; touch movement is not implemented.
- Art is deliberately primitive and editable. Collisions use simple X/Z boxes/circles, not a physics engine. No swimming, jumping, tower stair climbing, sailing or traversable larger world is implemented. The cliff fence is decorative.
- Beam scattering and halo are visual approximations. Clouds darken/tint the sky and lighting; there is no volumetric cloud simulation or real weather feed. Rain uses points rather than textured streaks.
- The production build currently reports a chunk-size advisory: the main JavaScript bundle includes Three.js, about **603 kB minified / 156 kB gzip**. Static loading succeeds; no CDN is used. Consider lazy loading future optional packages as they are added.
- The story teammate should wire the four `interact` ids first. The weather teammate can call `setWeather`; the multiplayer teammate can reuse `createCharacter`. Login, multiplayer, story outcomes, external APIs, analytics and AI companions are intentionally outside this foundation.
- No team-owned README, AGENTS, CONTRIBUTING, ROADMAP, `docs/` or `.github/` file was edited. Human review and Nils' push are the next repository steps; nothing was pushed, merged or published.

## Explain the render loop in three sentences

The browser requests a frame, and the loop measures how much time has passed, with a small cap so a slow frame cannot cause a large simulation jump. Main updates input, player movement and collisions, time, weather, waves, the boat, lighthouse, camera and interface. Three.js then draws the updated scene through the camera, and the browser requests the next frame.
