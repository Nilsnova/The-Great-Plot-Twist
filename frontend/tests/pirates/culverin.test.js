// The culverin in the battle (T43, decision D048 proposed; specs/T43-new-defenses.md "Sim wiring note"): a long gun on
// a tower spot that fights only in a wave whose rules say "defenses_v2" (createWave({defensesV2: true})). It shoots
// ships only (gunboats and siege barges first, then the most hp left), never closer than its minimum range, always
// hits and never rolls a die, so every client of a wave agrees.
//
// The first block is the safety net of the wiring: a wave WITHOUT a culverin must play bit for bit as it did before
// the culverin existed. FINGERPRINTS are the sha-256 of each scenario's whole event stream and states, made with
// sim.js of origin/main at 35145fd (before this change). If one changes, the sim's behaviour for islands without a
// culverin changed: find out why before you update the number.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { DEFENSES_V2 } from '../../src/pirates/defenses-v2.js';
import { towerMaxHp } from '../../src/pirates/tower-health.js';
import { eventFor } from '../../src/pirates/wave-events.js';
import { ISLANDS, islandAt, researched, spot, tiered } from './balance-fixture.js';

const C = DEFENSES_V2.culverin;
const of = (events, type) => events.filter(event => event.type === type);

/** Plays a wave to its end with one captain who walks in and shoots the first ship now and then; every step's
 *  events, every third state and the result, as text lines. */
function play(options) {
  const sim = createWave(options), lines = [];
  for (let i = 0; !sim.done && i < 20000; i++) {
    const state = sim.state(), ship = state.ships[0], inputs = i % 7 === 0 ? [{ type: 'captain_move', by: 'c1', x: 3, z: 2 }] : [];
    if (i % 5 === 0 && ship) inputs.push({ type: 'captain_shot', by: 'c1', targetId: ship.id, level: 5, skills: [], weapon: 'long_rifle', x: 3, z: 2, ax: ship.x, az: ship.z });
    lines.push(JSON.stringify(sim.step(.25, inputs)));
    if (i % 3 === 0) lines.push(JSON.stringify(state));
  }
  lines.push(JSON.stringify(sim.result()));
  return lines;
}
const fingerprint = lines => createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 16);
const RULES = { towerHealth: true, pathing: true, rescue: true };
const SCENARIOS = {
  'first island, wave 1': [ISLANDS.first, 1, 7919],
  'boss-5 island, wave 5': [ISLANDS.boss5, 5, 7919],
  'small island, wave 12': [ISLANDS.small, 12, 4242],
  'mid island, wave 16 (gunboats)': [ISLANDS.mid, 16, 7919],
  'full island, wave 20, every rule': [ISLANDS.full, 20, 7919, RULES],
  'full island, wave 30': [ISLANDS.full, 30, 4242],
  'level-5 researched, wave 50': [researched(islandAt(5)), 50, 7919],
  'level-5 tiered, wave 100, every rule': [tiered(islandAt(5)), 100, 7919, RULES],
};
const optionsOf = ([island, wave, seed, rules = {}]) => ({ seed, wave, countdown: 0, finishers: true, event: eventFor(wave, seed), ...island, ...rules });
// sha-256 (first 16 hex digits) of play(), made with origin/main's sim.js (35145fd), before the culverin was wired in.
const FINGERPRINTS = {
  'first island, wave 1': '8dbd8ef2246e8949',
  'boss-5 island, wave 5': 'a2619573891d376b',
  'small island, wave 12': '3c3f7ac289d5c4b0',
  'mid island, wave 16 (gunboats)': 'f9b9d121819486ee',
  'full island, wave 20, every rule': '369ba1aebc13198b',
  'full island, wave 30': 'd96b3242025cb4ae',
  'level-5 researched, wave 50': '296f42fcc60b2744',
  // Re-made after the T33-T35 balance retune (boarder-paths.js WALL_ENGAGE, targeting.js towerReach 1.5) with the
  // pre-culverin sim.js (4010f7f) plus the retuned modules: the culverin still changes nothing here.
  'level-5 tiered, wave 100, every rule': '2c9a1694538f3b45',
};

