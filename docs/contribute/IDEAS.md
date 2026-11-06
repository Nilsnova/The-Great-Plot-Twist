# Fifteen small ideas you can make your own

For a teammate choosing a first **code** contribution with an agent. Each brief is a proposal for roughly 2–6 hours, including tests and explanation, not a reservation or an implementation to submit under your name. Pick something you care about, write your own acceptance examples, and agree the scope before coding. Any teammate can choose any lane.

Check the current [status](../STATUS.md) before choosing: many packages below are implemented, while deployment or the full browser connection can still be pending. A completed package is existing work to preserve, not a blank assignment.

## Boundaries before you start

These are small additions, separate from the packages below. Most are offline tools or creative exercises; idea 5 is an optional notice gallery, and idea 8 is a small read-only API addition. For an offline tool, use a new, clearly named folder such as `tools/contribute/your-slug/` for Python or `frontend/contribute/your-slug/` for a local browser exercise. Those folders are **proposals, not existing modules**. Use the standard library or existing browser APIs; adding dependencies requires team agreement. A browser exercise served by Vite is not automatically a production build entry.

Read the linked source for formats and concepts. Change only the new files and limited integration points named by your chosen brief; the API idea needs agreement on its public contract and route registration before coding. No migration, account credential, game reward, private story solution or deployment change is included. Use your own non-case writing, original drawings and synthetic/public input. Do not download live player data. Each tool should explain its input/output, handle bad input, and have tests of its own behavior rather than re-covering existing game code.

Nils supplied the complete G9–G27 scope list on 6 November 2026. The following work stays with those packages; none of the fifteen briefs implements these deliverables. Small additions and tests for the new behavior are permitted, as Nils clarified; a broad test sweep or a replacement for a package is not a beginner task here.

| Packages | Keep out of these ideas |
|---|---|
| G9–G10 | Core browser/server integration: real adapter, accounts, saves, crews, partners, live captains, economy/panels, case rules/screens, build stamp, reporting, error/offline/input/performance/CSP work, onboarding hints, accessibility fixes, what's new, case recap and keepsake polish. |
| G11–G12 | Ship pack, lane/drill pages, presenter/release/fresh-clone work; economy simulation and abuse/attack tests. |
| G13–G16 | Festival and lantern claims/duel ring; host/demo console; sports desk; speed, logging, live smoke and runbook. |
| G17–G18 | Soundtrack/effects; portraits, captain avatars, emotes, weather overlays and winter art. These art studies draw different original motifs and do not rebuild that pack. |
| G19 | Chapter 2 proposals and its sandbox prototype. No new story engine, chapter, case or narrative sandbox here. |
| G20–G22 | General frontend/backend test expansion; one-command development setup and demo seed tools. Tests of your own new behavior remain part of your contribution. |
| G23–G25 | How-to-play/help; text linting and proofreading; class presentation deck. A reading-time estimate measures duration, not text correctness. |
| G26–G27 | Privacy notice/data inventory; threat model and dependency/licence audit. Synthetic-data exercises do not collect real data or audit the application. |

Before claiming an idea, compare the exact feature with teammates' latest work and keep these boundaries in your PR. No idea is reserved for a particular person. The source links are existing reference code; paths described as **new** are proposed files for you to implement, not supplied solutions.

For every brief, finish with your own small PR, relevant tests/manual evidence and the [explain-back exercise](EXPLAIN-YOUR-CODE.md). Include a short README with exact run/test commands. Existing Vitest discovery covers `frontend/tests/`, and backend pytest covers its configured test directories; neither automatically discovers tests in the proposed tool folders. Choose explicit test commands or put your tool's tests in the existing appropriate test directory, without changing shared test configuration. No solution code is supplied here.

## G — World and Graphics: four visual experiments

### 1. Original rope-border sketcher · 3–4 hours

- **Goal:** Make a local canvas tool that draws your own repeating rope-border motif at integer pixel sizes; it does not replace the game's UI kit.
- **Files to look at:** [pixel/display.js](../../frontend/src/pixel/display.js) for integer scaling and [ASSETS.md](../../frontend/ASSETS.md) for original-art attribution. Touch **new** `frontend/contribute/rope-border/main.js`, its README and focused tests; keep reference files unchanged. Include a local HTML entry for this browser exercise.
- **Acceptance checks:** Two chosen border sizes tile without a gap; scale 1 and 3 preserve hard pixel edges; zero/negative sizes are refused; export only your generated drawing. No fonts, fetched art or game assets are changed.
- **Explain in the drill:** Draw one repeat on paper, trace how a loop places it, and predict the result when the width is not divisible by the repeat size.

