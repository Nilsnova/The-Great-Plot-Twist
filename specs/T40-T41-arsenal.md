# T40/T41/T44 Shared island arsenal

> **What this is:** the arsenal building on every island, where the crew keeps up to 20 shared weapon copies, with atomic buy, take, swap and return on the server, behind the flag `arsenal`.
>
> **Who uses it:** every captain on an island (and its crewmates); the co-op permission lane (T37) and the absence lane (T42), which replace the policy assumptions recorded here.

- **Status:** in review (implementation done on the branch; merged in PR #51; the migration is applied live (14 Nov 2026) and the flag `arsenal` has been on since that evening, release check PR #53)
- **Branch:** `feat/t40-t41-arsenal`
- **Issue and pull request:** opened by the coordinator for Nils (`Nilsnova`); plan by Ianno (`Iannomh123456`), [BUILD-PLAN section 6](../docs/BUILD-PLAN.md#6-defense-and-shared-island-expansion), [OPEN-TODOS section 9](../docs/OPEN-TODOS.md#9-defense-and-shared-island-expansion-proposal-14-nov)
- **Decision:** [D042](../docs/DECISIONS.md#d042--shared-island-arsenal-20-stored-copies-and-the-weapon-table--2026-11-14) (proposed)

## Why

Weapons were a personal list (`islands.weapons_owned`): bought once, equipped by one player, invisible to the crew. The defense roadmap asks for a physical arsenal on the island with a hard storage limit and exclusive possession, so that weapons become shared, tactical stock. Money and inventory must stay server-decided and survive retries, races and disconnects.

## What

- **Data model** (`supabase/migrations/20261114120000_arsenal.sql`): `arsenal_copies` (one row per copy: id, rack number, type, `holder` null = stored or the one captain who carries it) and `arsenal_moves` (one row per click, keyed by player and actionUid). One `holder` column makes "stored and carried" or "carried by two" impossible; a unique index allows one copy per captain per island; a deferred constraint trigger refuses a 21st stored copy at commit.
- **Atomic operations**, each a database function that locks the island row (a buy locks the buyer's wallet first):
  - `arsenal_buy`: a new copy paid from the **buyer's own coins** (wallet reason `weapon_purchase`, ref `arsenal:<actionUid>`): into the buyer's hands when empty, else onto the rack (needs a free slot).
  - `arsenal_take`: a withdraw with empty hands, or a **swap** (the carried copy goes back first, in the same step, so a full rack still allows it).
  - `arsenal_return`: the carried copy back on the rack; **a full rack refuses** (`arsenal_full`) and the copy stays in the captain's hands.
  - `arsenal_state`: the arsenal now. It also returns copies of captains who **left** the game to the rack while there is room, and converts the island owner's old personal weapons.
- **Permission helper:** `backend/server/island/arsenal_policy.py` maps look/buy/take/return onto T37's merged `permissions.require_action` (`island_visit`, `arsenal_buy`, `arsenal_withdraw`, `arsenal_return`; D043: host and members, the buyer pays). The database repeats the rule under the lock in `arsenal_may()`; change both together.
- **Server:** `backend/server/island/arsenal.py` (service), `arsenal_rules.py` (rack size, refusals), `arsenal_store.py` (database answers), `backend/server/routes/arsenal.py` (`GET /api/island/arsenal`, `POST /api/island/arsenal/buy|take|return`), flag `arsenal` in `backend/server/flags.py`.
- **Building:** `frontend/src/island/spots.js` (`ARSENAL`, at x −5.5, z −11.5, between the watchtower hill and the west house), original art `frontend/src/art/arsenal.js` (`island-arsenal`, registered in `src/art/registry.js`), drawn by `world.js`, walk-near / E / tap like the Tech hub (its own zone, "Walk closer" from `clickVerdict`).
- **Card:** `arsenal-model.js` (pure), `arsenal-ui.js` (DOM), `arsenal.js` (controller), `arsenal-api.js` (calls with held click ids); docked like the Tech hub. Shows what you carry, "Stored: n of 20", every copy with its number and holder ("left the game" too), Take/Swap/Return, each type's damage, range and reload at your captain level, price, unlock and the full / locked / wave-running / short-of-coins reasons.
- **Loadout:** the wave reads `captainLoadout().weapon` = the copy you carry on the island on screen, else the musket. Before every wave (`refreshDefended`), on landing and after a crewmate's move (`island_changed` in the room) the arsenal is read again.
- **Fake server:** `frontend/src/island/arsenal-fake.js` (the same rules in memory), wired into `src/pirates/fake-api.js`; dev with `?islands=fake&arsenal=1`.

**Files changed (small, additive edits):** `backend/server/app.py`, `flags.py`, `routes/island.py` (the old buy answers `409 use_arsenal` while the flag is on), `frontend/src/game.js` (passes the flag), `src/island/index.js`, `ui.js`, `world.js`, `spots.js`, `island.css`, `src/art/registry.js`, `src/pirates/fake-api.js`. `frontend/src/pirates/sim.js` and `backend/server/island/service.py` are untouched.

## Policies decided here (D042)

| Question | Decision |
|---|---|
| Placement (T36) | The arsenal is a fixed building: its 5 × 3 footprint is a `keepOut` box in `backend/content/island_layout.json` and `frontend/src/island/placement.js`, so Move mode never puts a wall or tower on it (also while the flag is off). |
| Unlock / build cost / damage | Stands from the start, free, never damaged (waves do not target it; T30/T33 may change this). Each type keeps its own unlock wave. |
| Standard weapon / new entrants | The musket is standard issue: every captain who carries no copy shoots with it. It is never a copy and takes no slot. A new member starts with the musket. |
| Who may | The host and every active member, as D043's matrix says (`permissions.py`); `arsenal_may()` in SQL repeats it. |
| Who pays | The buyer, from their own coins. No shared wallet. |
| Where a bought copy goes | Into the buyer's hands if empty, else onto the rack; with a full rack and full hands the buy is refused before charging. |
| Full rack | Return refused (copy stays in hand); swap allowed; buy into empty hands allowed. |
| Disconnect / reload | Nothing changes: a held copy stays with its holder. |
| A holder leaves the game (T42 may change) | They keep it until the arsenal is next used; then it goes back on the rack while there is room (lowest rack number first). Never deleted. |
| During a wave | No buy, take, swap or return (`wave_running`): a fight keeps the loadout it started with. |
| Island transfer | Copies belong to their island. On another island you carry that island's copy or the musket. One copy per captain per island. |
| Defeat | Changes nothing in the arsenal (T38 may change). |
| Account deletion | The copy that account carried is deleted with it (D022); every other path keeps every copy. |
| Old personal weapons | Converted lazily, the first time the owner's island arsenal is opened with the flag on: equipped one carried, others stored. Nothing is converted at migration time, so the old shop keeps working while the flag is off. **When the flag is switched on, run `select public.arsenal_convert_personal_weapons();` once** (repeat-safe); the lazy conversion stays as a safety net. |

## Out of scope

- New weapon mechanics: the four existing types already differ (D042 table); a new mode needs `sim.js` (another lane's file) and its own PR (T44 follow-up).
- Recall from an absent member who has not left, votes, shared funding: T37/T42.
- Flexible placement of the arsenal: T36 (it is one fixed footprint for now).
- Server-side validation of the weapon in each `captain_shot` room message: the room trusts its clients today (existing model); see Limits.

## Done when (acceptance checks)

- [x] `cd backend && uv run pytest -q`: all pass (arsenal route tests included).
- [x] `cd backend && CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql`: the 23 arsenal invariant checks and every other island SQL check pass.
- [x] `cd backend && uv run ruff check .`: no problems. SQL parse check (ENGINEERING 4.2 step 9) passes.
- [x] `cd frontend && npm test && npm run build`: pass.
- [x] Done live on 14 Nov 2026: the migration was applied (supabase/README.md, "The arsenal migration"), `arsenal` was added to `FEATURE_FLAGS`, and `select public.arsenal_convert_personal_weapons();` was run once (1 copy converted, 0 islands left with personal weapons).
- [x] Two-browser release check: `npm run test:arsenal` (PR #53, fake server with the migration's rules); not repeated against the real project.
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

| Test file | Test name | What it proves |
|---|---|---|
| `backend/server/tests/island_sql/test_arsenal_sql.py` | `test_slot_19_and_20_fill_and_the_21st_stored_copy_is_refused_without_charging` | the 20-slot cap, no charge on refusal |
| same | `test_the_database_itself_refuses_a_21st_stored_copy` | the commit-time trigger guard |
| same | `test_a_copy_is_never_stored_and_carried_and_never_carried_twice` | exclusive possession |
| same | `test_a_swap_needs_no_free_slot_and_keeps_the_rack_full` | atomic swap on a full rack |
| same | `test_a_return_into_a_full_rack_is_refused_and_the_copy_stays_in_hand` | full-storage return loses nothing |
| same | `test_a_departed_captain_keeps_the_copy_until_the_sweep_puts_it_back`, `test_the_sweep_never_overfills_the_rack`, `test_a_reload_or_disconnect_changes_nothing` | leave / disconnect |
| same | `test_a_repeated_buy_charges_once_and_makes_one_copy`, `test_a_repeated_take_and_return_change_nothing`, `test_a_click_id_used_for_another_action_is_refused` | retries |
| same | `test_two_captains_claiming_one_copy_at_once_get_it_once`, `test_simultaneous_returns_into_the_last_free_slot_store_one`, `test_the_same_buy_sent_twice_at_once_charges_once` | concurrency on committed data |
| same | `test_too_few_coins_and_a_locked_type_change_nothing`, `test_no_move_while_a_wave_runs`, `test_only_members_use_the_arsenal`, `test_applying_the_migration_converts_nobody_and_the_first_look_converts` | rollback, wave guard, permission, conversion |
| `backend/server/tests/test_arsenal_routes.py` | flag off hides everything and keeps the old shop; prices/unlocks come from the file; refusals map; capacity and policy match the SQL | routes and contract |
| `frontend/tests/island/arsenal.test.js` | fake rules (19/20/21, full return, two captains, same-type copies, repeats), card states, held click ids, controller loadout, zone and art | client |
| `frontend/tests/island/arsenal-dom.test.js` | E opens the card; buy, swap, return in Chromium; loadout follows; flag off keeps the old shop | interaction |

## Contracts touched

- [x] API endpoints: `GET /api/island/arsenal`, `POST /api/island/arsenal/buy|take|return` (contract in `backend/server/routes/arsenal.py`); `POST /api/island/weapon/buy` gains `409 use_arsenal` while the flag is on.
- [x] Browser events: `arsenal_changed {carried}` (local); `island_spots_changed` with `spot: "island_arsenal"` (existing event, the room's `island_changed`).
- [x] Database tables, policies or functions: `arsenal_copies`, `arsenal_moves`, `arsenal_*` functions; policy matrix in `supabase/README.md`.
- [x] Shared lists: flag `arsenal` (`FLAG_NAMES`, `.env.example`). No new wallet reason (reuses `weapon_purchase` with the new ref prefix `arsenal:`).
- [ ] Content format: none (prices and unlocks stay in `backend/content/islands.json`).
- [x] Decisions: D042 (proposed).

## Limits

- Combat stays client-simulated: a modified client could still send another weapon id in `captain_shot`. Honest clients read their copy from the server before each wave and after each move, and moves are refused during a wave, so a released copy is never used by an up-to-date client; a stale tab picks the new state up at the next wave's preparation.
- A member who stays in the game but never returns a copy keeps it (recall is T37/T42).
- Mixed versions: until the new server is deployed and the flag is on, nothing changes. If an old server keeps selling personal weapons after the flag is on, `arsenal_state` converts them on the next look.

## Owner and reviewer

- **Responsible teammate:** Nils (`Nilsnova`)
- **Coding agent used, if any:** Claude Code. The teammate stays responsible for its output.
- **Reviewer (a different human teammate):** to be named in the PR
- **Last updated:** 2026-11-14
