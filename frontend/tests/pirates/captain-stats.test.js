// The captain's skills (TOWER-DEFENSE.md §14) and weapons (§15): the numbers of captain-stats.js, how the
// sim resolves each weapon's shot and a skilled repair, the room messages that carry them, and that the
// tree and the shop match the server's islands.json and the migration's check rules.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { BRANCHES, SKILLS, SKILL_IDS, WEAPONS, WEAPON_IDS, captainStats, isSkillList, pointsEarned, pointsSpent, readSkills, skillNeeds } from '../../src/pirates/captain-stats.js';
import { readMessage, toMessage } from '../../src/pirates/sync.js';
import { readWaveMessage } from '../../src/net/live-rules.js';
import { actionAt, REACH } from '../../src/pirates/interact.js';

const island = JSON.parse(readFileSync(new URL('../../../backend/content/islands.json', import.meta.url), 'utf8'));
const migration = readFileSync(new URL('../../../supabase/migrations/20261112030000_captain_skills.sql', import.meta.url), 'utf8');

describe('captainStats', () => {
  it('is the musket level table without skills, and every skill does what its line says', () => {
    for (const [index, level] of CONFIG.captain.levels.entries()) {
      expect(captainStats(index + 1)).toMatchObject({ damage: level.damage, range: level.range, reload: level.reload, weapon: 'musket', mode: 'single' });
    }
    expect(captainStats(1, ['steady_aim']).damage).toBe(7.5);
    expect(captainStats(1, ['long_barrel']).range).toBe(17);
    expect(captainStats(1, ['quick_hands']).reload).toBe(.9);
    const none = captainStats(1), all = captainStats(1, SKILL_IDS);
    expect([none.strikeMultiplier, none.strikeReloadMultiplier, none.sweep, none.repairMultiplier, none.repairReach, none.rebuildShare]).toEqual([1, 1, false, 1, REACH, .4]);
    expect([all.strikeMultiplier, all.strikeReloadMultiplier, all.sweep, all.sweepRadius, all.sweepShare]).toEqual([1.5, .7, true, 2, .5]);
    expect(captainStats(1, ['quick_fix']).repairMultiplier).toBe(1.5);
    expect(captainStats(1, ['quick_fix', 'long_reach']).repairReach).toBe(REACH + 2);
    expect([all.repairMultiplier, all.rebuildShare]).toEqual([2, .6]);
    // Junk falls back: level 1, no skills, the musket.
    expect(captainStats('x', ['nope', 7], 'cannon')).toMatchObject({ level: 1, damage: 6, weapon: 'musket' });
  });
  it('gives each weapon its own way of shooting, with the skills on top and no gun faster than the room', () => {
    const at = weapon => captainStats(1, [], weapon);
    expect(at('pistols')).toMatchObject({ mode: 'single', damage: 3, range: 10, reload: .48 });
    expect(at('blunderbuss')).toMatchObject({ mode: 'cone', targets: 3, cone: 50, range: 9, damage: 4.8 });
    expect(at('long_rifle')).toMatchObject({ mode: 'pierce', range: 22, damage: 10.8, pierceDepth: 8 });
    expect(at('fire_bombs')).toMatchObject({ mode: 'area', radius: 3, range: 14, damage: 9 });
    expect(captainStats(1, ['steady_aim'], 'long_rifle').damage).toBe(13.5);
    for (const weapon of WEAPON_IDS) for (let level = 1; level <= 5; level++) {
      expect(captainStats(level, SKILL_IDS, weapon).reload).toBeGreaterThanOrEqual(.3);
    }
  });
  it('builds the tree: three branches, tiers in order, tier n costs n, one point per two won waves', () => {
    expect(BRANCHES.map(branch => SKILLS.filter(skill => skill.branch === branch.id).map(skill => `${skill.tier}:${skill.cost}`)))
      .toEqual([['1:1', '2:2', '3:3'], ['1:1', '2:2', '3:3'], ['1:1', '2:2', '3:3']]);
    expect(skillNeeds('steady_aim')).toBe(null);
    expect(skillNeeds('master_shipwright')).toBe('long_reach');
    expect([0, 1, 2, 5, 9].map(pointsEarned)).toEqual([0, 0, 1, 2, 4]);
    expect(pointsSpent(['steady_aim', 'long_barrel', 'bogus'])).toBe(3);
    expect(readSkills(['sweep', 'steady_aim', 'sweep', 'x'])).toEqual(['steady_aim', 'sweep']);
    expect([isSkillList(['sweep']), isSkillList(['sweep', 'sweep']), isSkillList(['nope']), isSkillList('sweep')]).toEqual([true, false, false, false]);
  });
  it('matches the server: islands.json and the check rules of the migration list the same skills and weapons', () => {
    expect(island.captainSkills.wavesPerPoint).toBe(2);
    expect(island.captainSkills.tree.map(item => [item.skill, item.branch, item.tier, item.cost, item.needs ?? null]))
      .toEqual(SKILLS.map(skill => [skill.id, skill.branch, skill.tier, skill.cost, skillNeeds(skill.id)]));
    expect(island.weapons.map(item => [item.weapon, item.name, item.coins, item.unlockWave]))
      .toEqual(WEAPONS.map(weapon => [weapon.id, weapon.name, weapon.price, weapon.unlockWave]));
    for (const id of [...SKILL_IDS, ...WEAPON_IDS]) expect(migration).toContain(`'${id}'`);
  });
});

