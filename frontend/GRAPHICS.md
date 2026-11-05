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

UI typography is independent of pixel-art resolution. At verified desktop sizes, main labels and controls use 14 CSS px, hotspot names and chart destinations 16 px, headings 26–32 px, and supporting labels at least 14 px. Laptop layouts retain readable text rather than shrinking the interface with the art. Chart destinations are native buttons in a modal dialog with focus and keyboard navigation. Reduced motion skips sailing and character stride/bounce. Touch controls, optional gamepad and 375 px menu/HUD layouts are implemented in G5; see Controls below.

The close camera follows the player and keeps extra headroom near the Lighthouse tower. Cottage roofs reveal the interior/desk; foreground trees fade. Piers draw beneath the explorer and are walkable; open sea is blocked. The Harbor Office's matching window overlay glows at night and is visible from the dock spawn. It supplies no story explanation.

## Art, coordinates and ownership

The library has **185 original sprites and 10 backgrounds/charts**. ASSETS.md records every new sprite, its source and dimensions. Rebuild with `python3 scripts/pixel_art/generate.py` using Pillow for offline authoring only. No external image, font or model is used.

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

Current branch is feat/g6-case-on-screen, created from origin/main 3ca7d38 after Claude merged G5. Root remains the sole writing agent; subagents review read-only. G4/S2 is already merged into main. G6 changes only frontend/ plus the authorised G-lane Next steps and one Log entry in docs/STATUS.md. Claude integrates; this branch does not merge into main or deploy. Incoming backend, API weather client, story engine, account, infrastructure and secret content remain unchanged.

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

Escape closes the top story/chart/cinematic view first; from the world it opens Pause. Resume restores canvas focus. Settings/Credits return to the menu that opened them. The native menu traps Tab/Shift-Tab, restores a visible invoking control, and blocks movement, interaction and travel through the existing world lock. Returning to title does not erase the intro. **A2 hook:** replace the `onPlay(resume)` callback in `main.js` with a cloud-aware loader when that package exists; `game.begin(resume)` and `world.intro.actions` remain presentation/replay hooks. No account token, captain state or server verdict is fabricated here. Integrate feature controllers beside intro/chart in `game.js`, passing the existing world and audio cue callback; keep the title bootstrap small. `window.__island` remains development-only and is not a production integration API.

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

The intro slice uses `demo/intro-story.json`, an unchanged public S1 copy, with the unchanged engine and a memory-only adapter. It neither reads/writes the player journal nor emits `intro_ended`. Recorded weather is a credited local sample; fog/storm are clearly labelled presentation overrides. Incoming live-weather updates do not replace a running tour's overrides. The existing best-effort weather GET may still run, but neither weather nor intro API availability gates the tour. There are no backend writes. Preferences remain the normal app's local preferences, independent of the rehearsal. No board rules, economy, sign-in, rewards or shared solve state are simulated. The unmask uses anonymous staging and supplies no reveal identity.

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
| `npm run test:weather:wiring` | three checks: existing values, readable attribution and browser errors |
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

G6 implements screens against one injected client adapter. `startGame({caseAdapter})` accepts the future real adapter; `adapter/bridge.js` owns lazy screen construction and disposal. No screen imports `fetch`, the session, the API client or case rules. `adapter/unavailable.js` is the normal disconnected default and grants no kit/save/solve. Development `?case=local` and the explicit rehearsal workshop `/case-lab.html?demo=1` use a memory-only fake. Nothing in that fake is authoritative or persisted. The S0 drafts were read from the separate story worktree on 5 November and are still awaiting approval; G6's extended paid/ruin/festival screens follow Nils's explicit brief without approving those backend rules.

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
| `node scripts/check-weather-wiring.js` | three assertions: existing values, readable attribution and browser errors |
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

Not verified: Safari/Firefox, physical phone/gamepad hardware, actual screen-reader software, a prolonged soak, live authenticated/shared-case/cloud/referee/ledger routes or a deployed G6 build. The production default is deliberately disconnected until Claude supplies the real adapter; it invents no kit, save, reward or solve. S0 draft approval remains Nils's decision. The feature branch is based on main `3ca7d38`; main later advanced independently to `8215825` (keep-alive work), which this branch does not merge or edit. Claude integrates G6. No main merge, force-push, manual deployment, sign-in UI or trading screen is part of this work.

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
