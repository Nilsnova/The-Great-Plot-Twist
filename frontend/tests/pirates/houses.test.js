// The house roles (docs/GAME-V3.md "Houses"): from level 2 a house picks Barracks, Tavern or Workshop. The sim
// (militia that fight boarders and can fall, Tavern healing, Workshop repairs and mending), the revive price with
// a Tavern, the ids against the backend and the migration, the card, the house look, and the fake server's route.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave, curveFor, hasTavern, houseRoles, revivePrice } from '../../src/pirates/sim.js';
import { ROLES, ROLE_IDS, ROLE_LEVEL, ROLE_RADIUS, activeRole, readRole } from '../../src/campaign/houses.js';
import { readSpec } from '../../src/campaign/tech.js';
import { BUILDINGS } from '../../src/island/td-rules.js';
import { buildCardModel } from '../../src/island/card-model.js';
import { ROLE_ART, buildingArt } from '../../src/island/world.js';
import { islandFrames } from '../../src/art/island.js';
import { peopleFrames } from '../../src/art/people.js';
import { MILITIA_IDS } from '../../src/pirates/render.js';
import { createFakeIslandApi, createFakeWorld } from '../../src/pirates/fake-api.js';
import { measure, ring, runWave, towers } from './balance-fixture.js';

const HO = CONFIG.houses;
const EAST = [{ id: 'east', bearing: 0 }];
const house = (id, level, spec, x = 7, z = -6) => ({ id, kind: 'house', level, x, z, ...(spec ? { spec } : {}) });
const move = (by, x, z) => ({ type: 'captain_move', by, x, z });
const run = (wave, until, inputs = () => [], limit = 6000) => {
  const all = [];
  for (let i = 0; i < limit && !wave.done; i++) {
    const step = wave.step(CONFIG.tick, inputs(i * CONFIG.tick, wave));
    all.push(...step);
    if (until?.(step, wave)) break;
  }
  return all;
};
const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

describe('house roles: the data', () => {
  it('has three roles from level 2, the same ids as the backend and the migration', () => {
    expect(ROLE_IDS).toEqual(['barracks', 'tavern', 'workshop']);
    expect(ROLE_LEVEL).toBe(HO.level);
    expect(read('backend/server/island/catalogue.py')).toContain('HOUSE_ROLES = ("barracks", "tavern", "workshop")');
    const sql = read('supabase/migrations/20261112090000_house_roles.sql');
    for (const id of ROLE_IDS) expect(sql).toContain(`('house', '${id}')`);
    // Every line is short and plain; the radii are what the sim uses.
    for (const id of ROLE_IDS) expect(ROLES[id].line.length).toBeLessThan(100);
    expect([HO.barracks.guard, HO.tavern.radius, HO.workshop.radius]).toEqual([ROLE_RADIUS.barracks, ROLE_RADIUS.tavern, ROLE_RADIUS.workshop]);
  });

  it('a role belongs to a house only, and acts from level 2', () => {
    expect([readRole('house', 'tavern'), readRole('wall', 'tavern'), readRole('house', 'rapid')]).toEqual(['tavern', null, null]);
    expect([readSpec('house', 'workshop'), readSpec('cannon', 'workshop'), readSpec('house', 'rapid')]).toEqual(['workshop', null, null]);
    expect([activeRole({ kind: 'house', level: 1, spec: 'tavern' }), activeRole({ kind: 'house', level: 2, spec: 'tavern' })]).toEqual([null, 'tavern']);
    expect(houseRoles([house('house_2', 3, 'barracks', -8), house('house_1', 1, 'tavern'), { id: 'wall_1', kind: 'wall', level: 2, x: 0, z: 0, spec: 'tavern' }]))
      .toEqual([{ id: 'house_2', role: 'barracks', level: 3, x: -8, z: -6 }]);
  });

  it('a house has three levels (level 3 opens after wave 5) and keeps its loot', () => {
    expect(BUILDINGS.house.price).toEqual([50, 100, 200]);
    expect(BUILDINGS.house.stats.map(item => item.loot)).toEqual([5, 10, 15]);
    expect(CONFIG.levels.house).toHaveLength(3);
    const islands = JSON.parse(read('backend/content/islands.json'));
    expect(islands.kinds.find(item => item.kind === 'house').prices).toEqual([50, 100, 200]);
    const campaign = JSON.parse(read('backend/content/campaign.json'));
    expect(campaign.steps.find(step => step.wave === 5).opens).toContain('house:3');
    expect(islands.revive.tavernPercent).toBe(HO.tavern.revive);
  });
});

