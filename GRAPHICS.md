# Lighthouse Isle illustrated graphics

The active presentation is an original painted-paper island, selected by Nils on 5 November 2026 with Carto as the visual reference. A fixed orthographic view, editable SVG drawings, a small palette and sparse animation replace the earlier low-poly diorama. Three.js, Vite and plain JavaScript remain; no new dependency was added. The earlier implementation and screenshots remain in Git history and the unprefixed captures.

## Run and review

Use Node 22.12+, 24.x or 26+ as specified in `package.json`. From this repository root, run `npm install`, then `npm run dev`, and open the address Vite prints. Click **Step ashore**. `npm run build` creates the static site in `dist/`; `npm run preview` serves it. Nothing has been deployed or pushed.

`/asset-library.html` is the full searchable art workshop, built alongside the game. It offers family/roadmap/usage filters, paper/sea/night contrast studies, placement anchors, SVG links and 32/64/96 pixel previews. `/art/board.html` preserves the original 20-drawing study. Latest family sheets and gameplay evidence use `captures/20261105_Roadmap-*`; the earlier `Illustrated-*` files preserve the first illustrated iteration.

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

All 108 SVG assets are original project drawings, about 97 KiB of source combined. This expansion adds 88 drawings for the roadmap input areas. Twenty-seven load locally as shared island textures, one is a CSS paper tile, and 80 remain staged in the library. The largest drawing rasterises at 576 pixels on its longest side. There are no downloaded game assets, external fonts, texture packs, CDN requests, bloom, 3D shadow maps or physically lit materials. See `ASSETS.md` for the register and `ASSET_ROADMAP.txt` for source status and feature mapping.

`src/assets/catalog.js` and its small family files define labels, world sizes, anchors, roadmap tags and usage. `src/world/art.js` re-exports `artSizes`, loads only requested SVGs, and creates unlit planes. Change a drawing in `public/art/` to edit its shape, pigment or details; change its catalogue entry when size or placement anchor changes. `loadArt()` selects the 27 island drawings by default; `loadArt(['sailboat', 'harbour-office'])` selects an optional feature kit. Reuse loaded materials with `placeArt`; unknown or unloaded ids throw. The colours in `config.js` control procedural sea, ground and paths; SVG colours live in the drawings themselves.

Nils confirmed the warm, muted palette during this expansion. It uses warm plaster, moss and sea-glass greens, rust roofs and ochre clothing. Sparse paper grain, asymmetrical foliage, roof marks and window details give the drawings a shared material language. Front/back explorer drawings and two walking frames for each view supply simple animation. Horizontal travel mirrors the front-facing drawing.

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
| `src/world/island.js`, `scenery.js`, `decorations.js` | Scene assembly, nature/prop placement, colliders, canopy fading and wind/buoy movement |
| `src/world/buildings.js` | Illustrated cottage/cutaway, window glow, boathouse and logical colliders |
| `src/world/lighthouse.js`, `beam.js` | Tower drawing, logical/drawn anchors, lantern glow and flat night sweep |
| `src/world/water.js`, `boat.js` | Sea brush marks, pier drawing and moving rowing boat |
| `src/world/sky.js`, `weather.js`, `zones.js` | Day/night wash, mist/rain, weather API and exact story locations |
| `src/player/character.js`, `controller.js`, `collision.js`, `camera.js` | Drawn explorer, world-aligned movement, shore/wall safety and fixed-view camera |
| `src/ui/hud.js`, `styles.css` | Paper-and-ink arrival, prompts, controls, settings and dev-only performance |
| `src/assets/catalog.js`, `sets/*.js` | Single catalogue of artwork, anchors, tags and selective preload usage |
| `asset-library.html`, `src/library/` | Searchable art workshop, contrast/scale studies and source links |
| `public/art/*.svg`, `board.html` | 108 original editable drawings and the original study sheet |
| `tests/world.test.js`, `input.test.js`, `illustration.test.js`, `assets.test.js` | World/input/camera contracts, catalogue safety and collision-safe prop additions |
| `scripts/check-browser.js`, `check-production.js`, `check-art-library.js` | Real Chrome gameplay/performance, built-site checks, SVG decoding and workshop/network checks |
| `20261105_Graphics-Brief.txt`, `20261105_Style-References.txt` | Initial brief and the later selected visual direction |
| `captures/20261105_Roadmap-*`, `Illustrated-*` | Current expansion evidence and earlier visual checkpoints |

