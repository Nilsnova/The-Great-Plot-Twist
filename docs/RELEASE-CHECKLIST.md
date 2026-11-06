# Release and submission checklist

Used by the release owner and submission backup. These are checks to perform and record, not a declaration that a candidate is deployed. Keep private configuration, authenticated responses, course identifiers and case solutions off the projector.

## Freeze one reviewable candidate

Record its SHA and working-tree state. Preserve authored commits and other writers' branches. Codex currently integrates for Nils under standing authorization: reviewed integration/main pushes and reviewed migrations do not need another routine approval. Never force-push main or edit an applied migration. Older Claude handoffs are historical; no Claude handover is required for this release.

```bash
git rev-parse HEAD
git status --short
```

Run the relevant tests, Ruff, build/spoiler checks and independent review before integration. Do not trigger GitHub Actions; only the scheduled daily keep-alive runs. Do not add or change `vercel.json` crons. Keep existing provider configuration unchanged, including `STOCK_API_PROVIDER=finnhub`.

## Reproducible source and scratch checks

The disposable checkout script installs the locked application dependencies and runs ordinary backend/frontend gates. It does not test a browser, live database, provider or deployment. SQL opt-in cases can be skipped in its ordinary run: never report those skips as passes.

```bash
bash scripts/fresh-clone-check.sh
# A pushed candidate branch/tag can be checked explicitly:
bash scripts/fresh-clone-check.sh https://github.com/Nilsnova/The-Great-Plot-Twist.git CANDIDATE_BRANCH
```

The release owner separately runs the disposable PostgreSQL checks with test-only tools, including the actual solo+NPC and four-player API journeys. From `backend/`:

```bash
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --tb=no
```

The `--tb=no` bound prevents an unexpected story assertion from copying protected prose into output. This command uses disposable SQL and no production credentials. Check actual skips/results and the current package fixtures; a source-only parse is not a transactional/concurrency proof. This documentation task does not rerun the full application suite.

For each database file, the coordinator follows the standing protocol: an independent subagent reviews the file against read-only live state and the chain; scratch/tests pass; live history/counts/required ownership and privileges are read; one file is applied per call in timestamp order; exact stored-text MD5 and repository version are proven; expected counts and security-advisor findings are checked. Only then push code that reads the new objects. Report each application. `150000` is unused because G12 required no migration; do not fill a reserved timestamp for an unrelated fix.

## Browser and deployment checks

From `frontend/`, after building, run the relevant production, CSP, loading and feature gates with an installed Chromium. Use external artifact directories where supported, and preserve historical evidence.

```bash
npm run build
CHROME_PATH=/usr/bin/chromium node scripts/check-production.js
CHROME_PATH=/usr/bin/chromium node scripts/check-csp.js
CHROME_PATH=/usr/bin/chromium node scripts/check-loading.js
CHROME_PATH=/usr/bin/chromium CAPTURE_DIR=/tmp/festival-release npm run test:festival:ui
```

These local browser checks use deterministic fixtures where stated. Host-console and sports scripts have their own boundaries; follow their package guides. A local browser test is not a successful production OAuth, provider call, browser multiplayer session or physical-device test.

After a production push, verify the deployment is READY and check `/api/health`, `/api/config` and signed-out public routes. Record the actual deployed SHA, headers and response behavior. An environment change reaches only a new deployment: redeploy and recheck config. Roll back a broken production deployment immediately, then fix forward.

Keep `RELIGHT_OPEN` unset. No production solve, reward or world Relighting is used as a release test. Festival and sports stay off until Nils authorizes activation; sports also needs its provider key. The host console uses verified host authorization, not a browser-supplied role.

The current confirmed production baseline and candidate evidence are separated in [presentation sources](presentation/sources.md). Refresh them when the release owner records a newer rollout. G9 is paused until the laptop returns: a complete API/SQL case proof does not establish the normal browser mystery or multiplayer connection.

## Before the class demo

- Rehearse the [five- or ten-minute coast-to-schooner script](PRESENTER-SCRIPT.md) on the actual presentation laptop/projector. Test direct-file slides, keyboard focus, comfortable sound, reduced motion and a local recording fallback.
- Check the active Supabase project and the latest scheduled keep-alive result privately. Read workflow history without triggering another run. No private configuration belongs in evidence or on screen.
- Open the public game, health and config in a clean browser window. Show a source's actual live/cache/stale/recorded label; do not call a fallback live.
- Keep the normal `?demo=1` rehearsal and `?demo=1&festival=1` memory-only festival practice clearly labelled. Neither is proof of authoritative multiplayer. Stop the mystery demo at the schooner; do not show a later reveal or celebration.
- Confirm team credit names. `frontend/src/shell/team.js` has Nils plus three placeholders; the module and frontend walkthrough exist. Keep unprovided course-only identity fields private rather than inventing them.
- A human timed rehearsal, Safari/physical-phone/gamepad behavior and live provider checks remain separate gates. Use an external screen recorder if a video is required; `record=1` is not an implemented recorder and production `perf=1` is not an FPS proof.

## Submission

The project plan targets Monday 23 November 2026; confirm the actual course deadline, required files, size limits and group-submission rules privately in Moodle. Confirm the primary uploader and backup; the authored plan names Nils as backup, not a completed submission.

After the final release gates, the authorized release owner may tag the verified commit. Do not move an existing tag. No tag or upload is performed by this ship-pack task.

```bash
git tag -a v1.0 VERIFIED_SHA -m 'The Great Plot Twist course release'
git push origin refs/tags/v1.0
mkdir -p ../submission
git archive --format=zip --prefix=The-Great-Plot-Twist/ --output=../submission/The-Great-Plot-Twist-v1.0.zip v1.0
sha256sum ../submission/The-Great-Plot-Twist-v1.0.zip > ../submission/The-Great-Plot-Twist-v1.0.sha256
```

Inspect the tracked archive before upload. The designated uploader submits the verified archive and any course-only identity material through Moodle, confirms submitted status and keeps the receipt/checksum/SHA privately. A repository checklist does not prove that Moodle accepted the submission.
