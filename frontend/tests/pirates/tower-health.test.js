// Tower health (T33, specs/T33-tower-health.md, decision D049, proposed): with the wave option
// towerHealth (the server's rule "tower_health") cannons, mortars and harpoons have hp, boarders hack a
// tower in their reach, a broken tower stops firing, and E repairs or rebuilds it inside the wave.
// Without the option every wave plays exactly as before. These are also the damage fixtures for T31/T32.
import { describe, expect, it } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { actionAt, inputFor } from '../../src/pirates/interact.js';
import { TOWER_STATE_IDS, towerFrame } from '../../src/pirates/render.js';
import { TOWER_HEALTH, createTowerHealth, towerLook, towerMaxHp } from '../../src/pirates/tower-health.js';

// A harpoon tower right next to the heart (0, 2): every boarder walking in passes within its reach, and a
// harpoon never shoots boarders, so they reach it. A cannon a little further off fires at them.
const NEAR_HEART = [{ id: 'harpoon_1', kind: 'harpoon', level: 1, x: 0, z: 3.5 }, { id: 'cannon_1', kind: 'cannon', level: 1, x: 1, z: 3.2 }];
const run = (options, inputs = () => []) => {
  const wave = createWave({ seed: 5, wave: 3, defenses: NEAR_HEART, island: { hp: 5000 }, ...options });
  const events = [];
  while (!wave.done) events.push(...wave.step(.25, inputs(wave)));
  return { wave, events };
};
const towerOf = (wave, id) => wave.state().towers.find(item => item.id === id);

describe('the tower health rules', () => {
  it('gives each included kind hp by level and none to the others', () => {
    expect(towerMaxHp('cannon', 1)).toBe(80);
    expect(towerMaxHp('mortar', 5)).toBe(360);
    expect(towerMaxHp('harpoon', 9)).toBe(TOWER_HEALTH.hp.harpoon[4]);
    expect(towerMaxHp('watchtower', 1)).toBe(0);
  });

  it('reads intact, damaged (half or less) and broken from the hp', () => {
    expect(towerLook({ hp: 80, maxHp: 80 })).toBe('intact');
    expect(towerLook({ hp: 41, maxHp: 80 })).toBe('intact');
    expect(towerLook({ hp: 40, maxHp: 80 })).toBe('damaged');
    expect(towerLook({ hp: 0, maxHp: 80 })).toBe('broken');
    expect(towerLook({})).toBe('intact');
  });

  it('breaks a tower once: a broken tower takes no more blows and sends one tower_broken', () => {
    const tower = { id: 't', kind: 'cannon', level: 1, x: 0, z: 0 };
    const rules = createTowerHealth({ enabled: true, towers: [tower] }), events = [];
    expect(rules.hit(tower, 50, 'b1', events)).toBe(false);
    expect(rules.hit(tower, 50, 'b2', events)).toBe(true);
    expect(rules.hit(tower, 50, 'b3', events)).toBe(false);
    expect(events.filter(event => event.type === 'tower_broken')).toHaveLength(1);
    expect(tower.hp).toBe(0);
    expect(rules.canFire(tower)).toBe(false);
  });

  it('is inert while the option is off: every tower fires and nothing gets hp', () => {
    const tower = { id: 't', kind: 'cannon', level: 1 };
    const rules = createTowerHealth({ enabled: false, towers: [tower] });
    expect(rules.canFire(tower)).toBe(true);
    expect(tower.hp).toBeUndefined();
  });
});

