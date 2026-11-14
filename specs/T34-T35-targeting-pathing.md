# T34 T35 Enemy targets, walls, gaps and rerouting

> **What this is:** the contract for what enemies on foot attack (T34) and how they find their way across walls with gaps, breaches and rebuilt walls (T35), plus the pure, tested modules that implement it, ready to be wired into `sim.js`.
>
> **Who uses it:** the enemies-and-layout lane, the recovery lane (T30–T33, which owns `sim.js` right now), the placement lane (T36) and the reviewer.

- **Status:** draft, design and modules in review; not wired into the game yet
- **Branch:** `feat/t34-t35-targeting-pathing`
- **Issue and pull request:** to be opened by the responsible teammate
- **Decision:** [D040](../docs/DECISIONS.md#d040--enemy-targets-and-wall-pathing-t34t35--2026-11-14) (proposed)

## Why

Today a boarder gets a fixed route when it lands (`landBoarder` in `frontend/src/pirates/sim.js`): the shore wall near its landing, the ring wall it heads for, the heart. A broken wall on it is skipped, but a boarder never looks for a gap, never goes around a wall and cannot react to a wall placed or rebuilt elsewhere. Walls are points, so "in the way" is an angle rule, not geometry. Flexible placement (T36) and tower health (T33) need a real answer to "what does this enemy attack" and "which way does it walk", and every browser in a room must reach the same answer from the same inputs.

## What

- `frontend/src/pirates/targeting.js`: `pickTarget(enemy, world, profile)` with the target matrix below, `TARGET_PROFILES`, `profileFor`, `nearestWithin`.
- `frontend/src/pirates/path-grid.js`: the walking grid (`createGrid`, `cellOf`, `centreOf`), walls on the grid (`wallCells`, `buildLayout`, `standingWallAt`), the breach cost (`breachCost`) and `spotAsSegment` for today's fixed wall spots.
- `frontend/src/pirates/pathing.js`: the distance field (`buildField`), one step (`nextStep`), the whole route (`followPath`), a clear straight approach (`lineIsClear`) and a per-goal cache that rebuilds only on wall changes (`createFieldCache`).
- `frontend/src/pirates/cell-heap.js`: the small priority queue the search uses.
- Tests: `frontend/tests/pirates/targeting.test.js`, `pathing.test.js`, `pathing-performance.test.js`.

**Files likely to change at wiring time (not in this branch):** `frontend/src/pirates/sim.js` only; see [Wiring plan](#wiring-plan-into-simjs).

## Target matrix (T34)

The enemy goes for the first kind in its order that has a valid candidate. Kinds: **captain** (a captain or a Barracks militia), **wall** (the standing wall its route says is next in the way), **tower** (a defense with hp, which exists only after T33), **heart** (the island's heart).

| Enemy type | Order | Captain reach / leash / crowd | Tower reach | Notes |
|---|---|---|---|---|
| `boarder` (every boarder today) | captain, wall, tower, heart | 3 / 5 / 3 (today's `CONFIG.health`) | 2.5 | Same as today's behaviour, plus towers once they have hp |
| `brute` (proposed; wave 20+ brutes) | wall, tower, captain, heart | 1.5 / 3 / 3 | 4 | Siege type: hacks its way in, fights a captain only right next to it. Off until the team accepts it (`profileFor(enemy, { brutes: true })`) |
| Ships (sloop, brig, warship, …) | unchanged | – | – | Still shell the nearest standing wall in reach, else the island (`sim.js`). Not part of this module |
| Gunboat | unchanged | – | – | Still jams the nearest unjammed tower (`gunboatFire`). Not part of this module |

**Captain limits.** A captain counts only while standing (`down` false), present (`away` false; the caller drops captains not heard for `CONFIG.health.stale` seconds) and with hp above 0. A new captain target must be within `captainReach` and have fewer than `crowd` other enemies on them; the rest walk on. The enemy must have a clear straight way to the captain (`canReach`, wired to `lineIsClear`), so it never attacks a captain through a standing wall. A militia counts as a captain, as today.

**Switching.** An enemy keeps its current target while it is still valid: a captain still standing within `leash`, a tower still standing within `leash`, a wall still standing and still the one in the way, the heart while it can be reached. It switches only when (a) the current target is no longer valid, or (b) a kind **earlier** in its order turns up. So a boarder hacking a wall turns on a captain who walks within reach (as today); a brute keeps hacking. A boarder fighting one captain does not jump to a nearer captain (as today).

**Ties.** Distances closer than 1e-9 count as equal; equal distances go to the lower id (string order, as `foeOf` does today). Candidates are sorted by id before the search, so the order of the input lists never changes the result. Path ties go to the lower cell index (row-major: north first, then west).

**Dead, unreachable, destroyed and rebuilt targets.**

| Case | Rule |
|---|---|
| Captain falls, leaves or goes stale | Dropped at once; the next pick uses the order again |
| Captain revived | A candidate again on the next pick |
| Captain behind a standing wall | Not a candidate (`canReach` false) until the wall breaks or the captain steps out |
| Tower without hp (before T33) | Never a candidate |
| Tower destroyed (hp 0) | Dropped; a rebuilt tower (hp above 0) is a candidate again |
| Wall broken | Rubble: not a target, free to walk over; the route is recomputed |
| Wall rebuilt | An obstacle again: the route is recomputed and the wall is a target again if the route now breaches it |
| Heart unreachable | `{ kind: 'none' }`: the enemy waits where it is (no searching, no loop); the wave still ends at `maxTime` |

## Path rules (T35)

- **Grid.** Square cells, 1 world unit each, over the island (−24…24 on both axes for home_islet). A cell is land when its centre is inside the coast. Boarders wade from their ship to the landing point in a straight line as today, then follow the grid.
- **Walls are a generic list,** not spot ids: each wall is `{id, hp, maxHp}` plus either its own `cells` (world points; T36's grid placement), a straight `from`/`to` segment, or a single point `x, z`. Where two walls overlap, the lower id owns the cell. Walls are read in id order.
- **One cost for everything.** Walking costs 10 per straight step and 14 per diagonal step. Entering a standing wall costs its **breach cost**: the seconds needed to hack it (hp rounded up to the next quarter of its maximum, divided by the hack damage per second), turned into the distance walked in that time. All costs are whole numbers, so every browser adds them up to exactly the same total.
- **Breach versus detour.** The boarder takes whichever is cheaper: a gap when walking round is quicker than hacking, the wall when hacking is quicker. A closed ring is always breached at the cheapest wall. Lone short walls are simply walked round.
- **No walking through standing walls.** A standing wall cell is entered only after it is hacked down (`nextStep` returns its `wallId`, which becomes the target). Diagonal steps never cut a corner and never enter or leave a wall cell, so a diagonal line of wall cells is as closed as a straight one.
- **Rebuild while crossing.** A boarder standing in a cell when a wall is rebuilt over it steps out to the cheapest open neighbour (normally finishing its crossing). It is never left inside a standing wall and never hacks the wall it stands in.
- **Unreachable.** A goal cut off by water (or off the grid) has cost Infinity; `nextStep` returns null and `followPath` reports `reachable: false`. Walls never make anything unreachable, since they can be hacked.
- **No endless loops.** The route follows a distance field: every step goes to a neighbour with a strictly lower remaining cost (tested for every cell), so a boarder cannot walk in circles while the walls stay the same. A wall changes only by a hack, a break, a repair, a rebuild or a placement, each of which is bounded (rebuild cooldown, repair time), so rerouting cannot flip forever either.
- **When a route is recomputed.** One field per goal (the heart), shared by all boarders, rebuilt only when the layout key changes: a wall placed, moved, removed, broken, rebuilt, or its hp passing a quarter mark (up by repair or down by hacking). Never on a timer or every tick. Targets near the boarder (captain, tower) use a straight approach checked with `lineIsClear`, every tick, since captains move.
- **Multiplayer consistency.** Same walls, same grid, same positions give the same field and the same steps in every browser: whole-number costs, the heap and all ties break by cell index, walls sorted by id. Tested with shuffled inputs and seeded random layouts.

**Path constraints for T36 (to agree before either implementation).** Walls should be placed on this 1-unit grid (or give their cells); towers and houses should become non-walkable cells; a placement is legal only if every landing still has a finite cost to the heart with all walls removed (only walls may close the heart off, never towers, houses or terrain). Today's fixed spots can be converted with `spotAsSegment` (a 6-unit wall across the way to the heart), but see the finding below.

## Measured performance

`tests/pirates/pathing-performance.test.js`: 300 boarders at once on the home_islet coast grid (48 × 48 cells), six shore walls plus a closed level-5 ring, twelve moving captains, hacking, breaks and rebuilds, for a full 150 s wave (3000 ticks). On the dev container (14 Nov): about **1 ms per tick** for targeting plus pathing together (0.9–1.6 ms over runs), **56 field builds** in the whole wave, no boarder inside a standing wall and none stuck. The test prints its own figure (`[T35 perf]`) and fails above 25 ms per tick. A late catch-up of `CONFIG.maxStep` (600 ticks) would take roughly 0.6–1 s at this load; the wiring PR should measure it on a phone.

## Finding: today's isolated wall spots

With real geometry, a lone wall is walked round. Today's twelve wall spots as 6-unit walls leave the ring open, so boarders would rarely hack them, which removes much of a wall's current value. The detour model is meant for T36's joined walls. Until T36 ships, the wiring should either keep the legacy route (option A below) or convert each ring spot into a wall joined to its neighbours (a closed ring; option B). Choosing between them is a balance decision for the team (with T3).

## Wiring plan into sim.js

To do in one small follow-up PR **after the recovery lane's sim.js changes merge**, behind a wave option `pathing: true` that the server/room sets for every client in a wave, so a mixed-version room never runs two rules at once.

1. `createWave`: build the grid once from the coast (`createGrid` with an inside-the-coast test based on `coastPoint`'s edge), and keep a `createFieldCache(grid)`. Convert walls: option A keeps today's routes; option B joins the ring spots (`from`/`to` from one ring spot to the next) and uses `spotAsSegment` for shore walls. Later T36 passes walls with `cells`.
2. `tick`: before the boarder loop, `buildLayout(grid, walls, pace)` and `fieldFor(layout, heart)` (rebuilt only on a key change). `pace` uses the wave's hack and speed (`B.hack × curve.damage`, `B.speed × curve.speed`).
3. `landBoarder`: stop building `route`; keep the wading start and landing point; store `target: null`.
4. `foeOf` and `crowdOn`: become the `world.captains` list (party captains present within `stale`, plus militia) and `world.crowdOf`; their reach, leash and crowd numbers move to `TARGET_PROFILES.boarder` (tested equal to `CONFIG.health`).
5. `pickBoarderTarget`: replace the body with `nextStep` for the boarder's cell (giving `blockingWall`) and `pickTarget(boarder, world, profileFor(boarder, { brutes }))`; return the same `{kind, wall|hero, leg}` shapes so `moveBoarder` changes little.
6. `legPoint` and the walking branch of `moveBoarder`: walk to the next cell's centre instead of the next route leg; stand at the wall cell's edge (`B.contact`) to hack. The hacking and fighting branches compare target ids as today.
7. `toHeart`, events, `state()`, `result()`, rendering and sync: unchanged (boarders still have `x`, `z`, `state`).
8. Tests: rerun `tests/pirates/` (boarding, balance and late-game tests will move with option B), add a same-seed replay test with `pathing: true`, and run `npm run test:mp`.

## Out of scope

- Editing `sim.js` (owned by the recovery lane now): the wiring step above.
- Tower hp, damage and destruction: T33. This contract only says how enemies pick towers once they have hp.
- The placement model, footprints and save format: T36.
- Ship and gunboat targeting: unchanged.
- Balance retuning: T3, after wiring.

## Done when (acceptance checks)

- [x] `cd frontend && npm test`: all tests pass, including the three new files.
- [x] `cd frontend && npm run build`: the build passes.
- [x] Fixtures: closed ring, diagonal ring, one gap, several gaps, equal gaps, weak wall, rebuild while crossing, gap rebuilt ahead, unreachable heart, goal in water, no-loop property, recompute rules, shuffled inputs and seeded layouts.
- [x] Late-wave performance measured (above).
- [ ] The team reviews and accepts (or changes) D040, including the brute profile and option A/B.
- [ ] Wired into `sim.js` in a follow-up PR, with `npm run test:mp`.
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

| Test file | Test name | What it proves |
|---|---|---|
| `frontend/tests/pirates/targeting.test.js` | `a boarder goes for a captain in reach first, then the wall in its way, then a tower, then the heart` | The boarder row of the matrix |
| same | `a boarder at a wall turns on a captain who comes within reach; a brute keeps hacking` | Switching by order, per type |
| same | `gives two captains at the same distance to the lower id, whatever the list order` | Ties |
| same | `skips a captain behind a standing wall and goes for them once the wall is broken` | Unreachable targets |
| same | `ignores towers without hp (before T33) and destroyed towers, and takes a rebuilt tower again` | Destroyed and rebuilt targets |
| `frontend/tests/pirates/pathing.test.js` | `breaks through exactly one wall of a closed ring` | Closed rings |
| same | `takes the nearest of several gaps, and the same one of two equal gaps in any wall order` | Multiple gaps, ties |
| same | `a boarder standing in a gap when the wall is rebuilt around it steps out, never staying inside` | Rebuild while crossing |
| same | `every step from every cell lowers the cost left, so no boarder can walk in circles` | No stuck loops |
| same | `gives identical fields and paths for the same seed, whatever order the walls come in` | Multiplayer consistency |
| `frontend/tests/pirates/pathing-performance.test.js` | `handles 300 boarders for a whole wave: …` | Late-wave cost and correctness under load |

## Contracts touched

- [ ] API endpoints: none
- [ ] Browser events: none (wiring keeps today's wave events)
- [ ] Database tables, policies or functions: none
- [ ] Shared lists: none yet; the wiring adds a wave option `pathing` (to document in INTERFACES.md then)
- [ ] Content format: none
- [x] Decisions to record in `docs/DECISIONS.md`: D040 (proposed)

## Owner and reviewer

- **Responsible teammate:** Nils (`Nilsnova`), who authorized this work; plan author Ianno (`Iannomh123456`)
- **Coding agent used, if any:** a coding agent. The teammate stays responsible for its output.
- **Reviewer (a different human teammate):** to be named in the PR
- **Last updated:** 2026-11-14
