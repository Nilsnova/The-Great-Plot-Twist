# MP-ECO-12: Close personal paid revival on shared islands

> **What this is:** the transaction-level mode fence for existing personal paid revival.
>
> **Who uses it:** the existing wave revival endpoints and disposable database acceptance tests.

- **Status:** transaction fence and HTTP refusal projection verified locally; canonical free revival remains a separate integration.
- **Issue:** [#502](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/502).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`). Coding assistance: Codex.

## Problem and bounded change

The existing protocol-1 `wave_revive` delegates to service-only `wave_revive_charge`, which
charges a personal wallet. Protocol-2 `recovery_wave_revive` takes wallet/island/recovery/wave
locks and invokes the same charge helper before appending its event. These transactions must
refuse a target with persisted shared economy admission before any personal charge or event.
Python preflight alone cannot close the race with admission.

Migration `20261118192007_legacy_revival_shared_mode_guard.sql` replaces only the two actual
transaction functions. It keeps their existing strict argument checks. Resolve the target
from the canonical wave row, acquire all
distinct common class-zero actor/target scope keys in signed ascending order before any wallet
or island row lock, and reject persisted shared target mode with `economy_context_required`.
Both functions need the guards: guarding only the charge helper would acquire them after the
outer recovery transaction already holds its wallet. Reacquiring an already held scope guard
inside that helper preserves the order.

For `wave_revive_charge`, an island target exists only when the actual wave has place `island`.
Do not infer target mode from the helper's own island: an actor owning shared island A may
help on explicit legacy island B or in a separately legacy game. The protocol-1 wrapper keeps
its existing refusal of saved protocol-2 waves and otherwise delegates the guarded helper.

For explicit legacy targets preserve the current Tavern price, fall uniqueness, paid UID
retry, finish/leave behavior and protocol-2 payment/event atomicity. Original legacy rows and
ledger entries remain unchanged after admission; admission closes the legacy mutation/retry
entry point. This adds no receipt conversion, refund, common operation root, wallet reason,
table, browser privilege or new paid path. Existing security-invoker functions retain empty
search paths and explicit service-only execution grants.

The existing HTTP refusal mapper returns `409 economy_context_required` for this
transaction refusal, telling the client to reload the island's revival rules.
It does not turn the refused paid operation into a free revival or read a fresh
personal balance after the refusal.

## Tests before implementation

Run actual disposable PostgreSQL checks for protocol-1, protocol-2 and direct service charge
helper requests against admitted shared targets. Refusals preserve personal balance, ledger,
paid revival rows, journal events and common operation roots. Cover a concurrent admission
boundary where possible, ordinary legacy success/retry and shared-A actor helping legacy-B.
Run the existing paid revival, journal rollback and Tavern regressions, Ruff, the documented
SQL parser and full diff review. Test-only authority/snapshot fixtures remain labelled as such.

## Verification

All 39 actual disposable PostgreSQL tests passed, including 11 new entry-point refusal,
explicit legacy/shared-actor compatibility, retained-history and concurrency checks. The
concurrency check observes the revival waiting on the common target scope while its personal
wallet row remains available, expires the timer fixture so actual admission can complete,
then verifies the waiting request refuses the new shared mode without any effect. It does
not assert that admission is allowed during an active wave. Existing payment retries,
one-payment-per-fall, Tavern prices, event rollback and HTTP regressions passed. All 77
migrations parsed and applied twice in the scratch database; Ruff and diff checks passed.

No client code changed and no frontend build or complete repository test suite was repeated
for this SQL-only follow-up. The subsequent HTTP refusal integration passed all 37
existing revival route checks, including the new shared-mode 409 regression, plus
Ruff. These tests do not prove a canonical Captain producer or free revival.

## Boundary

This fence does not implement free timed revival, prove a canonical fall, or accept client
timing/HP as authority. Accepted fall identity, target-bound uninterrupted server-clock hold,
frozen Medic stats and exact-current-fall event/receipt persistence still require the actual
canonical producer integration. No new shared wave Python/JavaScript dispatch, paid reconciliation,
live migration, activation, deployment or publication is part of this package.
