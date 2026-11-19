# MP-ECO-10 Arsenal holder lifecycle

> **What this is:** isolated copy-return transitions for departures and connection loss.
>
> **Who uses it:** session lifecycle, canonical wave settlement and account-deletion integration.

- **Status:** in progress; persistence and lifecycle integration remain prerequisites.
- **Branch:** `feat/shared-island-arsenal`
- **Issue:** [#500](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/500)

## Scope

Extend the MP-ECO-09 immutable inventory with an authority-supplied disconnect
deadline and a pending-return wave identity. Disconnect retains the copy until
the session authority's 60-second grace ends. Explicit departure/island change
withdraws immediately. Outside a reservation withdrawal returns the copy; inside
one it prevents control/reuse until canonical finish/expiry releases it.
Repeated disconnect notification cannot extend an existing deadline. Reconnect
before the deadline clears only disconnect state; no combat state is changed.
Copy identity plus holder generation fences delayed events from a later tenure.
The session adapter also checks its controlling connection generation before
passing notifications to these rules, so an old connection cannot restart grace.

The total inventory capacity is 20 stored plus carried copies; excess old stock
is preserved. Returns and lifecycle settlement never require a free slot.

## Integration requirements

The session implementation freezes copy identity and generation at bell and
keeps them in withdrawn slots. Its common locked transaction revokes Captain
input and applies withdrawal together. A trusted lifecycle worker must process
grace deadlines without relying on a browser, arsenal read or later wave.
Canonical closure calls pending-return settlement for its original wave.
Membership is not required for those server completion operations.

The continuing-island account-deletion transaction must apply withdrawal before
deleting the profile. The existing `arsenal_copies.holder` cascade deletes copies;
a future additive migration must remove that destructive behavior and preserve
pending reservations independently of profile lifetime. Owner-island deletion
remains governed by its separate policy. This package changes neither that
shared transaction nor the currently deployed foreign key.

These are pure rules, not a scheduler, transaction boundary or replacement
session API. Treasury, permission, wave-route, account-deletion and lock-order
integration require their agreed implementations; legacy runtime is unchanged.

## Tests to write first

- Departure returns immediately between waves and cannot release reserved stock.
- Grace is retained until its exact deadline; retries do not renew it.
- Canonical finish/expiry releases pending copies only for the matching wave.
- Stale leave, timeout and reconnect cannot release or reclaim a later tenure.
- Member deletion preserves all copies, including in an over-capacity inventory.
- Old holder commands fail after release; no automatic transition charges coins.

## Verification and responsibility

Run `cd backend && uv run pytest -q server/tests/test_shared_arsenal_lifecycle.py`
and `cd backend && uv run ruff check .`; inspect `git diff --check`.
Runtime worker liveness, SQL races/deletion, persistence and authenticated clients
remain unverified until the integration prerequisites are available.
Responsible teammate: Ianno Hollensteiner (`Iannomh123456`); Codex assisted.
A different human reviewer remains required.
