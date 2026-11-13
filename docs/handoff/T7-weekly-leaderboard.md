# T7 · Weekly island leaderboard · 13 Nov 2026

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.
[Issue #12](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/12) ·
[draft PR #13](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/13) ·
`feat/t7-weekly-leaderboard`, based on main `338a6816`.

## Changed

Menu → Weekly leaderboard shows the highest wave each island **won this UTC week**,
not its current wave or all-time best. A 45 win then a restart at 1 still scores 45.
One row per island including multiplayer; up to ten rows, with no empty placeholders.
Tied scores share competition rank and medal (1, 1, 3). A wooden frame and parchment
scoreboard match the Harbor; gold/silver/bronze badges mark the first three ranks.
The only explanatory copy is “Resets each Monday at 00:00 UTC.”

The API reuses existing successful/nonexpired wave records and public host names.
No new package, service, migration, reward, invite-code exposure or database write.
[Contract](../INTERFACES.md#weekly-island-leaderboard-t7) ·
[decision D037](../DECISIONS.md#d037--weekly-island-leaderboard--2026-11-13) ·
[walkthrough](../WALKTHROUGH.md#30-weekly-island-leaderboard--ianno-hollensteiner-t7) ·
[test map](../TEST-MAP.md#t7--ianno-hollensteiner--weekly-island-leaderboard).

## Verified

Commands run with Node 22.12.0 already present on this machine, installed Chrome,
and the repository's existing uv environment. `CHROME_PATH` points to
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

| Command | Actual result |
|---|---|
| `cd backend && uv sync` | Resolved 29 packages; installed 26 packages |
| `cd backend && uv run ruff check .` | `All checks passed!` |
| `cd backend && uv run pytest -q` | `16135 passed, 275 skipped in 72.06s (0:01:12)` |
| `cd frontend && npm install` | `added 47 packages in 699ms`; incidental lockfile metadata changes restored |
| `cd frontend && npm test` | `Test Files 237 passed (237)`; `Tests 2973 passed (2973)` |
| `cd frontend && npm run build` | `✓ built in 582ms`; `Spoiler guard: 225 text files, 12 protected lines, no suspect elimination data.` |
| `cd frontend && node scripts/report-budget.js --check` | Exit 0; initial JavaScript 18,174 / 21,080 bytes, CSS 8,550 / 12,000 bytes |
| `node scripts/text-lint/index.mjs` | `Text lint: 3758 candidate strings in 411 source files; 0 errors, 8 report-only findings.` |
| `cd frontend && npm run test:a11y` | Exit 0; 33 screens, `failures: []`, `errors: []` |
| `cd frontend && npm run test:demo` | Exit 0; 33 checks, `errors: []`, `external: []` |
| `cd frontend && node scripts/check-island-leaderboard.mjs before` | Original main menu without the entry, 1280 × 720 and 375 × 812 |
| `cd frontend && node scripts/check-island-leaderboard.mjs after` | `T7 desktop/phone menu, offline and fixture top 10 checks passed (after).` Includes exactly 3 rows, text contrast ≥4.5, controls ≥44 px, no horizontal overflow and Escape closes |

Initial runs found an incomplete browser test setup, two exact menu/API lists that
needed the new entry, and house text lint findings. These were fixed, not skipped.
The backend skips are optional SQL/opt-in database checks, not T7 test failures.
Three reviewed vocabulary additions: weekly and rank checked against the system
English dictionary; [leaderboard checked in Cambridge](https://dictionary.cambridge.org/us/dictionary/english/leaderboard).

Added-documentation link check: 27 local targets checked, 0 missing. Full diff inspected; `git diff --check` clean.

## Screenshots: sample data, not live rankings

The before capture serves the main `338a6816` island controller through the local
browser fixture. The after capture runs the local game and renders explicit sample
captains for layout checks. The offline screenshot uses the actual fake transport,
which refuses global rankings with an online-required message. No screenshot proves
real players, live Supabase queries or a deployment.

| Evidence | Desktop 1280 × 720 | Phone 375 × 812 |
|---|---|---|
| Before: menu | [before](../../frontend/captures/20261113_T7/before-1280-menu.png) | [before](../../frontend/captures/20261113_T7/before-375-menu.png) |
| After: menu | [after](../../frontend/captures/20261113_T7/after-1280-menu.png) | [after](../../frontend/captures/20261113_T7/after-375-menu.png) |
| After: all ten places | [top ten](../../frontend/captures/20261113_T7/after-1280-top10.png) | [top ten](../../frontend/captures/20261113_T7/after-375-top10.png) |
| After: only three qualify | [three](../../frontend/captures/20261113_T7/after-1280-three-islands.png) | [three](../../frontend/captures/20261113_T7/after-375-three-islands.png) |
| Offline message | [offline](../../frontend/captures/20261113_T7/after-1280-offline.png) | [offline](../../frontend/captures/20261113_T7/after-375-offline.png) |

## Not verified and limits

- Live PostgREST filtering/pagination, query performance, real sign-in and deployment.
- Physical phones, VoiceOver and another browser engine; global accessibility check
  covers existing screens, while the T7 script adds local leaderboard checks.
- The server scans at most 2,000 sorted runs; if it cannot finish, it returns 503
  rather than an incomplete ranking. A database aggregate/index is a future option.
- Concurrent deletion may shift offset pages. The cutoff excludes new finishes,
  but does not create a transaction snapshot. Names can match; IDs stay private.
- Solo and multiplayer share the ranking without crew-size adjustment or new
  anti-cheat checks. Ties crossing tenth place use stable internal owner ordering.
- Rankings depend on existing recorded wave outcomes, not a new server simulation.

## Explain-back draft for Ianno to confirm

- What: “I added a weekly scoreboard for islands, so a team appears once even if
  several friends played together. It keeps the highest win this week after restarts.”
- Why: “The server already stores wave results, so I reused those records and our
  existing card instead of creating another storage system.”
- Limits: “The tests use fake database reads. They do not prove live queries or fair
  difficulty between solo and multiplayer. Very large scans show an error.”
- How it could change: “We could aggregate in the database if real load needs it,
  or add separate solo rankings after agreeing the rules.”

This is an agent-assisted draft, not evidence that Ianno completed the explain-back.
Do not mark ready until he answers the questions and confirms the explanation.

## Remaining / reviewer

Quiz: (1) Why does winning wave 45 then restarting at 1 leave a score of 45?
(2) How do three friends on one island become one row, and why can ranks be 1, 1, 3?
(3) What happens when the database is down or the scan exceeds its limit, and what
has not been proven by the fake-database tests?

Suggested reviewer: Johannes Franz Lang (`frcola`, island/API test experience), or
Nils (`Nilsnova`). A different human approves the current change; no agent merge.
Keep PR #13 draft pending Ianno's explain-back, then mark ready for human review.
