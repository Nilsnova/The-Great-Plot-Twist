# Sprint T29–T47 walkthrough guide (for the catch-up review)

> **What this is:** a plain-words reading guide to everything that merged into `main` on 14 Nov 2026 in the T29–T47 sprint (PRs #33 to #53, plus the late-evening PRs #54 to #63 in sections 10, 11 and 15). Each section says what a player sees, where the code is, which lines to read first, which tests prove it, and three practice questions with short model answers.
>
> **Who it is for:** the four teammates. [D047](DECISIONS.md) merged these lanes **without a prior peer review**, so review happens now, after the merge. In the code walkthrough every teammate must be able to explain every line, so read the code with this guide beside it.
>
> **What it is not:** it does not invent anything. Every quoted line is copied from `main` at the time of writing: sections 1 to 7 and 12 at `28693ce` (the merge of PR #44), sections 8 to 11 at `d606ec7` (the merge of PR #53), section 15 at `86b01d9` (the merge of PR #63); the notes marked "Update" in sections 10, 11 and 13 were written against `86b01d9` too. Where a later PR changed what an early section says, the early section carries an "Update" note. If a file changed since, trust the file and fix this guide.

## How to use it

1. Read section 0 (what landed and what is on) and the flags section (section 13).
2. Take your sections from the [suggested split](#14-suggested-split-for-the-four-teammates). Read the files **in the order listed**, then the quoted function in the real file.
3. Run the tests named in the section (commands are in [ENGINEERING.md, section 3](ENGINEERING.md#3-commands)). A test that fails on your machine is a finding, not a mistake to hide.
4. Do the three practice questions out loud, source closed, then open it and check yourself. Do not memorize the model answers: they are short on purpose, and an examiner will ask a follow-up.

**About the question types.** ROADMAP.md says the explain-back drills use "the course's six question types", but no file in the repository defines them (the same gap is stated in [EXPLAIN-YOUR-CODE.md](contribute/EXPLAIN-YOUR-CODE.md)). So the questions below use the **six practice prompts** from that page, one or two per section, and the labels are only practice labels:

| Label | Short form |
|---|---|
| Explain | "Explain these lines." |
| Trace | "Trace this input." |
| What if | "What if this changes?" |
| Bug | "Find a bug." |
| Test | "Test it." |
| Defend | "Defend a choice." |

Replace them with the course's real wording once someone has the course sheet.

## 0. What landed, in one table

Merged on 14 Nov (merge commits on `origin/main`, newest first). Decision numbers D039–D049 were **accepted by Nils on 15 Nov 2026** after review (the text after this sentence was written before that): the team has not agreed them yet (D047 only agreed the merge order).

| PR | Merge | Tasks | What | Decision | Flag | Section |
|---|---|---|---|---|---|---|
| #63 | `86b01d9` | T33–T35, T38, T43 (fix) | A wave keeps the rule set of its first answer, even when it is empty (a flag switched on mid-wave no longer changes a running wave) | D049, D040, D044 | all four wave rules | 15 |
| #62 | `880714f` | T43 (check) | Two-captain release check for the culverin (`test:culverin`); a visitor's card unlocks the culverin by the friend's waves | D048 | `defenses_v2` | 11, 15 |
| #59 | `6c1146f` | T33–T35 (check) | Balance playtest of the real sim, retune of pathing (`WALL_ENGAGE` 3, boarder `towerReach` 1.5), two-browser check of the rules (`test:rules`) | D049, D040 | `tower_health`, `pathing` | 15 |
| #56 | `4d83dcd` | T43 | The culverin in the fight: sim, card and render wiring, migration `20261114140000`, the wave rule `defenses_v2` | D048 | `defenses_v2` | 11 |
| #55 | `4010f7f` | (docs) | Sprint final pass: applied migrations, flag state, guide sections 8 to 11 | none | none | all |
| #54 | `9bc543f` | T38 (check) | Two-captain release check for the rescue (`test:rescue`) | D044 | `rescue` | 6, 10 |
| #53 | `d606ec7` | T40/T41 (check) | Two-captain release check for the arsenal; two card fixes | none | `arsenal` | 9, 12 |
| #52 | `35145fd` | T33, T34/T35, T38, T29–T32 | Integration: wave rules, tower health, pathing and the rescue hook in `sim.js`; wall-recovery guard | D049 (new), D040, D044 | `tower_health`, `pathing`, `rescue`, `wall_recovery` | 10 |
| #51 | `ce21d2d` | T40, T41, T44 | Shared island arsenal: 20 stored copies, buy/take/swap/return | D042 | `arsenal` | 9 |
| #50 | `723df50` | T43 (prep) | Culverin data, art, catalogue and flag | D048 | `defenses_v2` | 11 |
| #49 | `4b5267a` | T36 (check) | Two-captain release check for placement | none | `placement` | 12 |
| #48 | `4aa6f83` | T29–T32 (check) | Two-captain release check for wall recovery | none | `wall_recovery` | 12 |
| #47 | `8238f25` | T45 (fix) | Leaderboard reads batched; statue drawing guard | D046 | none | 8 |
| #46 | `a1c2ac0` | (docs) | The first version of this guide | none | none | all |
| #45 | `8c3d345` | T45 | Leaderboard tabs (week, all time), crew label, "This island" panel, four statue stages | D046 | none | 8 |
| #44 | `28693ce` | T36 | Move buildings on a half-unit grid | D041 | `placement` | 4 |
| #43 | `20d2350` | T29–T32, T47 | Wall damage stays after a wave; paid Repair/Rebuild | D039 | `wall_recovery` | 1 |
| #42 | `9533879` | (test fix) | Multiplayer check made reliable | none | none | 12 |
| #41 | `581682f` | T46 | One words-only forecast line on the Harbor weather board | D045 | none | 7 |
| #40 | `966e264` | T38, T39 | Last-chance rescue minigame; minigame difficulty by wave | D044 | `rescue` | 6 |
| #37 | `908d376` | (test fix) | One command for the GitHub sign-in checks | none | none | 12 |
| #36 | `e6c5d9b` | (test fix) | Pixel-art check knows the game starts in the harbor | none | none | 12 |
| #35 | `91e94ba` | T37, T42 | Co-op permissions matrix in one Python module | D043 | none | 5 |
| #34 | `40f94d5` | T33 (art only) | Damaged and broken tower drawings | none | none | 2 |
| #33 | `4eed652` | T34, T35 | Enemy targeting and wall pathing as pure modules | D040 | none | 3 |

Also merged that day but not part of the T29–T47 code: #20 (the roadmap, T29–T47 in [BUILD-PLAN.md section 6](BUILD-PLAN.md#6-defense-and-shared-island-expansion)), #29 (sprint notes in STATUS/DECISIONS/OPEN-TODOS), #19 (T28 minigame introduction), #17 (T27 shooting direction), #13 (T7 leaderboard).

**Merged after the first version of this guide:** highscore/statue polish (T45, #45 and #47, section 8), the arsenal (T40, T41, T44, #51 and #53, section 9), the integration of the sim (#52, section 10) and the culverin's data and art (T43 prep, #50, section 11). Since then (late evening): the rescue release check (#54), the culverin in the fight (#56, #62), the balance harness and pathing retune (#59, section 15) and the wave-rules keep-once fix (#63, section 15). **Not built yet:** lasting tower damage between waves, towers as path obstacles; **built but off:** pathing (a team decision is open); see [OPEN-TODOS.md, known follow-ups](OPEN-TODOS.md#known-follow-ups-from-the-sprint-14-nov).

**What actually changes for a player today.** Read this twice, because several lanes are deliberately *not connected yet*:

| Lane | Is the player able to see it? (state on the evening of 14 Nov, as verified by the coordinator) |
|---|---|
| T29–T32/T47 wall recovery | **Yes: live.** Flag `wall_recovery` on in production (about 20:28 UTC), migration applied. |
| T33 tower art | **Yes, through the rule `tower_health`** (on since about 21:53 UTC): then the damaged and broken drawings are used, but towers rarely get hurt yet (next row). |
| T33 tower health | **Yes: live, but nearly invisible.** Flag `tower_health` on since about 21:53 UTC, after the balance check of #59. On today's routes it plays like no rules: boarders rarely reach a tower. |
| T34/T35 targeting and pathing | **Yes: live since about 22:00 UTC.** Wired into `sim.js` in #52 and retuned in #59. A closed wall ring at wave 60 is 12 to 18 points harder with it; Nils accepted that gap on 14 Nov and switched `pathing` on (section 15). |
| T36 placement | **Yes: live.** Flag `placement` on (about 19:45 UTC), migration applied. |
| T37/T42 co-op policy | **Yes: live**, no flag: it moves existing rules into one module and rewords one error message. |
| T38 rescue | **Yes: live.** The `sim.js` hook is in (#52); flag `rescue` on since about 21:05 UTC, after the release check #54 (`npm run test:rescue`). |
| T39 difficulty curves | **Yes: live**, no flag. The numbers are the old ones up to wave 10, so waves 1 to 10 play as before. |
| T40/T41/T44 arsenal | **Yes: live.** Flag `arsenal` on (about 20:48 UTC), migration applied, old weapons converted once. |
| T43 culverin | **Yes: live.** Data and art (#50), fight, card and render wiring and migration (#56), release check (#62). Flag `defenses_v2` on since about 21:53 UTC. |
| T45 leaderboard and statue | **Yes: live**, no flag. |
| T46 weather forecast line | **Yes: live**, no flag: it appears when the weather answer has a usable `tonight.state`. |

**Not verified by this guide:** the live site. The repository cannot tell which flags are on in production (that lives in the `FEATURE_FLAGS` setting on Vercel); the table above records what the coordinator verified live on 14 Nov 2026 (about 21:55 UTC), and this guide did not re-check it. Check it yourself (section 13, "How to check").

---

## 1. Wall recovery: damage stays after a wave (T29–T32, T47)

**For the player.** Today a wave ends and every wall is whole again. With this feature a wall keeps the damage the last wave left (shown as a percent). Between waves the wall card offers **Repair** (damaged) or **Rebuild** (destroyed) for coins, and you cannot upgrade a damaged wall first. If you do nothing, the wall mends by itself 10 minutes after that wave (by the server's clock, offline time counts).

**Flag.** `wall_recovery`, **off by default in the code** (`FLAG_NAMES` in `backend/server/flags.py`; `FEATURE_FLAGS` is empty in `.env.example`). It also needs `islands` on and the migration applied (section 13). With it off, the new routes answer `404 feature_off` and everything behaves as before.

**Decision.** [D039](DECISIONS.md#d039--wall-recovery-damage-stays-after-a-wave--2026-11-14), proposed. Spec: [specs/T29-T32-wall-recovery.md](../specs/T29-T32-wall-recovery.md). Contract: [INTERFACES.md](INTERFACES.md) (search "wall_recovery").

**Files to read, in this order.**

1. `specs/T29-T32-wall-recovery.md` (10 minutes: what and why).
2. `backend/server/island/wall_health.py` (pure rules, no database).
3. `supabase/migrations/20261114100000_wall_recovery.sql` (the two columns, the table `island_wall_records`, the functions `island_walls_record` and `island_wall_restore`).
4. `backend/server/island/wall_repair.py` (talks to the database).
5. `backend/server/routes/wall_recovery.py` (the two routes) and the changes in `backend/server/routes/waves.py`.
6. `frontend/src/pirates/wall-health.js` (what the wave simulation reads and reports) and `frontend/src/island/wall-recovery.js` (the wall card).

**Walk-through: how a wall's health and price are decided.** All in `wall_health.py`.

```python
RECOVERY_SECONDS = 600  # a damaged or destroyed wall mends by itself 10 minutes after its wave
REBUILD_SHARE_PERCENT = 30  # a rebuild costs 30% of what the wall's levels cost to build

def effective_health(wall: WallState, at: datetime) -> int:
    if wall.health >= FULL:
        return FULL
    if wall.damaged_at is not None and wall.damaged_at + recovery_time() <= at:
        return FULL
    return max(0, wall.health)
```

Read it as three questions in order. Is the wall whole already? Then 100. Did its 10-minute timer run out? Then it counts as 100 (the stored number is not changed; the answer is computed when asked). Otherwise show the stored number, never below 0. A wall with no `damaged_at` (an old save) can only be 100.

```python
def restore_price(full: int, health: int) -> int:
    missing = FULL - max(0, min(FULL, health))
    return max(1, (full * missing + 99) // 100)
```

`(x + 99) // 100` is "divide by 100 and round up" using whole numbers. `missing` is the share of health that is gone. A rebuild of a level-1 wall has a full price of 3 coins (`rebuild_price`, 30% of the level prices, rounded up: 3, 9, 21, 45, 93 for levels 1 to 5). For a full price of 9: health 40 pays 6, health 99 pays 1 (never 0), health 0 pays 9.

The database repeats the same sum so that two clicks cannot disagree (`island_wall_restore`):

```sql
v_price := greatest(1, ceil(p_full_price * (100 - v_building.wall_health) / 100.0)::integer);
if v_balance < v_price then
  return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
end if;
v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
update public.islet_buildings
   set wall_health = 100, wall_damaged_at = null
 where player_id = p_island_owner and plot = p_plot;
```

Before that point the function locks the payer's wallet row (`for update`), answers "done, repeat" if the ledger already has `wallfix:<actionUid>`, locks the building row, and refuses with `wave_running` while a wave runs on the island and `intact` when the wall is whole. Taking the coins and healing the wall happen in one function call, so there is no moment in which one happened without the other.

**Tests that prove it.**

- `backend/server/tests/test_wall_recovery.py`: the pure rules (timer at 9, 9.9 and 10 minutes, price 3/9/21/45/93, repair price rounding, engineer discount, upgrade refused with `needs_repair`), the routes with the flag off (404) and on, the refusal reasons, and that a finish hands its walls to the database.
- `backend/server/tests/island_sql/test_wall_recovery_sql.py`: the SQL itself (first finish records, second changes nothing; repair takes the missing share once; no repair during a wave; browser roles cannot run the functions). These need the optional SQL tooling and may be skipped on your machine; a skip is not a pass.
- `frontend/tests/pirates/wall-recovery.test.js` and `frontend/tests/island/wall-recovery.test.js`.

**Limits to know.** The browser reports the wall percents at the end of a wave and the server cannot check the battle, just like `survived`; the numbers are bounded to 0–100 and to walls on that island, and only change play-money costs. Mixed client versions in one wave can disagree on wall health (reload after the flag goes on). Towers (T33) are not part of this.

**Practice questions.**

1. *Trace.* A wall is stored at health 40, `damaged_at` 4 minutes ago. What does the card show, what does Repair cost for a full price of 9, and what happens 7 minutes later?
   *Model answer:* health 40, "mends by itself in 6 min", Repair costs 6 coins (60 missing percent of 9 = 5.4, rounded up). 7 minutes later (11 minutes after the wave) the timer has run out, so `effective_health` returns 100 and the card shows a whole wall; Repair would be refused as `intact`.
2. *What if.* Two teammates click Repair on the same wall at the same moment. Who pays?
   *Model answer:* the database function locks the building row. The first call pays and makes the wall whole; the second finds `wall_health` 100 and is refused `intact`, so it pays nothing. If one player's browser sends the same `actionUid` twice, the ledger ref `wallfix:<uid>` makes the second call a "repeat" that charges nothing.
3. *Defend.* Why store a percent and one timestamp instead of regenerating health a little each minute?
   *Model answer:* it is the smallest state that survives a reload, offline time and upgrades. Partial regeneration needs more state that every client must agree on (D039 lists it as a rejected alternative). The trade-off is that a wall is either "damaged until the timer or a payment" or whole.

---

## 2. Tower damage art (T33, art only)

**For the player.** These are the drawings of a cannon, mortar and harpoon tower that is damaged (leaning, cracked, smoking) or broken (rubble). **Update (#52):** a wave that carries the rule `tower_health` now shows them (section 10); that flag is still off in production, so players see nothing yet.

**Flag / decision.** None. No decision number: it adds no rule. Spec: [specs/T33-tower-damage-art.md](../specs/T33-tower-damage-art.md). Tower health itself was built later, in #52 (section 10, D049); D040 says how enemies treat towers that have hp.

**Files, in order.**

1. `specs/T33-tower-damage-art.md` (it ends with the "wiring note" for whoever connects it).
2. `frontend/src/art/tower-states.js` (the drawings and the frame names).
3. `frontend/src/art/island.js` (`drawTower` and the 30 registered frames).
4. `frontend/scripts/capture-tower-states.js` and `docs/evidence/T33/tower-states-contact-sheet.png` (look at the picture first).

**Walk-through.**

```js
export const TOWER_STATES = Object.freeze(['intact', 'damaged', 'broken']);
export const towerState = state => (TOWER_STATES.includes(state) ? state : 'intact');
export function towerStateFrame(kind, level, state = 'intact') {
  const n = Math.max(1, Math.min(5, Number.isInteger(level) ? level : 1)), s = towerState(state);
  return `island-${kind}${n > 1 ? `-l${n}` : ''}${s === 'intact' ? '' : `-${s}`}`;
}
```

Unknown states read as `intact`, so a bug elsewhere can never show a wrong picture by accident. The level is forced into 1 to 5 and level 1 has no suffix, which is how the existing intact frames are named. `towerStateFrame('mortar', 3, 'broken')` gives `island-mortar-l3-broken`.

```js
export function drawTower(kind, level = 1, state = 'intact', firing = false) {
  const known = Object.hasOwn(TOWER_DRAW, kind) ? kind : 'cannon', n = Math.max(1, Math.min(5, Number.isInteger(level) ? level : 1)), s = towerState(state);
  if (s === 'broken') return (c, size) => drawBroken(known, n, c, size);
  const intact = TOWER_DRAW[known](n, firing);
  return s === 'damaged' ? (c, size) => drawDamaged(intact, c, size) : intact;
}
```

`drawTower` returns a drawing *function*, it does not draw yet. A broken tower ignores `firing`, so it can never show a shot. A damaged tower is the intact drawing tilted by `c.rotate(.07)` (about 4 degrees) plus cracks, scorch marks and smoke.

**Tests.** `frontend/tests/tower-damage-art.test.js`: unknown states and kinds fall back; every kind, level and state draws without error; "intact" makes the same drawing calls as the old call; damaged and broken differ from intact and from each other; a broken tower ignores `firing`; 30 frames are registered next to the unchanged intact ones. Plus `npm run build` (the asset budget).

**Practice questions.**

1. *Explain.* What does `Object.hasOwn(TOWER_DRAW, kind) ? kind : 'cannon'` protect against?
   *Model answer:* an unknown or odd kind such as `toString` or a typo. `hasOwn` checks only the object's own keys, so the call draws a cannon instead of throwing or picking something inherited.
2. *Test.* How does the test know a broken tower "never shows a shot"?
   *Model answer:* it draws the broken tower with `firing` true and false and checks that both produce the same drawing calls on a recording stand-in for the canvas (`tower-damage-art.test.js`, "a broken tower never shows a shot").
3. *What if.* Why is nothing visible in the game yet, and what must the next person do?
   *Model answer:* (when this PR merged) no code asked for the new frames; since #52 a wave with `tower_health` does. The spec's wiring note said to add the ids to the atlas list, give `towerFrame` a `state` argument that falls back to the intact frame when a frame is missing, and derive the state from tower hp, which does not exist until T33.

---

## 3. Enemy targeting and wall pathing (T34, T35)

**For the player.** Nothing yet in production. **Update (#52):** `sim.js` now uses these modules when the wave carries the rule `pathing` (section 10); the flag has been on in production since about 22:00 UTC on 14 Nov, so players see the new routes. When it is on, boarders will choose who to attack by a priority list and will walk round a wall through a gap when that is quicker than hacking through it.

**Flag / decision.** In #33 these were modules with no flag; since #52 they sit behind the flag `pathing` (on in production since about 22:00 UTC, 14 Nov). [D040](DECISIONS.md#d040--enemy-targets-and-wall-pathing-t34t35--2026-11-14), proposed. Spec: [specs/T34-T35-targeting-pathing.md](../specs/T34-T35-targeting-pathing.md). Open balance question in D040: lone short walls get walked round, so today's isolated wall spots lose value until T36 or a ring layout.

**Files, in order.**

1. `specs/T34-T35-targeting-pathing.md`.
2. `frontend/src/pirates/targeting.js` (who to attack).
3. `frontend/src/pirates/path-grid.js` (the 1-unit grid, walls as cells).
4. `frontend/src/pirates/cell-heap.js` (a small priority queue).
5. `frontend/src/pirates/pathing.js` (the route search).
6. The tests (below). `pathing-performance.test.js` shows the speed claim.

**Walk-through A: choosing a target** (`targeting.js`). Profiles are plain data:

```js
boarder: Object.freeze({ order: Object.freeze(['captain', 'wall', 'tower', 'heart']), captainReach: 3, towerReach: 2.5, leash: 5, crowd: 3 }),
brute:   Object.freeze({ order: Object.freeze(['wall', 'tower', 'captain', 'heart']), captainReach: 1.5, towerReach: 4, leash: 3, crowd: 3 }),
```

`order` is the priority list, first entry first. `reach` is how near something must be to be picked, `leash` how far a target may run before the enemy lets go, `crowd` how many other enemies may already be on one target. The boarder numbers equal today's `CONFIG.health` numbers in `sim.js` (a test checks that). The `brute` is only a proposal and stays off unless `brutes: true` is passed to `profileFor`.

```js
export function pickTarget(enemy, world, profile = TARGET_PROFILES.boarder) {
  const kept = keptTarget(enemy, world, profile);
  const keptRank = kept ? profile.order.indexOf(enemy.target.kind) : profile.order.length;
  for (let rank = 0; rank < keptRank; rank++) {
    const kind = profile.order[rank], found = candidate(kind, enemy, world, profile);
    if (found) return describe(kind, found);
  }
  return kept ? describe(enemy.target.kind, kept) : { kind: 'none' };
}
```

Step 1: is the target I already hold still worth keeping (`keptTarget`: still alive, within the leash, reachable)? Step 2: look only at kinds that rank **earlier** than the one I hold (if I hold nothing, look at all kinds). If an earlier kind has a candidate, switch to it. Step 3: otherwise keep what I hold, or return `{kind: 'none'}`. That is the whole "keep your target unless something more important turns up" rule.

Ties are deterministic (`nearestWithin`): the list is sorted by id and only a strictly nearer item replaces the best, so two captains at the same distance always give the lower id, in every browser, whatever order the list came in.

**Walk-through B: the route** (`pathing.js`). One "distance field" per goal: for every grid cell, the cheapest cost to reach the heart, where walking costs its distance and entering a standing wall costs the time spent hacking it, expressed as walking distance.

```js
const entry = here + (index === goalIndex ? 0 : enterCost(layout, index));
for (const next of neighbours(grid, layout, index)) {
  const total = entry + next.step; // walking from `next` into this cell
  if (total < cost[next.index]) { cost[next.index] = total; heap.push(total, next.index); }
}
```

This is Dijkstra's shortest-path search run **from the goal outwards** with a heap. The cost of getting from a neighbour to the goal is "the cost already known at this cell, plus the price of entering this cell (its wall, if any), plus one step". Then a boarder just asks `nextStep`: of my neighbours, which has the lowest `step + wall cost + cost left`? Ties go to the lower cell index. Because every step lowers the remaining cost, a boarder can never walk in circles while the walls stay the same. `createFieldCache` rebuilds the field only when the layout's key changes (a wall placed, moved, removed, broken, rebuilt or passing a quarter of its hp), not every tick.

Diagonal steps never cut a corner (both cells beside the diagonal must be open), so a diagonal line of wall cells is as closed as a straight one.

**Tests that prove it.** `frontend/tests/pirates/targeting.test.js` (target matrix, captain limits, keeping and switching, ties and input order, dead/unreachable/rebuilt targets), `pathing.test.js` (gap versus breach, closed rings, diagonal rings, rebuilt gaps, water, "every step lowers the cost", identical fields for any wall order) and `pathing-performance.test.js`. Not tested: any behaviour inside `sim.js`, because nothing is wired.

**Practice questions.**

1. *Explain.* In `pickTarget`, why does the loop stop at `keptRank` instead of looping over all kinds?
   *Model answer:* a held target should only be given up for something that ranks higher in the profile. Looping only over earlier ranks implements "switch only when the current target is invalid or a more important kind turns up"; after the loop the held target is returned.
2. *What if.* A boarder holds a captain and a nearer captain walks up. Does it switch?
   *Model answer:* no, as long as the held captain is still fightable and within the leash (5). Both are the same kind, so no earlier rank exists. The test "stays on its captain within the leash although a nearer captain walks up" covers it.
3. *Defend.* Why a shared distance field instead of an A* search for each boarder?
   *Model answer:* with 300 boarders heading for the same heart one field serves all of them, the field only rebuilds when walls change, whole-number costs and index tie-breaks give the same route in every browser (needed because every client runs the same simulation), and "each step lowers the cost" makes loops impossible. D040 notes per-boarder A* gives the same routes with more work.

---

## 4. Flexible building placement (T36)

**For the player.** On your island the 22 build spots can be moved (a Move button and a preview), for free, between waves, to any free square of a half-unit grid on land. What stands on a spot (level, tower skill) moves with it. The server refuses moves that overlap something, go into the sea, or wall the heart in.

**Flag.** `placement`, **off by default**; needs the migration `20261114110000_island_layout.sql` and `islands` on. Off: every island answer shows the fixed spots and `layout.movable: false`, `POST /api/island/move` answers `404 feature_off`, and the table is never read. In `app.py` the flag is copied onto the catalogue so every island answer knows it.

**Decision.** [D041](DECISIONS.md#d041--flexible-building-placement-on-a-build-grid-t36--2026-11-14), proposed. Spec: [specs/T36-flexible-placement.md](../specs/T36-flexible-placement.md) (with screenshots next to it). Contract: [INTERFACES.md](INTERFACES.md) ("Flexible placement").

**Files, in order.**

1. `specs/T36-flexible-placement.md` and its screenshots.
2. `backend/content/island_layout.json` (the 22 spots, the grid, the keep-out boxes).
3. `backend/server/island/layout.py` (pure rules).
4. `backend/server/island/placement.py` (the flow of one move) and `layout_store.py`.
5. `backend/server/routes/island_layout.py` (the route).
6. `supabase/migrations/20261114110000_island_layout.sql` (the table `island_layout` and `island_move()`).
7. `frontend/src/island/placement.js` (the same rules as a preview), `move-mode.js`, `move-bar.js`, `world.js`.

**Walk-through: `check_move` in `layout.py`.** The first failing rule wins, in this order.

```python
if spot_named(rules, spot_id) is None:
    raise MoveRefused(404, "no_such_spot", "There is no such build spot.")
if not (on_grid(rules, x) and on_grid(rules, z)):
    raise MoveRefused(422, "off_grid", "Pick a square of the build grid.")
if surface_class(rules, x, z) == SEA:
    raise MoveRefused(409, "not_on_land", "Buildings stand on land, not in the sea.")
moved = box_of(rules, spot_id, (x, z))
for other in rules.keep_out:
    if overlaps(moved, other):
        raise MoveRefused(409, "place_taken", f"That is too close to {other.name}.")
for other_id, where in positions.items():
    if other_id != spot_id and overlaps(moved, box_of(rules, other_id, where)):
        raise MoveRefused(409, "place_taken", "Another building stands there.")
if not route_open(rules, {**positions, spot_id: (x, z)}):
    raise MoveRefused(409, "blocks_route", "That would wall the heart in. Leave the pirates a way through.")
```

Three small helpers explain the rest:

```python
def on_grid(rules, value):  return abs(value) <= MAX_UNITS and (value / rules.grid).is_integer()
def overlaps(a, b):         return abs(a.x - b.x) < (a.w + b.w) / 2 and abs(a.z - b.z) < (a.d + b.d) / 2
```

`on_grid`: within 30 units and a whole multiple of 0.5. `overlaps` uses a strict `<`, so two footprints that only **touch** do not overlap: two 2x2 walls at x = 0 and x = 2 fit side by side, which is how walls form lines. `route_open` does a breadth-first walk over free land cells from the heart; the walk reaches the beach or it does not. Walls are left out of the blocked cells on purpose, because boarders hack through them.

**How the flow stays safe** (`placement.py`): find the island and check the permission row `MOVE` (host or member); read the stored cells; if the spot already stands there, answer and change nothing (so a repeat is safe without a click id); run `check_move`; then `island_move()` stores the cell under the island lock **only if the stored rows are still the ones the server checked** (otherwise `busy`), and refuses during a wave. After one `busy` the server reads and checks once more (`TRIES = 2`) before giving up with `409 busy`. An old save stores nothing: `positions_of` falls back to the fixed spot, and a test proves every fixed spot is already a legal grid cell.

**Tests that prove it.** `backend/server/tests/test_island_layout_rules.py` (rules, one test per refusal, walls touching, towers may not cut the heart off but walls may), `test_island_move_routes.py` (flag off, old saves, legal and illegal moves, busy, wave_running, non-member), `island_sql/test_island_layout_sql.py` (compare-and-swap, no move during a wave, table rejects unknown spots; optional SQL tooling, may skip), `frontend/tests/island/placement.test.js` and `move-mode.test.js`.

**Limits.** Walls are not rotated. Pirate Point's spots stay fixed. A client older than this change draws and simulates moved buildings at their old spots until reload. The Python and JavaScript rules are two copies of the same rules: the server decides, the browser only previews, and a mismatch would show as a preview that says yes and a server that says no.

**Practice questions.**

1. *Trace.* Move `wall_1` to x = 0.3. What happens, and why before any database call?
   *Model answer:* `on_grid`: 0.3 / 0.5 = 0.6 is not a whole number, so `422 off_grid`. `check_move` runs in Python before `layout_store.save_move`, so an illegal move never reaches the database (the route test "refused before the database is asked").
2. *What if.* Two members move different spots in the same second.
   *Model answer:* each move is checked against the rows the server read. `island_move()` takes the island lock and compares those rows with the rows now; the second finds them changed and answers `busy`. The server re-reads and re-checks once more, so usually both succeed one after the other; two `busy` in a row gives the player `409 busy`.
3. *Bug.* Someone changes `overlaps` from `<` to `<=`. What breaks and which test notices?
   *Model answer:* touching walls would count as overlapping, so lines of walls could not be built. `test_two_walls_may_touch_side_by_side_to_make_a_line` fails.

---

## 5. Co-op permissions and absent members (T37, T42)

**For the player.** Almost nothing changes, on purpose: the rules for who may do what on a shared island are now written as one table in one Python module, and the "join this game first" error names the action ("...to build here"). The documented policy: the host and every member may do every island action with no vote; everyone pays from their **own** wallet (there is no shared wallet); a wave may start without the full crew or the host.

**Flag.** None. **Decision.** [D043](DECISIONS.md#d043--co-op-permissions-spending-and-absent-members--2026-11-14), proposed, with four open questions at its end (should members only tear down what they paid for, can a host remove a member, host unlocks follow the island's best wave, late joiners earn full loot). Spec: [specs/T37-T42-coop-policy.md](../specs/T37-T42-coop-policy.md) (the matrices).

**Files, in order.**

1. `specs/T37-T42-coop-policy.md` (the role/action matrix and the online/absent matrix).
2. `backend/server/island/permissions.py` (the whole module is about 140 lines: read all of it).
3. `backend/server/island/service.py` (the diff: `target_island` now takes an `action`).
4. `backend/server/island/waves.py` (a few lines).
5. `backend/server/tests/test_coop_permissions.py`.

**Walk-through.** The table is data, the helpers are tiny:

```python
@dataclass(frozen=True)
class Rule:
    phrase: str       # finishes "Join this game first to ...": the refusal names the action
    funding: str      # PERSONAL, FREE or REFUND_TO_PAYERS
    between_waves: bool = False
    roles: frozenset[str] = HOST_AND_MEMBERS

BUILD: Rule("build here", PERSONAL),
DEMOLISH: Rule("tear buildings down here", REFUND_TO_PAYERS, between_waves=True),
MOVE: Rule("move buildings here", FREE, between_waves=True),
```

```python
def role_of(owner, player_id, is_member):
    if player_id == owner:
        return HOST
    if is_member:
        return MEMBER
    return OUTSIDER

def payer_of(action, player_id):
    if rule_of(action).funding == PERSONAL:
        return player_id
    return None
```

```python
async def require_action(admin, owner, player_id, action):
    rule_of(action)  # an unknown action fails before any database call
    is_member = player_id != owner and await games.is_member_of(admin, owner, player_id)
    role = role_of(owner, player_id, is_member)
    if not allows(action, role):
        raise refusal(action)
    return Permit(role, payer_of(action, player_id))
```

The host's role comes from ownership alone, so the host never costs a database lookup (`player_id != owner and ...` short-circuits). `payer_of` can only answer "the clicker" or "nobody": there is no code path that makes the host or the island pay. A tear-down is `REFUND_TO_PAYERS`: no payer now, and the database refunds each original payer half of what they paid. `between_waves` is documentation of what the database enforces under its own lock (`wave_running`); this module does not enforce it. Because T36 and T31/T32 were written in parallel, the table already holds `MOVE`, `REPAIR`, `REBUILD` and the three arsenal actions; the arsenal ones have no caller yet.

Before this change, `service.py` called `games.require_member(...)`; now it calls `permissions.require_action(admin, island.owner, player_id, <ACTION>)` with the action of that route (`BUILD` by default, `UPGRADE`, `RESEARCH`, `TOWER_SKILL`, `WRECK`, `DEMOLISH`, `ISLAND_VISIT`). The status stays `403 not_member`, so older clients keep working; only the sentence changes. No route, table or migration changed.

**Tests that prove it.** `backend/server/tests/test_coop_permissions.py` (about 30 tests): the matrix; role by ownership then membership; the funding column; "only research, tear-down and moving are between waves only"; no shared wallet; the refusal keeps its code and names the action; a member who left is an outsider again; the host needs no membership row; a member's build is paid from the member's wallet; two members upgrading at once; retries charge once; membership lost under the database lock is still refused; absent members (a member rings the bell without the host, a late member joins until the first finish, a dropped participant reconnects, a participant who left still finishes their own fight, membership alone earns nothing, a wave nobody finishes pays nothing once expired).

**Limits.** The Python membership check and the database check are separate reads; the database's lock is the final word. The SQL rules have their own migration tests (not repeated here). Presence-based rules (quorum, auto-pause) cannot exist, because the server never knows who is online.

**Practice questions.**

1. *Explain.* What does `payer_of(DEMOLISH, "p2")` return, and why not `"p2"`?
   *Model answer:* `None`. `DEMOLISH` is `REFUND_TO_PAYERS`, not `PERSONAL`; nobody pays now, and the database refunds each original payer half of what *they* paid.
2. *Defend.* Why one module and a table instead of an `if` in every route?
   *Model answer:* later lanes (arsenal, recovery, rescue) get one helper and one place to read the policy, the error sentence is consistent, and a test can assert every row. The trade-off is that the module can say "allowed" while the database still refuses (for example `wave_running`), so both must stay in step.
3. *What if.* A member leaves the game during a wave. What can they still do?
   *Model answer:* they still finish their own fight (they are a wave participant) and get their own loot, but they cannot rejoin or revive (they are an outsider again for those actions). Test: "a participant who left the game mid-wave still finishes their own fight".

---

## 6. Last-chance rescue and minigame difficulty by wave (T38, T39)

**For the player.** (T39, visible in minigames.) Every wave minigame (boss haul, cannon, duel, Redtide's tasks) keeps today's numbers up to wave 10 and then gets steadily a little harder up to wave 100, never beyond. (T38, **not visible yet**.) When the heart falls or every captain is down, from wave 4, the captains still on the island would play a 10-second co-op "haul the treasure to safety". The wave is lost either way. If they win, the next bell rings the best wave minus 1 instead of minus 2.

**Flag.** `rescue`, **off by default and still off in production**, no migration for the rescue itself, needs `islands`. When #40 merged the `sim.js` hook was missing; **update (#52):** the hook is in (section 10, walk-through D) and the wave's `rules` list switches it on, which needs the `wave_rules` migration (applied live). The difficulty curves (T39) have no flag and are live.

**Decision.** [D044](DECISIONS.md#d044--last-chance-rescue-and-minigame-difficulty-by-wave--2026-11-14), proposed. Spec: [specs/T38-T39-minigames-rescue.md](../specs/T38-T39-minigames-rescue.md). Screenshots: `docs/evidence/T38-T39/`.

**Files, in order.**

1. `specs/T38-T39-minigames-rescue.md`.
2. `frontend/src/pirates/finisher/difficulty.js` (T39, pure numbers).
3. `frontend/src/pirates/finisher/rescue.js` (T38 rules, built on the boss-finisher machinery) and the changes in `rules.js`, `scene.js`.
4. `backend/server/island/rescue.py` (the server's decision, 40 lines) and the diffs in `backend/server/island/waves.py` and `backend/server/routes/waves.py`.
5. `frontend/src/island/wave-flow.js` and `api.js` (sending `rescued: true`).

**Walk-through A: the server's rule** (`rescue.py`, read all of it).

```python
RESCUE_FROM_WAVE = 4
RESCUE_LAST_WAVE = 100

def rescue_counts(rescued, survived, place, wave) -> bool:
    if not rescued or survived or place != "island" or wave is None:
        return False
    return RESCUE_FROM_WAVE <= wave <= RESCUE_LAST_WAVE

def restart_back(normal_back, counts) -> int:
    return max(0, normal_back - 1) if counts else normal_back

def next_wave_after_loss(best, back) -> int:
    return max(1, best - back)
```

A claim only counts if it was made, the wave was lost, it was an island wave (not Pirate Point), and the wave number is 4 to 100. Anything else is **ignored, never refused**. The route adds the flag check: `rescued=body.rescued and is_enabled("rescue", settings.flags)`. The result is just a different argument to the existing database function: `p_restart_back` is 1 instead of 2. Wave 0 is never rung (`max(1, ...)`). Example: best wave 10, lost wave, back 2 gives 8 next; a counted rescue gives back 1 and 9. "Exactly once" comes from the database: `wave_finish()` applies the restart rule at the first finish that closes the wave, so the first finisher's claim decides and a repeat changes nothing. The server cannot see the minigame, just like it cannot see `survived`; the worst a cheater gains is one wave of fallback, never loot.

**Walk-through B: the difficulty curves** (`difficulty.js`).

```js
export const CALM_UNTIL = 10;
export const FULL_AT = 100;
haul: Object.freeze({ speed: [1, 1.3], width: [12, 10], easyWidth: [18, 15], share: [.6, .65] }),

export function pressure(wave) {
  const n = typeof wave === 'number' && Number.isFinite(wave) ? Math.trunc(wave) : 1;
  return Math.max(0, Math.min(1, (n - CALM_UNTIL) / (FULL_AT - CALM_UNTIL)));
}
// in difficultyFor: value = early + (late - early) * p   (rounded; hits and prompts to whole numbers)
```

Each number is `[early, late]`. `pressure` is 0 up to wave 10, 1 from wave 100, and a straight line between. A missing or broken wave counts as wave 1. At wave 55, `pressure` is 0.5 and the haul speed is 1 + (1.3 - 1) x 0.5 = 1.15. `difficultySnapshot` freezes the numbers once when a minigame starts, from the wave number the server gave, so every client agrees and a late joiner changes nothing. The "early" values equal the old `FINISHER.tasks` numbers (a test keeps them equal), which is why waves 5 and 10 play as before.

**Tests that prove it.** `backend/server/tests/test_wave_rescue.py` (counts only waves 4 to 100; never for a won wave, Pirate Point or no claim; fallback one less and never wave 0; browser and server agree on the first rescued wave; ordinary loss still falls back two; flag off changes nothing; loot and best-wave arguments never move; a non-boolean `rescued` is refused). `frontend/tests/pirates/finisher-difficulty.test.js` (0 up to wave 10, 1 from 100, curves monotone, early numbers equal today's, a lagging captain can still win at the late waves, a captain idle for 38% wins at wave 10 and loses at wave 100), `rescue.test.js` (rules, once per wave, determinism, disconnects), `rescue-finish.test.js` (`rescued: true` is sent only for a won rescue).

**Limits.** (Update: the sim hook was added in #52; a two-browser run with the flag on is still open.) Mixed client versions in one wave would disagree on boss difficulty above wave 10. Human playtest of the late-wave numbers is pending (T3).

**Practice questions.**

1. *Trace.* Island best wave 10, wave 9 is lost with a counted rescue. Which wave rings next, and without the rescue?
   *Model answer:* `restart_back(2, True)` is 1, so 10 - 1 = 9; without a rescue back is 2, so 8. Never below 1.
2. *What if.* A client sends `rescued: true` after winning wave 6.
   *Model answer:* `rescue_counts` returns False because `survived` is true: the claim is ignored, not refused, the loot and fallback rules are exactly the normal ones.
3. *Explain.* What is `pressure(55)` and why does the haul at wave 8 play like today?
   *Model answer:* (55 - 10) / 90 = 0.5, halfway between early and late numbers. At wave 8, `n - 10` is negative, so `Math.max(0, ...)` makes `pressure` 0 and every number is its early value, which is today's.

---

## 7. Harbor weather: a words-only forecast (T46)

**For the player.** On the Harbor's weather board one new line appears when the server knows tonight's weather: "Forecast for tonight here: fog. Only to read: no coins are at stake." The board also says when an old or recorded reading was taken, and that a wave uses the weather where its bell is rung when the server can tell. It is **not** a stall with a stake.

**Flag.** None. **Decision.** [D045](DECISIONS.md#d045--t6-weather-idea-as-a-words-only-forecast-no-weather-stall-stake--2026-11-14), proposed: a coin stake on a real-world weather question would be a prediction market, which D035 rules out. T6 (another stall on real data) stays open for a different, non-betting mechanic. Spec: [specs/T46-harbor-weather.md](../specs/T46-harbor-weather.md). Screenshots: `docs/evidence/t46/`.

**Files, in order.** `specs/T46-harbor-weather.md`, `frontend/src/harbor/weather-model.js` (the words), `frontend/src/harbor/overview.js` (3 added lines that draw them), `frontend/scripts/check-island-weather.js` (browser check). The data comes from the existing `GET /api/weather` answer; no backend change.

**Walk-through.**

```js
const FORECAST = {storm: 'a storm', fog: 'fog', rain: 'rain', calm: 'a calm sea'};
tonight: state => `Forecast for tonight here: ${FORECAST[state]}. Only to read: no coins are at stake.`,

function tonightLine(answer) {
  const state = answer?.tonight?.state;
  return typeof state === 'string' && Object.hasOwn(FORECAST, state) ? WEATHER.tonight(state) : null;
}
```

The line is built only when `state` is a string **and** one of the four known states (`Object.hasOwn`), so an unexpected value from the server shows nothing instead of the word "undefined". The recorded fallback and demo mode have no hours, so their `tonight.state` is null and the line stays away. In the model the line is used as `tonight: valid ? tonightLine(answer) : null`, and `overview.js` appends it only `if (view.tonight)`. Times are written in UTC with numbers (`readingTime`) so the same words show on every machine.

**Tests.** `frontend/tests/harbor/models.test.js` ("shows tonight's forecast as words only, with no stake"), `frontend/tests/harbor/cards.test.js` (the storm card contains the forecast and wave-weather sentences; the offline card has no forecast but has the wave sentence), and the browser check `check-island-weather.js`.

**Limits.** The forecast covers tonight at the board's default place; a wave can use the bell-ringer's local weather, which the board now says.

**Practice questions.**

1. *Defend.* Why did the team not build "Will it rain in Lisbon tomorrow?" as a stall?
   *Model answer:* staking coins on a real-world outcome is a prediction market, which D035 rules out. A read-only line keeps the idea (more real data in the Harbor) with no stake, no new API, table or flag.
2. *What if.* The server sends `tonight.state` as `"hail"`.
   *Model answer:* `Object.hasOwn(FORECAST, "hail")` is false, so `tonightLine` returns null and the line is not shown; nothing else breaks.
3. *Test.* Which test shows the line is absent in offline mode?
   *Model answer:* `cards.test.js`: `expect(result.offline).not.toContain('Forecast for tonight')` (while the wave sentence is still there).

---

## 8. Leaderboard and captain statue (T45)

**For the player.** Menu, then **Leaderboard**, has two tabs: **This week** (the T7 board, Monday 00:00 UTC to the next Monday) and **All time** (it never resets). Each row shows the island's highest *won* island wave, its captain name and a crew label: `Solo` or `Crew of N`. A **This island** panel adds your best wave, your shield rank, your statue stage and the next milestones ("Next: Gold shield at wave 30 · Silver statue at wave 50"). On the home island the captain statue grows in four stages: bronze at wave 25 (the T5 statue), silver with a raised cutlass at 50, gold with a red pennant at 75 and crowned at 100. It is cosmetic only: no coins, no combat effect, no new save data.

**Flag and state.** No flag, no migration (it reads `wave_runs` and `wave_participants`, which already exist). **Live** since the merge of [#45](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/45) (`8c3d345`); [#47](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/47) (`8238f25`) then cut the database reads per board and made the statue drawing tolerate odd stage numbers.

**Decision.** [D046](DECISIONS.md#d046--highscore-scope-and-statue-stages--2026-11-14), proposed. Spec: [specs/T45-highscore-statue.md](../specs/T45-highscore-statue.md). It lists a re-check to do once the reset rules of T38/D044 are agreed. No altar exists in the code, so the spec extends the statue and adds none. Screenshots: `docs/evidence/t45/`.

**Files, in order.**

1. `specs/T45-highscore-statue.md` (the decision table: metric, ties, scope, solo versus crew).
2. `backend/server/island/leaderboard.py` (`weekly`, `all_time`, `best_runs`, `ranked`, `crew_sizes`).
3. `backend/server/routes/island.py` (the `scope` query parameter on the existing route; the default is this week, `all` is the second board, anything else is refused).
4. `frontend/src/art/milestones.js` (`STATUE_STAGES`, `statueStage`, `drawWaveStatue`).
5. `frontend/src/island/progression.js` (the card's plain text and the crew label), then `ui.js` and `index.js` for the tabs.
6. The tests (below).

**Walk-through A: the ranking is built from run history only** (`leaderboard.py`).

```py
runs = await best_runs(admin, {"finished_at": f"lte.{now.isoformat()}"})
```

```py
            "place": "eq.island",
            "survived": "eq.true",
            "expired": "eq.false",
            **window,
            "order": "wave.desc,finished_at.asc,id.asc",
```

`best_runs` asks only for finished, winning, non-expired island runs, highest wave first, and for equal waves the **earliest finish** first (D046: whoever reached the wave first is listed first). The "this week" board adds a time window to the same query; "all time" adds only a cutoff at the moment of the request, so a finish that lands while the pages are read cannot shift them. The function keeps the first run it sees per island (`best.setdefault(run.island_owner, run)`) and stops at ten islands. Because it reads `wave_runs`, never `islands.wave_best`, a reset, a rescue or a later lower win cannot lower anyone's score.

```py
    for position, run in enumerate(runs, 1):
        if run.wave != previous:
            rank = position
```

This is a competition rank: waves 30, 30, 25 become ranks 1, 1, 3. The crew label comes from one read of `wave_participants` for all ten runs:

```py
    return {wave_id: min(MAX_CREW, max(1, n)) for wave_id, n in counts.items()}
```

An old run with no participant rows counts as solo (never 0), and the count is capped at 10: a room holds at most ten captains, but `wave_participants` also keeps people who joined and left, and the browser refuses a row above ten (one bad row would hide the whole board). #47's change: before, each of the ten rows made its own name read and its own crew read (about 21 requests per board); now `ranked` makes one `profiles` read (`id=in.(...)`) and one `wave_participants` read (`wave_id=in.(...)`) after the runs page, about three in all.

**Walk-through B: statue stages and plain text** (`milestones.js`, `progression.js`).

```js
export function statueStage(wave) {
  const best = Number.isSafeInteger(wave) ? wave : 0;
  const reached = STATUE_STAGES.filter(stage => best >= stage.wave);
  if (!reached.length) return {index: 0, wave: 0, name: 'none', metal: null};
  return {index: reached.length, ...reached[reached.length - 1]};
}
```

Anything that is not a safe integer counts as wave 0, so a bad value shows no statue instead of throwing. In #47 the drawing function got the same care: `index = Number.isInteger(index) ? Math.min(4, Math.max(1, index)) : 1;`, so a stray `2.5` or `NaN` draws stage one.

```js
export function crewLabel(crew) {
  if (!Number.isInteger(crew) || crew < 1 || crew > MAX_CREW) return '';
  return crew === 1 ? 'Solo' : `Crew of ${crew}`;
}
```

An unknown count shows nothing rather than a wrong label. The label only tells solo and crews apart: there is **one shared ranking**, with no adjustment for crew size (a D046 choice).

**Tests that prove it.**

- `backend/server/tests/test_island_leaderboard.py`: `test_all_time_reads_the_whole_run_history_and_never_resets`, `test_a_later_reset_or_lower_wave_cannot_lower_an_all_time_score`, `test_equal_waves_are_listed_by_who_reached_them_first`, `test_crew_counts_the_captains_of_the_scoring_run_only`, `test_a_run_without_recorded_captains_still_counts_one`, `test_crew_is_capped_at_ten`, `test_a_board_costs_one_runs_page_plus_two_batched_reads` (the #47 claim, as a test), `test_route_scope_chooses_the_board_and_refuses_unknown_scopes`.
- `frontend/tests/island/progression.test.js` (stage boundaries 24/25/49/50/74/75/99/100, summaries and lines), `frontend/tests/island/leaderboard.test.js` (scope checks, tabs, crew label, the "This island" panel, the remembered tab) and `frontend/tests/island/decorations.test.js` (the statue draws for any index without throwing).

**Limits.** The all-time scan is bounded (`MAX_PAGES` 20 pages of `PAGE_SIZE` 100, so 2,000 runs) and answers `503 leaderboard_unavailable` rather than a partial board; with many repeated wins at top waves it may later need a database aggregate. The crew count includes captains who joined the run and then dropped out. Your own position outside the top ten is not shown. The tests use fake database reads, not a live one.

**Practice questions.**

1. *Explain.* Why does the ranking read `wave_runs` and not the island's `wave_best` column?
   *Model answer:* run history only grows, so a reset, a rescue or a later lower win cannot lower a score. `wave_best` is a current state that a reset rule might change (the D044 re-check in the spec).
2. *Trace.* Islands A, B and C won waves 30, 30 and 25. A finished wave 30 at 10:00, B at 09:00. What does the board show?
   *Model answer:* B (rank 1), A (rank 1), C (rank 3). The order inside the tie is earliest finish first; the rank number is shared, and the next rank skips to 3.
3. *Bug.* `wave_participants` has 14 rows for one run. What does the card show and why?
   *Model answer:* `Crew of 10`. `crew_sizes` caps the count at `MAX_CREW`, because a larger number would make the browser refuse that row and hide the whole board.

---

## 9. The island arsenal (T40, T41, T44)

**For the player.** A new building, the **Arsenal**, stands on every island (between the watchtower hill and the west house). Walk up and press E (or tap). The crew keeps its weapons there: up to **20 stored copies**. Every captain always has the standard **musket**. You can **Buy** a weapon type (pistols, blunderbuss, long rifle, fire bombs) with your own coins: it goes into your hands if they are empty, else onto the rack. **Take** a stored copy to carry it, **Swap** if you already carry one, **Return** to put it back. A copy is never in two places: it is on the rack or in exactly one captain's hands. The card shows "Stored: n of 20", every copy with its number and holder, and each type's damage, range and reload at your captain level. Nothing moves during a wave.

**Flag and state.** Flag `arsenal`; migration `20261114120000_arsenal.sql`. **Live:** the migration was applied on 14 Nov, `arsenal_convert_personal_weapons()` was run once (1 copy converted, 0 islands left with personal weapons) and the flag has been on in production since about 20:48 UTC, after the release check in [#53](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/53) (`d606ec7`). The feature merged in [#51](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/51) (`ce21d2d`). With the flag on, the old weapon shop answers `409 use_arsenal`; with it off the old shop works as before.

**Decision.** [D042](DECISIONS.md#d042--shared-island-arsenal-20-stored-copies-and-the-weapon-table--2026-11-14), proposed; it also holds the weapon table for T44 (the existing five types, no new mechanic). Spec: [specs/T40-T41-arsenal.md](../specs/T40-T41-arsenal.md). Who may do what comes from the co-op matrix of D043 (section 5). Screenshots: `docs/evidence/t41/`.

**Files, in order.**

1. `specs/T40-T41-arsenal.md` (the policy table: full rack, leaving captains, waves, conversion).
2. `supabase/migrations/20261114120000_arsenal.sql` (tables, capacity trigger, `arsenal_*` functions).
3. `backend/server/island/arsenal_rules.py`, `arsenal_policy.py`, `arsenal.py`, `routes/arsenal.py`.
4. `frontend/src/island/arsenal-model.js` (what the card shows), `arsenal.js` (the controller), `arsenal-api.js`, `arsenal-ui.js`.
5. `frontend/src/island/arsenal-fake.js` (the same rules in memory, for tests and `?islands=fake`).
6. `frontend/scripts/check-arsenal-mp.js` (the #53 release check).

**Walk-through A: the database makes the invariant impossible to break** (`20261114120000_arsenal.sql`).

```sql
create unique index if not exists arsenal_copies_one_per_holder
  on public.arsenal_copies (island_owner, holder) where holder is not null;
```

A copy has one `holder` column: `null` means stored on the rack, otherwise it is the captain who carries it. One column means a copy cannot be "stored and carried" at once, and this index means a captain carries at most one copy per island. The 20-slot limit has two locks. Each move function locks the island row and counts; and a deferred constraint trigger checks again at commit:

```sql
  if (select count(*) from public.arsenal_copies
       where island_owner = new.island_owner and holder is null) > public.arsenal_capacity() then
    raise exception 'arsenal_over_capacity' using errcode = 'check_violation';
```

"Deferred" lets a swap pass through 21 inside one step, because the check happens at commit. A return into a full rack is refused, not squeezed in:

```sql
  if v_stored >= public.arsenal_capacity() then
    return jsonb_build_object('status', 'refused', 'reason', 'arsenal_full');
  end if;
```

The copy then stays in the captain's hands, so nothing is ever discarded. Every move also begins by looking for its own `action_uid` in `arsenal_moves`: a repeat answers `repeat` and changes nothing, and the same id used for another action is refused `action_used`.

**Walk-through B: rules before the database, card after** (Python and JavaScript).

```py
    entry = weapon_named(catalogue, weapon)
    if entry.weapon == STANDARD_WEAPON:
        raise ApiError(
            409, "standard_weapon", "The musket is standard issue: every captain carries one."
        )
```

The musket is never a copy and never costs a slot; `check_buy` then refuses a locked type (`409 locked`). The database repeats every rule under the lock, so these checks only give a clear message before anything is written. On the card, `arsenal-model.js` turns the server's answer into buttons and reasons:

```js
  const back = mine ? {label: busy === 'return' ? 'Returning…' : 'Return to the rack', disabled: !!closed || full || busy !== null,
    reason: closed || (full ? `The rack is full (${capacity} of ${capacity}): swap instead, or wait for a free slot.` : '')} : null;
```

The model only says which buttons are on and why; the server decides every move. The weapon you shoot with comes from the controller, and the island uses it ahead of the old equipped weapon:

```js
    weapon() {
      if (!enabled()) return null;
      return readWeapon(current()?.carried);
    },
```

```js
weapon: arsenal.weapon() ?? readWeapon(own?.weapons?.equipped),
```

With the flag off `weapon()` is `null` and the old equipped weapon is used. The arsenal is read again on landing, before each wave and after a crewmate's move (the room's `island_changed`), so a stale tab picks up a released copy at the next wave's preparation.

**What #53 added.** `npm run test:arsenal` (`check-arsenal-mp.js`) runs two captains on one island against the shared fake server with the flag on, and one context with the flag off: a double-click buy charges once, two captains taking one copy (one gets it, the other is refused `taken`), a full rack of 20 refusing the return, every move refused `wave_running` during a wave, and a reload keeping each captain's copy. The PR also fixed two things. First, the fake server still sold weapons with the flag on; now it answers `409 use_arsenal` like the real route. Second, a refused move's reason was wiped by the refresh that follows it. The controller now keeps a flag `loadFailed` and sets the message **after** the refresh:

```js
      answer = before;
      if (REFRESH_ON.has(result.code)) await refresh();
      message = result.message; loadFailed = false;
```

A later good read clears only a message that came from a failed read (`if (loadFailed) {...}`), so a crewmate's change can no longer erase "Another captain took that weapon just now."

**Tests that prove it.**

- `backend/server/tests/island_sql/test_arsenal_sql.py` (opt-in; a skip is not a pass): `test_slot_19_and_20_fill_and_the_21st_stored_copy_is_refused_without_charging`, `test_the_database_itself_refuses_a_21st_stored_copy`, `test_a_swap_needs_no_free_slot_and_keeps_the_rack_full`, `test_a_return_into_a_full_rack_is_refused_and_the_copy_stays_in_hand`, `test_two_captains_claiming_one_copy_at_once_get_it_once`, `test_the_same_buy_sent_twice_at_once_charges_once`, `test_applying_the_migration_converts_nobody_and_the_first_look_converts`.
- `backend/server/tests/test_arsenal_routes.py`: the flag-off 404s, the old shop pointing to the arsenal while the flag is on, refusals before the database, `test_the_capacity_and_the_policy_match_the_migration`.
- `frontend/tests/island/arsenal.test.js` (19/20/21 slots, full return, two captains, same-type copies, click ids, "a refused move keeps its reason on the card after the arsenal is read again"), `arsenal-dom.test.js`, and the browser check `npm run test:arsenal`.

**Limits.** Combat is still simulated in the browsers, so a modified client could send another weapon id in a shot message; honest clients read their copy from the server before each wave. A member who stays in the game but never returns a copy keeps it (recall belongs to T37/T42). A captain who left the game keeps the copy until the arsenal is next used, then it goes back on the rack while there is room. The browser check uses the fake server, not the real routes or Postgres; those are covered by the route tests and the opt-in SQL tests.

**Practice questions.**

1. *Explain.* Why is the capacity check a *deferred* trigger and also a count under the island lock?
   *Model answer:* the lock plus count refuses a 21st copy early with a clear reason; the trigger is the last guard at commit, so even a bug in a function cannot leave 21 stored. It is deferred so that a swap (one copy goes back as another comes out) may pass through 21 inside one step.
2. *Trace.* The rack holds 20 stored copies and you carry one. You press Return while a crewmate presses Swap on a stored copy.
   *Model answer:* both functions lock the island row, so they run one after the other. A swap sends the crewmate's old copy back as it takes the new one, so the rack still holds 20 afterwards. Your Return is refused `arsenal_full` in either order, and the copy stays in your hands: nothing is lost or doubled.
3. *Defend.* Why does a full rack refuse a return instead of putting the copy in a 21st slot?
   *Model answer:* "at most 20 stored" stays exact and nothing is ever discarded. The cost is that a captain may have to swap or wait; a swap is always allowed because it keeps the count at 20.

---

## 10. Integration: wave rules, tower health, pathing, rescue hook, wall guard (#52)

[#52](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/52) (`35145fd`) connects lanes that were only modules, art or server code until then. This section walks its five parts.

**For the player.** With every new flag off, nothing changes. With the flags on (one wave rule each): towers have hit points, boarders hack towers and can break them, boarders walk round or through the real walls instead of fixed routes, and a lost wave first offers the 10-second rescue haul. Separately, a wave that ends can no longer heal walls for free.

**Flags and state.** Wall guard: part of `wall_recovery`, **live** (that flag has been on since about 20:28 UTC, after this guard and `npm run test:walls`). The wave rules `tower_health` (T33, D049) and `rescue` (T38, D044) are **live** (on since about 21:53 and 21:05 UTC); `pathing` (T34/T35, D040) is **merged, off** pending a team decision (section 15). The migration `20261114130500_wave_rules.sql` is applied live. **Update (#63):** since [PR #63](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/63) every wave answer calls `wave_rules_keep` and keeps the set even when it is empty, so the migration is needed whatever the flags say, and the walk-through below describes the version before #63 where it differs; section 15 has the current one. Specs: [T33-tower-health.md](../specs/T33-tower-health.md), [T34-T35-targeting-pathing.md](../specs/T34-T35-targeting-pathing.md#wiring-as-built-14-nov), [T38-T39-minigames-rescue.md](../specs/T38-T39-minigames-rescue.md). Decisions: [D049](DECISIONS.md#d049--tower-health-inside-a-wave-t33--2026-11-14) (new, proposed), D040, D044.

**Files, in order.**

1. `backend/server/island/wave_rules.py` and `supabase/migrations/20261114130500_wave_rules.sql` (how a wave's rules are fixed), `routes/waves.py` (the `rules` key on the wave answers).
2. `frontend/src/pirates/wave-rules.js` (answer to options), `controller.js` (passes them to the sim).
3. `frontend/src/pirates/tower-health.js`, then its use in `sim.js`.
4. `frontend/src/pirates/boarder-paths.js` (the grid), then `pathTarget` and `paths` in `sim.js`.
5. `frontend/src/pirates/finisher/rescue.js` and the rescue lines in `sim.js`.
6. `backend/server/island/wall_health.py` (`cap_to_start`) and `wall_repair.py` (`record`, `record_after_finish`).

**Walk-through A: one rule set per wave, the same for every client** (`wave_rules.py`).

```py
SIM_RULES = ("tower_health", "pathing", "rescue", "defenses_v2")
```

```py
def wanted_rules(settings: Settings) -> list[str]:
    """The rules of SIM_RULES whose flag is on now, in that order."""
    return [name for name in SIM_RULES if is_enabled(name, settings.flags)]
```

The first answer for a wave (start, join or current) keeps the rule set in the table `wave_rules`, and every later answer serves the kept set. So a friend who joins after a flag was switched plays the bell-ringer's rules, and every client simulates the same wave. The `rules` key is left out of the answer while the kept set is empty (before #63 nothing was kept at all while every rule flag was off). Keeping rules must never break a wave:

```py
    except ApiError as error:
        # The wave itself is fine (started or joined): never fail it for its rules. With the
        # database down, it plays with no rules, as before this feature.
        logger.warning("Wave rules not kept; the wave plays without them: %s", type(error).__name__)
        return None
```

In the browser, `wave-rules.js` maps the names to `createWave()` options and ignores anything unknown:

```js
export const RULE_OPTIONS = Object.freeze({
  tower_health: 'towerHealth', // T33 (D049, proposed): towers have hp, break and are repaired in the wave
  pathing: 'pathing',          // T34/T35 (D040, proposed): boarders walk round or through the real walls
  rescue: 'rescue',            // T38 (D044, proposed): a lost wave first offers the last-chance rescue
});
```

In `controller.js` the spread `...(info.rules ?? {}), ...simOptions` puts the server's rules first and the demo harness's own options last. The client never reads its own `/api/config` for these.

**Walk-through B: tower health** (`tower-health.js`, used by `sim.js` only when the wave has `towerHealth`).

```js
export function towerLook(tower) {
  if (!tower || !Number.isFinite(tower.hp) || !(tower.maxHp > 0)) return 'intact';
  if (tower.hp <= 0) return 'broken';
  return tower.hp / tower.maxHp <= TOWER_HEALTH.damagedShare ? 'damaged' : 'intact';
}
```

This is where the drawings of section 2 are finally used: broken at 0 hp, damaged at or below half. Cannons, mortars and harpoons get hp by level (cannon 80 to 400, mortar 70 to 360, harpoon 60 to 320). Boarders hack a tower in reach after a captain and the wall in their way (the order of section 3). The blow that breaks a tower:

```js
    if (!has(tower) || tower.hp <= 0) return false;
    const taken = Math.min(tower.hp, round2(damage));
```

A broken tower takes no more blows, so `tower_broken` is sent once. A broken tower stops firing (`canFire`), cannot be fired by hand and is no longer jammed by gunboats. In the wave, E repairs a damaged tower (+10 hp a second for 3 s) or rebuilds a broken one at 40% (60% with Master shipwright, 5 s cooldown), free, like walls. **Every new wave starts every tower whole**: lasting damage is a follow-up (D049), unlike walls.

**Walk-through C: pathing** (`boarder-paths.js`, `sim.js`). With the rule on, only the landing and the heart stay of the old fixed route:

```js
    if (paths) route.splice(1, route.length - 2);
```

The grid finds the way between: each wall covers the cells of its 2-by-2 T36 footprint, a boarder takes a gap when walking round is quicker than hacking, else it breaks through the cheapest wall. `pathTarget` returns a wall to hack, a tower in reach, a step to walk, the heart, or `none` (no way: it waits). `paths.refresh()` runs once a tick, and the distance field is rebuilt only when the layout's key changes, which happens when a wall's hp changes. Without the option `paths` is `null` and today's fixed routes stay (D040 option A); the dice above that line are drawn alike either way, so the seed's random stream is untouched.

**Walk-through D: the rescue hook** (`sim.js`). Two small spots connect section 6's module. When a wave would end lost, the rescue gets the first word:

```js
    if (rescue.offer(reason, events)) return; // island_lost / captains_fallen: the last chance first
```

and while it runs the battle stands still and the rescue decides when the wave really ends (still lost):

```js
    if (rescue.active) { if (!rescue.tick(events)) end(rescue.reason, events); return; }
```

`rescue.result()` adds `rescued: true` to the finish only after a won haul; the server ignores it unless the flag `rescue` is on.

**Walk-through E: the wall-recovery guard** (`wall_health.py`).

```py
    capped = {}
    for plot, health in sorted(reported.items()):
        if plot in start:
            capped[plot] = min(start[plot], health)
    return capped
```

The finish reports each wall's percent from the browser's simulation, which the server cannot check. `cap_to_start` keeps only walls the wave started with, and never above their starting health, so a finish can damage but never heal or invent a wall. A free E repair inside the wave helps that wave only; lasting recovery is the paid card or the 10-minute timer. The second change is in `routes/waves.py`: the wall record now runs through `record_after_finish`, which logs a database problem and swallows it, because the coins are already paid by then and the player must get the answer of the paid finish, not a 5xx.

**Tests that prove it.**

- `backend/server/tests/test_wave_rules.py`: the order of rules; (since #63) an empty set is kept too and a flag switched on mid-wave changes nothing for later joiners; `test_a_joiner_after_a_flag_flip_gets_the_rules_the_wave_started_with`; `test_a_failing_rule_store_never_breaks_the_wave_it_plays_without_rules`. `island_sql/test_wave_rules_sql.py`: the first call keeps the rules, a later one changes nothing, unknown names refused, players cannot run it (opt-in).
- `backend/server/tests/test_wall_recovery.py`: `test_cap_to_start_keeps_damage_and_never_heals_or_invents_a_wall`, `test_an_unreadable_wall_record_reply_is_logged_not_an_error`.
- `frontend/tests/pirates/wave-rules.test.js`, `tower-health.test.js` (hp by level, one `tower_broken`, E repair and rebuild, same seed same wave, off means exactly as before), `pathing-wiring.test.js` (the wall footprint, a closed ring versus a lone wall, replay, option A unchanged), `rescue-sim.test.js` (a lost wave waits for the rescue; never on Pirate Point or below wave 4).
- Browser check: `npm run test:walls` (`check-wall-recovery-mp.js`); its scenario P is the "a finish cannot heal a wall" check. Its header comment still calls P pending; the fake server (`fake-api.js`, `recordWalls`) now follows the cap.

**Limits.** (Update: since #63 a wave keeps its first answer's set, empty or not, so neither switching the last flag off nor the first flag on changes a running wave; a wave started before #63 was deployed keeps the flags of its next answer.) Mixed client versions in one wave can disagree, so reload every client after a flag changes. Tower hp numbers and the pathing balance need the T3 playtest before the flags go on; D049 is a proposal (the balance check of section 15 is done for `tower_health` and `pathing`). Towers are not path obstacles (follow-up). The two-browser run with `rescue` on is done (#54).

**Practice questions.**

1. *Trace.* The bell-ringer starts wave 12 with `pathing` on. Nils then switches `pathing` off in Vercel and redeploys. A friend joins wave 12. Which rules does the friend play?
   *Model answer:* the kept set. The first answer stored `["pathing"]` in `wave_rules`, and join serves the kept set, so both play with pathing. A wave started after the switch has no `pathing`.
2. *What if.* The migration `20261114130500_wave_rules.sql` was not applied (a fresh database).
   *Model answer:* `wave_rules_keep` fails, `rules_for_wave` logs a warning and returns `None`, so the wave starts and plays with no rules. It never answers a 5xx. Since #63 this happens on every wave answer, whatever the flags say, not only when a rule flag is on. (It is applied live.)
3. *Defend.* Why cap a wall at the health it started the wave with, instead of trusting the browser's number?
   *Model answer:* the server cannot replay the battle, so a modified client could report 100 for every wall and heal for free. The cap means a finish can only damage. A client can still report lower numbers, which is bounded: first finish only, participants only, play money, 10-minute timer.

---

## 11. Culverin data and art (T43, #50)

> **Update (14 Nov, late evening).** The culverin is now **in the fight and live.** [#56](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/56) (`4d83dcd`) wired it into the sim, the card and the renderer, added the migration `20261114140000_culverin.sql` (applied live) and the wave rule `defenses_v2`; [#62](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/62) (`880714f`) added `npm run test:culverin` and fixed a visitor's card, which always showed the culverin locked. The flag `defenses_v2` has been on in production since about 21:53 UTC. The text below describes the stage of #50 (data and art only); where it says "not wired", "off" or "no migration", read it as history. Do not switch the flag off while culverins are built: the server then hides them (OPEN-TODOS follow-ups).

**For the player.** Nothing yet. The culverin is a long gun for the seven island tower spots (damage 30 to 96, range 44 to 52, reload 4.0 to 2.8 s): it never shoots boarders or ships closer than 12, and goes for gunboats and siege barges first, then the ship with the most hp left. Its data, drawings and server catalogue are merged; the fight code is not.

**Flag and state.** Flag `defenses_v2`, **merged, off** in production. [#50](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/50) (`723df50`) is the prep stage; the sim wiring, the card/render wiring and a migration are still to do (the sim wiring is in progress). **Do not switch the flag on before the wiring and the migration are merged and applied:** `islet_buildings` only accepts the plot/kind pairs of the harpoon migration, so the database would refuse a built culverin, and the migration for it is not written yet (`20261114130500_wave_rules.sql` is not it).

**Decision.** [D048](DECISIONS.md#d048--t43-the-culverin-is-the-first-new-defense-behind-the-flag-defenses_v2--2026-11-14), proposed. Spec: [specs/T43-new-defenses.md](../specs/T43-new-defenses.md) (it compares four candidates and has the "sim wiring note" for the next person). Evidence: `docs/evidence/t43/culverin-sheet.png`.

**Files, in order.**

1. `specs/T43-new-defenses.md`.
2. `backend/content/defenses_v2.json` (prices, level waves, spots, card line).
3. `backend/server/island/catalogue.py` (`read_defenses_v2`, `catalogue_for_flags`) and the call in `backend/server/app.py`.
4. `frontend/src/pirates/defenses-v2.js` (the stats the sim will read), `frontend/src/island/defenses-v2.js` (the card data), `frontend/src/art/defenses-v2.js` (the drawings).
5. `backend/server/tests/test_defenses_v2.py` and `frontend/tests/pirates/defenses-v2.test.js`.

**Walk-through.**

```py
    if not flags.get(DEFENSES_V2_FLAG, False):
        return catalogue
```

With the flag off `catalogue_for_flags` returns **the same object**, and the file is not even read, so `GET /api/island` is exactly what it was and `POST /api/island/build {kind: "culverin"}` is `422 wrong_kind`. With the flag on, the culverin is merged into the kinds, the seven tower spots and the campaign steps, so the existing price and unlock rules treat it like the harpoon tower. A broken file with the flag on is logged and the island keeps running without it. `app.py` applies it once at start-up:

```py
        island_catalogue = catalogue_for_flags(island_catalogue, settings.flags)
```

The numbers live in two places on purpose, and a test keeps them equal (the server checks prices and unlocks from the JSON file, the sim will read the stats):

```js
      Object.freeze({damage: 30, range: 44, reload: 4.0}),
```

```js
    minRange: 12,      // ships closer than this are the cannons' job
    boarders: false,   // never aims at boarders
    gunner: false,     // gunners stay on cannons and mortars
    hpShare: 0.7,      // T33: 70% of a same-level cannon's hp; destroyed, it stops firing until rebuilt (T30–T32)
```

The comment at the top of that file says it plainly: "Nothing imports this into src/pirates/sim.js yet". Its damage per second stays below a cannon's of the same level, so it does not replace cannons; its reach (44 to 52) beats the mortar's and covers where a gunboat or a barge anchors. It stands on the existing tower spots (`cannon_1` to `cannon_7`), so it does not wait for T36.

**Tests that prove it.** `backend/server/tests/test_defenses_v2.py` (`test_with_the_flag_off_the_catalogue_is_unchanged`, `test_with_the_flag_off_a_broken_file_is_never_read`, `test_with_the_flag_on_the_culverin_joins_the_tower_spots_and_the_campaign`, `test_a_broken_file_is_refused_with_a_clear_message`, `test_flag_off_island_answer_and_build_are_as_before`, `test_flag_on_island_answer_lists_and_locks_the_culverin`), `test_flags.py` (`test_flag_names_are_exactly_the_agreed_list` lists `defenses_v2`) and `frontend/tests/pirates/defenses-v2.test.js` (five rising levels; "a long reach, not a better cannon": less damage a second, more range than any tower; the prices, waves and line shared with `backend/content/defenses_v2.json`; the card is on only when the server says exactly `true`; every level registered idle, firing, damaged and broken). One test there, "is not part of the running game yet: the sim does not know the kind", is meant to be changed by whoever wires the sim.

**Limits.** No sim wiring (so no culverin can fire), no migration yet for building one, no research branch, no balance numbers from play. The numbers are a proposal (D048).

**Practice questions.**

1. *Explain.* Why does `catalogue_for_flags` return the same object when the flag is off, instead of a copy without the culverin?
   *Model answer:* it proves "off means exactly as before": the live game gets the very object it had, the file is never read, and nothing can leak into an answer by accident.
2. *What if.* Someone switches `defenses_v2` on today.
   *Model answer:* the island answer would offer a culverin and the server would accept a build, but the database rule on `islet_buildings` only knows the old pairs, so the insert would fail; and nothing in `sim.js` would fire it. That is why the flag stays off until the wiring and the migration are merged and applied.
3. *Defend.* Why a culverin and not the fire brazier, the swivel-gun nest or the tar pit?
   *Model answer:* it answers the enemies the current towers handle badly by design (gunboats and barges anchor outside tower reach), has a clear counter (close ships and boarders), needs the least new sim code (one tower kind with its own target rule, like the harpoon) and does not wait for T36. The brazier overlaps fire effects, the nest overlaps cannons, and the tar pit needs the T35/T36 contracts.

---

## 12. Test and check repairs (PRs #36, #37, #42, #48, #49, #53)

These PRs change **checks, not the game** (the last three add a two-captain release check per flag), so that the merge gate in D047 and the flag switches can be backed by a run. Read them to understand what the gate really tests.

| PR | File | What changed and why |
|---|---|---|
| #36 | `frontend/scripts/check-pixel.js` | The game opens in Saltreach Harbor (D031), so the harbor layout assets and `harbour-office-glow` are allowed at start in the "requests only active pixel artwork" check. Anything outside the Lighthouse kit plus that layout still fails. |
| #37 | `frontend/scripts/check-online-signin.js` (new), `check-online-signin-gate.js`, `package.json`, `docs/TEST-MAP.md` | A new `npm run test:signin` runs `check-online-auth` and then `check-online-signin-gate`. The two files only **export** functions, so `node scripts/check-online-auth.js` alone checks nothing and exits 0; always use the npm script. The gate check now waits for `GET /api/me` instead of a stale wallet-ledger read and expects the current sign-in wording. |
| #42 | `frontend/scripts/check-multiplayer.js`, `frontend/src/pirates/fake-api.js` | `npm run test:mp` was unreliable: the island arrival cutscene can close by itself before a click lands, and the fake server's dev helpers could be overwritten by another tab's request. Helpers now run under the same lock as requests. |
| #48 | `frontend/scripts/check-wall-recovery-mp.js` (new), `fake-api.js`, `package.json` | `npm run test:walls`: two captains on one island against the shared fake server with `wall_recovery` on. Damage kept after a wave, Repair/Rebuild instead of Upgrade, a double click charges once, no repair while a wave runs, the 10-minute timer. |
| #49 | `frontend/scripts/check-placement-mp.js` (new), `package.json` | `npm run test:placement`: two pages, a wall and a cannon moved from the card, the other page follows within 2 s, sea and overlap refused, Move off during a wave, a reload keeps the layout. |
| #53 | `frontend/scripts/check-arsenal-mp.js` (new), `src/island/arsenal.js`, `src/pirates/fake-api.js` | `npm run test:arsenal` (section 9), plus the two fixes it found. |

**Walk-through (the #37 runner).**

```js
const checks = [['check-online-auth', checkOnlineAuth], ['check-online-signin-gate', checkOnlineSignInGate]];
let failed = false;
for (const [name, run] of checks) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failed = true; console.error(`FAIL ${name}: ${error?.stack ?? error}`); break; }
}
process.exit(failed ? 1 : 0);
```

It runs the checks in order, stops at the first failure and returns a non-zero exit code, which is what a gate needs. These are browser checks with an **intercepted** Supabase origin and generated credentials: **not** a real GitHub login (TEST-MAP says so).

**Practice questions.**

1. *Bug.* Why would running `node scripts/check-online-auth.js` by itself be a misleading "pass"?
   *Model answer:* the file only exports a function, so Node runs nothing and exits 0. Use `npm run test:signin`.
2. *Defend.* #36 widens an allow-list instead of deleting the check. Why is that better?
   *Model answer:* the check still fails for any art outside the Lighthouse kit plus the harbor layout, so it keeps catching accidental extra art; only the start screen it was written for changed (D031).
3. *Explain.* Why did the fake API's helper wrapper need a lock?
   *Model answer:* in a shared world a helper read the world, changed it and saved it outside the lock the requests use, so another tab's older copy could be saved over the change (the role pick lost its captain). Running helpers under the same lock serves everything in order.

---

## 13. How the flags and migrations fit together

**One-page picture.**

```
Vercel setting FEATURE_FLAGS="islands,wall_recovery,..."   (a comma list; owner edits it, then redeploys)
        |
        v  read once at server start
backend/server/settings.py        flags=parse_flags(env.get("FEATURE_FLAGS", ""))
backend/server/flags.py           FLAG_NAMES = (... "rescue", "wall_recovery", "placement", "defenses_v2", "arsenal", "tower_health", "pathing")
        |                         a name not in FLAG_NAMES stops the server at start (typo protection)
        |                         every flag is False unless listed
        +--> feature routes:      is_enabled("wall_recovery", settings.flags)  ->  else 404 feature_off
        +--> app.py:              placement flag copied onto the island catalogue
        +--> GET /api/config:     {"flags": {"wall_recovery": false, ...}, ...}   public, no secrets
                                  |
                                  v
                       the browser reads it at start-up and shows a feature only when its flag is true
```

**The rules, in plain words.**

- **The server decides, the browser asks.** `GET /api/config` (`backend/server/routes/config.py`) returns `flags` from the server's settings. The browser never decides a flag itself.
- **Off means "exactly as before."** Each lane's tests include a "flag off" case: wall routes `404`, `placement` off shows fixed spots and never reads the layout table, `rescued` is ignored.
- **A typo cannot hide.** `parse_flags` raises `UnknownFlagError` for any unknown name, so `FEATURE_FLAGS=wall_recover` stops the server at start instead of silently doing nothing. That is also why a new flag name must be added to `FLAG_NAMES` and to the list in `.env.example` and the flag table in `INTERFACES.md` (the recipe is [ENGINEERING.md, section 4.5](ENGINEERING.md#45-add-a-feature-flag)); `test_flags.py`, `test_health_and_config.py` and `correctness/test_settings_contract.py` each list the names.
- **Migrations and flags are two separate, announced steps** (D047): (1) apply the SQL file to Supabase; (2) switch the flag on in Vercel and redeploy. A flag that needs a table must never be on before its migration is applied, or the routes read columns that do not exist. The code protects itself in one place: with `placement` on but the table missing, the island still works and answers `layout.movable: false` and the move route answers `503 layout_unavailable`. For `wall_recovery` we found no equivalent fallback in the code we read, so its flag is the guard. A second, softer fallback exists for the wave rules: if `wave_rules_keep()` fails, the wave answer simply carries no `rules` and the wave plays as before (section 10). Since #63 that function is called on every wave answer, even with every rule flag off, so the wave-rules migration is no longer "only needed once a rule flag is on"; it is applied live. The arsenal has no such fallback: with `arsenal` on and no tables, its routes fail, so the flag is the guard there too.
- **Reversible.** All five migrations are additive in effect (`add column if not exists`, `create table if not exists`, `create or replace function`; the culverin one replaces two check rules and keeps every pair they allowed), and the comment block at the top of each file lists the exact statements to undo it.

**The T29–T47 flags and their migrations.**

| Flag | Needs | Migration file | Adds | Production, 14 Nov evening |
|---|---|---|---|---|
| `wall_recovery` | `islands` on, migration applied first | `supabase/migrations/20261114100000_wall_recovery.sql` | columns `islet_buildings.wall_health` (0–100, default 100) and `wall_damaged_at`; table `island_wall_records` (one row per island wave, no browser access); functions `island_walls_record()` and `island_wall_restore()` (service role only) | applied; flag **on** (about 20:28 UTC) |
| `placement` | `islands` on, migration applied first | `supabase/migrations/20261114110000_island_layout.sql` | table `island_layout` (one row per moved spot, half-unit cells, known plots only) and function `island_move()` (island lock, compare-and-swap, refuses during a wave) | applied; flag **on** (about 19:45 UTC) |
| `arsenal` | `islands` on, migration applied first | `supabase/migrations/20261114120000_arsenal.sql` | tables `arsenal_copies` and `arsenal_moves`, a commit-time capacity trigger, the `arsenal_*` functions and `arsenal_convert_personal_weapons()` (section 9) | applied; conversion run once; flag **on** (about 20:48 UTC) |
| `tower_health`, `pathing`, `rescue` (and `defenses_v2`, below) | `islands` on; migration applied first (they travel as `rules` on the wave answers; since #63 the migration is needed for every wave answer) | `supabase/migrations/20261114130500_wave_rules.sql` | table `wave_rules` (one row per wave, no browser access) and `wave_rules_keep()` (sections 10 and 15). `rescue` also uses the existing `wave_finish()`'s `p_restart_back` | applied; `tower_health` **on** (about 21:53 UTC), `rescue` **on** (about 21:05 UTC), `pathing` **off** (team decision open) |
| `defenses_v2` | `islands` on, migration applied first (the culverin rows and the wave rule) | `supabase/migrations/20261114140000_culverin.sql` | replaces two check rules, nothing else: `islet_buildings_plot_fits_building` also allows `(cannon_1..cannon_7, culverin)` and `wave_rules_known_names` also allows `defenses_v2`; the catalogue gains the culverin (section 11) | applied; flag **on** (about 21:53 UTC) |

**Applied live (verified by the coordinator on 14 Nov 2026, about 21:55 UTC; not checkable from the repository).** The five migrations `20261114100000`, `20261114110000`, `20261114120000`, `20261114130500` and `20261114140000` are applied to the live Supabase project and registered in `schema_migrations`. The repository text that used to say "written, not applied" (D039, D041, D042, `supabase/README.md`, INTERFACES and the specs) was updated in the final docs pass to say "applied live 14 Nov 2026". Still, **do not trust the repo for "is it applied"; check the database** (the list of applied migrations in Supabase, or ask Nils). An applied migration plus a flag that is still off is the safe, intended state: nothing changes for players until the flag step is announced.

**How to check what is on.**

1. Open `https://the-great-plot-twist.vercel.app/api/config` in a browser and read `flags`. `true` means on.
2. Locally: `cd backend && uv run --env-file ../.env uvicorn main:app --reload --port 8000`, then `http://127.0.0.1:8000/api/config` ([ENGINEERING.md, section 3](ENGINEERING.md#3-commands)). With an empty `FEATURE_FLAGS` every flag is `false`.
3. To try a feature locally, put the name in your own `.env` (`FEATURE_FLAGS=islands,wall_recovery`); never write real keys in the repository.

The state of each flag **on Vercel** is not recorded in the repository (the code default for all of them is off). The coordinator verified the live `FEATURE_FLAGS` on 14 Nov 2026 (about 22:01 UTC): on are `live_presence`, `market`, `arena`, `sign_in`, `demo`, `sports`, `islands`, `placement` (about 19:45), `wall_recovery` (about 20:28), `arsenal` (about 20:48), `rescue` (about 21:05), `defenses_v2` (about 21:53), `tower_health` (about 21:53) and `pathing` (about 22:00, after Nils accepted the closed-ring gap). A flag is switched on only after its release check (`npm run test:placement`, `test:walls`, `test:arsenal`, `test:rescue`, `test:culverin`, `test:rules` and `balance-rules.mjs`, sections 12 and 15) and a player with an old tab should reload afterwards (since #63 a running wave keeps its rules either way). Re-check `GET /api/config` yourself.

**Practice questions.**

1. *Explain.* What happens if someone writes `FEATURE_FLAGS=wall_recover` on Vercel?
   *Model answer:* `parse_flags` finds a name that is not in `FLAG_NAMES` and raises `UnknownFlagError` with the list of valid names, so the server refuses to start; a typo cannot silently leave the feature off.
2. *What if.* The migration is applied but the flag is off.
   *Model answer:* nothing changes for players. Old rows have `wall_health` 100 by default, the new routes answer `404 feature_off`, and the columns are never read. Switching the flag on is the second, announced step.
3. *Defend.* Why does the browser read `/api/config` instead of having its own list of flags?
   *Model answer:* a browser-side list could drift from the server, and a hidden feature must also be refused by the server. One source (the server's settings) shows or hides the feature and protects its routes; the answer is public and carries no secrets.

---

## 14. Suggested split for the four teammates

The README members table is complete (Nils Christoph Lenke, Ianno Miranda Hollensteiner, Johannes Franz Lang, Nicolas Radomski). The split below still says **Teammate A to D**; the team puts its names on the four roles. Nils's agents wrote this code under D047, so Nils should **explain** rather than be the independent reviewer, and each reviewer should be someone who did not write that section. Each section takes roughly 45 to 60 minutes (read, run tests, do the questions); sections 9 and 10 take longer. Each teammate gets at least one backend-heavy and one lighter section.

| Reviewer | Primary sections | Why this mix | Second reader (swap for the drill on Thu 19 / Sat 21) |
|---|---|---|---|
| Teammate A | 1 Wall recovery, 8 Leaderboard and statue, 12 Check repairs | Money, SQL and a lock; a read-only ranking; and the check runners that back every flag switch | Teammate C |
| Teammate B | 4 Flexible placement, 2 Tower art, 9 Arsenal | Grid rules, the one visual section, and the largest database lane (capacity trigger, swap, retries) | Teammate D |
| Teammate C | 3 Targeting and pathing, 7 Harbor weather, 10 Integration, 15 Balance and wave rules | The pure algorithms and then their wiring into `sim.js`, wave rules and the wall guard, plus the shortest section | Teammate A |
| Teammate D | 5 Co-op permissions, 6 Rescue and difficulty, 11 Culverin | A small readable Python module, server settlement and curves, and the data-only lane | Teammate B |
| Everyone | 0 and 13 (the table and the flags) | Every explain-back about a feature starts with "which flag, and is it on?" | n/a |

Sections 9 and 10 are the longest; give them extra time. The pairs are roughly equal otherwise.

**What to hand back.** For each section: the commands you ran with the real result lines (or "skipped: reason"), anything you could not explain, and any disagreement with a proposed decision (D039–D049 are open to comments in the issue or chat; D047 lets the team overturn the fast-track). Follow the report format of [CONTRIBUTING.md](../CONTRIBUTING.md): changed, verified, not verified, remaining.

## 15. Balance harness, pathing retune and wave rules kept once (#59, #62, #63)

These three PRs came after the section 10 walk-through. #59 asks "is the game still fair with the new rules on?", #62 checks the culverin with two captains, and #63 fixes the one bug the release checks found in how a wave's rules are fixed.

**For the player.** Nothing new to click. `tower_health` is on in production but plays like no rules, because boarders rarely reach a tower. `pathing` is on since about 22:00 UTC (Nils accepted the closed-ring gap). The only visible difference is that a wave no longer changes its rules under you when Nils switches a flag.

**Flags and state (about 21:55 UTC, 14 Nov).** `tower_health` and `defenses_v2` on since about 21:53 UTC, `rescue` on since about 21:05, `pathing` **on** since about 22:00 (after Nils accepted the closed-ring gap). The migrations `20261114130500_wave_rules.sql` and `20261114140000_culverin.sql` are applied. Specs: [specs/T33-T35-balance.md](../specs/T33-T35-balance.md), [specs/T43-new-defenses.md](../specs/T43-new-defenses.md). Decisions: D040, D049 and D048, all proposed.

**Files, in order.**

1. `specs/T33-T35-balance.md` (the acceptance rules and the before/after table).
2. `frontend/scripts/balance-rules.mjs` (the headless playtest).
3. `frontend/src/pirates/boarder-paths.js` (`WALL_ENGAGE`, `WALL_LANE`) and `frontend/src/pirates/targeting.js` (`towerReach`).
4. `frontend/scripts/check-rules-mp.js` (`npm run test:rules`, two tabs on the fake server), then `frontend/scripts/check-culverin-mp.js` (`npm run test:culverin`).
5. `backend/server/island/wave_rules.py`, `backend/server/tests/test_wave_rules.py`, and the header of `supabase/migrations/20261114130500_wave_rules.sql`.

**Walk-through A: the balance harness (#59).** `balance-rules.mjs` imports the real `createWave` from `sim.js` and plays whole waves without a browser: waves 1 to 60, N seeds, four rule sets (none, tower_health, pathing, both), on two layouts (the fixed spots, and a closed square ring of 12 walls round the heart from wave 15). A scripted crew stands near the heart, strikes and shoots, and one captain walks to the most hurt wall or tower and presses E. A rule set passes when its win rate stays within 10 points of `none`, no wave becomes unwinnable or trivial, and boarders still hack walls (at least a third as many hacks as `none`). The script exits 1 when something fails. Run it yourself (commands in the appendix):

```
cd frontend && node scripts/balance-rules.mjs --seeds 20 --waves 60 --layouts ring
```

Result on 14 Nov: before the retune 13 failures; after it, every fixed-spot wave and every ring wave but one matches `none`. The one left is the closed ring at wave 60: with 80 seeds `none` wins 63 %, `tower_health` 63 %, `pathing` 51 % and both 45 %. That is why `pathing` stays off (the spec lists the two ways out: accept it, or make the breach costlier in `sim.js` or the wall rules).

**Walk-through B: the retune (#59).** Two constants, no change in `sim.js`:

```js
export const WALL_ENGAGE = 3;
export const WALL_LANE = .25;
```

A boarder within `WALL_ENGAGE` of a standing wall that lies across its straight way to the heart (the line passes within `WALL_LANE` of the footprint) hacks it instead of walking round. Before, lone walls were walked round, so pathing made walls useless (0 wall hacks at wave 10). In `targeting.js` the boarder's `towerReach` went from 2.5 to 1.5, so boarders walking the grid past a tower no longer peel off to hack it and leave the killing ground. The rule is deterministic (walls by id, plain sums), so every browser picks the same wall.

**Walk-through C: wave rules kept once, also when empty (#63).** The bug: `rules_for_wave` returned early while every rule flag was off, so a wave that started with no rules kept nothing; if a flag was switched on during that wave, the next join or current answer kept the new set, and a late joiner played tower health while the bell-ringer did not. That is exactly the moment of a release. The fix is to drop the early return:

```py
    arguments = {"p_wave_id": str(wave.wave_id), "p_rules": wanted_rules(settings)}
    try:
        kept = read_model(KeptRules, await admin.call_function("wave_rules_keep", arguments))
```

Now every start, join and current answer calls `wave_rules_keep`. The first call stores whatever the flags say, including the empty list; later calls read that row (`on conflict (wave_id) do nothing`, then `select`). An empty set still leaves the `rules` key out of the answer, so clients behave as before. The price is one small database call per answer. A wave that has no row yet (started before the table was deployed) keeps the flags of its next answer. If the call fails the answer has no rules and a warning is logged, never a 5xx.

The header comment of the SQL file still says the function is used "only while at least one of those flags is on". That sentence is **superseded by #63**; a comment-only note in the file and in `supabase/README.md` says so, and the applied statements are unchanged.

**Walk-through D: the two-captain culverin check (#62).** `npm run test:culverin` runs six scenarios with two tabs on the fake server (card and unlock, build paid once, upgrade, a wave 20 where both sims agree tick for tick on every `culverin_fired` and `ship_hit`, levels after waves, tear down), a headless harness over waves 16, 20 and 30, a `tower_health` run and a flag-off run. It found one real bug that #62 fixed in `td-rules.js`: a visitor's card read a friend's island by its best won wave through the campaign table, which does not hold the culverin, so a member always saw it locked while the server allowed it.

**Tests that prove it.** `node scripts/balance-rules.mjs` (the acceptance), `npm run test:rules` (scenario 4 is the late joiner after a flag flip; scenario K is the mid-wave switch-on: its title still says "known server limit", but it now asserts the fixed behaviour, that the late joiner gets no rules), `npm run test:culverin`, `backend/server/tests/test_wave_rules.py` (`test_with_every_rule_flag_off_the_wave_answers_have_no_rules_but_keep_the_empty_set`, `test_a_rule_flag_switched_on_mid_wave_gives_later_joiners_no_rules`, `test_a_joiner_after_a_flag_flip_gets_the_rules_the_wave_started_with`), `frontend/tests/pirates/pathing-wiring.test.js` (a lone wall across the way is hacked, one beside it is not; a closed ring still breaches exactly one wall) and `frontend/tests/pirates/defenses-v2.test.js` (the visitor card at waves 14 and 15).

**Limits.** The playtest is a scripted crew in a headless sim, not human play: wave 60 on the ring ends with the heart near 5 hp, so 20 seeds are noisy (hence 80). Waves 8, 15 and 30 land almost no boarders on the test islands, so the rules cannot change them. Whether human players find `tower_health` any different is not measured. The culverin check uses the fake server, not Postgres.

**Practice questions.**

1. *Trace.* Wave 20 starts with every rule flag off. Halfway through, Nils switches `tower_health` on. A friend joins. Which rules does the friend play, and what did it do before #63?
   *Model answer:* none. The first answer kept the empty set in `wave_rules`, and the join serves the kept set, so both play without tower health and the next wave picks up the flag. Before #63 nothing was kept while all flags were off, so the friend's join kept `["tower_health"]` and their sim drifted from the bell-ringer's.
2. *Defend.* The retune changes `WALL_ENGAGE` and `towerReach` instead of `sim.js`, and `pathing` still stays off. Defend both choices.
   *Model answer:* the constants live in the new modules, so the fixed-seed determinism tests of `sim.js` stay untouched and the change is easy to review and undo. `pathing` stays off because the same playtest still shows the closed ring 12 to 18 points harder at wave 60, which fails the acceptance of 10 points; a flag that is off costs nothing, and the fix needs a `sim.js` or wall-rule decision that belongs to the team (D040 is only proposed).
3. *Test.* How would you show that the playtest's verdict does not depend on one lucky seed?
   *Model answer:* run it with more seeds and compare. The ring at wave 60 is the example: 20 seeds gave none 60 %, pathing 50 % and both 45 %; 80 seeds gave 63 %, 51 % and 45 %, because the heart ends near 5 hp and a few seeds swing the result. The seeds are fixed (seed times 7919), so the same command gives the same numbers on any machine; a different `--seeds` value is the independent check.

---

## Appendix: the commands

From [ENGINEERING.md, section 3](ENGINEERING.md#3-commands) (repository root first):

| Check | Command |
|---|---|
| Server tests | `cd backend && uv run pytest` |
| Server style | `cd backend && uv run ruff check .` |
| Client tests | `cd frontend && npm test` |
| Client build | `cd frontend && npm run build` |
| Multiplayer browser check | `cd frontend && npm run test:mp` |
| GitHub sign-in checks | `cd frontend && npm run test:signin` |
| Wall recovery, two captains | `cd frontend && npm run test:walls` |
| Placement, two captains | `cd frontend && npm run test:placement` |
| Arsenal, two captains | `cd frontend && npm run test:arsenal` |
| Rescue, two captains | `cd frontend && npm run test:rescue` |
| Culverin, two captains | `cd frontend && npm run test:culverin` |
| Wave rules, two tabs | `cd frontend && npm run test:rules` |
| Balance playtest (headless sim) | `cd frontend && node scripts/balance-rules.mjs --seeds 20` |

One test file only (examples): `cd backend && uv run pytest server/tests/test_wall_recovery.py` and `cd frontend && npx vitest run tests/pirates/targeting.test.js` (`npm test` runs `vitest run`).
