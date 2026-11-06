# The host and demo console (G14)

The class host uses `/host.html` to check the game before class, inspect crews and close their own rehearsal crew. The page never shows the case solution, player e-mails, login tokens or server credentials.

## Before the first deployment

The deployment owner reviews and applies the new migration, **`supabase/migrations/20261106170000_host_console.sql`**, after the existing migrations. It adds two private tables and four server-only functions. Existing migrations are unchanged. Application code alone does not apply it.

Nils' verified player ID must be in the existing `HOST_PLAYER_IDS` server setting. Configure that through the deployment's secure settings, following [SETUP.md](SETUP.md); never paste credentials into this console, chat or the repository. Supabase must allow the deployed origin's `/host.html` as an OAuth return address, through its existing exact-origin redirect rule. No preview-origin wildcard is needed.

Open `/host.html` and choose **Sign in with GitHub**. The console follows the same PKCE exchange as the team sign-in check, with a separate tab-local verifier. It removes the one-time code from the address immediately. The access token stays in memory only: refreshing or choosing **Forget me** requires signing in again. Neither a captain name nor a query parameter grants host access; the server checks the verified player against `HOST_PLAYER_IDS` on every host request.

The static page is public, but contains no host data. Visitors and non-hosts see **Not a host**; its panels stay empty. G14's console-specific host dependency returns 403 for missing/refused logins as well as non-hosts. An authentication outage is an unavailable service, not proof that somebody is a host. The console never bypasses this check in demo mode.

## What the panels mean

| Panel | Meaning and limits |
|---|---|
| Game overview | Registered profiles, crews grouped as forming/active/finished, and open Exchange v2 positions (`exchange_positions` with status `open`). Closed and zeroed positions are excluded. These are database counts, not online-player counts. |
| Realtime connections | **Unknown** until the server has an authoritative count. Zero is not guessed. |
| Wallet movements | Number of ledger entries, earned coins, spent coins and signed net change, grouped by reason for today's **UTC** day. Counts are aggregated across the whole database; they are not limited to the newest crews. No player-level transactions or solution data are shown. |
| Expected migrations | The server's required migration names and feature associations. “Present” means a representative required object exists, **not** that the exact migration version or all its grants were verified. “MISSING” needs the deployment owner's investigation before class. Enabled flags are listed in the checklist. |
| Build | API version and the deployment's documented commit SHA, or **unknown** outside a deployment that supplies it. Never a secret or an arbitrary environment dump. |
| Weather | The adapter's actual source: live, cache, stale or fallback. Fallback means recorded; cache/stale originated from live data. Unavailable is explicit. |
| Recent crews | The newest 50 crews plus the total count. Code, status, sail time, seat number and captain name only; NPC seats say “NPC partner”. Older crews remain in storage. Refresh to get the latest list. |
| Demo checklist | Confirmed keep-alive for today's UTC date, recorded/live mode, enabled flags, observed private API headers and a game link with `?perf=1`. |

The page refreshes only when requested; there is no polling loop. A failed refresh hides old panels so they cannot be mistaken for a current health check. A network failure does not mean that the game state changed or that nobody is online.

### Closing a rehearsal crew

Only an eligible crew gets a **Close test crew** button. Check **This is my test crew** first. There is no separate persisted “test” flag: the host explicitly identifies their rehearsal crew at this confirmation.

The server then checks, atomically, that the crew was created by the **requesting host**, is still **forming**, and has **no other human player** seated. Even another host's crew is ineligible. The SQL function locks the same crew row as join and muster, so a crew that sailed or acquired another player in the meantime cannot be closed.

Closing sets the crew to `finished` and increments its version. It does not delete seats/history, move coins, change a case, or affect another crew. The action is recorded with the verified host, crew and action UUID. Successful audit records survive crew deletion; they follow the account-deletion contract and disappear if that host deletes their account.

If the result is unknown, retry the **same crew** in the same page: the same action UUID is sent. A successful repeat returns the stored success without changing state again. A UUID cannot close a different crew. A fresh action on an already-finished crew is refused. Refreshing or closing the tab discards the browser's retry identity; inspect the refreshed crew status before trying anything else.

### Case clock (G10)

The panel is hidden until `GET /api/config` reports `capabilities.hostCaseClock: true`. This requires **both** an installed `POST /api/host/case/clock` route in the server's OpenAPI schema **and** the `case` flag on. G14 does not add that flag, create the G10 route or switch the case on.