// A wave with ships at anchor, and the first one of them.
function anchored(seed = 6, wave = 6) {
  const sim = createWave({ seed, wave, island: { hp: 5000 } });
  for (let i = 0; i < 2000 && sim.state().ships.filter(ship => ship.state === 'attacking').length < 4; i++) sim.step(.05);
  return sim;
}
const fired = events => events.filter(event => event.type === 'captain_fired');
const hitsBy = (events, by) => events.filter(event => event.type === 'ship_hit' && event.by === `captain:${by}`);
const settle = sim => { const events = []; for (let i = 0; i < 80; i++) events.push(...sim.step(.05)); return events; };
const shot = (by, ship, from, more = {}) => ({ type: 'captain_shot', by, targetId: ship?.id ?? null, level: 1, x: from.x, z: from.z, ...more });

describe('the sim resolves every weapon', () => {
  it('pistols: one light shot; Steady aim adds 25%', () => {
    const sim = anchored(), ship = sim.state().ships.find(item => item.state === 'attacking');
    const from = { x: ship.x * .85, z: ship.z * .85 };
    const events = [...sim.step(.05, [shot('a', ship, from, { weapon: 'pistols' }), shot('b', ship, from, { weapon: 'pistols', skills: ['steady_aim'] })]), ...settle(sim)];
    expect(fired(events).map(event => [event.by, event.weapon, event.damage])).toEqual([['a', 'pistols', 3], ['b', 'pistols', 3.75]]);
    expect(hitsBy(events, 'a').map(event => event.damage)).toEqual([3]);
  });
  it('blunderbuss: up to three ships inside the cone, the nearest first, none behind you', () => {
    const sim = anchored(), ships = sim.state().ships, ship = ships.find(item => item.state === 'attacking');
    const from = { x: ship.x * .8, z: ship.z * .8 };
    const events = [...sim.step(.05, [shot('a', null, from, { weapon: 'blunderbuss', ax: ship.x, az: ship.z })]), ...settle(sim)];
    const [event] = fired(events), stats = captainStats(1, [], 'blunderbuss');
    expect(event.weapon).toBe('blunderbuss');
    expect(event.targets.length).toBeGreaterThanOrEqual(1);
    expect(event.targets.length).toBeLessThanOrEqual(3);
    const heading = Math.atan2(ship.z - from.z, ship.x - from.x);
    for (const target of event.targets) {
      expect(Math.hypot(target.toX - from.x, target.toZ - from.z)).toBeLessThanOrEqual(stats.range + .01);
      let turn = Math.abs(Math.atan2(target.toZ - from.z, target.toX - from.x) - heading); if (turn > Math.PI) turn = 2 * Math.PI - turn;
      expect(turn).toBeLessThanOrEqual(25 * Math.PI / 180 + 1e-6);
    }
    expect(new Set(hitsBy(events, 'a').map(item => item.shipId))).toEqual(new Set(event.targets.map(item => item.id)));
    // Aimed the other way (in to the island), no ship is hit, but the shot is fired and reloads. (Since
    // boarding, §12, a boarder ashore in that cone may be hit: the spray hits pirates on foot too.)
    const away = settle(sim) && sim.step(.05, [shot('b', null, from, { weapon: 'blunderbuss', ax: -ship.x, az: -ship.z })]);
    expect(fired(away)[0].targets.filter(item => !item.boarder)).toEqual([]);
  });
  it('long rifle: goes through to the next ship behind the first on the same line', () => {
    const sim = anchored(3, 8), ships = sim.state().ships;
    // The two closest ships: shoot from a point on the line through both, 10 units before the first.
    let pair = null, best = Infinity;
    for (const a of ships) for (const b of ships) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (a !== b && d > .1 && d < best) { best = d; pair = [a, b]; }
    }
    expect(best).toBeLessThan(8);
    const [first, second] = pair, d = Math.hypot(second.x - first.x, second.z - first.z), ux = (second.x - first.x) / d, uz = (second.z - first.z) / d;
    const from = { x: first.x - ux * 10, z: first.z - uz * 10 };
    const events = [...sim.step(.05, [shot('r', first, from, { weapon: 'long_rifle' })]), ...settle(sim)];
    const [event] = fired(events);
    expect(event.targets.map(item => item.id)).toEqual([first.id, second.id]);
    expect(hitsBy(events, 'r').map(item => item.damage)).toEqual([10.8, 10.8]);
  });
  it('fire bombs: land at the aim point after the flight and burn every ship within 3 units', () => {
    const sim = anchored(), ship = sim.state().ships.find(item => item.state === 'attacking');
    const from = { x: ship.x * .75, z: ship.z * .75 };
    const near = sim.state().ships.filter(item => Math.hypot(item.x - ship.x, item.z - ship.z) <= 3).map(item => item.id).sort();
    const first = sim.step(.05, [shot('f', null, from, { weapon: 'fire_bombs', ax: ship.x, az: ship.z })]);
    expect(fired(first)[0]).toMatchObject({ weapon: 'fire_bombs', toX: Math.round(ship.x * 100) / 100, radius: 3 });
    expect(hitsBy(first, 'f')).toEqual([]); // still in the air
    const later = settle(sim), blast = later.find(event => event.type === 'captain_blast');
    expect(blast).toMatchObject({ by: 'captain:f', radius: 3, hits: near.length });
    expect(hitsBy(later, 'f').map(item => item.shipId).sort()).toEqual(near);
  });
  it('a skilled repair is faster for everyone who simulates it', () => {
    const repairedAfter = skills => {
      // wall_1 of the island (spots.js), by the west sea lane.
      const sim = createWave({ seed: 2, wave: 4, defenses: [{ id: 'wall_1', kind: 'wall', x: -18.5, z: -4 }], island: { hp: 5000 } });
      for (let i = 0; i < 4000 && sim.state().walls[0].hp >= 40; i++) sim.step(.05);
      const before = sim.state().walls[0].hp;
      expect(before).toBeLessThan(40);
      sim.step(.05, [{ type: 'repair', wallId: 'wall_1', skills }]);
      for (let i = 0; i < 10; i++) sim.step(.05);
      return sim.state().walls[0].hp - before;
    };
    const plain = repairedAfter([]), quick = repairedAfter(['quick_fix']), master = repairedAfter(['quick_fix', 'long_reach', 'master_shipwright']);
    expect(quick).toBeGreaterThan(plain);
    expect(master).toBeGreaterThan(quick);
  });
  it('stays deterministic with every weapon and skill', () => {
    const run = () => {
      const sim = createWave({ seed: 41, wave: 12, island: { hp: 3000 } }), events = [];
      for (let tick = 0; !sim.done && tick < 4000; tick++) {
        // Each weapon is its own captain, so no shot waits for another gun's reload.
        const turn = Math.floor(tick / 15) % WEAPON_IDS.length, target = sim.state().ships[0], weapon = WEAPON_IDS[turn];
        const inputs = target && tick % 15 === 0 ? [shot(`p${turn}`, target, { x: target.x * .92, z: target.z * .92 },
          { weapon, skills: SKILL_IDS.slice(0, tick % 9), ax: target.x, az: target.z })] : [];
        events.push(...sim.step(.05, inputs));
      }
      return events;
    };
    const a = run();
    expect(run()).toEqual(a);
    expect(new Set(fired(a).map(event => event.weapon))).toEqual(new Set(WEAPON_IDS));
  });
});

