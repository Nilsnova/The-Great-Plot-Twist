# Original pixel-art register

Nils approved the top-down pixel presentation on 5 November 2026. G2/G3 preserves that style and expands it to the Saltreach Isles. Every sprite, background and chart is original, drawn by our editable project generator. The supplied game screenshot is local inspiration only, excluded from Git and runtime distribution. No artwork was extracted from it.

The shipped library contains **194 sprites and 10 backgrounds/charts, 204 PNGs total**. The new story kit is selectively loaded and adds no Lighthouse texture requests. The 36-sprite Lighthouse kit remains the default catalogue selection; the running app keeps nine explorer poses shared and loads only the current place's scenery. Sailing loads its boat image on demand. Other place and story-library sprites stay outside the Lighthouse preload.

The shipped library contains **241 sprites and 10 backgrounds/charts, 251 PNGs total**. The new story and festival kits are selectively loaded and add no Lighthouse texture requests. The 36-sprite Lighthouse kit remains the default catalogue selection; the running app keeps nine explorer poses shared and loads only the current place's scenery. Sailing loads its boat image on demand. Other place and story-library sprites stay outside the Lighthouse preload.

| Original G1 family | Sprites | Contents |
| --- | ---: | --- |
| Buildings and layers | 5 | Cottage, interior, matching window light, boathouse, lighthouse |
| Nature | 11 | Birch, oak, second broadleaf crown, pine, rock, shrub, flowers, grass tuft, fern, reeds, mushrooms |
| Explorer | 9 | Front/back/side, each with neutral and two stride poses; left mirrors the side |
| Coastal props | 11 | Sign, jetty, boat, crate, barrel, rope coil, lantern, bench, buoy, driftwood, gull |
| Selective place/story library | 12 | Harbour office, beacon, signal station, ferry pier, sailboat, dark schooner, sealed letter, torn page, logbook, compass, brass star, beacon fire |

## G2/G3 sprite additions

See also the [G13 festival workshop additions](#g13-festival-workshop-additions).

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
| `places/title.png` | 480 × 300 | Static title composition from original ground and sprites; title.py |
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

The normal pixel workshop omits the ten masked-captain variants. An explicit /asset-library.html?demo=1 rehearsal view includes every registered asset. The application has no default title/identity pairing; the story caller supplies any reveal art at the finale. No external image or font was added.

## G5 shell, audio and demo provenance

The title adds one original **480 × 300** background, `public/places/title.png`, registered as `titleBackdrop` in `src/pixel/catalog.js`. `scripts/pixel_art/title.py` composes only our own ground, trees, cottage, lighthouse and small coastal sprites, without smoothing. The main generator rebuilds it alongside the existing art. The current total is **182 sprites + 10 backgrounds/charts = 192 PNGs**. The title displays at whole CSS multiples and crops to the screen; it does not load Three.js. Its small 64 × 64 lighthouse emblem is drawn directly by `src/shell/screens.js`, at integer display sizes.

Every G5 sound is original executable Web Audio synthesis in `src/audio/`: deterministic noise for sea/wind/rain, oscillator envelopes for steps/clicks/blips/horn/beam, and the original 16-step coastal motif in `music.js`. There are no sound recordings or audio files and no external font or asset requests.

`src/demo/intro-story.json` is a byte copy of the public `backend/content/story.json` (Story v2), kept equal by `tests/demo-content.test.js`. It contains only the intro story, never the secret case. The tour runs it with the unchanged engine and a memory-only adapter. `src/demo/recorded-weather.json` is a small adapted subset of `backend/content/weather/recorded-fallback.json`: the 5 November 17:00 Torshavn sample, recorded at 17:14:33 UTC. Cloud cover is divided by 100 and wind (13.7 km/h) by 72; precipitation/fog are zero in this recorded sample. Fog and storm tour beats are explicitly labelled local overrides. Credit: **Weather data by Open-Meteo.com, adapted for the game** ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). No provider is called by the demo modules.

The in-game Credits view reads `src/shell/team.js`: Nils Lenke and three `<name>` placeholders for teammates to replace in their own first pull requests, with no student numbers. It includes Open-Meteo/adaptation/licence links, Binance live-data credit and Binance Vision recorded-replay credit (CC BY-NC-SA 4.0, reduced to one-minute closing prices for 90 minutes) and the same tool licences as this register: Three.js/Vite/Vitest MIT, Playwright Core Apache-2.0 and Pillow HPND. No new dependency was added for G5.

### G6 Relighting additions

Three original, code-authored sprites in `scripts/pixel_art/relighting.py`, registered in `src/pixel/story-catalog.js`. Same project-authored licence as the existing kit; no outside art or fonts. These stay outside the Lighthouse Isle preload.

| Id | Native size | Anchor | Purpose |
| --- | --- | --- | --- |
| `lens-hall-open` | 144 × 160 | 12 px | Gull's Rest open-state hall with a ridge lantern, stonework and welcoming windows |
| `festival-lantern-string` | 160 × 48 | 4 px | Coastal festival lanterns in gold, sea-glass and muted coral |
| `wall-of-lights-open` | 128 × 96 | 8 px | Harbor's public Wall of Lights; captain names are accessible adapter-supplied HTML |

The kit now contains 185 sprite PNGs plus ten existing backgrounds, 195 PNGs total. Festival fireworks are deterministic WebGL points authored in `src/world/festival.js`, with no audio/image dependency; they are disabled for reduced motion and use fewer points on low quality. New art is display-only and contains no names, case prose or solution. Rebuild with `python3 scripts/pixel_art/generate.py`.

## G7 presence emotes

