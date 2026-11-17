# WALL-12: atomic positioned wall construction

For Johannes Franz Lang (`frcola`), issue #253. One service-only transaction checks current access, original retry intent, trusted policy, complete layout, eligible identities and current quoted price context before charging all selected pieces. Coordinates, per-piece building refs/payments, recovery instances and one immutable run receipt commit together. No partial paid run is possible.

The original UID and ordered placements plus quotedTotal identify a retry. Receipt replay checks current membership before disclosing the past result and never recreates/heals/refunds a reset or rebuilt piece. Current island state is returned separately. New offers can pause while reconciliation remains available.

Plan: private receipt table/read; wallet-before-owner locks and scope/UID replay guards; policy/raw-layout and price-context fences; whole-run funds/identity checks; positioned per-piece ledger/build/contribution inserts under transaction-local authority; recovery refresh at one DB instant; real private SQL payment/retry/refusal/lifecycle/concurrency tests. Existing migration/schema rules remain strict. This draft does not apply migrations, activate flags or merge.

Explain-back: why each piece has a separate payment reference; why an old receipt is not current island state; how all-or-none construction handles a lost reply.
