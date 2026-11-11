# Saltreach Isles graphics

> **10 Nov 2026: the mystery left the game** (D031 in [DECISIONS.md](../docs/DECISIONS.md), [PITCH.md](../docs/PITCH.md)). The sections below on Act 1 in the browser, the demo tour, the case adapter, board, finale, reveal, relighting, rewards, partners in the world, the Captain’s Log and hints, the golden path, Gull’s Rest, the Chapter 2 hook, the presenter kit, the festival frontend and the bulletin describe screens and checks that were removed on 10 Nov. They stay as history; their files and `npm run` scripts no longer exist.


The approved direction is original, code-authored top-down pixel art, selected by Nils on 5 November 2026. G2/G3 extends the approved Lighthouse Isle into seven owned places. G4 adds the reusable UI kit, original story art, five finale beats and the playable original intro (S2). G5 adds the title/pause shell, shared settings, original procedural audio, touch/gamepad controls, the local highlights tour and lazy loading. G6 puts the case screens behind one adapter; G7 adds account/presence, rewards, partner life, the log and complete local-case checks. G8 draws accepted islet builds, the supplied harbor day and distant signal, and adds the class presenter kit, accessibility audit and code walkthrough. Rich greens, tan paths, clustered foliage and selective dark outlines keep the explorer and landmarks readable. Gold is reserved for lights, interaction and clues. The old paper studies are archived and excluded from the active build. The supplied style reference is excluded from Git and runtime art.

## Run, controls and readability

From the worktree root, `cd frontend`, then `npm install`, `npm run dev` and open Vite's address. Use the Node versions in package.json. `npm run build` writes dist and `npm run preview` serves it. `/asset-library.html` is the searchable pixel workshop; `/ui-kit.html` is the separate component gallery. Choose **New game** on the title, or **Continue** for this browser’s intro save.

| Input | Action |
| --- | --- |
| WASD / arrows, Shift | Walk, run without a diagonal speed boost |
| E | Interact once per held press |
| M / Sea chart button | Open the chart; Tab/arrows choose, Enter sails, Esc closes |
| Enter / Skip passage / Esc | Skip sailing; the landing panel stays until assets finish loading |
| Fast travel on chart | Skip the passage animation |
| Wheel | Discrete 1×/2× zoom |
| T; 1 / 2 / 3 / 4 | Fast clock; clear / overcast / storm / fog |
| Settings; Escape | Preferences; close the top view or pause/resume the world |
| Touch stick / Interact / Chart / Menu | Touch movement, investigation, travel and pause |
| Standard gamepad | Stick/D-pad, A interact, Y chart, Menu pause; D-pad/A in menus |

UI typography is independent of pixel-art resolution. Main labels and controls now use at least 16 CSS px, case body text 18 px, story/reveal text 19 px and headings 26–32 px. Hotspot names and chart destinations use 18 px. Laptop layouts retain readable text rather than shrinking the interface with the art. Chart destinations are native buttons in a modal dialog with focus and keyboard navigation. Reduced motion skips sailing and character stride/bounce. Touch controls, optional gamepad and 375 px menu/HUD layouts are implemented in G5; see Controls below.

The close camera follows the player and keeps extra headroom near the Lighthouse tower. Cottage roofs reveal the interior/desk; foreground trees fade. Piers draw beneath the explorer and are walkable; open sea is blocked. The Harbor Office's matching window overlay glows at night and is visible from the dock spawn. It supplies no story explanation.

## Art, coordinates and ownership

The library has **194 original sprites and 10 backgrounds/charts** (204 generated PNGs). ASSETS.md records every new sprite, its source and dimensions. Rebuild with `python3 scripts/pixel_art/generate.py` using Pillow for offline authoring only. No external image, font or model is used.

One world unit equals **16 native pixels**. Nearest sampling, no mipmaps/antialiasing, integer CSS magnification, snapped art and discrete camera zoom preserve the grid. At 1440 × 900 the native framebuffer is 480 × 300 displayed at 3×; DPR does not enlarge it. The 448 × 256 chart uses integer magnification. Low quality reduces rain/waves and uses a short flat passage/fade fallback.

Logical positions use X/Z and +Y ground height. Drawing projects `{x, y:-z*.72}`; terrain elevation never lifts drawn feet. Render order increases with logical Z except ground/sky/light layers. `places/surfaces.js` is the canonical coast for new places and their offline backgrounds. Existing Lighthouse terrain/collisions are retained. `loadArt(ids = pixelArtIds)` validates ids; placeArt reuses anchored materials. Nine explorer textures are shared; only the current place's scenery/textures are loaded. Sailing's small boat image is loaded on demand.

`createPlace({id, ...ctx})` in world/places/factory.js returns `{id, group, zones, anchors, colliders, lights, update(dt, state), dispose()}`. Optional ctx adapters provide texture loading for tests, canvas/camera for plot clicks, and the existing bus. The second argument is optional: update(dt) has its own daylight clock/weather fallback, or ctx.readState supplies state. Main passes `{player,time,night,weather}`; place composition has no story/backend rules. Additional `spawn` and `groundHeight(x,z)` fields configure the controller.

`createWorld(ctx)` in places/manager.js exposes current, busy, goTo(id, options), interact(id), update and dispose. Trips follow the marked route network, possibly through intermediate junctions without loading those places. Unknown/locked/same-place/overlapping trips are refused. Travel disposes the departure root, geometries, materials, maps and owned subscriptions before loading the destination. A passage/landing dialog covers the gap, then one new root is attached. Static texture loads time out after 15 seconds and dispose any late result. Failed loads recreate the departure; failed/late attachments dispose their allocations. Repeated dispose is safe. Shared explorer, weather, water and sky are app-owned and disposed on teardown.

`world.setRelightingComplete(true)` is an explicit integration hook for the later story/world-state owner, default false. This pass never infers or saves a solve. Reversing the gate still permits departure from Gull's Rest. `homeBuildings` in places/layouts.js is a plain visual placement list. Four plots emit selections; no saving/building economy is implemented.

## Places, hotspots, lights and events

The single registry is `src/world/places/registry.js`. IDs are unique within their namespace; light ids harbor_light and islet_signal_station intentionally also name hotspots. Use these exact machine ids even where descriptive story text differs.

| Place id | Meaning |
| --- | --- |
| `lighthouse_isle` | Original first island, cottage interior, jetty and lighthouse |
| `saltreach_harbor` | Shared visual hub, thirteen hotspots and nighttime office windows |
| `home_islet` | Four build plots and a signal station |
| `smugglers_cove` | Back-room, cave and arena-gate scene stub |
| `wreck_point` | Salvage yard and beach scene stub |
| `the_teeth` | Reef, ruined tower, raid arch and fog scene stub |
| `gulls_rest` | Locked islet, unnamed on the chart until external Relighting |

| Hotspot id | Place and meaning |
| --- | --- |
| `cottage` | lighthouse_isle, cottage entrance |
| `desk` | lighthouse_isle, Elena's writing desk |
| `shore` | lighthouse_isle, old jetty |
| `tower_door` | lighthouse_isle, lighthouse entrance |
| `keepers_lamp` | lighthouse_isle, separate lamp-post interaction |
| `harbor_office` | saltreach_harbor, office entrance |
| `harbor_office_window` | saltreach_harbor, visible office window |
| `harbor_light` | saltreach_harbor, coastal beacon |
| `ferry_pier` | saltreach_harbor, ferry landing |
| `jail` | saltreach_harbor, jail entrance |
| `market_hall` | saltreach_harbor, Island Exchange |
| `prediction_kiosk` | saltreach_harbor, prediction counter |
| `sports_pavilion` | saltreach_harbor, sports building |
| `signal_station` | saltreach_harbor, signal building |
| `notice_board` | saltreach_harbor, reward notice |
| `captains_table` | saltreach_harbor, crew clue table |
| `keepers_post_room` | saltreach_harbor, keeper-permit post counter |
| `wall_of_lights` | saltreach_harbor, public captain names |
| `plot_1` | home_islet, cabin plot |
| `plot_2` | home_islet, workshop plot |
| `plot_3` | home_islet, windmill plot |
| `plot_4` | home_islet, greenhouse plot |
| `islet_signal_station` | home_islet, signal station |
| `home_driftline` | home_islet, washed-up crate spot |
| `back_room` | smugglers_cove, back-room entrance |
| `low_tide_cave` | smugglers_cove, low-tide cave entrance |
| `arena_gate` | smugglers_cove, arena entrance |
| `salvage_yard` | wreck_point, salvage shelter |
| `yard_gate` | wreck_point, timed yard-gate search |
| `beach` | wreck_point, wreck beach |
| `reef` | the_teeth, reef rocks |
| `watchtower_ruin` | the_teeth, ruined tower |
| `raid_arch` | the_teeth, raid entrance |
| `fog_bank` | the_teeth, northern fog edge |
| `gulls_rest_dock` | gulls_rest, open dock and public festival |
| `lens_store` | gulls_rest, recovered lens and supplied keepsakes |
| `keepers_star` | gulls_rest, Keeper’s Star display |

| Anchor id | Meaning |
| --- | --- |
| `stairwell` | Lighthouse logical stairwell position, also exported by world/lighthouse.js |
| `lamp_room` | Lighthouse logical lamp-room position above stairwell |

Drawn camera equivalents remain cameraAnchors in lighthouse.js. view.pause stops follow, direct camera placement/updateProjectionMatrix selects the shot, and view.start resumes. Controller input needs its own gate for future cutscenes.

| Light id | Meaning |
| --- | --- |
| `keepers_lamp` | Lighthouse lantern, beamOrigin in drawn X/Y/Z |
| `harbor_light` | Harbor beacon lantern, beamOrigin in drawn X/Y/Z |
| `islet_signal_station` | Home signal mast, beamOrigin in drawn X/Y/Z |
| `ruin_light` | Teeth tower window, beamOrigin in drawn X/Y/Z |

| Event | Meaning |
| --- | --- |
| `{type:'travel',to}` | Accepted departure to the exact place id |
| `{type:'arrived',place}` | Destination attached and controller/camera positioned |
| `{type:'interact',id,place}` | Exact current hotspot id and owning place; once per E press |
| `{type:'plot_clicked',plot}` | Home selection, plot is the exact string plot_1 through plot_4 |

Events use existing core/events.js on/emit, with unsubscribe returned by on. Extra place on interact preserves the old id field. Story labels map “Harbor Office” to harbor_office, “Island Exchange” to market_hall, “Captain's Table” to captains_table, “Keeper's lamp” to keepers_lamp and “Relighting” to the external gate; these descriptions introduce no alternate machine ids.

`setWeather({cloudCover,rain,fog,wind})` and getWeather remain in world/weather.js. Values clamp to 0–1; omitted, unknown or invalid values preserve state; snapshots are copies. Wind controls passage speed and waves, with normal travel about 4.2–6.3 seconds. The L1 client now reads GET /api/weather at startup and every ten minutes, so real wind drives sailing and waves. Manual visual presets remain available. `createCharacter(art,{reducedMotion})` retains group, sprite, face and animate; group.position holds logical position and sprite is drawn separately. Remote players can reuse it without local controller input.

## Verification and performance

Run from frontend: `npm test`, `npm run build`, `npm run test:world`, `npm run test:readability`, `CAPTURE_PREFIX=World npm run test:browser`, `CAPTURE_PREFIX=World npm run test:production`, `npm run test:art` and `npm run test:art:production`. Browser checks use installed Chrome or CHROME_PATH, no download; GPU runs are sequential. World checks cover all 29 actual hotspots and payloads, pointer plots, keyboard chart/skip, office glow from docks, locks, external unlock, reduced motion, low quality and ten complete Lighthouse↔Harbor round trips. JSON and real gameplay captures use captures/20261105_World-*.

The target remains 60 FPS, <150 draw calls and <150,000 submitted triangles. The previous G1 baseline was 60–61 FPS, at most 100 calls/195 triangles in short headless Chrome 157 samples on this Mac. This is not a sustained or cross-device guarantee. The final G2/G3 world run passed 55 browser assertions with no console/WebGL errors or external requests. Six unlocked places measured 60–61 FPS in 90-frame samples, 27–97 calls and 54–192 triangles. The full weather/retina regression measured 57–61 FPS, at most 100 calls and 195 triangles. An earlier diagnostic sample hit 21 FPS immediately after synchronous GPU pixel readback; the final benchmark measures before that visibility diagnostic to avoid timing its artificial stall.

| Lighthouse resource/performance check | Before trips | After 10 round trips |
| --- | ---: | ---: |
| Active place roots | 1 | 1 |
| Place root children | 10 | 10 |
| GPU geometries | 96 | 96 |
| GPU textures | 27 | 27 |
| Draw calls | 97 | 97 |
| Submitted triangles | 192 | 192 |
| FPS, 90-frame sample | 56 | 60 |

Every return in the ten-cycle run had the same geometry/texture/object counts. Reduced-motion travel completed in 77 ms including local loads; an unskipped wind=1 passage took 4,216 ms. Readability passed at 1365×768, 1920×1080 and 1100×700: 14 px primary controls, 16 px hotspot/chart names, no chart-label overlap or horizontal overflow, settings inside the viewport. Unit tests: 36 passed in 8 files; production build succeeded. Vite reports the existing Three.js bundle-size advisory (~593 kB game chunk), not a build failure.

The preceding measurements are the G2 baseline. Current G4/S2 evidence is recorded below. Other browsers/GPUs, touch movement, a sustained long-session soak, live L3 solved-crew/reward integration and cloud home saving remain unverified or owned by other packages.

## File map and handoff

main.js owns the small title bootstrap; game.js wires the loaded world and frame loop. world/places/registry.js owns identifiers; manager.js owns travel; factory.js, lighthouse.js, settlement.js and home.js compose places; layouts.js and surfaces.js hold plain placement/coast data; resources.js owns disposal. ui/chart.js, sailing.js and readability.css provide accessible travel and larger text. scripts/pixel_art contains all editable art; tests/place*.test.js and scripts/check-world.js verify the new contracts.

Current branch is `feat/g8-islet-harbor-demo`, created from finished G7 and merged with `origin/main` at `8ff24cc77ab077e5d24fee297d568558315f6ed5`. The coordinator owns contracts, composition, shared hooks, scripts and these graphics/asset docs; delegated streams own disjoint folders. G8 changes only frontend files plus the authorised G-lane Next steps and checkpoint Log entries in docs/STATUS.md. Claude integrates; this branch does not merge into main or deploy. Transport, the real adapter, story data/engine, backend and Claude-owned panels are outside this work. See [HOW-IT-WORKS.md](HOW-IT-WORKS.md) for the class walkthrough, ten-file reading path and twelve explain-back cards.

The earlier G2 check covered 77 PNGs; the G4 and G5 sections below record their larger libraries and current verification separately. Checks in this file are scoped to graphics. Backend changes are owned and verified by their lanes.

## UI kit

The public entry is src/ui/kit/index.js; import src/ui/kit/kit.css once. Factories return `{element, dispose}`; append element to your container. Components with changing content also expose update(data). All supplied strings use textContent, never interpolated HTML. No framework, DOM test dependency, wallet rule, trading logic or board rule is included. The built `/ui-kit.html` gallery demonstrates real components with fictional sample data and readable 14–17 px text.

| Factory | Use |
| --- | --- |
| createPanel({title,body,tone}) | Labelled section; body is text or a caller-owned DOM node |
| createButton({label,onClick,disabled,variant}) | Native action, primary or quiet; update label/disabled |
| createIconButton({label,icon,onClick}) | Decorative text icon with a spoken action label |
| createTabs({items,selected,onChange}) | Items have id/label/body; select(index); arrows/Home/End work |
| createTable({caption,columns,rows}) | Native table; columns have key/label, rows are display data |
| createModal({title,body,onClose,onCancel}) | open(parent,focusTarget), close(reason); Escape and invoking focus |
| createToast({duration}) | show(text,ms), hide(); polite status and owned timeout |
| createDialogue({speaker,text,choices,portrait,onChoice}) | update(data), complete(), focus(); Enter skips, 1–9/arrows choose |
| createClueCard({title,body,state,onPin}) | State new/pinned/used; button emits intent without changing board data |
| createHudBar({coins,place,weather,time,seats}) | Display supplied values; seat has name/kind player or npc |
| createMiniChart({values,halted,label}) | Native SVG sparkline; no price fetching or trade decisions |
| createProgress({label,value,max}) | Native labelled progress; values supplied by the feature owner |

