# Original illustrated asset register

Nils selected the Carto-inspired painted-paper direction on 5 November 2026 and confirmed the warm, muted palette. All 108 SVGs are original editable project drawings. No character, map, texture, drawing or screenshot from another game is used in the application. No external visual asset or font was downloaded.

## Collection

| Family | Drawings | Contents |
| --- | ---: | --- |
| Original island | 20 | Cottage and cutaway/light overlays, lighthouse, boathouse, trees, undergrowth, rocks, sign, jetty, rowing boat, six explorer poses and paper tile |
| Buildings | 12 | Harbour office, Exchange hall, question kiosk, sports pavilion, arena gate, signal station, workshop, cabin, glasshouse, windmill and two ruins |
| Coastal life | 14 | Mooring post, rope, net rack, crate, barrel, lantern, bench, well, fence, bridge, steps, noticeboard, tide gauge and buoy |
| Sailing | 4 | Sailboat, shared-island ferry, cargo boat and life ring |
| Nature | 12 | Willow, cypress, palm, reeds, fern, sea grass, driftwood, tidal pool, shells, mushrooms, gull and crab |
| Mystery objects | 15 | Logbook, letter, chart, key, watch, compass, lens, cipher wheel, four distinct chart fragments, message bottle, radio and telescope |
| Markets and rewards | 8 | Play coins, wallet, share certificate, chart board, question board, forecast token, pennant and trophy |
| Character studies | 5 | Harbour keeper, trader, arena visitor, satchel gull and lantern wisp |
| Interface icons | 18 | Logbook, map, home, ship, coin, market, prediction, sports, arena, encounter, companion, presence, five weather states and reward |
| **Total** | **108** | **20 original drawings plus 88 added for roadmap coverage** |

The collection is 99,104 bytes of SVG source, about 97 KiB. The largest source rasterises at 576 pixels on its longest side. The game loads only 27 shared SVG textures, 31,166 source bytes, plus the CSS paper tile. The 80 staged drawings incur no game texture request or draw call. The paper tile is the remaining CSS-only entry.

## Catalogue and integration

`src/assets/catalog.js` and the small files in `src/assets/sets/` are the source of truth for each file's id, label, category, world size, placement anchor, roadmap tags and usage. Each file lives at `public/art/<id>.svg`. `size` is `[width, height, anchorFromBottom]`, with horizontal anchor fixed at centre. Preserve the source aspect ratio. UI icons use a centre anchor; scenery generally uses its ground or water contact point.

`src/world/art.js` exports `loadArt(ids)` and `placeArt(scene, art, id, x, z, scale)`. The loader defaults to `islandArtIds`; a feature owner can request only its own ids and reuse those materials. Unknown or unloaded drawings throw a descriptive error. This avoids silent white rectangles and preloading every future feature.

The eight added island props are crate, barrel, rope coil, lantern, bench, buoy, driftwood and gull. Their placements and logical colliders are in `src/world/decorations.js`; the buoy moves with the wind. Existing story interaction ids and routes remain clear.

The other drawings are staged source assets, not implemented features. Building drawings have no new interiors or collision definitions. New character studies are static poses; the existing explorer retains front/back walking animation. Generic mystery objects and four contribution fragments do not establish canon clues, solutions or rewards. Companion art supplies no AI, dialogue or behaviour. Boats supply no sailing controller. `ASSET_ROADMAP.txt` records the source mapping and its provisional status.

## Review and verification

Open `/asset-library.html` with Vite for the full searchable workshop. Filter by family, roadmap area or usage; compare paper, sea and night backgrounds. Inspect any card for its world dimensions, placement anchor, editable SVG link and 32/64/96 pixel previews. The page is built alongside the game without importing Three.js. `/art/board.html` remains the original 20-drawing study.

`npm run test:art` decodes all drawings in installed Chrome, checks XML, visible pixels, aspect ratio, source-edge padding and texture budget, exercises workshop controls, and verifies the game requests only its selected art. `npm run test:art:production` repeats the workshop and network checks against the built static pages. `tests/assets.test.js` protects the catalogue, safe standalone SVGs, roadmap coverage, selective loading and original story stand points. Final family sheets are `captures/20261105_Roadmap-*-Final.png`; machine-readable evidence is `captures/20261105_Roadmap-Art-Checks.json` and its `-Production` counterpart.

Coastlines, paths, ground marks, sea strokes, rain, lantern halo and lighthouse beam are original code-generated shapes. `public/favicon.svg` is the original lighthouse icon. Typography uses installed system fonts; no font file is distributed. Captures are rendered review evidence, not runtime assets. Earlier primitive 3D code and screenshots remain available in Git history.

Three.js, Vite and Vitest use MIT licences; Playwright Core is an Apache-2.0 development dependency. Installed packages supply their notices. Any future external visual asset must be CC0 and recorded here with its exact source URL and licence before use. Reference screenshots linked in `20261105_Style-References.txt` are inspiration only.
