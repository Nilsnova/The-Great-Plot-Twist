# T45 Highscore and statue polish

> **What this is:** one coherent progression display: weekly and all-time island rankings, a crew label, a "This island" milestone panel, and a captain statue that grows in four cosmetic stages.
>
> **Who uses it:** players (Menu → Leaderboard, and the statue on the home island) and the lanes that change defeat/reset rules (T38).

- **Status:** in review
- **Branch:** `feat/t45-highscore-statue`
- **Issue and pull request:** [issue #28](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/28); PR opened by the coordinating teammate; builds on T7 ([PR #13](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/13)) and T5 ([PR #10](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/10))
- **Decision:** [D046](../docs/DECISIONS.md#d046--highscore-scope-and-statue-stages--2026-11-14) (proposed)

## Why

T7 ranks islands for one week; T5 shows a shield and one statue at wave 25. Players had no all-time record, no hint of
what comes next, and no way to tell a solo score from a crew score. T45 joins the two features into one display without
new tables, rewards or gameplay rules.

## What was already there (identified before changing art)

- **The statue:** `drawWaveStatue` in `frontend/src/art/milestones.js`, the bronze captain statue on a stone plinth,
  placed by `frontend/src/island/decorations.js` (mesh `island-wave-25`) on the home island, shown when the island's
  best won wave reaches 25. Original Canvas drawing (T5, Ianno with a coding agent), registered in `frontend/ASSETS.md`.
- **No altar exists** anywhere in the code, art register or content files. T45 therefore extends the existing statue
  and adds no altar. A new central altar/landmark would collide with T38, which may introduce a central building
  that triggers the last-chance rescue; keeping the statue purely decorative keeps the two separate.
- **The shield:** `drawWaveBadge`, twelve ranks every ten waves (T5); unchanged.
- **The ranking:** `GET /api/island/leaderboard` and `backend/server/island/leaderboard.py` (T7).

## Decisions (recorded as D046)

| Question | Decision |
|---|---|
| Metric | Highest **successful** island wave (`wave_runs`: `place=island`, `survived=true`, `expired=false`), the same number T5 and T7 use. Ships sunk, loot and coins do not count. |
| Ties | Equal waves share a competition rank (1, 1, 3), as in T7. Display order among equal waves: the island that **finished that wave first** is listed first (`order=wave.desc,finished_at.asc,id.asc`; `id` only breaks exact timestamp ties). This replaces T7's internal owner-ID order. |
| Scope | Two boards: **This week** (T7 unchanged: Monday 00:00 UTC to next Monday) and **All time** (every winning run up to the request; never resets). The card remembers the chosen tab while the game runs. |
| Solo vs co-op | **One shared ranking**, no adjustment for crew size. Each row shows `Solo` or `Crew of N`: how many captains joined the scoring run (`wave_participants` rows of that run). Only the count leaves the server. |
| Source of truth | Run history only (`wave_runs`), never `islands.wave_best` or the current/next wave. A restart, rescue or reset cannot lower a ranking score. |
| Statue unlocks | Best won wave of the island on screen (`campaign.wave`, sent by the server): **25 bronze** (the T5 statue, unchanged), **50 silver** with a raised cutlass, **75 gold** with a red pennant, **100 crowned** with a gold crown. The plinth shows the stage's wave. |
| Cosmetic? | **Yes, entirely.** No coins, no combat effect, no collider, no new save data. The shield and statue only show progress the server already recorded. |
| This island panel | Best wave, shield rank, statue stage and the next shield and statue milestones, e.g. "Next: Gold shield at wave 30 · Silver statue at wave 50". Pure text from `frontend/src/island/progression.js`. |

## Re-check once T38's reset contract (proposed D044) is accepted

> **T38 dependency, open.** T45 implements no reset behavior. When D044 is accepted, re-check:
>
> 1. **Rankings** read only finished winning `wave_runs`. D044 must not delete, rewrite or mark `expired` past winning
>    runs, or move a rescue settlement into a `survived=true` island run. If a rescue win should count, D044 must say
>    so and the ranking filter changes in the same PR.
> 2. **Statue and shield** read `campaign.wave` (= `islands.wave_best`, the best won wave). If D044 lowers
>    `wave_best` on reset, or splits "best" from "current/unlocked" wave, the decorations and the "This island" panel
>    must read the never-lowered best value. Otherwise a reset would visibly shrink the statue.
> 3. **Wave zero:** a reset to "wave zero" must keep the best record; `progressSummary(0)` currently means "no win yet".
> 4. **Crew counts** use `wave_participants`; a rescue minigame participant who never joined the wave must not change them.

## Files changed

- `backend/server/island/leaderboard.py`: `weekly` and new `all_time`, shared bounded scan, earliest-first tie order, crew count.
- `backend/server/routes/island.py`: `scope` query parameter on the existing route (route body only; no `service.py` change).
- `backend/server/tests/test_island_leaderboard.py`: scope, tie order, crew, reset-safety tests.
- `frontend/src/art/milestones.js`: `STATUE_STAGES`, `statueStage`, stage-aware `drawWaveStatue`.
- `frontend/src/island/decorations.js`: statue redraws when its stage changes.
- `frontend/src/island/progression.js` (new): milestone summary, card lines and crew label.
- `frontend/src/island/api.js`, `index.js`, `ui.js`, `island.css`: scoped request and checks, tabs, crew label, This island panel; menu entry renamed "Leaderboard".
- `frontend/src/pirates/fake-api.js`: offline message wording only.
- `scripts/text-lint/words.txt`: five reviewed words for the new card text (bronze, crowned, statue, shield, period).
- Tests: `frontend/tests/island/progression.test.js` (new), `leaderboard.test.js`, `decorations.test.js`, `dom.test.js`.
- Evidence script `frontend/scripts/check-t45-progression.mjs`; screenshots in `docs/evidence/t45/`.
- Docs: `docs/INTERFACES.md`, `docs/DECISIONS.md` (D046), `docs/OPEN-TODOS.md`, `docs/TEST-MAP.md`, `frontend/ASSETS.md`.

## Out of scope

- Reset, rescue or defeat rules: T38 / D044.
- Rewards for rank or statue stages: none (cosmetic by decision).
- Finding your own island's position outside the top ten: later, needs a database aggregate.
- An altar or new landmark building: not in the code; would need T36/T38 placement agreement.
- Database migration or new feature flag: not needed. `wave_runs` and `wave_participants` already exist
  (migrations `20261110010000` and `20261110020000`); the frontend still reads a T7-shaped answer.

## Done when (acceptance checks)

- [x] `cd backend && uv run pytest -q` and `uv run ruff check .` pass.
- [x] `cd frontend && npm ci && npm test && npm run build` pass.
- [x] Statue stages and Leaderboard card captured at 1280 × 720 and 375 × 812 (`node scripts/check-t45-progression.mjs`).
- [x] Art register entry in `frontend/ASSETS.md`.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests written first

| Test file | Test | What it proves |
|---|---|---|
| `backend/server/tests/test_island_leaderboard.py` | `test_all_time_reads_the_whole_run_history_and_never_resets` | no week window; same filters |
| same | `test_a_later_reset_or_lower_wave_cannot_lower_an_all_time_score` | lower later wins change nothing |
| same | `test_equal_waves_are_listed_by_who_reached_them_first` | tie order |
| same | `test_crew_counts_the_captains_of_the_scoring_run_only`, `test_a_run_without_recorded_captains_still_counts_one` | crew label source |
| same | `test_route_scope_chooses_the_board_and_refuses_unknown_scopes` | `scope=all`, default week, 422 |
| `frontend/tests/island/progression.test.js` | stage boundaries 24/25/49/50/74/75/99/100, summaries and lines | statue and milestone text |
| `frontend/tests/island/leaderboard.test.js` | scope checks, old T7 answer, tabs, crew, This island panel, remembered tab | the card |

## Limits

Fake database reads only; no live PostgREST/Supabase proof. The all-time scan uses T7's bound (2,000 runs) and
answers `503 leaderboard_unavailable` rather than a partial board; with many repeated wins at top waves it may need a
database aggregate (a migration) later. Crew size counts captains who joined the run, including ones who dropped out.
Local browser screenshots use sample data and do not prove physical phones.

## Owner and reviewer

- **Responsible teammate:** Nils (`Nilsnova`), who authorized this lane; plan by Ianno (`Iannomh123456`).
- **Coding agent used:** yes. The teammate stays responsible for its output.
- **Reviewer (a different human teammate):** pending team review.
- **Last updated:** 2026-11-14
