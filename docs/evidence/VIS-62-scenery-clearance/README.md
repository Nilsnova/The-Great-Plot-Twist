# VIS62: wall clearance around existing scenery

Responsible human: **Johannes Franz Lang (`frcola`)**.
Issue: [#439](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/439).
Branch: `fix/vis-62-scenery-clearance`.
Base: `1bce43099cc4e78781faa0b74051d331bfe85e24`, the current-main-preserving review.

## Agreed scope

Reject future explicit wall placements whose paid footprint intersects an existing
tree trunk or a fixed prop's ground reserve. Keep the client preview, local fake
transactions and trusted Python quote/move validation consistent. Existing paid
coordinates, reads, receipts, legacy settlement, route admission, physical
colliders and combat remain unchanged. No SQL, live migration, deployment or new
dependency is required.

The original 102-piece fixture contains nine wall/tree intersections. It remains
historical evidence. The coordinator owns a separately named obstacle-aware
review fixture and actual before/after browser captures.

## Result and limits

Implementation: [Draft #443](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/443).
The first working change is `5aa4d6f4`; `a4f98995` binds progress reserves to real
Three.js milestone anchors, and `918aaa5f` follows the actual ordinary-prop sites
in regression cases. [Exact final code identities](source.json) distinguish the
five unchanged read/route/settlement procedures from the changed validator.

This branch prevents a **new explicit wall intent** from sharing ground with a
tree or fixed prop. It does not move, demolish, refund or hide a previously paid
wall. Existing conflicting coordinates remain readable and can be moved out by
the player. A backend no-op move to its current position remains a no-op. Towers
and houses retain their existing rules; this leaf does not add walking colliders
to decorative objects or redesign their footprints.

## Why the old image crossed objects

The old perimeter fixture measured land and non-wall build reservations but did
not include the actual tree blockers. Both the trusted Python validator and the
client copy omitted scenery. Eight of nine tree centers, plus five prop centers,
could receive a wall under policy 1. The ninth tree was only incidentally protected
by the wreck's existing keep-out box.

The historical 102-piece ring intersects five tree circles at nine wall cells:

| Tree center | Conflicting wall centers |
|---|---|
| `(-13,-12)` | `(-12.5,-12)` |
| `(-9,-17)` | `(-8.5,-16)`, `(-8.5,-18)` |
| `(9,-17)` | `(9.5,-18)`, `(9.5,-16)` |
| `(14,11)` | `(13.5,10)`, `(13.5,12)` |
| `(-12,13)` | `(-12.5,14)`, `(-12.5,12)` |

Reducing a crown's visual scale cannot correct these ground intersections. The
coordinator owns a new obstacle-aware fixture and actual-game screenshots; the
original fixture and its earlier images remain unchanged historical evidence.

## The rule and its authority

[`wall-obstacles.js`](../../../frontend/src/island/wall-obstacles.js) contains
fourteen immutable placement-only reserves, mirrored in the trusted
[`island_layout.json`](../../../backend/content/island_layout.json) catalogue.
The client and server regression checks compare the copies. Frontend tests also
compare tree/prop anchors with the actual scene data and instantiate the real
progress decorator to verify both milestone feet.

The wall's existing 2-by-2 paid footprint is tested against each reserve. For a
tree, distance from the trunk center to the nearest point of that square must be
at least the existing radius `0.48`. For a prop, two ground boxes must not overlap.
Touching edges remain legal; the new rule does not require a decorative gap between
ordinary wall neighbors.

| Reserve in this source | Ground shape | Basis |
|---|---|---|
| Nine trees | Existing radius-`0.48` circle | Exact existing trunk collider; excludes the canopy. |
| Bench `(4,13)` | `2.5 × 0.75` | Its original approximately 40-pixel seat/shadow width at 16 logical pixels per world unit, with a shallow ground base. |
| Barrel `(-12,7)` | `1.25 × 0.75` | Its original approximately 18–21-pixel base/body width, rounded to a compact ground reserve. |
| Lantern `(-3,12)` | `0.5 × 0.5` | Small standing pole base; its tall lantern artwork does not become a ground rectangle. |
| Record board `(-3.5,2.5)` | `1.5 × 0.75` | A shallow standing-board base; excludes its upright height. |
| Future statue `(4,5.5)` | `2.5 × 1` | Its existing wide plinth/shadow, reserved before the cosmetic milestone appears. |

These prop dimensions are bounded prospective placement choices for the user’s
wall-overlap fix, not newly discovered physical colliders. A separate cosmetic
relocation may change a prop's scene/reserve anchor together; that follow-up must
retain parity and its own evidence. This source keeps the original barrel site.

[`placement.js`](../../../frontend/src/island/placement.js) checks scenery only
for explicit wall moves, after the existing grid/land/lane/fixed-building checks.
The local fake quote and paid build already call that same function.
[`layout.check_move`](../../../backend/server/island/layout.py) applies the
equivalent check to trusted wall quotes and moves, including inventory wall IDs.
Legacy wall intents still require their existing pirate lane.

The new reserves are deliberately **separate from `KEEP_OUT`**. They are never
fed into `blocked_cells`, `route_open`, `wall_fits`, `settle_walls` or
`positions_of`. [Source hashes](source.json) establish that those five Python
procedures are unchanged. Existing client route/position procedures and scene
data are also untouched. Thus reading or admitting an old island does not silently
relocate walls, and this leaf changes no deterministic combat, route or collision
rules.

The server re-quotes an uncommitted purchase using current geometry before calling
`island_wall_build`. The existing SQL migration
`20261117145000_wall_chain_build.sql` delegates geometry to Python and fences the
checked layout rows under its existing locks. The move migration
`20261117140000_wall_policy.sql` likewise fences the checked snapshot. Static
scenery cannot race another player's move, so these fences need no SQL change.
The original receipt lookup remains **before** current quote validation: retrying
an already committed old purchase returns its immutable receipt and current state,
without rebuilding or charging again. The regression explicitly emulates the old
validator for a historical purchase and then restores the current validator.

## Executed checks

Raw bytes are retained under [raw/](raw/), with twenty original-file hashes in
[originals.json](originals.json). Results are scoped to this leaf; none is a claim
that the assembled game or complete application suites are green. Authored
whitespace checks pass. Original pytest trace whitespace is retained unchanged
and recorded separately in [the static receipt](static-checks.json).

| Check | Exact result |
|---|---|
| Tests-first frontend, old implementation | `16 failed / 2 passed (18)`, 833ms. Includes real wrong approvals and the then-missing data contract. |
| Tests-first backend, old implementation | `18 failed in 2.27s`. Some cases require the new data field as well as the refusal behavior. |
| Final focused frontend | `19 passed (19)`, one file, 685ms. Includes client/fake refusal, unchanged old coordinates, legacy lane behavior and historical receipt replay. |
| Final focused backend | `19 passed in 1.55s`. Includes HTTP refusal before paid/move RPCs and historical receipt replay. |
| Whole backend Ruff | `All checks passed!` The first three formatting diagnostics are also retained, followed by corrected results. |
| Broader frontend selection on `5aa4d6f4` | `2 failed / 162 passed (164)`, two failed / seven passed files, 4.43s. Both failures still use the obstructed historical 102-wall construction fixture. |
| Broader backend selection on `5aa4d6f4` | `3 failed, 171 passed in 7.98s`. All three failures quote the obstructed historical ring. |
| Build on `5aa4d6f4` | Exit 0, 2.21s process / `built in 1.23s`; spoiler guard: 245 files / 12 protected lines, no suspect elimination data. |
| Title budget | Exit 0, 0.43s: JS `18,959 / 21,080`, CSS `9,410 / 12,000`, no title image. |
| Text lint | Exit 0, 1.75s: 4,579 candidate strings / 536 source files, `0 errors, 8 report-only findings`. |

The final source's frontend runtime tree matches the built source. The later
backend annotation and stronger tests do not alter the validated geometry.
The original early 18-case green passes and later strengthened 19-case passes are
retained separately; their counts are not combined.

Commands from `frontend/`:

```bash
npm test -- --maxWorkers=1 tests/island/scenery-clearance.test.js
npm test -- --maxWorkers=1 tests/island/scenery-clearance.test.js tests/island/placement.test.js tests/island/move-mode.test.js tests/island/wall-cohort.test.js tests/island/wall-policy-preview.test.js tests/island/wall-runs-fake.test.js tests/island/wall-builder.test.js tests/island/wall-builder-preview.test.js tests/island/perimeter-wave-flow.test.js
npm run build
node scripts/report-budget.js --check
node ../scripts/text-lint/index.mjs
```

Commands from `backend/`, using the existing installed environment without syncing
dependencies or loading an environment file:

```bash
UV_CACHE_DIR=/workspace/.cache/uv UV_PROJECT_ENVIRONMENT=/workspace/The-Great-Plot-Twist/backend/.venv uv run --frozen --no-env-file --no-sync pytest -q server/tests/test_wall_scenery_clearance.py
UV_CACHE_DIR=/workspace/.cache/uv UV_PROJECT_ENVIRONMENT=/workspace/The-Great-Plot-Twist/backend/.venv uv run --frozen --no-env-file --no-sync pytest -q server/tests/test_wall_scenery_clearance.py server/tests/test_island_layout_rules.py server/tests/test_wall_policy_layout.py server/tests/test_wall_layout_snapshot.py server/tests/test_island_move_routes.py server/tests/test_owner_wall_policy_routes.py server/tests/test_wall_chain.py server/tests/test_wall_offer_routes.py server/tests/test_wall_build_routes.py
UV_CACHE_DIR=/workspace/.cache/uv UV_PROJECT_ENVIRONMENT=/workspace/The-Great-Plot-Twist/backend/.venv uv run --frozen --no-env-file --no-sync ruff check .
```

## Remaining integration and review

The coordinator must wire a new valid full-perimeter fixture into the active paid
construction proofs, retaining their full perimeter/payment/frozen-wave coverage.
The five old-fixture failures are not fixed by skipping a test or deleting an
assertion. This leaf intentionally does not edit the shared historical fixtures.

No Chrome, screenshots, accessibility/demo browser checks, full frontend/backend,
real PostgreSQL or production service was run by this writer. Coordinator-owned
combined checks and original actual desktop/phone before/after captures remain
separate. No live SQL, deployment, new dependency, account or PR merge occurred.

## Explain-back

I added a check before a new wall is accepted. The wall uses its existing paid
square, while trees use their existing small trunk circles and props use shallow
ground reserves. I kept those reserves out of route finding and old-save
settlement, so opening a save cannot move a wall or change a wave. A retry checks
an old payment receipt first because the player must not pay twice, even if the
old purchase would be refused under today's stricter scenery rule.

1. Why is a tree's canopy not the same as its ground blocker?
2. Why must these reserves stay out of legacy settlement and route finding?
3. Why does receipt reconciliation run before today's placement validation?

This PR remains Draft. Responsible-human explain-back, visual acceptance and a
different human's review are still required; no approval or readiness is claimed.