describe('house roles: the revive price with a Tavern', () => {
  it('takes 25% off, rounded down, as wave_revive() does', () => {
    expect([revivePrice(1), revivePrice(1, { tavern: true })]).toEqual([25, 18]);
    expect([revivePrice(12), revivePrice(12, { tavern: true })]).toEqual([80, 60]);
    expect(revivePrice(3, { tavern: true })).toBe(Math.floor(35 * .75));
    expect(hasTavern([house('house_1', 2, 'tavern')])).toBe(true);
    expect(hasTavern([house('house_1', 1, 'tavern'), house('house_2', 2, 'barracks', -8)])).toBe(false);
  });
});

describe('house roles: the Barracks', () => {
  it('sends 1 militia from a level-2 Barracks and 2 tougher ones from level 3, at most 3 on the island', () => {
    const out = defenses => runWave({ seed: 3, wave: 4, lanes: EAST, defenses }).events.filter(event => event.type === 'militia_out');
    expect(out([house('house_1', 2, 'barracks')]).map(event => [event.militiaId, event.houseId, event.hp]))
      .toEqual([['militia_1', 'house_1', Math.round(60 * curveFor(4).hp)]]);
    expect(out([house('house_1', 3, 'barracks')]).map(event => event.hp)).toEqual(Array(2).fill(Math.round(80 * curveFor(4).hp)));
    expect(out([house('house_1', 3, 'barracks'), house('house_2', 3, 'barracks', -8)]).map(event => event.houseId))
      .toEqual(['house_1', 'house_1', 'house_2']);
    expect(out([house('house_1', 1, 'barracks')])).toEqual([]);
    expect(out([house('house_1', 2, 'tavern')])).toEqual([]);
  });

  it('militia fight boarders near the house, the boarders fight back, and the same seed gives the same fight', () => {
    const island = { seed: 11, wave: 6, defenses: [house('house_1', 3, 'barracks'), house('house_2', 3, 'barracks', -8)], island: { hp: 1000 } };
    const a = runWave(island), b = runWave(island);
    const kills = a.events.filter(event => event.type === 'boarder_killed' && event.by.startsWith('militia:'));
    expect(kills.length).toBeGreaterThan(0);
    expect(a.events.some(event => event.type === 'militia_struck')).toBe(true);
    expect(a.events.some(event => event.type === 'militia_hit')).toBe(true);
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    // Every blow lands near the striker's own house (its door, the leash and the reach).
    const homes = Object.fromEntries(a.events.filter(item => item.type === 'militia_out').map(item => [item.militiaId, island.defenses.find(d => d.id === item.houseId)]));
    for (const event of a.events.filter(item => item.type === 'militia_struck')) {
      const home = homes[event.militiaId];
      expect(Math.hypot(event.x - home.x, event.z - (home.z + HO.barracks.door))).toBeLessThan(HO.barracks.leash + HO.barracks.reach + 1);
    }
  });

  it('a militia can fall; the next wave it walks out again', () => {
    const defenses = [house('house_1', 2, 'barracks')];
    const { events, state } = runWave({ seed: 5, wave: 40, defenses, island: { hp: 5000 } });
    const fell = events.find(event => event.type === 'militia_fell');
    expect(fell).toMatchObject({ militiaId: 'militia_1', houseId: 'house_1' });
    expect(state.militia).toEqual([]);
    expect(state.militiaFell).toBe(1);
    expect(createWave({ seed: 6, wave: 41, defenses }).step(CONFIG.tick).some(event => event.type === 'militia_out')).toBe(true);
  });

  it('shows the militia in the state with their place, hp and what they do', () => {
    const wave = createWave({ seed: 2, wave: 3, defenses: [house('house_1', 2, 'barracks')] });
    wave.step(CONFIG.tick);
    expect(wave.state().militia).toEqual([expect.objectContaining({ id: 'militia_1', houseId: 'house_1', hp: 60 * curveFor(3).hp, level: 2, state: 'walking' })]);
    expect(wave.state().houses).toEqual([{ id: 'house_1', role: 'barracks', level: 2, x: 7, z: -6 }]);
  });
});