**Design tokens and the one panel (lane U, 11 Nov).** `kit.css` (cold path) defines the tokens on `:root`: colours `--u-sea` (panel), `--u-card` (card inside a panel), `--u-raise` (hover), `--u-deep` (outline and shadow), `--u-ink` / `--u-mute` (text), `--u-parch` / `--u-pink` (parchment and its ink), `--u-brass` (frame), `--u-gold` (primary action and highlight only), `--u-brown`, `--u-rust` (danger), `--u-line`; spacing `--u-1`…`--u-6` (4, 8, 12, 16, 24, 32 px); type `--u-sm` 16, `--u-md` 18, `--u-lg` 22, `--u-xl` 27 px with `--u-font` (system sans) for text and `--u-serif` (Georgia) for titles. Every `createModal` gets the panel: a notched brass pixel frame drawn with hard box-shadows (no images), a parchment title plate that stays put while the body scrolls, and the close button. `.kit-button` is the one primary (gold) button; `.kit-quiet` is the secondary. `kit/components.css` (lazy) holds cards (`.kit-panel`), tabs, tables, chips (`.u-chip`, `aria-pressed`), a segmented toggle (`fieldset.u-choice` of native radios) and a switch (`input.u-switch`), plus the dialogue, HUD bar, chart and progress styles. `open-panels.css` gives every panel's inside one card, notice, field and danger style. Toasts: `src/ui/toasts.js` (one style, top-center, at most two, errors add a next step). The play HUD (`src/ui/hud.js`, `hud.css`) keeps 🪙, the quest strip and Menu. Text floors stay 16 px for controls, 18 px for body.

Dialogue choices are disabled while text types; choices can also have disabled and hint fields from the engine. Holding a numbered key does not repeat an action. Enter or a choice key first reveals the whole line, then a later activation chooses. Screen readers receive the completed line, not a live announcement per character. Reduced motion reveals text immediately. Portrait is {src,alt,width,height,scale}; use registered local PNG art. Defaults are 24×32 at integer scale 3; 64×80 portraits use scale 1. External portrait URLs are rejected. Modals restore the opener's focus, native buttons retain visible focus, and dispose cancels all owned listeners/timers/frames. pause() stops a hidden dialogue’s typewriter; update(data) starts its new line. Dispose child components separately when a panel merely hosts their element. Pure logic tests cover typing/skip, choice keys, supplied integer coin formatting, chart scaling and progress; browser checks cover DOM behaviour and hostile text.

## Cinematics

world.cinematic(name,params) returns a promise resolving to {name,stage}, or false for invalid/overlapping requests. Events are exactly {type:'cinematic',name,stage}; stage is started, completed, skipped or cancelled. Escape skips. Reduced motion draws the final safe frame and settles as skipped after local art loads. Loading is bounded to 2.5 seconds; the full deadline is duration + 3 seconds, always below 15. World disposal cancels the shot, unsubscribes and removes its dialog/images. One underlying place remains loaded; these shots use an owned 448×256 canvas with nearest/integer magnification, not several simultaneous island scenes.

| Name | Duration | Visual and params |
| --- | ---: | --- |
| three_lights | 8s | Three registered light origins turn toward target over the Teeth; optional lights and target |
| fog_lift | 5s | Pixel fog parts around the ship lamp |
| schooner_reveal | 6s | The original dark schooner appears through the mist |
| unmask | 5s | A masked figure on the deck; optional revealAsset supplied by an authorised story caller |
| relighting | 8s | All four registered lights illuminate and the chart fog lifts |

lights is an array of three unique registered light ids for three_lights, default keepers_lamp/harbor_light/islet_signal_station. Chart origins are place.chart + {beamOrigin.x/2,-beamOrigin.y/2}, snapped to native pixels, using the exact registry metadata. target is {x,y} in native 448×256 chart pixels, default the Teeth marker; out-of-bounds targets are refused. ruin_light is included in relighting. revealAsset may be a registered base character id, never a URL. No culprit mapping, personal identity or reveal line is bundled. Default unmask and the demo remain anonymous. Ordinary art-workshop views omit masked variants; ?demo=1 explicitly includes them for rehearsals.

The existing finale bus listener accepts event.stage only when it exactly matches one of these five visual names. Unknown draft L3 stages are ignored; no server stage enumeration or solve rule is invented. ?demo=1 exposes a keyboard-accessible visual selector in development and production, with no identity parameter or world-state mutation. Relighting is presentation only: the state owner separately calls world.setRelightingComplete after its server decision. Cinematics block movement, hotspots, travel and atmosphere shortcuts and clear held input on entry/exit.

## Act 1 in the browser (S2)

src/story/intro.js listens only to cottage/desk/shore/tower_door on lighthouse_isle. E opens the kit dialogue, lazily reading GET /api/content/intro-story once per page. The original S1 Game, story JSON, saves.js and storage.js remain byte-identical to main. Text, notes, visible/locked actions, inventory and ending content come directly from that engine, inserted with textContent. Stairwell and lamp_room are panel scenes; the player stays at the physical tower hotspot. There are no sign-in, wallet, market or shared-case writes.

intro-adapter.js supplies atomic visit(id), perform(id), reset(), view, state snapshots and a cloned actions[] getter. Plain navigation follows allowed goto edges without item/flag effects or endings; shore→desk records shore_back then to_desk. A whole hotspot path is replayed on a candidate before commit. Refusals change no engine state, journal or action log. View/move labels are copies, so UI code cannot mutate story data. Locked actions show the engine’s reason and ignore numeric activation.

world.intro.actions exposes the accepted move ids for the future referee. Local storage contains only a versioned move journal, replayed with the unchanged engine on reload; malformed/stale journals are discarded and storage failure leaves the game playable. No local ending is an authoritative server verdict. Reaching an ending emits exactly {type:'intro_ended',ending}, where ending is ending_rescue or ending_trapped. It emits once for the accepted ending action, not on reload or reopening its card. A new local intro resets only this journal. Inventory, readable move history, notes, original ending card and return/new-intro buttons are in intro-view.js. Closing pauses hidden typing and restores game focus.

For local play run the API from backend with uv run --frozen uvicorn main:app --host 127.0.0.1 --port 8000, then npm run dev in frontend. Vite dev and preview proxy /api to that server; deployment uses the existing Vercel routing. npm run test:intro requires that local API and plays both endings through the real route. Other graphics smoke checks isolate the intro read with the unchanged real-story fixture; they are not API integration claims.

## Live-weather wiring

The existing startLiveWeather({setWeather,onUpdate}) starts only after Lighthouse place loading succeeds, as INTERFACES.md specifies. Its stop function runs during app disposal. onUpdate retains the supplied answer for the world and emits {type:'weather_updated',source,fetchedAt}. Source, adaptation and CC BY 4.0 links appear only under Settings → Credits, as Nils requested on 6 November; they are never mounted in the gameplay HUD. The L1 module, API and provider logic are untouched. The legal/source links are text, not external visual assets. The original manual atmosphere controls still work.

Graphics tests intercept /api/weather with deterministic responses to avoid provider variation; test:weather:wiring proves those values reach getWeather and checks both attribution links under Settings → Credits and confirms the gameplay HUD has none. S2 browser tests use the real intro endpoint while weather is isolated. No auth/config/me/trading/board/reward route is called by this graphics implementation.

## G4/S2 verification

Final commands run from frontend are listed below. Tests use installed Chrome with no browser download; browser/GPU runs are sequential. Evidence is in captures/20261105_G4-*, Pixel art-check JSON and the World round-trip/readability reports.

| Command | Result |
| --- | --- |
| npm test | 143 tests passed in 16 files |
| npm run build | built: game, asset workshop and UI-kit gallery |
| npm run test:ui | 19 browser checks passed |
| npm run test:ui:production | 16 browser checks passed |
| npm run test:intro | 16 checks, both original endings through the actual API |
| npm run test:cinematics | 22 checks; 60 FPS active; Escape/reduced motion/disposal |
| npm run test:weather:wiring | three checks: values, credits and errors |
| npm run test:readability | 1365×768, 1920×1080 and 1100×700 passed |
| npm run test:world | 55 checks; 10 round trips, stable resources |
| CAPTURE_PREFIX=G4 npm run test:browser | 19 movement/weather/retina checks passed |
| CAPTURE_PREFIX=G4 npm run test:production | seven built-game checks passed |
| npm run test:art | 191 PNGs decoded; public/rehearsal visibility and integer scaling passed |
| npm run test:art:production | 191 PNGs decoded in static build |

| Current performance / ownership | Before | During cinematic | After cinematic / 10 round trips |
| --- | ---: | ---: | ---: |
| FPS | 60 | 60 | 60 / 60 |
| Draw calls | 97 | 97 | 97 / 97 |
| Triangles | 192 | 192 | 192 / 192 |
| GPU geometries | 96 | 96 | 96 / 96 |
| GPU textures | 27 | 27 | 27 / 27 |
| Place roots | 1 | 1 | 1 |

The normal three-light shot took 8,016 ms including local loading; reduced motion settled in 11 ms in the sample. Other shots are 5–8 seconds plus bounded local loading, below 15 seconds. Weather/retina regression samples remain around 60 FPS. All 191 original PNGs regenerated byte-identically; see the art reproducibility JSON. The local weather API returned 200 with source live and valid cloud/rain/fog/wind plus attribution on 5 November. The current Vite game chunk is about 611 kB; its existing size advisory is not a build failure.

Not verified: other browsers/GPUs, actual screen-reader software, touch movement, a sustained soak, authenticated cloud saves/referee/rewards, L3 server authorisation/solve-state integration, or long-term provider availability. No new dependency was needed. Incoming engine, weather, backend, auth-check and infrastructure code is unchanged from main. State/referee teams own any award or shared unlock; the kit does not decide balances, trades, deductions or solves.

## Game shell (G5)

`src/main.js` is the small title entry. It owns the shell, audio and preference lifetime, and imports `game.js` only after New game, Continue or the explicit demo action. `shell/controller.js` uses one native dialog for title, pause, settings and credits; all supplied text uses safe DOM helpers. The title's static original backdrop and canvas emblem load without WebGL. New game enters the original intro on Lighthouse Isle and resets only its local move journal. Continue replays that journal and opens its saved scene, inventory or ending. A structurally valid but no-longer-replayable save gets a visible fresh-intro notice. Normal intro content still comes from the existing API, with the existing timeout/retry UI.

Escape closes the top story/chart/cinematic view first; from the world it opens Pause. Resume restores canvas focus. Credits are reached only from Settings. Credits Back/Escape returns to Settings, then Settings returns to the title or pause menu that opened it. The native menu traps Tab/Shift-Tab, restores a visible invoking control, and blocks movement, interaction and travel through the existing world lock. Returning to title does not erase the intro. **A2 hook:** replace the `onPlay(resume)` callback in `main.js` with a cloud-aware loader when that package exists; `game.begin(resume)` and `world.intro.actions` remain presentation/replay hooks. No account token, captain state or server verdict is fabricated here. Integrate feature controllers beside intro/chart in `game.js`, passing the existing world and audio cue callback; keep the title bootstrap small. `window.__island` remains development-only and is not a production integration API.

Credits display four `<name>` placeholders, no student numbers, data/adaptation/licence links and the tool licences from ASSETS.md. They contain no case solution or identity pairing.

## Settings

`settings/logic.js` defines the only stored preference fields: `quality` (`high`/`low`), `master`, `music`, `effects` (0–1), `reducedMotion` (`null` follows the device, or explicit true/false), `textSpeed` (24/36/60 characters per second, 0 instant), and `colourblind` (boolean). Storage key `plot_twist_preferences_v1` contains `{version:1,preferences}` with only those allow-listed fields. Malformed/old values use defaults, volumes clamp, and denied storage keeps the current visit playable. It never stores a login token.

`getPreferences()`, `setPreferences(patch)` and `onPreferences(listener)` are the shared client preference API. `reducedMotion()` resolves the cached system media query and user override. App cleanup removes the media listener. Preferences apply to quality/density, audio buses, dialogue typing, sprite walk/bounce, water/rain, beam movement, sailing, cinematics and CSS transitions. Instant/reduced dialogue completes immediately; existing text speed can change without resetting the line. Cinematics settle to a final still when reduction is enabled. The colour-blind option uses cream/cyan light, double focus/interaction outlines, a diamond status mark and non-colour chart/card distinctions; normal mode keeps gold. Gameplay never depends on colour alone.

## Audio

All sound is original Web Audio code in `src/audio/`, with no audio files. `controller.js` constructs/resumes an AudioContext only after a trusted pointer-down or keydown. There is no autoplay allocation on a cold title. One master bus feeds the destination; music and effects buses feed master, so effective levels are `master × music` and `master × effects`. Zero volume is applied immediately; other changes ramp briefly to avoid clicks. Missing/blocked audio leaves all visual controls usable.

`ambience.js` filters a deterministic noise buffer into sea, wind and rain, following the current four-value weather snapshot rather than just network events, so live weather and overrides both apply. `synth.js` supplies oscillator envelopes for footsteps (actual distance travelled), UI clicks, rate-limited dialogue blips, lighthouse foghorn and beam. `music.js` is an original 16-step coastal theme with a lifted finale variation. Title and cinematic lifecycle select the music; the motif contains no external melody or recording. Visibility suspends the context and scheduling; a later trusted input resumes it.

Important horn/beam/weather cues have captions (`captions.js`, polite live status) in the active modal or world. Clicks have focused/pressed controls, footsteps have player movement, and dialogue blips have visible text. Sound communicates no exclusive clue. Disposal cancels timers/listeners, stops/disconnects sources and buses and closes the context. Audible balance on physical speakers/headphones remains a manual rehearsal item.

## Controls

Desktop keyboard remains WASD/arrows, Shift run, E interact, M chart and wheel zoom. Escape closes an overlay or pauses. Dialogue retains 1–9, arrows and Enter. `core/input.js` combines keyboard with named virtual sources and clears them on blur, reset and disposal. `controls/logic.js` owns deadzones, clamping and positive-y-forward mapping; the existing player controller normalises diagonals and respects analogue strength.

On touch/coarse-pointer screens `controls/touch.js` adds a captured virtual stick plus Interact, Chart and Menu targets, at least 44 CSS pixels. Pointer-up/cancel/lost-capture, blur and overlays release movement. Focused stick arrows also work. `controls/gamepad.js` polls optional standard-mapped pads: left stick/D-pad walk, A interact, Y chart, Menu pause; D-pad up/down moves menu focus, left/right changes selects/sliders, A activates and B/Menu closes. The lightweight title poll also supports D-pad/A before the world is fetched. Missing/denied Gamepad access leaves keyboard/touch running. Rising-edge actions avoid repeat activations; disconnect clears that source. Sound still needs an initial trusted browser click/key.

`ui/devices.css` keeps HUD/menu text readable at 375 px. Settings/credits/intro scroll vertically; the phone chart scrolls horizontally at its original native scale instead of fractional shrinking. Cinematic art likewise retains native pixels in an overflow view on narrow screens. No orientation lock or device-specific backend call is needed.

## Demo tour

Only the exact `?demo=1` query imports the presenter and its local data. Choose **Highlights tour** on the title or **Start highlights tour** in the presenter panel. The current G6 script is 161 seconds and adds the adapter-driven board, three-light controls and restored coast; its nine beats are listed under G6 highlights tour below. **Space / Next beat** skips the current beat; **End rehearsal** ends it. The panel moves into the active modal so touch and keyboard controls stay available. Individual visual shots remain under its disclosure.

`demo/logic.js` is the pure step machine. `demo/tour.js` owns its waits, generation checks, one active step and shared stop cleanup; it awaits any current travel before restoring the departure place/position, hour and weather. Place assets have the existing bounded load waits. Skip closes the current dialogue/chart/passage/shot, drops stale scripted actions and continues. App disposal cancels waits and subscriptions. No world lock is held over the whole tour, since that would block the tour's own travel/cinematics.

The intro slice uses `demo/intro-story.json`, a byte copy of the public Story v2 `backend/content/story.json`, with the unchanged engine and a memory-only adapter. It neither reads/writes the player journal nor emits `intro_ended`. Recorded weather is a credited local sample; fog/storm are clearly labelled presentation overrides. Incoming live-weather updates do not replace a running tour's overrides. The existing best-effort weather GET may still run, but neither weather nor intro API availability gates the tour. There are no backend writes. Preferences remain the normal app's local preferences, independent of the rehearsal. No board rules, economy, sign-in, rewards or shared solve state are simulated. The unmask uses anonymous staging and supplies no reveal identity.

## G5 verification and performance

Final G5 checks ran on installed headless Chrome 157 on this Mac. Browser/GPU runs were sequential. Desktop benchmarks use 1440 × 900, DPR 1; separate checks cover DPR 2 and a 375 × 667 touch viewport. Exact outputs and screenshots are under `captures/20261105_G5-*`; the retained World, Pixel, UI-kit and cinematic reports contain the current regression results. `G5-Test-Results.json` records the last exit status per command. The run log retains failures that led to fixes as well as the final successful runs.