describe('the room carries skills, the weapon and the aim', () => {
  const entry = { by: 'p-1', seq: 2, tick: 40, waveId: 'w' };
  it('sync.js: a shot and a repair keep the shooter\'s skills and weapon; junk is refused', () => {
    const message = toMessage({ type: 'captain_shot', targetId: null, level: 2, x: 1, z: 2, skills: ['sweep', 'steady_aim'], weapon: 'fire_bombs', ax: 9, az: -3 }, entry);
    expect(message.payload).toMatchObject({ targetId: null, skills: ['steady_aim', 'sweep'], weapon: 'fire_bombs', ax: 9, az: -3 });
    expect(readMessage(message.type, message.payload, 'w').input).toEqual({ type: 'captain_shot', by: 'p-1', targetId: null, level: 2, x: 1, z: 2,
      skills: ['steady_aim', 'sweep'], weapon: 'fire_bombs', ax: 9, az: -3 });
    for (const bad of [{ weapon: 'cannon' }, { skills: ['nope'] }, { skills: ['sweep', 'sweep'] }, { ax: 'far' }, { ax: undefined, az: undefined }]) {
      expect(readMessage(message.type, { ...message.payload, ...bad }, 'w')).toBe(null);
    }
    // An older client's musket shot (no skills, no weapon) still reads as the plain musket.
    expect(readMessage('captain_shot', { by: 'p-1', seq: 3, t: 2, waveId: 'w', targetId: 'ship_1', level: 1, x: 0, z: 0 }, 'w').input)
      .toMatchObject({ skills: [], weapon: 'musket' });
    const repair = toMessage({ type: 'repair', wallId: 'wall_1', skills: ['quick_fix'] }, entry);
    expect(readMessage(repair.type, repair.payload, 'w').input).toEqual({ type: 'repair', wallId: 'wall_1', skills: ['quick_fix'] });
    expect(readMessage(repair.type, { ...repair.payload, skills: ['quick_fix', 'x'] }, 'w')).toBe(null);
  });
  it('live-rules.js: the wave room passes the new fields and drops a bad skill or weapon', () => {
    const ID = '11111111-2222-4333-8444-555555555555';
    const wrap = data => ({ v: 1, id: ID, seq: 1, data });
    const base = { by: 'p-1', seq: 2, t: 1, waveId: 'w', targetId: 'ship_1', level: 1, x: 1, z: 2 };
    expect(readWaveMessage('captain_shot', wrap(base))).not.toBe(null);
    expect(readWaveMessage('captain_shot', wrap({ ...base, skills: ['steady_aim'], weapon: 'long_rifle' }))).not.toBe(null);
    expect(readWaveMessage('captain_shot', wrap({ ...base, targetId: null, skills: [], weapon: 'blunderbuss', ax: 3, az: 4 }))).not.toBe(null);
    for (const bad of [{ weapon: 'laser' }, { skills: ['x'] }, { targetId: null }, { ax: 3 }, { ax: 3, az: 900 }, { extra: 1 }]) {
      expect(readWaveMessage('captain_shot', wrap({ ...base, ...bad }))).toBe(null);
    }
    const wall = { by: 'p-1', seq: 2, t: 1, waveId: 'w', wallId: 'wall_1' };
    expect(readWaveMessage('wall_repair', wrap({ ...wall, skills: ['quick_fix'] }))).not.toBe(null);
    expect(readWaveMessage('wall_repair', wrap({ ...wall, skills: 'quick_fix' }))).toBe(null);
  });
  it('interact.js: Long reach lets you repair a wall from 2 units farther', () => {
    const state = { phase: 'running', walls: [{ id: 'wall_1', hp: 10, maxHp: 60, repairing: false }], ships: [] };
    const defenses = [{ id: 'wall_1', kind: 'wall', x: 0, z: 0 }], player = { x: REACH + 1, z: 0 };
    expect(actionAt(player, defenses, state)).toBe(null);
    expect(actionAt(player, defenses, state, { repairReach: captainStats(1, ['quick_fix', 'long_reach']).repairReach })).toMatchObject({ kind: 'repair', wallId: 'wall_1' });
  });
});
