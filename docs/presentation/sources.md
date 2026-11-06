# Evidence behind the slides

Content snapshot: live-extras main `d5ad219`, 6 November 2026, plus the reviewed stabilization
candidate recorded in [the stabilization proof](../handoff/stabilization-release.md).

The verified production baseline is main `d5ad219`, deployment
`dpl_2yKCaKZKv1ZFE7z6jiTtCYmTmpFK` READY. Health/config and the host page returned 200.
Presence, market, predictions, arena, case, bulletin and festival are enabled. Sports, sign-in,
ChatGPT helper and raid remain off. The world is dark with zero solves; RELIGHT_OPEN is unset.
Festival's 48-hour clock has not started. Exact per-file database and rollout evidence is in
[live-extras release](../handoff/live-extras-release.md). These are recorded checks; a local
presentation test does not repeat production verification.

| Slides | Claim | Source and practical limit |
|---|---|---|
| 1–2 | Original browser world/intro, local journal; completed minimum mystery backend; normal browser mystery connection paused | [Graphics](../../frontend/GRAPHICS.md), [frontend walkthrough](../../frontend/HOW-IT-WORKS.md), [complete case release](../handoff/case-complete-release.md), [adapter selection](../../frontend/src/adapter/select.js). G9 is paused until the laptop returns. |
| 3 | JavaScript/Three.js/Vite → same-address FastAPI → Supabase Auth/Postgres; configured Dublin functions and Ireland database | [Architecture](../ARCHITECTURE.md), [Vercel configuration](../../vercel.json), [interfaces](../INTERFACES.md). Region configuration is not a latency benchmark. |
| 3 | Private crew change hints are implemented; the normal browser subscription connection awaits G9 | [Broadcaster](../../backend/server/crew_broadcast.py), [browser Realtime module](../../frontend/src/online/realtime.js), [group-3 release](../handoff/group3-release.md). An enabled server switch does not prove a connected game subscriber. |
| 4–5 | Verified identity, body validation, atomic mutations and stable action references | [Name route](../../backend/server/routes/captain_name.py), [auth](../../backend/server/auth.py), [wallet](../../backend/server/wallet.py), [case service](../../backend/server/game/case_service.py), [database matrix](../../supabase/README.md). Name rerolls use 409 on repeat; case/festival outcomes use their documented 200 receipt shape. |
| 6 | Earned case views; build fingerprints and elimination-data checks; private/no-store responses and self-only browser CSP | [Case view](../../backend/server/game/case_view.py), [spoiler guard](../../frontend/scripts/check-spoilers.js), [CSP gate](../../frontend/scripts/check-csp.js), [configuration](../../vercel.json). Fingerprints have a defined coverage limit; local browser checks do not prove every deployed response. |
| 6, 9 | Original procedural sound plus four original festival WAVs, trusted-gesture playback, shared volumes/captions and cleanup | [Asset register](../../frontend/ASSETS.md), [festival audio](../../frontend/src/audio/festival.js), [audio regressions](../../frontend/tests/festival/audio.test.js), [browser gate](../../frontend/scripts/check-festival-ui.js). G13 integration regenerated its 56 PNGs and four WAVs byte for byte. Physical output devices are not proven. |
| 7 | All 69 player-kit mixes solve with production decisions and starting resources | [Solvability proof](../../backend/server/tests/test_case_npc_solvability.py), [NPC playthrough](../../backend/server/tests/npc_playthrough.py), [release record](../handoff/case-complete-release.md). This is rule coverage, not 69 browser sessions. |
| 7 | Solo+NPC and four-player HTTP → production services/views → disposable SQL journeys | [Complete API proof](../../backend/server/tests/test_case_complete_api.py), [release record](../handoff/case-complete-release.md). They include rewards, repeat actions and crew isolation. They do not use production credentials, prove OAuth on the presentation laptop or connect G9. |
| 7 | Root frontend release gate: 1,672 tests and a production build checking 130 text files / 12 protected lines | [Frontend scripts](../../frontend/package.json), existing test suites and root's integrated release results. Counts include parameterized cases. The documentation task does not rerun the full application gates. |
| 8 | Isolated authored work, independent review, authorized integration and per-file database verification | [Contribution policy](../../CONTRIBUTING.md), [agent guidance](../../AGENTS.md), current Nils standing authorization and the [case release proofs](../handoff/case-complete-release.md). Codex is the current integrating agent; older Claude handoffs are historical. |
| 10 | Festival and host console are deployed; sports code is deployed with its flag off | [Festival backend](../handoff/g13-backend-live.md), [festival UI](../../frontend/src/screens/festival/README.md), [host console](../../frontend/src/host/), [sports UI](../../frontend/src/screens/sports/). Sports lacks its live provider key and remains off. The optional ChatGPT helper lacks an approved official website client and remains off. |

## Recorded application gates

- Completed case/backend release: **10,859 backend/story tests passed**, including scratch PostgreSQL and the actual solo/four-player API/SQL proofs. Ruff and diff checks passed. The exact scope is in [case-complete-release.md](../handoff/case-complete-release.md).
- Deployed live-extras frontend: **1,672 tests passed**; production build and spoiler guard passed, checking **130 text files and 12 protected lines**.
- Live-extras browser evidence: festival **35** runtime/input/lifecycle checks, **15** original-workshop checks, host **12** mock-browser checks, sports **23 + 8** browser checks, plus existing production/loading/CSP/lifecycle gates. These use local fixtures where stated.
- Deployed live-extras backend: **11,168 tests passed**. Reviewed 160000/170000/180000 migrations were applied separately, exact stored MD5 proved, history versions normalized and known-only advisors verified before code push. Live totals: 39 tables/57 project functions. See [release proof](../handoff/live-extras-release.md).
- Later stabilization: **13,584 backend tests plus nine benchmark-tool tests, 1,799 frontend tests with zero skips**, production/spoiler/budget and merged browser checks passed. Results are recorded separately in [stabilization-release.md](../handoff/stabilization-release.md); the historical case and live-extras counts above remain tied to their own release commits.

The presentation uses the stable **69 mixes / two API-SQL journeys** facts as its large numbers. No combined test count is described as a count of player journeys. Provider availability, production browser multiplayer, Safari, physical phones/gamepads and a spoken human rehearsal remain separate checks.

## Original diagrams and offline policy

The three local SVGs were authored for G25 and updated without story clues. The architecture graphic is a component diagram; the request graphic is the one sequence diagram. The deck uses system fonts, classic local JavaScript/CSS/SVG, no remote asset, API, service worker, module loading, cookie or saved login.

Its CSP blocks connections and inline script/style. Paired speaker windows exchange only slide numbers, validate the sender window reference and message shape, and keep notes off the audience view. The direct-file and disk-intercepted modes are reported separately in [validation.md](validation.md).
