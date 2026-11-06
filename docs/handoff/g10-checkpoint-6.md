# G10 checkpoint 6: group 3 integration, 6 Nov 2026

Codex built this for Nils; Claude reviews, applies database changes and controls main.

- Branch: `integrate/group3`, based on group 2 at `60f7fd0`.
- Merge commits: Exchange v2 `2bd172a`, prediction desk `bb1ab13`, Lantern Duels `b88fcb4`.
- Feature refs merged in order: `4d5aa5b`, `e90a620`, `8af962b`, each with `--no-ff`.
- Ported the read-only bulletin to the v2 snapshot API, kept all services keyword-only and removed duplicate host readers.
- Wallet vocabulary is exactly 17 ordered pairs; fixed the market slice and relative arena-order tests.
- Kept lazy panel dispatch, restored every blocking predicate and made duel teardown remove its dialog.
- Recorded D025/D026, the 20-position limit and no extra reserve; corrected cumulative schema and route contracts.
- Backend: `uv run --locked pytest -q --tb=no`: `9693 passed, 3 skipped in 101.54s`.
- Those three optional PostgreSQL checks ran separately: `3 passed in 2.73s`.
- SQL runner: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/group3_sql`.
- The complete ten-file group 3 chain applied twice on disposable Unix-socket PostgreSQL and was deleted afterwards.
- Verified schema: 18 tables with RLS, one view, 16 public policies, five Realtime policies, 17 wallet reasons and 24 public functions.
- Ruff: `All checks passed!`; formatting: `99 files already formatted`; diff check and required secret-pattern scan passed.
- Frontend: `1601 passed`, 99 files; production build passed, including 110 text files, 12 protected lines and no elimination data.
- Chromium checks: production 7, world 66, lifecycle 9; all passed. Three local panels also opened and closed with Escape.
- [Verification JSON and three panel screenshots](../../frontend/captures/20261106_G10-Group3/) total about 407 KB.
- OpenAPI exposes 33 unique operations and operation ids.
- `090000_exchange_leverage.sql` MD5: `2466eed8daf719b18806b56ca5309ac3`.
- `100000_prediction_desk.sql` MD5: `97c8a006598c8c1b7c7f1ff0f23d7613`.
- `110000_lantern_duels.sql` MD5: `af6f9038f00ccff1550aad2501b08ce4`.
- All ten migrations retain their reviewed bytes; STATUS, Vercel configuration, dependency manifests and lockfiles match the group 2 base.
- No live Supabase connection, migration application, Actions trigger, main push or production flag change occurred.
- Claude's next step: review the branch and protected hashes, apply the three migrations, then deploy through main and run live checks.
- Case phases remain on their separate branch; the counts above describe group 3 before case migrations. No integration question remains open.
