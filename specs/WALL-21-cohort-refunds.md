# WALL-21: perimeter demolition, refunds and safe receipt replay

For Johannes Franz Lang (`frcola`), issue [#262](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/262), branch `feat/wall-21-cohort-refunds`. Stacked on WALL-20/WALL-19; no live migration application or merge.

Admit the selected wall cohort in the latest quote (`20261117010000`) and current mutation (`20261117050000`) functions. Preserve per-payer rounded refunds, contribution/receipt records, lock order, recovery begin/finish hooks and the new inventory-coordinate deletion trigger.

The current mutation returns old receipts before checking membership or owner/plot intent. Harden that replay: current access precedes disclosure; the cached path takes the owner lock and rechecks membership, while fresh operations retain wallet-before-owner ordering. Both cached branches reject a UID reused for another island or plot. No old receipt deletes, rebuilds or refunds a newer instance.

Evidence uses actual scratch SQL: new boundary IDs quote/refund/retry, old receipt after rebuild, no second refund, ex-member rejection and cross-island/plot UID conflicts. Existing demolition and recovery-mutation tests remain required. Root owns the new `action_uid_conflict` Python error mapping and coordinated SQL lane. No UI screenshots apply to this database slice.

Explain-back: Why are refunds split by payer? Why does a previously valid receipt not authorize a former member? Why does replay leave a replacement building untouched? A different human must review the current draft before release.

## Implemented boundary

The static migration is 288 lines: the current quote and final recovery-aware mutation with bounded identity admission, current permission before cached disclosure, an owner lock on the read-only replay path, and owner/plot intent checks on both replay returns. Fresh mutations keep their original wallet lock order and exact refund/recovery operations. The focused test file is 133 lines, slightly above the approximate combined target because the current two functions form one refund lifecycle boundary.

Ruff check/format, Python test compilation and `git diff --check` pass. Actual PostgreSQL execution remains pending the root-coordinated integrated lane. No runtime pass is inferred from source comparison or test presence.
