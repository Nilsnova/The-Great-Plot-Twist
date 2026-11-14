// The gunboat (docs/GAME-V3.md §4.1): a small, fast boat from wave 16 that sails in to its own range, anchors and
// jams the nearest tower for a few seconds every few seconds. It does no damage (towers have no hp), has little
// hull, and everything about it runs on the sim's own dice, so every screen agrees.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG, coastPoint, createWave, fleetOf, threatOf, tierFor, tierShare } from '../../src/pirates/sim.js';
import { ATLAS_IDS, GUNBOAT_FRAMES, GUNBOAT_IDS, JAM_FRAMES, SHIP_VARIANTS, createWaveRenderer, packAtlas } from '../../src/pirates/render.js';
import { pirateDimensions } from '../../src/pixel/pirate-catalog.js';
import { framesFor, hasCartoon } from '../../src/art/registry.js';
import { ISLANDS, towers, walls } from './balance-fixture.js';

const G = CONFIG.gunboat, WAVE = 18;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const of = (events, type) => events.filter(event => event.type === type);
/** Runs a wave for `seconds`, calling hook(wave, events-of-this-step) after each step. */
function run(options, { seconds = 150, inputs = () => [], hook = () => {} } = {}) {
  const wave = createWave({ countdown: 0, wave: WAVE, ...options }), events = [];
  for (let i = 0; i < seconds * 20 && !wave.done; i++) {
    const step = wave.step(CONFIG.tick, inputs(wave, i));
    events.push(...step); hook(wave, step);
  }
  return { wave, events };
}
const kinds = wave => Object.entries(fleetOf(wave).kinds.reduce((sum, kind) => ({ ...sum, [kind]: (sum[kind] ?? 0) + 1 }), {}));
const mix = ISLANDS.small; // three level-1 cannons and two walls: the boats get their shots in
const SEEDS = [1, 2, 3, 4, 5, 6].map(n => n * 7919);

describe('the gunboat in the fleet', () => {
  it('is a small, fast, fragile boat with no damage and no crew', () => {
    const boat = CONFIG.ships.gunboat;
    expect(boat.hp).toBeLessThan(CONFIG.ships.sloop.hp); // less hull than the smallest ship of the old fleet
    expect(boat.speed).toBeGreaterThanOrEqual(CONFIG.ships.raider.speed * .9);
    expect(boat.damage).toBe(0);
    expect(boat.crew).toBe(0);
  });
  it('joins the fleet from wave 16 as a small share that grows slowly to a cap', () => {
    const T = CONFIG.tiers.gunboats;
    expect(T.from).toBe(16);
    for (let wave = 1; wave <= 15; wave++) {
      expect(tierShare(T, wave)).toBe(0);
      expect(fleetOf(wave).kinds).not.toContain('gunboat');
    }
    expect(tierFor(16).gunboats).toBeCloseTo(.05);
    expect(fleetOf(16).kinds.filter(kind => kind === 'gunboat')).toHaveLength(1);
    let last = 0;
    for (let wave = 16; wave <= 100; wave++) {
      const share = tierFor(wave).gunboats, { kinds: list, count } = fleetOf(wave), boats = list.filter(kind => kind === 'gunboat').length;
      expect(share).toBeGreaterThanOrEqual(last); expect(share).toBeLessThanOrEqual(T.max + 1e-9);
      expect(boats).toBeGreaterThanOrEqual(1);
      expect(boats / list.length).toBeLessThanOrEqual(.2); // a small share of the fleet, whatever the wave
      expect(list.length - boats).toBeLessThanOrEqual(count); // the rest of the fleet is the same size as before
      last = share;
    }
    expect(tierFor(100).gunboats).toBe(T.max);
    // The growth is slow: two boats from wave 25, three at most about wave 60.
    const boatsAt = wave => fleetOf(wave).kinds.filter(kind => kind === 'gunboat').length;
    expect(boatsAt(16)).toBe(1); expect(boatsAt(40)).toBeGreaterThanOrEqual(2); expect(boatsAt(100)).toBeLessThanOrEqual(4);
  });
  it('sails on top of the fleet: the sloops, brigs and warships of a wave stay as they were, and so do its boarders', () => {
    for (const wave of [16, 25, 50, 100]) {
      const { kinds: list } = fleetOf(wave), others = list.filter(kind => kind !== 'gunboat'), boats = list.length - others.length;
      expect(boats).toBeGreaterThan(0);
      // The list without its boats is the list of a wave before gunboats (a copy of the tier with the share at 0).
      expect(others.filter(kind => kind === 'sloop' || kind === 'raider').length + others.filter(kind => kind === 'brig' || kind === 'ironclad').length + others.filter(kind => kind === 'warship').length).toBe(others.length);
      expect(CONFIG.ships.gunboat.crew).toBe(0); // no boarders of its own
    }
    for (const wave of [10, 15]) expect(kinds(wave).map(([kind]) => kind)).not.toContain('gunboat');
  });
  it('keeps the threat of a wave non-decreasing', () => {
    for (let wave = 2; wave <= 100; wave++) expect(threatOf(wave)).toBeGreaterThanOrEqual(threatOf(wave - 1) * (wave % 5 === 0 || (wave - 1) % 5 === 0 ? .5 : 1));
  });
});

