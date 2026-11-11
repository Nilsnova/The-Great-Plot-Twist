// The wave renderer (lane P3): one atlas, batched layers, pooled effects and nothing left behind.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createWave } from '../../src/pirates/sim.js';
import { ATLAS_IDS, MUSKET, createWaveRenderer, packAtlas } from '../../src/pirates/render.js';
import { pirateDimensions } from '../../src/pixel/pirate-catalog.js';

const at = (id, kind, bearing, radius) => {
  const p = coastPoint(bearing * Math.PI / 180, radius);
  return { id, kind, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
};
const DEFENSES = [at('cannon_1', 'cannon', -45, .75), at('cannon_2', 'cannon', 45, .75), at('cannon_3', 'cannon', 135, .75),
  at('wall_1', 'wall', 0, .86), at('wall_2', 'wall', 90, .86)];
const atlas = () => ({ texture: new THREE.Texture(), ...packAtlas() });

function play(renderer, seed, wave = 6) {
  const sim = createWave({ seed, wave, weather: { ships: 3, fog: .3 }, defenses: DEFENSES });
  const peak = { instances: 0, balls: 0, ships: 0 };
  let time = 0;
  while (!sim.done) {
    const events = sim.step(1 / 30); time += 1 / 30;
    renderer.events(events);
    renderer.update({ state: sim.state(), simTime: time, dt: 1 / 30 });
    const stats = renderer.stats();
    for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], stats[key]);
  }
  for (let i = 0; i < 400; i++) renderer.update({ state: sim.state(), simTime: time += 1 / 30, dt: 1 / 30 });
  return { peak, after: renderer.stats(), state: sim.state() };
}

describe('pirate wave renderer', () => {
  it('packs every sprite into one atlas without overlaps', () => {
    const { width, height, rects } = packAtlas();
    expect(width).toBe(512); expect(height).toBeLessThanOrEqual(512);
    for (const id of ATLAS_IDS) expect(rects[id]).toMatchObject({ w: pirateDimensions[id][0], h: pirateDimensions[id][1] });
    const list = Object.values(rects);
    for (const a of list) {
      expect(a.x + a.w).toBeLessThanOrEqual(width); expect(a.y + a.h).toBeLessThanOrEqual(height);
      for (const b of list) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    }
  });

  it('draws a full fleet in a few batched layers and leaves nothing behind across waves', () => {
    const scene = new THREE.Scene(), before = scene.children.length, shared = atlas();
    const runs = [];
    for (const seed of [1, 2, 3]) {
      const renderer = createWaveRenderer({ scene, atlas: shared, defenses: DEFENSES, fx: () => null });
      const layers = renderer.root.children.length;
      expect(layers).toBe(3 + 5 + 1); // far sea, near sea, air, one per wall or cannon, fog
      const run = play(renderer, seed);
      expect(run.state.total).toBe(CONFIG.fleet.max);
      expect(run.peak.ships).toBeGreaterThanOrEqual(6);
      expect(run.peak.instances).toBeLessThan(300);
      // Every effect has run out: the pools are empty, the layers hold no stale entries.
      expect(run.after).toMatchObject({ ships: run.state.ships.length, balls: 0, splashes: 0, sinkers: 0, wrecks: 0, objects: layers });
      runs.push({ objects: run.after.objects, owned: run.after.owned });
      renderer.dispose(); renderer.dispose();
      expect(scene.children.length).toBe(before);
      expect(renderer.stats()).toMatchObject({ objects: 0, owned: 0 });
    }
    expect(runs[1]).toEqual(runs[0]); expect(runs[2]).toEqual(runs[0]);
  });

  it('hides everything when the player is elsewhere and keeps the calmer reduced-motion path', () => {
    const scene = new THREE.Scene();
    const renderer = createWaveRenderer({ scene, atlas: atlas(), defenses: DEFENSES, reducedMotion: () => true, fx: () => null });
    const sim = createWave({ seed: 4, wave: 2, defenses: DEFENSES });
    for (let i = 0; i < 300; i++) { renderer.events(sim.step(.05)); renderer.update({ state: sim.state(), simTime: i * .05, dt: .05 }); }
    expect(renderer.stats().instances).toBeGreaterThan(0);
    renderer.setVisible(false); renderer.update({ state: sim.state(), simTime: 15, dt: .05 });
    expect(renderer.stats().instances).toBe(0);
    expect(renderer.root.visible).toBe(false);
    renderer.dispose();
  });

  it('holds the musket pose and flash ~250 ms, runs a tracer to the ship and puffs on the hit', () => {
    const scene = new THREE.Scene(), pack = packAtlas(), renderer = createWaveRenderer({ scene, atlas: { texture: new THREE.Texture(), ...pack }, fx: () => null });
    const air = renderer.root.children.find(item => item.name === 'pirates:air');
    const drawn = () => {
      const uv = air.geometry.getAttribute('iUv').array, out = [];
      for (let i = 0; i < air.geometry.instanceCount; i++) {
        const u = Math.min(uv[i * 4], uv[i * 4 + 2]);
        const hit = Object.entries(pack.rects).find(([, r]) => Math.abs((r.x + .01) / pack.width - u) < 1e-6 && Math.abs(r.x + r.w - .01 - Math.max(uv[i * 4], uv[i * 4 + 2]) * pack.width) < 1e-3);
        out.push(hit?.[0]);
      }
      return out;
    };
    expect(MUSKET.fire).toBeGreaterThanOrEqual(.25);
    const state = { ships: [], walls: [], towers: [], fog: 0, sight: 28 };
    renderer.events([{ type: 'captain_fired', t: 1, impactAt: 1.3, by: 'me', targetId: 's', x: 0, z: 0, toX: 8, toZ: -2 }]);
    renderer.update({ state, simTime: 1, dt: .01 });
    expect(drawn()).toEqual(expect.arrayContaining(['captain-musket-2', 'fx-musket-flash', 'white']));
    const step = seconds => { for (let i = 0; i < Math.round(seconds / .01); i++) renderer.update({ state, simTime: 1, dt: .01 }); };
    step(.2); // 210 ms: still firing, the tracer on its way
    expect(drawn()).toEqual(expect.arrayContaining(['captain-musket-2', 'fx-musket-flash', 'white']));
    step(.12); // 330 ms: past the fire time and the flight: aiming, the puff on the ship
    const later = drawn();
    expect(later).toContain('captain-musket-1'); expect(later).not.toContain('fx-musket-flash');
    expect(later.some(id => /^fx-smoke-/.test(id))).toBe(true);
    for (let i = 0; i < 10; i++) renderer.update({ state, simTime: 2, dt: .1 });
    expect(renderer.stats().tracers).toBe(0);
    renderer.dispose();
  });
});
