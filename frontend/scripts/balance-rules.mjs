// Balance playtest of the wave rules tower_health (T33, D049) and pathing (T34/T35, D040): the real sim
// headless, a scripted crew of captains and the balance islands of tests/pirates/balance-fixture.js, for
// waves 1 to 60 and several seeds, with each rule set (none, tower_health, pathing, both). Prints one table
// per layout and checks the acceptance of specs/T33-T35-balance.md.
//
//   node scripts/balance-rules.mjs [--seeds 10] [--waves 1,3,5] [--json out.json] [--guards 3] [--captains 2]
//
// --guards N hires N guards (D052) on every island; --captains N plays with N captains instead of the band's crew
// (a small class). --trees grows the typical upgrade trees of D055 on the level-5 towers (treesAt below), --swivels N
// puts N swivel-gun nests (D055) in place of the last N cannons. All are off by default, so the default tables stay
// what they were.
//
// The crew: N captains (more and stronger as the campaign goes on) stand near the heart, strike a boarder
// next to them, else shoot the nearest ship or boarder in range. One of them is the carpenter: they walk
// (5 units a second) to the most hurt wall or tower near the heart and press E there (repair while damaged,
// rebuild once broken), then walk back. Exit code 1 when a configuration fails the acceptance.
import { registerHooks } from 'node:module';

// sim.js imports wave-events.json the Vite way (no import attribute); plain Node needs { type: 'json' }.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) return nextLoad(url, { ...context, importAttributes: { type: 'json' } });
    return nextLoad(url, context);
  },
});
const { createWave } = await import('../src/pirates/sim.js');
const { captainStats } = await import('../src/pirates/captain-stats.js');
const { ALL_SKILLS, ISLANDS, islandAt, researched, tiered } = await import('../tests/pirates/balance-fixture.js');

const args = process.argv.slice(2);
const arg = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const SEEDS = Number(arg('seeds', 10));
const WAVES = arg('waves', '1,3,5,8,10,15,20,30,45,60').split(',').map(Number);
const JSON_OUT = arg('json', null);
const LAYOUTS = arg('layouts', 'spots,ring').split(',');
const ONLY = arg('rules', null)?.split(',');
const GUARDS = Number(arg('guards', 0)), CAPTAINS = Number(arg('captains', 0));
const TREES = args.includes('--trees'), SWIVELS = Number(arg('swivels', 0));

export const RULE_SETS = {
  none: {},
  tower_health: { towerHealth: true },
  pathing: { pathing: true },
  both: { towerHealth: true, pathing: true },
};

// The island and the crew a class has at each point of the campaign.
const SKILLS_MID = ['steady_aim', 'long_barrel', 'quick_fix'];
export function progressAt(wave) {
  if (wave <= 1) return { band: 'early', island: ISLANDS.first, captains: 1, level: 1, skills: [] };
  if (wave <= 3) return { band: 'early', island: ISLANDS.small, captains: 2, level: 1, skills: [] };
  if (wave <= 5) return { band: 'early', island: ISLANDS.boss5, captains: 2, level: 2, skills: [] };
  if (wave <= 10) return { band: 'mid', island: ISLANDS.mid, captains: 3, level: 2, skills: SKILLS_MID };
  if (wave <= 20) return { band: 'mid', island: ISLANDS.full, captains: 3, level: 3, skills: SKILLS_MID };
  if (wave <= 30) return { band: 'late', island: researched(islandAt(4)), captains: 4, level: 4, skills: ALL_SKILLS };
  if (wave <= 45) return { band: 'late', island: researched(islandAt(5)), captains: 5, level: 5, skills: ALL_SKILLS, weapon: true };
  return { band: 'late', island: tiered(islandAt(5)), captains: 6, level: 5, skills: ALL_SKILLS, weapon: true };
}

