# WALL-28 — trusted owner policy in views and existing actions

Responsible human: Johannes Franz Lang (`frcola`). Tracks [WALL-28 #284](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/284). Dependency-only base `chore/wall-28-view-dependencies` contains the separately reviewed WALL-06/07/03 slices; this branch adds owner-view and action integration.

## Plan and ownership

1. Read atomic policy/layout snapshots for game views; preserve existing pure view-call compatibility.
2. Adapt owner catalogue capacity, show only built/positioned additional pieces and fail on missing paid-piece coordinates.
3. Expose wall policy metadata independently of fixed/stored layout version and retain owned coordinates with placement paused.
4. Let existing upgrade, specialization and demolition recognize admitted pieces; refuse old unpositioned new-ID builds before charge.
5. Extend the shared HTTP fake and exact Move/view assertions without hiding the new CAS fields.
6. Run focused backend/routes tests, Ruff and diff/content checks; hand off to actual SQL/browser lifecycle verification.

Owned files: service.py, only LayoutOut/layout_out route hunks, shared island_helpers.py fake, focused tests. The integration owner keeps new enable/quote/build routes and positioned wall construction.

## Status

Implemented in Draft [#285](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/285). API island/visit/action views use owner capacity and accepted positions, hide unbuilt added inventory, and fail if a built added piece has no saved coordinate. Pausing placement retains paid coordinates while the Move control follows its flag. Existing upgrades, wall skills and demolition use the owner cohort; the old unpositioned build refuses added IDs before charging.

`service.placed_view` shares the same owner layout semantics across own and visit responses. `catalogue_for_owner` adapts existing additional-piece actions only after permission/owner resolution. The shared HTTP fake now models atomic read and expected-policy/raw-row Move fences; exact route assertions include the new CAS fields. Missing policy RPC fails closed, so migration-first deployment is required.

Executed from backend with the existing project environment and workspace uv cache:

```sh
uv run --frozen --no-env-file pytest -q server/tests/test_owner_wall_policy_routes.py server/tests/test_island_move_routes.py server/tests/test_island_routes.py server/tests/test_demolish_routes.py server/tests/test_tech_hub_routes.py server/tests/test_tower_skill_price_routes.py
uv run --frozen --no-env-file ruff check server/island/service.py server/routes/island.py server/tests/island_helpers.py server/tests/test_island_move_routes.py server/tests/test_owner_wall_policy_routes.py
uv run --frozen --no-env-file ruff format --check server/island/service.py server/routes/island.py server/tests/island_helpers.py server/tests/test_island_move_routes.py server/tests/test_owner_wall_policy_routes.py
```

Results: **109 passed in 7.52s**; Ruff **All checks passed!**; format **5 files already formatted**. The first new-action test used an incorrect route path; it was corrected to the actual existing tower-skill endpoint, preserving the behavior assertion. No assertion was weakened, test removed or test skipped. `git diff --check` passed.

The HTTP fake is API wiring evidence, not proof of actual SQL effects, payments, concurrency, live rollback or a running builder. No UI code was changed by this slice; real desktop/phone lifecycle screenshots remain an integration gate.

Explain-back: I use the island owner policy rather than the visiting player policy. A paid wall must retain its real coordinate even when new offers are paused. I leave new empty pieces out of the spatial view, and let the existing five-level rules quote upgrades after the owner cohort is selected.

Questions: Why is the owner policy used during a visit? Why must missing coordinates fail instead of placing a wall at the origin? Why does a larger catalogue not make the old unpositioned build safe?

Remaining: real SQL mutation/concurrency proof, positioned construction, actual builder and full perimeter lifecycle. No live migration application, activation, deployment or merge.

## Paused D060 offers retain occupancy

For rule 1, server read/Move geometry includes all fourteen non-wall sites, even when the four D060 offers are paused. `layout.reservedPositions` exposes the actual/default coordinates of those four unoffered sites as read-only occupancy metadata. It grants no new purchases or control, and ordinary Move still rejects an unoffered D060 ID. Legacy rule 0 keeps its previous geometry behavior. This preserves occupancy; it does not claim the broader D060 kind/availability decision is solved.

Follow-up regression: a paid `cannon_8` moved to (-4,-9) while its offer is off remains reserved at that coordinate; moving a wall there refuses before the write. The first Move fixture accidentally included an unrelated action UID; using the actual strict Move body corrected the fixture without weakening the 409 occupancy assertion.

Final expanded command adds `server/tests/test_wall_policy_layout.py server/tests/test_wall_layout_snapshot.py` to the focused pytest command above: **159 passed in 8.10s**. Ruff check passed on all seven changed Python files; format check reported **7 files already formatted**. SQL/actual browser gates remain separate.