describe('a wave without a culverin plays exactly as before', () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    it(`${name}: the same events and states as the sim before the culverin`, () => {
      expect(fingerprint(play(optionsOf(scenario)))).toBe(FINGERPRINTS[name]);
    }, 60000);
  }
  it('ignores a culverin in the defenses unless the wave has the rule defenses_v2', () => {
    for (const name of ['small island, wave 12', 'mid island, wave 16 (gunboats)']) {
      const options = optionsOf(SCENARIOS[name]);
      const extra = { ...options, defenses: [...options.defenses, { id: 'zz_culverin', kind: 'culverin', level: 3, x: 0, z: -12 }] };
      expect(fingerprint(play(extra)), name).toBe(FINGERPRINTS[name]);
      expect(createWave(extra).state().towers.map(tower => tower.kind)).not.toContain('culverin');
    }
  }, 60000);
});

// A culverin on the north-east corner (where the fixture's first tower stands), so it sees the east lane.
const culverinAt = (level = 1, id = 'tower_c1', bearing = 45) => ({ ...spot(id, 'culverin', bearing, .75, level) });
const withCulverin = (island, n = 1, level) => {
  let k = 0;
  return { ...island, defenses: island.defenses.map(item => (item.kind === 'cannon' && k++ < n ? { ...item, kind: 'culverin', ...(level ? { level } : {}) } : item)) };
};