// D055: the trees a class typically has grown by a wave (the tiers open after waves 20, 35 and 45; a level-5 tower
// only): cannons go for speed (path a), mortars for bigger shells (path b), the other path at tier 1 once there is room.
export function treesAt(wave) {
  if (wave < 20) return {};
  if (wave < 35) return { cannon: { a: 1, b: 0 }, mortar: { a: 0, b: 1 }, swivel: { a: 0, b: 1 } };
  if (wave < 45) return { cannon: { a: 2, b: 1 }, mortar: { a: 1, b: 2 }, swivel: { a: 1, b: 2 } };
  return { cannon: { a: 3, b: 1 }, mortar: { a: 1, b: 3 }, swivel: { a: 1, b: 3 } };
}
export function withTrees(island, wave) {
  const trees = treesAt(wave);
  return { ...island, defenses: island.defenses.map(item => (item.level === 5 && trees[item.kind] ? { ...item, tree: trees[item.kind] } : item)) };
}
// D055: n swivel-gun nests in place of the last n cannons (same spot, same level).
export function withSwivels(island, n) {
  const cannons = island.defenses.filter(item => item.kind === 'cannon').slice(-n).map(item => item.id);
  return { ...island, defenses: island.defenses.map(item => (cannons.includes(item.id) ? { ...item, kind: 'swivel', spec: undefined } : item)) };
}

// "ring": the island's walls moved edge to edge (T36 placement, 2 x 2 footprints) into a closed square ring
// around the heart (0, 2): 12 walls, 4 a side; with fewer walls the ring keeps gaps on its north side.
const RING_SPOTS = [[-3, 5], [-1, 5], [1, 5], [3, 5], [3, 3], [3, 1], [3, -1], [1, -1], [-1, -1], [-3, -1], [-3, 1], [-3, 3]];
export function asRing(island) {
  let i = 0;
  return { ...island, defenses: island.defenses.map(item => {
    if (item.kind !== 'wall') return item;
    const spot = RING_SPOTS[i++];
    return spot ? { ...item, x: spot[0], z: spot[1] } : item;
  }) };
}

const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
const HEART = { x: 0, z: 2 };
const WALK = 5 * .25;   // a captain walks 5 units a second; the crew acts every quarter second
const E_REACH = 2;      // a captain presses E this close to a wall or tower
const DUTY = Number(process.env.DUTY ?? 14);        // the carpenter looks after walls and towers this close to the heart

