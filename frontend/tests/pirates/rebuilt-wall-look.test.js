// A wall repaired or rebuilt in the break (D039) stops looking broken right away, not only at the next wave.
// Playtest 16 Nov: "after Rebuild the walls still look destroyed".
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';
import { createWaveRenderer, packAtlas, wallShare } from '../../src/pirates/render.js';
import { towers, walls } from './balance-fixture.js';

const START = Date.UTC(2026, 10, 16, 12, 0, 0);
const INFO = { waveId: 'w-1', wave: 1, seed: 77, startsAt: new Date(START + 10000).toISOString(), weather: { ships: 1, fog: 0 }, flagship: false };

describe('wallShare', () => {
  it('uses the wave hp until a break health is set, then the break health', () => {
    expect(wallShare({ id: 'wall_1' }, { hp: 0, maxHp: 50 })).toBe(0);
    expect(wallShare({ id: 'wall_1' }, { hp: 25, maxHp: 50 })).toBe(.5);
    expect(wallShare({ id: 'wall_1' }, undefined)).toBe(1);
    expect(wallShare({ id: 'wall_1', rest: 1 }, { hp: 0, maxHp: 50 })).toBe(1);
    expect(wallShare({ id: 'wall_1', rest: .4 }, { hp: 0, maxHp: 50 })).toBe(.4);
  });
});

describe('the wave renderer in the break', () => {
  const atlas = () => ({ texture: new THREE.Texture(), ...packAtlas() });
  it('draws a rebuilt wall whole although the wave ended with it destroyed', () => {
    const start = [...towers([['cannon', 1]]), ...walls(2)];
    const renderer = createWaveRenderer({ scene: new THREE.Scene(), atlas: atlas(), defenses: start, fx: () => null });
    const ended = { ships: [], boarders: [], walls: [{ id: 'wall_1', hp: 0, maxHp: 50 }, { id: 'wall_2', hp: 20, maxHp: 50 }] };
    expect(renderer.wallShares(ended)).toEqual({ wall_1: 0, wall_2: .4 });
    // A building change without wall health keeps the wave's picture.
    renderer.setDefenses(start);
    expect(renderer.wallShares(ended)).toEqual({ wall_1: 0, wall_2: .4 });
    // The paid rebuild of wall_1: its new health comes along, wall_2 stays as the server says.
    renderer.setDefenses(start.map(item => (item.id === 'wall_1' ? { ...item, health: 100 } : item.id === 'wall_2' ? { ...item, health: 40 } : item)));
    expect(renderer.wallShares(ended)).toEqual({ wall_1: 1, wall_2: .4 });
    renderer.update({ state: ended, dt: .1 }); // drawing with the old state does not throw
    renderer.dispose();
  });
});

describe('the wave controller after a paid repair', () => {
  it('passes the fresh wall health to the renderer in the break, and only there', async () => {
    const clock = { now: START }, timers = [];
    const defenses = [...towers([['cannon', 3], ['cannon', 3], ['cannon', 3]]), ...walls(2, 3)];
    const renderer = { events() {}, update() {}, setVisible() {}, dispose() {}, setDefenses: vi.fn() };
    const waves = createWaveController({ bus: { on: () => () => {}, emit() {} }, listen: false, getDefenses: () => defenses, now: () => clock.now,
      world: { scene: {}, container: {} }, finishWave: async () => ({ loot: 15 }), createRenderer: () => renderer,
      createHud: () => ({ countdown() {}, bar() {}, prompt() {}, setVisible() {}, dispose() {}, boss() {}, loot() {}, pause() {}, banner() {} }),
      playCutscene: async () => {}, startNextWave: async () => ({ ok: true }), loadAuto: () => false, saveAuto() {},
      setTimer: (run, ms) => { const timer = { run, at: clock.now + ms }; timers.push(timer); return timer; },
      clearTimer: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); } });
    const advance = async ms => {
      for (let t = 0; t < ms; t += 500) {
        clock.now += 500; waves.update(.5);
        for (const timer of timers.filter(item => item.at <= clock.now)) { timers.splice(timers.indexOf(timer), 1); await timer.run(); }
        await Promise.resolve(); await Promise.resolve();
      }
    };
    waves.start(INFO);
    await advance(500);
    expect(waves.refreshDefenses({ wall_1: 100 })).toBe(false); // during the wave nothing changes
    while (!waves.inBreak && clock.now < START + 200000) await advance(500);
    expect(waves.inBreak).toBe(true);
    expect(waves.refreshDefenses({ wall_1: 100 })).toBe(true);
    const list = renderer.setDefenses.mock.calls.at(-1)[0];
    expect(list.find(item => item.id === 'wall_1').health).toBe(100);
    expect(list.find(item => item.id === 'wall_2').health).toBeUndefined();
    expect(waves.refreshDefenses()).toBe(true); // without health: the list as before
    expect(renderer.setDefenses.mock.calls.at(-1)[0].every(item => item.health === undefined)).toBe(true);
  });
});
