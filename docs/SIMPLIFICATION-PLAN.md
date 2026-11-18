# Simplification plan (refactor/slim, 18 Nov 2026)

> **What this file is:** the measured, ranked list of ways to make the client lighter and the code base smaller without changing what players see or do, and which of them the `refactor/slim` pass did.
>
> **Who uses it:** whoever picks up the next slimming pass (people or agents). Numbers were measured on `main` 840549a5.

Ground rules of this pass: behaviour-preserving only. No gameplay, visuals, SQL/migrations, wave protocols or art pipeline changes (the art pipeline and image sizes are on `perf/art-size`). No file splits of `sim.js`, `controller.js` or `island/index.js`. Features whose flag is OFF in production (case, festival, bulletin, raid, predictions) are left alone.

## How it was measured

- **Dead files and exports:** an import-graph walk from `index.html`, `asset-library.html`, `ui-kit.html`, `host.html` and `vite.config.js` (static and dynamic `import()`, `new URL(..., import.meta.url)`, CSS `@import`), compared with a walk that also starts from every test and script. `src/` has no string-built imports and no `import.meta.glob`, so the production walk is complete. Tests that load modules by URL (`window.g20Import('/src/...')`) were checked by hand.
- **Unused CSS:** every class selector in `src/**/*.css` whose name appears in no `.js`, `.json` or `.html` file of the client; names that a template could build (`prefix-${...}`, `is-${state}`) were kept.
- **Backend:** an `ast` import walk from `main.py` and `tools/`; routes whose path appears in no client file, script or workflow.
- **Bundle:** `vite build --sourcemap` and per-chunk source composition from the maps.

## Baseline (main 840549a5)

| Measure | Value |
|---|---|
| Frontend `src` (js / css / all incl. json) | 45,676 / 1,858 / 48,114 lines (523 files) |
| Frontend tests / scripts | 49,113 / 14,573 lines |
| Backend `server` (non-test) / tests | 40,042 / 81,937 lines |
| Title (initial) JS / CSS | 18,959 B (8,921 gzip) / 9,410 B (3,488 gzip) |
| All built JS | 2,185,049 B in dist |
| Largest chunks | `game` 486 KB (three.module 659 KB source + 257 KB game code), `three.core` 214 KB, `dist` (Supabase, lazy) 219 KB, `island` 184 KB, `captain-stats` (the wave sim) 83 KB, `pirates` 77 KB |

## Ranked plan

Effort and risk: S/M/L. "Done" means committed on `refactor/slim`.

