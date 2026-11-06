# Reliability runbook

Use this during the class demo and the weeks afterwards. The smoke checker reads public,
signed-out endpoints only. It cannot prove that Supabase, authentication, Realtime or a
wallet write works. Never paste tokens, secrets, player identifiers or response bodies
into incident notes or logs. Never run a load test against production or an outside service.

## Check one deployment

From the repository root, with Node installed:

```bash
bash scripts/smoke-live.sh https://the-great-plot-twist.vercel.app
```

To check the intended deployment and selected flags, supply a full Git commit SHA and
an optional JSON object of expected Boolean flags:

```bash
bash scripts/smoke-live.sh https://the-great-plot-twist.vercel.app FULL_40_CHARACTER_COMMIT '{"market":false}'
```

Use the actual production build commit, which may be a merge commit. Omit expectations
only when investigating what is currently deployed. The checker prints `BUILD` with the
validated public commit and UTC build time. Exit code is the number of failed checks;
zero means all checks passed. A configuration error exits 1. Preserve the status when
capturing output (`set -o pipefail`). Do not put this script in an unbounded retry loop.

The checks cover home HTTP 200, security response headers, API health, Boolean feature
flags, signed-out `/api/me` HTTP 401 with `Cache-Control: no-store`, a valid build stamp,
and the production spoiler fingerprints in the downloaded home and every stamped JS/CSS
asset. No sign-in, cookies, authorization headers or credential files are used. Redirects
are refused. Each request has an eight-second timeout; the bundle is bounded to 256 assets,
4 MiB per asset and 16 MiB total. Only the same origin is contacted. The script requires
`build-info.json`; a missing stamp or header is a failed deployment check, not a reason
to disable that check. The current deployment headers remain authoritative; G16 does not change `vercel.json`.

Validate the checker without touching production:

```bash
node --test scripts/test-smoke-live.mjs
```

An explicit `http://127.0.0.1:PORT` or `http://localhost:PORT` origin is allowed for local
fixtures; other origins require HTTPS. Tests use synthetic text and local HTTP servers.
The spoiler guard recognises the existing exact protected fingerprints, not every possible
paraphrase. A passing signed-out smoke is not a complete security or game acceptance test.

## API down or slow

1. Run one smoke check. If home fails too, check Vercel's platform status and the project
   deployment in its dashboard. If home works but `/api/health` fails, inspect the backend
   service's latest build/startup logs and region/configuration. Do not change `vercel.json`
   during an incident without the project owner's review.
2. Compare `BUILD` against the intended commit. A working home can belong to the previous
   deployment; Vercel keeps serving a successful deployment when a new build fails.
3. Inspect route/status/duration aggregates and error counts, not request bodies, tokens,
   user IDs or query strings. Health is process-only: an `ok` answer does not establish
   database readiness. Use the authorized operator's dashboard to distinguish database faults.
4. If the regression began with a deploy, roll back to the last known good compatible
   production build below. Preserve a brief incident note with times, commit and safe counts.
   Do not mask failures by adding polling loops or blindly retrying money-changing requests.

## Supabase paused or unavailable

An authorized project owner checks the Supabase dashboard and resumes the project if it
is paused; allow a few minutes. Follow the current user authorization for live reads, reviewed migrations and recovery.
Never print or decrypt credentials. The existing **Keep Supabase awake** GitHub Actions
workflow runs once daily at 06:17 UTC. Do not trigger GitHub Actions manually: the release
uses only that scheduled keep-alive. A 401 points
to a keep-alive authorization mismatch; a 503 can mean missing configuration or a failed
database read. Resolve bindings only in the relevant dashboards, never in chat or Git.

Never add a Vercel `crons` entry: it previously broke deploys with Vercel Services. The
keep-alive is a precaution, not a promise that Supabase will stay awake. The day before the
class demo, the owner should confirm that the project is active in the dashboard. After
recovery the owner verifies sign-in and a read-only account screen; the public smoke alone
cannot verify this. Do not exercise real wallet changes as an availability check.

## Deploy fails or production looks stale

Open Vercel **Deployments**, select the intended commit, then inspect both frontend and
backend build logs. Check the recorded Node/Python versions and locked-install failures.
Reproduce failures locally with the documented test/build gates before redeploying. Do not
update dependency locks or remove signature/TLS verification to get a deployment through.
Keep the existing successful production deployment available while investigating. Compare
the new deployment's build stamp after it is ready; do not infer rollout from a successful
Git push or a green static homepage alone.

## Realtime connections or message budget full

An authorized operator checks Supabase Realtime metrics and provider errors. The documented
free-tier budget is 200 connections, 100 messages/second and 2 million delivered messages
per month; verify current plan limits in the dashboard before changing capacity. Close
abandoned demo tabs, avoid extra devices/tabs during rehearsal, and inspect local subscription
cleanup and room scope. Fix duplicate subscriptions on a task branch with local tests.
Do not replace Realtime with a tight polling loop. The signed-out smoke does not open a
Realtime connection and cannot establish its health. Coordinate any temporary feature-flag
change with the feature owner, using Vercel settings and a deliberate redeploy.

## Weather or price feed out

Cached, stale and recorded fallback data are expected degradation paths. An authorized
human checks the safe source/status diagnostics and provider status; do not repeatedly
probe the feed from production. Demo mode uses a public recording and must not be mistaken
for current market data. Keep the bounded adapter timeout/cache/fallback; do not fetch
directly from the browser or lower polling intervals during an outage.

A 503 on a money-changing request has an unknown outcome. Retry with the **same**
`actionUid` or `stakeId`, and refresh the signed-in account state. Do not create a new
identifier or issue a separate refund: durable receipts make the exact repeat safe. Never
put that reference or player details into general request logs or the incident note.

## Roll back a Vercel deployment

A broken production release is rolled back immediately to the previous compatible
deployment, then fixed forward. Current standing release authorization does not need to
be requested again. This runbook does not grant access beyond the user's authorization.

1. An authorized operator opens the correct Vercel project and **Deployments**, identifies the
   last known good **production** deployment by commit/time and confirms that it remains
   compatible with the database schema and current environment-variable names.
2. Use that deployment's menu **Rollback** / **Instant Rollback** and confirm the production
   target. If that action is unavailable on the current plan, follow the dashboard's
   supported promotion flow for that existing successful deployment. This changes the
   production deployment target; it does not revert database data, migrations or Git.
3. Run one signed-out smoke with the old deployment's exact commit expectation. An
   authorized operator verifies any affected authenticated flow without changing money.
4. Record the old/new production commits, incident time and check outcomes. Fix forward
   on a task branch; do not reset or force-push `main`, and never reverse migrations as
   part of a frontend/API deployment rollback.

A new build stamp exists only after deploying a build that includes G16. Keep missing
stamps or headers visible as failed checks; do not describe an older deployment as
verified by a checker it cannot yet satisfy. Preserve the existing strict CSP, production
entry-point restrictions, and `STOCK_API_PROVIDER=finnhub`. Never add `vercel.json` crons.

## Sports provider unavailable

Live sports fails closed without its configured provider key. Historical 2023 fixtures are
read-only in explicit demo mode and never authorize a live payout. Nils enters provider
credentials directly in Vercel; no agent signs up, bills, prints or extracts a key. Confirm
the configured provider with a credentialed read-only smoke check before enabling sports.
Environment changes reach only new deployments: redeploy, then verify `/api/config` and
the relevant public board. Missing credentials and unrun live checks remain open evidence,
not passing tests.