describe('towers in a wave', () => {
  it('without the option the wave is exactly as before: no hp, no tower events', () => {
    const before = run({}), off = run({ towerHealth: false });
    expect(off.events).toEqual(before.events);
    expect(before.events.some(event => event.type.startsWith('tower_') && event.type !== 'tower_jammed')).toBe(false);
    expect(towerOf(before.wave, 'cannon_1').hp).toBeUndefined();
  });

  it('boarders hack a tower in their reach until it breaks, and a broken tower never fires again', () => {
    const { wave, events } = run({ towerHealth: true });
    const broken = events.filter(event => event.type === 'tower_broken');
    expect(broken.length).toBeGreaterThan(0);
    expect(new Set(broken.map(event => event.towerId)).size).toBe(broken.length); // one break per tower
    for (const event of broken) {
      const shotsAfter = events.filter(item => (item.cannonId === event.towerId || item.towerId === event.towerId)
        && (item.type === 'cannon_fired' || item.type === 'harpoon_thrown') && item.t > event.t);
      expect(shotsAfter).toEqual([]);
      expect(towerOf(wave, event.towerId)).toMatchObject({ hp: 0, broken: true });
    }
    expect(events.find(event => event.type === 'tower_damaged')?.by).toMatch(/^boarder_/);
  });

  it('E repairs a damaged tower up to its hp, never above, and rebuilds a broken one at 40%', () => {
    const wave = createWave({ seed: 5, wave: 3, defenses: NEAR_HEART, island: { hp: 5000 }, towerHealth: true });
    let broken = null;
    for (let i = 0; i < 4000 && !broken && !wave.done; i++) broken = wave.step(.05).find(event => event.type === 'tower_broken') ?? null;
    expect(broken).not.toBeNull();
    const rebuilt = wave.step(.05, [{ type: 'rebuild', wallId: broken.towerId }]).find(event => event.type === 'tower_rebuilt');
    const max = towerMaxHp(broken.towerId.split('_')[0], 1);
    expect(rebuilt?.hp).toBe(Math.round(max * .4));
    expect(wave.step(.05, [{ type: 'rebuild', wallId: broken.towerId }]).some(event => event.type === 'tower_rebuilt')).toBe(false); // cooldown
    wave.step(.05, [{ type: 'repair', wallId: broken.towerId }]);
    expect(towerOf(wave, broken.towerId).repairing).toBe(true);
    for (let i = 0; i < 200; i++) wave.step(.05, i % 60 === 0 ? [{ type: 'repair', wallId: broken.towerId }] : []);
    expect(towerOf(wave, broken.towerId).hp).toBeLessThanOrEqual(max);
  });

  it('the same seed and inputs give the same wave with tower health on', () => {
    expect(run({ towerHealth: true }).events).toEqual(run({ towerHealth: true }).events);
  });
});

describe('E at a tower (interact.js)', () => {
  const defenses = [{ id: 'cannon_1', kind: 'cannon', x: 0, z: 0 }];
  const state = towers => ({ phase: 'running', ships: [], walls: [], towers });

  it('repairs a damaged tower before it mans the cannon, and rebuilds a broken one', () => {
    const damaged = actionAt({ x: 1, z: 0 }, defenses, state([{ id: 'cannon_1', hp: 30, maxHp: 80, repairing: false }]));
    expect(damaged).toMatchObject({ kind: 'repair', wallId: 'cannon_1', tower: true });
    expect(inputFor(damaged)).toEqual({ type: 'repair', wallId: 'cannon_1' });
    const broken = actionAt({ x: 1, z: 0 }, defenses, state([{ id: 'cannon_1', hp: 0, maxHp: 80, rebuildReady: true }]));
    expect(inputFor(broken)).toEqual({ type: 'rebuild', wallId: 'cannon_1' });
  });

  it('mans the cannon as before when the tower is whole or has no hp (tower health off)', () => {
    expect(actionAt({ x: 1, z: 0 }, defenses, state([{ id: 'cannon_1', hp: 80, maxHp: 80 }]))?.kind).toBe('fire');
    expect(actionAt({ x: 1, z: 0 }, defenses, state([{ id: 'cannon_1' }]))?.kind).toBe('fire');
  });
});

describe('drawing a tower in its state (render.js)', () => {
  it('takes the damaged and broken drawings when the atlas has them, and the intact frame otherwise', () => {
    expect(towerFrame('cannon', 2, false, () => true, 'damaged')).toBe('island-cannon-l2-damaged');
    expect(towerFrame('mortar', 1, true, () => true, 'broken')).toBe('island-mortar-broken');
    expect(towerFrame('cannon', 3, false, () => true)).toBe(towerFrame('cannon', 3, false, () => true, 'intact'));
    const noStates = id => !id.endsWith('-damaged') && !id.endsWith('-broken');
    expect(towerFrame('cannon', 3, true, noStates, 'broken')).toBe(towerFrame('cannon', 3, false, noStates)); // no ghost shot
  });

  it('lists 30 state frames: three kinds, five levels, damaged and broken', () => {
    expect(TOWER_STATE_IDS).toHaveLength(30);
    expect(new Set(TOWER_STATE_IDS).size).toBe(30);
  });
});
