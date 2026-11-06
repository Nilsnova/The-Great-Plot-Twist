# G14 checkpoint 3 — operator guide and final handoff

- Responsible host: Nils. Branch: `feat/g14-host-console`.
- Commits: server `e5e66a4`, server note `026b290`, page `00b173e`, page note `7ac0f1b`, final changes `ea24dfd`.
- `origin/main` fetched and merged before every checkpoint; final merge was already up to date.
- Gate (`set -o pipefail`): `(cd backend && uv run pytest -q && uv run ruff check .)` — 3128 passed; Ruff clean.
- Gate (`set -o pipefail`): `(cd frontend && npm test && npm run build)` — 304 passed; production build green.
- Spoiler guard: all 65 built text files green; no case view is rendered by the console.
- Scratch PostgreSQL checker passed: reapply, RLS/grants/invoker rights, aggregates, logged atomic closes and concurrent retries.
- `CHROME_PATH=/usr/bin/chromium npm run test:host` — passed, desktop and 390px phone, fake API only.
- Clock tests include malformed 200, unknown result then rate limit, failed refresh, and in-flight refresh races.
- Migration: `20261106170000_host_console.sql`; MD5 `da0e6a9da0362c7310b1023add663108` (unchanged since checkpoint 1).
- Secret scan: detect-secrets on `git diff origin/main...HEAD`, no remote verification — zero findings.
- Protected files and existing migrations unchanged; no live Supabase, `.env` or secret access.
- Operator guide: [HOST-CONSOLE.md](../HOST-CONSOLE.md); frontend notes: [HOW-IT-WORKS.md](../../frontend/HOW-IT-WORKS.md).
- Screenshots (synthetic fixtures): [desktop](g14-desktop.png), [phone](g14-phone.png).
- Requests for Claude: review/apply the reserved migration separately; check real host OAuth on deployment.
- G10 request contract is implemented and fake-tested; its route/flag are absent on current main, so the panel stays hidden.
- The requested `?perf=1` link is present; the current game still has development-only performance statistics.
- Not performed: live migration, live login, deployment, main push/merge, or real G10 clock calls.
