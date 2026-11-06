# Run the game locally with disposable demo data

G22 provides a local development stack: the existing browser game and FastAPI routes,
a scratch Postgres, and a public fake sign-in. It never reads `.env`, needs no real keys,
and never connects to the team's Supabase project. Production startup is unchanged.

## 1. Install the prerequisites

Use Linux or macOS with Bash, Python 3.12, [uv](https://docs.astral.sh/uv/), and a Node
version supported by `frontend/package.json` (Node 24 works). On Windows, use a Linux
environment such as WSL. Run the commands below from the repository root.

No Docker, Supabase CLI or system Postgres is required. The first run needs access to
the npm and Python package registries. The launcher installs frontend packages with
`npm ci` and uses the locked backend project through `uv run --frozen`. The extra
`pgserver` and `psycopg[binary]` tools are supplied only through `uv run --with` in uv's
cache; they are not added to the app's dependencies or lockfile. Keep normal TLS and
package integrity verification enabled.

## 2. Start everything

```bash
scripts/dev/start.sh
```

The command returns after the API, Vite and API proxy answer readiness requests. It
prints the game address (normally port 5173), API docs address (normally port 8000),
log path, and the path of a file containing **only the generated local database URL**.
Open the printed game address. Use **Scratch demo player → Test sign in** to choose
one of the 20 fake players. The panel confirms the player's name and demo coin balance.
The normal New game / Continue / tour controls work as before. The panel sets the
existing browser session in memory; refreshing clears the login. No GitHub round trip
is involved. API clients may use the public scratch-only three-part tokens
`Authorization: Bearer g22.dev-player-01.scratch` through `g22.dev-player-20.scratch`,
or exchange a code such as `dev-player-01` at `/api/auth/exchange`. These are dummy
local identities accepted only by the injected local verifier, never real login tokens.

On each new start, the launcher:

1. Checks the requested ports without stopping any other service.
2. Installs the locked frontend dependencies.
3. Starts a Unix-socket-only Postgres owned by its supervisor.
4. Adds minimal Supabase roles and `auth.users` / `auth.uid()` stand-ins, then applies
   **every** `supabase/migrations/*.sql` file in filename order, without editing SQL.
5. Seeds the database and starts the real FastAPI routes with explicit local settings,
   local login/database adapters, recorded weather and replay island market prices.
6. Starts Vite with a separate dev configuration that disables `.env` loading and
   injects the test-login panel. The market feature is enabled; other flags keep their defaults.

An already running stack for this checkout is reused. Its database and services remain
alive after `start.sh` returns; the supervisor owns them until stopped. State lives in
a checkout-specific directory below the OS temporary directory, outside Git.

To use different ports or a separate state directory:

```bash
scripts/dev/start.sh --api-port 8001 --web-port 5174 --state-dir /tmp/plot-twist-my-demo
scripts/dev/stop.sh --state-dir /tmp/plot-twist-my-demo
```

Use the same `--state-dir` when stopping. A short absolute path avoids Unix socket path
length limits. Different checkouts have different default state directories.

## 3. Inspect or reseed the scratch database

The initial seed includes:

- 20 fake players with deterministic ids, generated demo names and all four entry kits.
- Six crews: both solo and crew modes in each existing state, `forming`, `active`, and
  `finished`; active/finished crews include NPC partners. Codes are `G22AAA` to `G22AAF`.
- A coherent wallet ledger (kit grant, event reward, clue purchase, exchange stake and fee).
- Twenty initial rising replay positions in island companies and their real SQL exchange events.

**Islets, predictions and duels have tables but are deliberately not pre-seeded.**
Case, festival and sports stay disabled: this launcher makes no shared-world writes or
provider requests. Stock companies show unavailable prices in replay mode; the recording
contains only island prices. Players 13–20 initially have no crew,
so they are useful for exercising create/join/start.

To run the seed again, substitute the **database URL file path printed by start.sh**:

```bash
cd backend
uv run --frozen --no-env-file --with pgserver --with 'psycopg[binary]' \
  python -m tools.seed --scratch --database-url "$(cat /tmp/REPLACE-WITH-PRINTED-PATH/database-url)"
```

Without `--reset`, repeating the same seed does not duplicate users, crews, grants or
positions. Existing fixed exchange references are preserved; the position count reports what
is currently held, so sold positions are not silently bought again.

Append `--reset` to replace the G22 demo users and crews, including their cascaded
progress and ledger rows, and create their replay positions again at current recorded
prices. Shared world state and other players' exchange positions are not reset.
Other users are not deleted. Crews owned by a deleted demo player are removed by
the existing database cascade. Reset affects only this disposable database.

The seed requires **both** an explicit `--scratch` and a connection naming a Unix socket
or literal localhost (`localhost`, `127.0.0.1`, `::1`). It rejects omitted hosts,
remote hosts, multi-host lists, URI service/hostaddr/password-file overrides, and
inherited nonempty `PG*` variables. The target must also contain the G22 scratch identity
created by the launcher. A local production database is not a supported target.
It never discovers a URL through `DATABASE_URL`, `.env`, Supabase settings, or a service file.
Do not pass a real database URL. No secret values are needed.

## 4. Stop and remove the scratch data

```bash
scripts/dev/stop.sh
```

This requests shutdown through this checkout's private control socket. It stops Vite,
FastAPI and Postgres and deletes Postgres data and the generated URL file. Logs remain
for troubleshooting. Running stop again is harmless. Starting again creates a fresh
database. The script never kills an unrelated process merely because it owns a port.

## 5. Run the checks

From the repository root, the exact launcher migration path can be exercised alone:

```bash
scripts/dev/start.sh --check-migrations
```

It creates a separate scratch database, applies the entire migration chain, seeds it,
then applies the chain and seeds again. It reports `migrationPasses: 2` and deletes its
database. It does not start Vite or interfere with a running development stack.

Run the backend gate plus G22's safety and integration tests:

```bash
cd backend
uv run --frozen --no-env-file --with pgserver --with 'psycopg[binary]' \
  pytest server/tests plot_twist/tests tools/seed/tests
uv run --frozen --no-env-file ruff check .
uv run --frozen --no-env-file ruff check --config pyproject.toml ../scripts/dev
```

The G22 tests include executing `start.sh --check-migrations`, rejecting unsafe URLs
before connecting, preserving unrelated users during reset, ledger consistency,
and fake sign-in / save / crew / market actions against real scratch SQL functions.
The ordinary `uv run pytest` testpaths do not include `tools/seed/tests`; use the command
above for G22 coverage. Keep Node on PATH for the Python/JavaScript parity checks.
The normal frontend checks remain `cd frontend && npm test && npm run build`.
For the imported G20 native-browser components and G22 serve-only boundary, use
`npm test -- tests/g20-*.test.js tests/g22-local-config.test.js --maxWorkers=2`.
This bounds simultaneous Chromium instances on small development machines; the tests
still exercise the real DOM and block all nonlocal traffic.
With a local stack already running, `node frontend/scripts/check-local-dev.js http://127.0.0.1:5173`
checks the injected panel, dummy sign-in, own portfolio and disabled sports/festival flags.
It accepts only a plain loopback HTTP address and performs no stake or trade POST.

## Troubleshooting and limits

- **Port busy:** choose `--api-port` / `--web-port`, or stop the service you started yourself.
  `start.sh` will not take over another server's port.
- **Startup failed:** inspect the printed `dev.log`. The supervisor cleans up its children
  on normal stop, startup failure, SIGTERM and SIGINT. If the host forcibly kills it
  (SIGKILL or a machine crash), orderly cleanup cannot run; use a new state directory
  and inspect the old one before removing any leftover processes/data.
- **pgserver wheel unavailable:** use a supported Linux/macOS Python 3.12 environment.
  The wheel used during G22 validation bundles Postgres 16.2. Production Supabase uses
  Postgres 17; this stub is a local development harness, not a full Supabase installation
  or proof of production Auth/Realtime/RLS integration behavior.
- **`PG*` refusal from the seed CLI:** unset libpq environment variables in that shell.
  The launcher already strips these, application configuration and exported `VITE_`
  settings from its children. Do not source a real `.env` to fix local setup.
- **Package/proxy permission error:** retain the platform proxy and request the command
  permissions required by your environment. Never disable TLS or package checksums.
- **A demo player was deleted or fixtures changed:** run the seed with `--reset`, or stop
  and start for a completely new scratch database. Gameplay writes survive only until stop.
- **Missing future UI/features:** the launcher runs the game and routes present on this
  branch. It does not implement unmerged gameplay packages. The local database adapter
  supports the current stores' read/filter/join forms and calls the real migrated functions
  as `service_role`; it does not emulate the entire PostgREST protocol.
- **Safety boundary:** test identities and dev routes are deliberately public and unauthenticated.
  Both HTTP services bind only to loopback. Do not deploy, tunnel or expose this launcher.
  Production `backend/main.py`, Vercel configuration and the normal Vite configuration
  never import these adapters or inject the login panel. The separate G22 Vite configuration
  refuses build and preview commands; the injected script also checks DEV mode and a loopback host.
