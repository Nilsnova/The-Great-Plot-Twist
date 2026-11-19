// The wave renderer (lane P3): one atlas, batched layers, pooled effects and nothing left behind.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createWave } from '../../src/pirates/sim.js';
import { ATLAS_IDS, BOARDER_BANDS, CHARACTER_SCALE, MUSKET, createWaveRenderer, packAtlas } from '../../src/pirates/render.js';
import { pirateDimensions } from '../../src/pixel/pirate-catalog.js';
import {projectGround} from '../../src/world/projection.js';

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
      expect(layers).toBe(3 + BOARDER_BANDS + 5 + 1 + 1 + 1); // sea/air, bands, posts, fog, wall connections, captain feedback
      expect(renderer.root.children.filter(child => child.name === 'pirates:wall-connections')).toHaveLength(1);
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

  it('keeps the Home boarders’ contact shading on shore and clears it with the battle', () => {
    const scene = new THREE.Scene();
    const renderer = createWaveRenderer({scene, atlas: atlas(), place: 'home_islet', reducedMotion: () => true});
    const state = {ships: [], walls: [], towers: [], boarders: [
      {id: 'landed', x: 1, z: -3, hp: 9, maxHp: 9},
      {id: 'offshore', x: 22, z: 0, hp: 9, maxHp: 9},
    ]};
    renderer.update({state});
    const shadow = renderer.root.getObjectByName('pirate-foot-shadows');
    const contact = shadow.geometry.getAttribute('footprint'), pin = projectGround(1, -3);
    expect(shadow.visible).toBe(true);
    expect(shadow.geometry.instanceCount).toBe(1);
    expect(contact.getX(0)).toBeCloseTo(pin.x + .15 * CHARACTER_SCALE);
    expect(contact.getY(0)).toBeCloseTo(pin.y - .05 * CHARACTER_SCALE);
    renderer.setVisible(false);
    renderer.update({state});
    expect(shadow.geometry.instanceCount).toBe(0);
    expect(shadow.visible).toBe(false);
    renderer.dispose();
    expect(shadow.parent).toBeNull();
  });
  it('pools one selected defense overlay below the captain range and clears it at every handoff', () => {
    const scene = new THREE.Scene(), record = {id: 'mortar_1', kind: 'mortar', level: 3, x: 4, z: -6};
    const renderer = createWaveRenderer({scene, atlas: atlas(), defenses: [record], fx: () => null});
    const state = {ships: [], walls: [], towers: [], fog: .3, sight: 6};
    const combatFeedback = {range: {x: 0, z: 0, radius: 5, alpha: 1}};
    const coverage = {...record, status: 'ready', range: 6, minRange: 3, litRange: 8};
    const ringName = 'pirates:defense-range', selectionName = 'island-selection-bracket';
    renderer.update({state, combatFeedback});
    expect(renderer.root.getObjectByName(ringName)).toBeUndefined();
    expect(renderer.root.getObjectByName(selectionName)).toBeUndefined();

    const draw = defenseCoverage => renderer.update({combatFeedback, defenseCoverage});
    draw(coverage);
    const ring = renderer.root.getObjectByName(ringName), marker = renderer.root.getObjectByName(selectionName);
    const captain = renderer.root.getObjectByName('captain-range-arcs'), fog = renderer.root.getObjectByName('pirates:fog');
    const resources = [ring.geometry, ring.material, ...marker.children.flatMap(mesh => [mesh.geometry, mesh.material])];
    const release = new Map(resources.map(resource => [resource, 0]));
    resources.forEach(resource => resource.addEventListener('dispose', () => release.set(resource, release.get(resource) + 1)));
    expect([ring.visible, marker.visible, captain.visible, fog.visible]).toEqual([true, true, true, true]);
    expect(ring.position.toArray()).toEqual(marker.position.toArray());
    expect(marker.userData).toMatchObject({spotId: record.id, level: record.level});
    expect(ring.renderOrder).toBeLessThan(marker.children[0].renderOrder);
    expect(marker.children[1].renderOrder).toBeLessThan(captain.renderOrder);
    expect(ring.material.uniforms.inner.value).toBeCloseTo(3 / 8);
    expect(ring.material.uniforms.outer.value).toBeCloseTo(6 / 8);
    expect(ring.material.uniforms.conditional.value).toBe(1);

    draw({...coverage, range: 2, litRange: 3});
    expect([ring.visible, marker.visible]).toEqual([false, true]);
    draw({...coverage, range: 2});
    expect([ring.visible, marker.visible]).toEqual([true, true]);
    expect(ring.material.uniforms.outer.value).toBe(0);
    for (const status of ['jammed', 'silenced', 'destroyed']) {
      draw({...coverage, status});
      expect([ring.visible, marker.visible, captain.visible]).toEqual([false, true, true]);
    }
    const next = {...coverage, id: 'cannon_2', kind: 'cannon', x: 2, z: 6, range: 9, minRange: 0, litRange: 9};
    draw(next);
    expect(renderer.root.getObjectByName(ringName)).toBe(ring);
    expect(renderer.root.getObjectByName(selectionName)).toBe(marker);
    expect(ring.material.uniforms.conditional.value).toBe(0);
    expect([ring.userData.spotId, marker.userData.spotId]).toEqual([next.id, next.id]);
    renderer.setVisible(false);
    expect([ring.visible, marker.visible]).toEqual([false, false]);
    draw(next);
    renderer.setVisible(true);
    expect([ring.visible, marker.visible]).toEqual([false, false]);
    draw(coverage);
    renderer.setDefenses([record]);
    expect([ring.visible, marker.visible]).toEqual([false, false]);
    draw(coverage);
    draw(null);
    expect([ring.visible, marker.visible]).toEqual([false, false]);
    expect(captain.visible).toBe(true);
    renderer.dispose();
    renderer.dispose();
    expect([...release.values()]).toEqual(resources.map(() => 1));
  });
  it.each([false, true])('throws fire bombs without a muzzle flash or bloom (reduced motion: %s)', reducedMotion => {
    const blooms = [], scene = new THREE.Scene(), shared = atlas();
    scene.userData.characterScale = 1.4;
    const renderer = createWaveRenderer({scene, atlas: shared, reducedMotion: () => reducedMotion, fx: () => ({bloom: (...args) => blooms.push(args)})});
    renderer.events([{type: 'captain_fired', weapon: 'fire_bombs', t: 1, impactAt: 2, by: 'me', x: 2, z: 3, toX: 8, toZ: -2}]);
    renderer.update({state: {ships: [], walls: [], towers: [], fog: 0, sight: 28}, simTime: 1, dt: .01});
    expect(blooms).toEqual([]);
    const air = renderer.root.children.find(item => item.name === 'pirates:air'), uv = air.geometry.getAttribute('iUv').array;
    const flash = shared.rects['fx-musket-flash'];
    for (let i = 0; i < air.geometry.instanceCount; i++)
      expect(Math.min(uv[i * 4], uv[i * 4 + 2])).not.toBeCloseTo((flash.x + .01) / shared.width, 6);
    expect(renderer.stats().shells).toBe(1);
    for (const progress of [0, .5]) {
      renderer.update({state: {ships: [], walls: [], towers: [], fog: 0, sight: 28}, simTime: 1 + progress, dt: .01});
      const ball = shared.rects['pirate-cannonball'], positions = air.geometry.getAttribute('iPos').array;
      const ballIndex = Array.from({length: air.geometry.instanceCount}, (_, i) => i)
        .find(i => Math.abs(Math.min(uv[i * 4], uv[i * 4 + 2]) - (ball.x + .01) / shared.width) < 1e-6);
      expect(ballIndex).toBeDefined();
      // The hand offset is a display distance, added after projecting the logical flight.
      expect(positions[ballIndex * 4]).toBeCloseTo(projectGround(2 + 6 * progress, 3 - 5 * progress).x + .6 * 1.4 * (1 - progress));
    }
    renderer.dispose();
  });

  it('keeps standard cannon wakes on the projected arc and leaves only the core under reduced motion', () => {
    const scene = new THREE.Scene(), pack = packAtlas();
    let reduced = false;
    const renderer = createWaveRenderer({ scene, atlas: { texture: new THREE.Texture(), ...pack },
      reducedMotion: () => reduced, fx: () => null });
    const air = renderer.root.getObjectByName('pirates:air').geometry;
    const data = (name, index) => [...air.getAttribute(name).array.slice(index * 4, (index + 1) * 4)];
    const uvOf = (name, index) => (pack.rects[name].x + .01) / pack.width - data('iUv', index)[0];
    const state = { ships: [], boarders: [], walls: [], towers: [] };
    const path = { x: 4, z: 7, toX: 13, toZ: -5, t: 0, impactAt: 1, hit: true };
    const point = progress => projectGround(path.x + (path.toX - path.x) * progress, path.z + (path.toZ - path.z) * progress);
    const height = (p, enemy) => (enemy ? .8 : 1.2) + 4 * 15 * (enemy ? .03 : .07) * p * (1 - p);

    function testShot(enemy, from) {
      renderer.events([{ ...path, t: from, impactAt: from + 1, type: enemy ? 'ship_fired' : 'cannon_fired',
        cannonId: 'c', shipId: 's', target: 'heart' }]);
      renderer.update({ state, simTime: from + .5 });
      expect(air.instanceCount).toBe(4); // Two trail segments, the ball and its shadow.
      expect(uvOf('pirate-cannonball', 2)).toBeCloseTo(0, 6);
      const [x, y] = data('iPos', 2), [nearX, nearY, angle] = data('iPos', 0), [farX, farY] = data('iPos', 1);
      expect(x).toBeCloseTo(point(.5).x);
      expect(y).toBeCloseTo(point(.5).y + height(.5, enemy));
      expect(nearX).toBeCloseTo(x);
      expect(nearY).toBeCloseTo(y);
      const progress = .5 * (farX - point(0).x) / (x - point(0).x);
      expect(progress).toBeLessThan(.5);
      expect(farY).toBeCloseTo(point(progress).y + height(progress, enemy));
      expect(angle).toBeCloseTo(Math.atan2(y - farY, x - farX) - Math.PI / 2);
      const [width, length] = data('iSize', 0), [backWidth, backLength] = data('iSize', 1);
      expect(width).toBeGreaterThan(backWidth);
      expect(Math.max(length, backLength)).toBeLessThanOrEqual(1);
      const tint = data('iTint', 0), coreLight = air.getAttribute('iFlash').array[2];
      expect(coreLight).toBeGreaterThan(0);

      reduced = true;
      renderer.update({ state, simTime: from + .5 });
      expect(air.instanceCount).toBe(1);
      expect(uvOf('pirate-cannonball', 0)).toBeCloseTo(0, 6);
      expect(data('iPos', 0)[1]).toBeCloseTo(point(.5).y + .8);
      expect(air.getAttribute('iFlash').array[0]).toBe(coreLight);
      renderer.update({ state, simTime: from + 1 });
      expect(air.instanceCount).toBe(0);
      reduced = false;
      return tint;
    }

    const islandTint = testShot(false, 0);
    // Roll a specialist projectile through the pool before a normal ship shot reuses the entry.
    renderer.events([{ ...path, type: 'culverin_fired', towerId: 'c', t: 2, impactAt: 3 }]);
    renderer.update({ state, simTime: 3 });
    const shipTint = testShot(true, 4);
    expect(shipTint[1]).toBeLessThan(islandTint[1]); // Incoming fire has the copper wake.
    renderer.dispose();
  });

  it('shows damaged walls and zero or tiny-positive tower HP only in recovery v1', () => {
    const scene = new THREE.Scene(), renderer = createWaveRenderer({ scene, atlas: atlas(), defenses: DEFENSES, recoveryV1: true, fx: () => null });
    const state = { time: 0, ships: [], boarders: [], walls: [{ id: 'wall_1', x: 0, z: 1, hp: 0, maxHp: 60, broken: true }],
      towers: [{ id: 'cannon_1', x: 1, z: 1, hp: 0.00008, maxHp: 80, broken: false }] };
    renderer.update({ state, simTime: 0, dt: 0 });
    const damaged = renderer.stats().instances;
    expect(damaged).toBeGreaterThan(0); // Wall ruin and a one-unit-positive cannon each get a readable mark.
    renderer.update({ state: { ...state, walls: [{ ...state.walls[0], hp: 60, broken: false }],
      towers: [{ ...state.towers[0], hp: 80 }] }, simTime: 0, dt: 0 });
    expect(renderer.stats().instances).toBeLessThan(damaged);
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
    expect(xs[0]).toBeCloseTo(projectGround(3, 0).x + MUSKET.muzzleX * 1.4 + .3);
    expect(xs[1]).toBeCloseTo(projectGround(10, 5).x + MUSKET.muzzleX * 1.4 + .3);
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
    expect(bloom[0]).toBe('bloom'); expect(bloom[1]).toBeCloseTo(projectGround(3, 0).x + MUSKET.muzzleX * 1.4);
    expect(benRing).toEqual(['ring', projectGround(10, 5).x]);
    expect(loneRing).toEqual(['ring', projectGround(-4, 5).x]); // no figure: same logical captain, projected feet
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
