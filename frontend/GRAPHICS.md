# Saltreach Isles graphics

The approved direction is original, code-authored top-down pixel art, selected by Nils on 5 November 2026. G2/G3 extends the approved Lighthouse Isle into seven owned places. G4 adds the reusable UI kit, original story art, five finale beats and the playable original intro (S2). G5 adds the title/pause shell, shared settings, original procedural audio, touch/gamepad controls, the local highlights tour and lazy loading. Rich greens, tan paths, clustered foliage and selective dark outlines keep the explorer and landmarks readable. Gold is reserved for lights, interaction and clues. The old paper studies are archived and excluded from the active build. The supplied style reference is excluded from Git and runtime art.

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

UI typography is independent of pixel-art resolution. At verified desktop sizes, main labels and controls use 14 CSS px, hotspot names and chart destinations 16 px, headings 26–32 px, and supporting labels at least 12 px. Laptop layouts retain readable text rather than shrinking the interface with the art. Chart destinations are native buttons in a modal dialog with focus and keyboard navigation. Reduced motion skips sailing and character stride/bounce. Touch controls, optional gamepad and 375 px menu/HUD layouts are implemented in G5; see Controls below.

The close camera follows the player and keeps extra headroom near the Lighthouse tower. Cottage roofs reveal the interior/desk; foreground trees fade. Piers draw beneath the explorer and are walkable; open sea is blocked. The Harbor Office's matching window overlay glows at night and is visible from the dock spawn. It supplies no story explanation.

## Art, coordinates and ownership

The library has **182 original sprites and 10 backgrounds/charts**. ASSETS.md records every new sprite, its source and dimensions. Rebuild with `python3 scripts/pixel_art/generate.py` using Pillow for offline authoring only. No external image, font or model is used.

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
| `saltreach_harbor` | Shared visual hub, eleven hotspots and nighttime office windows |
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
| `plot_1` | home_islet, cabin plot |
| `plot_2` | home_islet, workshop plot |
| `plot_3` | home_islet, windmill plot |
| `plot_4` | home_islet, greenhouse plot |
| `islet_signal_station` | home_islet, signal station |
| `back_room` | smugglers_cove, back-room entrance |
| `low_tide_cave` | smugglers_cove, low-tide cave entrance |
| `arena_gate` | smugglers_cove, arena entrance |
| `salvage_yard` | wreck_point, salvage shelter |
| `beach` | wreck_point, wreck beach |
| `reef` | the_teeth, reef rocks |
| `watchtower_ruin` | the_teeth, ruined tower |
| `raid_arch` | the_teeth, raid entrance |
| `fog_bank` | the_teeth, northern fog edge |

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

Current branch is feat/g5-experience-layer, created from main acdd341 and synchronised with main 8d0a718, including the unchanged Exchange backend. Root remains the sole writing agent; subagents review read-only. G4/S2 is already merged into main. G5 changes only frontend/ plus the authorised G-lane Next steps and one Log entry in docs/STATUS.md. Claude integrates; this branch does not merge into main or deploy. Incoming backend, API weather client, story engine, account, infrastructure and secret content remain unchanged.

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

The existing startLiveWeather({setWeather,onUpdate}) starts only after Lighthouse place loading succeeds, as INTERFACES.md specifies. Its stop function runs during app disposal. onUpdate renders weatherAttribution(answer) beside the conditions with readable 14 px source/adaptation and CC BY 4.0 links, then emits {type:'weather_updated',source,fetchedAt}. The L1 module, API and provider logic are untouched. The legal/source links are text, not external visual assets. The original manual atmosphere controls still work.

Graphics tests intercept /api/weather with deterministic responses to avoid provider variation; test:weather:wiring proves those values reach getWeather and checks both attribution links. S2 browser tests use the real intro endpoint while weather is isolated. No auth/config/me/trading/board/reward route is called by this graphics implementation.

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

Escape closes the top story/chart/cinematic view first; from the world it opens Pause. Resume restores canvas focus. Settings/Credits return to the menu that opened them. The native menu traps Tab/Shift-Tab, restores a visible invoking control, and blocks movement, interaction and travel through the existing world lock. Returning to title does not erase the intro. **A2 hook:** replace the `onPlay(resume)` callback in `main.js` with a cloud-aware loader when that package exists; `game.begin(resume)` and `world.intro.actions` remain presentation/replay hooks. No account token, captain state or server verdict is fabricated here.

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

Only the exact `?demo=1` query imports the presenter and its local data. Choose **Highlights tour** on the title or **Start highlights tour** in the presenter panel. The automatic script is 153 seconds: intro 24, arrival 16, chart/sailing 22, Harbor 24, fog 14, storm 14 and finale 39. **Space / Next beat** skips the current beat; **End rehearsal** ends it. The panel moves into the active modal so touch and keyboard controls stay available. Individual visual shots remain under its disclosure.

`demo/logic.js` is the pure step machine. `demo/tour.js` owns its waits, generation checks, one active step and shared stop cleanup; it awaits any current travel before restoring the departure place/position, hour and weather. Place assets have the existing bounded load waits. Skip closes the current dialogue/chart/passage/shot, drops stale scripted actions and continues. App disposal cancels waits and subscriptions. No world lock is held over the whole tour, since that would block the tour's own travel/cinematics.

The intro slice uses `demo/intro-story.json`, an unchanged public S1 copy, with the unchanged engine and a memory-only adapter. It neither reads/writes the player journal nor emits `intro_ended`. Recorded weather is a credited local sample; fog/storm are clearly labelled presentation overrides. Incoming live-weather updates do not replace a running tour's overrides. The existing best-effort weather GET may still run, but neither weather nor intro API availability gates the tour. There are no backend writes. Preferences remain the normal app's local preferences, independent of the rehearsal. No board rules, economy, sign-in, rewards or shared solve state are simulated. The unmask uses anonymous staging and supplies no reveal identity.
