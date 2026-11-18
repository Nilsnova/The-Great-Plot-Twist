# Recover saved wave rewards in the browser

Task brief and verification handover for Ianno Hollensteiner (`Iannomh123456`) and Codex; used by the client implementer and reviewer.

Publication branch: `fix/wave-return-recovery-review`, stacked on core draft [#485](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/485), with main base `db573347`.

Development branch: `fix/reward-return-client`. Its prepared baseline was main `37eb70fa` plus the unchanged
four-fix integration supplied by the coordinator. Export only this task's delta. The shared decision
is D067; the coordinator owns its decision log and publication draft. The approved tracking issue
is [#483](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/483). Initial publication was blocked
by automatic approval review and succeeded after Ianno explicitly approved the repository and issues.

## Goal

After a full page reload, restored authentication or a later online/visible return, settle saved
personal reward obligations independently of the island or wave on screen. Reconcile the fresh wallet
and personal win goals without changing combat, building permissions, repairs or narrator state.

## Contract

The backend-approved authenticated `POST /api/waves/recover` accepts `{}` only and returns
`{coins, wonWaveBest, recovered: [{waveId, wave, survived, loot}], hasMore}`. One batch holds at most
20 settled waves. The server owns caller identity, saved outcomes and money. Recovery remains
available when new island admission is disabled. The backend writer owns the API/migration and
`docs/INTERFACES.md`; the client does not send player, island or checkpoint data.

The browser publishes `wave_rewards_recovered {wonWaveBest, recovered}` for personal goals only,
including an empty batch after a previously lost payout reply. This is separate from `wave_finished`.
POST response coin snapshots are never applied to the HUD. The existing panel wallet observer
reconciles authoritative `/api/me`; an explicit private `reconcileWallet()` capability exposes that
fresh result with identity/lifetime and monetary-write ordering checks. Combat inputs and health
writes neither invalidate that wallet result nor trigger extra account reads.

## Acceptance checks

- Restored identity/readiness starts one background pass even with the islands flag off.
- Online and visible wakes coalesce; each request drains at most one server batch and `hasMore`
  is paced by one second. Empty success stops polling.
- Transient failures use 5/15/30-second delays, capped at 30 seconds while obligations remain pending,
  respect Retry-After and pause hidden/offline.
- Sign-out, account replacement, provider replacement and disposal reject old side effects.
- Recovery updates an island-source HUD through a fresh wallet read, including after a lost payout reply.
- A purchase completing during that read wins over the older snapshot. Frequent nonmonetary combat
  requests cause no additional wallet reads and cannot starve reward reconciliation.
- A private island read already in flight cannot undo the reconciled balance. The first-load coin
  buffer covers only those old read IDs; a later island read keeps its newer authoritative coins.
- The HUD retains authoritative won-wave progress for later current win goals, without skipping
  unrelated build/invite/hire goals or emitting a battle-finished event.
- Existing active battle, building controls and narration remain unchanged.

## Evidence and remaining work

Initial wallet regressions failed **3/3**: the recovery POST was not observed and there was no fresh-wallet
capability. The worker test first failed because the new module did not exist. Further exact results
include the saved-win HUD regression failing before its listener, two old-island-read balance cases
failing before the read-order guard, and the longer-outage case failing before capped retries.

- `cd frontend && npm test -- tests/ui/recovered-rewards.test.js tests/wave-reward-recovery.test.js tests/panel-wallet.test.js tests/panel-services.test.js tests/ui/first-quests.test.js --maxWorkers=1`:
  **5 files, 95 tests passed** before the final nonprogressing-batch validator check.
- `cd frontend && npm test -- tests/ui/hud.test.js tests/island/first-read-retry.test.js tests/island/wave-context-dom.test.js tests/online-islet-host.test.js --maxWorkers=1`:
  **4 files, 29 tests passed**.
- Syntax checks for the changed runtime modules and `git diff --check`: passed.
- After aligning the validator with the backend's nonempty-`hasMore` rule,
  `cd frontend && npm test -- tests/wave-reward-recovery.test.js --maxWorkers=1`: **12 tests passed**.
- Independent agent review found no concrete remaining blocker; it is not human approval.

The component browser checks use real Chromium, real island cards and HUD with injected/fake services.
They cover island-source balance updates, empty replies, retained win goals, active-wave/build controls,
read ordering and account reset. They do not establish live server, live database, physical-phone or
deployed multiplayer behavior. Separate full-reload loopback evidence belongs to the coordinator's
browser task; do not treat its synthetic persisted server as production evidence.

No commits, pushes, PR, merge, live database write or deployment were performed in that development checkpoint. Task commits and draft publication are now authorized.
Full combined frontend/build checks belong to the final stacked integration review. Human review and
explain-back remain separate from agent checks.

## Publication verification on current main

The publication branch includes the unchanged core draft #485 and preserves main `db573347`,
including its WebP optimizations. The isolated reward slice passed:

```sh
cd frontend
npm test -- tests/ui/recovered-rewards.test.js tests/wave-reward-recovery.test.js tests/panel-wallet.test.js tests/panel-services.test.js tests/ui/first-quests.test.js tests/ui/hud.test.js tests/island/first-read-retry.test.js tests/island/wave-context-dom.test.js tests/online-islet-host.test.js
# 125 passed / 9 files; 26.88 seconds
cd ../backend
UV_CACHE_DIR=/tmp/audit-revive-uv CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/test_wave_reward_recovery_routes.py server/tests/test_wave_routes.py server/tests/test_wave_recovery_routes.py server/tests/test_wave_revive_routes.py server/tests/test_house_roles_match_migration.py server/tests/island_sql
# 584 passed; 34.97 seconds
UV_CACHE_DIR=/tmp/audit-revive-uv uv run ruff check .
# All checks passed
```

Logs: [frontend](../docs/evidence/reward-return-publication/frontend.log),
[backend](../docs/evidence/reward-return-publication/backend.log),
[Ruff](../docs/evidence/reward-return-publication/ruff.log).
Independent agent review found no concrete blocker; different human approval remains pending.
Full combined suites, build and reload evidence are recorded with the final stacked historical
review. No live database audit, migration, payment or deployment has been performed.

Draft review: [#486](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/486), based on #485. Different human approval remains pending.

Final stacked publication evidence: [combined handover](../docs/handoff/return-recovery-2026-11-18.md#publication-verification-on-current-main).
It records 4,659 passing frontend tests, 13,236 passing backend tests and one reproduced
unchanged-main Group3 failure, plus the excluded exhaustive settings suite, build and synthetic
reload captures. Different human approval remains pending.

The two-read review correction is now part of #485 after #486/#490 were merged into its task
branch. See [the current review handover](../docs/handoff/coop-review-fixes-2026-11-18.md) for
lasting wallet watermarks, arsenal ordering, coherent fixtures and current verification.