### 2. Decorative pennant designer · 4–6 hours

- **Goal:** Build a standalone grid for designing an original decorative harbor pennant with a small fixed palette, not a player cosmetic or festival reward.
- **Files to look at:** [pixel/catalog.js](../../frontend/src/pixel/catalog.js) for native art dimensions and [ui/kit/dom.js](../../frontend/src/ui/kit/dom.js) for safe text construction. Touch **new** `frontend/contribute/pennant/main.js`, its README and focused tests; keep reference files unchanged. Include a local HTML entry for this browser exercise.
- **Acceptance checks:** Paint, erase and reset your grid; keyboard users can select a cell and colour; exported/imported grid data round-trips; malformed dimensions/colour ids are rejected. It never edits the game's catalogue or saves.
- **Explain in the drill:** Explain your grid representation, trace one cell update, and show why imported text cannot become executable HTML.

### 3. Lighthouse silhouette variation study · 3–5 hours

- **Goal:** Generate a sheet of original two-colour lighthouse silhouettes from explicit width/height parameters in a separate canvas page.
- **Files to look at:** [world/lighthouse.js](../../frontend/src/world/lighthouse.js) for the existing visual vocabulary and [pixel/display.js](../../frontend/src/pixel/display.js) for scaling. Touch **new** `frontend/contribute/silhouettes/main.js`, its README and focused tests; keep reference files unchanged. Include a local HTML entry for this browser exercise.
- **Acceptance checks:** Three distinct valid parameter sets produce bounded, repeatable images; invalid/narrow dimensions give a clear message; all drawing stays within the canvas. No new world object, camera mode or art-pipeline integration.
- **Explain in the drill:** Trace coordinates for one silhouette and justify the validation that keeps its roof and beam inside the image.

### 4. Seeded pebble-pattern study · 4–6 hours

- **Goal:** Make your own small repeatable decorative pebble tile from a visible seed, without changing terrain generation.
- **Files to look at:** [world/texture.js](../../frontend/src/world/texture.js) for texture context and [core/math.js](../../frontend/src/core/math.js) for existing math conventions. Touch **new** `frontend/contribute/pebble-tile/main.js`, its README and focused tests; keep reference files unchanged. Include a local HTML entry for this browser exercise.
- **Acceptance checks:** The same seed/size produces the same pixel grid; two selected seeds differ; edge pixels wrap consistently; tile size is bounded. Save/export contains only the parameters and your original generated image.
- **Explain in the drill:** Distinguish deterministic generation from unseeded randomness; trace one edge-wrapped pebble and test reproducibility.

## S — Story and Mystery: four small additions

### 5. Original harbor-notice gallery · 2–4 hours

- **Goal:** Write three original, harmless dockside notices and show them in an optional gallery with next/previous buttons. They are atmosphere, not clues, help, onboarding hints or a what's-new feed.
- **Files to look at:** [ui/kit/dom.js](../../frontend/src/ui/kit/dom.js) for safe text and [world/places/case-spots.js](../../frontend/src/world/places/case-spots.js) for the existing notice-board boundary. Touch **new** `frontend/src/flavor/harbor-notices.js`, a local gallery page under `frontend/contribute/` and its focused test. Do not replace the existing `notice_board` case-search interaction.
- **Acceptance checks:** Next/previous/reset select the expected notice; empty and single-notice lists behave clearly; keyboard buttons work; text renders literally; no case flags, progress, rewards or network requests change.
- **Explain in the drill:** Trace the selected index when moving past either end, explain safe text rendering, and show why the gallery cannot grant a clue.

### 6. Message-fragment ordering puzzle · 3–5 hours

