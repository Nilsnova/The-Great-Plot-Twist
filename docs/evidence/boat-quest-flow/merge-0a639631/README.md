# Main merge and recovered quest progress

Conflict-resolution handover for PR #467, used by Ianno and the peer reviewer.

Main `0a639631` adds co-op consistency and background reward recovery. Preserve both HUD imports/state, saved-purchase reconciliation, retained personal win credit and main's account-reset/event handling. A snapshot must recheck retained wins, and a recovered win must recheck saved purchases. Two arrival-order regressions confirm the same ordered progress: stop at the invite, then finish the remaining goals, with no `wave_finished` emission. The recovery-first case failed before the fix (done 1/4 instead of 4/10).

DECISIONS keeps main's reward/revival **D067** and renumbers this boat/quest decision to **D068**, updating task references. Main's wallet/read generations, ignored wave responses and wave-ID lifecycle guards are preserved. Task backend and migration files are identical to main.

- [Focused tests](focused.log): **15 files / 197 tests passed**, 50.86 s. Covers HUD/quests, recovered rewards, wallet ordering, boat transitions, wave-flow races/context, rejoin, arsenal and panel services.
- [Production build](build.log): **passed**, 1.82 s; spoiler guard **250 text files / 12 protected lines**.
- Text lint: **0 errors / 10 report-only findings**. Diff, conflict-marker, syntax and task-document links checked; separate read-only integration reviews found no actionable defect.
- [Native proof](native.json): the real local game opens a boat round and starts wave 31. All four size/toast variants and both settled rotations fit and keep critical feedback clear; the boat/modal close and native captain movement resumes. Zero application page errors, console errors or external requests. [Portrait with error](portrait-error.png), [landscape with error](landscape-error.png).

Reproduce from `frontend/` with `node ../docs/evidence/boat-quest-flow/native-layout.mjs /tmp/boat-merge-proof`. The capture was made during the uncommitted merge from `8dec5628`; `dirty:true` records that boundary. All **nine** application SHA-256 hashes stayed stable and were checked against the final integrated files. The expanded hash list includes the merged HUD, island controller, wave flow and game wiring. This is local fake-server browser evidence, not authenticated online multiplayer.

The full frontend suite, backend/PostgreSQL suites and live Supabase/wallet flows were not rerun for this conflict resolution. Earlier full-suite/native evidence retains its original source boundary. This task does not merge to main, deploy, run migrations or operate a live wallet. The refreshed PR needs human peer approval before merge.
