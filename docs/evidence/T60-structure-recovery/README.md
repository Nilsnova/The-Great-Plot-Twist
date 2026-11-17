# T60 shared recovery integrated regression evidence

This folder records local evidence for issue #126. No live database, browser account, deployment,
feature activation or real credentials are used.

## Current integrated checkpoint

The integrated focused API, SQL and replay slice passes. It uses the latest tested T55 contract and
canonical snapshot fixtures; assertions and server limits were left intact.

**Source revisions:** T60 baseline `76c9764b`; T55 foundation `72996af7`, API revision fence
`81171490`, snapshot schema/API `941703df`, finish response `cb181055`, lifecycle/expiry SQL
`9d4d4b6c` and `14a1841f`, saved-v1 flag-off start `22026006`, mutation hooks `3b9c289e` and
`cc519114`; T56 paid repair `a4d4fe5a`; T57 replay modules `80b79c22`; T60 API/PG/replay harness
commit `5ebbd657`.

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
time and place a second wave just beyond expiry. Short real sleeps verify pause and resume behavior. No product timeouts,
assertions or server thresholds are changed. The JavaScript check imports the production snapshot
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

The narrow adapter allowlists only the local tables and RPCs needed by these calls. It does not
read environment credentials, connect to a hosted Supabase instance, or create a network client.
No screenshot is applicable because the tested slice has no browser UI path.

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
