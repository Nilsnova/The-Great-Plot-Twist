# VIS68: fresh ordinary wall purchases honor scenery clearance

Responsible human: **Johannes Franz Lang (`frcola`)**.
Issue: [#454](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/454).
Branch: `fix/vis-68-wall-build-guard`.
Base: `c4ea1b633346cde8ef5f4524a625338b6033dfc8`.

## Scope claimed before implementation

Close the fresh normal-purchase path for original `wall_1` through `wall_12` on
own and shared islands under both supported wall policies. Already-built walls,
old-save reads, prices, upgrade rules and original action receipt replay remain
unchanged. A preflight check alone is insufficient: the paid transaction must
fence the exact layout/policy that was validated, or validate under the same lock.

Frontend fake parity will be delivered first so the coordinator can freeze the
visual candidate. Any required SQL is an additive migration for disposable local
verification and later owner review only; no live application is authorized.

Implementation, exact tests-first results and source/transaction evidence will
be recorded here. No passing result is claimed yet. Keep Draft; no merge.