## Verification and measured performance

`npm test` passed **22 tests in 4 files**. `npm run build` passed as part of `npm run test:production`, which also passed the built site's canvas, settings, focus and absence of dev-only FPS/inspection hooks. `npm run test:browser` passed movement, fixed-angle zoom, arrival safety, all four held-E interaction checks, weather/quality modes, render budgets, Retina caps and zero external requests or browser/WebGL errors. Browser checks use installed Chrome; set `CHROME_PATH` on other systems. No browser binary is downloaded.

Measured on 5 November 2026 in Chrome 157, headless, on this Intel i5-8259U / Iris Plus 655 Mac. With the eight added props, at 1440 × 900, DPR 1, high sampled **52–60 FPS**, peaking at **83 draw calls and 2,091 submitted triangles**. Low sampled **61 FPS**. At device DPR 2, high rendered at 1.25 and sampled **61 FPS**; low rendered at 1 and sampled **60 FPS**. These are short warmed-up samples, not a sustained hardware guarantee. The earlier 20-drawing illustrated scene peaked at 75 calls / 2,075 triangles; the earlier low-poly snapshot submitted up to 30,428 triangles.

The original upper budgets remain <150,000 triangles, <150 draw calls and pixel ratio ≤1.5. The selected illustrated style replaces the old shadowed 3D light/terrain pipeline with flat drawings and ink washes, so it uses no shadow-casting lights. Rain is a single line draw. Texture materials are shared across repeated assets. The detailed measurements are `captures/20261105_Roadmap-Island-Browser-Checks.json` and `Roadmap-Island-Retina-Checks.json`. `npm run test:art` checks all 108 SVGs, workshop behaviour and selected-only texture requests; `npm run test:art:production` checks the built workshop. All drawings decoded with visible ink, preserved aspect ratios and source-edge padding. Two independent visual reviews found no blocking issue in the expanded families.

## Limits and next teammate work

- Chrome was tested; Safari, Firefox, other laptops, long sessions and multiplayer loads were not. Gameplay uses a keyboard/mouse; no touch movement is supplied.
- This is a fixed illustrated view, not a rotatable 3D world. Elevation remains logical data. The tower has named camera anchors but no walkable staircase. The cottage is the only enterable building.
- Collisions are simple X/Z circles and boxes. There is no swimming, jumping, sailing, login, multiplayer, story outcome logic, AI companion or external API. Attach the story package to the existing four ids; connect future weather data to `setWeather`.
- The main production JavaScript bundle includes Three.js, about 577 kB minified / 148 kB gzip, so Vite emits a chunk-size advisory. Loading and the static build pass. Consider lazy-loading future optional packages.
- Future-feature buildings, boats, props, icons and static character studies are staged art. They implement no markets, predictions, arena, co-op, companions or story solutions. The roadmap input file remains a list to classify, not a final approved feature priority. New buildings need logical colliders/interiors when integrated; new characters need animation/behaviour.
- The source art and visual checkpoints remain ready for subjective iteration. Nils confirmed the palette; that does not imply approval of every individual drawing.
- All commits stay on `feat/graphics-foundation` for Nils' review. No push, merge, deployment or protected team-document edit was made.

## Explain the render loop in three sentences

The browser requests a frame, and the loop measures elapsed time with a small cap to prevent large simulation jumps. Main updates the logical player and collisions, projects the character to the illustrated map, then updates weather, moving drawings, camera and interface. Three.js draws the ordered flat shapes and SVG textures through the orthographic camera, and the browser requests the next frame.
