# G20 checkpoint 3 — C3 final report

Owner: Nils; `test/g20-frontend`; origin/main c26f303 fetched/merged before C1, C2 and C3.
No configured coverage provider: counts below are a module test map, not coverage percentages.
Rows assign tests once; 176 unrelated existing tests are unchanged and also pass.

| Modules | Passing before -> after | New skipped bugs |
| --- | ---: | ---: |
| world/places manager + registry | 5 -> 23 | 0 |
| ui/sailing | 0 -> 8 | 0 |
| net/weather + world weather/startup wiring | 63 -> 66 | 1 |
| settings logic + preferences owner | 3 -> 15 | 0 |
| UI kit logic + native factories | 5 -> 16 | 0 |
| story engine rules + scene parity (excluding save tests) | 18 -> 27 | 0 |
| keyboard + touch + gamepad mapping | 7 -> 17 | 1 |
| story saves + storage + intro journal | 8 -> 22 | 1 |
| presenter query gate + controls | 0 -> 5 | 0 |
| demo timing + tour orchestration | 3 -> 7 | 0 |

Total: 288 -> 382 passing, 3 skipped, 45 files; `npm test && npm run build` and spoiler guard pass.
Parity: 8/8 scenes, 222 reachable transition states, 822 accepted/refused action probes against Python.
States differing only in prior displayed message share a traversal key; outputs/messages are compared.
G20-W1 (`g20-weather-wiring.test.js`): older overlapping refresh overwrites newer weather (.8 -> .1).
G20-T1 (`g20-input.test.js`): unrelated finger release resets captured touch movement (1 -> 0).
G20-S1 (`g20-storage.test.js`): corrupt non-string saved flags are accepted instead of rejected.
All three were enabled in temporary copies: three intended assertion failures; copies removed, originals skipped.
Credential-pattern scan of `git diff origin/main...HEAD`: empty; `git diff --check` clean.
New tests/notes only; no source/G9/backend/database/deployment edits. HOW-IT-WORKS.md absent; used GRAPHICS.md.
Remaining: source bug fixes are separate tasks; Chromium/Python required; physical devices/live services unverified.
