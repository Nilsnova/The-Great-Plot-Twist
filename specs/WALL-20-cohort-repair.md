# WALL-20: paid repair admission for perimeter pieces

For Johannes Franz Lang (`frcola`), issue [#261](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/261), branch `feat/wall-20-cohort-repair`. Stacked on WALL-19; no live migration application or merge.

The current `island_structure_repair` function admits only twelve wall IDs, so a paid new perimeter piece would be excluded before the ordinary transaction rules run. Replace only that input identity guard with the shared canonical cohort helper. Preserve the full current function from `20261117030000_paid_structure_repair.sql`, including membership before receipt replay, per-instance/epoch fences, database-clock recovery settlement, exact fixed prices, immutable receipts, non-refundable repair spend, reserved-wave journal and three-use quota.

Meaningful proof is a real paid repair for first/last added IDs, a safe retry, and unchanged rejection of aliases/out-of-bound IDs, plus the existing complete repair SQL regression file. Root coordinates the one scratch verification lane. The code change is database-only, with no screenshots required. New recovery manifests/read/vector capacity remain separate required work; this guard does not complete perimeter gameplay.

Before marking Ready, Johannes must explain why the identity list is distinct from permission/health checks, why a retry must not create a second debit, and why paid repair is not a refundable build contribution. A different human reviews the current revision.

## Source boundary and current verification

The static migration preserves the latest current paid-repair transaction from `20261117030000_paid_structure_repair.sql`. A mechanical source comparison confirmed the sole function-body difference is its input identity guard: canonical wall IDs now use `island_wall_number`, while the existing tower identities are retained. The 373-line migration is isolated; focused SQL tests are 64 lines, slightly above the approximate combined source/test target because the preserved transaction is one existing indivisible function.

Source/style checks pass; actual scratch SQL execution remains coordinated by root and will be reported here when completed. The initial first/last-piece fixtures exercise actual paid repair/retry, not the construction or full-cohort rollout paths.
