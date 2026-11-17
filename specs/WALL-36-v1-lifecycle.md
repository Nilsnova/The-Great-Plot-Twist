# WALL-36: composed perimeter recovery and value lifecycle

For Johannes Franz Lang (`frcola`), issue [#311](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/311). This is a test-only composed lifecycle slice on the current perimeter integration source; no production SQL edits, live application or merge.

Reuse the real old-template `seed_v1` fixture with an existing damaged wall. Admit perimeter policy, use the production quote helper and actual paid positioned transaction for remaining original pieces and first added walls13/14 before another wave. Assert immediate new health, distinct instances, exact per-piece references, unchanged historical template and controlled-rate old health without action-induced healing.

Then use the actual upgrade, paid-repair and demolition/refund functions on that purchased instance. Prices and unlock context come from the current authoritative catalogue/quote, including ordinary and Engineer cases; repair spend remains non-refundable. Historical construction/repair receipts must not reconstruct or heal a replacement after demolition/rebuild.

Own only the new SQL test file and this spec. Root coordinates the one disposable PostgreSQL lane and remaining original demolition/API checks. Exact executed results follow after the integrated source is available. The old immutable fixture is declared synthetic state, not live player progress.

Explain-back: why separately passing construction/recovery tests are insufficient; why repair is not build value; why historical receipts cannot mutate replacement instances. Author rehearsal and different-human review remain required.

## Prepared cases and current status

Three cases are implemented: ordinary and Engineer value lifecycles, plus historical construction/repair receipts against a replacement. The test uses actual current server quotes for both original and added-piece construction, current catalogue upgrade pricing/unlocks, and the undiscounted fixed paid-repair price. No added building is manually inserted. The 302-line test remains one composed lifecycle boundary under the usual review limit; the extra source makes its setup and money/health/identity assertions explicit.

Ruff check/format, Python compilation and `git diff --check` pass. Actual SQL execution is pending root's aggregate verification lane on the stated integration source; test presence does not establish a runtime pass.
