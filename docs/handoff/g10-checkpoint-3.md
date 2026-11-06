# G10 checkpoint 3 — local API and sign-in flag

- Branch: `chore/server-followups`; no main change or deployment.
- Case Phase 1 `2a2fccd` merged with C `b92a26a` as `7c3a592`.
- Merge keeps URL validation, cache defaults, case privacy and RELIGHT startup rules.
- R1: `docs/LOCAL-TEST-SERVER.md` documents the one-command port-8000 API.
- Startup requires exact `LOCAL_TEST_SERVER=1`, raw `APP_ENV=local`, and no `VERCEL` key.
- Uses direct empty-credential settings; four fixture identities, one host, demo true,
  case on, sign_in off, RELIGHT_OPEN false; no Supabase settings/network fallback.
- Private Unix-socket PostgreSQL applies all 7 sorted migrations twice and seeds users
  through the real signup trigger. Shutdown deletes the complete temporary database.
- Strict local admin port executes actual whitelisted SQL functions and nested reads;
  embedded selects share one read-only repeatable-read snapshot.
- R3: `sign_in` is known and default off; external activation still depends on R2.
- Final combined backend/story suite: 3512 passed, 37 skipped (`--tb=no`).
- Final opt-in case SQL, R7 RLS and real API golden path: 26 passed.
- Golden path covers four logins, host 403/unknown 401, intro/wallet grant retry,
  crew create/join/muster, cross-player isolation, case open/search/UID retry/clock,
  account deletion, snapshot consistency and scratch-directory cleanup.
- Actual documented CLI: health/config/login/me passed on 127.0.0.1:8000;
  Ctrl-C removed the database and closed port 8000. Frontend 5173 was untouched.
- Ruff clean; 13 changed Python files formatted; all migrations + bootstrap parse.
- MD5 060000 case: `278a16fcf87bbf2f46d81ec803f1e94b`.
- MD5 140000 follow-ups: `3c687ef351147e3d86b99523941233fd`.
- `docs/STATUS.md` is byte-identical to C `b92a26a`; later handoff notes override it.
- No protected content changed in R1/R3, so no new R13 fingerprint generation needed.
- R7/R10/R12 integrated as `c0504ef` with source handoff `290f260`.
- Remaining: parent review and push authorization; working tree checks are complete.
- Group 3 and Phase 2 still wait for group-2 confirmation and L2 on origin/main;
  this Phase 1 local harness does not establish Phase 2 readiness.
- R2/R5 remain browser-owner work. No external sign-in activation or production proof.
- No push before parent review and authorization.