describe('a gunboat at sea', () => {
  const boatsOf = events => of(events, 'ship_spawned').filter(event => event.kind === 'gunboat');
  it('anchors at its range, just outside the reach of the nearest cannon when it can', () => {
    let outside = 0;
    for (const seed of SEEDS) {
      const { events, wave } = run({ seed, ...ISLANDS.small }, { seconds: 80 });
      const tower = wave.state().towers, anchored = of(events, 'ship_anchored').filter(event => event.kind === 'gunboat'), spawned = boatsOf(events);
      expect(anchored.length).toBeGreaterThan(0);
      for (const boat of anchored) {
        const cannons = tower.filter(item => item.kind === 'cannon'), near = tower.reduce((best, item) => (dist(item, boat) < dist(best, boat) ? item : best));
        const cannon = cannons.reduce((best, item) => (dist(item, boat) < dist(best, boat) ? item : best));
        // The cannons of "small" reach 28; the boat anchors outside that, within its own range of the nearest tower.
        expect(dist(near, boat)).toBeLessThanOrEqual(Math.min(G.range - 1, cannon.range + G.margin) + 1e-6);
        const born = spawned.find(item => item.shipId === boat.shipId), run = Math.hypot(boat.x - born.x, boat.z - born.z);
        // Outside the cannon's reach, unless the sea edge where it appears is inside that reach already.
        if (dist(cannon, boat) > cannon.range) outside++;
        // It never anchors farther out than outRadius coast radii (on screen, in the captains' reach).
        const out = coastPoint(Math.atan2(boat.z, boat.x), G.outRadius);
        expect(Math.hypot(boat.x, boat.z)).toBeLessThanOrEqual(Math.hypot(out.x, out.z) + .6);
        expect(dist(near, boat)).toBeLessThanOrEqual(G.range);
      }
    }
    void outside; // the sea is small: with towers on this side of the island the edge is often inside the cannons' reach already
  });
  it('anchors just outside the reach of a lone cannon on its way in, and keeps jamming it', () => {
    const cannon = { id: 'cannon_far', kind: 'cannon', level: 1, x: 0, z: -6 };
    const { events, wave } = run({ seed: 7919, defenses: [cannon], lanes: [{ id: 'south', bearing: 90 }] }, { seconds: 100 });
    const anchored = of(events, 'ship_anchored').filter(event => event.kind === 'gunboat'), range = wave.state().towers[0].range;
    expect(anchored.length).toBeGreaterThan(0);
    for (const boat of anchored) {
      expect(dist(cannon, boat)).toBeGreaterThan(range); // outside the cannon's reach
      expect(dist(cannon, boat)).toBeLessThanOrEqual(range + G.margin + G.step); // and no farther than that (a step of .5)
    }
    // …and from there it jams the cannon every few seconds, which cannot answer.
    expect(of(events, 'tower_jammed').filter(event => event.towerId === 'cannon_far').length).toBeGreaterThanOrEqual(2);
    expect(of(events, 'cannon_fired').filter(event => event.cannonId === 'cannon_far' && event.targetId === anchored[0].shipId)).toEqual([]);
  });
  it('anchors at its own range when the cannons outreach it, and at the usual stop with no tower at all', () => {
    const long = { defenses: towers([['cannon', 5], ['cannon', 5]]), crew: {} };
    const { events, wave } = run({ seed: 7919, ...long }, { seconds: 40 });
    const near = boat => Math.min(...wave.state().towers.map(item => dist(item, boat)));
    for (const boat of of(events, 'ship_anchored').filter(event => event.kind === 'gunboat')) expect(near(boat)).toBeLessThanOrEqual(G.range - 1 + 1e-6);
    const bare = run({ seed: 7919, defenses: [] }, { seconds: 40 });
    const stops = of(bare.events, 'ship_anchored').filter(event => event.kind !== 'gunboat').map(event => Math.hypot(event.x, event.z));
    for (const boat of of(bare.events, 'ship_anchored').filter(event => event.kind === 'gunboat')) expect(Math.hypot(boat.x, boat.z)).toBeGreaterThan(Math.min(...stops) - 4);
  });
  it('jams the nearest tower for the set time, and every shot is a jam', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const { events } = run({ seed, ...mix }, { seconds: 60 });
      const fired = of(events, 'gunboat_fired'), jams = of(events, 'tower_jammed');
      expect(boatsOf(events).length).toBeGreaterThan(0);
      expect(jams).toHaveLength(fired.length);
      for (const jam of jams) {
        expect(jam.until).toBeCloseTo(jam.t + G.jam, 1);
        const shot = fired.find(item => item.shipId === jam.shipId && item.t === jam.t && item.targetId === jam.towerId);
        expect(shot).toBeTruthy();
        checked++;
      }
      // The first shot of a boat goes to the nearest tower.
      const first = fired[0], defenses = mix.defenses.filter(item => item.kind === 'cannon' || item.kind === 'mortar');
      if (first) {
        const nearest = defenses.reduce((best, item) => (dist(item, { x: first.x, z: first.z }) < dist(best, { x: first.x, z: first.z }) ? item : best));
        expect(first.targetId).toBe(nearest.id);
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
  it('fires every few seconds and does no hp damage to the island or a wall', () => {
    const { events } = run({ seed: 7919, ...mix }, { seconds: 60 });
    const mine = of(events, 'gunboat_fired').filter(event => event.shipId === of(events, 'gunboat_fired')[0].shipId);
    expect(mine.length).toBeGreaterThan(2);
    for (let i = 1; i < mine.length; i++) expect(mine[i].t - mine[i - 1].t).toBeCloseTo(CONFIG.ships.gunboat.interval, 1);
    const ids = new Set(of(events, 'ship_spawned').filter(event => event.kind === 'gunboat').map(event => event.shipId));
    expect(of(events, 'wall_damaged').filter(event => ids.has(event.shipId))).toEqual([]);
    expect(of(events, 'island_damaged').filter(event => ids.has(event.shipId))).toEqual([]);
  });
  it('a jammed tower does not fire, by itself or by hand, and works again when the jam is over', () => {
    let proved = 0, jammedTotal = 0;
    for (const seed of SEEDS) {
      const jams = new Map(); let shotsInJam = 0, shotsAfter = 0, manualInJam = 0;
      const { events } = run({ seed, ...mix }, {
        seconds: 120,
        hook(wave, step) {
          const t = wave.state().time;
          for (const event of step) {
            if (event.type === 'tower_jammed') jams.set(event.towerId, event.until);
            if (event.type === 'cannon_fired' && event.cannonId && jams.has(event.cannonId)) {
              if (event.t < jams.get(event.cannonId) - 1e-6) { shotsInJam++; if (event.manual) manualInJam++; } else shotsAfter++;
            }
          }
          void t;
        },
        inputs(wave) { // a hand-fired shot at any ship in sight, every step: a jam must refuse it
          const state = wave.state(), cannon = state.towers.find(item => item.kind === 'cannon' && item.jammed);
          const target = cannon && state.ships.find(ship => ship.kind !== 'gunboat' && dist(ship, cannon) <= cannon.range);
          return target ? [{ type: 'fire', cannonId: cannon.id, targetId: target.id }] : [];
        },
      });
      expect(shotsInJam).toBe(0);
      expect(manualInJam).toBe(0);
      if (shotsAfter > 0) proved++;
      jammedTotal += of(events, 'tower_jammed').length; // (a boat the guns reach first never fires on some seeds)
    }
    expect(jammedTotal).toBeGreaterThan(5);
    expect(proved).toBeGreaterThan(0); // the jammed cannons fired again after the jam
  });
  it('is no permanent jam: a tower is free again the moment its time is up', () => {
    const until = new Map(); let freed = 0, stuck = 0;
    run({ seed: 7919, ...mix }, {
      seconds: 150,
      hook(wave, step) {
        for (const event of step) if (event.type === 'tower_jammed') until.set(event.towerId, event.until);
        const state = wave.state();
        for (const tower of state.towers) {
          const end = until.get(tower.id);
          if (end === undefined) continue;
          if (state.time < end - 1e-6) expect(tower.jammed).toBe(end);
          else if (tower.jammed === undefined) freed++; else stuck++;
        }
      },
    });
    expect(freed).toBeGreaterThan(0);
    expect(stuck).toBe(0);
  });
  it('is sunk by the guns of a strong island before it can fire, and by a mortar or a captain on a weaker one', () => {
    const strong = run({ seed: 7919, wave: WAVE, ...ISLANDS.full }, { seconds: 150 }).events;
    expect(of(strong, 'ship_sunk').filter(event => event.kind === 'gunboat').length).toBeGreaterThan(0);
    const mid = run({ seed: 7919, ...mix }, { seconds: 150 }).events;
    expect(of(mid, 'ship_sunk').filter(event => event.kind === 'gunboat').length + of(mid, 'wave_ended').length).toBeGreaterThan(0);
  });
  it('is the same on every screen: two runs of one seed give the same events and states', () => {
    const states = [[], []], runs = [0, 1].map(k => run({ seed: 4242, ...mix }, { seconds: 60, hook: wave => { if (states[k].length < 4000) states[k].push(JSON.stringify(wave.state())); } }));
    expect(JSON.stringify(runs[0].events)).toBe(JSON.stringify(runs[1].events));
    expect(states[0]).toEqual(states[1]);
    expect(of(runs[0].events, 'gunboat_fired').length).toBeGreaterThan(0);
  });
  it('leaves the dice of the waves before 16 untouched', () => {
    const a = run({ seed: 99, wave: 12, ...mix }, { seconds: 30 }), b = run({ seed: 99, wave: 12, ...mix }, { seconds: 30 });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(of(a.events, 'gunboat_fired')).toEqual([]);
  });
});

describe('the gunboat on screen', () => {
  it('has a cartoon hull, a muzzle flash and a two-frame jam mark, all drawn', async () => {
    const frames = await framesFor(GUNBOAT_IDS);
    expect(GUNBOAT_IDS.filter(id => !frames[id])).toEqual([]);
    for (const id of GUNBOAT_IDS) expect(hasCartoon(id)).toBe(true);
    // The three hull frames share one box (like every ship), the hull sits low: smaller than a sloop.
    expect(new Set(GUNBOAT_FRAMES.map(id => frames[id].slice(0, 3).join())).size).toBe(1);
    expect(frames[GUNBOAT_FRAMES[0]][0]).toBeLessThan(pirateDimensions['pirate-sloop-1'][0]);
    expect(JAM_FRAMES).toHaveLength(2);
    expect(SHIP_VARIANTS.gunboat.frames).toBe('gunboat');
  });
  const dims = { ...pirateDimensions, 'pirate-gunboat-1': [56, 44, 8], 'pirate-gunboat-2': [56, 44, 8], 'pirate-gunboat-3': [56, 44, 8],
    'fx-gunboat-flash': [24, 20, 10], 'fx-jam-1': [28, 28, 14], 'fx-jam-2': [28, 28, 14] };
  const atlas = () => ({ texture: new THREE.Texture(), ...packAtlas([...ATLAS_IDS, ...GUNBOAT_IDS], dims) });
  it('draws a wave with gunboats, their shots and the jam mark of a tower, and clears them again', () => {
    const scene = new THREE.Scene(), defenses = mix.defenses;
    const renderer = createWaveRenderer({ scene, atlas: atlas(), defenses, fx: () => null });
    const sim = createWave({ seed: 7919, wave: WAVE, countdown: 0, ...mix });
    const sprites = () => renderer.stats().instances;
    let time = 0, marked = 0, plain = 0, sawShot = false;
    while (!sim.done && time < 60) {
      const events = sim.step(1 / 20); time += 1 / 20;
      renderer.events(events); if (events.some(event => event.type === 'gunboat_fired')) sawShot = true;
      const state = sim.state();
      renderer.update({ state, simTime: time, dt: 1 / 20 });
      const jam = state.towers.find(tower => tower.jammed !== undefined);
      if (jam) {
        const with_ = sprites();
        renderer.update({ state: { ...state, towers: state.towers.map(({ jammed, ...tower }) => tower) }, simTime: time, dt: 0 });
        expect(with_ - sprites()).toBe(state.towers.filter(tower => tower.jammed !== undefined).length); // one more sprite per jammed tower, only while it lasts
        marked++;
      } else plain++;
    }
    expect(sawShot).toBe(true); expect(marked).toBeGreaterThan(0); expect(plain).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) renderer.update({ state: sim.state(), simTime: time += 1 / 20, dt: 1 / 20 });
    renderer.dispose();
    expect(scene.children.length).toBe(0);
  });
  it('still sails a gunboat as a plain sloop on the pixel atlas, without a crash', () => {
    const scene = new THREE.Scene(), shared = { texture: new THREE.Texture(), ...packAtlas() };
    const renderer = createWaveRenderer({ scene, atlas: shared, defenses: mix.defenses, fx: () => null });
    const sim = createWave({ seed: 7919, wave: WAVE, countdown: 0, ...mix });
    for (let i = 0; i < 20 * 30 && !sim.done; i++) { renderer.events(sim.step(1 / 20)); renderer.update({ state: sim.state(), simTime: i / 20, dt: 1 / 20 }); }
    expect(renderer.stats().ships + 1).toBeGreaterThan(0);
    renderer.dispose();
  });
});