| Command from frontend/ | Final result |
| --- | --- |
| `npm test` | 162 tests, 23 files passed |
| `npm run build` | three HTML entries built; no large-chunk advisory |
| `npm run test:loading` | 13 checks: cold title, lazy entries, contrast, phone integer emblem and production boundaries |
| `npm run test:experience` | 26 checks: shell, preferences, Continue/reset, focus, audio gating/waveform, gamepad, actual emulated touch drag and 375 px layout |
| `npm run test:demo` | ten checks: complete 153,544 ms tour with APIs returning 503, prompt skips, cancellation, no journal writes/completion event |
| `DEMO_FAST=1 npm run test:demo` | five focused API-down skip/cancel checks |
| `npm run test:cinematics` | 24 checks, including delayed-import Escape and stale-load cancellation |
| `npm run test:world` | 55 checks, all hotspots and ten round trips |
| `npm run test:intro` | 16 checks, both original endings through the real local API |
| `npm run test:ui` / `npm run test:ui:production` | 19 / 16 checks |
| `npm run test:readability` | 1365 × 768, 1920 × 1080 and 1100 × 700; 14 px primary labels, 16 px chart/hotspots, no overlapping chart labels |
| `CAPTURE_PREFIX=G5 npm run test:browser` | 19 movement, weather, settings and retina checks |
| `CAPTURE_PREFIX=G5 npm run test:production` | seven static-build checks, including focus and reduced-motion travel |
| `npm run test:art` / `npm run test:art:production` | all 192 PNGs decode; selective preload/visibility/grid checks pass |
| `npm run test:weather:wiring` | weather values, compact gameplay HUD, Settings → Credits attribution, return navigation and browser errors |
| `python3 scripts/pixel_art/generate.py` | 192 PNGs regenerated byte-identically |
| `git diff --check` | passed |

| Measured item | G5 result |
| --- | ---: |
| Cold title JavaScript, sum of initial chunks | 21,477 bytes |
| Same JavaScript, local gzip estimate | 9,795 bytes |
| Static original title PNG | 29,530 bytes |
| Primary button text contrast | 6.48:1 |
| Largest loaded world JS chunk | about 393 kB, deferred until play |
| Shared Three.js/art JS chunk | about 206 kB, deferred until play |
| World / active three-light FPS | about 60 / 61 |
| Active three-light draw calls / triangles | 97 / 192 |
| Cinematic duration including local image loading | 8,271 ms |
| Reduced-motion sample | 107 ms |
| After cinematics and ten travel round trips | 96 geometries, 27 textures, one place root |
| Full API-down tour | 153,544 ms |
| Final full-run per-step skip times | 8–65 ms |
| Repeated End during a passage | 59 ms |

JavaScript sizes are file sums/gzip estimates, not a claim about a particular Wi-Fi download time. The former single G4 game chunk was roughly 611 kB; the title now fetches its small entry before the renderer, destinations, finale, demo data or gallery. Weather first-use may upload an additional app-owned geometry; the post-storm tour sample has 97 geometries/27 textures/one root. Repeated travel and cinematics do not add place roots or retain destination allocations. Normal browser modes measured around 60 FPS, below 150 draw calls and the triangle budget. The only expected errors in the deliberately failed-API tour are its injected 503 resource diagnostics; no JavaScript/WebGL error or external asset request occurred.

Not verified: Safari/Firefox, physical phone/controller hardware, actual screen-reader software, speaker/headphone balance, a prolonged soak, deployed G5, or future authenticated cloud/referee/shared-case integration. Touch and standard-pad behaviour were exercised in Chrome with touch emulation and a controlled standard-pad input. Backend tests were not rerun for incoming unchanged backend code. Claude integrates the feature branch; A2/A3/L3/L4 retain their account, progress, reward, board and trading responsibilities.

## Case adapter (G6)

G6 implements screens against one injected client adapter. `startGame({caseAdapter})` accepts the future real adapter; `adapter/bridge.js` owns lazy screen construction and disposal. No screen imports `fetch`, the session, the API client or case rules. `adapter/unavailable.js` is the normal disconnected default and grants no kit/save/solve. Development `?case=local` and the explicit rehearsal workshop `/case-lab.html?demo=1` use a memory-only fake. Nothing in that fake is authoritative or persisted. G6 was built from the then-unapproved S0 drafts. G7 follows the approved story round read from the s0final worktree; backend rules remain owned by Claude.

The contract is `read()` (cloned view), `subscribe(listener)` (returns unsubscribe), `dispose()`, and promise-returning intent methods: `completeIntro({ending,actions})`, `createCrew()`, `joinCrew(code,{confirm})`, `muster()`, `pin(cardId)`, `pair(a,b)`, `search(routeId,{paidConfirmed})`, `inspectSpot(spotId)`, `orderPartner(seat,order,target,{allowPaid})`, `buildLight(lightId)`, `callNightfall()`, `takePost(lightId)`, `aim(lightId,degrees)`, `boardSchooner()`, `accuse(suspectId)`, `nextReveal()` and `claimLantern(colour)`. Every answer is `{accepted,reason,message,view}`. Screens show the answer; only an adapter may decide gates, prices, pins, deductions, timers, kits, locks or solves.

Views have `{schema:1,mode,revision,now,captain,arrival,crew,permissions,board,search,partners,finale,accusation,reveal,world,notice,effects}`. Captain contains `name`, `coins` and `save:{state,label}`; arrival contains supplied ending/kit/item/start-place/coins/log-card data; crew contains code/status/join preview and four supplied seat models (player/NPC/open). The remaining view sections are the only source of screen availability and outcome text. `case_updated` subscriptions carry `{type:'case_updated',view}`. Revision changes trigger structural rendering, while clock updates refresh only supplied counters. View factories keep inputs and local beam bearings stable. Effects have unique ids so a controller can consume authorised visual beats once.

The local fake lives entirely under `adapter/fake/`. Its mutable rules and clock never enter a screen. It exposes local-only `dev.advance(seconds)`/`dev.reset()` for tests/workshop; the real adapter must not expose those helpers. Its public configuration contains real card titles, kit/route metadata and generic placeholders, no culprit field or reveal prose. Normal production play uses the disconnected adapter until Claude supplies the real one. A3 receives the intro's accepted action log through `completeIntro`; its arrival component replaces the plain S2 ending body while keeping the original restart and return controls. HUD captain/save labels are view data, never invented cloud-save acknowledgements.

Initial reasons are `not_connected`, `disposed`, `intro_incomplete`, `kit_required`, `crew_required`, `already_in_crew`, `wrong_code` and `too_many_tries`; additional case reasons are documented with the following screens as implemented. Refusals do not grant state or spend coins. A wrong code is displayed as a refusal, and a valid join first displays the adapter's seat preview before confirmation. The code copy button is a local clipboard utility, with an accessible manual-copy fallback.

Every `npm run build` now runs `scripts/check-spoilers.js`. It scans all built text using exact sentence fingerprints derived from CASE-FILE section 12; protected unmasking/twist prose is not stored in frontend source. The fingerprint guard has a positive/negative unit test, normalises string escapes, and reports only file/label on failure. The secret case JSON is never read or copied.

## Board (G6)

`src/screens/board.js` displays the supplied crew cards, holder/pin seat credits, D1–D4 findings/clearances/openings and four title-only suspects. It reuses the G4 Captain's Table background at integer scale and the new/pinned/used frame family with readable HTML text. Drag/drop sends `pair(a,b)`; two labelled native selects and a Pair button provide the complete keyboard/screen-reader path. Pin buttons send only a card id. No view checks matching pairs or distinct seats. Supplied cooldown/status text and button availability update without replacing a focused form every clock tick.

In the local fake, a card must be held by its pinning seat. Repeated pins are refused, and a pair requires two existing pins from different seats, including NPC seats. D1 opens nightfall; D2 opens C5/C6 and clears one suspect; D3 opens C8 and clears another; D4 clears the last cleared suspect and enables the supplied accusation gate when its other requirements hold. The fake contains no designated culprit. Card prose and reveal prose are not copied from the draft. Reasons include `card_not_held`, `already_pinned`, `not_pinned`, `different_seats_required`, `wrong_pair`, `pair_cooldown` and `already_deduced`. A wrong pair starts only its declared 30-second cooldown; it spends no coins and changes no cards/pins. Local pin/deduction credits remain fake-only play money.

### Searches and partner errands

`inspectSpot(spotId)` selects an adapter-supplied location; `search(routeId,{paidConfirmed})` requests its displayed route. `search` supplies route labels, eligibility, explicit coin prices, case-clock windows, and job totals/remaining/completion. The search screen never checks a gate or advances a job. Paid routes have a separate button naming the price. NPC paid routes first return an offer; only the player's second, priced tap resends with `allowPaid:true`.