describe('house roles: the Tavern', () => {
  // A captain who stands on the first boarder until hit, then walks to (x, z) and waits there.
  function hurtThenRest(defenses, at) {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 }, defenses });
    let hurt = false;
    const where = () => {
      const boarder = wave.state().boarders[0];
      return hurt || !boarder ? at : { x: boarder.x, z: boarder.z };
    };
    run(wave, step => { hurt ||= step.some(event => event.type === 'captain_hit'); return hurt; },
      t => (Math.round(t * 20) % 10 === 0 ? [move('p-ann', where().x, where().z)] : []));
    // Walk off to the resting place, let the boarder lose interest, then measure 2 seconds.
    wave.step(CONFIG.tick, [move('p-ann', at.x, at.z)]);
    run(wave, null, () => [], 4);
    const before = wave.state().party[0].hp, events = run(wave, null, () => [], 40);
    return { before, after: wave.state().party[0].hp, events };
  }

  it('heals a standing captain near it about 2 hp a second, also in a wave; one far away heals nothing', () => {
    const near = hurtThenRest([house('house_1', 2, 'tavern')], { x: 7, z: -4 });
    expect(near.before).toBeLessThan(CONFIG.health.hp);
    expect(near.after - near.before).toBeCloseTo(Math.min(CONFIG.health.hp - near.before, 2 * HO.tavern.heal), 0);
    expect(near.events.some(event => event.type === 'captain_healed' && event.captainId === 'p-ann')).toBe(true);
    const far = hurtThenRest([house('house_1', 2, 'tavern')], { x: -20, z: 14 });
    expect(far.after).toBe(far.before);
    const none = hurtThenRest([house('house_1', 2, 'barracks')], { x: 7, z: -4 });
    expect(none.after).toBe(none.before);
  });

  it('two Taverns together heal at most 3 a second', () => {
    const both = hurtThenRest([house('house_1', 2, 'tavern', 7, -6), house('house_2', 2, 'tavern', 8, -3)], { x: 7, z: -4 });
    expect(both.after - both.before).toBeCloseTo(Math.min(CONFIG.health.hp - both.before, 2 * HO.tavern.max), 0);
  });
});

