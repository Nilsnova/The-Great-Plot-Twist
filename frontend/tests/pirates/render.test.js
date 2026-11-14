// The wave renderer (lane P3): one atlas, batched layers, pooled effects and nothing left behind.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createWave } from '../../src/pirates/sim.js';
import { ATLAS_IDS, BOARDER_BANDS, MUSKET, createWaveRenderer, packAtlas } from '../../src/pirates/render.js';
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
      expect(layers).toBe(3 + BOARDER_BANDS + 5 + 1); // far sea, near sea, air, the boarders' z bands, one per wall or cannon, fog
      const run = play(renderer, seed);
      expect(run.state.total).toBe(CONFIG.fleet.max);
      expect(run.peak.ships).toBeGreaterThanOrEqual(6);
      expect(run.peak.instances).toBeLessThan(300);
      // Every effect has run out: the pools are empty, the layers hold no stale entries.
      expect(run.after).toMatchObject({ ships: run.state.ships.length, balls: 0, splashes: 0, sinkers: 0, wrecks: 0, fallen: 0, strikes: 0, objects: layers });
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

  it('flashes ~250 ms at the muzzle, runs a tracer to the ship and puffs on the hit, with no second captain drawn', () => {
    const scene = new THREE.Scene(), pack = packAtlas(), renderer = createWaveRenderer({ scene, atlas: { texture: new THREE.Texture(), ...pack }, fx: () => null });
    const air = renderer.root.children.find(item => item.name === 'pirates:air');
    const everything = () => renderer.root.children.filter(item => item.isMesh);
    const drawnIn = mesh => {
      const uv = mesh.geometry.getAttribute('iUv')?.array, out = [];
      if (!uv) return out;
      for (let i = 0; i < mesh.geometry.instanceCount; i++) {
        const u = Math.min(uv[i * 4], uv[i * 4 + 2]);
        const hit = Object.entries(pack.rects).find(([, r]) => Math.abs((r.x + .01) / pack.width - u) < 1e-6 && Math.abs(r.x + r.w - .01 - Math.max(uv[i * 4], uv[i * 4 + 2]) * pack.width) < 1e-3);
        out.push(hit?.[0]);
      }
      return out;
    };
    const drawn = () => drawnIn(air);
    const anyBody = () => everything().flatMap(drawnIn).filter(id => /^captain-(musket|cutlass)/.test(id ?? ''));
    expect(MUSKET.fire).toBeGreaterThanOrEqual(.25);
    const state = { ships: [], walls: [], towers: [], fog: 0, sight: 28 };
    renderer.events([{ type: 'captain_fired', t: 1, impactAt: 1.3, by: 'me', targetId: 's', x: 0, z: 0, toX: 8, toZ: -2 }]);
    renderer.update({ state, simTime: 1, dt: .01 });
    expect(drawn()).toEqual(expect.arrayContaining(['fx-musket-flash', 'white']));
    // The body that fires is the player's own character (src/pirates/poses.js): no captain sprite is pushed.
    expect(anyBody()).toEqual([]);
    const step = seconds => { for (let i = 0; i < Math.round(seconds / .01); i++) renderer.update({ state, simTime: 1, dt: .01 }); };
    step(.2); // 210 ms: still firing, the tracer on its way
    expect(drawn()).toEqual(expect.arrayContaining(['fx-musket-flash', 'white']));
    expect(anyBody()).toEqual([]);
    step(.12); // 330 ms: past the fire time and the flight: the puff on the ship
    const later = drawn();
    expect(later).not.toContain('fx-musket-flash');
    expect(later.some(id => /^fx-smoke-/.test(id))).toBe(true);
    for (let i = 0; i < 10; i++) renderer.update({ state, simTime: 2, dt: .1 });
    expect(renderer.stats().tracers).toBe(0);
    // A cutlass blow: its ring only, no captain-cutlass body.
    renderer.events([{ type: 'captain_struck', t: 2, by: 'me', targetId: 'b', x: 0, z: 0, toX: 1, toZ: 0 }]);
    renderer.update({ state, simTime: 2, dt: .01 });
    expect(anyBody()).toEqual([]);
    renderer.dispose();
  });
  it('starts the flash and tracer from where the shooter stands now, not where the shot was fired', () => {
    const scene = new THREE.Scene(), pack = packAtlas(), renderer = createWaveRenderer({ scene, atlas: { texture: new THREE.Texture(), ...pack }, fx: () => null });
    const air = renderer.root.children.find(item => item.name === 'pirates:air');
    const flashX = () => {
      const uv = air.geometry.getAttribute('iUv').array, pos = air.geometry.getAttribute('iPos').array, r = pack.rects['fx-musket-flash'];
      for (let i = 0; i < air.geometry.instanceCount; i++) if (Math.abs(Math.min(uv[i * 4], uv[i * 4 + 2]) - (r.x + .01) / pack.width) < 1e-6) return pos[i * 4];
      return null;
    };
    const state = { ships: [], walls: [], towers: [], fog: 0, sight: 28 };
    renderer.events([{ type: 'captain_fired', t: 1, impactAt: 1.3, by: 'me', targetId: 's', x: 0, z: 0, toX: 8, toZ: -2 },
      { type: 'captain_fired', t: 1, impactAt: 1.3, by: 'ben', targetId: 's', x: 0, z: 5, toX: 8, toZ: -2 }]);
    // You walked 3 units on; Ben's figure stands at x 10.
    renderer.update({ state, simTime: 1, dt: .01, captain: { id: 'me', x: 3, z: 0, share: 1 }, figures: new Map([['ben', { x: 10, z: 5 }]]) });
    const xs = (() => {
      const uv = air.geometry.getAttribute('iUv').array, pos = air.geometry.getAttribute('iPos').array, r = pack.rects['fx-musket-flash'], out = [];
      for (let i = 0; i < air.geometry.instanceCount; i++) if (Math.abs(Math.min(uv[i * 4], uv[i * 4 + 2]) - (r.x + .01) / pack.width) < 1e-6) out.push(pos[i * 4]);
      return out.sort((a, b) => a - b);
    })();
    expect(flashX()).not.toBeNull();
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeGreaterThan(3); expect(xs[0]).toBeLessThan(6);   // your muzzle, beside you at x 3
    expect(xs[1]).toBeGreaterThan(10); expect(xs[1]).toBeLessThan(13); // Ben's, beside his figure at x 10
    renderer.dispose();
  });
  it("puts the muzzle bloom and the cutlass ring at the shooter's body now, else where the sim had them", () => {
    const calls = [], fx = { bloom: (x, y) => calls.push(['bloom', x]), ring: (x, y) => calls.push(['ring', x]) };
    const scene = new THREE.Scene(), pack = packAtlas(), renderer = createWaveRenderer({ scene, atlas: { texture: new THREE.Texture(), ...pack }, fx: () => fx });
    const state = { ships: [], walls: [], towers: [], fog: 0, sight: 28 };
    renderer.update({ state, simTime: 1, dt: .01, captain: { id: 'me', x: 3, z: 0, share: 1 }, figures: new Map([['ben', { x: 10, z: 5 }]]) });
    renderer.events([{ type: 'captain_fired', t: 1, impactAt: 1.3, by: 'me', x: 0, z: 0, toX: 8, toZ: -2 },
      { type: 'captain_struck', t: 1, by: 'ben', x: 0, z: 5, toX: 1, toZ: 5 },
      { type: 'captain_struck', t: 1, by: 'nobody', x: -4, z: 5, toX: -5, toZ: 5 }]);
    const [bloom, benRing, loneRing] = calls;
    expect(bloom[0]).toBe('bloom'); expect(bloom[1]).toBeGreaterThan(3); expect(bloom[1]).toBeLessThan(6);
    expect(benRing).toEqual(['ring', 10 + 1.4]);
    expect(loneRing).toEqual(['ring', -4 - 1.4]); // no figure: the ring where the sim had the blow, and no body
    renderer.dispose();
  });
});