The registry now includes `keepers_lamp` (Lighthouse Isle), `keepers_post_room` and `wall_of_lights` (Harbor), `home_driftline` (home islet) and `yard_gate` (Wreckers' Strand). `world/places/case-spots.js` maps registered interaction ids to screen/spot ids without case rules. Existing notice board, ferry pier, market hall, signal station, back room, low-tide cave, salvage yard, beach and watchtower ruin cover the remaining card routes. Original intro hotspots and engine data are unchanged. The workshop alone permits browsing all supplied spots; the world opens its actual interaction spot.

`partners` supplies each NPC's archetype, status, allowed order/target options, job progress and report. Screens animate existing idle/walk art at native integer scales, respecting reduced motion. In the fake, fetching takes ten case minutes (arrival after four); pin/wait takes five. Partners never pair, accuse, aim or offer hints. Windows are checked at planned arrival; free eligible routes take priority, and paid travel requires consent. Refusal reasons include `lead_locked`, `locked_window`, `players_only`, `busy`, `order_not_allowed`, `paid_confirmation_required`, `no_coins`, `already_have` and `unknown_spot`. Timer completion and reports are settled once by the adapter clock, including zero-duration searches.

## Finale interaction (G6)

`src/screens/finale.js` is lazy-loaded. It displays the supplied 20-minute night clock, dawn wait, materials/build offers, posts, travel timers, glow chart and lock lifetimes. Each light has a drag/touch compass, a labelled native degree slider (arrow keys), and an explicit Lock button. A standard gamepad's horizontal axis also adjusts a focused slider. Bearings stay local while dragging; only `aim(lightId,degrees)` requests a lock. `screens/beam-math.js` contains display geometry, never an outcome. The adapter alone grants a post, lock, build or success.

The fake uses a fixed rehearsal glow and public light geometry. It requires D1 to call nightfall, three occupied seats at three different ready lights, a reached post, a bearing within five degrees and three overlapping 90-second locks. Misses have a five-second retry. Human climbs take one minute; partner posts take ten. NPCs can hold the keeper/harbor lights; the built home station and optional restored ruin require a player. Building is an explicit priced intent (300 coins/10 timber); the optional ruin requires D3 and takes five case minutes. Failed nights preserve progress and buildings, clear locks and allow retry after three minutes. Each night is private case fog and does not overwrite live weather.

Success supplies uniquely identified `three_lights`, `fog_lift` and `schooner_reveal` effects; the three-light effect carries the actual target and three participating light ids. The bridge closes its case modal before playing effects, then restores that screen. Existing cinematic Escape/reduced-motion behavior and exact `{type:'cinematic',name,stage}` events remain intact. No default unmask identity is supplied. Light projection is rounded using the same public chart positions as G4. The first case-screen import has a visible status and cancellable Escape; failed imports can be retried. Asynchronous spot requests cannot reopen a closed or superseded screen.

## Reveal player (G6)

`accusation.js` and `reveal.js` load on demand. Boarding, the masked captain at the wheel, the four title-only suspects, supplied D2–D4 evidence, refusal message and one-minute wait all come from the adapter. `accuse(suspectId)` sends only an id. On an accepted reply the reveal opens; it shows exactly one adapter line at a time and highlights only its `cites` card ids. `nextReveal()` advances through evidence, kit closing, optional log-reader line and last beat in adapter order. HTML text is always assigned with textContent. Nothing in a screen names or determines the culprit.

The fake accepts the single title left uncleared by completed D2–D4, only after boarding the discovered schooner. A wrong accusation changes only the declared retry deadline, never coins, pins or cards. Its eight ordered reveal slots (nine for a log reader) cover anonymous unmasking, twist, four evidence beats, kit closing, optional log callback and last beat. Every reveal/closing/last line is `[revealed by the server]`; there is no solution mapping or story reveal prose. The first advance requests anonymous `unmask`; the last requests `relighting`. Future real adapters may supply authorised reveal art through the existing cinematic params, while the default remains anonymous. Reasons include `schooner_required`, `evidence_required`, `accusation_cooldown`, `accusation_refused`, `unknown_suspect`, `already_solved`, `reveal_unavailable` and `reveal_complete`.

## Relighting (G6)

The adapter's `world` view drives `world.setRelightingComplete(view.world.lightsOn === true)`. It supplies stage, public-light state, Wall of Lights captain names, festival remaining time, free lantern colours and the selected colour. Normal disconnected play grants none of these. In the fake an accepted solve authorises the world transition immediately, independently of whether the player advances the reveal; the final reveal beat schedules its presentation cinematic. Unsolved crews' private night/lead state is not overwritten by public Relighting.

Relighting keeps every public beam on in daylight and at night, removes the Teeth's persistent fog-bank sprite, unlocks and names Gull's Rest, and displays the harbor Wall of Lights. Natural weather remains the weather client's data. Before Relighting a false-light sprite appears at the Teeth only on fog nights. `gulls-rest.js` is a separate lazy entry, drawing its open hall and lantern string in the established 16-pixel world scale. `festival.js` is loaded only when a festival view arrives: 48 native-pixel points (24 on low), night only, no reduced-motion fireworks, with one readable festival caption. A selected free colour is also shown as a small native-pixel lantern beside the captain, including with reduced motion. All allocations have an owning cleanup.

`relighting.js` displays the supplied captain names and remaining festival time and sends `claimLantern(colour)`. It never spends coins or awards a colour itself. The fake's festival lasts 172,800 case seconds; colours are free and expiry leaves the permanent coast state intact. Reasons include `festival_closed` and `unknown_colour`. New original art and its native dimensions are registered in ASSETS.md. The board's decorative background is confined and muted behind cards; the modal starts at its heading, keeping title/navigation visible.

### G6 highlights tour

The exact `?demo=1` presenter now follows nine beats in 161 scripted seconds: intro 20, arrival 14, sailing/chart 20, Harbor 20, board 18, fog 12, storm 12, three lights/fog/schooner 27, Relighting/Gull's Rest 18. Space and the large Next button advance every step. The board and night use their real reusable screens with a separate memory-only adapter. `fake/rehearsal.js` seeds only public demonstration states; it cannot accuse or return reveal lines. The tour never shows an unmask or the twist. It uses the bundled intro slice and recorded weather with the APIs unavailable, leaves the original intro action journal and completion event untouched, and restores the actual case presentation, public-world gate, weather, hour, departure place and player position on stop. No real adapter or backend write is used for the tour.

### Case view-model details for the real adapter

Only formed deductions may expose `clears` or `clearedTitles`. Unformed deductions return empty arrays for both; otherwise the unused table lets a player infer the solution before earning the evidence. The fake’s suspect-clearing lists use inline `import.meta.env.DEV` gates, so they do not ship in production.

The adapter supplies all optional display prose. Missing prose is omitted; player-facing views do not invent findings or reveal lines. Use stable ids and labels, and make every supplied price/availability decision authoritative at dispatch time. A changed quote should be refused and shown again before any paid intent is accepted.

| Section | Fields consumed by screens |
| --- | --- |
| `board` | `cards:[{id,title,body,state,holders:[{seat,label}],pinnedBy:[{seat,label}],canPin,canPair}]`, `deductions:[{id,title,complete,finding,clearedTitles,opens}]`, `suspects:[{id,title,cleared,clearedBy}]`, `pairHelp`, `canPair`, `pairWait`, `logLead` |
| `search` | `activeSpot`, `label`, `clockLabel`, `allowSpotPicker`, `spots:[{id,label}]`, `routes:[{id,title,label,seconds,price,kitName,canStart,statusText}]`, `jobs:[{id,title,total,remaining,done,report}]` |
| `partners` | `[{seat,name,archetype,status,canOrder,orders:[{id,label}],targets:{order:[{id,label}]},job:{id,order,total,remaining,done,report}}]`; archetypes are deckhand/navigator/cook/salvager |
| `finale` | `phase` waiting/night/dawn/success, `remaining`, `dawnRemaining`, `status`, `canCall`, `glow:{x,y}`, `chartDescription`, `materials`, `buildJobs`, `lights:[{id,name,x,y,ready,bearing,post:{seat,label,reserved,remaining},lock:{remaining},canTake,canAim,canBuild,buildLabel}]` |
| `accusation` | `aboard`, `schoonerFound`, `canBoard`, `allowed`, `status`, `cooldown`, `suspects:[{id,title,cleared}]`, `evidence:[{id,title,cards:[{id,title}]}]` |
| `reveal` | `available`, `index`, `total`, `line:{id,kind,title,text,cites:[cardId]}`, `done`, `canAdvance`, `cards:[{id,title}]`; the fake's `lines` is placeholder-only and not needed by the player |
| `world` | `stage`, `lightsOn`, `fogBankGone`, `gullsRestOpen`, `wall:[{name,order}]`, `festivalRemaining`, `lanternColour`, `canClaimLantern`, `colours:[{id,label,hex}]` |
| `effects` | `[{id,type:'cinematic',name,params}]`; ids increase during an adapter lifetime and each visual runs once |

`now`, durations and remaining values are seconds. Screens only format them. `revision` increases for structural/outcome changes; `case_updated` may refresh clock values with the same revision. A real implementation owns its polling/subscription/clock cleanup; `tick(dt)` can be a no-op. The fake's dev helpers are not part of the real interface. Case-screen imports and spot requests are cancellable; screen disposal removes its modal, callbacks and subscription. Important results are visible in the status panel, with textual lock states, cleared labels, cited labels and timers, so no result depends on colour, animation or sound alone. The map has adapter-provided coordinate text as a nonvisual equivalent of the glow geometry. Existing preference controls and native gamepad menu navigation apply to the case UI.

The runtime accepts exactly one adapter at `startGame` construction. The tour owns a different adapter and does not swap or dispose the live one. Closing the case during a cinematic queue cancels its pending return/navigation. A denied Gamepad API leaves keyboard/touch and the rendering loop running. Screen creation after a disposed lazy import is discarded, and background intro handoff failures keep the original local intro save usable.

Join throttling uses a separate local lobby clock in the fake, so the one-minute retry expires before a crew exists while the case clock remains stopped. On navigation, old local action notices are hidden; new refusals/reports remain readable in the active screen. Disconnected-service status stays visible. The masked captain artwork is requested only after the adapter confirms boarding; earlier schooner screens show the gate and the supplied evidence without premature character art.

## G6 verification and performance

Final checks used installed headless Chrome 157 on this Mac, with GPU/browser runs sequential. Captures and exact outputs are retained under `captures/20261105_G6-*`; `G6-Final-Verification.json` is the final per-command result list. `G6-Verification.log` retains the earlier run, including a timed tour interrupted by a development module reload; its stable rerun passed. The focused final logs cover the later lifecycle, readability and firework presentation fixes. The protected story engine/data, API weather client, backend, auth, database and deployment configuration were not edited.

| Exact command from frontend/ | Result |
| --- | --- |
| `npm test` | 194 tests in 31 files passed, including fake gates, seats, jobs, accusation/reveal, clocks, beam geometry, VM copies and screen transport boundary |
| `npm run build` | four HTML entries; no large-chunk advisory; automatic spoiler guard passed for 51 built text files |
| `npm run test:case` | 35 browser assertions: actual priced tap/timer, mobile screens, accusation/wait/reveal/citations, free colour, cancelled import, Harbor E, restored coast, fireworks and reduced motion |
| `node scripts/check-world.js` | 60 assertions, all 34 hotspots, exact events and ten round trips with stable owned resources |
| `node scripts/check-readability.js` | 1365 × 768, 1920 × 1080 and 1100 × 700; readable labels, no chart-label overlap |
| `CAPTURE_PREFIX=G6 node scripts/check-browser.js` | movement, weather/quality modes, native integer scale and DPR 2 passed |
| `CAPTURE_PREFIX=G6 node scripts/check-production.js` | seven static-production assertions passed |
| `node scripts/check-pixel.js` and `ART_PRODUCTION=1 node scripts/check-pixel.js` | all 195 PNGs decode at their native sizes; catalogue visibility/selective preload/grid checks passed |
| `node scripts/check-ui-kit.js` and `KIT_PRODUCTION=1 node scripts/check-ui-kit.js` | 19 development / 16 production assertions passed |
| `node scripts/check-cinematics.js` | 24 assertions, including skip, reduced motion, anonymous unmask, events and cleanup |
| `node scripts/check-intro.js` | 16 assertions, both original endings, real local intro API and accepted move replay |
| `node scripts/check-weather-wiring.js` | weather values, compact gameplay HUD, Settings → Credits attribution, return navigation and browser errors |
| `node scripts/check-experience.js` | 26 shell, preferences, controls, audio and phone-layout assertions |
| `npm run test:demo` | ten assertions: full API-down tour in 168,305 ms; no player-journal writes or completion event; original place/weather/public gate restored |
| `node scripts/check-loading.js` | 18 production assertions; separate lazy board/finale/reveal/Gull's Rest/festival entries; no cold WebGL allocation |
| `python3 scripts/pixel_art/generate.py` | all 195 PNGs regenerated byte-identically by SHA-256 |
| `git diff --check` | passed |

| Measured item | G6 result |
| --- | ---: |
| Cold-title initial JavaScript / local gzip estimate | 21,639 / 9,894 bytes |
| Primary button text contrast | 6.48:1 |
| Settled world place samples (90 frames) | 60–61 FPS |
| Existing weather-mode regression samples | 57–61 FPS, at most 100 calls / 195 triangles |
| Active three-light scene | about 61 FPS, 97 calls / 192 triangles |
| Open Gull's Rest with night festival and selected lantern | 60 FPS, 31 calls / 56 triangles |
| Gull's Rest ownership | 30 geometries, 12 textures, one place root |
| Ten return trips | 96 geometries, 27 textures, one root on every return |
| After the complete tour | 98 geometries, 27 textures, one root; two app-owned festival buffers remain available for later use and are disposed on teardown |
| Full timed tour / individual skips | 168,305 ms / 10–147 ms |
| Repeated End during a passage | 226 ms |

Short four-frame round-trip samples are resource checks, not reliable FPS benchmarks; the performance figures above use the longer settled samples. The first title remains below its 35 kB JavaScript budget. Board, search, partners, night, accusation, reveal, restored-island art and festival rendering load on demand. Important case notices and controls are at least 14 CSS px, body text 16 px and reveal text 18 px. Phone checks at 375 × 667 include every screen and confirm no horizontal modal overflow. The quieter board background, consistent pixel focus, explicit status labels and original hand-authored coastal art keep the interface in the approved style.

Not verified: Safari/Firefox, physical phone/gamepad hardware, actual screen-reader software, a prolonged soak, live authenticated/shared-case/cloud/referee/ledger routes or a deployed G6 build. The production default is deliberately disconnected until Claude supplies the real adapter; it invents no kit, save, reward or solve. This dated G6 verification predates the approved S0 round used in G7. The feature branch is based on main `3ca7d38`; main later advanced independently to `8215825` (keep-alive work), which this branch does not merge or edit. Claude integrates G6. No main merge, force-push, manual deployment, sign-in UI or trading screen is part of this work.

For a walkthrough, begin with `adapter/contract.js`, follow `game.js` into the lazy bridge and `screens/controller.js`, then compare one screen's intent with its fake handler and view projection. `fake/index.js` settles due jobs/night state before dispatch, applies the intent, settles immediate results and publishes a cloned view. To connect the real services, implement the same adapter surface and inject it into `startGame({caseAdapter})`; screens and art do not need transport changes.

## G7 checkpoint 0: team and data credits

`src/shell/team.js` has one credit row per member: Nils Lenke and three placeholders, each replaced by that teammate in their own first pull request. Tests allow those name edits without changing tests. Credits show the existing Open-Meteo adaptation and licence, Binance live market data, Binance Vision recorded-replay credit and CC BY-NC-SA 4.0 link, plus the asset/tool licences from ASSETS.md. No student numbers, dependency or adapter contract change.

Verified: `npm test` (195 tests, 32 files), `npm run build` (four entries and 51-file spoiler guard), `npm test -- --run tests/credits.test.js` (one passed after making teammate-name edits test-safe) and `node scripts/check-credits.js` (11 browser assertions, including 1280/375 px). Captures use `20261105_G7-C0-*`. Real account, multiplayer and subsequent G7 streams remain for the following checkpoints.

## G7 additive adapter contract (schema 1)

The G6 surface is extended in place. Schema remains 1: every view includes the original keys plus `presence`, `account`, `rewards`, `log`, `hints` and `continuation`, with safe empty parts when disconnected. `caseViewKeys` and `caseReasons` in `adapter/contract.js` are executable contract lists. All intents return a promise for `{accepted,reason,message,view}`; ordinary refusals resolve. An exceptional transport rejection carries a documented `reason` and a player-safe `message`. Reads and subscription snapshots are caller-owned clones; disposal stops publication, clock progression and intents. Ordinary state changes publish `case_updated` before the associated intent resolves. Clock/presence-only updates may retain the structural `revision`.

New intents: `reportPosition({place,x,y,facing,moving})`, `setEmote(emoteId)`, `signIn()`, `signOut()`, `rerollName()`, `deleteMyData({confirm})`, `resolveSaveConflict('keep_this_device'|'use_cloud')`, `continueGame()`. `reportPosition` uses logical ground coordinates: x = world X, y = world Z; facing is front/back/left/right. The world asks at most once per 500 ms while moving, with a final stop/place-change snapshot under the same cap. It sends no repeated idle samples and makes no calls during the tour. The transport remains responsible for its own throttle and room budget. No A4 spec was on main at the G7 start; these follow the supplied G7 field names.

`presence`: `{status:'live'|'reconnecting'|'offline'|'off',place,others:[{id,name,kit:{id,name},x,y,facing,moving,emote,isCrew,at}],hiddenCount,crew:[{id,seat,name,kit,online,place,isPartner}],sampledAt}`. All ids are opaque and all names are captain names, never account logins/emails. `at` and `sampledAt` are adapter-normalised client epoch milliseconds for display interpolation; absent `at` uses receipt time. At most eight nearest eligible peers are drawn, including any departure fades. `hiddenCount` covers additional peers omitted by the transport. Emotes are wave/cheer/point/lantern/shrug; the adapter supplies cooldown/refusals. Everyone/crew-only/off is a bounded local preference, not an account field. The fake simulates up to 30 without network calls.

`account`: `{state:'signed_out'|'signing_in'|'signed_in'|'expired'|'error',captainName,canReroll,hasKit,canContinue,save:{state:'idle'|'saving'|'saved'|'offline'|'conflict',label,updatedAt}}`. Save data and login tokens never go into preferences. An accepted `continueGame` supplies `continuation:{source:'local'|'cloud',kind:'intro'|'world',actions:[]|null,place}`. A local continuation with null actions uses the unchanged intro journal. Cloud actions are an accepted move replay, never an engine snapshot. New game restarts only the local intro and never deletes a confirmed kit/account. Deletion requires the explicit second `confirm:true` tap.

`rewards`: `{balance,recent:[{id,amount,reason,label,at}],ledger:[same],keepsakes:[{id,title,description,owned}],epilogue:[{id,text}],wallEntry,festivalBadge,contributors:[]}`. These are read-only supplied rewards; award maths lives in the fake until the server replaces it. `log`: `{intro,cards:[],deductions:[],partnerReports:[],nights:[],reveal:[]}`; reveal/epilogue parts are empty before an accepted solve, and fake lines are placeholders. `hints`: `{items:[{id,title,body}],actions:[{id,label,screen,params,available,priority}]}`. What next only filters/deduplicates these supplied actions; it does not infer case rules. Dismissed first-use hints and the hints on/off setting are preferences only.

Additional refusal reasons include offline, not_connected, session_expired (401), save_conflict (409), rate_limited (429), feature_off, invalid_request, forbidden, internal_error, name_reroll_used, confirmation_required, invalid_emote, emote_cooldown, invalid_position, unsupported_choice and save_unavailable. A refusal does not grant progress or spend coins. Offline/expired/conflict messages retain this device's accepted intro actions. Claude's real adapter must mirror these keys, methods, reasons and event order and pass the conformance suite added before the presentation streams.

## Live presence (G7)

`world/experience.js` owns lazily imported `world/others/` and `screens/presence/`. It shares the existing explorer maps and owns/disposes the extra crew/emote materials. Movement is buffered 200 ms behind adapter timestamps, extrapolates at most 250 ms, and snaps after gaps over two seconds. The eight nearest eligible actors include departure fades; transport-hidden peers contribute to the overflow chip. Everyone/crew/off is a device preference. Phone labels show at most two readable names where space permits; every rendered captain and kit remains in the screen-reader summary. Actor count and label count are independent. Emote controls close after selection and have a supplied cooldown. Crew seats have textual online/away/partner states. Board highlights use seat colour plus seat numbers; finale bearings are supplied by the same adapter snapshot.

`controls/presence-report.js` applies a 500 ms caller cap including a final stopped/place-change sample. It suppresses repeated idle reports, private intro passages and the highlights tour. The transport must independently enforce its room budget. The fake simulates 30 captains; this does not connect to a public room. The five original code-authored speech bubbles are catalogued in ASSETS.md.

## Account (G7)

The title shares exactly one injected adapter with the world. `screens/account/summary.js` shows GitHub-only sign-in and supplied name/save state. `shell/account-host.js` lazily opens account controls, expiration and conflict choices. `save.device` and `save.cloud` are display summaries `{state,label,updatedAt,kind,place}`; action journals stay inside the adapter's save owner. `save.source` records the explicitly selected copy. Continue asks the adapter and replays accepted intro actions, or travels to its supplied world place. Guest Continue retains the unchanged local intro journal. New game only restarts that journal; a confirmed account/kit remains intact.

Deletion requires two explicit taps and states that all player data, including the ledger, goes; a crew with other humans passes to the next seat. The fake archives the other crew and detaches this client. It does not erase another player's cards or the public Relighting. Sign-in, expiration, offline, conflict, re-roll and deletion are local simulations only. No screen imports a transport, token or online module. Preferences contain no save or login data.

## Conformance suite (G7)

`adapter/conformance/suite.js` exports `defineAdapterConformance(name,factory,driver)`. The fake's complete example is `tests/adapter-conformance.test.js`. Claude can add a test importing the real factory, pass its options or async `driver.create()`, and supply `prepare(adapter)`, accepted `sequence:[{method,args,repeat}]`, `probes` for each method and `assertProgress(view)`. The suite checks cloned nested reads/subscriptions, required schema/extension shapes, known refusal reasons, event publication before resolution, idempotent repeats, unsubscribe and disposal. The factory must return the same one-adapter surface, without a screen change.

`adapter/conformance/fixtures.js` provides `createFixtureRequest(fixtures)` and `caseFixtures()`: a tiny injected request function with queued JSON Responses for me, intro completion, crew, board and save conflict. It makes no network request and records only route/method, never headers, credentials or request bodies. Inject it at the real transport's request boundary; do not import it into screens. Run `npm test -- --run tests/adapter-conformance.test.js` or include a real adapter test in `npm test`.

### G7 readability

Gameplay controls, notices and captain labels are at least 16 CSS px. Case body text is 18 px and story/reveal text is 19 px, independently of native world pixels. Phone menus wrap and scroll. Focus remains visible, reduced motion removes the decorative interpolation/fades and UI pulses, and important outcomes also have text. These settings preserve nearest sampling and integer sprite scales.

G7 checkpoint 1 evidence: `npm test` passed all 266 tests in the current workspace (including the isolated work-in-progress Stream 4/6 tests); `npm run build` built four entries with the automatic spoiler guard; `node scripts/check-living.js` passed 17 browser assertions; `node scripts/check-experience.js` passed 26; `node scripts/check-loading.js` passed 18. Stable presence measured 60 FPS, 105 calls, 208 triangles, 104 geometries, 53 textures and one place root. The cold title is 20,988 JS bytes / 9,786 gzip estimate, below the G5 21,477-byte baseline. Captures/logs use `20261105_G7-C1-*`. The phone review removed excessive nameplates and a hidden-menu initialization issue. Physical devices, actual screen-reader software, real authentication/cloud/realtime and deployed G7 remain unverified.

## Rewards (G7)

`src/screens/rewards/` is a lazy, read-only ledger/cabinet/epilogue screen. `rewards.balance` drives the HUD counter; gain interpolation is display-only and reduced motion uses the final value immediately. The adapter supplies every amount, reason and stable ledger id. No screen calculates an entitlement or changes a wallet. `keepsakes[].owned` controls the Relighter badge, Keeper’s Star chart mark, recovered lens and Wall entry. Epilogue lines stay empty until the reveal has finished; the fake supplies placeholders only. `festivalBadge` follows the accepted free colour intent.

The fake records each card reference once (50), participating deduction once (200), and one solve reference (400 + 100 per participating deduction + 100 for a finale role, capped at 800). Ordered NPC pins credit the ordering human; only the three winning locks credit their aimers. An accepted accusation is also a finale role. Human contributors freeze at that accusation; NPCs earn nothing. Simulated human seats have separate wallets. Ledger entries have `{id,amount,reason,label,at}`; fake `at` is case seconds. No crew id appears in reward references. This memory-only ledger is not a financial service or persistence substitute.

## Partners in the world (G7)

`partners[].life` extends each existing partner entry with `{status,actor:{place,x,y,facing,moving,archetype},travel,post,chartLine,portraitId,event,refusal}`. Travel supplies endpoints, stage, progress and remaining seconds. Post supplies `lightId,label,readyAt,onDuty`. Chart lines supply public chart endpoints, progress, active and a label. Events/refusals carry an id, type/group, safe text, case time and portrait id. The six refusal groups are wrong_kit, no_coins, locked_window, busy, already_have and not_ready. Original neutral fake lines contain no story solution or hint.

`world/partners/` shares the crew art cache, owns its actor geometries and removes departed/place-mismatched actors. The sea chart draws supplied journey lines. `screens/partners/` keeps native selects and focus stable while remaining time changes; original portraits use their native 64×80 size. Fetch takes ten fake case minutes, pin five. Every order starts with paid consent off. A paid offer displays the exact price and requires a checked switch plus a second priced button. No partner pairs, accuses, aims or gives hints.

The real join adapter supplies the crew screen's takeover preview and confirms through `joinCrew(code,{confirm:true})`. Private fake `dev.previewTakeover(kitId)` / `dev.confirmTakeover(preview)` rehearse matching-kit preference, then the last available NPC-kit order. The friend brings their own kit; satchel, pins, deductions, clock and running errands stay with the seat. A generic farewell is recorded; light duty ends, including a pending partner light assignment. These helpers are not real intents.

## Captain’s Log and hints (G7)

`src/screens/log/` shows the supplied original intro actions/ending/kit, found card place and case minute, deductions, reports and night history. `log.reveal` is empty before solve. Screen code never derives a deduction, objective or reveal. `src/shell/hints/` displays supplied first-use hints and available navigation actions. What next only filters/deduplicates `hints.actions`; all gates and wording originate in the adapter. Turning first-use hints off leaves What next navigation available. Dismissal ids and `hintsEnabled` are bounded preferences in the existing version-1 preferences record, never saves or tokens.

`?` lazily opens the shortcut overlay. Its pending import is cancellable. Escape closes the top panel (including pending help), then skips a cinematic, then opens pause. Help blocks movement, preserves the original focused control and reports a failed load with a retry. Phone case navigation uses one labelled native page selector so the 16–19 px text keeps usable vertical room.

Checkpoint 2 checks: `npm test` passed 280 tests / 47 files in the full workspace (including three in-progress Gull’s Rest tests). `npm test -- --exclude tests/gulls-rest.test.js` checks the checkpoint-2 set separately. `npm run build` passed the 91-file spoiler guard. `node scripts/check-life.js` exercised ledger/keepsake gating, original intro records, sealed reveal, hint preferences/What next, timed partner reporting, chart journeys, help/Escape and all new screens at 375 px. The crew scene measured 61 FPS / 53 calls / 184 triangles / one place root. Captures start `20261105_G7-C2-` and final command logs use `20261106_G7-C2-`. Full golden-path/chaos, broad regression and deployed/real-server behavior remain for checkpoint 3.

## Golden path (G7)

`node scripts/check-golden-path.js` plays the unchanged original intro through visible choices, then the complete case with one human/three partners and again with four simulated human seats. It searches through accepted routes, orders/pins/pairs through intents, advances only fake timers, locks the lights, boards, receives a wrong-accusation wait, submits the sole uncleared suspect and finishes the placeholder reveal/festival. It checks reward attribution and idempotent ledger references, keepsakes/epilogues, human-only Wall names, and Gull’s Rest. Rehearsal clock jumps are private to the fake and do not expire a sign-in or fast-forward the public festival. Other human seats have separate wallets/cursors and obey the same fake handlers.

`node scripts/check-chaos.js` injects offline, not_connected, session_expired (401), save_conflict (409), rate_limited (429) and feature_off refusals across the account and each major case intent. Every injected refusal must preserve core progress and show a plain message; session/conflict panels recover explicitly before retry. Neither script makes a backend write. They use the explicit local adapter with every API route held at 503, allow only those expected resource diagnostics, take 1280/375 px captures and record timings/FPS. There is no reveal identity or prose in either harness.

`node scripts/check-g7-regression.js` runs all existing checks plus the new ones sequentially, retaining command, exit status, time and output under `captures/20261106_G7-Final*`. `--resume` retries a failed check and continues; successful commands remain in the report. A failed result is never called passed until its rerun succeeds. Browser modes run one at a time to keep GPU measurements meaningful.

## Gull’s Rest (G7)

The existing lazy `world/places/gulls-rest.js` now exposes three registered zones: `gulls_rest_dock` at (0,13), `lens_store` at (0,2), and `keepers_star` at (5,7), logical X/Z. Dock opens the supplied coast/festival view; the store/star open the supplied keepsake cabinet. The public `world.setRelightingComplete(true)` gate still owns access and naming. Original lens, star and lantern art decorate the open island. Two small geometry batches add shore waves and gulls; lantern flicker shares the existing material. Pixel-grid motion stops with reduced motion. All materials/geometry belong to the single place lifetime, and private case fog never overwrites live weather.

New partner, log, hints, rewards, account, Gull’s Rest and finale screens remain separate lazy chunks. The default adapter remains safely disconnected until Claude injects the real implementation. The display-only Show other captains preference hides remote actors without suppressing the local captain’s own movement reports. Fake cinematic ids remain unique through rehearsal resets, so repeating highlights does not silently drop effects.

### Final G7 client and lifecycle details

`presence` also supplies `localEmote:null|{id,until}`, `canEmote:boolean`, `cooldown:number` and `emotes:[{id,label,available}]`, including safe empty values when disconnected. `until`, peer `at`, `sampledAt` and pin-highlight `at` use client-normalised epoch milliseconds; emote `cooldown` is milliseconds. Case `now`, job/event/reward times and remaining values retain seconds. Each peer may include its own `place`; otherwise the renderer uses `presence.place`, so an ordinary single-room A4 payload works. The conformance suite checks these additive fields without a schema bump.

The composition point in `main.js` owns its adapter. A bridge disposes an adapter only when the bridge created it; injected adapters are unsubscribed, then remain available to title/account or a retried world. Application disposal is idempotent. A failed first island load removes its canvas and allocations before retry. `world.whenIdle()` waits for an existing asset load/passage (independent of overlay gates); New game/Continue cancel transient views, await that passage and verify the destination before opening the original intro. A generation token cancels stale starts when the user returns to title/pause. Closing the intro resets input synchronously; its later native close event cannot discard the player's next key or deactivate a newly opened view.

`npm run test:lifecycle` exercises an intentionally failed ground image, retry with the same signed-in fake account, one canvas/root and exactly one adapter disposal. `npm run test:living`, `test:life`, `test:golden`, `test:chaos` and `test:g7` expose the other focused/full checks. Screens still make no fetch/Supabase/online calls. The original story engine/data, demo story copy, weather-state/client logic, Exchange and home build packages are unchanged.

## G7 final verification and handoff

All 24 commands in `captures/20261106_G7-Final-Verification.json` passed. Each entry names the exact command and retained output in `captures/20261106_G7-Final/`. Checks were run sequentially in installed headless Chrome 157 on this Mac. Earlier iteration failures were fixed and their relevant checks rerun; the manifest records the passing result, with the independent world rerun explicitly noted. No backend/online/deployment files or protected story/weather/trading/home-build packages were edited. The branch began at main `9f5bf97`; main independently advanced to `606ee4a` at the final fetch. No merge/rebase/deploy was performed.

| Verification | Result |
| --- | --- |
| `npm test` | 284 tests in 47 files passed, including conformance/fixtures, interpolation/cap, save states, rewards/participation, hint filtering, input reporting, world lifetime and clocks |
| `npm run build` | four HTML entries; no large-chunk advisory; protected-story spoiler guard passed for 91 built text files |
| `python3 scripts/pixel_art/generate.py` | all 200 PNGs regenerated; no tracked source image changed |
| `node scripts/check-living.js` | 19 assertions; bounded reports, own reports stay live when others are hidden, emotes/account recovery and 375 px labels |
| `node scripts/check-life.js` | 24 assertions; ledger/epilogue gating, log/hints, paid quotes tied to the current order/target, explicit priced tap, journeys, help cancellation/input blocking and 375 px screens |
| `node scripts/check-lifecycle.js` | 9 assertions; failed initial drawing, retained account/adapter, retry with one canvas/root, 19 px phone story and exactly-once teardown |
| `node scripts/check-golden-path.js` | 83 milestones; solo/three partners and four simulated humans, all cards/deductions/night/accusation/reveal/rewards/festival/Gull’s Rest |
| `node scripts/check-chaos.js` | 202 assertions across 96 injected refusals; unchanged progress, safe messages and recovery |
| Existing browser checks | credits, case, world, desktop readability, weather/retina rendering, static production, pixel catalogue (development/production), UI kit (development/production), cinematics, original intro, weather wiring, experience, full timed tour and loading all passed; exact commands are in the manifest |
| `git diff --check` | passed |

| Measured sample | Result |
| --- | ---: |
| Cold title JS / gzip estimate | 21,080 / 9,830 bytes |
| Required G5 cold-title ceiling | 21,477 bytes |
| Eight other captains, clear scene | 61 FPS / 109 calls / 216 triangles |
| Eight other captains, night storm | 60 FPS / 111 calls / 217 triangles |
| Partner crew in Harbor | 60 FPS / 53 calls / 184 triangles |
| Open Gull’s Rest, desktop and 375 px | about 60 FPS / 34 calls / 74 triangles |
| Complete API-down automatic highlights tour | 161,218 ms |
| After tour | 60 FPS / 97 calls / one place root |
| Primary pixel-button text contrast | 6.48:1 |

The optional crew/emote material cache stays app-owned across places; after first use it accounts for 42 additional maps (69 textures after the tour), rather than a place leak. World round trips keep one place root and stable place allocations. Actor geometries and material clones are bounded, and application teardown releases the shared cache. These are settled short-run measurements, not a cross-device or prolonged-soak guarantee.

Not verified: live GitHub/Supabase sign-in, actual shared rooms/cloud saves/case/ledger services, Safari/Firefox, physical phone/gamepad hardware, actual screen-reader software or a deployed G7 build. Claude integrates the branch and implements/injects the real adapter at `adapter/select.js`, mirroring the schema-1 additions and passing the same conformance suite. The local rehearsal never supplies real rewards, backend writes or reveal identity/prose. No graphics work remains within G7; real-service integration and the reserved teammate packages remain with their owners.

## Spoiler-proof bundle (G8 checkpoint 0)

The fake keeps its full case rehearsal in development. Production strips every suspect-clearing list with an inline Vite DEV gate; its public tour uses only safe highlights. Board views expose clears only for formed deductions. `scripts/check-spoilers.js` rejects suspect-clearing data in production JavaScript and fingerprints all twelve reveal, kit-closing, log-reader and last-beat lines. It reads the server-only case file at check time when present; committed numeric hashes provide the Vercel fallback without storing those words. Regenerate the fixture with `npm run art:fingerprints` when the authorised server content changes. Never paste that content into this folder.

`npm run build` also runs the spoiler guard. A deliberately ungated build failed the new elimination check; the gated build passes. Local builds retain the manifest for loading checks; `VERCEL=1` omits it. `case-lab.html` is built only with `CASE_LAB=1`, while the dev server still serves it normally.

The preview server uses the proposed strict self-only CSP, including `base-uri 'none'`. Map positions use CSSOM rather than HTML style attributes, and auth-check styles live in an external sheet. `npm run test:csp` checks the title, production tour, art library, UI gallery and auth diagnostic for policy violations. No extra CSP directive is required by these screens. Trapped-ending decision and twist notes now appear inside the ending or arrival card, at 19 px, without changing story content.

Checkpoint verification: `npm test` passed 292 tests in 48 files. Normal, `VERCEL=1`, and `CASE_LAB=1` builds passed; the normal build scans 89 text files against twelve protected lines. `node scripts/check-csp.js` passed five routes and all nine production-tour beats with APIs unavailable. `node scripts/check-loading.js` measured 21,026 cold-title JS bytes (9,812 gzip), below the G7 ceiling of 21,080. `node scripts/check-production.js`, `node scripts/check-case.js`, `node scripts/check-golden-path.js` and `node scripts/check-chaos.js` passed; the last two retain the complete development-only case rehearsal. Evidence is in `captures/20261106_G8-C0/` and `captures/20261106_G8-CSP-Checks.json`. Live services and actual screen readers have not been verified.

## Islet in the world (G8)

`world/islet/state.js` owns the last accepted `islet_changed` event for the running game, including events received while visiting another place. Its validator requires known unique plot ids, the starting cabin and a consistent `signalStationBuilt` flag. Before any answer, only `plot_1` stands. Home scenery subscribes to the effective building list; plot collisions change in the same array used by the player controller. New buildings raise with a short dust/settle effect; reduced motion makes them appear immediately. The station’s steady night art and beam appear only when it stands. The sea chart adds a small accessible station marker.

Pass one `createIsletState({on})` instance to the place factory as `isletState`, and dispose it with the game. `getBuilt()` / `subscribe()` expose the effective display; `getLatestBuilt()` / `subscribeActual()` expose accepted event state. `previewBuilt(ids)` and `clearPreview()` are tour-only display overrides. Live events continue updating the underlying state during a rehearsal; ending the preview restores that latest state. The local case fake mirrors accepted building events through its private `dev.setIsletBuilt` helper so the station can be used as the third light. Real adapters own their server refresh; the event has no wallet information, so the world never invents or spends coins.

`node scripts/check-islet-world.js` exercises the event seam until Claude’s L2 panel is merged, then the combined-game check can exercise its `?islet=local` panel. The panel remains Claude-owned. The original workshop, windmill and greenhouse art is reused; new signal/parcel/sign assets are listed in ASSETS.md.

## Harbor day (G8)

Schema 1 adds **`bulletin`** to `caseViewKeys`: `{status:'off'|'loading'|'ready'|'unavailable',day,lines,weather,exchange,chapterTwoHook}`. Every route field retains its server name. The disconnected default is `{status:'off',day:null,lines:[],weather:null,exchange:null,chapterTwoHook:null}`. The real adapter must return this field, publish owned snapshots and satisfy `adapter/conformance/bulletin.js`. There are no new public player intents or screen fetches.

`day` contains `id`, `startedAt`, `nextDayAt`, `bulletinDay`, `publishedAt`, `nextBulletinAt`, `harborWeek`, `nextHarborWeekAt` and `resets:[{when,what}]`. `lines:[{kind,text}]` are rendered in supplied order with `textContent`. `weather` retains `tonight`, `tomorrow`, `source`, `fetchedAt`, `attribution`; tonight contains `date`, `startsAt`, `endsAt`, `isNow`, `state`, `isFogNight`, `fogNightKind`. `exchange` is null or `{feed,pausedCompanies:[{id,name}]}`. No screen derives a fog-night or reset rule. Dates use `Intl.DateTimeFormat` with `Europe/Lisbon`; countdowns only subtract a display clock from the supplied timestamp, and never decide availability.

The new `bulletin_board` harbor hotspot opens the lazy bulletin screen in the existing case modal. `notice_board` remains the C1 evidence search. Off hides the new board/prompt/HUD chip; loading and unavailable have plain readable status messages. The panel includes the supplied reset list. Open-Meteo attribution/licence details are kept in Settings → Credits. The tonight chip shows the supplied state, fog badge and almanac wording at readable sizes. The world HUD contains only compact conditions, time and the Settings button; it contains no attribution or licence block.

At game night, the false-light teaser uses supplied `tonight.isFogNight` when this stream is enabled; missing tonight keeps the old numeric-fog fallback. Relighting always disables the teaser. A storm flag uses the supplied state; the sky keeps its existing game-time cycle. The weather client is unchanged. `adapter/fake/bulletin.js` provides off, loading, unavailable, calm, real fog, almanac fog, storm, festival, hook-placeholder and stale-feed rehearsals through `dev.setBulletin(scenario)`. Normal bulletin wording is checked against the canonical public server copy when available. Hook wording stays a placeholder.

### G8 checkpoint 1 verification

Merged `origin/main` at `8ff24cc` (merge commit `35f4d3e`), retaining Claude’s incoming story-v2/data and deployment changes. Those team-owned sources were not edited. L2, Exchange and the open-world transport were still absent on main; this checkpoint verifies their documented event/view seams rather than their live services.

`npm test` passes 316 tests / 52 files. `npm run build` passes the twelve-line spoiler/elimination guard. `node scripts/check-islet-world.js`, `node scripts/check-bulletin.js`, `node scripts/check-world.js`, `node scripts/check-readability.js`, `node scripts/check-loading.js`, `node scripts/check-production.js` and `node scripts/check-csp.js` passed. Islet: 60 FPS / 42 calls / 80 triangles by day, 60 FPS / 41 calls at night, 61 FPS / 44 calls at 375 px; one place root throughout. Cold title: **21,061 JS bytes**, **9,904 gzip**, below the 21,080-byte ceiling. The small loading saving comes from sharing the title’s repeated continuation explanation, without removing it.

The captures were inspected at 1280 px and 375 px. This caught a blank phone page selector, duplicate bulletin heading, unhelpful recorded-date countdown and a station beam origin mismatch; all were corrected. The world check now explicitly excludes the switched-off bulletin hotspot; the bulletin check covers its enabled state. Evidence: `captures/20261106_G8-C1/`, `captures/20261106_G8-Bulletin-Checks.json`, `captures/20261106_G8-Islet-World-Checks.json`. New commands: `npm run test:islet:world`, `npm run test:bulletin`; strict-CSP production check: `npm run test:csp`.

Not verified here: Claude’s not-yet-merged L2 panel/real adapter, live servers, actual screen-reader software and physical phones. The hook, audio/life additions, presenter kit and full combined regression/accessibility pass continue in checkpoints 2 and 3. Real-adapter additions to mirror now are the route-shaped `bulletin` field, its off default, and earned-only deduction clears. `islet_changed` keeps its documented payload unchanged.

## Chapter 2 hook (G8)

`bulletin.chapterTwoHook` is null until the server supplies `{id,notice:{title,text},beam:{chart:{x,y},pattern,flash:{shortSeconds,longSeconds,gapSeconds,pauseSeconds}}}`. The chart is 448 × 256 native pixels. The adapter copies this data; the screen never decides when the hook fires. The fake reuses `adapter/fake/hook.js` and placeholder notice text only. No Chapter 2 notice prose is stored here.

`chart.setHook(hook)` / `chart.update(dt)` and `createHookWorld({scene,reducedMotion})` use the same safe timing helper. Short/long pulses are clamped to at least 0.34 seconds, coordinates to chart bounds, and unexpected pattern entries are ignored. Reduced motion shows a steady marker and pattern words. The bulletin shows only the supplied title/text and an opt-in **Announce flash sequence** button; closing or navigating away stops announcements. Nothing speaks automatically.

The world signal maps the chart bearing from the current island at 0.14 world units per chart pixel, then extends it outward until it reaches water. This is display placement, with normal camera clipping and native-grid snapping; it does not add a destination or decide a route. `setHook(null)` hides it. App disposal releases all four meshes/materials.

Schema 1 also adds **`log.observations:[{id,text}]`**, default `[]`. The fake adds only the specified generic observation, “A light flashing far out at sea”, when its hook is present. The real adapter supplies any persisted observations. No new player intent, fetch, online import or case rule is added to a screen. Verify with `node scripts/check-hook.js` / `npm run test:hook`.

### Harbor sound and life

`createHarborLife({place,art,ctx})` owns home smoke/window/roof gulls and the harbor’s clear-weather gulls. It subscribes to effective islet state, so rehearsals remain display-only, and reads reduced motion dynamically. `createLifetime` releases the meshes and subscription after travel. There is no per-frame geometry creation. A build raises once on an active-place empty-to-built change; entering an already built place does not replay it. Switching on reduced motion during a raise settles it immediately.

Visual events are additive: `{type:'bulletin_opened'}` and `{type:'islet_build_raised',plot,preview}`. Existing interaction, travel and arrival payloads are unchanged. The audio owner uses these cues, the supplied fog-night/current storm fields, game night and current building list. Harbor and Lighthouse horns have separate timers. A forecast storm does not raise/snap a flag before it is current. The hook tone uses a null-to-present edge. Every cue has the visible equivalent listed in ASSETS.md; gain, gesture, mute and cleanup rules remain those of G5. Run `node scripts/check-harbor-life.js` / `npm run test:harbor:life`.

## Presenter kit (G8)

Only `?demo=1` enables the local, read-only tour. It has nine beats totalling **170 seconds**: intro, arrival, islet station build, sea chart, harbor bulletin/live captains, board, almanac fog/storm, Three Lights and Relighting/Gull’s Rest. There is no accusation or unmask beat. All data comes from the separate fake adapter and recorded weather; the tour makes no backend write. It changes the islet through a preview, then restores the latest accepted building state rather than an old snapshot. Skipping/restarting cancels deferred builds and scene waits.

| Key | Presenter action |
| --- | --- |
| Right / Space | Next beat |
| Left | Previous beat |
| P | Pause/resume tour timing and scheduled scene actions |
| B | Black out the presentation; B or Escape restores it |
| R | Restart |
| 1–9 | Jump to a beat |
| H | Beat list |
| N | Speaker notes |

The tour consumes these keys before intro choices and gameplay. Escape otherwise retains the shared top-panel → cinematic → pause rule. The black screen is a native top-layer dialog, with a scoped blanking class that keeps later auto-opened dialogs and their backdrops hidden until restoration. Ending or disposing the tour removes the class. Tour steps and cinematic timelines use monotonic visible elapsed time, rather than the capped physics delta. P and hidden-tab time do not count; the cinematic completion watchdog pauses and resumes with them. Physics and the fake adapter retain their existing capped updates. `demo/speaker-notes.js` holds two or three short editable talking points per beat. Presenter tools stay in the active dialog’s layer and remain reachable while its content scrolls.

`?demo=1&record=1` fixes the output frame and renderer at **1920 × 1080**, hides the cursor and trims optional HUD details. Use a 1920 × 1080 browser capture viewport to include native dialogs in the recording. `record=1` alone does nothing. The optional Exchange beat is omitted: the reviewed L4 README documents a development local fake, with no production-safe tour adapter yet.

`?perf=1` enables a lazy performance panel, including without the tour. It reports FPS, actual uncapped 95th-percentile frame time, draw calls, triangles, geometry/texture counts and JS heap where supported. **Copy numbers** copies the displayed measurement labels; unsupported heap is marked unavailable. Measurements collect per frame and paint every 300 ms. Sustained FPS below 45 for five seconds offers **Switch to low quality**; it never changes settings without a tap. Run `node scripts/check-presenter.js` / `npm run test:presenter`. Pure settings, timing, navigation, flash and performance helpers are covered by Vitest.

### G8 checkpoint 2 verification

At checkpoint start, fetched and merged main again; `origin/main` remained `8ff24cc` and the feature was already up to date. No Claude-owned source conflict or panel integration appeared.

`npm test` passes **330 tests / 55 files**. `npm run build` passes the spoiler/elimination guard (95 text files, twelve protected lines). The following passed sequentially: `node scripts/check-hook.js`, `node scripts/check-harbor-life.js`, `node scripts/check-presenter.js`, `DEMO_FAST=1 node scripts/check-demo.js`, `node scripts/check-loading.js`, `node scripts/check-csp.js`. The production presenter check has fifteen assertions, uses DOM rather than development globals, and runs with all APIs returning 503. It verifies native blanking above intro/board, pause, keyboard navigation, visible notes/toolbars and recording dimensions. The final capture was visually inspected.

Measured after settling: recording/presenter with eight local captains and board, **60 FPS**, **17.5 ms p95**, **107 calls**, **212 triangles**, **106 geometries**, **59 textures**, **17.2 MB reported heap**. Home life: 61 FPS / 44 calls; harbor life: 60 FPS / 52 calls. Three return trips kept the same geometry/texture counts and one active place root. Cold title: **21,060 JS bytes / 9,963 gzip**. A short-lived loading overrun was fixed with clearer disconnected-state copy; the budget was not raised. The browser pass also caught and fixed a component-versus-element caching error and a presenter panel placed below long modal content.

Evidence: `captures/20261106_G8-C2/`, `captures/20261106_G8-Presenter-Checks.json`, `captures/20261106_G8-Hook-Checks.json`, `captures/20261106_G8-Harbor-Life-Checks.json`. Not yet verified at this checkpoint: the uninterrupted 170-second run, the final combined regression/accessibility pass, real server transports/panels and physical devices. Those frontend checks continue in checkpoint 3; actual VoiceOver and noninstalled browser engines require the documented manual rehearsal.


## Accessibility (G8)

`npm run test:a11y` runs `scripts/check-a11y.js` with installed Chrome, without new packages or browser downloads. Its pure colour, contrast, size, overflow, target and name helpers are tested in `tests/a11y-helpers.test.js`. The browser report distinguishes measured DOM properties from manual screen-reader and pixel/canvas inspection. Controls keep visible focus, natural DOM order and the shared Escape rule: close the top panel, return to the canvas, and open Pause only on a later Escape.

### Fifteen-minute VoiceOver rehearsal

This is a manual script for Nils, not a claim that a real screen reader has passed. Use the local rehearsal `/?case=local`, with recorded/fake data and no live account. In the issue notes, record device/OS/browser, screen and control, expected and heard words, and the key or gesture. Leave any destructive confirmation unconfirmed.

| Minute | Safari on the Mac (first eight minutes) | Expected result |
| --- | --- | --- |
| 0–2 | Turn on VoiceOver with Cmd+F5. Read the title, rotor headings, New game, Continue, Settings and account/save controls. Tab forward and back. | App/title and each control have meaningful names. Continue's disabled state and the save status are spoken. Focus follows the visual order and is visible. |
| 2–4 | Open Settings. Read and change quality, one volume, text speed, reduced motion and hints; close and reopen. | Each control announces its label, current value and choices. The changed preference remains. Back returns to the opener. |
| 4–6 | Start the original intro. Read speaker, story, Show full text, numbered choices, inventory and move log. Finish an ending and inspect arrival. | Full text can be read without waiting for the typewriter. Choices have distinct names, inventory/actions are ordered, and ending notes are inside the card. |
| 6–8 | Open Crew and Board. Move through headings, seats, card titles, pin controls and pair selectors. Tab past the last control, then press Escape. | Focus stays in the dialog, controls identify their card/seat, the top panel closes and focus returns to the game canvas. Pause appears only on a second Escape. |

Continue for seven minutes in iPhone Safari with VoiceOver enabled in Accessibility settings. Use swipe-right/left and double-tap, plus the rotor's headings and form controls.

| Minute | iPhone steps | Expected result |
| --- | --- | --- |
| 8–10 | Read title and account controls in portrait. Open Settings and the controls overview. | All controls remain readable, have at least 44 × 44 CSS-pixel targets, and can be reached without sideways scrolling. |
| 10–12 | Open Account and saves. Read save choices, local-only/expired/offline feedback and deletion confirmation, without confirming deletion. Close it. | Names, states and errors are spoken in context; local progress is clearly distinguished. Focus returns to a useful place. |
| 12–15 | Inspect Search, Partners, Finale, Log and Rewards. Open the enabled fake bulletin, read Lisbon times, check weather attribution in Settings → Credits, and opt into the hook's spoken short/short/long sequence. | Timers and outcomes are available as words. Charts and partner travel have labels/captions. The pattern only speaks after a tap and stops when closed. Reduced motion gives still markers. |

### Other browsers and devices

No extra browser engines are downloaded by checks. If Playwright WebKit or Firefox is already installed, run the same title → intro → crew/board → chart/travel → finale-skip → bulletin journey with it and record the engine/version. Otherwise Nils should rehearse that journey manually in Safari and Firefox, including keyboard focus, native dialogs, Escape, sound after the first gesture, reduced motion and 320 CSS-pixel layout. Physical gamepad, touch steering and actual VoiceOver speech remain separate manual checks. The automated Chrome report cannot certify them.


## G8 verification

Checkpoint 3 fetched main again; it remains `8ff24cc77ab077e5d24fee297d568558315f6ed5`. The G7 branch is the base, and main was merged at checkpoint 1 (`35f4d3e`). Claude's islet, Exchange, desk and arena panels and real transport/adapter are not present on this main snapshot. No team-owned panel, transport, backend, story data, engine, infrastructure or credit row was changed. The golden path explicitly records `panelVerified:false`: it constructs the station through the accepted `islet_changed` event, verifies it in the world and uses it as the third finale light. The panel itself still needs Claude's combined-game test after integration.

The complete command record is [the 31-command verification report](captures/20261106_G8-C3-after-Verification.json). Run it with `npm run test:g8 -- --phase=after --keep-going`; `--resume` reruns failed commands and retains successful results. The report records the exact command, exit code, duration and log for every command. All **31 commands pass**, including **345 Vitest tests in 58 files**, the production build/strong spoiler guard, the 204-PNG generator, every existing browser check, and the islet, bulletin, hook, harbor-life, presenter and accessibility checks. The final build scans 97 text files against twelve protected lines and checks for elimination data. Final confirmation commands/logs are in [final-confirmation.json](captures/20261106_G8-C3-after/final-confirmation.json).

The uninterrupted nine-beat tour lasts **170,593 ms** with every API returning 503; its limit remains 210,000 ms. It attempts only the existing weather GET, writes no journal/backend state, emits no intro completion, restores the departure state, skips each beat within 238 ms in that run, and settles repeated End during travel. Production presenter checks cover recording dimensions, notes, navigation, P holding an active cinematic, and B remaining black when another dialog opens. A queued native `close` event after rapid restore/reblank is ignored when the blank dialog has already reopened. Escape restores the later dialog. Cinematics still emit exactly one started and terminal event; the three-lights sample completes in 8,017 ms including loading.

The extended golden path passes **91 checks** across solo/NPC and four-human crews, including New game from solved Gull's Rest. Chaos passes **210 checks with 96 injected intent failures**, plus bulletin off/unavailable/offline, missing tonight data and no islet event. A missing tonight remains a missing forecast, and a missing building event leaves the cabin-only world unchanged. Production CSP passes the title, tour, art library, UI gallery and auth-check page, with no violation.

### Measured budgets

Installed Chrome 157, Intel Iris Plus 655 through ANGLE Metal, sequential GPU checks. Values are samples on this Mac; they are not a frame-rate promise for every classroom laptop.

| Sample | FPS | Calls | Triangles | Geometry / textures |
| --- | ---: | ---: | ---: | --- |
| Islet, day 1280 px | 60 | 44 | 82 | 45 / 16 |
| Islet, night 1280 px | 60 | 43 | 82 | 46 / 17 |
| Islet, night 375 px | 60 | 46 | 167 | 48 / 17 |
| Eight captains | 60 | 109 | 216 | 106 / 56 |
| Eight captains, night storm after warm-up | 60 | 112 | 220 | 107 / 62 |
| Recording presenter with board | 60 | 105 | 208 | 104 / 61 |
| Gull's Rest, desktop / phone | 60 / 59 | 34 | 74 | 33 / 23 |
| Longer Lighthouse travel smoke, before / after | 57 / 47 | 97 | 192 | 96 / 27 |

Presenter p95 is **19.0 ms**, reported heap **13.2 MB**. Three repeat islet/harbor trips retain one place root and identical owned resource counts: islet 43 geometries/16 textures, harbor 50/25, each at 60 FPS. The earlier raw baseline records lower FPS while the Mac was under load; the frame thresholds and 150-call ceiling were not lowered. Rain/storm transition measurements are recorded separately from steady samples. The performance panel continues to offer low quality after five seconds below 45 FPS, with an explicit tap required.

Cold title JavaScript is **21,052 bytes / 9,944 gzip**, below the unchanged **21,080-byte** G7 ceiling. Caption placement loads only on the first cue. Captions use 18 px, sit above the measured world controls/prompt, and appear in flow below a modal heading so they do not cover its controls. World and modal caption placement have browser assertions and 375 px captures.

### Accessibility and readability evidence

`npm run test:a11y` passes **22 screen contexts**, **66 viewport samples** (1280, 375 and 320 CSS px), **200 actual Tab steps** and **1,522 text measurements**. Minimum computed CSS text contrast is **4.694:1**. It checks names and duplicate button names, font floors, DOM reading/Tab order, visible focus, modal traps/Escape, 44 px targets at 375 px, and overflow at 320 px. Intro, crew and account return focus to the canvas; Settings Escape returns to the title. Reduced motion has no running DOM animation and no fireworks. The report has zero browser errors, external requests or measured failures: [accessibility results](captures/20261106_G8-C3-after/20261106_G8-A11y-Checks.json).

The pass corrected contextual names for pin/search/order/post/lock/tip controls, named partner route SVGs, undersized body/metadata text, 42 px targets, native disclosure focus trapping, phone board/settings overflow, quiet-button hover contrast, and caption overlap. It preserves visible labels and data-driven intents. Captures were inspected at laptop and phone sizes. Actual image/canvas contrast, visual flash analysis, VoiceOver, physical phones/gamepads, Safari and Firefox remain manual; this machine has only Playwright's Chromium shell installed. No engines or packages were downloaded. Use the rehearsal above.

### Readability comparison and handoff

[HOW-IT-WORKS.md](HOW-IT-WORKS.md) contains the map, hotspot flow, view/intent boundary, ownership/render budgets, spoiler guard, all check commands, ten-file reading path and twelve explain-back cards. The 15 function readability pass covers bridge `ensure/onView/open`, manager `goTo/interact`, `createSettlement`, islet validation/store, hook normalization/flash advancement, harbor life, audio creation/cues and tour `enter/stop`. Each has a short purpose comment and clearer statements. Main/game were not reformatted; game has only the small cinematic pause hook at this checkpoint. The baseline's 331 tests and 90/210 golden/chaos checks, followed by the final 345 tests and 91/210 checks, retain the same rules and outcomes. Reentrant islet listener reads and flash arithmetic grouping are preserved.

Raw baseline and corrected-run logs remain under `captures/20261106_G8-C3-before/` and the final run's `iterations/`; failed attempts are retained. QA repairs include owned ephemeral dev/preview servers with awaited cleanup, standard Node HTTP readiness reads, waiting for the visible arrival hand-off, selecting either station lighting pose, recording the short landing fade as it happens, and waiting for the lazy first caption. A world run interrupted by a source update was rerun after the app was frozen. These fixes do not weaken outcome, frame, CSP or spoiler assertions.

Claude must mirror schema-1 `bulletin` with its off default, nested `log.observations`, and earned-only deduction `clears/clearedTitles`; the documented `islet_changed` payload is unchanged. Screens still make no fetch/online imports or rule decisions. Remaining integration work is the live adapter/services and Claude-owned panels, including their Escape checks and local build flow. The optional Exchange tour beat remains omitted until its production-safe rehearsal exists. Do not merge or deploy this branch from this lane.


### Gameplay credit placement (Nils, 6 November)

Nils rejected the large provider/licence block in gameplay. It is removed from both the world HUD and harbor bulletin. All source, adaptation and licence details remain in **Settings → Credits**, together with the existing team and tool credits. Credits is no longer a separate title or pause-menu button. Back/Escape from Credits returns to Settings; Settings then returns to its saved title/pause parent. The weather client, schema, supplied values and `weather_updated` event are unchanged.

`check-weather-wiring.js` now proves the four supplied weather values still reach the island, there is no attribution DOM in gameplay, and the source/licence links are reachable through Settings. The conditions strip is **224 × 58 px** at desktop width and **173 × 62 px** on the 375 px phone. Text sizes are unchanged. The credits page has 44 px link targets. The feedback photo and new clean-HUD captures are retained in `captures/20261106_G8-Credit-Placement/`.

After this correction, `npm test` passes 345 tests in 58 files and `npm run build` passes the 97-file/twelve-line spoiler guard. Nine focused browser checks pass: `node scripts/check-weather-wiring.js`, `node scripts/check-credits.js`, `node scripts/check-bulletin.js`, `node scripts/check-experience.js`, `node scripts/check-a11y.js`, `node scripts/check-readability.js`, `node scripts/check-loading.js`, `node scripts/check-production.js`, `node scripts/check-csp.js`. The exact results are in [the credit-placement report](captures/20261106_G8-Credit-Placement/Verification.json), in addition to the earlier complete 31-command G8 run.

The expanded accessibility pass includes Credits: **23 contexts / 69 viewport samples / 202 Tab steps / 1,537 text measurements**, minimum computed contrast **4.694:1**, zero failures/browser errors/external requests. Current cold title JavaScript is **21,080 bytes / 9,956 gzip**, matching the unchanged G7 ceiling. The original pre-feedback checkpoint measurements above remain historical evidence. Future integration must keep data/legal attribution in Settings → Credits and out of gameplay overlays.


## Build identity (G9 starter)

Vite injects `__BUILD_STAMP__ = {sha,builtAt}` at compile time and emits the same public fields in `build-stamp.json`. SHA resolution is validated `VERCEL_GIT_COMMIT_SHA`, then local `git rev-parse --short HEAD`, then `dev`; only a seven-character hex commit and ISO timestamp reach the browser. No environment object, credential or runtime Git/API call is exposed. `scripts/build-stamp.js` has injected dependencies so its fallback order is unit-tested.

Settings and Credits show the identity and build time explicitly in Europe/Lisbon. The world has a 16 px corner badge above its conditions strip. Presenter URLs (`?demo=1`, including recording) omit that badge, and app teardown/failed world loading dispose it. Captions treat its area as occupied. Run `npm run test:build-stamp` to verify compiled files, Settings/Credits, the phone badge and presenter exclusion.


## Problem reports (G9 starter)

Settings and Pause contain a prepared **Report a problem** link to the fixed `https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new` destination. It opens an editable draft in another tab, never submits it, and uses `noopener noreferrer`. The synchronous click handler refreshes the encoded URL without awaiting code or opening a scripted popup. Pause and other submenus load on demand to retain the title budget; request tokens discard late menus after Escape or navigation.

`diagnostics/report-url.js` accepts only `{build:{sha,builtAt},placeId,viewport:{width,height},inputType,actions}`. Commit/time, public registry place ids, bounded numeric dimensions, the `touch|mouse|gamepad` enum and fixed semantic action vocabulary are individually validated. Unknown keys and values are dropped. The body ends with an empty **What happened?** section and the URL is strictly shorter than 7,000 characters. No player/account/crew identifiers, names, device ids, tokens, URLs, save contents, case state, intent arguments, typed text or error strings are read into the report. The three-value field records the last pointer/controller kind and defaults to `mouse` on desktop; command keys do not overwrite an observed touch/gamepad type.

`diagnostics/trace.js` keeps only the last ten allowed action names in memory, returns copies and never persists them. The app-owned collector observes fixed control labels/command keys and the public `arrived` event, not outcomes. Gamepad code supplies only the coarse input enum. `{type:'app_disposed'}` clears its listeners/history; development hot disposal also cleans it up. Report controls attached after a cancelled asynchronous menu do not start a collector. The builder has unit privacy/bounds tests; `npm run test:problem-report` verifies menus, current place, viewport, input enums and unknown-label exclusion without navigating to GitHub.


## Server-call states (G9 starter)

`adapter/intent.js` is the shared presentation boundary. Screens still send intents through their supplied adapter and never call `fetch`. `call-failure.js` translates HTTP 401 → `session_expired`, 403 → `forbidden`, 429 → `rate_limited`, 503 → `not_connected`, other 5xx → `internal_error`; failed-fetch/network exceptions and `navigator.onLine === false` yield `offline`. Unknown exception text is never shown. Business refusals retain their supplied explanation and do not acquire a Retry button. Result views stay owned by the adapter.

The real adapter should return `{accepted:false,reason,message,view,retryAfterSeconds?}` or throw an error with `status` and optional `retryAfterSeconds`. Parse HTTP `Retry-After` at the transport boundary, not inside screens; provide a finite number of seconds in `[0,86400]`. The UI rounds up. A 401 should also publish the expired account view. Keep server request/idempotency identifiers inside the adapter: an explicit retry after a lost response must reuse/reconcile that request, especially for paid actions. The screen does not infer whether the server accepted a timed-out operation.

`createCallState({now?})` is the pure state model. `createServerCallState({label,onRetry?,onSignIn?,messageElement?})` provides an accessible DOM element. Call `loading()` before awaiting an intent; `succeed()` on success; `succeed({empty:true,message:'No records yet.'})` only for a successful response that the caller knows is empty; `fail(result,{retryable?})` on refusal. `showMessage(text)` is passive copy and `clear()` resets presentation. `dispose()` removes its node and timer. Text uses `textContent`, 18 px copy, 16 px/44 px buttons and live status/alert roles; there is no animation.

Retry is explicit for transport failures. A 429 counts down from a monotonic deadline once per displayed second, disables Retry until zero, and never calls the adapter automatically. Closing/disposal clears scoped countdowns; a hidden/detached dialog stops its pending timer. Authentication remains a caller-supplied action, with the existing account panel retaining its GitHub control. Save conflicts use the existing explicit copy-choice controls, not generic Retry.

Crew/board/search/partner/finale actions share one scoped case status; search inspection refusals remain visible when its screen opens. Navigation invalidates late status delivery without discarding adapter state. Intro arrival has its own status and explicit confirmation retry; a pending/refused receipt does not create a kit or destination. Account actions, external Continue failures and user-triggered emotes use the same component. Background position samples keep their quiet bounded reporter and presence connection label. Six gallery examples show loading, empty, error, offline, expiry and rate limiting. The fake adds a deterministic four-second `retryAfterSeconds` to its one-shot rate-limit fault without changing case rules.

Run `npm run test:call-states` for deferred loading, 375 px readability, explicit recovery, cooldown without auto-retry, account expiry/retry, late-close cleanup and empty-state samples while all APIs return 503. Pure tests cover safe failure mapping, domain refusals, states and injected-clock countdowns. Real transport/header parsing and retry reconciliation await Claude's adapter.


## Strict CSP readiness (G9 starter)

[CSP.md](CSP.md) inventories every built entry, authored/runtime style path, URL scheme and outside origin, and gives Claude the proposed HTTP policy. The four production HTML pages use same-origin script/CSS files with no inline scripts, style blocks, event attributes or authored style attributes. Constant chart/label CSS text moves to stylesheets; dynamic layout uses individual CSSOM properties. No remote asset/font/audio load, `eval`, `unsafe-inline`, `unsafe-eval`, `data:` or `blob:` allowance is needed. Dormant Three.js URL recognition/serialization helpers are listed separately from active resource loads.

Vite preview and `check-csp.js` share `scripts/csp-policy.js`, including explicit `script-src-attr`/`style-src-attr 'none'` and only the approved Supabase HTTPS/WSS connection origins alongside self. Credit/issue/OAuth navigation is documented separately. The existing team-check page's additional meta policy is preserved. Run `npm run test:csp:inventory` and `npm run test:csp`; the latter rehearses the built nine-beat tour with every API down. This package does not edit `vercel.json` or enable deployed headers. Claude must validate the integrated real adapter, deployed headers, OAuth and Realtime separately.


## G9 starter verification and handoff

Items 1–3 landed at `cae6dad`, `bb7599e` and `f413006`; item 4 contains the CSP readiness inventory/policy and final evidence. **360 tests / 62 files**, `npm run build` and the **107-file/twelve-line spoiler guard** pass. [Combined verification](captures/20261106_G9-4/Verification.json) lists **19 exact commands, all successful**, including 16 browser scripts across the starter: identity, report privacy, shared call states, chaos, golden paths, kit, case, intro, lifecycle, loading, accessibility, timed demo, CSP, presence, signal and production. Earlier item-3 regression logs and final frozen-source runs are retained alongside captures; attempted runs remain in `iterations/`.

Cold title: **20,617 bytes / 9,803 gzip**, below the unchanged 21,080-byte cap. Eight captains with night storm: **59 FPS / 112 calls / one place root**. The full API-independent demo completes in **170.1 seconds**; policy rehearsal also walks all nine highlights with every API returning 503. Accessibility: **23 contexts / 69 viewport samples**, minimum sampled text contrast **4.694:1**, zero reported accessibility failures. The 375 px failure capture keeps request copy at 18 px and action controls at 16 px / 44 px.

Requests for Claude: return bounded numeric `retryAfterSeconds`, publish expired account state on 401, and keep request reconciliation/idempotency inside the real adapter for explicit retries after lost responses. Enable/rehearse the proposed HTTP policy after integration and confirm only the exact approved Supabase HTTPS/WSS origins are required. Real services, deployed headers, Safari/Firefox and physical device/VoiceOver checks remain unverified. No backend, auth transport, weather client, case rules, infrastructure or new dependency is changed. Continue the full G9 brief on this same branch.


## G9 playtest identity and reports (stream 0)

The original SHA fallback order is unchanged. Local builds append `-dirty` when Git sees uncommitted
files; valid `VERCEL_GIT_COMMIT_SHA` wins on Vercel. `environment` is only `preview`, `production` or
null, from `VERCEL_ENV`. The public stamp remains `build-stamp.json` and `__BUILD_STAMP__`. Build HTML
contains the title label. A build-only virtual stylesheet places the same label inside the title header
without shipping JavaScript for that label; the generated CSS is extracted into a normal hashed local
stylesheet. Settings, Credits, the presenter-hidden world badge and performance clipboard copies agree.

Issue titles use `[playtest <sha>] <place or screen>: `. Added context is restricted to screen/mode/account
state enums, browser family and major version, and numeric performance summaries only when `perf=1` runs.
The last-ten list accepts fixed UI actions and `caseMethods` → `accepted|caseReasons`, never arguments.
`noteAdapterView`, `noteIntentOutcome` and `notePerformanceSummary` retain only these allowed fields in
memory. Unknown values are dropped, old actions are trimmed for the URL budget, and no length exception
is thrown. Both description sections remain blank, with a visible public-GitHub/account explanation.
`createServerCallState` accepts a `reportLink` hook; stream 5 fills it for every error state.

Stream 0 gate: unit/build/loading, title stamp/performance copy, problem report, CSP and accessibility
checks pass. Its independent title graph is 20,971 bytes; stream 1 adds further headroom before the real
adapter. The unchanged refusal vocabulary lives in `adapter/reasons.js` and is re-exported by `contract.js`
so diagnostics can load it separately. No schema, method, reason or browser event is added. Requests and
ongoing checkpoint state are in [HANDOFF-G9.md](HANDOFF-G9.md).


## G9 adapter selection and title headroom (stream 1)

`adapter/selection.js` pins the query table: local rehearsal needs development or `demo=1`; production
`case=local` alone stays disconnected; a plain demo uses its own disconnected world; ordinary play has
one lazy real-adapter entry. Checkpoint 0 deliberately keeps `REAL_ADAPTER_READY=false` until stream 2
passes conformance. Its reserved factory is a placeholder, not an online implementation. A failed
chunk has a plain disconnected notice. The sign-in return hook recognizes only the presence of code
or error; stream 3 implements PKCE and address cleaning.

The richer account summary loads after the title paints, with disposal/cancel guards and an Account
button fallback for import failure. The refusal list loads independently while `contract.js` preserves
its existing exports. Cold title JavaScript is **19,679 bytes**, leaving **1,401 bytes** under the
unchanged 21,080 cap (starter baseline 20,617). One laptop observation measured title readiness / first
contentful paint at 158.3 / 192 ms before, and 524.9 / 508 ms after; these uncontrolled samples on a busy
laptop do not demonstrate a latency improvement. The network never gates this disconnected title.

The header builder and source-of-truth rule are in [CSP.md](CSP.md), Security headers (G9).
`npm run print:headers` prints the no-address proposal; pass the approved public Supabase origin to
include its exact HTTPS/WSS pair. `npm run test:title-start` records title paint timing.
The old bulletin test's other-worktree fallback is removed. Its canonical parity check runs only when
`../backend/content/bulletin.json` is in this checkout; it is explicitly skipped until group 2 merges.
No main/server file was authored or edited by this stream.


## G9 real adapter core (stream 2)

Ordinary play selects a lazy online proxy. Two animation frames let the native title dialog paint
before `src/online/case-adapter/index.js` loads. An early player intent can start it immediately.
The factory returns synchronously; config/account/save/crew reads run outside the render loop.
Every public view is a fresh schema-1 clone with all 24 keys, `mode: 'online'`, and no raw account,
crew or partner identifiers. `case_updated` is delivered before an intent resolves. Disposal stops
polling/listeners, and a session epoch rejects late private reads and recovery writes.

The transport uses A2's private API and a separate token-free public API. Error mapping is in
`reasons.js`; `uid.js` retains the same action UID across a single read-first retry after an uncertain
write. Completed server codes reread the authoritative snapshot. Save PUT is never blindly resent.
`validate.js` checks input shapes; read/profile envelopes are checked before replacing last-good data.
Signed-out Act 1 stays on its local accepted-move journal; kit confirmation refuses with
`sign_in_required`. Kit display names/archetypes live in `adapter/shared/kits.js`, imported by both
adapters without importing rehearsal rules into the online graph.

`npm run test:online` builds and plays the ordinary production path on recorded answers at 1280 and
375 px. Stream 2 covers anonymous Act 1, the preserved journal and no local kit/account grant; later
streams extend this same path. Every API request is intercepted. `npm run test:g9 -- --phase=after
--keep-going` runs G8's 31 baseline commands plus G9 checks sequentially; `--resume` retries failures.
The shared closed-service browser fixture precedes each route-specific fixture, so old production
checks remain independent of the API. Test artifacts contain relative paths and no tokens.

Main `60f7fd0` now owns the enforced platform headers. Preview mirrors their exact text, rather than
requiring the earlier proposal's redundant explicit directives. Validation still rejects unsafe
scripts/styles, wildcard connections, foreign project origins and duplicate directives. Header
changes belong to Claude; G9 changes no platform configuration.


Stream 2 verification: **1,096 tests / 91 files**, production build/spoiler guard and all **37** driver
commands pass. Cold title is **20,971 bytes** (10,041 gzip), leaving 109 bytes below the unchanged
21,080 cap. The real adapter remains a separate chunk requested after the first title frame. Primary
button contrast is **6.48:1**; the world retained its counts through ten round trips at 60 fps on this
laptop. These are local Chrome observations, not deployed/mobile-hardware results. Exact evidence:
`captures/20261106_G9-C1/stream2-verification.json` and the sibling C1-after regression manifest.
The old intro check now allows the expected token-free config GET while preserving the actual public
intro API probe; the expired-account check waits for its lazy screen before asserting its sign-in
control. A repeated refused case answer stays refused while requesting a fresh snapshot.

## G13 checkpoint 1: festival workshop and pure rules

Nils' G13 is on `feat/g13-festival`. The 56 original pixel additions (twelve lamps
in four states plus marker, stall, bunting and ring day/night variants) are in the
searchable workshop, with four original sound auditions. Sources and credits are
in `ASSETS.md`; new art remains outside the default game preload. No live
festival screen, sound, claim write, queue or duel is connected. The new server
flag `festival` is off by default. Existing G6 display-only effects are unchanged.

