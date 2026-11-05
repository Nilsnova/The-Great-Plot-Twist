# Original pixel-art register

Nils approved the top-down pixel presentation on 5 November 2026. G2/G3 preserves that style and expands it to the Saltreach Isles. Every sprite, background and chart is original, drawn by our editable project generator. The supplied game screenshot is local inspiration only, excluded from Git and runtime distribution. No artwork was extracted from it.

The shipped library contains **182 sprites and 9 backgrounds/charts, 191 PNGs total**. The new story kit is selectively loaded and adds no Lighthouse texture requests. The 36-sprite Lighthouse kit remains the default catalogue selection; the running app keeps nine explorer poses shared and loads only the current place's scenery. Sailing loads its boat image on demand. Other place and story-library sprites stay outside the Lighthouse preload.

| Original G1 family | Sprites | Contents |
| --- | ---: | --- |
| Buildings and layers | 5 | Cottage, interior, matching window light, boathouse, lighthouse |
| Nature | 11 | Birch, oak, second broadleaf crown, pine, rock, shrub, flowers, grass tuft, fern, reeds, mushrooms |
| Explorer | 9 | Front/back/side, each with neutral and two stride poses; left mirrors the side |
| Coastal props | 11 | Sign, jetty, boat, crate, barrel, rope coil, lantern, bench, buoy, driftwood, gull |
| Selective place/story library | 12 | Harbour office, beacon, signal station, ferry pier, sailboat, dark schooner, sealed letter, torn page, logbook, compass, brass star, beacon fire |

## G2/G3 sprite additions

Every row is a distinct original PNG in `public/pixel/`. Dimensions and anchors are registered in `src/pixel/catalog.js` at 16 native pixels per world unit. The catalogue's `library` usage means selective loading, including active destination art, rather than default Lighthouse preload.

| Sprite id | Native pixels | Purpose and editable source |
| --- | --- | --- |
| `harbour-office-glow` | 128 × 160 | Matching office windows, night opacity; settlements.py |
| `jail` | 112 × 112 | Stone building and barred windows; settlements.py |
| `market-hall` | 144 × 128 | Island Exchange, green roof and awning; settlements.py |
| `prediction-kiosk` | 80 × 96 | Map counter and small canopy; settlements.py |
| `sports-pavilion` | 144 × 128 | Neutral pavilion and pennants; settlements.py |
| `notice-board` | 48 × 64 | Reward notice, unreadable decorative paper marks; settlements.py |
| `captains-table` | 64 × 48 | Crew's map/clue table, no conclusions; settlements.py |
| `cabin` | 96 × 96 | Home plot building; settlements.py |
| `workshop` | 112 × 112 | Home workshop and crossed tools; settlements.py |
| `windmill` | 112 × 160 | Static native-pixel sails, home plot; settlements.py |
| `greenhouse` | 112 × 96 | Glass panels and planted pots; settlements.py |
| `build-plot` | 144 × 96 | Ground parcel and low corner posts; settlements.py |
| `back-room` | 96 × 96 | Cove outbuilding; case_places.py, original boathouse source reused |
| `low-tide-cave` | 112 × 96 | Stone cave entrance; case_places.py |
| `arena-gate` | 112 × 96 | Stone arch with timber gate; case_places.py |
| `raid-arch` | 112 × 112 | Tall stone arch and neutral pennants; case_places.py |
| `watchtower-ruin` | 80 × 144 | Broken masonry tower, future beam origin; case_places.py |
| `reef` | 96 × 64 | Angular shoreline rocks and water contact; case_places.py |
| `salvage-yard` | 144 × 112 | Timber hull, shelter and salvage crates; case_places.py |
| `fog-bank` | 192 × 96 | Translucent clustered fog bands; case_places.py |

## Backgrounds and charts

