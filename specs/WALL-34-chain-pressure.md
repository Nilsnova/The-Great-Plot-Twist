# WALL-34: real wall-run transaction pressure tests

For Johannes Franz Lang (`frcola`), issue [#305](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/305). Test-only slice on `test/wall-34-chain-pressure`, stacked on WALL-12 Draft #300 and its actual epoch-fenced transaction.

## Scope and proof

Use the existing Unix-socket PostgreSQL fixture and actual WALL-12 SQL helpers. Hold a real wallet/owner lock, observe both worker backends blocked, then release them. A concurrent duplicate UID must create one batch and one immutable receipt; competing permitted payers with different stale intents must produce one complete run and one refusal, with only one total spend.

Also exercise the maximum UID64, canonical `wall_128`, a complete 32-piece batch and the bound beyond it; a currently authorized different-island UID conflict; pre-existing transaction-local authority restored after success and injected second-item failure. Workers have bounded deadlines, exceptions are surfaced, and all committed fake records/connections are cleaned up even when a test fails.

This changes only the new pressure test module and this spec. Terrain, unlocks and final layout validation remain in the trusted server and its own checks. No production SQL is changed or applied, no feature is activated, and no merge is authorized. Exact real execution results follow after the coordinated run.

## Explain-back

1. Why does observing actual database lock waits prove more than starting two threads?
2. Why does a duplicate UID return a receipt while a different stale intent must refuse?
3. How does restoring the previous authority context protect later work in the same transaction?
