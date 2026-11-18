# MP-ECO-08 Shared-island permission policy

> **What this is:** an isolated server policy for the new island economy, with checked authority reads and tests.
>
> **Who uses it:** the treasury and later purchase, session and combat integrations; existing routes keep their legacy policy.

- **Status:** in progress; isolated policy only, no release or endpoint activation
- **Branch:** `feat/mp-eco-08-permissions`
- **Issue:** [#495](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/495), epic [#492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492)

## Why and scope

The legacy permission module charges the actor's personal wallet and lets any member ring a wave bell. The new economy needs equal invited-member spending rights, owner-only reset/deletion, server-owned session leadership and accepted-bell phase guards. A separate policy keeps those changes from affecting legacy islands before their financial paths are converted.

Add `backend/server/island/economy_permissions.py` for an immutable action matrix, trusted authority/decision values and the new-mode admission helper. Add `economy_authority.py` for strict parsing of the reserved service-only authority RPC. Add focused tests in `backend/server/tests/test_economy_permissions.py` and `test_economy_authority.py`.

## Contract

`require_economy_action(admin, actor_id, island_owner, action, *, expected_epoch=None)` resolves the account through MP-ECO-02's `server.island.treasury.resolve_economy_context`, then loads trusted authority and returns an `EconomyPermit`. Only the read-only `island_visit` action may omit the epoch so it can bootstrap the current context; it still requires current membership before returning a permit. Every supplied epoch must match, and every mutation requires one. The context resolver does not authorize membership. Missing mutation epochs and legacy/unsupported contexts fail closed; there is no host/personal-wallet fallback.

The permit contains `context`, `action`, `role` (`host` or `member`), `funding` (`island_treasury` or `none`), `required_phase` and `is_session_leader`. A funding classification identifies the island account, not a positive debit or an actor-owned wallet. Prices, funds, fees, quota, target validity and actual mutations remain the transaction's job.

The service-only `island_economy_authority(p_actor_id, p_island_owner)` RPC is reserved with MP-ECO-01/02. Its exact row contains `actor_id`, `island_owner`, `is_member`, `reservation_id`, `session_leader_id` and `actor_assignment_wave_id`. Identities and non-null reservation/assignment values are UUID strings; `is_member` is a real boolean. `reservation_id` identifies the accepted wave, including preparation/countdown, through canonical finish/expiry. Session leadership comes from server persistence, never browser presence or a client boolean. Unknown, unavailable or malformed authority must fail closed. MP-ECO-11 supplies persisted leadership/assignment behavior; this task does not invent it.

| Action group | Who | Phase | Account |
|---|---|---|---|
| Read island/treasury | Owner and invited members | Any | No money change |
| Build, upgrade, research/reverse, tower skill/tree, crew, wreck, arsenal buy | Owner and invited members | Outside reservation | Island treasury |
| Demolish | Owner and invited members | Outside reservation | Refund to island treasury |
| Move, arsenal take/swap/return | Owner and invited members | Outside reservation | No money change |
| Reset/delete island | Owner only | Outside reservation | Reset transaction owns grant/account handling |
| Wave start, break pause/resume | Current server session leader, also a member/owner | Outside reservation | No money change |
| Auto-next setting | Current server session leader, also a member/owner | Any; affects the next reservation only | No money change |
| Bet | Owner and invited members | Any | Island treasury; no additional policy cap |
| Paid instant structure repair | Owner and invited members | Reserved wave | Island treasury |
| Combat inputs, timed teammate revive | Assigned participant, also a member/owner | That reserved wave | No money change |
| Personal role/skill reassignment | Authenticated Captain owner; shared-island helper also checks membership | Any island phase, but no personal reserved/live assignment anywhere | No money change; preserve Engineer commitment |

Every **new player action** checks current membership. Owner identity determines the owner role even without a redundant membership row; it does not confer session leadership. A leader gains no reset/delete privilege. Anonymous status is not an authorization field. There is no co-manager, vote or per-purchase approval.

The read refusal codes are `403 not_member`, `403 not_owner`, `403 not_session_leader`, `403 not_in_wave`, `409 wave_running`, `409 wave_not_running`, `409 captain_assigned`, `409 engineer_bound`, `409 economy_context_required`, `409 economy_epoch_mismatch` and `409 economy_path_unavailable`. Existing database transport failures retain their unavailable status. Changing auto-next cannot pause or alter the current reservation, its outcome or real-world betting clocks; its later setter must enforce that scope.

Personal profile changes depend on the player's own assignment, not a spectated island's reservation. An unassigned spectator can prepare a future profile. MP-ECO-07 must also call `require_captain_role_binding(engineer_commitment_id=..., resulting_role=...)` using the pending commitment loaded under the personal mutation lock: a bound Captain cannot select another role or clear Engineer through respec, but can reassign skills while retaining Engineer. Generic preflight has no intended role or commitment record and does not replace that domain guard. Standalone personal-profile endpoints use authenticated Captain ownership rather than requiring an unrelated island account; they are later integration work.

Saved-origin refunds, rewards and wager settlements are deliberately not player actions in this matrix. Their transaction loads its own durable authorization, original account and epoch; current membership/leadership/phase must not redirect or block the automatic settlement. No client-selected `settlement` or `authorized` flag bypasses admission. MP-ECO-02 and the financial integrations own stored-origin validation and exactly-once settlement.

The Python read is advisory: context and authority are separate reads. Each later mutation RPC must repeat membership/owner/leader, account/epoch, accepted reservation and relevant personal assignment checks under its mutation locks. This task supplies no SQL race protection, new live routes or write RPC.

## Tests to write first and acceptance

- [x] Equal member rights include research reversal, demolition and whole-treasury betting in any phase; no Captain or revive coin funding.
- [x] Outsiders/departed members cannot gain rights through ownership claims, session-leader fields or a settlement action name.
- [x] Owner reset/delete and leader-only session controls remain separate.
- [x] Preparation/countdown reservations block permanent changes, including owner operations; repairs/revive require a reservation and participant actions require the matching assignment.
- [x] Personal respec cannot bypass an active assignment on another island; an unassigned spectator may prepare a future profile. Bound Engineer role clearing/switching is refused by the personal domain guard.
- [x] Authority reads reject missing/extra fields, coercible booleans, invalid/mismatched identities and unavailable RPC responses.
- [x] Account/epoch resolution fails closed; no admission branch calls legacy personal payment helpers.
- [x] `cd backend && uv run pytest -q server/tests/test_economy_permissions.py server/tests/test_economy_authority.py server/tests/test_coop_permissions.py`
- [x] `cd backend && uv run pytest -q` and `uv run ruff check .`: actual scope/results recorded below.
- [x] No secrets, generated files, live migration, publication or route activation in the diff.
- [ ] Different human reviewer approves before any later authorized merge.

## Out of scope and handover

MP-ECO-02 provides account resolution and treasury transactions. MP-ECO-11 provides session/roster/assignment persistence. MP-ECO-03–16 wire individual guarded mutations and stored-origin settlement; their SQL must enforce this matrix atomically. No claim of completed API/database/UI integration is made by passing isolated tests. Existing `permissions.py`, service/routes, flags and personal wallet behavior remain unchanged. The foundation interfaces and their later route/transaction integration must also be documented in INTERFACES.

## Verification

Tests were written first and initially failed with two expected import errors for the absent production modules. Epoch bootstrap, spectator profile changes and Engineer-binding cases were also observed failing before their implementation.

- Final focused command: `uv run --no-sync pytest -q server/tests/test_economy_permissions.py server/tests/test_economy_authority.py server/tests/test_coop_permissions.py` — **152 passed in 5.38s**.
- Full backend command: `uv run --no-sync pytest -q` — **536898 passed, 304 skipped in 461.17s**. This broad run collected the initial isolated policy before the final auto-next, read-bootstrap and personal-profile refinements; the final focused run above verifies those changes and the existing co-op behavior.
- Final lint command: `uv run --no-sync ruff check .` — **All checks passed**.
- `git diff --check`: passed.
- After merging `origin/main` at `f0c64442`, the same focused command passed again: **152 passed in 6.67s**. Targeted Ruff and diff checks passed; the merge changed no permission-policy source.

These commands ran from `backend/` with a writable UV cache and the already installed project environment; `--no-sync` changed no dependencies or lockfile. Persisted authority RPCs, atomic mutation checks, stored-origin settlement and route/UI integration remain unverified and are not activated by this change.

## Owner and reviewer

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`)
- **Coding agent:** Codex; the responsible teammate remains accountable.
- **Reviewer:** a different human teammate before merge, following CONTRIBUTING.md.
- **Last updated:** 2026-11-18