| File in public/ | Native pixels | Purpose/source |
| --- | --- | --- |
| `pixel/ground.png` | 1024 × 768 | Approved Lighthouse terrain; ground.py and canonical terrainHeight |
| `places/saltreach_harbor.png` | 1024 × 768 | Harbor coast, paths and plaza; place_ground.py |
| `places/home_islet.png` | 1024 × 768 | Home coast and plot paths; place_ground.py |
| `places/smugglers_cove.png` | 1024 × 768 | Cove coast and entrance paths; place_ground.py |
| `places/wreck_point.png` | 1024 × 768 | Salvage beach and paths; place_ground.py |
| `places/the_teeth.png` | 1024 × 768 | Muted reef islet and paths; place_ground.py |
| `places/gulls_rest.png` | 1024 × 768 | Locked destination's quiet islet; place_ground.py |
| `places/chart.png` | 448 × 256 | Marked routes, northern fog, uncharted silhouette; chart.py |
| `places/chart-relit.png` | 448 × 256 | Chart revealed by the external Relighting gate; chart.py |

## Edit, reproduce and inspect

From `frontend/`, run `python3 scripts/pixel_art/generate.py`. Pillow is an offline authoring dependency; playing, building and JS testing require no Python. Sources live in `scripts/pixel_art/`: common.py, nature.py, buildings.py, people.py, props.py, ground.py, destinations.py, nautical.py, settlements.py, case_places.py, place_ground.py, chart.py and generate.py. The Node helpers export canonical land masks from terrain.js and places/surfaces.js; visual shorelines and walkability use the same functions.

The runtime uses nearest sampling, no mipmaps, a 16-pixel world grid, snapped feet and integer display scaling. The largest textures are 1024 × 768. PNG alpha supplies transparent edges and contact shadows. The chart and sailing scene also use nearest/integer scaling. UI text is separate HTML with readable font sizes, as Nils requested.

Open `/asset-library.html` for the searchable workshop, family/use filters, integer previews and source PNG links. `npm test` checks binary PNG dimensions and registration. `npm run test:art` and `npm run test:art:production` decode all PNGs in real Chrome and check the workshop and selective preload. `npm run test:world` checks the seven places, events, keyboard travel, locks, reduced motion, office glow and ten round trips. Evidence lives in `captures/20261105_World-*` and Pixel-prefixed check files.

The favicon is an original SVG lighthouse mark. Water, rain, beams and sky washes are original code graphics. No image-generation service, texture pack, downloaded game art, real company/team logos or external font is used. Retired paper studies remain in archive/paper, excluded from the active build. Three.js, Vite and Vitest use MIT licences, Playwright Core Apache-2.0, and Pillow HPND; package notices accompany their installations.

## G4 crew, cast and story/UI additions

All 114 additions below are original code-authored PNGs in public/pixel/. Each of ten crew/cast titles has front/back/side idle plus two alternating walk poses (nine ground sprites) and one 64×80 portrait. Left is a mirrored side. characterArtIds(id) selects nine poses; characterArt(loadedArt,id) adapts them to the existing createCharacter factory. Portraits are supplied to dialogue as {src,alt,width:64,height:80,scale:1}. No personal names other than Elena Vos and no case identity mapping are stored. Story props and frames are reusable visual assets, not wallet or board behaviour.

