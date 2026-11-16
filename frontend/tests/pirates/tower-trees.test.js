// Tower upgrade trees and the swivel-gun nest (decision D055): the tree data the sim and the cards read, kept equal
// to the server's backend/content/tower_trees.json; the Bloons rule; the sim's numbers with a tree (and exactly the
// old fight without one); the swivel nest fights boarders only, never draws a die, and is a role, not an upgrade.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {CONFIG, createWave} from '../../src/pirates/sim.js';
import {TOWER_TREES, TREE_KINDS, TREE_STEPS, readTree, treeStats, treeStep} from '../../src/pirates/tower-trees.js';
import {TOWER_HEALTH} from '../../src/pirates/tower-health.js';
import {BUILDINGS, SLOT_KINDS, POINT_TOWER_KINDS, unlockWave} from '../../src/island/td-rules.js';
import {waveOf} from '../../src/campaign/index.js';
import {SWIVEL_ART, swivelFrames} from '../../src/art/swivel.js';
import {hasCartoon, islandFrame} from '../../src/art/registry.js';
import {ISLANDS, islandAt, researched, runWave, tiered} from './balance-fixture.js';

const file = JSON.parse(readFileSync(new URL('../../../backend/content/tower_trees.json', import.meta.url), 'utf8'));
const islands = JSON.parse(readFileSync(new URL('../../../backend/content/islands.json', import.meta.url), 'utf8'));

describe('the tree data', () => {
  it('lists the same kinds, prices, path ids and names as the server', () => {
    expect(file.kinds.map(item => item.kind)).toEqual([...TREE_KINDS]);
    expect(file.steps).toEqual([...TREE_STEPS]);
    expect(file.level).toBe(5);
    for (const item of file.kinds) {
      const tree = TOWER_TREES[item.kind];
      expect(tree.prices, item.kind).toEqual(item.prices);
      for (const path of ['a', 'b']) expect({id: tree[path].id, name: tree[path].name}, `${item.kind} ${path}`).toEqual(item[path]);
    }
  });
  it('opens tier 1 after wave 20, tier 2 after 35 and tier 3 after 45, with level 5 of every core kind open by then', () => {
    expect(TREE_STEPS.map(waveOf)).toEqual([20, 35, 45]);
    for (const kind of ['cannon', 'mortar', 'harpoon', 'swivel']) expect(unlockWave({kind, level: 5}), kind).toBeLessThanOrEqual(20);
  });
  it('prices rise steeply, late tiers cost thousands', () => {
    for (const [kind, tree] of Object.entries(TOWER_TREES)) {
      const [one, two, three] = tree.prices, top = BUILDINGS[kind].price.at(-1);
      expect(one, kind).toBeGreaterThan(top);
      expect(two / one, kind).toBeGreaterThan(1.8);
      expect(three / two, kind).toBeGreaterThan(1.8);
      expect(three, kind).toBeGreaterThanOrEqual(3000);
    }
  });
  it('a level-5 shot time matches the sim (the card says "every 0.70 s")', () => {
    for (const [kind, tree] of Object.entries(TOWER_TREES)) expect(tree.shot, kind).toBeCloseTo(CONFIG.levels[kind][4].reload * CONFIG.pace.reload, 6);
  });
  it('path a always fires faster, path b always hits harder, each tier more than the one before', () => {
    for (const kind of TREE_KINDS) {
      const reloads = [0, 1, 2, 3].map(a => treeStats(kind, {a, b: 0}).reload);
      expect(reloads, kind).toEqual([...reloads].sort((p, q) => q - p));
      expect(new Set(reloads).size, kind).toBe(4);
      const power = [0, 1, 2, 3].map(b => { const s = treeStats(kind, {a: 0, b}); return s.damage * s.radius + s.slow + s.seconds + s.pellets; });
      expect(power, kind).toEqual([...power].sort((p, q) => p - q));
      expect(new Set(power).size, kind).toBe(4);
    }
  });
});

describe('the Bloons rule', () => {
  it('one path may reach tier 3, the other stays at tier 1', () => {
    expect(treeStep({a: 0, b: 0}, 'a', 1)).toBe('ok');
    expect(treeStep({a: 0, b: 0}, 'a', 2)).toBe('needs_tier');
    expect(treeStep({a: 1, b: 1}, 'a', 2)).toBe('ok');
    expect(treeStep({a: 2, b: 1}, 'b', 2)).toBe('closed');
    expect(treeStep({a: 2, b: 0}, 'b', 1)).toBe('ok');
    expect(treeStep({a: 3, b: 1}, 'a', 3)).toBe('known');
    expect(readTree('cannon', {a: 2, b: 2})).toBeNull();
    expect(readTree('cannon', {a: 0, b: 0})).toBeNull();
    expect(readTree('wall', {a: 1, b: 0})).toBeNull();
    expect(readTree('cannon', {a: 3, b: 1})).toEqual({a: 3, b: 1});
  });
});

const fingerprint = options => {
  const wave = createWave(options);
  let events = 0, hash = 0;
  while (!wave.done) for (const event of wave.step(.25, [])) { events++; hash = (hash * 31 + event.type.length + Math.round((event.t ?? 0) * 20)) >>> 0; }
  const result = wave.result();
  return {events, hash, hp: result.islandHp, sunk: result.shipsSunk, survived: result.survived};
};
const withTree = (island, tree, kinds = TREE_KINDS) => ({...island, defenses: island.defenses.map(item => (kinds.includes(item.kind) && item.level === 5 ? {...item, tree} : item))});

