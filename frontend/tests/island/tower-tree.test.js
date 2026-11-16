// The upgrade tree on a tower's card (D055, src/island/tree-model.js and skill-tree.js drawTowerTree): the trunk is
// the level, two paths of three tiers grow above it, the tile states follow the server's answer (bought, can buy,
// locked with the reason, closed by the Bloons rule), and one detail panel says the numbers and has one button.
// The card in real Chromium: tests/island/tower-tree-dom.test.js.
import {describe, expect, it} from 'vitest';
import {towerTreeModel, stepLine, shortCoins} from '../../src/island/tree-model.js';
import {buildCardModel} from '../../src/island/card-model.js';
import {readUnlocks} from '../../src/island/td-rules.js';

const spot = (level, tree = {a: 0, b: 0}, kind = 'cannon') => ({id: 'cannon_1', kind, built: true, level, cost: 30, upgradeCost: level < 5 ? 240 : null, tree});
const model = (options = {}) => towerTreeModel({kind: 'cannon', spot: spot(5), coins: 10000, wave: 50, ...options});
const states = m => Object.fromEntries(m.tiers.flatMap(tier => tier.nodes).map(item => [item.id, item.state]));

describe('the tree model', () => {
  it('is only for the tower kinds with a tree, and only once built', () => {
    expect(towerTreeModel({kind: 'wall', spot: {...spot(5), kind: 'wall'}})).toBeNull();
    expect(towerTreeModel({kind: 'watchtower', spot: spot(5)})).toBeNull();
    expect(towerTreeModel({kind: 'cannon', spot: {...spot(1), built: false}})).toBeNull();
    for (const kind of ['cannon', 'mortar', 'harpoon', 'culverin', 'swivel']) expect(towerTreeModel({kind, spot: spot(5, undefined, kind)}), kind).not.toBeNull();
  });
  it('below level 5 the trunk upgrades, the paths are locked behind it', () => {
    const m = towerTreeModel({kind: 'cannon', spot: spot(3), coins: 500, wave: 50});
    expect(m.picked).toBe('level');
    expect(m.detail).toMatchObject({name: 'Level 4', button: 'Upgrade · 🪙 240', disabled: false, action: {type: 'upgrade'}});
    expect(m.detail.line).toMatch(/Damage 24 → 30/);
    expect(states(m)).toMatchObject({level: 'ready', a1: 'locked', b1: 'locked'});
  });
  it('at level 5 both tier-1 tiles glow, and the first one is picked with its numbers', () => {
    const m = model();
    expect(states(m)).toEqual({level: 'learned', a1: 'ready', b1: 'ready', a2: 'locked', b2: 'locked', a3: 'locked', b3: 'locked'});
    expect(m.picked).toBe('a1');
    expect(m.detail).toMatchObject({name: 'Drill I', button: 'Buy · 🪙 1,000', disabled: false, action: {type: 'tree', path: 'a', tier: 1}});
    expect(m.detail.line).toBe('Every 0.70 s → 0.64 s');
    expect(stepLine('cannon', 'b', 0, 1)).toBe('Damage 38 → 42');
    expect(stepLine('mortar', 'b', 1, 2)).toMatch(/^Damage \d+ → \d+ · Blast 4.4 → 4.8$/);
    expect(stepLine('swivel', 'b', 2, 3)).toBe('Pellets 5 → 6');
  });
  it('one path past tier 1 closes the other above tier 1 (faded ✕)', () => {
    const m = model({spot: spot(5, {a: 2, b: 1})});
    expect(states(m)).toEqual({level: 'learned', a1: 'learned', b1: 'learned', a2: 'learned', b2: 'closed', a3: 'ready', b3: 'closed'});
    const closed = model({spot: spot(5, {a: 2, b: 1}), picked: 'b2'});
    expect(closed.detail).toMatchObject({state: 'closed', disabled: true, reason: 'Closed: Drill is past tier 1.'});
  });
  it('a tier waits for its wave, and coins are checked last', () => {
    const early = model({spot: spot(5, {a: 1, b: 0}), wave: 30, picked: 'a2'});
    expect(early.detail).toMatchObject({state: 'locked', reason: 'Opens after wave 35.', disabled: true});
    const poor = model({coins: 400});
    expect(poor.detail).toMatchObject({state: 'ready', reason: 'Need 🪙 600 more.', disabled: true});
  });
  it('a level-5 card shows the tree in its build model; Pirate Point gets none', () => {
    const answer = {waveBest: 50, unlocks: {wave: 50}};
    const card = buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: spot(5), coins: 2000, unlocks: readUnlocks(answer), campaign: {wave: 50, open: new Set(), research: {done: new Set(), tiers: {}}}});
    expect(card.tree?.picked).toBe('a1');
    expect(buildCardModel({spotId: 'pp_tower_1', slot: 'tower', spot: spot(5), coins: 2000, point: true}).tree).toBeNull();
  });
  it('short prices fit a tile', () => {
    expect([800, 1000, 2200, 4800].map(shortCoins)).toEqual(['800', '1k', '2.2k', '4.8k']);
  });
});