| Sprite id | Native pixels | Editable source |
| --- | --- | --- |
| crew-deckhand | 24 × 32 | crew.py |
| crew-deckhand-walk-1 | 24 × 32 | crew.py |
| crew-deckhand-walk-2 | 24 × 32 | crew.py |
| crew-deckhand-back | 24 × 32 | crew.py |
| crew-deckhand-back-walk-1 | 24 × 32 | crew.py |
| crew-deckhand-back-walk-2 | 24 × 32 | crew.py |
| crew-deckhand-side | 24 × 32 | crew.py |
| crew-deckhand-side-walk-1 | 24 × 32 | crew.py |
| crew-deckhand-side-walk-2 | 24 × 32 | crew.py |
| crew-deckhand-portrait | 64 × 80 | crew.py |
| crew-navigator | 24 × 32 | crew.py |
| crew-navigator-walk-1 | 24 × 32 | crew.py |
| crew-navigator-walk-2 | 24 × 32 | crew.py |
| crew-navigator-back | 24 × 32 | crew.py |
| crew-navigator-back-walk-1 | 24 × 32 | crew.py |
| crew-navigator-back-walk-2 | 24 × 32 | crew.py |
| crew-navigator-side | 24 × 32 | crew.py |
| crew-navigator-side-walk-1 | 24 × 32 | crew.py |
| crew-navigator-side-walk-2 | 24 × 32 | crew.py |
| crew-navigator-portrait | 64 × 80 | crew.py |
| crew-cook | 24 × 32 | crew.py |
| crew-cook-walk-1 | 24 × 32 | crew.py |
| crew-cook-walk-2 | 24 × 32 | crew.py |
| crew-cook-back | 24 × 32 | crew.py |
| crew-cook-back-walk-1 | 24 × 32 | crew.py |
| crew-cook-back-walk-2 | 24 × 32 | crew.py |
| crew-cook-side | 24 × 32 | crew.py |
| crew-cook-side-walk-1 | 24 × 32 | crew.py |
| crew-cook-side-walk-2 | 24 × 32 | crew.py |
| crew-cook-portrait | 64 × 80 | crew.py |
| crew-salvager | 24 × 32 | crew.py |
| crew-salvager-walk-1 | 24 × 32 | crew.py |
| crew-salvager-walk-2 | 24 × 32 | crew.py |
| crew-salvager-back | 24 × 32 | crew.py |
| crew-salvager-back-walk-1 | 24 × 32 | crew.py |
| crew-salvager-back-walk-2 | 24 × 32 | crew.py |
| crew-salvager-side | 24 × 32 | crew.py |
| crew-salvager-side-walk-1 | 24 × 32 | crew.py |
| crew-salvager-side-walk-2 | 24 × 32 | crew.py |
| crew-salvager-portrait | 64 × 80 | crew.py |
| character-harbor-master | 24 × 32 | crew.py |
| character-harbor-master-walk-1 | 24 × 32 | crew.py |
| character-harbor-master-walk-2 | 24 × 32 | crew.py |
| character-harbor-master-back | 24 × 32 | crew.py |
| character-harbor-master-back-walk-1 | 24 × 32 | crew.py |
| character-harbor-master-back-walk-2 | 24 × 32 | crew.py |
| character-harbor-master-side | 24 × 32 | crew.py |
| character-harbor-master-side-walk-1 | 24 × 32 | crew.py |
| character-harbor-master-side-walk-2 | 24 × 32 | crew.py |
| character-harbor-master-portrait | 64 × 80 | crew.py |
| character-masked-captain | 24 × 32 | crew.py |
| character-masked-captain-walk-1 | 24 × 32 | crew.py |
| character-masked-captain-walk-2 | 24 × 32 | crew.py |
| character-masked-captain-back | 24 × 32 | crew.py |
| character-masked-captain-back-walk-1 | 24 × 32 | crew.py |
| character-masked-captain-back-walk-2 | 24 × 32 | crew.py |
| character-masked-captain-side | 24 × 32 | crew.py |
| character-masked-captain-side-walk-1 | 24 × 32 | crew.py |
| character-masked-captain-side-walk-2 | 24 × 32 | crew.py |
| character-masked-captain-portrait | 64 × 80 | crew.py |
| character-fisherman | 24 × 32 | crew.py |
| character-fisherman-walk-1 | 24 × 32 | crew.py |
| character-fisherman-walk-2 | 24 × 32 | crew.py |
| character-fisherman-back | 24 × 32 | crew.py |
| character-fisherman-back-walk-1 | 24 × 32 | crew.py |
| character-fisherman-back-walk-2 | 24 × 32 | crew.py |
| character-fisherman-side | 24 × 32 | crew.py |
| character-fisherman-side-walk-1 | 24 × 32 | crew.py |
| character-fisherman-side-walk-2 | 24 × 32 | crew.py |
| character-fisherman-portrait | 64 × 80 | crew.py |
| character-coastguard-commander | 24 × 32 | crew.py |
| character-coastguard-commander-walk-1 | 24 × 32 | crew.py |
| character-coastguard-commander-walk-2 | 24 × 32 | crew.py |
| character-coastguard-commander-back | 24 × 32 | crew.py |
| character-coastguard-commander-back-walk-1 | 24 × 32 | crew.py |
| character-coastguard-commander-back-walk-2 | 24 × 32 | crew.py |
| character-coastguard-commander-side | 24 × 32 | crew.py |
| character-coastguard-commander-side-walk-1 | 24 × 32 | crew.py |
| character-coastguard-commander-side-walk-2 | 24 × 32 | crew.py |
| character-coastguard-commander-portrait | 64 × 80 | crew.py |
| character-salvage-foreman | 24 × 32 | crew.py |
| character-salvage-foreman-walk-1 | 24 × 32 | crew.py |
| character-salvage-foreman-walk-2 | 24 × 32 | crew.py |
| character-salvage-foreman-back | 24 × 32 | crew.py |
| character-salvage-foreman-back-walk-1 | 24 × 32 | crew.py |
| character-salvage-foreman-back-walk-2 | 24 × 32 | crew.py |
| character-salvage-foreman-side | 24 × 32 | crew.py |
| character-salvage-foreman-side-walk-1 | 24 × 32 | crew.py |
| character-salvage-foreman-side-walk-2 | 24 × 32 | crew.py |
| character-salvage-foreman-portrait | 64 × 80 | crew.py |
| character-elena-vos | 24 × 32 | crew.py |
| character-elena-vos-walk-1 | 24 × 32 | crew.py |
| character-elena-vos-walk-2 | 24 × 32 | crew.py |
| character-elena-vos-back | 24 × 32 | crew.py |
| character-elena-vos-back-walk-1 | 24 × 32 | crew.py |
| character-elena-vos-back-walk-2 | 24 × 32 | crew.py |
| character-elena-vos-side | 24 × 32 | crew.py |
| character-elena-vos-side-walk-1 | 24 × 32 | crew.py |
| character-elena-vos-side-walk-2 | 24 × 32 | crew.py |
| character-elena-vos-portrait | 64 × 80 | crew.py |
| false-light | 96 × 96 | story_props.py |
| ghost-schooner | 128 × 112 | story_props.py |
| sealed-cargo | 64 × 64 | story_props.py |
| anchor-eye-seal | 32 × 32 | story_props.py |
| torn-logbook-page | 48 × 64 | story_props.py |
| lighthouse-lens | 48 × 64 | story_props.py |
| keepers-star | 32 × 32 | story_props.py |
| wall-lights-plaque | 128 × 64 | story_props.py |
| captains-board | 320 × 192 | story_props.py |
| clue-frame-new | 144 × 192 | story_props.py |
| clue-frame-pinned | 144 × 192 | story_props.py |
| clue-frame-used | 144 × 192 | story_props.py |
| coin-icon | 16 × 16 | story_props.py |
| wallet-icon | 24 × 24 | story_props.py |

crew.py and story_props.py are called by generate.py. Pose palettes and hats/tools distinguish roles at the same 24×32 native scale as the explorer. The false light, misted schooner, eye/anchor seal, cargo, torn page, lens, star, plaque, empty clue-board background, three card frames and coin/wallet icons carry no readable case conclusion. GUI text remains separate HTML. Feature teams can select the card frames or board as art backgrounds while keeping titles/body text accessible.
