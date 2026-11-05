# Lighthouse Isle pixel-art graphics

Nils explicitly rejected the painted-paper direction on 5 November 2026 and selected the supplied top-down pixel-art forest reference. This is the active direction: richer greens, clustered foliage, dark selective outlines, irregular grass and tan paths, earth/stone ledges, compact characters and a close exploration camera. The earlier SVG library and scene studies are inactive iteration sources. The reference screenshot is inspiration only; every runtime sprite and map is original project artwork.

## Run and inspect

The app is in `frontend/`, matching current main. From the worktree root run `cd frontend`, then use the Node versions in package.json, `npm install` and `npm run dev`. All app paths and npm commands below are relative to frontend/. Open the printed address and click **Step ashore**. `/asset-library.html` is the active pixel workshop, with search, family filters, native PNG links and integer magnification. `npm run build` produces the static game and workshop in dist; `npm run preview` serves them. The retired paper scene studies are excluded from the production entry points.

The newest screenshots and evidence use `captures/20261105_Pixel-*`. `Forest-Daylight`, `Cottage-Daylight`, `Shore-Daylight`, `Lighthouse-Daylight` and `Lighthouse-Midnight` show actual gameplay views. `First-Playable` records the first pixel iteration; `Nature-Kit` is the asset workshop. Nils approved the actual pixel gameplay capture and asked to keep the style, clean it and build the needed assets.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk along the map axes |
| Shift | Run without a diagonal speed boost |
| E | Investigate the active location, once per held press |
| Wheel | Switch between 1× and 2× camera zoom |
| T | Accelerate the day/night clock |
| 1 / 2 / 3 / 4 | Clear / overcast / storm / fog |
| Bottom-right settings | Hour, weather and quality |
| Escape | Close settings and restore game focus |

The close camera follows the player. Partial scenery at frame edges is normal in exploration; extra headroom shows the whole lighthouse when approaching its door at default zoom. A compact arrival card replaces the old large editorial overlay. Its arrival notification clears after five seconds. Roofs switch to a floor/desk cutaway inside the cottage. Foreground trees fade to keep the player readable. The pier is walkable, the sea is not. Keyboard/mouse is required; touch movement is not implemented.

## Original art and pixel grid

The active kit has **36 original PNG sprites plus one 1024 × 768 terrain backdrop**. The sprite sources total 23,992 bytes; ground.png is 35,912 bytes. The kit includes three buildings with cottage cutaway/light layers, eleven nature assets, eleven coastal props, and nine explorer poses. See ASSETS.md. The source of truth for active ids, native dimensions and placement anchors is `src/pixel/catalog.js`.

One world unit equals **16 native art pixels**. Texture sampling is nearest-neighbour, mipmaps and antialiasing are disabled, and static pixel sprites use integer magnification. The renderer draws a small native framebuffer and upscales it with CSS `image-rendering: pixelated` by a whole number. At 1440 × 900 it draws 480 × 300 and displays at 3×; at 1600 × 1000 it draws 400 × 250 at 4×. Device DPR does not increase that buffer. Zoom is discrete, positions snap to the art grid, and boats bob in pixel steps without fractional rotation. Low/high quality changes wave/rain density rather than the art scale.

`loadArt(ids = pixelArtIds)` in world/art.js loads only registered pixel PNGs. Reuse its materials with `placeArt(scene, art, id, x, z, scale)`. Unknown/unloaded ids fail clearly. Earlier SVG drawings are not requested by the active game. A future feature team should add its PNGs and metadata, then request its own selected ids.

The reproducible editable source is in `scripts/pixel_art/`, split into small Python files for nature, buildings, people, props and ground. To rebuild: `python3 scripts/pixel_art/generate.py`, with Python Pillow installed for authoring. The game and normal JS tests need no Python or image service. The generator calls `scripts/export-pixel-ground.js` to use the canonical terrain function, so the coast is not a separate guessed shape. Grass, paths, texture clusters, cliff face and shore contact pixels bake once into ground.png. Change those generator sources to edit pigment, silhouette or detail, and rebuild the PNGs.

## Gameplay contracts

Logical gameplay still uses X/Z ground coordinates and +Y elevation from terrainHeight. Visual projection remains `{ x, y: -z * .72 }`; logical height never lifts drawn feet. Render order increases with logical Z. Native-pixel snapping affects the presentation only. The lighthouse drawing's foot position now agrees with its collision front, keeping the player visible at the existing tower_door stand point.

`on('interact', handler)` and `emit(event)` in core/events.js keep payloads such as `{ type: 'interact', id: 'desk' }`. The exact ids are **cottage**, **desk**, **shore**, **tower_door**. Zone tests retain the elevation check and normalised proximity; the story owner supplies the outcomes. No story outcome, authentication, save system or multiplayer has been added.

`setWeather({ cloudCover, rain, fog, wind })` and getWeather in world/weather.js remain the integration hooks. Values clamp to 0–1, omitted/unknown/non-finite values preserve prior state, and returned snapshots are copies. Weather changes rain, the scene wash/mist, sea marks and boat motion. No real-weather API is contacted.