/** One wave with the scripted crew. Returns the result and what happened. */
export function playWave({ wave, seed, rules, layout = 'spots', guards = GUARDS, captains = CAPTAINS, trees = TREES, swivels = SWIVELS }) {
  const band = progressAt(wave), p = captains > 0 ? { ...band, captains } : band;
  const built = trees ? withTrees(swivels ? withSwivels(p.island, swivels) : p.island, wave) : swivels ? withSwivels(p.island, swivels) : p.island;
  const laid = layout === 'ring' ? asRing(built) : built;
  const island = guards > 0 ? { ...laid, crew: { ...laid.crew, guard: guards } } : laid;
  const sim = createWave({ seed, wave, ...island, ...rules });
  const posts = Array.from({ length: p.captains }, (_, i) => {
    const a = (i / p.captains) * Math.PI * 2 + .4, r = layout === 'ring' ? .9 : 2.5;
    return { x: HEART.x + Math.cos(a) * r, z: HEART.z + Math.sin(a) * r };
  });
  const weapon = i => (p.weapon ? (i % 2 ? 'fire_bombs' : 'long_rifle') : undefined);
  const crew = posts.map((post, i) => ({ by: `c${i}`, x: post.x, z: post.z, post, stats: captainStats(p.level, p.skills, weapon(i)) }));
  const stats = { towersBroken: 0, towerRebuilds: 0, towerRepairs: 0, wallsBroken: 0, wallHacks: 0, towerHacks: 0, heartHits: 0, landed: 0, errors: 0 };
  let reason = null;
  while (!sim.done) {
    const state = sim.state(), inputs = [];
    crew.forEach((c, i) => {
      const me = state.party?.find(hero => hero.id === c.by);
      if (me?.down) { inputs.push({ type: 'captain_move', by: c.by, x: c.x, z: c.z }); return; }
      // The carpenter (captain 0): the most hurt wall or tower near the heart, broken ones first.
      let job = null;
      if (i === 0) {
        const items = [...state.walls.map(w => ({ ...w, ...wallPos(island, w.id) })), ...state.towers.filter(t => t.maxHp > 0)];
        for (const item of items) {
          if (dist(item, HEART) > DUTY) continue;
          const want = item.hp <= 0 ? (item.rebuildReady ? 2 : 0) : item.hp < item.maxHp * .6 && !item.repairing ? 1 - item.hp / item.maxHp : 0;
          if (want > 0 && (!job || want > job.want || (want === job.want && dist(item, c) < dist(job.item, c)))) job = { item, want };
        }
      }
      const goal = job ? job.item : c.post;
      const d = dist(c, goal);
      if (d > (job ? E_REACH : .1)) { const s = Math.min(WALK, d - (job ? E_REACH * .8 : 0)); c.x += (goal.x - c.x) / d * s; c.z += (goal.z - c.z) / d * s; }
      inputs.push({ type: 'captain_move', by: c.by, x: c.x, z: c.z });
      if (job && dist(c, job.item) <= E_REACH + 1e-6) {
        inputs.push({ type: job.item.hp <= 0 ? 'rebuild' : 'repair', wallId: job.item.id, by: c.by, skills: p.skills, x: c.x, z: c.z });
      }
      const close = state.boarders.find(b => dist(b, c) < 2.6);
      if (close) { inputs.push({ type: 'captain_strike', by: c.by, targetId: close.id, level: p.level, skills: p.skills, x: c.x, z: c.z }); return; }
      let best = null, reach = c.stats.range;
      for (const target of [...state.boarders, ...state.ships]) { const dd = dist(target, c); if (dd < reach) { best = target; reach = dd; } }
      if (best) inputs.push({ type: 'captain_shot', by: c.by, targetId: best.id, level: p.level, skills: p.skills, weapon: weapon(i), x: c.x, z: c.z, ax: best.x, az: best.z });
    });
    for (const e of sim.step(.25, inputs)) {
      if (e.type === 'wave_ended') reason = e.reason;
      else if (e.type === 'tower_broken') stats.towersBroken++;
      else if (e.type === 'tower_rebuilt') stats.towerRebuilds++;
      else if (e.type === 'tower_repaired') stats.towerRepairs++;
      else if (e.type === 'tower_damaged') stats.towerHacks++;
      else if (e.type === 'wall_damaged') { if (e.boarderId) stats.wallHacks++; if (e.broken) stats.wallsBroken++; }
      else if (e.type === 'island_damaged' && e.boarderId) stats.heartHits++;
      else if (e.type === 'boarder_landed') stats.landed++;
    }
  }
  return { ...sim.result(), reason, ...stats };
}
const wallPosCache = new WeakMap();
function wallPos(island, id) {
  let map = wallPosCache.get(island);
  if (!map) { map = new Map(island.defenses.filter(d => d.kind === 'wall').map(d => [d.id, { x: d.x, z: d.z }])); wallPosCache.set(island, map); }
  return map.get(id) ?? { x: 99, z: 99 };
}

