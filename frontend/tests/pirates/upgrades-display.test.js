// Upgrades on the map during and after a wave (11 Nov, "sometimes some upgrades were not visible"): the wave's
// posts take new levels and new buildings in the break, and the wiring tells them after every change.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';
import { createWaveRenderer, packAtlas } from '../../src/pirates/render.js';
import { spot, towers, walls } from './balance-fixture.js';

const START = Date.UTC(2026, 10, 11, 12, 0, 0);
const INFO = { waveId: 'w-1', wave: 1, seed: 77, startsAt: new Date(START + 10000).toISOString(), weather: { ships: 1, fog: 0 }, flagship: false };

describe('the wave renderer after an upgrade', () => {
  const atlas = () => ({ texture: new THREE.Texture(), ...packAtlas() });
  it('gives a post its new level and a spot built since its post', () => {
    const scene = new THREE.Scene(), start = [...towers([['cannon', 1]]), ...walls(1)];
    const renderer = createWaveRenderer({ scene, atlas: atlas(), defenses: start, fx: () => null });
    const layers = renderer.root.children.length;
    expect(renderer.levels()).toEqual({ tower_s1: 1, wall_1: 1 });
    const next = [{ ...start[0], level: 3 }, { ...start[1], level: 2 }, spot('cannon_4', 'mortar', 135, .75, 2)];
    renderer.setDefenses(next);
    expect(renderer.levels()).toEqual({ tower_s1: 3, wall_1: 2, cannon_4: 2 });
    expect(renderer.root.children.length).toBe(layers + 1);
    renderer.setDefenses(next); // the same list again changes nothing
    expect(renderer.root.children.length).toBe(layers + 1);
    renderer.update({ state: null, dt: .1 });
    renderer.dispose();
  });
});

describe('the wave controller and the island changing', () => {
  function harness() {
    const clock = { now: START }, timers = [];
    let defenses = [...towers([['cannon', 3], ['cannon', 3], ['cannon', 3]]), ...walls(3, 3)];
    const renderer = { events() {}, update() {}, setVisible() {}, dispose() {}, setDefenses: vi.fn() };
    const waves = createWaveController({ bus: { on: () => () => {}, emit() {} }, listen: false, getDefenses: () => defenses, now: () => clock.now,
      world: { scene: {}, container: {} }, finishWave: async () => ({ loot: 15 }), createRenderer: () => renderer,
      createHud: () => ({ countdown() {}, bar() {}, prompt() {}, setVisible() {}, dispose() {}, boss() {}, loot() {}, pause() {}, banner() {} }),
      playCutscene: async () => {}, startNextWave: async () => ({ ok: true }), loadAuto: () => false, saveAuto() {},
      setTimer: (run, ms) => { const timer = { run, at: clock.now + ms }; timers.push(timer); return timer; },
      clearTimer: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); } });
    async function advance(ms, step = 100) {
      for (let t = 0; t < ms; t += step) {
        clock.now += step; waves.update(step / 1000);
        for (const timer of timers.filter(item => item.at <= clock.now)) { timers.splice(timers.indexOf(timer), 1); await timer.run(); }
        await Promise.resolve(); await Promise.resolve();
      }
    }
    return { waves, renderer, advance, clock, setDefenses: list => { defenses = list; } };
  }
  it('hands the new defenses to the wave in its break, not while it is fought', async () => {
    const h = harness();
    h.waves.start(INFO);
    await h.advance(300);
    expect(h.waves.refreshDefenses()).toBe(false); // the wave is under way: it keeps the defenses it started with
    while (!h.waves.inBreak && h.clock.now < START + 200000) await h.advance(500);
    expect(h.waves.inBreak).toBe(true);
    h.setDefenses([spot('cannon_1', 'cannon', 45, .75, 2)]);
    expect(h.waves.refreshDefenses()).toBe(true);
    expect(h.renderer.setDefenses).toHaveBeenCalledWith([expect.objectContaining({ id: 'cannon_1', level: 2 })]);
  });
});
