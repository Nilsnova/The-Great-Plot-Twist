# G10 checkpoint 7 — group 2, bulletin flag and crew hints

- Branch: `chore/server-followups`; origin/main `60f7fd0` merged as `932dbcf`.
- Group 2, A4, L2 and Claude's source security headers are now imported.
- `docs/STATUS.md` and `vercel.json` are exact origin/main blobs. Their incoming
  changes belong to Claude/main; no authored status/header edits were made here.
- Preserved case service injection/privacy, URL validation, R10 metadata and R12 credits.
- R6: `bulletin` is known and default off; `/api/bulletin` returns 404 before weather,
  world, exchange or database reads. Enabled response shape/cache behavior is unchanged.
- R8: successful join and muster send one version-only `crew_changed` hint through
  the existing shared A4 sender, with a one-second budget and quiet fallback.
- Reads/refusals/repeated intents send nothing; A4 flags and event limits still apply.
- No CaseService nudge methods changed; parent owns Phase 2/A4 case integration.
- R1 applies all nine sorted migrations twice on its new Unix socket. Local admin now
  supports L2 tables/RPC; added real build/cost/retry/isolation/delete API proof.
- Updated old L2 test token to the shared three-part synthetic-token contract.
- Verified focused R6/R8/service tests: 216 passed; all L2 route tests: 83 passed.
- Verified opt-in actual SQL/RLS plus case and L2 API paths: 27 passed.
- Approved coordinate correction `2093652` aligns the home light with the public registry.
- Full backend/story gate is green: 6830 passed, 38 skipped in 49.54 s
  (`/workspace/.cloud-setup/validation/c-approved-backend.log`).
- Frontend: 886 tests passed in 72 files; build/spoiler guard passed (99 files, 12 lines).
- R13: reveal fingerprints regenerated unchanged after the approved secret-data edit;
  fresh build passed (`/workspace/.cloud-setup/validation/c-approved-build.log`).
- Installed exact main npm lock with `npm ci`; no authored manifest/lock changes.
- Ruff clean; 14 authored Python files formatted; nine migrations + bootstrap parse.
- MD5 A4 050000: `53edec89fcbce7c961f1d08e92759d60`.
- MD5 L2 070000: `bee55d86080b52256c765993232659e9`.
- MD5 case 060000: `278a16fcf87bbf2f46d81ec803f1e94b`.
- MD5 follow-ups 140000: `3c687ef351147e3d86b99523941233fd`.
- Protected migrations and dependency manifests are unchanged; no credentials or protected prose added.
- Remaining: parent review; R4 waits for live sign-in; R5 is Claude-owned external setup.
- R9 remains optional. External flags stay off; no deployment or main push.
