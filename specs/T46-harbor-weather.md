# T46 Harbor/weather follow-through

> **What this is:** the follow-up to the merged T26 weather access: check the island Harbor's weather board end to end, fix the gaps in what it tells players, and settle the "weather board / trade" and T6 extra-stall questions without a betting market.
>
> **Who uses it:** the Harbor/weather lane, the T6 owner (if anyone claims it) and the reviewer.

- **Status:** in review
- **Branch:** `feat/t46-harbor-weather`
- **Issue and pull request:** [issue #27](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/27); the PR is opened by the coordinator.

## Why

T26 ([PR #8](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/8), merged) made the existing weather card reachable from the island Harbor after wave 4. Checking it against the server showed three places where the card says something that is not true or not complete:

1. **Recorded fallback promised a fresh reading.** Every `stale` *and* `fallback` answer showed "This is the last weather we heard. A fresh reading comes soon." A `fallback` is a real reading recorded earlier (`backend/content/weather/recorded-fallback.json`) and the only one in demo mode, so "soon" was false, and the card never said how old a reading was.
2. **The board's place is not always the wave's place.** `GET /api/weather` reads the default place (settings), but a wave takes the weather of the bell-ringer's area first (`backend/server/island/wave_weather.py`, Vercel geo headers), then the default place, then calm. The card's pirate line read as a promise about the next wave.
3. **The forecast the server already sends was unused.** `/api/weather` returns `tonight.state` (from the forecast hours, `weather/outlook.py`); the board ignored it.

## The ambiguous request: "weather board / trade"

Read as: *a weather board in the Harbor* (done by T26, finished here) and *trade* as in the Harbor's existing stake stalls. It is **not** a request for stakes on the weather. A coin stake on "Will it rain tomorrow?" (the example in the T6 row) is a stake on an open-ended real-world question, which [D035](../docs/DECISIONS.md) rules out. The Harbor keeps exactly one stake per stall: the market stall (D034) and the match board.

## T6 extra stall

Claim check on 14 Nov 2026: no branch, issue or open PR claims T6 (`git branch -r`, the open PRs #6–#28 and issues). T6's only example mechanic is a weather stake, so it is not implemented. Proposed instead as [D045](../docs/DECISIONS.md) (PROPOSED, team review pending): T6's "real weather data" idea becomes a **words-only forecast line on the existing weather board**, not a new stall and never a stake. A future T6 stall needs its own reviewed non-betting mechanic.

## What

- `frontend/src/harbor/weather-model.js`: `old` says when the reading was taken (UTC) and splits `stale` ("A fresh reading comes soon.") from `fallback` ("…a recorded reading from 2026-11-05 00:00 UTC, not today's weather. It counts until a live one comes in."); new `waves` line ("A wave uses the weather where its bell is rung when the server can tell, otherwise this one."); new `tonight` line ("Forecast for tonight here: fog. Only to read: no coins are at stake.") only when `tonight.state` is a known state.
- `frontend/src/harbor/overview.js`: the weather card shows the two new lines.
- `frontend/scripts/check-island-weather.js`: optional `live` variant (a live storm answer with fog forecast for tonight) besides the recorded fallback; asserts the new lines. Its intro clicks no longer wait 30 s on a cutscene or card that changed under the click (the T26 script timed out here on current `main`), and a stuck intro saves a screenshot.
- Evidence: `docs/evidence/t46/` (desktop 1280×720 and phone 375×812, fallback and live).

**No** API, table, migration, flag, wallet, dependency or Python change. `frontend/src/pirates/sim.js` and `backend/server/island/service.py` are untouched.

## Out of scope

- Any coin stake on weather (D035) or a new stall (T6, pending its own mechanic).
- Refreshing the card while it stays open (T26 limit, unchanged).
- Telling the player *which* place a wave used: the wave answer stores only the state; a place would need an API change (later, if wanted).
- Different wording for the pirate lines: the board keeps its player wording; numbers stay matched to `islands.json` by the existing test.

## Done when (acceptance checks)

- [x] `cd frontend && npx vitest run tests/harbor tests/island/weather-board.test.js`: all pass (new model tests failed first: `3 failed | 27 passed`).
- [x] `cd frontend && npm ci && npm test && npm run build`: exit 0 (exact results in the PR).
- [x] `node scripts/text-lint/index.mjs` (root): 0 errors.
- [x] `node scripts/check-island-weather.js after` and `… after live`: exit 0; [fallback 1280](../docs/evidence/t46/fallback-1280.png), [fallback 375](../docs/evidence/t46/fallback-375.png), [live 1280](../docs/evidence/t46/live-1280.png), [live 375](../docs/evidence/t46/live-375.png).
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

| Test file | Test name | What it proves |
|---|---|---|
| `frontend/tests/harbor/models.test.js` | `says when an old reading was taken, and never promises a fresh one for a recorded reading` | stale vs fallback wording, reading time, bad time, live/cache show nothing |
| `frontend/tests/harbor/models.test.js` | `tells that a wave takes the weather where its bell is rung` | the place caveat shows online and offline |
| `frontend/tests/harbor/models.test.js` | `shows tonight's forecast as words only, with no stake` | known states only; null/unknown/missing tonight shows nothing |
| `frontend/tests/harbor/cards.test.js` | existing overview/weather test, extended | the card renders the forecast and caveat; offline has no forecast |

## Contracts touched

- [ ] API endpoints: none (reads the existing `tonight` field of `GET /api/weather`).
- [ ] Browser events: none.
- [ ] Database tables, policies or functions: none.
- [ ] Shared lists: none.
- [ ] Content format: none.
- [x] Decisions to record in `docs/DECISIONS.md`: D045 (PROPOSED).

## Owner and reviewer

- **Responsible teammate:** Nils (`Nilsnova`); plan author Ianno (`Iannomh123456`).
- **Coding agent used, if any:** yes. The teammate stays responsible for its output.
- **Reviewer (a different human teammate):** pending
- **Last updated:** 2026-11-14
