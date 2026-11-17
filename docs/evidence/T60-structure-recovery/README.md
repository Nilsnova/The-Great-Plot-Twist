# T60 shared recovery integrated regression evidence

This folder records local evidence for issue #126. No live database, browser account, deployment,
feature activation or real credentials are used.

## Current integrated checkpoint

The integrated focused API, SQL and replay slice passes. It uses the latest tested T55 contract and
canonical snapshot fixtures; assertions and server limits were left intact.

**Source revisions:** T60 baseline `76c9764b`; T55 foundation `72996af7`, API revision fence
`81171490`, snapshot schema/API `941703df`, finish response `cb181055`, lifecycle/expiry SQL
`9d4d4b6c` and `14a1841f`, saved-v1 flag-off start `22026006`, canonical mutation fixtures
`f16a46a1` and `0dbfcae5`, mutation hooks `3b9c289e` and `cc519114`; T56 paid repair `a4d4fe5a`;
T57 replay modules `80b79c22`; T55 contract notes `704f7ea5`; T60 API/PG/replay harness base commit
`5ebbd657` with expiry/flag-off coverage and release docs in `825d2c56` and `9e2e55b8`.

**Strict API/replay command** (from `backend/`):

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_http_pg.py
```

**Result:** 1 passed in 9.09 seconds. It applies the full repository migration chain twice to the
existing disposable Unix-socket PostgreSQL fixture. A synthetic owner and member authenticate
through a fake verifier; actual FastAPI route services call the local SupabaseAdmin adapter over
the same scratch connection used by the fixture. Local flags are `islands,structure_recovery`.

The route sequence starts a v1 wave, joins the member, reads the owner’s current wave, and checks
that structure HP stays fixed through preparation and combat. It confirms a health checkpoint is
rejected before the paid event is sealed, pays one repair through the actual route, reads the sealed
journal page, accepts a checkpoint, and runs the unmodified production `recovery-snapshot.js` and
`wave-replay.js` modules in two independent Node replay consumers. After a later sealed tick, it
submits damage, retries the old repair UID and verifies the immutable original receipt, unchanged
wallet/use count, and no healing. It finishes through the API with canonical closed HP of 750,000,
checks between-wave healing resumes, then disables new-v1 admission and verifies the saved v1 island
can start another protocol-2 wave with a fresh three-use quota. A stale paid quote after the second
wave expires settles the wave without charge; its later API finish returns zero loot and the same
closed HP, with no owner credit.

Only disposable timestamps are moved to put the synthetic wave into combat, cross the minimum finish
time and place a second wave just beyond expiry. Short real sleeps verify pause and resume behavior.
No product timeouts, assertions or server thresholds are changed. The JavaScript check imports the production snapshot
and replay modules directly; it does not run the browser or the T59 authenticated frontend transport.
The HTTP path repairs one wall. Broader SQL regressions exercise the other paid quota, old-UID,
final-slot race and mutation cases.

**Combined focused SQL/API command** (from `backend/`):

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_api_sql.py \
  server/tests/island_sql/test_structure_recovery_mutations_sql.py \
  server/tests/island_sql/test_structure_recovery_schema_sql.py \
  server/tests/island_sql/test_structure_repair_sql.py \
  server/tests/island_sql/test_structure_recovery_http_pg.py
```

**Result:** 71 passed in 14.42 seconds. The suite includes lifecycle/checkpoint/finish SQL, the full
mutation hook slice, schema and paid repair suites, and the actual API/replay integration case above.

**Full island SQL sweep:** the complete `server/tests/island_sql` folder passed 367 tests in 33.98
seconds on code commit `fafd000f`. Later commits through this evidence update change documentation
only; no SQL or API code changed after that sweep.

**Focused Python route/transport command** (from `backend/`):

```bash
uv run --frozen pytest -q server/tests/test_wave_recovery_routes.py \
  server/tests/test_wave_routes.py server/tests/test_structure_recovery_routes.py \
  server/tests/test_wave_recovery_transport.py server/tests/test_structure_repair_routes.py \
  server/tests/test_structure_recovery_manifest.py server/tests/test_captain_skills_routes.py
```

**Result:** 138 passed in 15.75 seconds. These are request/model/transport tests with local fakes;
the actual API-to-Postgres path is the dedicated HTTP fixture above.

