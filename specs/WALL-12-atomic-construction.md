# WALL-12: atomic positioned wall construction

For Johannes Franz Lang (`frcola`), issue #253. One service-only transaction checks current access, original retry intent, trusted policy, complete layout, eligible identities and current quoted price context before charging all selected pieces. Coordinates, per-piece building refs/payments, recovery instances and one immutable run receipt commit together. No partial paid run is possible.

The original UID and ordered placements plus quotedTotal identify a retry. Receipt replay checks current membership before disclosing the past result and never recreates/heals/refunds a reset or rebuilt piece. Current island state is returned separately. New offers can pause while reconciliation remains available.

Plan: private receipt table/read; wallet-before-owner locks and scope/UID replay guards; policy/raw-layout and price-context fences; whole-run funds/identity checks; positioned per-piece ledger/build/contribution inserts under transaction-local authority; recovery refresh at one DB instant; real private SQL payment/retry/refusal/lifecycle/concurrency tests. Existing migration/schema rules remain strict. This draft does not apply migrations, activate flags or merge.

Explain-back: why each piece has a separate payment reference; why an old receipt is not current island state; how all-or-none construction handles a lost reply.

## Reset scope and executed checks

The quote and immutable intent include the server's `islandEpoch`. A fresh pre-reset quote refuses `quote_changed` before any debit, even if the new run has identical empty layout, role and wave. A committed original receipt is still checked first and remains historical; it cannot reconstruct the new run.

Private PostgreSQL: `CASE_PG_SCRATCH=1 UV_CACHE_DIR=/workspace/.cache/uv uv run --frozen --no-env-file --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_wall_chain_build_sql.py` from backend returned **12 passed in 3.37s**, exit 0. The migration chain runs twice. Tests cover exact piece payments/instances, stale/refused cases, membership before replay, historical receipt after reset/demolition, browser grants, and an injected second-piece failure rolling back the first payment and position. No assertion/constraint was removed to obtain this result. Separate W34 pressure tests cover real concurrent sessions and additional UID/GUC boundaries.