- **Goal:** Write your own harmless dockside message and a standalone ordering activity using its numbered fragments; no clue/card meanings or game unlocks. This single ordering exercise is not a Chapter 2 proposal, story engine or narrative sandbox.
- **Files to look at:** [ui/kit/logic.js](../../frontend/src/ui/kit/logic.js) for pure interaction helpers and [story/README.md](../../frontend/src/story/README.md) for separation from the main narrative. Touch **new** `frontend/contribute/message-order/main.js`, its README and focused tests; keep reference files unchanged. Include a local HTML entry for this browser exercise.
- **Acceptance checks:** Reordering and reset work using buttons/keyboard; repeated or missing fragment ids are rejected; only the intended order is accepted; the original written text remains unchanged by shuffling.
- **Explain in the drill:** Explain stable ids versus array positions, trace a swap and show a failing incomplete-order example.

### 7. Public draft reading-time estimator · 2–4 hours

- **Goal:** Write a CLI that estimates reading time for your own plain-text dialogue drafts, with a user-selected words-per-minute value.
- **Files to look at:** [tools/README.md](../../backend/tools/README.md) for developer-tool documentation and [content/README.md](../../backend/content/README.md) for public/private boundaries. Touch **new** `tools/contribute/reading_time.py`, its README and focused tests; keep reference files unchanged.
- **Acceptance checks:** Empty text returns zero; a hand-counted sample matches; zero/negative/non-numeric rates are refused; UTF-8 text is accepted; the tool reads only an explicitly supplied file and writes no source files.
- **Explain in the drill:** State your word-count convention, trace units from words to seconds, and explain why this is an estimate rather than a playtest measurement.

### 8. Read-only harbor-fact API · 3–5 hours

- **Goal:** Add `GET /api/harbor/fact` returning one static, original, public harbor-flavor fact. Agree its small response contract first. It is not a case hint, bulletin system, help manual or live-data adapter.
- **Files to look at:** [routes/health.py](../../backend/server/routes/health.py) for the route shape, [routes/content.py](../../backend/server/routes/content.py) for the public-content boundary and [app.py](../../backend/server/app.py) for registration. Touch **new** `backend/server/routes/harbor_fact.py`, its test and `backend/content/harbor_fact.json`; register just this router in `app.py` and document the agreed public contract as ENGINEERING requires.
- **Acceptance checks:** Signed-out GET returns 200 with only the agreed title/text fields; repeated calls are deterministic; unsupported write methods are refused; a missing/malformed content fixture returns a controlled standard error without file paths or private data. No database, tokens, outside requests, economy or case state is used. Test with an isolated temporary public-content fixture.
- **Explain in the drill:** Trace request → public file → validated response, distinguish read-only from authenticated, and show the test that prevents accidental private-field output.

## A — Accounts and Multiplayer: three synthetic-data tools

### 9. Crew seating worksheet · 3–5 hours

- **Goal:** Make an offline tool that lays out four synthetic crew seats and reports duplicate assignments. It is a planning worksheet, not a crew service or replacement lobby.
- **Files to look at:** [crews/seats.py](../../backend/server/crews/seats.py) for the real model and [crew_seat_rules tests](../../backend/server/tests/test_crew_seat_rules.py) for examples of invariants. Touch **new** `tools/contribute/crew_worksheet.py`, its README and focused tests; keep reference files unchanged.
- **Acceptance checks:** Show empty and occupied seats; reject duplicate seat numbers and duplicate synthetic participants; handle four seats and refuse a fifth. Never generate join requests, allocate real kits or claim a server-valid crew.
- **Explain in the drill:** Describe the two uniqueness checks and show why a locally valid worksheet is not authorization to join a real crew.

### 10. Synthetic save comparison viewer · 4–6 hours

- **Goal:** Compare two small invented JSON saves and list added/removed/changed field paths, without loading real accounts or offering a cloud restore action.
- **Files to look at:** [account/saves.py](../../backend/server/account/saves.py) for version concepts and [story/saves.js](../../frontend/src/story/saves.js) for local-save context. Touch **new** `tools/contribute/save_diff.py`, its README and focused tests; keep reference files unchanged.
- **Acceptance checks:** Identical objects give no differences; changed nested fields and removed keys are listed deterministically; define and test how arrays are compared; malformed JSON is refused. Inputs use fabricated data only and no network calls occur.
- **Explain in the drill:** Trace one nested difference, explain your array trade-off, and distinguish a structural diff from validation of legitimate game progress.

### 11. Expiry-clock visualizer · 3–5 hours

