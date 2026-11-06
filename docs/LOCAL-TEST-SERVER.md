# Disposable local API for browser work (R1)

Run this one command from `backend/` after `uv sync`:

```sh
LOCAL_TEST_SERVER=1 APP_ENV=local uv run --with pgserver --with 'psycopg[binary]' python -m tools.local_server
```

The API listens on `http://127.0.0.1:8000`; the Vite browser server can keep using its existing
`/api` proxy. It runs one process without reload or workers. Stop it with Ctrl-C: shutdown
stops PostgreSQL and deletes its temporary directory, including all test accounts and progress.
Every fresh launch starts empty. The two extra packages are temporary uv tools; manifests and
lockfiles do not change.

All three startup guards are mandatory: `LOCAL_TEST_SERVER` must be exactly `1`, `APP_ENV`
must be exactly `local`, and the `VERCEL` variable must be absent (even an empty value refuses
startup). Preview and production refuse the factory and CLI before creating a database. This
tool constructs empty-credential settings directly and never loads Supabase configuration or
an env file. It only connects to its newly created PostgreSQL Unix socket.

The local database executes the repository's full sorted migration chain twice. The real
signup trigger seeds four disposable users; regular API code runs the actual story referee,
wallet grants, crew/islet functions and all four minimum case phases. It does not import tests or scripted
database fakes. The local SQL adapter allows only the currently used tables, functions and
explicit embedded relations; unsupported operations fail closed. There is no network fallback.

Get a fixture token through the local-only route:

```sh
curl -s http://127.0.0.1:8000/api/local/sign-in \
  -H 'Content-Type: application/json' -d '{"player":"host"}'
```

The player names are `host`, `friend`, `other` and `fourth`. The response gives `accessToken`,
`playerId` and `isHost`; only `host` may use host routes. Send the returned token as
`Authorization: Bearer <accessToken>` to ordinary `/api` routes. These deliberately public
fixture tokens are accepted only by this tool. Unknown players/tokens and deleted players
receive 401; other players receive 403 from host routes. The normal app never exposes this
sign-in endpoint. The frontend's production `sign_in` feature flag remains off.

The opt-in API proof uses the same factory and real database:

```sh
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest server/tests/test_local_server_pg.py server/tests/test_local_case_playthrough_pg.py --tb=no -q
```

It checks all four logins, host restrictions, the story/coin grant and retry, crew creation,
joining and muster, isolated player reads, case opening/search/action UID retry/host clock,
account deletion and database directory removal. A second real API check covers L2 building,
retry, player isolation and deletion after applying the expanded A4/L2 migration chain twice.
Ordinary startup-guard tests run without the
optional database packages. Use `--tb=no` on case tests to avoid printing protected prose.

The adapter supports the board/night embeds, bounded signal and order history, player-scoped old receipts, public world/Wall reads and all seven new board/finale/NPC intent functions. Its reads use a single repeatable-read transaction, including batched station ownership. The full case proof uses ordinary HTTP routes and host clock moves over disposable PostgreSQL; production-rule planner checks separately cover all 69 kit mixes.

`DEMO_MODE` is true, the case flag is on, the `bulletin` and `sign_in` flags are off, and `RELIGHT_OPEN` is false. Local solves pay and reveal normally while keeping the public world dark. R2 security headers are on main; external sign-in activation still requires the browser callback checks. The regular app continues to exclude fixture sign-in.
