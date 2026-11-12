// The tower tiers (docs/GAME-V3.md §4.1): levels 4 and 5 of the cannon, the mortar, the wall and the watchtower.
// One price list for the server and the browser: backend/content/islands.json (the server's catalogue) and
// src/island/td-rules.js (the cards); one stat table for the cards and the sim (CONFIG.levels). These tests keep
// the three equal, and the level art and pips in step with the levels.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {CONFIG} from '../../src/pirates/sim.js';
import {BUILDINGS, maxLevel, statLine, unlockWave} from '../../src/island/td-rules.js';
import {LEVEL_ART, PIP_ART, PIP_TIER_ART, buildingArt, pipArt, pipCount} from '../../src/island/world.js';
import {islandFrame} from '../../src/art/registry.js';
import {TIER_ART, levelArt} from '../../src/pixel/pirate-catalog.js';

const islands = JSON.parse(readFileSync(new URL('../../../backend/content/islands.json', import.meta.url), 'utf8'));
const TOWERS = ['wall', 'cannon', 'mortar', 'watchtower'];

describe('tower levels 4 and 5', () => {
  it('cost the same in islands.json and on the cards', () => {
    for (const {kind, prices} of islands.kinds) expect(BUILDINGS[kind].price, kind).toEqual(prices);
    for (const kind of TOWERS) expect(maxLevel(kind), kind).toBe(5);
    expect(maxLevel('house')).toBe(2);
    expect(BUILDINGS.mortar.price).toEqual([60, 120, 240, 480, 960]);
  });
  it('show on the cards the numbers the sim fights with', () => {
    for (const kind of ['cannon', 'mortar']) {
      expect(BUILDINGS[kind].stats).toEqual(CONFIG.levels[kind].map(({damage, range}) => ({damage, range})));
    }
    expect(BUILDINGS.wall.stats).toEqual(CONFIG.levels.wall);
    expect(BUILDINGS.watchtower.stats).toEqual(CONFIG.levels.watchtower.map(({range, boost}) => ({range, boost: Math.round((boost - 1) * 100)})));
    expect(statLine('watchtower', 2, 3)).toBe('Range +12 → +14 · Tower damage +0% → +5%');
    expect(statLine('watchtower', 1, 2)).toBe('Range +8 → +12');
    expect(statLine('wall', 4, 5)).toBe('Strength 300 → 420');
  });
  it('open after waves 12, 15 and 20, in order', () => {
    expect(TOWERS.map(kind => [unlockWave({kind, level: 4}), unlockWave({kind, level: 5})])).toEqual([[12, 20], [12, 20], [15, 20], [15, 20]]);
    expect(unlockWave({kind: 'watchtower', level: 3})).toBe(12);
    // Every level is dearer than the one before.
    for (const kind of TOWERS) for (let n = 1; n < 5; n++) expect(BUILDINGS[kind].price[n]).toBeGreaterThan(BUILDINGS[kind].price[n - 1]);
  });
  it('are paid by the loot of the late waves without the loot running away (islands.json loot)', () => {
    const {base, perWave, lateFrom, latePerWave} = islands.loot;
    const loot = n => (n <= lateFrom ? base + perWave * n : base + perWave * lateFrom + latePerWave * (n - lateFrom));
    const up45 = kind => BUILDINGS[kind].price[3] + BUILDINGS[kind].price[4];
    // One player's plain loot of a wave: 🪙 165 at 14, 245 at 22, 405 at 50, 601 at 99 (boss waves pay twice).
    expect([14, 22, 50, 99].map(loot)).toEqual([165, 245, 405, 601]);
    // Levels 4 and 5 of a mortar (the dearest, 🪙 1440) take one player about four waves at 50, under three at 99;
    // a level-4 cannon about one wave when it opens.
    expect(up45('mortar') / loot(50)).toBeGreaterThan(3); expect(up45('mortar') / loot(50)).toBeLessThan(4);
    expect(up45('mortar') / loot(99)).toBeLessThan(3);
    expect(BUILDINGS.cannon.price[3] / loot(13)).toBeLessThan(1.7);
    // The whole island's levels 4 and 5 (🪙 11 200) cost one player's loot of waves 12 to about 40; six captains share it.
    const island = 4 * up45('cannon') + 3 * up45('mortar') + 12 * up45('wall') + BUILDINGS.watchtower.price.slice(2).reduce((a, b) => a + b, 0);
    expect(island).toBe(11200);
    // The loot grows by 4 a wave from 30 on: wave 99 pays less than 1.5 times wave 50.
    expect(loot(99) / loot(50)).toBeLessThan(1.5);
  });
  it('look their own: gold trim and a banner at 4 and 5, gold stars over them', () => {
    for (const kind of ['wall', 'cannon', 'mortar']) {
      expect([1, 2, 3, 4, 5].map(level => levelArt(kind, level))).toEqual([...LEVEL_ART[kind].slice(0, 3), ...TIER_ART[kind]]);
      expect(new Set([3, 4, 5].map(level => buildingArt(kind, level))).size).toBe(3);
    }
    expect([2, 3, 4, 5].map(level => buildingArt('watchtower', level))).toEqual(['island-watchtower', 'island-watchtower', 'island-watchtower-l4', 'island-watchtower-l5']);
    for (const id of [...Object.values(TIER_ART).flat(), 'island-watchtower-l4', 'island-watchtower-l5', PIP_TIER_ART]) expect(islandFrame(id), id).not.toBeNull();
    expect([1, 2, 3, 4, 5].map(level => pipCount('cannon', level))).toEqual([1, 2, 3, 4, 5]);
    expect([1, 3, 4, 5].map(level => pipArt(level))).toEqual([PIP_ART, PIP_ART, PIP_TIER_ART, PIP_TIER_ART]);
  });
});
