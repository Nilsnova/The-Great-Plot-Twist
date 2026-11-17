# WALL-20: paid repair admission for perimeter pieces

For Johannes Franz Lang (`frcola`), issue [#261](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/261), branch `feat/wall-20-cohort-repair`. Stacked on WALL-19; no live migration application or merge.

The current `island_structure_repair` function admits only twelve wall IDs, so a paid new perimeter piece would be excluded before the ordinary transaction rules run. Replace only that input identity guard with the shared canonical cohort helper. Preserve the full current function from `20261117030000_paid_structure_repair.sql`, including membership before receipt replay, per-instance/epoch fences, database-clock recovery settlement, exact fixed prices, immutable receipts, non-refundable repair spend, reserved-wave journal and three-use quota.

Meaningful proof is a real paid repair for first/last added IDs, a safe retry, and unchanged rejection of aliases/out-of-bound IDs, plus the existing complete repair SQL regression file. Root coordinates the one scratch verification lane. The code change is database-only, with no screenshots required. New recovery manifests/read/vector capacity remain separate required work; this guard does not complete perimeter gameplay.

Before marking Ready, Johannes must explain why the identity list is distinct from permission/health checks, why a retry must not create a second debit, and why paid repair is not a refundable build contribution. A different human reviews the current revision.

## Source boundary and current verification

The static migration preserves the latest current paid-repair transaction from `20261117030000_paid_structure_repair.sql`. A mechanical source comparison confirmed the sole function-body difference is its input identity guard: canonical wall IDs now use `island_wall_number`, while the existing tower identities are retained. The 373-line migration is isolated; focused SQL tests are 68 lines, slightly above the approximate combined source/test target because the preserved transaction is one existing indivisible function.

Source/style checks pass. The first/last-piece fixtures exercise actual paid repair/retry; construction and rollout remain separate. The completed coordinated SQL evidence is below.

## Executed verification and handover

The private integrated run returned **`265 passed in 14.00s`**, exit **0**, on epoch-fenced WALL-12 source `f339235d` plus the WALL-34 pressure tests. This branch's repair migration and focused tests were independently compared byte-for-byte with that tested source and match. The selected run includes actual new first/last-piece repair and retry, malformed IDs, the existing paid-repair regression file, contribution/refund boundaries, recovery mutations, policy/layout and real concurrent wall construction.

[Exact executed command and evidence limits](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/1ddf3712d713b409e43fc7e0065488a1cbc0fafd/specs/WALL-34-chain-pressure.md). Python compilation, Ruff check/format and diff checks also pass. No live database was used or feature activated.

**Changed:** canonical perimeter-ID admission in the existing paid-repair transaction. **Verified:** source-identical private SQL behavior and preserved current transaction regressions. **Not verified:** complete game/UI/production rollout. **Remaining:** author explain-back and independent human review. **Branch/PR:** `feat/wall-20-cohort-repair`, [Draft #283](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/283); no merge.