| # | Item | Estimated saving | Risk | Done |
|---|---|---|---|---|
| 1 | Delete dead client files: `shell/lazy-account-summary.js` and `shell/lazy-summary.js` (two copies of the same lazy wrapper, imported by nothing), `class-demo/quest-strip.js` (only a test used it; the test now drives `ui/quest-strip.js` with `classQuestView` directly) | 70 lines | S | yes |
| 2 | Delete 31 exports that nothing imports (`CAMPAIGN`, `stepOf`, `isLater`, `BONUS_IDS`, `branchOf`, `specKinds`, `SEA_LEVEL`, `gameUrl`, `isTowerSlot`, `catalogArt`/`ART_CANDIDATES`, `CLASS_HARBOR_ROOM`, `BOAT_GAMES`, `isBoatGame`, `FINISHER_KINDS`, `WARSHIP_FRAMES`, `EVENT_SHIP_KINDS`, `nativeViewport`/`nativeScale`/`NATIVE_ROWS`, `whenRemoved`, `DEFAULT_RULES` and the three duel constants only it used, `termsText`, `historyLine`, `labelledSelect`, `secondsLabel`, `restoreFocus`, `brushLines`), the test-only kit `formatCoins` (a second, different coin formatter beside `lib/coins.js`) and 7 unused imports | ~110 lines | S | yes |
| 3 | Delete 78 unused CSS class selectors (old painted cutscene layers `.shot-*`, the old save list, the old masthead/wordmark/settings/chart HUD, `.case-toolbar`, …) in 16 stylesheets | ~6.4 KB CSS source, 162 B title CSS | S | yes |
| 4 | Backend: delete `server/cache.py` (`DefaultCacheControl`, superseded by `request_policy.py`, imported by nothing; THREAT-MODEL now points at the real file) | 26 lines | S | yes |
| 5 | One DOM node helper: four private copies of `node(tag, className, text)` (cutscene player, boat game, finisher, Harbor) now import `ui/kit/dom.js` | 15 lines | S | yes |
| 6 | One `clamp`: three private copies (`world/others/index.js`, `world/others/logic.js`, `pirates/boat/rules.js`) importing `core/math.js` | 3 lines | S | tried and reverted: the bundler then split `core/math.js` into its own 331-byte chunk that ten chunks request, and the title JS grew 24 B. Lesson: a shared helper must already live in the chunk its new users load |
| 7 | Pirate renderer per-frame allocations: the wave renderer built 3 `Set`s, 4 temporary arrays and 2 `Map`s every frame (alive ships/boarders, walls/towers by id, `Object.values(layers)` twice), and 18 sprite calls made a `{ ...COLOUR, a }` object per sprite; all are now reused | ~11 allocations + O(ships+boarders+walls+towers) entries + one object per bar/shadow/pip per frame | S | yes |
| 8 | Supabase chunk (219 KB min, lazy): `createClient` pulls storage-js (117 KB source), postgrest-js (112 KB), iceberg, the admin API. The client only uses auth and realtime. Importing `@supabase/auth-js` + `@supabase/realtime-js` directly would drop roughly half the chunk | ~100 KB min / ~25 KB gzip on sign-in and online play | M (two new direct dependencies need team agreement, CONTRIBUTING) | no |
| 9 | `game` chunk: the old harbor/islet code (`screens/islet`, `online/islet-host.js`, ~1,150 lines), the narrator (28 KB source), tutorials (15 KB) and the first-quests strip load with every Play. Splitting the islands-off harbor path and the narrator into lazy chunks keeps them off the island start | ~40–60 KB min off the Play chunk | M | no |
| 10 | The remaining per-sprite option literals in `pirates/render.js` (`{ flip, flashing, ...tint }`, `{ ...GOLD, angle, a }` and the like, ~30 call sites) still allocate per sprite; the plain `{ ...COLOUR, a }` ones were done in item 7 | the rest of the per-sprite objects | M (visual parity needs `test:art`) | no |
| 11 | 47 exports used only by tests (e.g. `targeting.pickTarget`/`profileFor`, `pathing.followPath`, `sim.threatOf`, `path-grid.spotAsSegment`, the panel-service `find/claim/releasePanelEntry`, `duels.checkChoices/checkSequence/timeLeftText`, `sports.timeOfDay/closingLabel`, `cutscenes/art.js`). Some are parity mirrors of server rules on purpose; the rest are dead logic kept alive by their tests | ~250 src lines + their tests | M (owner per area must confirm each is not a parity guard) | no |
| 12 | 27 hand-run scripts referenced by nothing (`capture-*`, `check-cliff-raster`, `check-nautical-water`, `check-no-repeat-intro`, `check-terrain-materials`, `probe-cold-coast`; ~2,100 lines). All their imports still resolve. Register the ones still wanted in `package.json`, delete the rest | up to ~2,100 script lines | S–M (art captures belong to the art pipeline owner) | no |
| 13 | Unreferenced backend routes: `POST /board/pair`, `/board/pin`, `/crews/me/start`, `/crews/me/orders`, `/finale/*`, `/intro/complete` appear in no client file (case/festival/bulletin/predictions routes are flag-OFF features and were left). Confirm with INTERFACES.md owners before deleting; the routes, services and tests are several hundred lines | several hundred lines | M | no |
| 14 | Test-only backend modules: `island/structure_health.py` (51 lines; the real math is in SQL), `adapters/example.py` (a teaching example), `game/case_lint.py` (case is OFF). Keep or delete by owner decision | ~270 lines | S | no |
| 15 | Small duplicates left: the `[5000, 15000, 30000]` back-off in `online/adapter/schedule.js` and `read-monitor.js`; three `Retry-After` readers (`online/api.js`, `screens/market/http.js`, `screens/sports/http.js`) that differ on `0`; `coinsText` in `screens/islet/labels.js` and `view.js`; the kit `button` helper copied in the boat and finisher scenes | ~20 lines | S (the Retry-After readers need one agreed rule for `0`) | no |
| 16 | File splits (not in this pass): `pirates/sim.js` 1,866 lines, `pirates/controller.js` 1,675, `island/index.js` 1,483, `pirates/fake-api.js` 1,265, `pirates/render.js` 1,230 | readability, no size change | L | no |

