# MP-ECO-09 Shared arsenal rules and frozen loadouts

> **What this is:** isolated copy-accounting rules for the versioned shared island arsenal.
>
> **Who uses it:** arsenal integration and wave snapshot implementations.

- **Status:** in progress; runtime integration depends on treasury and permissions.
- **Branch:** `feat/shared-island-arsenal`
- **Issue:** [#499](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/499)

## Scope

Add immutable inventory transitions for buying, taking, swapping and returning
copies, and a bell-time loadout snapshot. Count every copy toward an explicitly
supplied total capacity; preserve stock above that capacity and allow every
return. A purchase uses the island's best won wave and the existing catalogue.
Every holder change advances a copy generation so an obsolete holder command
cannot affect a later tenure. No transition moves money or writes persistence.

The numeric capacity remains a required trusted policy input pending the common
contract's decision. No default changes the existing legacy capacity.

## Integration requirements

The caller must obtain the common #493 economy context and #495 permit, then
recheck them under the common transaction locks. It must replay an existing
immutable action receipt before invoking a transition, and commit the resulting
inventory, exact catalogue-price treasury debit and receipt atomically. Failed
transitions must commit none of them. The helper is a deterministic rule
component, not an authorization or concurrency boundary.

The accepted bell freezes the resulting loadouts together with the roster.
All player inventory changes are refused from bell acceptance through canonical
finish/expiry. Frozen loadouts do not change when later inventory state changes.
Legacy arsenal routes, personal money, wave routes, public contracts, migrations
and UI are outside this isolated change.

## Tests to write first

- Total-capacity purchases, including carried copies and grandfathered excess.
- Island unlocks, catalogue price and permanent free basic weapon.
- Full-inventory swaps/returns, unique holders and immutable copy identity.
- Reservation guards and stale holder-generation rejection.
- Frozen roster loadouts, including the basic weapon for an empty hand.

## Verification

Run `cd backend && uv run pytest -q server/tests/test_shared_arsenal_rules.py`
and `cd backend && uv run ruff check .`; inspect `git diff --check`.
Runtime treasury atomicity, SQL races, authenticated clients and persistence
remain unverified until #494/#495 and the wave integration are available.

## Responsibility

- Responsible teammate: Ianno Hollensteiner (`Iannomh123456`).
- Agent assistance: Codex. A different human reviewer remains required.
