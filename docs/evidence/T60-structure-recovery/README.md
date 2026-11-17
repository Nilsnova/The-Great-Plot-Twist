# T60 shared recovery integration evidence

This folder records local evidence for issue #126. It is not a claim that the integrated
feature is complete. No live database, browser account, deployment or feature activation is
used by the checks here.

## Current checkpoint

**Source revisions:** T60 baseline `76c9764b`; T55 recovery-state/API foundation `72996af7`;
T56 paid repair `457621d2`; integrated branch `a5135fb9`.

**Command** (from `backend/`):

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_schema_sql.py \
  server/tests/island_sql/test_structure_repair_sql.py \
  server/tests/island_sql/test_structure_recovery_http_pg.py
```

**Result:** 45 passed in 14.37 seconds. The existing opt-in `case_sql` fixture started a private
Unix-socket PostgreSQL instance under pytest's temporary directory, applied the repository's
full migration chain twice, and removed the instance after the session. The tests exercised the
recovery schema and paid-repair SQL, including atomic wallet/HP/quota changes, UID retries,
shared use limits and concurrent transactions. The added HTTP test seeded a synthetic owner and
member, authenticated the member through a fake login verifier, read the shared canonical state
through the real FastAPI route, sent a paid repair through the real route and SQL RPC, and matched
its receipt to committed HP, wallet, quota and journal rows. The reservation itself was seeded
through the existing SQL test helper, so this does not yet verify the accepted-bell HTTP path or
finish endpoint.

**Flags and seed:** SQL tests use fixed synthetic UUIDs in
`backend/server/tests/island_sql/test_structure_repair_sql.py`; no app feature flag is set by
this SQL-only command. No secrets or external connection strings are read.

**Limits:** accepted bell lifecycle, canonical finish, multi-client API reads and production
JavaScript journal replay have not yet been verified by this checkpoint. It does not capture UI
screenshots because this slice has no browser UI path. The current branch does not claim those
acceptance checks.

**Harness corrections:** the first HTTP attempt exposed that the local adapter needed to convert
PostgreSQL UUID values to the string shape Supabase returns. A second assertion initially read an
event `type` from the payload even though the persisted schema stores it in `event_kind`; both
were corrected from the observed database/API response, with no product assertion or timeout
relaxed. The final combined command above passes.

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