describe('house roles: the Workshop', () => {
  const RING7 = { id: 'wall_7', kind: 'wall', level: 1, x: 8.5, z: 2 };
  const walls = defenses => createWave({ seed: 1, wave: 1, defenses }).state().walls;

  it('makes walls in reach repair and rebuild 30% faster (50% / 45% at most with two)', () => {
    const wave = createWave({ seed: 1, wave: 1, defenses: [RING7, house('house_1', 2, 'workshop')] });
    expect(wave.state().walls[0]).toMatchObject({ workshop: 1 });
    const two = walls([RING7, house('house_1', 2, 'workshop'), house('house_2', 2, 'workshop', 6, -4)]);
    expect(two[0].workshop).toBe(2);
    expect(walls([RING7, house('house_1', 2, 'workshop', -20, -10)])[0].workshop).toBeUndefined();
    // A player's repair: 10 hp/s × 1.3 with one Workshop.
    const repaired = boost => {
      const sim = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 }, defenses: [RING7, ...boost] });
      run(sim, step => step.some(event => event.type === 'wall_damaged'));
      const hp = sim.state().walls[0].hp;
      sim.step(CONFIG.tick, [{ type: 'repair', wallId: 'wall_7' }]);
      return sim.state().walls[0].hp - hp;
    };
    expect(repaired([house('house_1', 2, 'workshop')]) / repaired([])).toBeCloseTo(1.3, 1);
  });

  it('a broken wall in reach mends by itself to a quarter of its hp after 12 s', () => {
    const sim = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 }, defenses: [RING7, house('house_1', 2, 'workshop')] });
    const broke = run(sim, step => step.some(event => event.type === 'wall_damaged' && event.broken)).find(event => event.broken);
    const mended = run(sim, step => step.some(event => event.type === 'wall_rebuilt')).find(event => event.type === 'wall_rebuilt');
    expect(mended).toMatchObject({ wallId: 'wall_7', by: 'workshop', hp: Math.round(CONFIG.levels.wall[0].hp * HO.workshop.share) });
    expect(mended.t - broke.t).toBeCloseTo(HO.workshop.mend, 0);
  });

  it('the carpenter rebuilds a broken wall in reach 30% sooner (8 s becomes 5.6 s)', () => {
    const sim = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 }, crew: { carpenter: 1 }, defenses: [RING7, house('house_1', 2, 'workshop')] });
    const broke = run(sim, step => step.some(event => event.type === 'wall_damaged' && event.broken)).find(event => event.broken);
    const rebuilt = run(sim, step => step.some(event => event.type === 'wall_rebuilt')).find(event => event.type === 'wall_rebuilt');
    expect(rebuilt).toMatchObject({ wallId: 'wall_7', by: 'carpenter' });
    expect(rebuilt.t - broke.t).toBeCloseTo(CONFIG.crew.carpenter.rebuild * (1 - HO.workshop.faster), 0);
  });
});

describe('house roles: balance (waves 1-10 do not become easy)', () => {
  const roles = (list, level = 2) => [house('house_1', level, list[0]), house('house_2', level, list[1], -8)];
  it('two Barracks help, but an empty island still loses wave 2 and three cannons still lose wave 10', () => {
    expect(measure({ defenses: roles(['barracks', 'barracks']) }, 2).won).toBeLessThanOrEqual(3);
    expect(measure({ defenses: [...towers([['cannon', 1], ['cannon', 1], ['cannon', 1]]), ...roles(['barracks', 'barracks'], 3)] }, 10).won).toBe(0);
    const first = { defenses: [...towers([['cannon', 1]]), ...ring(6)] };
    const plain = measure(first, 3), helped = measure({ defenses: [...first.defenses, ...roles(['barracks', 'workshop'])] }, 3);
    expect(helped.hp).toBeGreaterThanOrEqual(plain.hp);
    expect(helped.hp).toBeLessThan(100);
  });
});

describe('house roles: what the screens show', () => {
  it('the card: the loot line, below level 2 one line, from level 2 the three roles with the active one marked', () => {
    const at = (level, spec = null) => buildCardModel({ spotId: 'house_1', slot: 'house', coins: 500,
      spot: { id: 'house_1', kind: 'house', built: true, level, spec, upgradeCost: BUILDINGS.house.price[level] ?? null } });
    const low = at(1);
    expect(low.stats).toBe('Loot 5 🪙');
    expect(low.skills).toMatchObject({ title: 'House role', line: 'Level 2: choose Barracks, Tavern or Workshop.', choices: [] });
    const two = at(2);
    expect(two.stats).toBe('Loot 10 🪙');
    expect(two.skills.choices.map(choice => [choice.id, choice.name, choice.active])).toEqual([['barracks', 'Barracks', false], ['tavern', 'Tavern', false], ['workshop', 'Workshop', false]]);
    expect(two.skills.choices.every(choice => choice.line === ROLES[choice.id].line)).toBe(true);
    expect(two.mode).toBe('upgrade');
    const picked = at(3, 'tavern');
    expect(picked.skills.title).toBe('Role: Tavern');
    expect(picked.skills.choices.find(choice => choice.active)).toMatchObject({ id: 'tavern', disabled: true });
    expect(picked.reason).toBe('');
    // A level-1 house never shows a stored role as its own.
    expect(at(1, 'tavern').skills.current).toBe(null);
  });

  it('each role has its own house look, and the militia have their own frames', () => {
    const frames = islandFrames();
    for (const id of ROLE_IDS) {
      expect(buildingArt('house', 2, id)).toBe(ROLE_ART[id]);
      expect(Object.hasOwn(frames, ROLE_ART[id])).toBe(true);
    }
    expect([buildingArt('house', 1, 'tavern'), buildingArt('house', 3), buildingArt('wall', 2, 'tavern')]).toEqual(['island-house', 'island-house', buildingArt('wall', 2)]);
    const people = peopleFrames();
    for (const id of MILITIA_IDS) expect(Object.hasOwn(people, id)).toBe(true);
  });
});

