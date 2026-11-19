# MP-ECO-15 Island ship reward accounting

> **What this is:** isolated accounting rules for the island-wide ship-game reward cap.
>
> **Who uses it:** the future shared-economy boat reward transaction and its reviewers.

- **Status:** in progress; isolated rules verified; prerequisite runtime integration remains open.
- **Branch:** `feat/island-ship-rewards`
- **Issue:** [#504](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/504)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Agent assistance:** Codex; the responsible teammate reviews the result.

## Bounded scope

Add pure reward-cap and provenance rules in `backend/server/island/boat_reward_accounting.py`
and meaningful tests. Preserve the current boat route, personal-wallet behavior, content,
and UI until versioned admission and the common treasury/permission dependencies are available.
No treasury, permission, receipt, admission, or epoch implementation is supplied here.

The reward bucket is identified by original island owner, account, run epoch, game, and
newly reached island record. It never includes the claiming player. A server-created round
origin must match the authenticated actor and current common `EconomyContext`; changing
islands or resetting cannot relabel an old round. A round from an earlier record in the same
run retains that earlier bucket. Different games and genuinely new record buckets remain
independent. Member count, repeated scores, and order of score submissions cannot multiply
any one bucket's maximum.

The arithmetic accepts a trusted cumulative target and immutable maximum, computes only
the positive amount beyond what the bucket has already paid, and refuses invalid or
inconsistent state. It does not accept client-provided coin amounts. The intended integration
must derive both amounts from a server-side score verifier and the agreed
positive-improvement policy.

## Agreed score policy

Retain the existing `boat.json` formula:
`stars * (6 + floor(min(record_wave, 100) / 5))`, with at most three stars.
All members share one cumulative payout per game/island/account/epoch/new record.
Pay only positive score improvements. At record 30, one star pays 12 coins and a
later three-star score pays 24 more; lower scores and repeats pay zero, with 36
coins the total cap. Repeat play remains available for fun. A server-bound round
uses its original record even if the island reaches a later record before claiming.
`plan_scored_boat_reward` computes both target and maximum from these existing rules.
Range-checking claimed stars preserves the current score-trust limitation; it does
not establish that the browser actually achieved that score.

## Transaction integration requirements

Use the exact common context and permissions in [#493](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/493).
The future transaction must atomically recheck membership, persisted mode/account/epoch,
boat unlock/wreck state, bound round identity, and reward provenance; resolve an immutable
same-action receipt; lock/read the bucket; evaluate this plan; credit its originating treasury;
and write the bucket plus receipt. All follow the common lock order. Do not commit the bucket
and treasury separately. A lost response retries the same operation. There is no personal
wallet fallback for an admitted shared island. Existing legacy routes need explicit guards
before any shared admission can activate.

## Acceptance and checks

Write tests before implementation for ten-player/repeated score sequences, all score-order
permutations, zero rewards, new records, independent games, immutable caps, forged provenance,
legacy contexts, missing shared context, and stale epochs. These are pure accounting checks;
they do not establish SQL atomicity or authenticated runtime acceptance.

Run targeted pytest including existing boat routes/migration parity, `uv run ruff check .`,
and `git diff --check`. Runtime SQL races, authenticated multiple-client flows, persistence,
receipt replay, admission guards, and UI must be verified only after #494/#495 integration.
A different human teammate's review is still required. No migration is applied or feature
activated by this work.

## Actual verification

With a writable `UV_CACHE_DIR` configured, from `backend/`:

- `uv run pytest -q server/tests/test_boat_reward_accounting.py server/tests/test_boat_routes.py server/tests/test_wallet_matches_migration.py`: **133 passed in 4.57s**.
- `uv run ruff check .`: **All checks passed!**
- Repository `git diff --cached --check`: passed.

The full backend suite, SQL transaction/concurrency tests, authenticated clients, browser/UI,
physical-device checks, and production checks were not run for this isolated package.
The spec's two issue links reference the reviewed source issues. Runtime integration remains
incomplete and is not represented by the passing fixture-based accounting tests.