export function measureConfig({ wave, rules, layout, seeds = SEEDS, guards = GUARDS, captains = CAPTAINS, trees = TREES, swivels = SWIVELS }) {
  const sum = { won: 0, hp: 0, time: 0, towersBroken: 0, wallsBroken: 0, wallHacks: 0, towerHacks: 0, towerRebuilds: 0, heartHits: 0, landed: 0 };
  for (let s = 1; s <= seeds; s++) {
    const r = playWave({ wave, seed: s * 7919, rules, layout, guards, captains, trees, swivels });
    if (r.survived) sum.won++;
    sum.hp += r.islandHp; sum.time += r.time;
    for (const key of ['towersBroken', 'wallsBroken', 'wallHacks', 'towerHacks', 'towerRebuilds', 'heartHits', 'landed']) sum[key] += r[key];
  }
  const mean = key => Math.round(sum[key] / seeds * 10) / 10;
  return { win: Math.round(sum.won / seeds * 100), hp: Math.round(sum.hp / seeds), time: Math.round(sum.time / seeds),
    towersBroken: mean('towersBroken'), wallsBroken: mean('wallsBroken'), wallHacks: mean('wallHacks'),
    towerRebuilds: mean('towerRebuilds'), heartHits: mean('heartHits'), landed: mean('landed') };
}

// Acceptance (specs/T33-T35-balance.md): per wave, a rule's win rate stays within 10 points of none's; no wave
// that none wins sometimes becomes unwinnable (0 %) or one none loses sometimes becomes trivial (100 %, heart
// above 90 % when none's is below 60 %); and with pathing, boarders still hack walls (at least a third of
// none's wall hacks) wherever none's boarders hack walls at all.
export function check(table) {
  const fails = [];
  for (const [key, rows] of Object.entries(table)) {
    const [layout, wave] = key.split('/'), base = rows.none;
    for (const [name, row] of Object.entries(rows)) {
      if (name === 'none') continue;
      const tag = `${layout} w${wave} ${name}`;
      if (Math.abs(row.win - base.win) > 10) fails.push(`${tag}: win ${row.win}% vs none ${base.win}%`);
      if (base.win > 0 && row.win === 0) fails.push(`${tag}: unwinnable (none ${base.win}%)`);
      if (base.win < 100 && row.win === 100 && row.hp > 90 && base.hp < 60) fails.push(`${tag}: trivial (hp ${row.hp} vs ${base.hp})`);
      if (name !== 'tower_health' && base.wallHacks >= 5 && row.wallHacks < base.wallHacks / 3) fails.push(`${tag}: walls ignored (hacks ${row.wallHacks} vs ${base.wallHacks})`);
    }
  }
  return fails;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const table = {}, started = Date.now();
  for (const layout of LAYOUTS) {
    console.log(`\n## layout ${layout} (${SEEDS} seeds${GUARDS ? `, ${GUARDS} guards` : ''}${CAPTAINS ? `, ${CAPTAINS} captains` : ''}${TREES ? ', trees' : ''}${SWIVELS ? `, ${SWIVELS} swivels` : ''})\n`);
    console.log('| wave | band | rules | win % | heart hp | time s | towers broken | tower rebuilds | walls breached | wall hacks | boarders landed |');
    console.log('|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const wave of WAVES) {
      if (layout === 'ring' && wave < 15) continue; // a closed ring needs the twelve walls of the full island
      const rows = {};
      for (const [name, rules] of Object.entries(RULE_SETS)) {
        if (ONLY && name !== 'none' && !ONLY.includes(name)) continue;
        const r = rows[name] = measureConfig({ wave, rules, layout });
        console.log(`| ${wave} | ${progressAt(wave).band} | ${name} | ${r.win} | ${r.hp} | ${r.time} | ${r.towersBroken} | ${r.towerRebuilds} | ${r.wallsBroken} | ${r.wallHacks} | ${r.landed} |`);
      }
      table[`${layout}/${wave}`] = rows;
    }
  }
  const fails = check(table);
  console.log(`\n${fails.length ? 'FAIL' : 'PASS'}: ${fails.length} problem(s) in ${Math.round((Date.now() - started) / 1000)} s`);
  for (const line of fails) console.log(`- ${line}`);
  if (JSON_OUT) { const { writeFileSync } = await import('node:fs'); writeFileSync(JSON_OUT, JSON.stringify({ seeds: SEEDS, table, fails }, null, 2)); }
  process.exitCode = fails.length ? 1 : 0;
}