Five original speech bubbles, authored in `scripts/pixel_art/emotes.py`, registered by id in `pixel/story-catalog.js`: `emote-wave`, `emote-cheer`, `emote-point`, `emote-lantern`, `emote-shrug`. Each is 24 × 24 native pixels with transparent surroundings. No external source, font, logo or character name. Generate with `python3 scripts/pixel_art/generate.py`. Catalogue total: 190 sprites plus 10 backgrounds, 200 PNGs. The existing 195 images are unchanged.

G7 Gull’s Rest reuses `lighthouse-lens`, `keepers-star`, `lantern`, `lens-hall-open` and `festival-lantern-string` in its open state. `world/places/gulls-rest-life.js` authors six small shore-wave quads and three V-shaped gull marks directly in geometry (two draw calls), plus lantern-string flicker. These are original code shapes, snapped to the same 16-pixel grid, with no new image, font or recording. Reduced motion keeps them still; the place lifetime owns every allocation.

## G8 islet scenery

Four original additions in `scripts/pixel_art/islet.py`, registered in `src/pixel/catalog.js` and loaded only on Home islet. `python3 scripts/pixel_art/generate.py` regenerates them with the existing kit; the previous 200 images remain unchanged.

| Sprite id | Native pixels | Purpose |
| --- | --- | --- |
| `islet-empty-plot` | 56 × 64 | Timber parcel marker, without miniature text |
| `islet-locked-sign` | 64 × 72 | Closed padlock sign for plots coming later |
| `islet-signal-station` | 80 × 128 | Small stone station and cedar signal mast, unlit |
| `islet-signal-station-lit` | 80 × 128 | Matching station with a steady gold lens at night |

The existing cabin, workshop, windmill and greenhouse retain their approved original art. Visibility comes from the latest accepted building event. Build dust is five pooled code-authored pixel points per plot; the storm mast is original flat pixel geometry. These shapes add no external image or font. All materials, textures, geometry and subscriptions belong to their place lifetime. The signal station keeps the same id and artwork through world and finale presentation.

## G8 harbor life, signal and original sound

No image, font or audio download is used. `world/ambient/harbor-life.js` draws pooled, native-grid cabin smoke, one steady night window, three greenhouse-roof gull marks (only on a built greenhouse) and three extra harbor gulls in clear weather. `world/hook/index.js` draws a tiny offshore signal from four original meshes; its chart equivalent is an accessible UI marker. Geometry is allocated once, and place/app lifetimes release it. Reduced motion keeps ambient details and the signal still.

New sounds are synthesized through the existing Web Audio effects bus in `audio/controller.js`, `synth.js` and `logic.js`:

| Cue | Original source | Maximum source gain | Visible equivalent |
| --- | --- | ---: | --- |
| Bulletin paper | Short filtered noise | 0.016 | Open bulletin and caption |
| Building settles | Short rising tones | 0.035 | Building appearance/dust and caption |
| Storm flag | Brief noise snap | 0.021 | Raised storm flag and caption |
| Distant signal | Faint tone | 0.018 | Signal marker/pattern and caption |
| Lit station | Sustained sine hum | 0.009 | Steady gold station lamp |

The existing original foghorn is reused on supplied fog nights, with a caption. Storm wind/sea/rain use the G5 synthesis. Master/effects preferences multiply these gains; nothing starts before a trusted click or key. The audio owner stops the hum, one-shot voices and semantic listeners on disposal. The same project licences and team authorship apply; no new third-party licence is needed.

## G13 festival workshop additions

Original work by Codex for Nils, 6 November 2026, using the project's coastal
palette and integer pixel grid. No downloaded art, fonts, recordings or samples.
These 56 additions are `library` assets, searchable as "festival" in
`asset-library.html`; none enter the game's 36-sprite default preload. Existing
G6 lantern strings and festival presentation are preserved.

| Sprite ids | Count | Native pixels | Editable source |
| --- | ---: | --- | --- |
| `festival-lamp-01` through `festival-lamp-12`, each `-unlit`, `-lit`, `-unlit-night`, `-lit-night` | 48 | 48 × 80 | `scripts/pixel_art/festival.py` |
| `festival-claim-marker`, `festival-claim-marker-night` | 2 | 32 × 40 | same |
| `festival-stall`, `festival-stall-night` | 2 | 112 × 96 | same |
| `festival-bunting`, `festival-bunting-night` | 2 | 160 × 40 | same |
| `festival-duel-ring`, `festival-duel-ring-night` | 2 | 160 × 112 | same |

All anchors and dimensions live in `src/pixel/festival-catalog.js`. Rebuild with
`python3 scripts/pixel_art/generate.py` from `frontend/` (Pillow for authoring only).
The lamps use three roof silhouettes and four collar patterns to distinguish the
twelve spots without printed labels or story information. Night palettes use cool
wood and iron with warm light confined to lit glass.

The four original mono, 16-bit, 22,050 Hz WAVs in `public/audio/` are synthesized
from sine harmonics by `python3 scripts/festival_audio.py`, using only Python's
standard library. Their melodies, envelopes and bell timbre are original.

| File | Duration | Purpose |
| --- | ---: | --- |
| `festival-loop.wav` | 8 s, looping | Four phrases of a lantern dance, chimes over low tones |
| `festival-claim.wav` | 0.9 s | Three rising chimes confirming a claim |
| `festival-ring-bell.wav` | 1.6 s | One damped metal bell |
| `festival-timer-end.wav` | 1.4 s | Four falling chimes, a quiet ending |

The workshop provides labelled native controls and text equivalents; it never
autoplays, downloads audio eagerly or mixes two auditions. The opt-in festival
screen now plays these recordings through the existing trusted-gesture audio
owner, shared music/effects preferences and captions. Its loop starts only after
Play and stops when the panel closes. Live interaction requires the server's
`festival` flag; explicit local rehearsal creates no server writes.
