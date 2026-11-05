# Saltreach Isles graphics

The approved direction is original, code-authored top-down pixel art, selected by Nils on 5 November 2026. G2/G3 extends the approved Lighthouse Isle into seven owned places. Rich greens, tan paths, clustered foliage and selective dark outlines keep the explorer and landmarks readable. Gold is reserved for lights, interaction and clues. The old paper studies are archived and excluded from the active build. The supplied style reference is excluded from Git and runtime art.

## Run, controls and readability

From the worktree root, `cd frontend`, then `npm install`, `npm run dev` and open Vite's address. Use the Node versions in package.json. `npm run build` writes dist and `npm run preview` serves it. `/asset-library.html` is the searchable pixel workshop.

| Input | Action |
| --- | --- |
| WASD / arrows, Shift | Walk, run without a diagonal speed boost |
| E | Interact once per held press |
| M / Sea chart button | Open the chart; Tab/arrows choose, Enter sails, Esc closes |
| Enter / Skip passage / Esc | Skip sailing; the landing panel stays until assets finish loading |
| Fast travel on chart | Skip the passage animation |
| Wheel | Discrete 1×/2× zoom |
| T; 1 / 2 / 3 / 4 | Fast clock; clear / overcast / storm / fog |
| Settings; Escape | Time/weather/quality controls; close and restore game focus |

UI typography is independent of pixel-art resolution. At verified desktop sizes, main labels and controls use 14 CSS px, hotspot names and chart destinations 16 px, headings 26–32 px, and supporting labels at least 12 px. Laptop layouts retain readable text rather than shrinking the interface with the art. Chart destinations are native buttons in a modal dialog with focus and keyboard navigation. Reduced motion skips sailing and character stride/bounce. Touch movement is not implemented.

The close camera follows the player and keeps extra headroom near the Lighthouse tower. Cottage roofs reveal the interior/desk; foreground trees fade. Piers draw beneath the explorer and are walkable; open sea is blocked. The Harbor Office's matching window overlay glows at night and is visible from the dock spawn. It supplies no story explanation.

## Art, coordinates and ownership

The library has **68 original sprites and 9 backgrounds/charts**. ASSETS.md records every new sprite, its source and dimensions. Rebuild with `python3 scripts/pixel_art/generate.py` using Pillow for offline authoring only. No external image, font or model is used.

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

`setWeather({cloudCover,rain,fog,wind})` and getWeather remain in world/weather.js. Values clamp to 0–1; omitted, unknown or invalid values preserve state; snapshots are copies. Wind controls passage speed and waves, with normal travel about 4.2–6.3 seconds. Weather is local state and makes no API request. `createCharacter(art,{reducedMotion})` retains group, sprite, face and animate; group.position holds logical position and sprite is drawn separately. Remote players can reuse it without local controller input.

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

Not verified here: Safari/Firefox, other GPUs, mobile/touch controls, live backend/state integration or a sustained long-session soak. G4 finale aiming, saved home construction and story outcomes remain with their owning teams. Optional S2 was skipped because frontend/src/story/engine.js does not exist on origin/main at 393f551 (checked 5 Nov).

## File map and handoff

main.js wires the loop. world/places/registry.js owns identifiers; manager.js owns travel; factory.js, lighthouse.js, settlement.js and home.js compose places; layouts.js and surfaces.js hold plain placement/coast data; resources.js owns disposal. ui/chart.js, sailing.js and readability.css provide accessible travel and larger text. scripts/pixel_art contains all editable art; tests/place*.test.js and scripts/check-world.js verify the new contracts.

Branch is feat/g2-world-places, based on origin/main f0dc6a0. Root is the sole writer; read-only agents audited architecture and story contracts. Only frontend/ and the authorised G-lane next-step/log lines in docs/STATUS.md change. Claude integrates; no main merge or manual deployment is performed. The previous graphics-foundation branch was merged as 45d2d46 and its issue/PR attempts are historical. The newer foundation main at 393f551 adds docs/INTERFACES.md; its browser contracts were reviewed. The authorised G2 payload extends the older G1 interact example with place, and the registry replaces the proposed content/places.json because content/ is outside this task. Claude can update those draft pointers during integration. Review this branch against main.

Final checks also passed the built game (including reduced-motion chart travel) and both development/production pixel workshops, each decoding all 77 PNGs. Full regeneration reproduced 77 byte-identical files. Commands and results above are scoped to graphics; backend tests were not run because backend code was not changed.
