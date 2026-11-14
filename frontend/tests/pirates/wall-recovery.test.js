// Wall recovery (tasks T29-T32 and T47, decision D039, proposed; specs/T29-T32-wall-recovery.md):
// a wall keeps its damage into the next wave, the wave's walls come from the server, and the end
// of a wave reports each wall's health. T29's regression cases are marked "T29".
import { describe, expect, it } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { FULL, healthReport, percentOf, readHealth, startHp, withHealth } from '../../src/pirates/wall-health.js';
import { readWaveInfo } from '../../src/pirates/controller.js';
import { runWave, spot, walls } from './balance-fixture.js';

const wallOf = (state, id = 'w') => state.walls.find(item => item.id === id);
const oneWall = extra => [{ ...spot('w', 'wall', 0, .86), level: 2, ...extra }];

describe('a wall starts the wave with the health its last wave left it', () => {
  it('T29: without a health (an old save, the flag off) every wall starts whole, as before', () => {
    const state = createWave({ seed: 1, wave: 2, defenses: oneWall() }).state();
    expect(wallOf(state)).toMatchObject({ hp: 120, maxHp: 120, broken: false });
  });

  it('T29: a wall destroyed in the last wave starts destroyed, ready to rebuild, at its own level', () => {
    const state = createWave({ seed: 1, wave: 2, defenses: oneWall({ health: 0 }) }).state();
    expect(wallOf(state)).toMatchObject({ hp: 0, maxHp: 120, broken: true, rebuildReady: true, level: 2 });
  });

  it('a damaged wall starts at its share of the full hp of its level', () => {
    const state = createWave({ seed: 1, wave: 2, defenses: oneWall({ health: 40 }) }).state();
    expect(wallOf(state)).toMatchObject({ hp: 48, maxHp: 120, broken: false });
  });

  it('a wall started at 40% is repaired with E up to its full hp, never above', () => {
    const wave = createWave({ seed: 1, wave: 1, defenses: oneWall({ health: 40 }), island: { hp: 1000 } });
    for (let i = 0; i < 40; i++) wave.step(.5, i % 6 === 0 ? [{ type: 'repair', wallId: 'w' }] : []);
    expect(wallOf(wave.state()).hp).toBe(120);
  });

  it('a wall rebuilt with E comes back at 40% of its level, as before', () => {
    const wave = createWave({ seed: 1, wave: 1, defenses: oneWall({ health: 0 }), island: { hp: 1000 } });
    wave.step(.05, [{ type: 'rebuild', wallId: 'w' }]);
    expect(wallOf(wave.state()).hp).toBe(48);
  });

  it('a bad health counts as whole, so a broken answer never breaks a wall', () => {
    for (const health of [-1, 101, 2.5, '40', null]) {
      expect(wallOf(createWave({ seed: 1, wave: 2, defenses: oneWall({ health }) }).state()).hp).toBe(120);
    }
  });

  it('the same seed, inputs and walls give the same wave on every screen', () => {
    const defenses = walls(3).map((item, i) => ({ ...item, health: [0, 50, 100][i] }));
    const one = runWave({ seed: 9, wave: 4, defenses, island: { hp: 1000 } });
    const two = runWave({ seed: 9, wave: 4, defenses, island: { hp: 1000 } });
    expect(two.events).toEqual(one.events);
  });
});

describe('the wall health rules', () => {
  it('reads a percent and starts the hp from it', () => {
    expect([readHealth(0), readHealth(100), readHealth(101), readHealth(undefined)]).toEqual([0, 100, FULL, FULL]);
    expect(startHp(120, 40)).toBe(48);
  });

  it('gives each wall of the wave its health from the server, and the other defenses none', () => {
    const defenses = [{ id: 'wall_1', kind: 'wall' }, { id: 'wall_2', kind: 'wall' }, { id: 'cannon_1', kind: 'cannon' }];
    expect(withHealth(defenses, { wall_1: 40, cannon_1: 0 })).toEqual([{ id: 'wall_1', kind: 'wall', health: 40 },
      { id: 'wall_2', kind: 'wall' }, { id: 'cannon_1', kind: 'cannon' }]);
    expect(withHealth(defenses, null)).toBe(defenses);
  });

  it('reports 0 only for a broken wall and 100 only for a whole one', () => {
    expect([percentOf(0, 60), percentOf(.3, 60), percentOf(59.9, 60), percentOf(60, 60), percentOf(30, 60)]).toEqual([0, 1, 99, 100, 50]);
    expect(healthReport([{ id: 'a', hp: 0, maxHp: 60 }, { id: 'b', hp: 75, maxHp: 75 }])).toEqual({ a: 0, b: 100 });
  });

  it('keeps the walls of a wave answer and drops anything else', () => {
    const info = readWaveInfo({ waveId: 'w1', seed: 1, startsAt: '2026-11-14T12:00:00Z', walls: { wall_1: 40, wall_2: 'x' } });
    expect(info.walls).toEqual({ wall_1: 40 });
    expect(readWaveInfo({ waveId: 'w1', seed: 1, startsAt: '2026-11-14T12:00:00Z' }).walls).toBeNull();
  });
});