describe('a tree in the fight', () => {
  const late = researched(islandAt(5));
  it('an empty tree, a tree on a level-4 tower or a broken tree fights exactly as no tree', () => {
    const base = fingerprint({seed: 7919, wave: 40, ...late});
    expect(fingerprint({seed: 7919, wave: 40, ...withTree(late, {a: 0, b: 0})})).toEqual(base);
    expect(fingerprint({seed: 7919, wave: 40, ...withTree(late, {a: 2, b: 2})})).toEqual(base);
    const four = researched(islandAt(4));
    expect(fingerprint({seed: 7919, wave: 30, ...four, defenses: four.defenses.map(item => ({...item, tree: {a: 3, b: 1}}))}))
      .toEqual(fingerprint({seed: 7919, wave: 30, ...four}));
  });
  it('changes the towers by the numbers of the tree', () => {
    const one = [{id: 'cannon_1', kind: 'cannon', level: 5, x: 10, z: -14}];
    const shot = defenses => runWave({seed: 1, wave: 10, defenses}, () => []).events.find(event => event.type === 'cannon_fired');
    const plain = shot(one), hard = shot([{...one[0], tree: {a: 0, b: 3}}]);
    expect(hard.damage).toBeCloseTo(plain.damage * TOWER_TREES.cannon.b.tiers[2].damage, 6);
  });
  it('helps a late island, and the same seed plays the same with a tree', () => {
    const seeds = [1, 2, 3, 4].map(n => n * 7919);
    const hp = island => seeds.reduce((sum, seed) => sum + runWave({seed, wave: 50, ...island}).result.islandHp, 0);
    const top = tiered(islandAt(5)), treed = withTree(top, {a: 3, b: 1});
    expect(hp(treed)).toBeGreaterThan(hp(top));
    expect(fingerprint({seed: 11, wave: 50, ...treed})).toEqual(fingerprint({seed: 11, wave: 50, ...treed}));
  });
});

describe('the swivel-gun nest', () => {
  it('is a tower kind with five rising levels, sold on the island tower spots but not at Pirate Point', () => {
    expect(SLOT_KINDS.tower).toContain('swivel');
    expect(POINT_TOWER_KINDS).not.toContain('swivel');
    expect(islands.kinds.find(item => item.kind === 'swivel').prices).toEqual(BUILDINGS.swivel.price);
    for (const spot of islands.spots.filter(item => item.id.startsWith('cannon_'))) expect(spot.kinds).toContain('swivel');
    for (const spot of islands.piratePointSpots) expect(spot.kinds).not.toContain('swivel');
    BUILDINGS.swivel.stats.forEach((stats, i) => {
      const sim = CONFIG.levels.swivel[i];
      expect({damage: stats.damage, range: stats.range, pellets: stats.pellets}).toEqual({damage: sim.damage, range: sim.range, pellets: sim.pellets});
    });
    expect(unlockWave({kind: 'swivel', level: 1})).toBe(9);
    expect(TOWER_HEALTH.hp.swivel).toHaveLength(5);
  });
  it('shoots boarders only, always hits, and never draws from the random stream', () => {
    const island = {...ISLANDS.mid, defenses: ISLANDS.mid.defenses.map(item => (item.id === 'tower_s1' ? {...item, kind: 'swivel', level: 5} : item))};
    const {events} = runWave({seed: 7919, wave: 10, ...island});
    const shots = events.filter(event => event.type === 'swivel_fired');
    expect(shots.length).toBeGreaterThan(5);
    expect(shots.every(event => String(event.targetId).startsWith('boarder_'))).toBe(true);
    expect(shots.every(event => event.pellets === 3)).toBe(true);
    // The same island with the nest's spot empty draws the same ships and cannon rolls: the fleet does not change.
    const none = {...ISLANDS.mid, defenses: ISLANDS.mid.defenses.filter(item => item.id !== 'tower_s1')};
    const spawned = list => list.filter(event => event.type === 'ship_spawned').map(event => `${event.shipId}:${event.kind}:${event.t}`);
    expect(spawned(events)).toEqual(spawned(runWave({seed: 7919, wave: 10, ...none}).events));
    const scatter = withTree({defenses: island.defenses}, {a: 0, b: 3}, ['swivel']);
    expect(runWave({seed: 7919, wave: 10, ...scatter}).events.find(event => event.type === 'swivel_fired').pellets).toBe(6);
  });
  it('is not a straight upgrade: with two nests instead of two cannons many more boarders get ashore', () => {
    const swap = {...ISLANDS.full, defenses: ISLANDS.full.defenses.map(item => (['tower_s1', 'tower_s2'].includes(item.id) ? {...item, kind: 'swivel'} : item))};
    const landed = island => [1, 2, 3, 4].reduce((sum, n) => sum + runWave({seed: n * 7919, wave: 20, ...island}).events.filter(event => event.type === 'boarder_landed').length, 0);
    expect(landed(swap)).toBeGreaterThan(landed(ISLANDS.full) * 2);
  });
  it('has a drawing per level, idle and firing, in the cannon box, and its damaged and broken states', () => {
    const frames = swivelFrames();
    for (const id of [...SWIVEL_ART.levels, ...SWIVEL_ART.fire, ...SWIVEL_ART.damaged, ...SWIVEL_ART.broken]) {
      expect(hasCartoon(id), id).toBe(true);
      expect(frames[id].slice(0, 3), id).toEqual([48, 32, 5]);
      expect(islandFrame(id), id).toBeTruthy();
    }
    expect(hasCartoon(SWIVEL_ART.shot)).toBe(true);
  });
});