world/lighthouse.js exports logical `anchors`, `stairwell`, `lamp_room`, plus the drawn `cameraAnchors` for cutscenes. Use view.pause, set camera position/zoom from those drawn anchors, and updateProjectionMatrix; view.start resumes follow. Player input needs its own cutscene gate.

`createCharacter(art, { reducedMotion })` retains `{ group, sprite, face(dx, dz), animate(delta, speed) }`. group.position holds logical data; add sprite to the scene. Front, back and mirrored side profiles cover four directions; walk cadence follows realised movement speed, interleaving two stride poses with the neutral pose. Reduced motion omits stride swapping and cosmetic bounce. A remote player can reuse art and this factory without attaching local input. Multiplayer is not implemented.

## File map

| Area | Purpose |
| --- | --- |
| src/main.js, src/config.js | Startup, frame updates, quality and logical layout |
| src/core/ | Pixel renderer, frame loop, input, events and pure maths |
| src/pixel/catalog.js, display.js | Active asset register, anchors, grid and integer display calculation |
| src/pixel/terrain.js | Load the canonical baked terrain drawing |
| src/pixel/library.js, library.css | Active pixel workshop |
| src/world/ | Logical terrain, sprite placement, buildings/cutaway, forest, boat, weather and lighthouse |
| src/player/ | Pixel character, fixed camera, controller and collision rules |
| src/ui/ | Compact RPG interface and development-only performance |
| public/pixel/ | 36 original sprites and ground backdrop |
| scripts/pixel_art/, export-pixel-ground.js | Editable/reproducible original artwork sources |
| tests/pixel.test.js | PNG registration/dimensions, display scaling and pixel snapping |
| scripts/check-pixel.js, check-browser.js, check-production.js | Real-browser art/gameplay/build validation |
| ../references/20261105_Pixel-Style-Reference.png | User-supplied style reference, excluded from runtime assets |
| 20261105_Pixel-Direction.txt, ASSET_ROADMAP.txt | Current direction and provisional feature-art mapping |

## Verification and performance

`npm test` passed 29 tests in 6 files, built-game checks passed, and built pixel-workshop checks passed. Current final verification is recorded in the Pixel-prefixed JSON files in captures. Run `npm test`, `npm run test:art`, `CAPTURE_PREFIX=Pixel npm run test:browser`, `CAPTURE_PREFIX=Pixel npm run test:production`, and `npm run test:art:production`. Browser checks use installed Chrome or CHROME_PATH; no browser download is needed. GPU checks run sequentially.

The target remains 60 FPS, <150 draw calls and <150,000 submitted triangles on ordinary integrated graphics. The pixel pipeline uses no shadow maps, bloom, 3D terrain mesh or external network request. The largest texture is the one 1024 × 768 backdrop. Sprite materials/textures are shared; scene teardown disposes all maps, including ground. The final full pixel benchmark measured 60–61 FPS across short samples, up to 100 draw calls and 195 submitted triangles. Earlier samples varied more, so this is not a sustained guarantee. It used a 480 × 300 native framebuffer displayed at 1440 × 900; DPR 2 uses the same native buffer. These samples were on this Mac in headless Chrome 157, not a sustained hardware guarantee. The HUD clock/diagnostics now synchronise at 150 ms intervals; interaction prompts still update every frame. Final post-change evidence is Pixel-Browser-Checks.json.

## Continuing work and integration

- Refine canopy variety, natural grass/soil boundaries, cliff transitions and environmental clusters against the supplied reference. Keep the player and routes readable; avoid noisy per-pixel detail.
- Rebuild the planned feature kits in the new pixel language. The earlier paper market/arena/companion/boat concepts are not active pixel assets or implemented features. Consult the roadmap input file, whose feature priorities remain provisional.
- Improve character stride/idle richness and test longer sessions, Safari/Firefox, other GPUs and smaller screens. Current verification is installed Chrome on this Mac, not a cross-device guarantee.
- The current main layout is frontend/ plus backend/. The pixel pass is integrated into that frontend/ layout, retaining the incoming team documents byte-for-byte; 57 added art/check files were resolved at their relocated paths without changing their content. Feature-branch synchronisation does not merge anything into main. Untracked local ROADMAP/STORY files describe G1 before G2/G3/G4 and S0-owned map inputs; they are planning context, not published frozen contracts.
- Root remains the sole writer to this graphics worktree. Nils authorised normal pushes of verified work to feat/graphics-foundation and a reviewable PR. No merge into main, force push or deployment is authorised here. A two-hour heartbeat in this chat continues bounded visual improvements under the new direction and reports meaningful changes.

## Render loop in three sentences

The browser requests a frame and the loop measures elapsed time with a cap to avoid large simulation jumps. Main moves the logical player through collision checks, selects and snaps its pixel pose, then updates camera, weather, water, boat, buildings and interface. Three.js draws the ordered sprites and native terrain into a small framebuffer, CSS scales it by an integer, and the browser requests another frame.
