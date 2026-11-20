import { describe, expect, it } from 'vitest';
import { CONFIG, createWave, previewDefenseUpgrade } from '../../src/pirates/sim.js';

const defense = (kind, overrides = {}) => ({ id: kind, kind, level: 1, x: 15, z: 0, ...overrides });
const preview = (defenses, selectedId, options = {}) => previewDefenseUpgrade({
  defenses, selectedId, currentLevel: 1, gunnerCount: 0, defensesV2: false, ...options,
});

function firstAttack(sim, type, id) {
  for (let tick = 0; tick < 3_000 && !sim.done; tick++) {
    const fired = sim.step(CONFIG.tick).find(event => event.type === type && (event.towerId ?? event.cannonId) === id);
    if (fired) return fired;
  }
  throw new Error(`No ${type} for ${id} in the fixture wave`);
}

function expectWaveParity(sim, id, type, expected) {
  expect(sim.attackCoverage(id)).toMatchObject({ level: expected.level, range: expected.range });
  expect(sim.state().towers.find(tower => tower.id === id).manned).toBe(expected.manned);
  expect(firstAttack(sim, type, id).damage).toBe(expected.damage);
  expect(sim.attackCoverage(id).reload).toBe(expected.reloadSeconds);
}

describe('effective next-level defense comparison', () => {
  it.each([
    ['cannon', 'cannon_fired', 'projectile'],
    ['mortar', 'mortar_fired', 'blast'],
    ['harpoon', 'harpoon_thrown', 'projectile'],
    ['culverin', 'culverin_fired', 'projectile'],
    ['swivel', 'swivel_fired', 'pellet'],
  ])('matches the live %s acquisition, attack and reload on both levels', (kind, type, unit) => {
    const options = { wave: 4, seed: 3, defensesV2: true, lanes: [{ id: 'east', bearing: 0 }] };
    const rows = [defense(kind), defense('watchtower', { spec: 'war_drums', level: 3 })];
    const comparison = preview(rows, kind, { defensesV2: true });
    expect(comparison).toMatchObject({ id: kind, kind, damageUnit: unit, gunnerChanges: [] });
    expectWaveParity(createWave({ ...options, defenses: rows }), kind, type, comparison.before);
    expectWaveParity(createWave({ ...options, defenses: [defense(kind, { level: 2 }), rows[1]] }), kind, type, comparison.after);
  });

  it('quotes the Cluster Mortar per actual blast without adding the three blasts together', () => {
    const mortar = defense('mortar', { spec: 'cluster' });
    const comparison = preview([mortar], mortar.id);
    const sim = createWave({ wave: 4, seed: 3, defenses: [mortar], lanes: [{ id: 'east', bearing: 0 }] });
    const hit = [];
    for (let tick = 0; tick < 3_000 && !hit.length && !sim.done; tick++) {
      hit.push(...sim.step(CONFIG.tick).filter(event => event.type === 'ship_hit' && event.by === mortar.id));
    }
    expect(comparison).toMatchObject({ damageUnit: 'blast', before: { damage: 4.24 }, after: { damage: 6.66 } });
    expect(hit[0]?.damage).toBe(comparison.before.damage);
  });

  it('applies research, skill and nearby support without claiming weather-dependent sight', () => {
    const cannon = defense('cannon', { x: 22, spec: 'heavy', bonus: 'long_guns' });
    const tower = defense('watchtower', { x: 0, level: 3, spec: 'spotter', bonus: 'lookout_drill' });
    const rows = [cannon, tower, defense('watchtower', { id: 'drummer', x: 0, spec: 'war_drums' })];
    const { before, after } = preview(rows, cannon.id);
    expect(before).toEqual({ level: 1, range: 46.2, damage: 21, reloadSeconds: 1.18, manned: false });
    expect(after).toEqual({ level: 2, range: 49.65, damage: 33.6, reloadSeconds: 1.02, manned: false });
    const weather = { fog: .5 };
    const fog = createWave({ wave: 4, weather, defenses: rows });
    expect(fog.attackCoverage(cannon.id).range).toBe(before.range * .5);
  });

  it.each([
    ['culverin', 44, 46, 52.8, 55.2],
    ['swivel', 13, 14, 15.6, 16.8],
  ])('applies Eagle eye at the exact boundary for %s, omitting the global range bonus', (kind, before, after, near, afterNear) => {
    const eagle = defense('watchtower', { level: 5, x: 0, spec: 'eagle_eye', bonus: 'high_tower' });
    const options = { defensesV2: true, gunnerCount: 1 };
    const at = preview([defense(kind, { x: 22 }), eagle], kind, options);
    const outside = preview([defense(kind, { x: 22.001 }), eagle], kind, options);
    expect([at.before.range, at.after.range]).toEqual([near, afterNear]);
    expect([outside.before.range, outside.after.range]).toEqual([before, after]);
    expect([at.before.manned, at.after.manned, outside.before.manned, outside.after.manned]).toEqual([false, false, false, false]);
  });

  it('reassigns a Gunner on the hypothetical layout and leaves the running wave and source layout intact', () => {
    const first = Object.freeze(defense('cannon', { id: 'a', level: 2 }));
    const selected = Object.freeze(defense('cannon', { id: 'b' }));
    const rows = Object.freeze([selected, first]);
    const running = createWave({ defenses: rows, crew: { gunner: 1 } });
    const frozenState = running.state();
    const comparison = preview(rows, selected.id, { gunnerCount: 1 });
    expect(comparison).toMatchObject({
      before: { level: 1, manned: false, reloadSeconds: 1.05 },
      after: { level: 2, manned: false, reloadSeconds: .91 },
      gunnerChanges: [],
    });
    const tiedUpgrade = createWave({ defenses: [first, { ...selected, level: 2 }], crew: { gunner: 1 } });
    expectWaveParity(tiedUpgrade, selected.id, 'cannon_fired', comparison.after);

    const selectedWinsTie = Object.freeze(defense('cannon', { id: '0' }));
    const switched = preview([first, selectedWinsTie], selectedWinsTie.id, { gunnerCount: 1 });
    expect(switched).toMatchObject({
      before: { level: 1, manned: false, reloadSeconds: 1.05 },
      after: { level: 2, manned: true, reloadSeconds: .68 },
      gunnerChanges: [{ id: 'a', manned: false }],
    });
    const switchedWave = createWave({ defenses: [first, { ...selectedWinsTie, level: 2 }], crew: { gunner: 1 } });
    expectWaveParity(switchedWave, selectedWinsTie.id, 'cannon_fired', switched.after);
    expect(running.state()).toEqual(frozenState);
    expect(rows).toEqual([selected, first]);
  });

  it('keeps an already-upgraded tower tree in the assignment calculation', () => {
    const selected = defense('cannon', { id: 'a', level: 4 });
    const withTree = defense('cannon', { id: 'b', level: 5, tree: { a: 3, b: 1 } });
    const rows = [selected, withTree];
    const options = { currentLevel: 4, gunnerCount: 1 };
    expect(preview(rows, selected.id, options).after.manned).toBe(false);
    expect(preview([selected, { ...withTree, tree: null }], selected.id, options).after.manned).toBe(true);
  });

  it('returns unavailable for missing rules, a stale level, a disabled kind and a maximum level', () => {
    const cannon = defense('cannon');
    expect(preview([cannon], cannon.id, { defensesV2: undefined })).toBeNull();
    expect(preview([cannon], cannon.id, { gunnerCount: undefined })).toBeNull();
    expect(preview([cannon], cannon.id, { currentLevel: 2 })).toBeNull();
    expect(preview([cannon], 'previous-selection')).toBeNull();
    expect(preview([defense('culverin')], 'culverin')).toBeNull();
    expect(preview([defense('cannon', { level: 5 })], cannon.id, { currentLevel: 5 })).toBeNull();
  });
});
