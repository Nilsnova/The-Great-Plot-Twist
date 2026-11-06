# G22 checkpoint 1 — local development and demo seed

> Historical source-branch checkpoint. These counts and limitations describe the original
> authored branch; current integration gates are recorded separately by the release owner.

Responsible teammate: Nils (requested Codex G22). Branch: `chore/g22-devtools`,
based on `origin/main` at `c26f3032b150af970d57fbbcd6eea439eb26f4c4`.
No merge or push to `main` is authorized or performed.

## Changed

- `scripts/dev/start.sh` / `stop.sh` and their supervisor: one-command scratch
  Postgres, ordered migrations, automatic demo seed, FastAPI and Vite; readiness,
  separate ports/state directories, reuse and cleanup.
- Dev-only SQL/read adapters and fake sign-in, using the existing app's injection
  points. Weather and prices use recordings; production entry points are untouched.
- `backend/tools/seed/`: 20 deterministic players, all four kits, both crew modes
  in all three states, ledger history, seven replay bases and 20 initial positions.
  Transaction/advisory lock and fixed refs make repeat seeding idempotent.
  `--reset` replaces demo accounts and restarts scratch market bases.
- A strict explicit `--scratch` / local-destination / database-identity guard;
  no `.env` discovery, inherited libpq destinations or real service credentials.
- `docs/DEVELOPING.md`: prerequisites, commands, troubleshooting, limits and safety boundary.
- Tests remain within `backend/tools/seed/tests/`; no dependency/lockfile changes.

## Verified

On Linux with Python 3.12.14, Node 24.22.1, uv 0.13.5 and pgserver's Postgres 16.2:

- `cd backend && uv run --frozen --with pgserver --with 'psycopg[binary]' pytest server/tests plot_twist/tests tools/seed/tests -q`:
  **3,119 passed** (3,100 existing + 19 new), 23.23 seconds. One harmless pgserver
  `XDG_RUNTIME_DIR` fallback warning; no skipped tests.
- `cd backend && uv run --frozen ruff check .` and
  `uv run --frozen ruff check --config pyproject.toml ../scripts/dev`: both pass.
- `cd frontend && npm test && npm run build`: 288 tests pass, build and spoiler guard pass.
- `scripts/dev/start.sh --check-migrations`: all five migrations apply in name order,
  fixtures seed, then the full chain and seed apply again. The regression test invokes
  this exact shell entry point, not a duplicate migration implementation.
- Literal `scripts/dev/start.sh`, custom ports/state directory, existing-stack reuse,
  seed CLI `--reset`, stop twice, scratch data/URL deletion, and fresh restart verified.
- Browser against the actual G22 stack, without weather/intro stubs: local player
  selection, sign-in, `/api/me` through the existing browser session, intro load and
  WebGL rendering pass; no outside requests or page errors. Browser checking caught
  and fixed the native modal dialog making the original login panel inert.
- Pattern-based secret scan of changed files: zero findings (private keys, GitHub
  tokens, Supabase secrets, AWS access ids, JWTs and credential literals).
- Independent read-only agent review: no remaining blocking findings. Review fixes
  include coherent real replay bases, reset clearing market halts, actual position
  counts, and cleanup if the startup wait is interrupted.

The cloud command sandbox prevents some proxy/loopback/Postgres operations; those
checks ran through approved command execution with the configured proxy and TLS
verification intact. No real Supabase/database connection was attempted. Commands
did not read `.env`.

## Not verified / remaining

- Islets, predictions and duels are absent from this revision's migrations. The
  seed reports them as skipped; no fictitious schema or future-package changes.
- No production Supabase Auth, Realtime or live database checks. Minimal local auth
  stand-ins and Postgres 16.2 do not establish production Postgres 17 parity.
- macOS/WSL were not exercised. Package registries are needed for first install;
  Windows requires a suitable Linux environment.
- SIGKILL/machine crashes cannot run orderly cleanup. Both HTTP services bind to
  loopback; the fake login must not be deployed or exposed through a tunnel.
- New future schema/read query forms need corresponding fixture/adapter coverage.

No files in `vercel.json`, migrations, `docs/STATUS.md`, `docs/DECISIONS.md`,
application packages or dependency declarations were changed. No PR or merge is
part of this checkpoint; push only `chore/g22-devtools`.
