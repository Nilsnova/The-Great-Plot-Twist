# G14 checkpoint 1 — server

- Responsible host: Nils. Branch: `feat/g14-host-console`.
- Implementation: `e5e66a4`; base `origin/main` merged (already up to date).
- Gate: `(cd backend && uv run pytest -q && uv run ruff check .)` — 3122 passed; Ruff clean.
- Gate: `(cd frontend && npm test && npm run build)` — 288 passed; build and spoiler guard green.
- All gate shells used `set -o pipefail`.
- Scratch: `uv run --frozen --with pgserver --with 'psycopg[binary]' python tools/check_host_console_postgres.py` — passed.
- Migration: `20261106170000_host_console.sql`; MD5 `da0e6a9da0362c7310b1023add663108`.
- Scratch proves repeat application, invoker permissions/RLS, aggregates, retries, concurrency and bounded reads.
- Secret scan: detect-secrets on `git diff origin/main...HEAD`, no remote verification — zero findings.
- HostDep now gives 403 to visitors/refused logins and ordinary players, per G14.
- Only the host's own forming crew without other human seats can be closed; same action UUID replays safely.
- Keep-alive stamps are best effort; no stamp means no confirmed success, never an inferred green.
- Expected migration object probes are not proof of exact applied migration versions.
- No live Supabase, `.env`, secrets or protected files accessed/changed.
- Requests for Claude: review/apply the new migration separately; verify real host login after deployment.
- G10 clock is absent from current main; its console panel will remain hidden until available.
