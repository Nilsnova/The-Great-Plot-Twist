# MP-ECO-12: Shared combat repairs and free revival

> **What this is:** isolated repair and revival policy preparation for the versioned shared island economy.
>
> **Who uses it:** the combat transaction implementation and its reviewers.

- **Status:** policy preparation complete; runtime integration is blocked by treasury and permission prerequisites.
- **Branch:** `feat/shared-repairs-free-revival`
- **Issue:** [#502](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/502)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Coding assistance:** Codex. A different human reviewer remains required.

## Scope and behavior

Prepare pure server-side policies in `backend/server/island/shared_repair_rules.py` and
`shared_revival_rules.py`, with focused pytest coverage. Existing routes, personal wallets,
legacy/class behavior, database functions and feature flags remain unchanged in this package.

A new paid repair is permitted only during an accepted reservation, including countdown.
It restores the selected existing structure to full health at the frozen current-level
catalogue increment, with no Engineer discount. The island shares three successful repairs.
A stale recovery epoch, phase, wave, instance, level, repair cursor or price refuses the
operation. Invalid/intact targets and failures consume no quota. A previously successful UID
returns its original operation without another heal, debit or use, including after later damage.
The existing immutable intent fingerprint is reused; quote cursors are concurrency guards.
The policy produces a repair plan only: it never changes a balance, HP, ledger or event journal.

Revival remains a timed, in-range help action between eligible frozen participants. Its
policy requires the authoritative uninterrupted hold interval and current target fall. It
produces a zero-coin plan and binds repeat detection to actor, UID, wave, target and fall tick.
It never reads a wallet or treasury, so a zero balance cannot prevent helping a teammate.
The existing simulation's frozen hold duration, reach and restored-HP rule are supplied by
the caller; this package introduces no new role balance values.

## Integration boundaries

The required treasury and permission modules from [#493](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/493),
[#494](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/494) and
[#495](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/495) are not available in the base revision.
No replacement economy context, treasury, permission, receipt ledger or epoch API is introduced.
The new dataclasses describe combat policy inputs and outputs only, not persistence or wire contracts.

The eventual transaction must call `require_economy_action` for the authenticated actor,
require explicit economy run epoch, and recheck membership/context plus these rules atomically
under the shared lock order. Recovery `expectedEpoch` and economy `runEpoch` are distinct guards;
matching one does not validate the other. Repairs debit the account's available funds through
the common treasury implementation in the same transaction as HP/event/quota/receipt changes.
Revival must claim the unique wave/target/fall and append its ordered event atomically without
any wallet transaction. Policy prechecks alone do not establish concurrent correctness.

Canonical win, loss, abandonment and expiry continue through the existing full wave-end
restoration. No between-wave bill, gradual-repair offer or ETA is introduced. Route/client
integration, both wave protocols, SQL concurrency, account reset and authenticated browser
acceptance remain pending; fixture checks are not runtime acceptance.

## Tests before implementation

`backend/server/tests/test_shared_repair_rules.py` covers countdown, frozen prices,
three-success quota, stale guards, intact/invalid structures, immutable retries after later
damage, altered UID reuse and side-effect-free plans.
`backend/server/tests/test_shared_revival_rules.py` covers zero-cost revival, ordinary/Medic
hold times, range and fall identity, invalid/ineligible/withdrawn participants, immutable
retries, changed UID payloads and stale/finished-wave refusal.

## Verification

Actual local checks:

- `cd backend && uv run pytest -q server/tests/test_shared_repair_rules.py server/tests/test_shared_revival_rules.py`: **69 passed**.
- `cd backend && uv run pytest -q server/tests/test_structure_repair_rules.py server/tests/test_structure_repair_service.py server/tests/test_structure_repair_routes.py server/tests/test_wave_revive_routes.py server/tests/test_structure_recovery_routes.py server/tests/test_wave_recovery_routes.py`: **98 passed**.
- `cd backend && uv run ruff check .`: passed.
- `git diff --cached --check`: passed; complete new module/test/spec diff reviewed.

No SQL concurrency, shared-economy runtime or authenticated browser check is claimed for
these policies. Those require the atomic integration and prerequisites above.
