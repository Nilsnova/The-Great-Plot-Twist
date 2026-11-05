# Active original pixel-art register

Nils approved the actual pixel-art gameplay presentation on 5 November 2026 and asked to preserve its style while cleaning and expanding it. The library has **48 original pixel sprites and one baked terrain backdrop**. The active game loads 36 sprites; 12 harbour/mystery assets are staged and stay outside its default preload. All are authored from editable project code. The user-supplied screenshot is local visual inspiration, excluded from Git and runtime distribution; no art, character or map was extracted from it.

| Family | PNGs | Artwork |
| --- | ---: | --- |
| Buildings and layers | 5 | Cottage, matching interior, window-light overlay, boathouse and lighthouse |
| Forest and nature | 11 | Birch, oak, a second broadleaf crown, pine, rocks, shrub, flowers, grass tuft, fern, reeds and mushrooms |
| Explorer poses | 9 | Front/back/side standing and two stride poses per view; left is the mirrored side |
| Coastal props | 11 | Sign, jetty, rowing boat, crate, barrel, rope coil, lantern, bench, buoy, driftwood and gull |
| Staged harbour/mystery kit | 12 | Harbour office, harbour beacon, signal station, ferry pier, sailboat, dark schooner, sealed letter, torn page, logbook, compass, brass star and beacon fire |
| Terrain | 1 | Native 1024 × 768 land/grass/path/shore/cliff backdrop using the canonical terrain-height function |
| **Total** | **49** | **48 sprites + ground.png** |

Source PNGs total 69,216 bytes, about 67.6 KiB. The active 36-sprite/ground kit remains 59,904 bytes; staging adds 9,312 source bytes and no game texture requests or draw calls. Native sprite sizes range from 16 × 24 to 96 × 208; building canvases can be 128 × 160. One world unit equals 16 native art pixels. All active textures use nearest sampling, no mipmaps and no antialiasing. Integer display scaling, snapped positions and discrete zoom preserve the pixel grid. PNG alpha supplies transparent backgrounds and hard pixel contact shadows.

## Edit and reproduce

`src/pixel/catalog.js` defines ids, files, native dimensions and placement anchors. Each PNG lives in `public/pixel/`. Metadata converts native width/height to world units, with the horizontal anchor at centre and the vertical anchor a native-pixel distance from the bottom. The default `loadArt()` kit is pixelArtIds, which selects only entries whose usage is island. The active game requests those PNGs and ground.png. Staged entries use usage library; a future scene can request their ids explicitly. Their art does not implement travel, a harbour, fire behaviour or a story outcome.

`python3 scripts/pixel_art/generate.py` rebuilds the kit. Python Pillow is an authoring dependency, already available in this session; playing/building/testing the app does not need Python. Sources are small files: common.py, nature.py, buildings.py, people.py, props.py, ground.py, destinations.py, nautical.py and generate.py. The Node helper scripts/export-pixel-ground.js exports canonical land classes from world/terrain.js rather than guessing the walkable coastline.

The PNG files are original code-authored bitmap assets. No image-generation service, external texture pack, game screenshot, downloaded model or external font is used at runtime. Public/favicon.svg is an original crisp 16-pixel lighthouse mark. Sea/rain/beam/wash effects are original code-generated graphics.

## Review and checks

Open `/asset-library.html` for the active pixel workshop. It supports search, family/usage filtering, integer previews, source PNG links and a larger inspection dialog. The gallery labels native dimensions and preview magnification so different-sized sprites are not mistaken for world-scale comparisons.

`npm test` includes binary PNG dimension/registration checks, whole-number display scaling, snapping, source provenance/safety and the existing world/input/story contracts. `npm run test:art` decodes all 49 PNGs in real Chrome, checks ground alpha, workshop interactions, active-only requests, integer framebuffer scaling, disabled antialiasing and snapped explorer feet. `npm run test:art:production` repeats the workshop and runtime network checks on the static build. Gameplay/performance and production checks have their own commands in GRAPHICS.md.

Actual review evidence is `captures/20261105_Pixel-*`. Earlier SVGs, their catalogue/viewers and obsolete checks are preserved in archive/paper; they are not active game textures, approved pixel feature kits or implemented future features. The old paper-style counts do not describe the current game.

Three.js, Vite and Vitest use MIT licences; Playwright Core uses Apache-2.0 and Pillow uses HPND. Package notices accompany their installations. Future external visual assets must be CC0 and recorded here with their exact source and licence before use.
