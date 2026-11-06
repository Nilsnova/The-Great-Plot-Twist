# G16 checkpoint 3 — monitoring and incident recovery

- Branch `chore/g16-reliability`; fetched/merged `origin/main` (`c26f303`) before checkpoint; push only this branch.
- Before: **0** build-stamp artifacts or signed-out deployment smoke scripts. After: **1** public `build-info.json` with commit, UTC time and complete emitted JS/CSS list; **11** signed-out checks, failure count as exit status.
- `scripts/smoke-live.sh [HTTPS_ORIGIN] [FULL_COMMIT] [EXPECTED_FLAGS_JSON]` checks home, API health, seven Boolean flags, private no-store, headers, build identity, entry references, every stamped asset and spoiler fingerprints. No credentials/cookies, redirects, outside asset origins or unbounded retries; 8s/request, ≤100 assets, ≤4 MiB/file, ≤16 MiB bundle.
- Monitoring regression suite: **16 local fixture tests passed**, covering success, bad flags/build, missing headers/chunks, redirects, outside URLs, oversize, HTML fallback, exact/escaped synthetic spoilers and CLI failure counts. Live smoke deliberately **not run**; no Supabase/outside service contacted.
- [RUNBOOK](../RUNBOOK.md) covers API down, paused Supabase, stale/failed deploys, Realtime capacity, price-feed fallback and human-operated Vercel rollback. Public health does not establish database readiness or authenticated gameplay.
- Exact additive `vercel.json` proposal for Claude (G16 does **not** apply it):

```json
{"headers":[
  {"source":"/(.*)","headers":[{"key":"Content-Security-Policy","value":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"},{"key":"X-Content-Type-Options","value":"nosniff"},{"key":"Referrer-Policy","value":"no-referrer"},{"key":"Permissions-Policy","value":"camera=(), microphone=(), geolocation=()"}]},
  {"source":"/build-info.json","headers":[{"key":"Cache-Control","value":"no-store"}]}
]}
```

- Preserve existing Services, regions and rewrites; no cron. Claude should reconcile G8/G10 first, verify Services supports/applies these headers in preview, narrow Supabase hosts to the configured public project where possible, then publish through the normal release process. No deployed-header/CSP readiness is claimed by G16.
- Local proposal CSP/browser check passed: title/settings/intro/WebGL, **0** CSP violations, browser errors or external requests. Actual-build smoke passed **11/11** checks with all **42** emitted JS/CSS assets stamped and scanned ([report](g16-smoke-local.txt)). These simulate proposed headers, not deployment configuration.
- Review follow-up: load-check output errors now always close Chromium/Vite; mkdir happens before launch. Existing dated captures remain untouched.
- Gates use `set -euo pipefail`: backend **3110 passed**, Ruff clean; frontend **290 passed**, build + **52-file** spoiler guard; budget/load/CSP and **16** local smoke tests passed. Committed-diff secret scanner requires **0 findings** before branch push; tooling only in uv cache.
- Independent review verified exact stamp/output coverage; corrected failed-asset downloads to stop immediately, with a regression preventing additional downloads after a large wrong-MIME response. No deployed-header/live-game availability claim.
- No new dependencies/lockfile edits, migrations, live Supabase/`.env`/secret access, G9 screens/adapter edits, or `vercel.json`, STATUS/DECISIONS edits. Publication/rollback remains a human operation.
