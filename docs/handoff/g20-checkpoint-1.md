# G20 checkpoint 1 — C1

> Historical source-branch checkpoint. These counts and limitations describe the original
> authored branch; current integration gates are recorded separately by the release owner.

Owner: Nils; branch `test/g20-frontend`; based on `origin/main` c26f303.
`origin/main` fetched and merged before this checkpoint (already current).
`frontend/HOW-IT-WORKS.md` is absent; read AGENTS.md and frontend/GRAPHICS.md instead.
Coverage is not configured/installed; this is a test map, not line/branch percentages.
Baseline: 288 passing tests in 33 files. Existing -> additional C1 passing tests:

| Module/group | Before | Added | Contracts added |
| --- | ---: | ---: | --- |
| world manager / registry | 5 | 18 | paths, gates, failure recovery, disposal, frame forwarding |
| sailing | 0 | 8 | wind timing, skip/cancel/dispose, reduced/fast/low quality |
| weather client/state wiring | 63 | 2 | real state recovery, stop during pending JSON |
| settings logic | 3 | 9 | version, explicit falsy values, boundaries, isolation |
| UI kit logic | 5 | 8 | Unicode, speed changes, navigation, numeric boundaries |
| story engine | 26 | 9 | Python parity at every reachable scene/state/action |

Parity reads the existing Python engine/content only; `python3 -B`, no saves or backend edits.
The state traversal compares results, state, choices, notes and inventory, including refusals.
Real Chromium component tests need installed Chromium (`CHROME_PATH` override supported).
Gate: `cd frontend && npm test && npm run build`: 342 passed, 1 skipped, 38 files; build/spoiler guard passed.
Bug G20-W1: short refresh intervals allow an older weather reply to overwrite newer data.
Skipped reproducer: `g20-weather-wiring.test.js`; no source fix within this task.
Changes: new frontend/tests files and this note only; no G9/source/lockfile edits.
Next: C2 input, browser-local persistence, presenter and offline tour tests.