`backend/server/festival/` contains I/O-free 48-hour lifecycle, exclusive claim
and FIFO pairing decisions; see `specs/G13-festival.md` for the exact handoff.
G10 Phase 3 and A7 are missing from the current main, so routes, the reserved
migration, real screens and `?demo=1&festival=1` rehearsal remain deferred. G8's
CSP code/regression commands and `HOW-IT-WORKS.md` are also absent; no replacement
for those packages was invented.

Verification for this checkpoint: 3149 pytest tests, Ruff clean, 294 Vitest tests,
four-entry build and automatic spoiler guard; 12 existing pixel-browser checks
covering all 251 PNGs and the unchanged default preload; seven existing production
checks; 15 festival workshop checks under self-only script/style CSP, including
phone/keyboard access and sound playback. All 255 PNG/WAV artifacts regenerate
byte-for-byte with the full pixel generator and the new standard-library audio
generator. Independent agents reviewed the backend and frontend read-only.

Run from `frontend/`: `npm test`, `npm run build`,
`CHROME_PATH=/usr/bin/chromium npm run test:art`,
`CHROME_PATH=/usr/bin/chromium npm run test:production`, and
`CHROME_PATH=/usr/bin/chromium npm run test:festival` after build.
The festival smoke accepts `CAPTURE_DIR` for evidence outside the checkout.
Review art and phone screenshots plus the strict-CSP report are in
`captures/20261106_G13-Festival-*`. This is Chromium/software-rendering evidence;
Safari, physical phones and live server/storage integration remain unverified.

