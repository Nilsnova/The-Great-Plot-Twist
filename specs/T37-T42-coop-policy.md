# T37 and T42 Co-op policy: permissions, spending and absent members

> **What this is:** the role/action matrix for a shared island (who may act and who pays) and the online/absent/disconnected matrix (what happens when crew members are away), with the server checks that enforce them.
>
> **Who uses it:** every lane that adds an action on a shared island: recovery (T30–T32), the arsenal (T40/T41), rescue (T38), and reviewers of [D043](../docs/DECISIONS.md#d043--co-op-permissions-spending-and-absent-members--2026-11-14).

- **Status:** draft (decision D043 proposed, pending team review)
- **Branch:** `feat/t37-t42-coop-policy`
- **Issue and pull request:** [#25](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/25); PR to be opened; T37 and T42 rows of [OPEN-TODOS §9](../docs/OPEN-TODOS.md#9-defense-and-shared-island-expansion-proposal-14-nov)

## Why

A game is an island: its host is the owner, members are players with an active `island_members` row ([games.py](../backend/server/island/games.py)). The rules for who may act there were spread over `service.py`, `waves.py`, the SQL functions and the lobby. New shared features (persistent repair, the arsenal, rescue) need one place to ask "may this player do this here, and who pays?" and one written answer the team agrees to. Without it, a lane could quietly add a host-only rule, a vote, or a shared wallet.

## Current behaviour (inspected 14 Nov on `main` e044a9b)

- **Server:** every island action on somebody else's island requires host or active member (`403 not_member`); the database functions check membership and "no wave running" again under their own locks. Every paid action charges the clicker's own wallet with a repeat-safe ledger ref; there is no shared or island wallet. Tear-down refunds each payer half of what they paid (`building_payments`).
- **Browser only:** the lobby's Start and the between-waves Pause are room messages (`game_state`): the host may use them, any member once the host has been away 60 s (`frontend/src/island/lobby.js` `canControl`). Who is online is room presence; the server never stores it.
- **Waves:** any member may ring the bell; no quorum. The bell-ringer is the first participant; members join until the first finish or 900 s; every participant finishes for themselves; a wave nobody finishes expires after 900 s with no loot and no change to the best or next wave.

## Role/action matrix (T37)

Roles: **H** host (island owner), **M** active member, **O** outsider (never joined, or left). Nothing needs a vote or the host's approval. "Personal" means the clicker's own wallet. The column "Check" says where the rule is enforced today.

| Action | H | M | O | Funding | When | Check |
|---|---|---|---|---|---|---|
| Look at the island by code (`island_visit`) | yes | yes | no | free | any time | `permissions.require_action` |
| Lobby Start, between-waves Pause/Resume | yes | after host away 60 s | no | free | lobby / break | browser only (pacing, decides no coins) |
| Ring the bell (`wave_start`) | yes | yes | no | free | no wave running | permissions + `wave_start()` |
| Join a running wave (`wave_join`) | yes | yes | no | free | until first finish or 900 s | permissions + `wave_join()` |
| Help a fallen captain up (`wave_revive`) | yes | yes | no | personal (helper pays) | while the wave runs, in the wave | permissions + `wave_revive()` |
| Build (`island_build`) | yes | yes | no | personal | any time (T30 may restrict) | permissions + `island_build()` |
| Upgrade (`island_upgrade`) | yes | yes | no | personal | any time (T30/T47 may restrict) | permissions + `island_upgrade()` |
| Repair in a wave (wall repair input) | participant | participant | no | free today | in a wave | wave simulation (`sim.js`) |
| Rebuild in a wave (wall rebuild input) | participant | participant | no | free today | in a wave | wave simulation (`sim.js`) |
| Persistent repair (`structure_repair`, T31) | yes | yes | no | personal | as T30 decides | reserved: T31 calls `require_action` |
| Persistent rebuild (`structure_rebuild`, T32) | yes | yes | no | personal | as T30 decides | reserved: T32 calls `require_action` |
| Tear down (`island_demolish`) | yes | yes | no | refunds: each payer gets half of what *they* paid | between waves | permissions + `island_demolish()` |
| Research a tier, switch an option (`island_research`) | yes | yes | no | personal | between waves | permissions + `island_research()` |
| Tower skill, house role (`island_tower_skill`) | yes | yes | no | free | any time (applies next wave) | permissions + `island_specialise()` |
| Coins into the wreck (`island_wreck`) | yes | yes | no | personal | any time | permissions + `island_wreck_repair()` |
| Buy arsenal stock (`arsenal_buy`, T40) | yes | yes | no | personal (buyer pays; the copy belongs to the island) | T40 decides | reserved: T40 calls `require_action` |
| Withdraw / return a copy (`arsenal_withdraw`, `arsenal_return`, T40) | yes | yes | no | free | T40 decides | reserved: T40 calls `require_action` |
| Crew, captain level, skills, role, respec, personal weapons | own only | own only | — | personal | respec between waves | personal routes take no `code` |
| Pirate Point builds and waves | everybody | everybody | everybody | personal | — | not an island game |

**Funding rule (no shared wallet):** `permissions.payer_of()` answers the clicker or nobody, never the host or the island. A refund returns to the original payer. A future shared pot would be a new decision, a new wallet reason and a migration; it must not appear by implication (for example, by charging the host for a member's click).

**Simultaneous spends and retries:** unchanged and covered by tests. Each click carries an `actionUid`; a repeat is answered from the ledger and charged once. Two different clicks at once both reach the database function, which locks the island row and decides (for example, the second upgrade of a wall at its top level is `409 max_level`, the second research of a known branch `409 known`). The Python permission check runs on every attempt, retries included: a member who left and retries is refused `403 not_member`; their first charge stands and nothing is refunded or doubled. A membership lost between the Python check and the database call is caught by the function's own check.

## Online/absent/disconnected matrix (T42)

"Online" is room presence in the browsers; the server never knows it, so no server rule depends on it.

| Situation | Rule | Enforced by |
|---|---|---|
| Wave start without the full crew | Allowed; any member may ring; no quorum, no ready-check | server (`wave_start`) |
| Host absent | Members keep building, researching and ringing the bell; Start/Pause pass to any member after 60 s; the host's coins are never touched | server (no host check) + browser (`canControl`) |
| Late entry | A member may join a running wave until its first finish or 900 s after `startsAt`; afterwards `409 wave_over` | `wave_join()` |
| Active-wave dropout | The dropped captain stops acting in the others' simulations; they keep their place as a participant | `wave_participants` |
| Reconnect | Joining again answers the same wave (a participant may rejoin even after the first finish); they finish once | `wave_join()` repeat |
| Leaving the game mid-wave | They may still finish their own fight (the loot is for the fight); they cannot rejoin or help a captain up any more | permissions + `wave_finish()` |
| No remaining players | The wave expires 900 s after `startsAt`: no loot, no change to the best or next wave; the next bell is allowed then | `wave_start()` / `wave_finish()` |
| Difficulty participant snapshot | Wave strength depends on the wave number, the boss rule and the weather stored at the bell, not on crew size. A boss finisher's goal uses the standing participants captured when the finisher starts (`finisher/rules.js`), as decided in D038 | simulation, not server |
| Reward eligibility | Only a participant who finishes earns loot (`403 not_in_wave` otherwise), paid to the caller only; a lost or expired wave pays 0 | `wave_finish()` |
| Absent member progress | No offline coins and no loot for membership. Shared island state (buildings, research, the island's best wave and the unlocks it opens there) is the island's and stays for everybody | island rows |
| Personal unlocks | Follow the waves a player won as a participant; the host's also follow their own island's best wave (D036, see limits) | `Progress.unlock_wave` |

## What

- `backend/server/island/permissions.py`: the matrix as data (`ACTIONS`), `role_of`, `allows`, `payer_of`, and `require_action(admin, owner, player_id, action) -> Permit(role, payer)`, the one helper other lanes call. The refusal keeps the code `not_member` and names the action, for example "Join this game first to take weapons from this arsenal: open its link or type its code."
- `backend/server/island/service.py` and `waves.py`: the existing membership checks now call `require_action` with the action's name (one argument per call site). No route, status code or database call changes.
- `backend/server/tests/test_coop_permissions.py`: every matrix row: outsiders, members who left, members acting without the host, the host without a membership row, personal funding, simultaneous clicks, retries, and the T42 rows.
- [D043](../docs/DECISIONS.md) (proposed), [INTERFACES.md](../docs/INTERFACES.md) refusal note, OPEN-TODOS T37/T42 rows.

## Out of scope

- Changing tear-down so members may only remove what they paid for: kept as the owner decided on 12 Nov (GAME-V3 §4.2); listed as an open question in D043.
- A server-side Pause or presence: Pause stays a browser pacing rule. A server barrier would be a separate design (see D038 limits).
- Kicking members, host transfer, votes: not needed for the agreed matrix; a later decision.
- Arsenal inventory (T40), persistent repair costs (T31/T32), rescue (T38): those lanes call `require_action` and keep personal funding.
- Frontend changes: none; the server's message is already shown on refusals.

## Done when (acceptance checks)

- [ ] `cd backend && uv run pytest -q`: all tests pass, including `test_coop_permissions.py`.
- [ ] `cd backend && uv run ruff check .`: no problems.
- [ ] A reviewer agrees the two matrices and D043 moves from proposed to accepted (or records changes).
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

| Test file | Test name | What it proves |
|---|---|---|
| `backend/server/tests/test_coop_permissions.py` | `test_an_outsider_is_refused_with_the_action_named_and_nothing_runs` (11 routes) | 403 `not_member` with the action's sentence; no database function runs |
| same | `test_a_member_who_left_is_an_outsider_again` (11 routes) | leaving removes every permission |
| same | `test_a_member_may_act_without_the_host_and_acts_as_themselves` (11 routes) | host absence changes nothing; the database is called for the clicker |
| same | `test_nobody_but_the_clicker_ever_pays_there_is_no_shared_wallet` | no action names the host or the island as payer |
| same | `test_two_members_upgrading_one_wall_at_once_...`, `test_a_retry_after_leaving_...` | simultaneous spends and retries charge once and refuse usefully |
| same | `test_a_late_member_joins_...`, `test_a_dropped_participant_reconnects_...`, `test_membership_alone_earns_nothing_...` | the T42 rows |

## Contracts touched

- [x] API endpoints: the `403 not_member` message of the island and wave routes now names the action; code and status unchanged ([INTERFACES.md](../docs/INTERFACES.md#co-op-permissions-t37-and-t42)).
- [ ] Browser events: none.
- [ ] Database tables, policies or functions: none (no migration).
- [ ] Shared lists: none.
- [ ] Content format: none.
- [x] Decisions: D043 (proposed).

## Owner and reviewer

- **Responsible teammate:** Nils (`Nilsnova`); plan by Ianno (`Iannomh123456`)
- **Coding agent used, if any:** a coding agent. The teammate stays responsible for its output.
- **Reviewer (a different human teammate):** to be named in the PR
- **Last updated:** 2026-11-14
