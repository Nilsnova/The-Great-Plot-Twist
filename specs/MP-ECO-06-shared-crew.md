# MP ECO 06 Shared island crew purchases

> **What this is:** atomic purchases of Gunner, Guard and Lookout for the defended island, paid by its shared treasury.
>
> **Who uses it:** the shared-island service, future HTTP adapters and multiplayer snapshots.

- **Status:** bounded backend implementation verified; runtime route adoption remains separate.
- **Branch:** `feat/mp-eco-06-crew`.
- **Issue:** [#510](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/510), under [#492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Coding assistance:** Codex. A different human teammate reviews the current change.

## Goal and rules

Legacy hires always target the actor's home island and personal wallet. Shared hires explicitly target the resolved defended-island account and epoch. All current invited members may hire between canonical wave reservations. Catalogue price, maximum and unlock wave come from the server; the defended island's persisted progression and counts determine eligibility. Engineer grants no crew discount. Owner/buyer presence has no effect, and visiting Captains contribute no extra crew.

Carpenter is unavailable for new shared purchases. Existing Carpenter counts and historical provenance remain intact. No replacement effect, automatic refund or conversion is introduced.

## Transaction and contracts

New modules `shared_crew_rules.py` and `shared_crew.py` provide trusted offers, strict request/reply checks and a single service RPC per hire. The intent contains only the crew kind, alongside the authenticated actor, resolved account/epoch and root action UID. No caller-selected payer, price, maximum, progress or owner override reaches the domain intent.

`island_economy_hire(actor, account, epoch, action_uid, crew, catalogue)` takes the shared scope/account locks first, claims the global actor/action identity before checking current crew, and locks the defended island and membership. It checks current admission, canonical idle phase, target progression, capacity and available funds under those locks. The charge uses a derived financial child UID. Root claim, charge, count increment and immutable crew receipt commit together or roll back together.

The immutable receipt uses the common actor/action/origin shape and records crew kind, previous/new count, actual charged coins and financial receipt identity. A retry returns that original effect. Current treasury and crew are separate, authorized snapshots from the same original account/epoch; a departed member or retired origin does not receive another island/run's state. Changed crew or reuse in another domain conflicts before mutable eligibility checks. Price changes do not invalidate a successful original intent.

`island_economy_crew` reads the defended island's current four counts and progression with membership and epoch checks. The service adds current catalogue offers. Offer `available` is a catalogue/capacity/affordability hint, not permission to bypass admission or the canonical wave phase; the hire RPC checks those under locks. Unlocks use this island's `wave_best`, excluding the owner's personal wins elsewhere. This adds no per-player crew aggregation or online-presence dependency.

The hire reply is `{status: 'done', repeat, currentEconomy, currentCrew, currentWaveBest, receipt}`. All three current fields are null together when the original actor has departed or the original account is retired/replaced. Receipt `result` contains `{crew, previousCount, count, chargedCoins, treasuryReceiptId}`; `chargedCoins` remains an exact decimal string. The read reply contains `{status: 'ok', currentEconomy, crew, waveBest}`, and the Python service adds server-owned offers with price strings, maxima and unlock waves.

Migration `20261118050600_island_economy_crew.sql` adds private history and service-only RPCs. Additive `20261118050601_island_economy_crew_legacy_guard.sql` retains the exact old `island_hire` body behind a private alias; its public wrapper refuses every admitted shared home island, including paused admission, before legacy wallet locks. No existing migration, router or `service.py` changes.

## Dependencies and limits

Requires MP-ECO-02 treasury accounts/child effects (`ba05448d`) and the global operation registry (`de6ac1b8`), plus MP-ECO-04's canonical `island_economy_require_idle_locked` helper (`bf557e6d`, with its MP-ECO-07 prerequisites). No expiry is inferred or settled by a crew purchase. MP-ECO-08 authority, wave snapshot adoption, HTTP route wiring, save conversion and simulation fixture/profile integration remain separate activation gates. This package does not apply live migrations or admit old saves.

## Acceptance checks

- [x] Python domain/service tests cover server-owned catalogue offers, Carpenter refusal, strict scoped replies, immutable retry effects and malformed answers.
- [x] Real PostgreSQL applies the entire migration chain twice and proves visitor hire on B leaves A and private wallets unchanged, original receipt replay, capacity/funds races, reserved waves, membership departure, epoch fences, global UID conflicts and post-claim rollback.
- [x] Existing legacy hire behavior and private alias grants remain covered.
- [x] `uv run ruff check .` and relevant Python/SQL tests pass; exact results are recorded below.
- [x] No credentials, generated caches or live data are included.
- [ ] A different human teammate has approved the current change.

## Verification

Run from `backend/`:

```sh
uv run pytest -q server/tests/test_shared_crew.py server/tests/test_construction_rules.py server/tests/test_construction_store.py server/tests/test_island_treasury.py server/tests/test_island_treasury_store.py server/tests/test_economy_operations.py server/tests/test_island_rules.py
# 191 passed, including 19 shared-crew tests.
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_shared_crew_sql.py server/tests/island_sql/test_shared_construction_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_guard_crew_sql.py
# 95 passed, including 18 shared-crew tests; the complete 73-migration chain executes twice.
uv run ruff check .
# All checks passed.
```

The tests use synthetic users and a disposable Unix-socket PostgreSQL server. They verify same-island crew reads, full catalogue prices without Engineer discounts, retained old Carpenter payment history, an actual `game_leave` racing a blocked purchase, and atomic rollback after a forced failure following charge/count changes. Retries after departure or retirement return their immutable receipt with all current projections null. Migration reapplication preserves the original legacy function and its private execute grants. Diff and local documentation-link checks pass.

No HTTP routes were registered, live migrations applied, old saves admitted or full multiplayer simulation activated. Backend tests outside the affected domain/dependency suites and browser journeys were not run for this backend-only package.