## G13 live frontend integration

The earlier checkpoint's deferred frontend work is now implemented in `src/screens/festival/`. The live feature remains controlled by the server's `festival` flag; the new title/pause and HUD launchers do not depend on the paused ordinary case adapter. The server owns timer/claim/ring state and friendly-duel outcomes. The explicitly labelled `?demo=1&festival=1` rehearsal has a separate memory-only transport and creates no real claims, matches or coins. See the screen's README for the frozen request shapes, retry/privacy behavior and browser gates.

The original loop and cues now use the existing trusted-gesture audio owner and music/effects buses. Play starts festival music; shared volume controls and visible captions remain available. All 56 festival drawings remain outside the world's default preload. The additional recorded-audio module is lazy, and the account summary retains its title slot while loading its presentation after first paint.


## Sign-in (G9, stream 3)

`online/auth.js` lazily loads the pinned Supabase SDK for GitHub PKCE/S256 only. The selector consumes
and removes callback fields before starting auth. Ordinary title startup waits for no auth request;
restoration starts after the title/config, and production sign-in controls require `flags.sign_in`.
Without the public build values, Account explains that sign-in is not set up and Act 1 remains local.

The SDK owns opaque session strings through `auth-storage.js`; its default is `sessionStorage` for
this tab, with memory fallback. PKCE verifiers always need tab storage. A unique SDK broadcast namespace
maps to stable owned storage keys, so another tab cannot adopt this tab's auth broadcasts. A2's
`session.js` still contains only the access token in memory. A2 retries a 401 once after deduplicated
renewal, checking identity again before replay; cached public routes never carry authorization.

