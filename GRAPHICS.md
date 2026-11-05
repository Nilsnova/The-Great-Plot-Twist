# Lighthouse Isle illustrated graphics

The active presentation is an original painted-paper island, selected by Nils on 5 November 2026 with Carto as the visual reference. A fixed orthographic view, editable SVG drawings, a small palette and sparse animation replace the earlier low-poly diorama. Three.js, Vite and plain JavaScript remain; no new dependency was added. The earlier implementation and screenshots remain in Git history and the unprefixed captures.

## Run and review

Use Node 22.12+, 24.x or 26+ as specified in `package.json`. From this repository root, run `npm install`, then `npm run dev`, and open the address Vite prints. Click **Step ashore**. `npm run build` creates the static site in `dist/`; `npm run preview` serves it. Nothing has been deployed or pushed.

`/art/board.html` is a separate local asset review sheet. The latest screenshots and JSON evidence are named `captures/20261105_Illustrated-*`. `Arrival`, `Daylight`, `Dusk`, `Midnight`, `Storm`, `Exploration` and `Retina` are verification captures; `Asset-Study`, `Map-First`, `Play-First`, `Map-Review` and `Play-Review` record visual checkpoints.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk north, south, west and east on the map |
| Shift | Run, without a diagonal speed boost |
| E | Investigate the active location, once per key press |
| Mouse wheel | Zoom; the illustrated viewing angle stays fixed |
| T | Toggle accelerated time |
| 1 / 2 / 3 / 4 | Clear / overcast / storm / fog |
| Bottom-right settings | Hour slider, weather and quality |
| Esc | Skip an active arrival, close settings and restore game focus |

Escape before starting keeps the overview intact. The four-second arrival is skipped for reduced-motion preferences. The camera leaves headroom for landmarks in normal play and moves closer inside the cottage. The roof changes to a drawn interior when the player crosses the doorway. Trees fade when their canopies would hide the player. Only the pier, not the surrounding sea, is walkable. There is no orbit control.

## Art system

All 20 SVG assets are original project drawings, about 25 kB combined. Nineteen are loaded locally as shared textures; the twentieth is a small paper-grain tile for the interface. The largest drawing rasterises at 576 pixels on its longest side. There are no downloaded game assets, external fonts, texture packs, CDN requests, bloom, 3D shadow maps or physically lit materials. See `ASSETS.md` for the full register.

`src/world/art.js` defines drawn sizes and bottom anchors, loads the SVG textures, and creates unlit planes. Change a drawing in `public/art/` to edit its shape, pigment or details. Change `artSizes` only when its world size or ground anchor changes. The colours in `config.js` control procedural sea, ground and paths; SVG colours live in the drawings themselves.

The palette uses warm plaster, moss and sea-glass greens, rust roofs and ochre clothing. Sparse paper grain, asymmetrical foliage, roof marks and window details give the drawings a shared material language. Front/back explorer drawings and two walking frames for each view supply simple animation. Horizontal travel mirrors the front-facing drawing.

## Coordinates and story contracts

Logical gameplay retains +Y elevation and X/Z ground coordinates. `terrainHeight(x, z)` supplies the land mask and logical player height. The visible map uses `projectPoint(x, z)` returning `{ x, y: -z * 0.72 }`; logical elevation never moves the drawn feet. Render order increases with logical Z so foreground art covers background art. The cottage interior floor renders below the player.

```js
import { on } from './src/core/events.js';
const unsubscribe = on('interact', event => {
  // Exactly { type: 'interact', id: 'desk' }, for example.
  // Attach the story engine here; this foundation supplies no story outcome.
});
```

`emit(event)` is also exported. `zones` and `findZone({ x, y, z }, optionalZones)` in `world/zones.js` retain the exact ids `cottage`, `desk`, `shore`, `tower_door`. The supplied Y is logical elevation, not screen Y. Zone selection has a floor-height check and uses normalised proximity when zones overlap. The desk is reachable through the actual doorway and blocked by its own furniture collider.

```js
import { setWeather, getWeather } from './src/world/weather.js';
setWeather({ rain: 0.8, wind: 0.6 });
const snapshot = getWeather();
```

Each weather field, `cloudCover`, `rain`, `fog`, `wind`, is a number from 0 to 1. Finite supplied values are clamped; omitted, unknown and non-finite fields keep the previous value. Returned snapshots are copies. Weather drives the ink wash, mist, rain strokes, moving sea marks, tree sway and boat movement. No weather API is contacted. The hour normally advances 0.003 game hours per second; fast time advances 0.8.

`world/lighthouse.js` keeps the logical `anchors`, `stairwell` and `lamp_room` exports. For the new flat camera, use its additional `cameraAnchors.stairwell` or `.lamp_room`, whose X/Y match the drawing and whose camera Z is 100. Call `view.pause()`, move `view.camera` to one of those drawn anchors, choose zoom, and update its projection matrix. `view.start(true)` resumes follow. Pausing the view alone does not freeze local player input; a future cutscene owner should control that separately.

`createCharacter(art)` now returns `{ group, sprite, face(dx, dz), animate(delta, speed) }`. `group.position` is logical gameplay data; add **sprite** to the scene. A remote-player package can reuse the loaded art, set another character's logical position, select facing, then animate. Do not add the local input/controller to a remote character. This factory change is deliberate for the new presentation; multiplayer itself is not implemented.

