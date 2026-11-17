// Tower health (T33, specs/T33-tower-health.md, decision D049, proposed): with the wave option
// towerHealth (the server's rule "tower_health") cannons, mortars and harpoons have hp, boarders hack a
// tower in their reach, a broken tower stops firing, and E repairs or rebuilds it inside the wave.
// Without the option every wave plays exactly as before. These are also the damage fixtures for T31/T32.
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { actionAt, inputFor } from '../../src/pirates/interact.js';
import { TOWER_STATE_IDS, towerFrame } from '../../src/pirates/render.js';
import { TOWER_HEALTH, createTowerHealth, towerLook, towerMaxHp } from '../../src/pirates/tower-health.js';
import { towerEdgeDistance } from '../../src/pirates/tower-obstacles.js';

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

  it('tower obstacles bring boarders to the outer edge, then break the tower without walking through it', () => {
    const wave = createWave({seed: 5, wave: 3, defenses: NEAR_HEART, island: {hp: 5000},
      towerHealth: true, pathing: true, towerObstacles: true});
    let damaged = false;
    for (let i = 0; i < 6000 && !wave.done; i++) {
      damaged ||= wave.step(.05).some(event => event.type === 'tower_damaged' && event.by.startsWith('boarder_'));
      const state = wave.state();
      for (const boarder of state.boarders) {
        for (const tower of state.towers.filter(item => item.hp > 0)) {
          const gap = towerEdgeDistance(boarder, tower);
          if (boarder.state === 'hacking' && boarder.towerId === tower.id) {
            expect(gap).toBeGreaterThanOrEqual(.29);
            expect(gap).toBeLessThanOrEqual(CONFIG.boarding.contact + .05);
          }
          if (boarder.state === 'walking') expect(gap).not.toBeLessThan(.29);
        }
      }
    }
    expect(damaged).toBe(true);
  });

  it('a rebuilt tower blocks the path again and is attacked from its boundary', () => {
    const wave = createWave({seed: 5, wave: 3, defenses: NEAR_HEART, island: {hp: 5000},
      towerHealth: true, pathing: true, towerObstacles: true});
    let broken = null;
    for (let i = 0; i < 6000 && !broken && !wave.done; i++) {
      broken = wave.step(.05).find(event => event.type === 'tower_broken') ?? null;
    }
    expect(broken).not.toBeNull();
    const rebuilt = wave.step(.05, [{type: 'rebuild', wallId: broken.towerId}]);
    expect(rebuilt.some(event => event.type === 'tower_rebuilt' && event.towerId === broken.towerId)).toBe(true);
    let hitAgain = false;
    for (let i = 0; i < 2400 && !hitAgain && !wave.done; i++) {
      hitAgain = wave.step(.05).some(event => event.type === 'tower_damaged' && event.towerId === broken.towerId
        && event.by.startsWith('boarder_'));
      const state = wave.state(), tower = state.towers.find(item => item.id === broken.towerId);
      for (const boarder of state.boarders.filter(item => item.state === 'hacking' && item.towerId === tower.id)) {
        expect(towerEdgeDistance(boarder, tower)).toBeLessThanOrEqual(CONFIG.boarding.contact + .05);
        expect(towerEdgeDistance(boarder, tower)).toBeGreaterThanOrEqual(.29);
      }
    }
    expect(hitAgain).toBe(true);
  });

  it('drops a held captain target after the captain moves behind a tower', () => {
    const tower = {id: 'cannon_1', kind: 'cannon', level: 1, x: 8, z: 2};
    const wave = createWave({seed: 5, wave: 3, defenses: [tower], island: {hp: 5000},
      towerHealth: true, pathing: true, towerObstacles: true});
    let pursuer = null;
    for (let i = 0; i < 4000 && !pursuer && !wave.done; i++) {
      wave.step(.05, [{type: 'captain_move', by: 'captain_1', x: 12, z: 2}]);
      pursuer = wave.state().boarders.find(item => item.foe === 'captain_1') ?? null;
    }
    expect(pursuer).not.toBeNull();
    for (let i = 0; i < 80 && !wave.done; i++) wave.step(.05, [{type: 'captain_move', by: 'captain_1', x: 4, z: 2}]);
    const after = wave.state().boarders.find(item => item.id === pursuer.id);
    expect(after).toBeDefined();
    expect(after.foe).not.toBe('captain_1');
    expect(towerEdgeDistance(after, tower)).toBeGreaterThanOrEqual(.29);
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

  it('recovery v1 keeps a destroyed tower at zero after Captain E repair and rebuild inputs', () => {
    const wave = createWave({ seed: 5, wave: 3, defenses: NEAR_HEART, island: { hp: 5000 }, towerHealth: true,
      recoveryVersion: 1, waveProtocol: 2 });
    let broken = null;
    for (let i = 0; i < 4000 && !broken && !wave.done; i++) broken = wave.step(.05).find(event => event.type === 'tower_broken') ?? null;
    expect(broken).not.toBeNull();
    for (let i = 0; i < 220; i++) {
      wave.step(.05, [{ type: 'rebuild', wallId: broken.towerId }, { type: 'repair', wallId: broken.towerId }]);
    }
    expect(towerOf(wave, broken.towerId)).toMatchObject({ hp: 0, broken: true, repairing: false });
  });

  it('the same seed and inputs give the same wave with tower health on', () => {
    expect(run({ towerHealth: true }).events).toEqual(run({ towerHealth: true }).events);
  });

  it('tower obstacle mode replays deterministically, while its off state preserves T33 events', () => {
    const base = run({towerHealth: true, pathing: true});
    expect(run({towerHealth: true, pathing: true, towerObstacles: false}).events).toEqual(base.events);
    const enabled = run({towerHealth: true, pathing: true, towerObstacles: true});
    expect(run({towerHealth: true, pathing: true, towerObstacles: true}).events).toEqual(enabled.events);
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