Logout clears owned persistence immediately, detaches the old SDK into opaque private memory for
its normal logout, and closes it after completion or a ten-second limit. Epochs prevent old exchanges,
refreshes, responses or lazy imports from restoring a signed-out identity. Normal app disposal keeps
tab persistence for reload and blocks late SDK writes. No refresh token is read by application code.

Recorded production checks use a generated placeholder key and tokens, an intercepted Supabase origin
and main's exact header set with only that origin substituted. They verify PKCE, address cleaning,
tab-only persistence, reload, logout, public requests and absence of production inspection hooks.
Full notices are retained in Settings → Credits. Actual OAuth/deployed and physical-device proofs
remain separate. See [the stream-3 gate](captures/20261106_G9-C1/stream3-verification.json).


## Account, replay saves and deletion (G9, stream 4)

Sign-in initializes the server-owned captain name before any presence starts. The server confirms the
first Act 1 kit and coin grant; replaying Act 1 displays “Welcome back” and keeps that first grant.
The account screen displays the supplied reroll allowance, save state and Lisbon-local timestamps.
Rewards show only the own-row amount, plain reason and date, with no ledger references or player IDs.

Cloud `data` is `{kind: 'intro' | 'world', actions: [accepted_action_id, ...], place: known_place_id}`.
The replay has at most 300 validated action IDs and 100,000 encoded bytes; it contains no engine
snapshot, case answer, reveal text or auth data. Intro replays use `lighthouse_isle`. Saving happens
after confirmed Act 1, on later place changes and at most once a minute while dirty. Timers pause in
hidden tabs and do no work in the frame loop. An unknown PUT outcome reads the current save before
another write. Conflicts require a choice: keep this device rereads the version before replacing the
cloud copy, while use cloud updates the device journal and continuation without a replacement PUT.

