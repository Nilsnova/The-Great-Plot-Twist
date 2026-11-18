# Co-op settlement review corrections

Implementation and verification handover for Ianno Hollensteiner and the different human reviewer.

Responsible teammate: Ianno (`Iannomh123456`), assisted by Codex. Work remains on
`fix/coop-wave-consistency-review`, [PR #485](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/485).
The reviewed combined head was `563b62ef`; main `03e660fe` is incorporated by merge commit
`33ab1176`. PR #490 merged into #486, which merged into #485; their changes now travel together
through #485 to main. This is a task-branch update, not a merge into main or a live release.

## Confirmed review findings

1. A detached old finish treated an explicit `checkpoint_stale` refusal as an unknown outcome,
   repeating the rejected checkpoint forever. A known stale state requires journal refresh;
   an unknown payment outcome must keep its original idempotency identity.
2. A fresh wallet correction protected only the first accepted old island read. A second read
   already in flight could replace the recovered balance. Newer reads, purchases and account
   changes also need their own ordering; an old correction must not replace newer money.
3. The paid revival and merged retirement migrations shared version `20261118050000`.
   SQL-only filename loaders accepted both files even though Supabase identifies them by version.

## Runtime corrections

Detached finishes now read the original wave's complete sealed journal frontier after an explicit
refresh refusal. Catch-up reuses the replay engine, at most 600 ticks per timer turn, without
publishing old gameplay, sound, HUD or report effects. Terminal paid repairs remain included.
A new checkpoint/UID follows the refreshed state. Network/503 outcomes before or after that
refresh keep their identical request and UID. Retry-After, terminal refusals and disposal remain
respected. The four new regressions cover these boundaries, including a read finishing after disposal.

Wallet reconciliation retains its watermark across all covered older island reads. Newer actions
and account resets fence old answers. Arsenal replies have a separate monetary generation guard
and retain main's in-place object updates, so newer accepted coins and rejoin identity survive.
The ten new ordering cases include both response orders, purchases, account resets, old arsenal
answers and later authoritative balances. Existing Chromium fixtures now update their synthetic
server balance alongside the authoritative recovery rather than describing inconsistent server data.

## Migration correction

Only our paid revival file is renamed to
[`20261118051000_paid_revive_journal.sql`](../../supabase/migrations/20261118051000_paid_revive_journal.sql).
Its SQL body is unchanged. The merged retirement file retains its name and version. The order is:

`40000 playtest → 50000 retired options → 51000 atomic revival → 60000 rewards → 70000 reconciliation`.

The non-opt-in `test_migration_versions_are_unique` regression failed on the duplicate version,
then passed after the rename. The complete current migration chain was applied twice in private
Unix-socket PostgreSQL. Historical logs and source manifests retain their original filenames;
active documentation and the Tavern delegation guard use the new name.

## Main reconciliation

Both failed-start and normal teardown dispose the reward worker and the lazy guide. The guide
retains ownership of narrator/tutorial teardown, including disposal before the import completes.
Main's in-place arsenal coin updates and shown-island identity guards remain. Both complete
STATUS histories are retained. Main's D066 captain feedback decision is unchanged; the reward
decision is D067, with active references updated. No artwork, gameplay price or wallet reason
is changed by these corrections.

## Verification

The detached regression failed before the fix and passed afterward. The two-read wallet suite
had 5 failures before the fix; all 10 new cases pass. Focused checks passed:

- Detached finish and surrounding controller suites: **71 passed / 7 files**.
- Wallet, browser HUD and rejoin: **33 passed / 3 files**, plus **67 compatibility checks passed**.
- API/real PostgreSQL/migration-version/Tavern checks on the merged base: **619 passed**; every
  disposable full-chain PostgreSQL fixture applies all migrations twice.
- Frozen wallet/current vocabulary guards: **206 passed**. Structure route guards: **3 passed**.
- Build, spoiler guard and budget passed. The spoiler guard inspected 250 text files / 12 protected lines.

The first broad backend run found three failures inherited from clean main `03e660fe`
(**13,261 passed / 3 failed**, 266.86 seconds). An independent clean-main reproduction found
those same three failures. The frozen Group3 fixture applies only the first ten historical
migrations, so its exact comparison now uses the first 17 immutable ordered wallet pairs;
the separate complete-vocabulary checks remain strict. Two structure route tests now assert
the exact six supported price schedules, including stored culverins with purchase flags off.
Ownership, membership, outsider denial, no-wallet and canonical DTO checks remain intact.
These corrections change tests only. An initial correction still omitted culverins; its failed
check was followed by the explicit complete schedule and three passing route checks.

Current-source Chromium captures at 1280×720 and 375×812 use the same script and real island/HUD
modules with a synthetic server. On the pre-fix source `4f28c039`, a fresh balance 120 survives
the first old response but becomes 100 after the second. On fixed source `db042f0a`, both old
responses preserve 120; a genuinely later 80 remains accepted. The real arsenal GET returns
current server coins. Both scenarios have zero page errors and no finish/stop events. Reports
record exact source/module hashes. These are component fixtures, not a 3D island, live account,
database payment or physical-device claim.

- [Detached red](../evidence/coop-review-fixes/detached-red.log) / [focused](../evidence/coop-review-fixes/detached-focused.log).
- [Wallet red](../evidence/coop-review-fixes/wallet-red.log) / [focused](../evidence/coop-review-fixes/wallet-focused.log) / [compatibility](../evidence/coop-review-fixes/wallet-compatibility.log).
- [Migration red](../evidence/coop-review-fixes/migration-red.log) / [green](../evidence/coop-review-fixes/migration-green.log); [API/PostgreSQL](../evidence/coop-review-fixes/backend-focused.log).
- [Initial broad backend](../evidence/coop-review-fixes/backend-initial.log) / [same failures on clean main](../evidence/coop-review-fixes/backend-main-baseline.log).
- [Wallet guard](../evidence/coop-review-fixes/wallet-guard.log) / [structure route guard](../evidence/coop-review-fixes/structure-route-guard.log).
- [Before report](../evidence/coop-review-fixes/wallet-baseline-report.json) / [after report](../evidence/coop-review-fixes/wallet-fixed-report.json) / [exact script](../evidence/coop-review-fixes/wallet-capture.mjs) / [runtime hashes](../evidence/coop-review-fixes/runtime-source-sha256.json).
- Desktop [before](../evidence/coop-review-fixes/wallet-baseline-1280x720.png) / [after](../evidence/coop-review-fixes/wallet-fixed-1280x720.png); phone [before](../evidence/coop-review-fixes/wallet-baseline-375x812.png) / [after](../evidence/coop-review-fixes/wallet-fixed-375x812.png).
- [Build](../evidence/coop-review-fixes/build.log) / [budget](../evidence/coop-review-fixes/budget-summary.json).

The unchanged `npm run test:lifecycle` script times out waiting 12,000 ms for its injected
coast-load error before any lifecycle assertion. The identical failure occurs on clean main
`03e660fe`, with the same script hash. Neither run proves the failure/retry lifecycle path;
its source assertions were not relaxed. [Task log](../evidence/coop-review-fixes/lifecycle.log) /
[clean-main log](../evidence/coop-review-fixes/lifecycle-main-baseline.log). No new complete native
multiplayer, hosted-service or physical-device pass is claimed. The unchanged exhaustive
settings-contract suite (524,322 cases) remains excluded from the broad backend command.

The final broad backend rerun passed **13,264 tests**, with no failed or skipped selected tests,
in **339.27 seconds**. This replaces the initial failed run after the three stale expectations
were corrected. [Final backend log](../evidence/coop-review-fixes/backend-final.log).

```sh
cd backend
UV_CACHE_DIR=/tmp/audit-revive-uv CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --ignore=server/tests/correctness/test_settings_contract.py
```

The complete final frontend suite passed **4,729 tests / 430 files** in **461.23 seconds**:
`cd frontend && npm test`. [Final frontend log](../evidence/coop-review-fixes/frontend-final.log).
Backend Ruff and changed Python formatting passed. All 25 runtime hashes still match the frozen
source; documentation-path, diff and secret checks passed. Evidence logs trim trailing whitespace
only. Independent agent reviews found no concrete remaining blocker in runtime or merge/test corrections.

## Review and release boundaries

Different human review of the new revision remains required. Existing review threads are not
treated as approved or resolved merely because code changed. No live database was inspected,
migration applied, historical refund issued, deployment started or main merge performed here.
The database remains authoritative for saved outcomes, rewards and payment identities.