describe('house roles: the fake server', () => {
  const START = Date.UTC(2026, 10, 12, 12, 0, 0);
  it('picks a role on a house of level 2 for free, refuses it below, keeps it at level 3', async () => {
    const world = createFakeWorld(), api = createFakeIslandApi({ world, playerId: 'me' });
    await api.island();
    world.players.get('me').coins = 1000;
    await api.build({ spot: 'house_1', kind: 'house', actionUid: 'h-0001' });
    await expect(api.specialise({ spot: 'house_1', spec: 'tavern' })).rejects.toMatchObject({ status: 409, code: 'house_level' });
    await api.upgrade({ spot: 'house_1', actionUid: 'h-0002' });
    const coins = world.players.get('me').coins;
    const view = await api.specialise({ spot: 'house_1', spec: 'tavern' });
    expect(view.spots.find(spot => spot.id === 'house_1')).toMatchObject({ level: 2, spec: 'tavern' });
    expect(world.players.get('me').coins).toBe(coins);
    expect((await api.specialise({ spot: 'house_1', spec: 'workshop' })).spots.find(spot => spot.id === 'house_1').spec).toBe('workshop');
    await expect(api.specialise({ spot: 'wall_1', spec: 'tavern' })).rejects.toMatchObject({ code: 'not_built' });
    await api.build({ spot: 'wall_1', kind: 'wall', actionUid: 'w-0001' });
    await expect(api.specialise({ spot: 'wall_1', spec: 'tavern' })).rejects.toMatchObject({ status: 422, code: 'wrong_kind' });
    await api.upgrade({ spot: 'house_1', actionUid: 'h-0003' });
    expect((await api.island()).spots.find(spot => spot.id === 'house_1')).toMatchObject({ level: 3, spec: 'workshop' });
  });

  it('a Tavern on the island takes 25% off the revive, as wave_revive() does', async () => {
    const world = createFakeWorld(), api = createFakeIslandApi({ world, playerId: 'me', code: 'K7Q2M', now: () => START });
    await api.island();
    world.players.get('me').coins = 1000;
    await api.build({ spot: 'house_1', kind: 'house', actionUid: 'h-0001' });
    await api.upgrade({ spot: 'house_1', actionUid: 'h-0002' });
    const wave = await api.startWave({ where: 'own', actionUid: 'bell-0001' });
    const later = createFakeIslandApi({ world, playerId: 'me', code: 'K7Q2M', now: () => START + 15000 });
    expect((await later.reviveCaptain({ waveId: wave.waveId, fallen: 'p-ben', downAt: 10, actionUid: 'revive-0001' })).price).toBe(revivePrice(wave.wave));
    await later.specialise({ spot: 'house_1', spec: 'tavern' });
    expect((await later.reviveCaptain({ waveId: wave.waveId, fallen: 'p-ben', downAt: 20, actionUid: 'revive-0002' })).price).toBe(revivePrice(wave.wave, { tavern: true }));
  });
});
