# RETURN Recover saved wave rewards after returning

> **What this is:** Recover unpaid shares of already closed protocol-2 waves after a browser reload or reconnect.
>
> **Who uses it:** Ianno, the backend and browser writers, and the human reviewer.

- **Status:** implemented; publication checks are recorded below. Draft review is prepared; different human approval and live operations remain pending.
- **Responsible teammate:** Ianno; coding agent: Codex; reviewer: a different human teammate, pending.
- **Publication branch:** `fix/wave-return-recovery-review`, stacked on `fix/coop-wave-consistency-review` ([#485](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/485)); main base `db573347`.
- **Development branch:** `fix/reward-return-recovery` (server), coordinated with the separate client worktree.
- **Issue:** [#483 — Recover unfinished closed-wave rewards after returning](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/483), published after Ianno's explicit approval.
- **Last updated:** 2026-11-18.

## Goal and scope

On return, recover the caller's unfinished participation in a wave that already has a saved canonical protocol-2 result. Use the first close's saved outcome and exact loot amount; never reconstruct a simulation/checkpoint, recalculate historical prices, or require current membership of the old island. Preserve the wallet's existing exactly-once reference and update only that participant's result and personal won-wave progress. Host progress, flags, structures, reservations and current waves are unchanged.

Legacy waves, incomplete canonical records, already settled participations and open waves are excluded. Existing historical rows marked finished for zero loot are not automatically rewritten. No live migration application or deployment is included. Task commits and a draft PR are authorized.

## Contract agreed before code

Authenticated `POST /api/waves/recover` with `{}` returns:

```json
{"coins": 115, "wonWaveBest": 5, "recovered": [{"waveId": "11111111-1111-4111-8111-111111111111", "wave": 5, "survived": true, "loot": 15}], "hasMore": false}
```

- No player, island, outcome, amount or checkpoint input is accepted. Verified `PlayerDep` retains guest admission checks; saved obligations do not depend on the `islands` feature flag.
- At most 20 recovered rows per call, oldest joined first; `hasMore` requests another bounded call. Current wallet coins and personal `wonWaveBest` are returned even for an empty/repeated batch or a retry after a lost response.
- SQL RPC `recovery_wave_recover_rewards(p_player_id)` is service-only. A partial index bounds the caller's pending participation lookup. Lock order follows wallet, sorted participating islands, recovery state/wave, participation. Recheck eligibility under locks.
- A shared read-only eligibility predicate filters malformed/mismatched frozen records before the batch limit and rechecks under locks. The normal finish keeps its signature and delegates to its preserved implementation after the same exact-wave settlement helper; a late normal finish therefore cannot erase a saved win or race recovery into a zero payout. Open waves still require their real checkpoint.
- Payment uses the existing `pirate_loot` reason and `wave:<waveId>:<playerId>` reference, together with the participation's `finished_at` guard. Copy the saved first close's `survived`, `loot`, `ships_sunk` and expiry state.
- A missing/malformed RPC response is `502 database_error`; missing caller wallet is `404 player_not_set_up`; normal authentication/guest errors and the existing wave request budget apply. Responses are private and uncached.
- Browser writer publishes `wave_rewards_recovered {wonWaveBest, recovered}` for quest reconciliation only. Historical receipts do not emit combat `wave_finished` or alter narration, breaks, repairs or current combat. The existing wallet observer handles the new POST and refreshes `/api/me` even after unknown outcomes.

## Likely files

`backend/server/island/wave_rewards.py`, `backend/server/routes/waves.py`, focused route and real PostgreSQL tests, `supabase/migrations/20261118060000_reward_recovery.sql`, the scratch RPC adapter, `docs/INTERFACES.md` and this spec. The browser writer owns its separate worktree and files.

## Acceptance and tests first

- [x] Real PostgreSQL and HTTP recover a closed unpaid win once, including after the original wave deadline, another wave/epoch and leaving membership.
- [x] Lost response, repeat, concurrent recovery and ordinary finish races never duplicate payment or overwrite another settled participant's result.
- [x] Empty calls return current totals; losses/expiry settle zero; legacy/open/nonparticipant/malformed closes are excluded.
- [x] More than 20 eligible rows drain in bounded batches; ordering, `hasMore`, caller filtering and service-only grants are checked.
- [x] Authentication/guest gating, forbidden input, flag-off obligations and malformed database responses are tested.
- [x] Focused checks and Ruff pass; exact commands and results below.
- [ ] Combined suites/build/browser checks are recorded by integration.
- [ ] Different human teammate approval before any merge.

## Focused verification and limits

Tests first: the new API cases failed with the missing route; the real PostgreSQL case failed with the missing RPC. Focused final API checks passed **147 tests** across the new route, existing wave/recovery routes and transport. Focused PostgreSQL checks exercise the full migration chain applied twice, including the real HTTP return journey, repeated/lost responses, concurrent settlement, the late normal-finish race, pagination and malformed/frozen-identity exclusions. Ruff check, changed-file formatting and `git diff --check` passed. Integration owns the combined full suites, build and browser evidence.

The previous SQL test that expected a late participant in an already won closed wave to expire for zero now expects the saved win and loot, while still checking that the canonical receipt, run and first finisher's wallet do not change. Already settled historical zero rows remain unchanged; legacy participants retain their existing independent-outcome contract. Those figures describe the development checkpoint. Current publication checks are recorded below; no live database operation, deployment or human approval is claimed.

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
