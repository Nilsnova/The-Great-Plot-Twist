# Reward return and historical revival recovery

Current review corrections and results: [18 November review handover](coop-review-fixes-2026-11-18.md).
The checkpoints below retain their original source and verification scope.

English implementation and review handover for Ianno Hollensteiner and the different human reviewer.

Responsible teammate: Ianno (`Iannomh123456`), assisted by Codex. Publication uses a linear
stack based on main `db573347`, preserving its visual, projection and WebP slimming changes:

1. [Core co-op fixes #485](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/485),
   `fix/coop-wave-consistency-review`, targets `main`.
2. [Saved reward recovery #486](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/486),
   `fix/wave-return-recovery-review`, targets the core branch.
3. [Historical reconciliation #490](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/490),
   `fix/historical-revive-reconciliation-review`, targets the reward
   branch. This final slice owns the shared full-stack handover and historical evidence.

The publication worktree is `/workspace/wave-publish`. Prototype worktrees and development
commits remain preserved. The already merged VIS-41 generation fencing is retained from main;
only the remaining caller/context fixes are added. Issues [#483](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/483)
and [#484](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/484) were published after Ianno's
explicit approval. Task commits, pushes and draft publication are authorized. Different human
review, merge and any live database operation or deployment remain separate.

## Changed

1. After sign-in restoration or an online/visible return, the game recovers up to 20 saved unpaid
   closed recovery-wave results per request. It uses the original saved amount and outcome,
   even after the wave's old deadline, a membership change or travel to another island.
2. The normal late finish and the recovery route share the same settlement. Concurrent requests
   and lost responses credit the existing wallet reference once. The response always includes
   fresh wallet totals and personal saved win progress, including when the recovered list is empty.
3. The background client updates the real balance and quests without changing the current
   battle, building permissions or narration. Fresh-wallet guards cover account replacement,
   concurrent purchases and an older initial island read. Transient retries use 5/15/30-second
   delays capped at 30 seconds, or a longer Retry-After. Hidden/offline/disposed clients pause;
   successful empty scans stop until another return signal.
4. An operator tool classifies historical revival payments without writes by default. Only a
   proven missing effect in a closed, complete protocol-2 history can receive its original paid
   amount once. Successful, unlinked, unreadable, legacy, active, reset and incomplete cases
   are preserved as unresolved. No original receipt or closed journal is changed.

The decision and limits are recorded in [D067](../DECISIONS.md#d067--recover-saved-rewards-and-confirmed-missing-revival-payments--2026-11-18).
API and event contracts are in [INTERFACES](../INTERFACES.md#your-island-and-the-pirate-waves-lane-0-tasks-02-and-03).

## Review locations

| Scope | Task branch and local source | Spec |
|---|---|---|
| Reward API and SQL | `fix/reward-return-recovery`, `/workspace/wave-reward-return` | [Backend](../../specs/RETURN-reward-recovery.md) |
| Return client and wallet/quest bridge | `fix/reward-return-client`, `/workspace/wave-reward-client` | [Client](../../specs/RETURN-reward-client.md) |
| Historical operator cleanup | `fix/historical-revive-reconciliation`, `/workspace/wave-revive-history` | [Reconciliation](../../specs/RETURN-revive-reconciliation.md) |
| Combined validation and handover | `fix/wave-return-recovery`, `/workspace/wave-return-recovery` | This document |

The development-source rows above describe the original writer worktrees, not publication heads.
The [approved issue drafts](return-recovery-issue-drafts.md)
were published as [reward recovery #483](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/483)
and [historical reconciliation #484](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/484).
Automatic approval review initially rejected the actions; publication succeeded after the user
explicitly approved these two issues and their repository destination. Code review/publication
and production operations remain separate.

## Historical development verification

The following development results were recorded on main `37eb70fa` plus the combined local
candidate. They are retained as historical evidence, not current publication-head checks.

Tests were written and observed failing before implementation. Individual focused results:

- Backend API/transport: **147 passed**. Actual PostgreSQL: **38 passed**, including HTTP-to-SQL
  return with a new client, former membership, feature admission off, a lost reply, deadlines,
  exact saved amounts, concurrent recovery/finish and malformed records before a valid batch.
- Client: **95 focused / 29 surrounding passed**, followed by **12 final host tests**. These
  cover session lifetimes, unknown writes, fresh-wallet ordering, retained quest progress,
  active combat, initial read races, later purchases, lazy island creation and extended outages.
- Historical cleanup: **22 focused / 41 surrounding PostgreSQL tests passed**, including real
  read-only execution, conservative classification, two concurrent applies, rollback and grants.
- Each relevant disposable PostgreSQL fixture applied the complete migration chain twice.
- The prior fixes on the updated main base passed **58 focused frontend tests** before the new changes.

Combined `npm run build` and `node scripts/report-budget.js --check` passed. The spoiler guard
checked **245 text files / 12 protected lines**. Initial title JS is **18,959 bytes** (limit 21,080)
and CSS **9,248 bytes** (limit 12,000), with no unshipped assets in the build.

The combined backend command with opt-in SQL tools and the unchanged settings matrix excluded
finished with **13,214 passed / 7 skipped / 1 failed / 15 setup errors**, in 315.97 seconds:

```sh
cd backend
UV_CACHE_DIR=/tmp/audit-revive-uv CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q --ignore=server/tests/correctness/test_settings_contract.py
```

The 15 setup errors required the fixture's documented optional `pglast` test tool. The single
failure was a text guard that still expected the old direct revival function. That guard now
checks the renamed payment implementation and preserved Tavern discount, including future
helper replacements. No runtime source changed for this correction. The corrected checks all
passed: **21 passed**, 2.17 seconds:

```sh
cd backend
UV_CACHE_DIR=/tmp/audit-revive-uv CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/test_house_roles_match_migration.py server/tests/followups_sql
```

The broad result and corrected subset are separate evidence; no clean full backend rerun is
claimed for that development checkpoint. The unchanged settings-contract matrix was not rerun there. After formatting the updated
guard, its six tests passed again. All production source stayed unchanged during that correction.

The combined frontend suite passed **423 files / 4,655 tests** in **428.50 seconds**. Ruff checks
passed for the backend, and changed/new Python format checks passed. `git diff --check`, local
documentation link checks and the changed/new-file secret scan passed. Raw [frontend results](../evidence/return-recovery/frontend.log),
[initial backend run](../evidence/return-recovery/backend-initial.log),
[corrected backend checks](../evidence/return-recovery/backend-corrections.log),
[reward PostgreSQL checks](../evidence/return-recovery/reward-postgres.log),
[build output](../evidence/return-recovery/build.log) and
[selected budget output](../evidence/return-recovery/budget-summary.json) are retained separately.

Independent agent review found and corrected incomplete-history proof, wallet read ordering,
initial-load races and retry exhaustion, then found no remaining blocker in the merged runtime.
This does not replace different-human review.

## Historical development browser evidence

This section describes the earlier `37eb70fa` combined candidate. Publication captures and
source hashes are recorded separately below.

At 1280×720 and 375×812, real production recovery host, wallet reader, HUD, battle HUD and narrator
were exercised against a persistent synthetic loopback server. That server credits 15 coins once
and drops the first settlement response. After a full page reload, an empty recovered list still
restores fresh balance **100 → 115** and real quest state **1 → 2**. Wave 6 remains running,
with no battle finish/stop events and no narration reset. Each scenario records one synthetic
award and zero page errors. Production CSS hides the Goals strip during combat, so quest
progress is asserted from real HUD state rather than claimed visible in those screenshots.

These screenshots compare before recovery and after reload on the **same new source**, not
an unchanged-main before-fix baseline. They do not show a 3D scene or prove a live account,
production payment/refund, database deployment or physical-phone behavior.

- [Browser report](../evidence/return-recovery/report.json), [exact capture script](../evidence/return-recovery/capture-exact.mjs), [runtime hashes](../evidence/return-recovery/runtime-source-sha256.json).
- Desktop: [before](../evidence/return-recovery/before-1280x720.png), [after](../evidence/return-recovery/after-1280x720.png).
- Phone: [before](../evidence/return-recovery/before-375x812.png), [after](../evidence/return-recovery/after-375x812.png).

## Publication verification on current main

The current stack preserves main `db573347` and its WebP optimizations. The core slice passed
95 frontend tests and 552 backend/PostgreSQL checks; the reward slice passed 125 frontend tests
and 584 backend/PostgreSQL checks. Their specs link exact commands and separate logs. The
historical migration, SQL regressions and operator runner match the independently reviewed
source; agent review found no blocker and does not replace human approval.

`cd frontend && npm run build` and `node scripts/report-budget.js --check` passed. The spoiler
guard checked 245 text files / 12 protected lines. Initial title JavaScript is 18,959 bytes
(limit 21,080), CSS 9,248 bytes (limit 12,000), and no unshipped files are in the build. Logs:
[build](../evidence/return-recovery/publication/build.log),
[budget summary](../evidence/return-recovery/publication/budget-summary.json).
Backend Ruff and changed-Python format checks passed; 155 local documentation paths resolved.

Current-source Chromium checks passed at 1280×720 and 375×812. The fixture loses the first
settlement reply after one synthetic credit; a full reload returns an empty recovered list and
saved win progress, then a real wallet read restores HUD/account coins 100 → 115 and quest
state 1 → 2. Actual controller wave 6 remains active at 20 ticks with no finish/stop event,
unchanged health/ships and suppressed low-priority narration. Both scenarios have zero page errors.
The browser report records checkout HEAD `898ee21e`, the tracked diff at capture time and hashes
of the imported runtime modules. The separate 24-file runtime manifest matches the previously
reviewed implementation byte-for-byte. Subsequent publication edits only change documentation.

This compares before recovery and after reload on the same new client. It uses a persistent
synthetic loopback server, not a production account/database, a 3D island or a physical phone.
The production Goals strip is hidden during combat; quest state is asserted from the real HUD.

- [Report](../evidence/return-recovery/publication/report.json), [exact capture script](../evidence/return-recovery/publication/capture-exact.mjs), [runtime hashes](../evidence/return-recovery/publication/runtime-source-sha256.json), [browser log](../evidence/return-recovery/publication/browser.log).
- Desktop: [before](../evidence/return-recovery/publication/before-1280x720.png), [after](../evidence/return-recovery/publication/after-1280x720.png).
- Phone: [before](../evidence/return-recovery/publication/before-375x812.png), [after](../evidence/return-recovery/publication/after-375x812.png).

The complete publication frontend suite passed **4,659 tests / 424 files** in **441.48 seconds**:
`cd frontend && npm test`. [Full log](../evidence/return-recovery/publication/frontend.log).
Evidence-log trailing whitespace is trimmed for repository checks; reported results are unchanged.

The broad publication backend command completed with **13,236 passed / 1 failed**, 351.63 seconds.
The sole failure is the unchanged-main Group3 guard described below; no setup errors or skipped
cases occurred in this selected run. [Full log](../evidence/return-recovery/publication/backend.log).

```sh
cd backend
UV_CACHE_DIR=/tmp/audit-revive-uv CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --ignore=server/tests/correctness/test_settings_contract.py
```

The optional Group3 chain check also fails on clean unchanged main `db573347`: its frozen ten
2026-11-06 migrations contain 17 wallet reasons, while the assertion compares today's 33 Python
reasons. All 17 original pairs match; 16 later reasons cause the failure. The test, fixture and
wallet definitions are unchanged by this stack. A detached clean-main reproduction failed 1/1
in 3.06 seconds with the same assertion. This unrelated guard is left unchanged and remains a
review limitation; it is not a production wallet mismatch for the current migration chain.
[Main reproduction](../evidence/return-recovery/publication/group3-baseline.log) and
[first failing candidate subset](../evidence/return-recovery/publication/backend-first-failure.log)
are retained. Both used `CASE_PG_SCRATCH=1` and optional `pgserver`, `psycopg[binary]`, `pglast`.

The broad publication backend run excludes unchanged
`server/tests/correctness/test_settings_contract.py`, which includes 524,288 flag-subset cases
and 524,322 total cases. That settings suite was not rerun; no settings or flag definitions
were changed. No new full multiplayer smoke or live integration pass is claimed.

## Release and operator steps

Review and apply the additive migrations in order before deploying the matching API/client:
[atomic revival](../../supabase/migrations/20261118051000_paid_revive_journal.sql),
[saved rewards](../../supabase/migrations/20261118060000_reward_recovery.sql),
[historical reconciliation](../../supabase/migrations/20261118070000_revive_reconciliation.sql).
Refresh the PostgREST schema. Existing earlier recovery migrations remain prerequisites;
feature admission off does not erase saved obligations. No migration was applied live here.

To discover candidates after the reviewed migration is available, an authorized operator can
use a bounded read-only page. Replace the cursor 0 with the last original payment id for the
next page; do not treat every listed debit as a failed revival:

```sql
begin read only;
select payment.id, public.recovery_revive_reconcile(payment.id, false) as audit
from (
  select id from public.wallet_transactions
  where reason = 'captain_revive' and id > 0
  order by id limit 20
) as payment;
rollback;
```

Review classifications before using the [operator runner](reconcile-historical-revives.sql).
Its committed defaults select no ids and perform no writes. An approved apply accepts exactly
one original payment per transaction. Current production records were not inspected; affected
player counts and refunds are unknown, and no refund was issued.

## Remaining limits

- Automatic rewards cover retained, unpaid, closed protocol-2 records. Legacy personal outcomes
  and rows already marked finished are not inferred or rewritten.
- Historical evidence cannot reconstruct every old helper position or prove all old deliveries.
  Active original valid requests can use the existing same-UID retry; ambiguous cases require
  better evidence and remain untouched.
- The earlier generic multiplayer smoke failure at musket-pose observation is preserved in the
  [previous handover](coop-wave-consistency-2026-11-18.md). That run and its unchanged-main
  comparison used the earlier source; no new full multiplayer pass is claimed for this task.
- Agent review and the user discussion do not replace different-human approval. Human review,
  configured CI and any further walkthrough remain outstanding before merge. The task branches
  are published as drafts; production operations are separate.
