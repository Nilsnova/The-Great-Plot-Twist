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
