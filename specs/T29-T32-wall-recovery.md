# T29–T32, T47 Wall recovery

> **What this is:** the reproduction of the reported upgrade/rebuild problem (T29), the wall recovery and upgrade contract (T30), and its implementation for walls (T31 repair, T32 rebuild, T47 upgrade guard), behind the flag `wall_recovery`.
>
> **Who uses it:** the recovery and defense lane, the enemies/layout lane (T33–T36 build on these states), and reviewers of the island and wave contracts.

- **Status:** in progress (implemented on the branch; [D039](../docs/DECISIONS.md#d039--wall-recovery-damage-stays-after-a-wave--2026-11-14) is **proposed**, pending team review)
- **Branch:** `feat/t29-t32-wall-recovery`
- **Issue and pull request:** [issue #21](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/21); pull request to be opened

## Why

Walls took damage in a wave, but every new wave started every wall whole again, so damage had no consequence between waves, and the building card offered "Upgrade" on a ruined wall without saying it was ruined. The roadmap (BUILD-PLAN §6) requires that damage and destruction persist until an active repair/rebuild or an agreed recovery timer, that upgrades never heal or bypass recovery, and that money stays on the server.

## T29: reproduction

Reproduced by reading the code paths on `origin/main` (14 Nov) and by unit tests that fail on that code; **not** reproduced in a live browser.

Steps (desktop, own island, a built level-1 wall on `wall_1`, at least 20 coins, best wave ≥ 1 so level 2 is open):

1. Ring the bell. Let boarders break `wall_1` (the post shows the ruin; E at it says "Rebuild").
2. Walk to the wall's build spot during the wave and open its card.
3. **Actual:** the card shows `Upgrade` with "Level 2 · 🪙 20" and "Hp 60 → 120", enabled with enough coins. It says nothing about the wall being destroyed (`buildCardModel` has no health input). Clicking charges 20 coins and raises the level on the server (`POST /api/island/upgrade` has no wave or health check).
4. **Actual, same wave:** the wall stays broken; the running wave keeps the defenses it started with (`controller.js`, `refreshDefenses` only after the wave). E still rebuilds it at 40% of level 1.
5. Finish the wave (won or lost) and ring again. **Actual:** the wall starts whole at level 2, 120 hp (`createWave` builds every wall at `maxHp`).
6. Repeat without upgrading: the wall also starts whole (at 60 hp).

**Finding.** The upgrade does not heal the wall inside the running wave and does not skip the in-wave rebuild. The reported "upgrade heals / bypasses rebuild" is the combination of (a) a **mislabeled card**: Upgrade is offered on a destroyed or damaged wall, with a stats line that suggests the ruin gains hp, and coins are taken mid-wave for an effect that only shows next wave; and (b) the **automatic full reset** of every wall at the next wave, which makes any damage disappear whether or not the player upgraded. Both are confirmed defects against BUILD-PLAN §6. Regression tests: `frontend/tests/pirates/wall-recovery.test.js` and `frontend/tests/island/wall-recovery.test.js` (cases marked "T29"; the four pirates-file cases for stored health failed on the old code before the fix), and `backend/server/tests/test_wall_recovery.py::test_an_upgrade_of_a_damaged_wall_is_refused_and_charges_nothing`.

## T30: contract

State of one wall spot. **Persistent** (server, `islet_buildings`): kind, level, `wall_health` (0–100 %), `wall_damaged_at`. **Transient** (only inside a running wave, deterministic sim): hp, repair in progress, rebuild cooldown, engineer boost.

| State | Meaning |
|---|---|
| empty | no row |
| intact | health 100, or the timer ran out |
| damaged | health 1–99, timer running |
| destroyed | health 0, timer running; kind and level kept |
| recovering | damaged or destroyed with a timer (`recoversAt`); every damaged/destroyed wall has one in this design |

| Event | During a wave | Between waves |
|---|---|---|
| Wave starts | each wall starts at `startHp = maxHp(level) × health/100` from the server's `walls` snapshot (computed at `startsAt`, same for join/current) | — |
| Boarder/ship hit | hp drops (unchanged rules) | — |
| E repair (free, active) | +10 hp/s for 3 s per press, up to max hp of the level (unchanged) | not available (no wave) |
| E rebuild (free, active) | destroyed → 40 % (60 % Master shipwright), 5 s cooldown (unchanged) | not available |
| Carpenter / Workshop | as before: carpenter repairs/rebuilds, Workshop speeds repair and mends a broken wall after 8–12 s | — |
| Engineer | +25 % max hp once in that wave (unchanged); the reported percent is of the boosted max | 10 % cheaper Repair/Rebuild (`engineerDiscountPercent`, as for builds) |
| Wave ends (won **or** lost) | the first finish reports `{wall: percent}`; the server stores it; below 100 starts the 10-minute timer, 100 clears it | — |
| Wave expires (nobody finished) | nothing recorded: walls keep their previous state | — |
| Card Repair (damaged) | refused `wave_running` (card says "between waves, or press E") | pays `ceil(rebuildPrice × missing%)`, ≥ 1 coin; health → 100, timer cleared |
| Card Rebuild (destroyed) | refused `wave_running` | pays the full rebuild price; health → 100 at the same kind and level |
| Card Upgrade | wall below 100: refused `needs_repair`; card shows Repair/Rebuild instead | same |
| Upgrade of an intact wall | allowed (level +1); health stays 100 % of the new level | same |
| Timer runs out | — (the snapshot at `startsAt` decides for the whole wave) | wall counts as intact; no write needed |
| Damaged again before the timer ran out | — | the next recorded wave restarts the timer from its end |
| Reload / reconnect / late join | the wave's `walls` come from the server, so a rejoin starts the same walls | card reads `GET /api/island/walls` |
| Offline time | — | counts towards the 10-minute timer (server clock) |
| Old saves / migration just applied | `wall_health` defaults to 100: whole | whole |
| Flag `wall_recovery` off | exactly the old behavior: no `walls` in wave answers, walls start whole, finish ignores `walls`, routes 404 | old card |

Values (D039, proposed): timer **600 s**; rebuild price **30 %** of the catalogue prices of the wall's levels, rounded up (levels 1–5: 3, 9, 21, 45, 93 coins); repair **missing share** of that, rounded up, at least 1; no refund (a repair is not an investment, so demolish refunds are unchanged); interruption: a repair is instant, so it cannot be interrupted; a second click for a wall that just became whole is refused `intact` and charged nothing.

## What

- `supabase/migrations/20261114100000_wall_recovery.sql`: columns `wall_health`, `wall_damaged_at`; table `island_wall_records`; functions `island_walls_record()`, `island_wall_restore()`.
- `backend/server/island/wall_health.py` (pure rules), `wall_repair.py` (database flow), `routes/wall_recovery.py` (`GET /api/island/walls`, `POST /api/island/repair`); small guarded hooks in `routes/island.py` (upgrade) and `routes/waves.py` (snapshot, record); flag `wall_recovery` in `flags.py`.
- `frontend/src/pirates/wall-health.js`; `sim.js` reads a wall's `health`; `controller.js` applies the snapshot and reports the walls at the finish; `island/wall-recovery.js` card; `ui.js`, `index.js`, `api.js`, `wave-flow.js`, `game.js` wiring.

## Out of scope

- Tower health (T33): towers still have no hp; gunboat jam and barge silence unchanged.
- Pirate Point walls: they still start every wave whole.
- A dedicated wallet reason (`wall_repair`): repairs use `building_purchase` with ref `wallfix:<uid>`; a new reason is a team decision (open question in D039).
- Free between-wave E repair, timed partial recovery, permissions (T37): any member who can build may repair.

## Done when (acceptance checks)

- [x] `cd backend && uv run pytest -q`: passes, including `test_wall_recovery.py`.
- [x] `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_wall_recovery_sql.py`: 11 passed on a disposable local PostgreSQL.
- [x] `cd backend && uv run ruff check .`: no problems.
- [x] `cd frontend && npm test && npm run build`: pass.
- [ ] The migration is applied by a teammate, then the flag `wall_recovery` is switched on for a preview and played with two browsers (not done here).
- [ ] Desktop and phone screenshots of the Repair/Rebuild card (not done here).
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

| Test file | Test name | What it proves |
|---|---|---|
| `frontend/tests/pirates/wall-recovery.test.js` | `T29: a wall destroyed in the last wave starts destroyed…` | no automatic reset; level kept |
| `frontend/tests/pirates/wall-recovery.test.js` | `the same seed, inputs and walls give the same wave…` | determinism with stored health |
| `frontend/tests/island/wall-recovery.test.js` | `T29: a destroyed wall offers Rebuild at its level, never Upgrade` | the card is no longer mislabeled |
| `backend/server/tests/test_wall_recovery.py` | `test_with_the_flag_off_the_routes_are_hidden_and_the_waves_unchanged` | safe before the migration |
| `backend/server/tests/test_wall_recovery.py` | `test_an_upgrade_of_a_damaged_wall_is_refused_and_charges_nothing` | T47 guard |
| `backend/server/tests/island_sql/test_wall_recovery_sql.py` | `test_a_repair_takes_the_missing_share_once_and_makes_the_wall_whole` | charged once, never above full |
| `backend/server/tests/island_sql/test_wall_recovery_sql.py` | `test_the_first_finish_records_the_walls_and_a_second_changes_nothing` | one record per wave |

## Contracts touched

- [x] API endpoints: new `GET /api/island/walls`, `POST /api/island/repair`; `walls` on `POST /api/waves/start|join`, `GET /api/waves/current` answers and on the `POST /api/waves/finish` body; `409 needs_repair` on `POST /api/island/upgrade` (all only with the flag on). Documented in `routes/wall_recovery.py`, `routes/waves.py`, `routes/island.py`, INTERFACES.md.
- [ ] Browser events: none new (`wave_started_server` may carry `walls`).
- [x] Database tables, policies or functions: see the migration; policy matrix in `supabase/README.md`.
- [x] Shared lists: flag `wall_recovery` (FLAG_NAMES, `.env.example`, INTERFACES §8). No new wallet reason.
- [ ] Content format: none.
- [x] Decisions: D039 (proposed).

## Owner and reviewer

- **Responsible teammate:** Nils (`Nilsnova`)
- **Coding agent used, if any:** a coding agent. The teammate stays responsible for its output.
- **Reviewer (a different human teammate):** to be named in the PR
- **Last updated:** 2026-11-14
