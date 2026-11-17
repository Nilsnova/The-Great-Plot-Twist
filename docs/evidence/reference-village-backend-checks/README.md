# Latest integration: targeted backend checks

Responsible human: Johannes Franz Lang (`frcola`). These original coordinator
receipts cover **262 route/unit checks and 269 disposable-PostgreSQL checks**
across 26 selected files. They do **not** establish a fresh full-backend pass.
The older 536,956-pass / 303-skip result belongs to its earlier `e8d128f1`
backend tree in the [perimeter verification record](../PERIMETER-VERIFICATION.md).

Both invocations below have backend tree
`c785196095edef4f5416744b46435ab564da4e9c` and Supabase tree
`6e52a63b87028291127dbae8c344c9f49a73896d`. The different repository revisions
are kept explicit rather than rewriting the first run's source.

| Invocation | Source and exact result | Original evidence |
|---|---|---|
| Initial selected checks | `a85f4f29b895ac1fc69bc10ed1077fc1609e32f5`: `uv sync --frozen` exit 0 in 0.13 s; pytest **262 passed, 269 skipped in 25.62 s**; Ruff **All checks passed!** in 0.18 s | [Runner JSON](initial/report.json), [pytest output](initial/postgres-and-routes.log), [Ruff output](initial/ruff.log), [sync output](initial/sync.log). Pytest process wall time is 26.95 s. The SQL tests skipped because `CASE_PG_SCRATCH` was not enabled; this invocation is not PostgreSQL execution proof. |
| Explicit disposable SQL checks | `0d3589c21108d682f0c88d9698efda7d52c2301e`: `CASE_PG_SCRATCH=1`, **269 passed in 15.56 s**, zero skips | [Runner JSON](scratch-postgres/report.json), [pytest output](scratch-postgres/postgres.log). Process wall time is 16.25 s. These are the 16 selected SQL files, using cached `pgserver` / `psycopg[binary]` tooling and the existing scratch harness. |

The exact commands and selected-file lists are in the runner JSON records.
The first list has ten route/unit files and sixteen SQL files; the second reruns
only those sixteen SQL files with the explicit scratch opt-in. The 269 skipped
SQL cases are not counted as passes in the first invocation.

This scope covers the affected wave/recovery/permission/wall route contracts
and actual private SQL/HTTP behavior, including the malformed-first-finish
checkpoint guard. The guard adds a forward migration file; **no live migration
was applied**. No live account, production flag activation, deployment or PR merge
to main is represented here. Frontend and final visual results remain separate.

The [manifest](sha256.json) records exact original log/report bytes. Packaging
this evidence reran no backend command. New application source or database
changes need their own relevant checks rather than inheriting these results.