The narrow adapter allowlists only the local tables and RPCs needed by these calls. It does not
read environment credentials, connect to a hosted Supabase instance, or create a network client.
No screenshot is applicable because the tested slice has no browser UI path.

**Known compatibility limit outside this fixture:** on a saved v1 island, a built `cannon_8` or
`culverin` may be filtered from the snapshot template when `more_tower_spots` or `defenses_v2` is
off. The database then rejects the incomplete snapshot with `recovery_snapshot_structure_mismatch`;
it does not silently omit the built structure. This fixture uses one wall and does not prove that
flag combination. The all-built D060 capability behavior remains T55 work.

For separate deterministic simulator-only repair balance coverage, see the
[T57 diagnostic report](../T57-wave-recovery/README.md); it does not prove API, SQL or multiplayer
authority.

## Journal volume and retention diagnostic

The bounded diagnostic uses the real `recovery_wave_join`, `recovery_wave_inputs` and
`recovery_wave_events_page` PostgreSQL functions from the disposable local Unix-socket fixture.
Four synthetic clients each append 2,500 commands (10,000 total) in valid batches of up to 32;
three participant-join events bring the fixed journal head to 10,003. It then drains that captured
head in 40 pages of at most 256 events, checking sequence continuity and an unchanged sealed-tick
watermark.

**Source:** `backend/server/tests/island_sql/test_structure_recovery_journal_budget_sql.py`, using
`20261117020000_structure_recovery.sql` and `20261117040000_structure_recovery_api.sql`.

**Reproduce (from `backend/`):**

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_journal_budget_sql.py
```

To explicitly regenerate `journal-budget.json`, run the same command with
`WRITE_RECOVERY_DIAGNOSTIC=1`. Regular test runs do not write artifacts.

**Measured result:** 1 passed. PostgreSQL 16.2 stored 2,840,450 bytes of JSON payload columns and
4,120,768 bytes of event tuples for this wave. The scratch database reported 4,317,184 bytes for the
event table and 6,397,952 bytes for the table plus indexes/TOAST. The three named event indexes
reported 2,048,000 bytes; the fixed head was 10,003. In this run, mean page time was 4.364 ms
(maximum 7.675 ms); mean batch RPC time was 5.030 ms (p95 6.921 ms). These in-process timings
exclude network latency. Relation and index sizes are global scratch-database allocated bytes, not
isolated per-wave index attribution. The full measured record is in
[journal-budget.json](journal-budget.json).

At one command per client for each assumed 4 Hz request over the 900-second maximum wave, the
representative volume is 14,400 input events. A full 32-command batch at that same request rate
would be 460,800 events. This is an arithmetic scenario, not a server-enforced bound: the current
API has no request-rate limiter. The migrations keep the event journal append-only; there is no
automatic journal cleanup or retention cap. Wave-history growth therefore has no measured
production budget or retention policy yet. This local diagnostic does not establish production
capacity, and activation should wait for an explicit operating-budget and retention decision.

## Lifecycle draft probe

Before the SQL owner committed the lifecycle work, I copied read-only draft snapshots into the
working tree as temporary untracked test inputs. Their source SHA-256 hashes were:

- `20261117025000_legacy_wave_locks.sql`: `2572253fbb3b7cc09381719a897eb8b8970cabd984c184139611c7f62e105009`
- `20261117040000_structure_recovery_api.sql`: `8e9f3604e35388a0d1157719a3e4ae748f1e54a29145177bb8c6afbf85088d23`
- `test_structure_recovery_api_sql.py`: `fce6122918525682fae1bee2b05c6234ffca6955727e8597c3fc773a86eb6149`

The command used was:

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_api_sql.py \
  server/tests/island_sql/test_structure_recovery_http_pg.py \
  server/tests/island_sql/test_structure_recovery_schema_sql.py \
  server/tests/island_sql/test_structure_repair_sql.py
```

**Result:** 51 passed, 4 failed. Two failures exposed that new protocol-2 join responses omitted
`lastActorCounter: 0` and that the new join RPC fell through to the legacy `wave_join` client
version guard, returning `client_update_required` for a member. The HTTP test confirmed the same
join failure after a real v2 start. The schema test found the draft granted `service_role` direct
`UPDATE` on `recovery_wave_participants`, contrary to the foundation's explicit privilege check.
The remaining finish test also refused the participant join. These were reported to the SQL
owners; no assertion was changed. This draft probe is diagnostic evidence only and is not counted
as a passing lifecycle check.