When available, enter an integer from **1 to 3600 seconds**, or use **+1 min / +5 min / +15 min / +60 min**. The page sends `{seconds, actionUid}` to the server. It forwards only the host's own open crew; other crews and the world are unchanged. With `RELIGHT_OPEN` off, a forwarded solve still leaves the world locked. Buttons disable during the write. The console displays the outcome message, case second and repeat marker; it deliberately ignores the entire returned `case` object.

A game-rule refusal (`accepted: false`) is displayed as “Clock not moved”. A 404 means no open case crew or the feature is off; 409 asks the host to start their forming crew; 429 asks them to wait. A 401/403 removes host panels. After a network, server or unreadable-response outcome, retry the **same number of seconds**: its action UUID is retained. A different amount is blocked until that outcome is resolved. Do not reload mid-retry.

## Before every class demo

1. Confirm the reviewed migration is applied and this deployment has Nils in `HOST_PLAYER_IDS`. Sign in on the actual class-demo origin.
2. Refresh the console. Check the build, mode, flags and expected migration objects. Turn on only features approved for that demo.
3. Check **Keep-alive confirmed today (UTC)**. The existing daily keep-alive route records success only after its three database reads succeed. The stamp is durable across server restarts. If no stamp is available, the console stays unconfirmed; it never infers a successful job. The recording is best effort so a missing G14 migration cannot break the existing daily job. Have the repository owner check/run the existing approved keep-alive workflow; this page never asks for its credential.
4. Check the weather source and the intended demo mode. Recorded data is suitable for rehearsal and is labelled. Missing Realtime evidence is not a connection count.
5. Confirm the private API headers check passes: `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. The page itself uses a strict same-origin CSP with external scripts/styles and no inline code.
6. Open the performance link (`/?perf=1`) and rehearse the intro, crew flow and projector/phone layout. The current game's rendering statistics are development-only; G14 supplies the requested link and does not add a production performance overlay.
7. Close only Nils' isolated forming test crew after rehearsal. Leave student and active crews alone. The case clock stays absent until G10 is installed and enabled.

## Developer validation without live services

G14 was developed without reading `.env` or any secret, or connecting to live Supabase. Route tests use fake login, database and weather. The browser check intercepts every API request, forbids external requests and uses synthetic captain names. No authentication bypass is shipped.

From the repository root, using `set -o pipefail`:

```bash
(cd backend && uv run pytest -q && uv run ruff check .)
(cd frontend && npm test && npm run build)
(cd backend && uv run --frozen --with pgserver --with 'psycopg[binary]' python -m tools.check_host_console_postgres)
(cd frontend && CHROME_PATH=/usr/bin/chromium npm run test:host)
```

The scratch command creates and deletes its own local PostgreSQL cluster, applies all migrations and reapplies G14, and tests invoker grants/RLS, counts and UTC-day filtering, safe cleanup, concurrent/repeated actions and bounded reads. `pgserver` and `psycopg` are test-only; they are not project dependencies. The browser check uses an existing `dist/` from `npm run build`, starts its own preview on port 4179, and writes fake-data screenshots/report under `frontend/captures/` (override `G14_CAPTURE_DIR` to keep them outside the checkout).

See the [checkpoint notes](handoff/g14-checkpoint-1.md), [page checkpoint](handoff/g14-checkpoint-2.md) and [final checkpoint](handoff/g14-checkpoint-3.md). Applying the migration, real OAuth and the future live G10 integration remain deployment-owner checks; this work does not perform them.


## Integration validation (6 November 2026)

The authored G14 commits were preserved while reconciling current Exchange v2, NPC, world and host-clock contracts. Shared host APIs retain their existing 401 login contract; only the console maps refused logins to 403. Readiness probes use surviving Exchange v2 objects and cover current case/world/NPC/duel/prediction objects plus the planned festival migration. A missing disabled feature is labelled "Not enabled" rather than a required-object failure.

A successful G10 repeat omits extra numbers under the case API contract. The console now accepts its stored confirmation without requiring a new `now`, clears the retry intent, and still ignores the returned case view. The browser gate exercises that exact retry followed by a different clock move.

Verified locally: host/auth/config/keepalive tests; full scratch migration chain and reapply; open versus closed Exchange v2 counts; browser roles and invoker grants; safe repeated/concurrent cleanup; frontend tests; production build and spoiler guard; mocked desktop and 390px browser checks. No live cleanup, clock, world or settings action was performed. Screenshots and report from the integration gate are under `/tmp/g14-integration-captures` in the review workspace. Original checkpoint counts/screenshots remain historical evidence.

Before release, root must mount `host_console.router` and `HostConsoleHeaders` in the shared app, merge the interface documentation, and run the combined 160000/170000 chain and application checks. Migration 170000 remains unapplied and requires independent review against the live state before application. No new dependency or feature flag is enabled by G14.