describe('ships under fire stay readable (GAME-V3.md §7)', () => {
  it('darkens a damaged hull instead of washing it out, more when it burns, and keeps a healthy one as drawn', async () => {
    const { damageTint, CHARACTER_SCALE } = await import('../../src/pirates/render.js');
    expect(damageTint({}, 1)).toEqual({ r: 1, g: 1, b: 1 });
    expect(damageTint({}, .7)).toEqual({ r: 1, g: 1, b: 1 });
    const hurt = damageTint({}, .5).r, burning = damageTint({}, .2).r, gone = damageTint({}, 0).r;
    expect(hurt).toBeLessThan(1); expect(burning).toBeLessThan(hurt); expect(gone).toBeGreaterThanOrEqual(.55);
    expect(damageTint({ r: .5, g: 1, b: 1 }, 0).r).toBeCloseTo(.5 * gone);
    expect(CHARACTER_SCALE).toBeGreaterThanOrEqual(1.3);
  });
  it('grows captains and boarders with the battle zoom: 1.4x on a 1280 x 800 screen, more on a phone, at most 1.8x', async () => {
    const { characterScale, MAX_CHARACTER_SCALE } = await import('../../src/pirates/character-scale.js');
    expect(characterScale(.52)).toBeCloseTo(1.44, 1);
    expect(characterScale(1)).toBe(1.4);
    expect(characterScale(.4)).toBeGreaterThan(1.6);
    expect(characterScale(.1)).toBe(MAX_CHARACTER_SCALE);
    expect(characterScale(Number.NaN)).toBe(1.4);
  });
});