High caps pixel ratio at 1.25, permits 900 rain strokes and 160 wave marks. Low caps at 1, permits 350 rain strokes and 80 wave marks. Both use the same unlit illustration. Runtime quality changes go through the `quality(name)` wiring in `main.js`.

## File map

Each application JavaScript file starts with its purpose and stays under 150 lines.

| File | Purpose |
| --- | --- |
| `package.json`, `package-lock.json`, `vite.config.js` | npm commands, locked dependencies, relative static paths and Vitest discovery |
| `index.html`, `public/favicon.svg`, `.gitignore` | Entry page, original icon and local-file exclusions |
| `src/main.js`, `src/config.js` | Load original art, connect modules, manage updates and define palette/layout/quality |
| `src/core/renderer.js` | Unlit WebGL renderer, orthographic resize and pixel ratio |
| `src/core/loop.js`, `input.js`, `events.js`, `math.js` | Frame timing, keyboard/pointer state, event bus and pure arithmetic |
| `src/world/art.js`, `primitives.js` | SVG textures/anchors, world-to-page projection, flat polygons and brush strokes |
| `src/world/terrain.js`, `paths.js` | Logical land height, illustrated coast/meadow and connecting sand ribbons |
| `src/world/island.js`, `scenery.js` | Scene assembly, tree/rock/flower placement, canopy fading and wind sway |
| `src/world/buildings.js` | Illustrated cottage/cutaway, window glow, boathouse and logical colliders |
| `src/world/lighthouse.js`, `beam.js` | Tower drawing, logical/drawn anchors, lantern glow and flat night sweep |
| `src/world/water.js`, `boat.js` | Sea brush marks, pier drawing and moving rowing boat |
| `src/world/sky.js`, `weather.js`, `zones.js` | Day/night wash, mist/rain, weather API and exact story locations |
| `src/player/character.js`, `controller.js`, `collision.js`, `camera.js` | Drawn explorer, world-aligned movement, shore/wall safety and fixed-view camera |
| `src/ui/hud.js`, `styles.css` | Paper-and-ink arrival, prompts, controls, settings and dev-only performance |
| `public/art/*.svg`, `board.html` | Original editable art and a separate review sheet; see asset register |
| `tests/world.test.js`, `input.test.js`, `illustration.test.js` | World rules, input safety and illustrated coordinate/camera contracts |
| `scripts/check-browser.js`, `check-production.js` | Real Chrome gameplay/performance and built-site checks |
| `20261105_Graphics-Brief.txt`, `20261105_Style-References.txt` | Initial brief and the later selected visual direction |
| `captures/20261105_Illustrated-*` | Iteration screenshots, final captures and reproducible measurement evidence |

## Verification and measured performance

`npm test` passed **18 tests in 3 files**. `npm run build` passed as part of `npm run test:production`, which also passed the built site's canvas, settings, focus and absence of dev-only FPS/inspection hooks. `npm run test:browser` passed movement, fixed-angle zoom, arrival safety, all four held-E interaction checks, weather/quality modes, render budgets, Retina caps and zero external requests or browser/WebGL errors. Browser checks use installed Chrome; set `CHROME_PATH` on other systems. No browser binary is downloaded.

Measured on 5 November 2026 in Chrome 157, headless, on this Intel i5-8259U / Iris Plus 655 Mac. At 1440 × 900, DPR 1, high sampled **58–61 FPS**, peaking at **75 draw calls and 2,075 submitted triangles**. Low sampled **60 FPS**. At device DPR 2, high rendered at 1.25 and low at 1; both arrival samples measured **60 FPS**. These are short warmed-up samples, not a sustained hardware guarantee. The earlier low-poly snapshot submitted up to 30,428 triangles; the new sampled maximum is about 93% lower.

The original upper budgets remain <150,000 triangles, <150 draw calls and pixel ratio ≤1.5. The selected illustrated style replaces the old shadowed 3D light/terrain pipeline with flat drawings and ink washes, so it uses no shadow-casting lights. Rain is a single line draw. Texture materials are shared across repeated assets. The detailed final measurements are `captures/20261105_Illustrated-Browser-Checks.json` and `Illustrated-Retina-Checks.json`.

## Limits and next teammate work

- Chrome was tested; Safari, Firefox, other laptops, long sessions and multiplayer loads were not. Gameplay uses a keyboard/mouse; no touch movement is supplied.
- This is a fixed illustrated view, not a rotatable 3D world. Elevation remains logical data. The tower has named camera anchors but no walkable staircase. The cottage is the only enterable building.
- Collisions are simple X/Z circles and boxes. There is no swimming, jumping, sailing, login, multiplayer, story outcome logic, AI companion or external API. Attach the story package to the existing four ids; connect future weather data to `setWeather`.
- The main production JavaScript bundle includes Three.js, about 577 kB minified / 148 kB gzip, so Vite emits a chunk-size advisory. Loading and the static build pass. Consider lazy-loading future optional packages.
- The source art and visual checkpoints are ready for further subjective review. The warm muted palette is the current implementation; no claim of approval of every individual drawing is implied.
- All commits stay on `feat/graphics-foundation` for Nils' review. No push, merge, deployment or protected team-document edit was made.

## Explain the render loop in three sentences

The browser requests a frame, and the loop measures elapsed time with a small cap to prevent large simulation jumps. Main updates the logical player and collisions, projects the character to the illustrated map, then updates weather, moving drawings, camera and interface. Three.js draws the ordered flat shapes and SVG textures through the orthographic camera, and the browser requests the next frame.
