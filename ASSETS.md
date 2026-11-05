# Original illustrated asset register

The active art direction is an original painted-paper island with Carto as a broad visual reference, selected by Nils on 5 November 2026. No character, map, texture, drawing or screenshot from Carto or another game is used in the application. All assets below were drawn as editable project SVGs. No external visual asset or font was downloaded.

| Original file in `public/art/` | Use |
| --- | --- |
| `cottage.svg` | Warm plaster cottage, rust roof, chimney, windows and planting box |
| `cottage-interior.svg` | Roof-free interior, floor, east window and writing desk |
| `cottage-glow.svg` | Matching window light overlay, used at night |
| `lighthouse.svg` | Sea-green lantern, coral band, weathered masonry and service hut |
| `boathouse.svg` | Weathered timber walls, double doors and painted roof |
| `birch.svg`, `pine.svg` | Asymmetrical layered foliage, trunks and sparse brush marks |
| `shrub.svg`, `flowers.svg` | Reusable undergrowth and warm-coloured wildflowers |
| `rock.svg`, `sign.svg` | Coastal rocks and a small path sign |
| `jetty.svg`, `boat.svg` | Uneven wooden planks and an open rowing boat with an oar |
| `explorer.svg`, `explorer-back.svg` | Original raincoat explorer, front and back |
| `explorer-walk-1.svg`, `explorer-walk-2.svg` | Alternating front walking poses |
| `explorer-back-walk-1.svg`, `explorer-back-walk-2.svg` | Alternating back walking poses |
| `paper.svg` | Small monochrome repeating paper-grain tile |

There are 20 SVGs, approximately 25 kB combined. Nineteen are loaded as local shared textures by `src/world/art.js`; `paper.svg` is a CSS tile. The largest rasterised drawing is 576 pixels on its longest side. `artSizes` holds each picture's drawn size and ground anchor. Texture rasterisation happens in the browser, without an external service.

`public/art/board.html` previews the core family separately from the game. `public/favicon.svg` is the project's original lighthouse icon. Coastlines, paths, ground marks, sea strokes, rain, lantern halo and beam are original code-generated shapes. Typography uses installed system fonts; no font file is distributed. The `captures/` files are rendered review evidence, not runtime game assets.

The earlier primitive 3D assets were also original project code. Their source history and unprefixed screenshots remain available for comparison; the active runtime now uses the illustrated presentation.

Three.js, Vite and Vitest use MIT licences; Playwright Core is an Apache-2.0 development dependency. Their notices are supplied with installed packages. Any future external visual asset must be CC0 and recorded here with its exact source URL and licence before use. Reference screenshots linked in `20261105_Style-References.txt` are inspiration only, not game assets.
