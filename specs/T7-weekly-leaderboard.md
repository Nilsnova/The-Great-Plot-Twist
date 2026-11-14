# T7: Weekly island leaderboard

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
Branch: `feat/t7-weekly-leaderboard`.

## Approved scope

- Global top 10 islands by highest successful island wave finished this UTC week,
  from Monday 00:00 inclusive to next Monday exclusive.
- One row per island, including shared multiplayer islands. Equal waves share rank.
- No rewards or adjustment for crew size. No invite codes or private account fields.
- Reuse existing records; no new packages, services or live database changes.
- Read-only API and a small card with loading, empty, error and retry states.

## Acceptance evidence

Tests cover week boundaries, repeated island results, ties, failed/expired runs and
failures. The query must not silently truncate the global ranking. Verify desktop
and phone layouts at 1280 x 720 and 375 x 812 before and after. Run the applicable
ENGINEERING section 3 checks, budget, accessibility and demo checks; record exact
results and limits in the PR. Add walkthrough and test-map entries.

## Likely shared files

`backend/server/routes/island.py`, `backend/server/island/`,
`frontend/src/island/`, related tests and API/task/handover documentation.

Implementation and local checks are recorded in [the handover](../docs/handoff/T7-weekly-leaderboard.md). Introductory explain-back completed after clarification on 14 Nov; independent human review by Franz (`frcola`) remains pending.
