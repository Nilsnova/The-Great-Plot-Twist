# MP-ECO-20 integration acceptance preparation

> **What this is:** a reproducible acceptance matrix and offline evidence checks for the shared island economy.
>
> **Who uses it:** implementers and reviewers validating the economy across database, API and authenticated clients.

- **Status:** local source-qualified SQL/authenticated-browser acceptance is recorded in the [completion index](../docs/evidence/MP-ECO-20-browser-completion/README.md). Hosted conversion and rollout remain outside scope.
- **Branch:** `test/shared-economy-acceptance`
- **Issue:** [#505](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/505)

## Why

The [agreed economy](../docs/DECISIONS.md#shared-island-economy-2026-11-18) changes
money, participation and inventory authority together. Existing fake-room browser
checks and legacy personal-wallet tests do not establish that the new integrated
economy works. The [common contract](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/493)
must be checked without inventing replacement runtime interfaces.

The integrated source now includes persistent authority, native sessions/journal and
closure worker, domain transactions, capability-gated clients and reset/deletion
composition. Their presence removes the earlier missing-implementation prerequisite;
it does not complete the scenario matrix. Final frozen-source regressions and actual
provider/rendered-product observations require their own source-qualified results.
Historical runs retain their original outcomes and scope.

## What

- Define required SQL, authenticated-browser and compatibility scenarios, including
  both wave protocols, repeat/conflicting requests, concurrent spending and old epochs.
- Add offline assertions for canonical treasury snapshots and ledger reconciliation.
- Add an evidence-manifest checker that keeps missing, fixture, wrong-source and
  failed evidence distinct from completed runtime checks. Evidence references must
  be local files with matching hashes; this checks evidence completeness, not
  whether a human's reported runtime result is truthful.
- Add negative tests before implementation, then update TEST-MAP and WALKTHROUGH
  with the actual scope and commands.

**Files:** new `backend/tools/economy_acceptance.py`,
`backend/server/tests/test_economy_acceptance.py`,
`docs/economy/ACCEPTANCE.md`, and scoped additions to TEST-MAP/WALKTHROUGH.

## Out of scope

No treasury, permissions, receipt, epoch or participation runtime API is added.
No runtime route, migration, feature flag or existing multiplayer transport changes.
No authenticated/live acceptance is claimed before its prerequisite implementation
and an authorized test environment exist. Physical-device evidence remains separate.

## Acceptance checks

- The checker refuses incomplete evidence, source mismatches, fixture substitution,
  missing/corrupted artifacts and reported failures.
- Treasury assertions reject noncanonical numbers, negative free funds and ledger
  inconsistencies without legacy numeric ceilings.
- `cd backend && uv run pytest -q server/tests/test_economy_acceptance.py` passes.
- `cd backend && uv run ruff check .` and the documented relevant legacy regression
  tests run with their exact results recorded separately from future checks.
- Changed documentation links resolve and `git diff --check` passes.

## Tests to write first

| File | Behavior |
|---|---|
| `backend/server/tests/test_economy_acceptance.py` | Canonical treasury values and all-in escrow reconcile; invalid values and duplicate committed money fail. |
| Same | A not-run template cannot pass; fixture browser results cannot replace authenticated evidence. |
| Same | Source mismatch, missing artifact, corrupted artifact, duplicate rows and reported failures fail. |

## Contracts touched

Only offline verification inputs are defined. They are evidence exports, not game
API requests or persistent schema. Runtime contracts remain in #493 and their
implementations. Acceptance uses the agreed 20-copy total capacity, 60-second
reconnect grace, longest-active-member succession with stable player-ID tie break,
and positive ship-score improvement payouts. Conversion and outstanding reset
obligations still need their owning contracts.

## Owner and reviewer

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Coding assistance:** Codex; the responsible teammate reviews its output.
- **Human reviewer:** pending a different teammate's review.
- **Last updated:** 2026-11-18.