### Bug noticed, not changed

`island/structure-recovery-indicators.js`: `setState` hides the bar of a structure that is back at full health, but `update()` (every frame) shows every indicator whose spot is still in `state.structures` (full-health rows included) with its last drawn bar. A repaired wall can therefore keep its old damaged bar in the preparation view until the island reloads. It also does a linear `find` per indicator per frame. Fixing it changes what players see, so it is left for a separate task.

## Always-on flags: what deleting the OFF branch would remove

Estimates from reading every flag check (backend `is_enabled`/`flags.get`, client `flags?.x`, `fake-api.js`, `game.js` gates). "Tests" counts the test files that build a world with the flag off and assert the off behaviour.

| Flag | OFF code (server / client) | Tests that assume OFF | Why it was not done in this pass |
|---|---|---|---|
| `islands` | 3 route gates (~10 lines) / the `'off'` mode: old harbor start, old home islet (`screens/islet`, `online/islet-host.js`, ~1,150 lines) | ~25 server files assert `feature_off`; client mode tests | The `'off'` mode is also what a local or demo adapter gets before any `/api/config` (`island/mode.js`), so it is reachable without the flag |
| `arsenal` | `POST /island/weapon/buy` and `service.buy_weapon` + `rules.check_weapon_buy` (~45) / `weaponsModel` and the old weapon-shop card, fake-API weapon buys (~150) | `test_captain_skills_routes.py`, `test_coop_permissions.py`, fake-API flows default to off | The fake API and most client tests run with the flag off, so they would need rewriting, not deleting |
| `placement` | `catalogue.placement` checks (~8) / none | `test_island_move_routes.py` and every island test world without the flag (layout table never read) | Turning it on makes every pretend-database test read the layout table: rewrite |
| `wall_recovery` | 6 checks (~25) incl. the wave start/finish answer | wall tests | Touches the wave start/finish answers (wave protocol): excluded |
| `rescue`, `pathing`, `tower_health`, `tower_obstacles`, `ship_fire`, `defenses_v2` | wave rules carried into `SIM_RULES` and the sim; the sim's rule-off code paths (~300 client sim lines) | ~200 client test references, sim parity tests | Wave rules are part of the wave protocol and old waves replay with their own rules: excluded |
| `more_tower_spots` | `catalogue_for_flags` (~4) / `fake-api.js` spot list (~2) | island spot-list tests | Small saving; tests would need new spot lists |
| `structure_recovery` | protocol-2 admission | recovery tests | Recovery-vs-legacy wave split: excluded |

Conclusion: in every case the flag is off by default in the test worlds and the fake API, so removing an OFF branch means rewriting tests, which this pass was told not to do. The best first candidate for a dedicated task is `arsenal` (about 200 lines of code plus the old shop tests), then `islands` once the local adapter decides `'live'`.

## Results of this pass

Four commits on `refactor/slim` (dead code; one DOM helper; renderer reuse; the clamp revert). 53 files, +81 / −320 lines.

| Measure | Before (main 840549a5) | After |
|---|---|---|
| Frontend `src` js / css lines | 45,676 / 1,858 | 45,497 / 1,829 |
| Frontend `src` CSS source | 206,065 B | 199,695 B |
| Frontend tests / scripts lines | 49,113 / 14,573 | 49,108 / 14,573 |
| Backend `server` (non-test) / tests lines | 40,042 / 81,937 | 40,016 / 81,937 |
| Title JS / CSS (budget check) | 18,959 / 9,410 B | 18,959 / 9,248 B |
| All built JS / CSS | 2,185,049 / 182,468 B | 2,184,461 / 176,192 B |
| JS chunks | 186 | 186 |
| `renderer.update` (headless, recorded wave 12, 662 frames, median of 20) | 52–67 µs per frame | 53–59 µs per frame: within noise, no measurable frame-time change; the gain is fewer short-lived objects for the garbage collector |

The honest headline: the client was already lean on dead code (3 dead files out of 523). The large savings left are structural (items 8, 9, 11–13 and the flag table), each needing an owner decision or test rewrites.
