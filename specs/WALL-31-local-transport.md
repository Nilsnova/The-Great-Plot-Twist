# WALL-31: truthful local perimeter transport

For Johannes Franz Lang (`frcola`), tracking [WALL-31 #293](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/293). Depends on WALL-08's policy preview; the local fake is not PostgreSQL or V1 durability evidence.

Implement owner-only between-wave enable, bounded ordered quote and atomic positioned build with exact quoted total, payer prices, per-piece contributions and immutable retry receipts. Preserve permission before receipt replay; stale ID/position intent and insufficient funds never partially purchase. New IDs remain unpositioned inventory until bought; old unpositioned single-build refuses them. Save/reload, single upgrade/repair/demolition and reset retain the selected policy and owned-piece compatibility.

One bounded fake-wall helper plus narrow fake-api hooks and focused normal/failure tests. Production routes, builder UI, world art and V1 combat durability are separate owners/proofs. Existing local waves remain a clearly labeled legacy demo until an explicit compatible local adapter is added. No new packages, env modification, live migration application or merge.

## Verified behavior

The local transport now serves enable, quote and positioned build. It retains exact ID/cell pairing, UID/quoted total/UUID island epoch, actual per-piece payer discount and investment rows. Membership is resolved before receipt replay. Reset rotates the quote epoch while preserving policy; an old committed receipt can be reconciled but never reapplies construction. Shared storage waits for the actual route result and supports timeout-after-commit injection.

Focused command from frontend:

```sh
npm test -- --maxWorkers=1 tests/island/wall-runs-fake.test.js tests/pirates/fake-api.test.js tests/island/move-mode.test.js tests/island/wall-policy-preview.test.js
```

Exact result: `Test Files 4 passed (4)`, `Tests 70 passed (70)`, `Duration 2.22s`. The independently measured 102-piece perimeter builds through four paid runs of at most 32 pieces, preserves exact coordinates and leaves 26 pieces available. Fixture source/method are recorded in `frontend/tests/fixtures/perimeter-ring.json`. This verifies local construction, not PostgreSQL concurrency or actual wave tactics.

Other cases cover malformed/overlapping drafts, price/funds/stale intent, readonly moved D060 occupancy, owner/member permissions, applied-timeout retry, per-piece 9/18 Engineer investment and 13 refund, new-ID repair/upgrade/demolition, shared reload, old single-build refusal and pending-quote-after-reset rejection.

The fake still serves legacy local waves and no V1 structure/input RPCs. The new `wallClientVersion:1` request capability is accepted without granting policy or inventing a V1 snapshot. A compatible frozen local perimeter demo remains separate. Actual UI before/after and full/build/budget/text/browser verification are coordinated by root. No production, physical phone or Safari result is claimed.

## Explain-back

I put the new construction transaction in a small fake helper instead of enlarging the existing API with another payment implementation. It validates every selected piece before changing coins or buildings. The same UID returns the old receipt, but the current island is read separately. The epoch fences a pending quote across reset. Only this local demo state is persisted; the real backend has its own SQL evidence.

1. Why does a build retry replay before checking the current quote or reset epoch?
2. Why does the pending quote need an island epoch as well as its price and positions?
3. What does the 102-piece local test prove, and what still needs PostgreSQL and actual combat evidence?
