# G14 checkpoint 2 — page

- Responsible host: Nils. Branch: `feat/g14-host-console`.
- Implementation: `00b173e`; previous checkpoint `026b290`; origin/main merged, already up to date.
- Gate: `(cd backend && uv run pytest -q && uv run ruff check .)` — 3125 passed; Ruff clean.
- Gate: `(cd frontend && npm test && npm run build)` — 301 passed; build/spoiler guard green (65 files).
- All gate shells used `set -o pipefail`.
- `CHROME_PATH=/usr/bin/chromium npm run test:host` — passed with fake same-origin API only.
- Browser: strict CSP, host denial, PKCE cleanup, no token display/storage, 390px layout, cleanup retry UUID.
- Clock: config capability, strict 1–3600 seconds, quick +1/+5/+15/+60 min, retained retries, no case-view rendering.
- G10 is absent from main: hidden until route is installed AND case flag is on; future contract is covered by fakes.
- Migration unchanged: `20261106170000_host_console.sql`; MD5 `da0e6a9da0362c7310b1023add663108`.
- Secret scan: detect-secrets on `git diff origin/main...HEAD`, no remote verification — zero findings.
- Screenshots use synthetic fixtures only: [desktop](g14-desktop.png), [phone](g14-phone.png).
- No live Supabase, `.env`, secrets or protected files accessed/changed.
- Requests for Claude: confirm the installed G10 route appears in OpenAPI and uses the supplied seconds contract.
- Remaining: operator documentation and final checkpoint; real sign-in/deployment checks intentionally not run.