- **Goal:** Build a standalone educational timeline showing when a fabricated session expires under an adjustable clock offset. Never paste or decode real tokens.
- **Files to look at:** [online/session.js](../../frontend/src/online/session.js) for the memory-only session boundary (it does not implement expiry) and [server/clock.py](../../backend/server/clock.py) for clock boundaries. Touch **new** `frontend/contribute/expiry-clock/main.js`, its README and focused tests; keep reference files unchanged. Include a local HTML entry for this browser exercise.
- **Acceptance checks:** Show before, exactly-at and after-expiry states; positive/negative offsets work; invalid timestamps are refused; use an injected/fixed clock in tests. It neither refreshes a session nor changes sign-in behavior.
- **Explain in the drill:** Trace the boundary comparison, explain milliseconds versus seconds, and show why a browser clock cannot grant server access.

## L — Live Systems: four reports from local observations

### 12. Wind-direction frequency report · 3–5 hours

- **Goal:** Summarize an explicitly supplied, synthetic CSV of wind directions into eight compass sectors and an accessible count table.
- **Files to look at:** [weather/mapping.py](../../backend/server/weather/mapping.py) for units/mapping style and [weather/README.md](../../backend/content/weather/README.md) for source attribution conventions. Touch **new** `tools/contribute/wind_sectors.py`, its README and focused tests; keep reference files unchanged.
- **Acceptance checks:** Hand-check north-sector wraparound and sector boundaries; reject out-of-range angles and malformed rows; show the accepted-row count and input provenance. No live weather requests or changes to game wind.
- **Explain in the drill:** Draw sector boundaries, trace 0/359 degrees, and justify the denominator when rows are rejected.

### 13. Rain-streak summary · 2–4 hours

- **Goal:** Read a small synthetic daily rainfall CSV and report the longest consecutive wet spell using a documented threshold.
- **Files to look at:** [weather/source.py](../../backend/server/weather/source.py) for separating observation from presentation and [weather mapping tests](../../backend/server/tests/test_weather_mapping.py) for boundary examples. Touch **new** `tools/contribute/rain_streaks.py`, its README and focused tests; keep reference files unchanged.
- **Acceptance checks:** All-dry, all-wet and tied spells are deterministic; a missing date breaks a streak rather than pretending continuity; reject duplicate dates, negative rainfall and unordered input or explicitly sort it. Print date range, units and threshold.
- **Explain in the drill:** Trace a streak interrupted by a missing day, explain your tie rule, and show the test that prevents an off-by-one result.

### 14. Tide-notebook CSV checker · 3–5 hours

- **Goal:** Validate a personal, synthetic tide-observation notebook with timestamp and height columns; produce a report without predicting sailing safety or affecting travel.
- **Files to look at:** [weather/open_meteo.py](../../backend/server/weather/open_meteo.py) for a parsing boundary and [tools/README.md](../../backend/tools/README.md) for CLI conventions. Touch **new** `tools/contribute/tide_notebook.py`, its README and focused tests; keep reference files unchanged.
- **Acceptance checks:** Check required headers, explicit timestamp timezone, duplicate timestamps and numeric heights; preserve the input; distinguish bad rows from missing observations; exit nonzero for invalid input. Negative heights may be valid relative to the stated datum—document it.
- **Explain in the drill:** Explain parsing versus scientific interpretation, trace one duplicate, and justify why a structurally valid file is not a navigation forecast.

### 15. Harbor timetable gap finder · 3–5 hours

- **Goal:** Given synthetic arrival/departure intervals for one imaginary berth, list overlaps and free gaps within a chosen day; no link to game travel or the host clock.
- **Files to look at:** [server/clock.py](../../backend/server/clock.py) for time handling and [adapters/base.py](../../backend/server/adapters/base.py) for explicit dependencies. Touch **new** `tools/contribute/berth_gaps.py`, its README and focused tests; keep reference files unchanged.
- **Acceptance checks:** Define intervals as start-inclusive/end-exclusive; adjacent visits do not overlap; reject end-before-start, out-of-day and ambiguous-time inputs; check an empty timetable and a fully occupied day against hand-worked examples.
- **Explain in the drill:** Draw your sorted timeline, trace two adjacent visits, and explain why comparing every pair is or is not appropriate for this tiny input.
