# T48 Bounded island leaderboard query

> **What this is:** A server-only database query that finds each island's best qualifying win and returns a complete top ten without scanning a fixed number of runs in Python.
>
> **Who uses it:** The island leaderboard service and the teammates who review its database contract.

- **Status:** in progress
- **Branch:** `fix/leaderboard-scalability`
- **Issue and pull request:** [#107](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/107); [draft PR #109](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/109)

## Why

The current service stops after 2,000 winning runs. If a small number of islands have many high scoring wins, the scan can fail before finding ten distinct islands. D046 requires the complete top ten and the run history is the source of truth. The database can select the winning run per island and return only the bounded board rows while Python keeps the existing names, crew counts and competition ranks.

## What

- Add a service-only SQL function that selects the best eligible run for each island, then returns at most ten islands in D046 order.
- Pass the request cutoff and optional UTC week bounds to that function; keep profile and crew reads batched in Python.
- Add a partial index only if scratch PostgreSQL `EXPLAIN` on repeated-run history shows a useful benefit.
- Keep the existing route, response, authentication, feature flag, cache policy and ranking rules unchanged.

The migration must be applied before deploying this backend code because the route has no
feature-flag fallback around the database function call. If merging this PR triggers the
Vercel deployment, the migration must be applied before the human merges. Live application
has not been authorized or performed by this task.

**Files likely to change:**

- `backend/server/island/leaderboard.py`: replace capped pages with one bounded function call.
- `backend/server/tests/test_island_leaderboard.py`: cover the former cap failure and existing ranking contract.
- `supabase/migrations/20261116100000_leaderboard_query.sql`: add and restrict the SQL function (and an index only if measurements support it).
- `backend/server/tests/island_sql/`: exercise SQL results, privileges, migration reapplication and query plan on disposable PostgreSQL.
- `docs/INTERFACES.md`, `supabase/README.md`, `docs/STATUS.md`: document the database contract and handover.

## Out of scope

- No new public route, response field, ranking rule, feature flag, dependency, frontend behavior, live database operation or deployment.
- No unlimited client/server pagination, partial board, or change to D046 tie/rank behavior.

## Done when (acceptance checks)

- [ ] Focused leaderboard tests prove 2,001+ same-island wins cannot hide distinct islands and preserve week/all-time cutoffs, per-island best wins, exact tie order, competition ranks, crew labels, privacy and empty boards.
- [ ] Disposable PostgreSQL checks cover SQL behavior for same-island ties, cross-island finish/id ties, both cutoff boundaries, and exclusion of losses, expired runs and non-island runs.
- [ ] The migration applies and reapplies cleanly; only `service_role` can execute the function; no live database is touched.
- [ ] The focused SQL query has a recorded `EXPLAIN` result on skewed history and only gets an index if measurements justify it.
- [ ] `cd backend && uv run pytest -q server/tests/test_island_leaderboard.py`, the SQL suite, relevant backend tests, and `cd backend && uv run ruff check .` pass; SQL parse check passes.
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

| Test file | Test name | What it proves |
|---|---|---|
| `backend/server/tests/test_island_leaderboard.py` | `test_repeated_wins_beyond_old_scan_cap_still_return_top_ten_islands` | More than 2,000 qualifying runs from a small set of islands cannot cause an unavailable or partial board. |
| `backend/server/tests/island_sql/test_leaderboard_query_sql.py` | `test_best_win_per_island_uses_wave_finish_and_id_order` | The SQL picks each island's highest win and applies exact stable tie ordering. |
| `backend/server/tests/island_sql/test_leaderboard_query_sql.py` | `test_week_window_and_cutoff_are_inclusive_exclusive_as_documented` | Week start and cutoff are inclusive, week end is exclusive, and all-time uses cutoff only. |
| `backend/server/tests/island_sql/test_leaderboard_query_sql.py` | `test_only_service_role_can_execute_leaderboard_query` | Browser roles cannot execute the new function. |

## Contracts touched

- [ ] API endpoints (request, answer, errors): none; existing `GET /api/island/leaderboard` contract is unchanged.
- [ ] Browser events (name and payload): none.
- [x] Database tables, policies or functions: additive `leaderboard_best_runs`; service-only execute grant, described in the migration and `supabase/README.md`.
- [ ] Shared lists (wallet reasons, feature flags, setting names): none.
- [ ] Content format (story and world data): none.
- [ ] Decisions to record in `docs/DECISIONS.md`: none; this preserves accepted D046.

## Owner and reviewer

- **Responsible teammate:** Ianno Miranda Hollensteiner (`Iannomh123456`).
- **Coding agent used, if any:** Codex, gpt-6-luna, high reasoning.
- **Reviewer (a different human teammate):** Franz (`frcola`), on the completed revision; Ianno manually reviews every PR.
- **Last updated:** 2026-11-16