Each identity starts with automatic cloud writes paused until its current authoritative save has
been reconciled. Device moves may continue to stage while reads are pending; a delayed crew read
cannot let an autosave overwrite a different cloud replay before the conflict choice appears.
Late flushes are scoped to the identity and cannot clear a newer pending write. Continue also waits
for pending initial hydration and reconciles its fresh save read before publishing a continuation;
it cannot silently choose a different cloud replay. Logout removes the
checked crew preview and cloud-conflict state while keeping valid device progress continuable.

Deletion requires two taps and explains the complete data removal, including coin ledger history.
Only `{deleted: true}` clears the accepted-action journal and owned auth persistence; ordinary logout
keeps the journal. Late responses cannot clear or overwrite a newer account. Browser fixtures cover
the complete account journey at 1280 and 375 px; accessibility includes all account states at 320 px.
These checks use generated placeholder credentials and intercepted endpoints. Live accounts,
databases and deployed callbacks remain unverified.


## Request states and recovery (G9, stream 5 foundation)

The request kit waits 300 ms before showing loading, marks reads slow after five seconds and offers
fixed safe words, an explicit retry and a public problem draft. A refused control stays focusable with
`aria-disabled` during its supplied countdown; its handler rejects activation until the deadline.
Screen readers hear the start and end, while visible seconds change quietly. Session expiry keeps
the accepted journal and requires a fresh user action before a write can be sent again.

The adapter's GET monitor retries network/503 reads after 5, 15 and 30 seconds, then waits for a tap.
It keeps failures by resource, pauses timer remainders while hidden and invalidates late finishes on
logout/disposal. Public config uses the same bounded schedule and focus cannot bypass a failed read's
deadline. A recovered own-account read completes the rest of account hydration; a recovered save
reconciles device/cloud copies. Failed ledger reads retain a visible unavailable state and safe status,
without forwarding SDK errors or query data. Connection retry uses the existing continuation intent;
the standalone banner reads without navigating. No additional public intent or event was added.

Nested additive fields are `account.connection {state,message,reason}`, `account.namePending`,
`account.canRetryName` and `rewards.status`. Screens still receive only projections and send intents.
First arrival sign-in is distinct from session expiry, obeys the production flag/public build values,
and preserves the accepted journal for its first authoritative claim after the return and Continue.

`npm run test:online:chaos` uses production UI with generated credentials and intercepted endpoints.
Current coverage is seven faults each for account/intro/save/crew (28 cases); the report names pending
later route groups. `--all-groups` refuses incomplete coverage. Every subsequent integration grows it.
The 38-context accessibility pass includes all request states at 375/320; account text is 18 px and
controls stay at least 16 px / 44 px. See the stream-5 verification manifest for exact evidence and
limitations; live accounts, services, deployments and physical devices are not claimed.


## G9 stream 8: authoritative home islet

The exact session’s factory owns one L2 engine shared by the islet panel and the existing station
`buildLight` intent. The complete five-plot server catalogue supplies prices, materials, permissions
and standing buildings. A fresh accepted GET precedes an explicit retry of an uncertain write;
refused resends keep the original click ID until an authoritative built answer or account reset.
The shared call UI owns loading/slow/report states and the original 429 deadline. No timer repeats
a build. Sign-out/expiry/deletion clear private world builds and invalidate held work.

The muster reminder opens that panel. The finale can display its supplied station card while the
case remains disconnected; live case projection and post-build refresh still wait for R11. Actual
local rehearsal builds through the panel, sees the station stand and uses the third light. The
recorded production path builds through A2 and captures the actual station after public chart
travel and native walking. Native cloud-save readiness is asserted before captures.

Optional nested contract fields are `crew.isletReminder`, `finale.islet` and `finale.isletFailure`;
see `src/adapter/contract.js` and shared conformance. Schema 1, 24 keys, 25 intents, exact
`islet_changed` events, replay and the server-free tour remain intact. The Account expiry panel
reuses one genuine expired/report component, preserving primary sign-in focus and the device journal.

All 11 stream checks pass: 2,896 tests/195 files, 42 production islet checks,
7 islet faults/42 assertions, 45 accessibility contexts/135 samples and short 375 × 400 audits.
Cold title is 21,071 JS/11,878 CSS bytes under unchanged caps.
See [stream-8 evidence](captures/20261107_G9-C3/stream8-proof.json) for fingerprints, complete gate
logs, prior failed attempts and limitations. This is not a checkpoint: committed-source full44,
R11’s case DTOs and R16’s target-hardware frames remain outstanding. No real account/service/database,
other-engine or physical-device proof is implied.


## Overflow 1–3: idle hints, accessibility and touch walking

The [release note](../docs/handoff/overflow-1-3-release.md) records the reviewed G9 integration,
recovery fixes, five device-dismissed hints and shared open-panel styles.
On phones, tap a clear map path or room floor to walk, or hold the movement stick / room D-pad.
Manual input and overlays cancel a route; movement still uses the ordinary collision controller.
Hints stay clear of the HUD and touch controls and pause during movement or open panels.

Run `npm run test:input` for bounded route, pointer cancellation and input arbitration regressions.
Run `npm run test:mobile` for complete Chromium/CDP touch checks at 320px, 375px and landscape.
Run `npm run test:panels` for the 12-panel / four-viewport layout proof, and `npm run test:a11y`
for the complete keyboard, contrast, target-size and reduced-motion audit.
These use local fixtures; physical devices, screen readers and real OAuth/crews remain separate checks.

The deeper player-experience pass adds `test:friends`, `test:settings:visuals`,
`test:inspections` and `test:story:polish`. These cover staged multiplayer entry, initial
focus, readable supporting pages, earned inspection results and compact story controls.
Each visual report records fixture-only scope and physical-device limits.

## G29 C4: world lighting, sea, weather and moments

Everything here is code-drawn on the native pixel grid (credits in ASSETS.md); the binding art rules
are unchanged. One full-screen shader plane replaces each old flat layer, so the draw-call count stays
about where it was.

- **Sea** (`world/water.js`): an app-owned shader plane under every place. `water.setCoast(group)` runs
  on every arrival and turns the place backdrop's alpha into a 256 × 192 distance field (cached per
  image), so foam, shallows and the moving surf line follow each coast. `seaUniforms` and `seaGlsl`
  share that field and the sea clock with beams and rain.
- **Day and night** (`world/sky.js`): the clock now starts at the player's local time and runs in real
  time (T still runs the fast clock; automated browsers keep the old 10:24 start and pace so checks stay
  deterministic). Dusk tints rose, night blue with a dithered vignette.
  `world/light-pools.js` reads lanterns, lit windows and beacons from the placed sprites and draws warm
  pools above the night wash; `extra(key, pools)` adds owned pools such as lit class lamps.
- **Beam** (`world/beam.js`): four dithered steps; over the sea it lights wave crests.
- **Weather** (`world/weather.js`, `world/wind.js`): pixel rain streaks leaning with the wind, splashes on
  land and rings on the sea, fog banks drifting with the wind, tree crowns sliding whole pixels.
- **Moments** (`world/fx.js`, `scene.userData.pixelFx`): one geometry for sparks, rings, rays and bloom.
  Captains arriving in a room after the first snapshot get a ring and a few sparks (at most six a
  second); emote bubbles pop in by whole-number scale steps (2× in the class harbor); lamps ignite with
  sparks and a ring; the Keeper's Lock pulses after its cutscene; the relit lighthouse blooms, throws
  slow rays and sparks after its cutscene, and keeps faint rays while relit.
- **Title** (`title/animated-title.js`): imported after the first title paint. It animates the G29 title
  planes on one native canvas over the painted title, which stays as the instant first frame.

**Quality and motion.** The existing Settings quality (high/low) is reused: low quality draws no sea
glints, strokes, rings or moving foam, halves rain and every spark burst and skips splashes and beam
sparkles. Reduced motion freezes the sea, rain, fog and trees, holds the beam pointing out to sea,
replaces sparks, rings and rays with a single fading bloom and draws one still title frame.

**Evidence.** `npm run capture:wow -- <label>` writes 1280 × 720 shots and frame numbers at 40
simulated captains (also 1440 × 900 at 2×) to the fri6-integration evidence folder.

**Measured (9 November 2026, headless Chrome 157, Intel Iris Plus 655, `?demo=1&captains=40`, 240
frames).** Before (f9acee7) / after: 1280 × 720 clear day 60 / 60 fps, 95 / 94 draw calls, 266 / 266
triangles; storm at night 60 / 60 fps, 97 / 98 calls. 1440 × 900 at 2×: clear day 60 / 60 fps,
storm at night 60 / 59 fps, at most 99 calls and 285 triangles. During the relight (rays, bloom and
200 sparks) about 101 calls and 1,581 triangles. Cold title JavaScript 20,606 bytes (limit 21,080),
CSS 11,404 bytes (limit 12,000). Numbers taken while another agent ran browser suites were noisy
(as low as 31 fps before and after) and are not used.

## Clean look (td-clean, 11 November)

The world draws 1:1 at 16 native pixels per unit into a small buffer that the browser magnifies by a
whole number of device pixels (`image-rendering: pixelated`): 640 × 360 at 1280 × 720 and 1080p,
480 × 300 at 1440 × 900, 576 × 360 at 1440 × 900 retina, 282 × 610 on a 375 × 812 phone
(`nativeViewport` in pixel/display.js, core/renderer.js). The camera sits on whole native pixels and
its zoom takes whole device-pixel steps, so the battle view gets a bigger buffer, not shrunken sprites.
Sprites load the 16 px/unit sources by default (`loadArt(ids, {detail: true})` still loads hd/).
`pxSteps`/`pxBands` no longer dither: sea, night corners, fog, light pools, beam and moments are flat
bands with crisp edges. Ground and place backdrops have calm grass bands, clustered tufts, a few
flower clusters, flat paths with a one-pixel rim. The coast distance field keeps linear filtering on
purpose (it is a distance field, not art). Measured at 1280 × 720 with `?perf=1`: 60 fps, 55 calls.