describe('the culverin in the battle', () => {
  it('reads its stats from the one table the cards use', () => {
    expect(CONFIG.levels.culverin).toEqual(C.levels.map(({ damage, range, reload }) => ({ damage, range, reload })));
    expect(CONFIG.culverin).toEqual({ minRange: C.minRange, shotSpeed: C.shotSpeed, firstReload: C.firstReload });
  });
  it('stands as a tower with its own reach: a watchtower\'s range bonus does not reach it, and no gunner mans it', () => {
    const watch = { id: 'tower_1', kind: 'watchtower', level: 5, x: 0, z: -14 };
    const sim = createWave({ seed: 1, wave: 16, defensesV2: true, defenses: [culverinAt(5), { ...culverinAt(1, 'tower_c2', 135) }, watch] });
    const [five, one] = sim.state().towers;
    expect(five).toMatchObject({ kind: 'culverin', level: 5, range: C.levels[4].range, manned: false });
    expect(one).toMatchObject({ kind: 'culverin', level: 1, range: C.levels[0].range });
    // Gunners stay on cannons and mortars: with two gunners and only culverins, nobody is manned.
    const crewed = createWave({ seed: 1, wave: 16, defensesV2: true, crew: { gunner: 2 }, defenses: [culverinAt(3)] });
    expect(crewed.state().towers[0].manned).toBe(false);
  });
  it('shoots ships only, never closer than its minimum range, and always hits', () => {
    const { events } = (() => {
      const sim = createWave({ seed: 7919, wave: 16, countdown: 0, defensesV2: true, ...withCulverin(ISLANDS.small) }), events = [];
      while (!sim.done) events.push(...sim.step(.25));
      return { sim, events };
    })();
    const shots = of(events, 'culverin_fired');
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      expect(shot.targetId).toMatch(/^ship_/);
      expect(Math.hypot(shot.toX - shot.x, shot.toZ - shot.z)).toBeGreaterThan(C.minRange - 4); // aimed ahead of a ship out there
    }
    const hits = of(events, 'ship_hit').filter(event => event.culverin);
    expect(hits.length).toBeGreaterThan(0);
    expect(of(events, 'boarder_hit').some(event => event.by === 'tower_s1')).toBe(false);
  });
  it('goes for the gunboat first, then the ship with the most hp left', () => {
    const sim = createWave({ seed: 7919, wave: 16, countdown: 0, defensesV2: true, ...withCulverin(ISLANDS.small) });
    let checked = 0;
    while (!sim.done && checked < 40) {
      const before = sim.state(), tower = before.towers.find(item => item.kind === 'culverin');
      for (const shot of of(sim.step(.05), 'culverin_fired')) {
        const target = before.ships.find(ship => ship.id === shot.targetId);
        const reachable = before.ships.filter(ship => Math.hypot(ship.x - tower.x, ship.z - tower.z) <= tower.range && Math.hypot(ship.x - tower.x, ship.z - tower.z) >= C.minRange);
        if (!target || !reachable.length) continue;
        const boats = reachable.filter(ship => C.priority.includes(ship.kind));
        if (boats.length) expect(C.priority).toContain(target.kind);
        else expect(target.hp).toBe(Math.max(...reachable.map(ship => ship.hp)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });
  it('never rolls a die: fireCulverin and its aim do not call random()', () => {
    const source = readFileSync(new URL('../../src/pirates/sim.js', import.meta.url), 'utf8');
    const fire = source.slice(source.indexOf('function fireCulverin'), source.indexOf('const pending = target'));
    const aim = source.slice(source.indexOf("if (tower.kind === 'culverin') {"), source.indexOf('// A cannon takes the boarder nearest'));
    expect(fire.length).toBeGreaterThan(100); expect(aim.length).toBeGreaterThan(100);
    expect(fire).not.toMatch(/random\(/); expect(aim).not.toMatch(/random\(/);
  });
  it('is the same on every screen: two runs of one seed with culverins give the same events and states', () => {
    const options = { seed: 4242, wave: 30, countdown: 0, finishers: true, event: eventFor(30, 4242), defensesV2: true, ...withCulverin(ISLANDS.full, 2, 3) };
    const a = play(options), b = play(options);
    expect(a).toEqual(b);
    expect(a.join('\n')).toContain('"type":"culverin_fired"');
    // and it is a different wave from the one without culverins (they took part)
    expect(fingerprint(a)).not.toBe(fingerprint(play({ ...options, defensesV2: false })));
  }, 60000);
  it('has 70% of a same-level cannon\'s hp with tower health, and a broken one stops firing', () => {
    expect([1, 2, 3, 4, 5].map(level => towerMaxHp('culverin', level))).toEqual([1, 2, 3, 4, 5].map(level => Math.round(towerMaxHp('cannon', level) * C.hpShare)));
    const sim = createWave({ seed: 3, wave: 16, countdown: 0, defensesV2: true, towerHealth: true, defenses: [culverinAt(2)] });
    expect(sim.state().towers[0]).toMatchObject({ hp: 91, maxHp: 91, broken: false });
    const off = createWave({ seed: 3, wave: 16, countdown: 0, defensesV2: true, defenses: [culverinAt(2)] });
    expect(off.state().towers[0].hp).toBeUndefined();
  });
});

// Balance (spec "Checks to add then"): the 8 seeds of the balance fixture.
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => n * 7919);
function boats(island, wave) {
  let sent = 0, sunkFirst = 0;
  for (const seed of SEEDS) {
    const sim = createWave({ seed, wave, countdown: 0, defensesV2: true, ...island }), shot = new Set();
    while (!sim.done) for (const event of sim.step(.25)) {
      if (event.type === 'ship_spawned' && event.kind === 'gunboat') sent++;
      if (event.type === 'gunboat_fired') shot.add(event.shipId);
      if (event.type === 'ship_sunk' && event.kind === 'gunboat' && !shot.has(event.shipId)) sunkFirst++;
    }
  }
  return { sent, sunkFirst };
}
const wins = (island, wave) => SEEDS.map(seed => { const sim = createWave({ seed, wave, countdown: 0, defensesV2: true, ...island });
  while (!sim.done) sim.step(.25); return sim.result().survived; });

describe('the culverin and the balance', () => {
  it('sinks the gunboats before their first shot at waves 16, 20 and 30 when it stands in place of one cannon', () => {
    // The small island (three level-1 cannons, two walls) sinks none of them first by itself (GAME-V3 §4.1: 8/8 got a shot off).
    for (const [wave, least] of [[16, 6], [20, 6], [30, 6]]) {
      const without = boats(ISLANDS.small, wave), withIt = boats(withCulverin(ISLANDS.small), wave);
      expect(without.sunkFirst, `wave ${wave} without`).toBe(0);
      expect(withIt.sent, `wave ${wave}`).toBe(without.sent);
      expect(withIt.sunkFirst, `wave ${wave} with a culverin`).toBeGreaterThanOrEqual(least);
    }
  }, 120000);
  it('is not a straight upgrade: two culverins in place of two cannons never win a wave-12 seed the cannons lose', () => {
    for (const name of ['small', 'boss5', 'mid', 'full']) {
      const cannons = wins(ISLANDS[name], 12), culverins = wins(withCulverin(ISLANDS[name], 2), 12);
      culverins.forEach((won, i) => { if (won) expect(cannons[i], `${name}, seed ${SEEDS[i]}`).toBe(true); });
    }
  }, 120000);
});
