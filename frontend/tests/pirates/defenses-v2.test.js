// The second wave of defenses (T43, decision D048 proposed; specs/T43-new-defenses.md): the culverin's stats as
// data the sim can read, the cards and the server's file in step, the feature flag defenses_v2 hiding it while it
// is off, and its cartoon drawings (registered, in the cannon's box, one picture per level and per firing frame).
// sim.js is not touched by T43's prep stage, so nothing here runs a wave with a culverin yet.
import {readFileSync} from 'node:fs';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CONFIG} from '../../src/pirates/sim.js';
import {DEFENSES_V2, DEFENSE_V2_KINDS} from '../../src/pirates/defenses-v2.js';
import {CULVERIN_CARD, DEFENSES_V2_FLAG, defensesV2On, towerKinds} from '../../src/island/defenses-v2.js';
import {POINT_TOWER_KINDS, SLOT_KINDS, readUnlocks} from '../../src/island/td-rules.js';
import {buildCardModel} from '../../src/island/card-model.js';
import {CULVERIN_ART, defensesV2Frames} from '../../src/art/defenses-v2.js';
import {hasCartoon, islandFrame} from '../../src/art/registry.js';

const file = JSON.parse(readFileSync(new URL('../../../backend/content/defenses_v2.json', import.meta.url), 'utf8'));
const islands = JSON.parse(readFileSync(new URL('../../../backend/content/islands.json', import.meta.url), 'utf8'));
const C = DEFENSES_V2.culverin;
const dps = ({damage, reload}) => damage / reload;

describe('the culverin as data', () => {
  it('has five rising levels in the units of CONFIG.levels', () => {
    expect(DEFENSE_V2_KINDS).toEqual(['culverin']);
    expect(C.levels).toHaveLength(5);
    for (const key of ['damage', 'range']) {
      const values = C.levels.map(level => level[key]);
      expect(values, key).toEqual([...values].sort((a, b) => a - b));
      expect(new Set(values).size, key).toBe(5);
    }
    const reloads = C.levels.map(level => level.reload);
    expect(reloads).toEqual([...reloads].sort((a, b) => b - a));
    expect(C.levels.every(level => Object.keys(level).sort().join() === 'damage,range,reload')).toBe(true);
    expect([C.minRange, C.shotSpeed, C.firstReload, C.hpShare].every(Number.isFinite)).toBe(true);
    expect(C.priority).toEqual(['gunboat', 'barge']);
    expect([C.boarders, C.watchtowerRange, C.gunner, C.watchtowerBoost]).toEqual([false, false, false, true]);
  });
  it('is a long reach, not a better cannon: less damage a second, more range than any tower', () => {
    C.levels.forEach((level, i) => {
      expect(dps(level), `level ${i + 1}`).toBeLessThan(dps(CONFIG.levels.cannon[i]) * 1.15);
      expect(level.range, `level ${i + 1}`).toBeGreaterThan(Math.max(CONFIG.levels.mortar[i].range, CONFIG.levels.cannon[i].range, CONFIG.levels.harpoon[i].range));
    });
    // It reaches a gunboat that anchors at the gunboat's own range from the nearest tower.
    expect(C.levels[0].range).toBeGreaterThan(CONFIG.gunboat.range);
    // Ship kinds it hunts first exist (the barge is the siege-barge event's ship).
    expect(Object.hasOwn(CONFIG.ships, 'gunboat')).toBe(true);
    // Level 3 sinks a wave-30 gunboat (hp 20 x the curve: 1 + 0.07 x 26) in one shot.
    expect(C.levels[2].damage).toBeGreaterThanOrEqual(CONFIG.ships.gunboat.hp * (1 + 0.07 * 26));
  });
  it('is not part of the running game yet: the sim does not know the kind', () => {
    expect(Object.hasOwn(CONFIG.levels, 'culverin')).toBe(false);
  });
});

describe('the culverin on the cards and on the server', () => {
  it('shares prices, waves and its line with backend/content/defenses_v2.json', () => {
    const [entry] = file.kinds;
    expect(entry.kind).toBe('culverin');
    expect(CULVERIN_CARD.name).toBe(entry.name);
    expect(CULVERIN_CARD.line).toBe(entry.line);
    expect(CULVERIN_CARD.price).toEqual(entry.prices);
    expect(CULVERIN_CARD.levelWaves).toEqual(entry.levelWaves);
    expect(CULVERIN_CARD.stats).toEqual(C.levels.map(({damage, range}) => ({damage, range})));
    expect(entry.spots).toEqual(islands.spots.filter(spot => spot.kinds.includes('cannon')).map(spot => spot.id));
  });
  it('is not in the live islands.json or the browser campaign', () => {
    expect(islands.kinds.map(kind => kind.kind)).not.toContain('culverin');
    const campaign = readFileSync(new URL('../../src/campaign/campaign.json', import.meta.url), 'utf8');
    expect(campaign).not.toContain('culverin');
  });
});

describe('the flag defenses_v2 hides the culverin while it is off', () => {
  it('is on only when the server says exactly true', () => {
    expect(DEFENSES_V2_FLAG).toBe('defenses_v2');
    for (const flags of [undefined, null, {}, {defenses_v2: false}, {defenses_v2: 'true'}, {defenses_v2: 1}]) expect(defensesV2On(flags)).toBe(false);
    expect(defensesV2On({defenses_v2: true})).toBe(true);
  });
  it('offers the tower spot exactly what it offered before, unless the flag is on', () => {
    expect(towerKinds()).toBe(SLOT_KINDS.tower);
    expect(towerKinds({flags: {islands: true}})).toEqual(['cannon', 'mortar', 'harpoon']);
    expect(towerKinds({flags: {defenses_v2: true}})).toEqual(['cannon', 'mortar', 'harpoon', 'culverin']);
    // Pirate Point never gets it.
    expect(towerKinds({flags: {defenses_v2: true}, point: true})).toBe(POINT_TOWER_KINDS);
  });
  it('keeps today\'s build card free of it, even when a server lists it on a spot', () => {
    const spot = {id: 'cannon_5', kind: 'cannon', kinds: ['cannon', 'mortar', 'harpoon', 'culverin'], built: false, level: 0, cost: 30};
    const unlocks = readUnlocks({unlocks: {wave: 30, unlocked: ['culverin:1', 'cannon:1', 'mortar:1', 'harpoon:1'], locked: {}}});
    const card = buildCardModel({spotId: 'cannon_5', slot: 'tower', spot, coins: 5000, unlocks});
    expect(card.mode).toBe('choose');
    expect(card.choices.map(choice => choice.kind)).toEqual(['cannon', 'mortar', 'harpoon']);
  });
});

// A recording stand-in for Canvas 2D and Path2D: each frame's drawing becomes a list of calls, so the test can
// check a drawing runs and that the levels are different pictures, without a browser.
class FakePath { constructor() { this.ops = []; } }
for (const op of ['moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'closePath', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'addPath'])
  FakePath.prototype[op] = function (...args) { this.ops.push([op, ...args.map(arg => (arg instanceof FakePath ? arg.ops.length : arg))]); };
function fakeContext() {
  const log = [];
  const record = name => (...args) => log.push([name, ...args.map(arg => (arg instanceof FakePath ? JSON.stringify(arg.ops) : typeof arg === 'object' ? 'obj' : arg))]);
  const context = {log, createLinearGradient: () => ({addColorStop() {}}), createRadialGradient: () => ({addColorStop() {}})};
  for (const name of ['save', 'restore', 'clip', 'fill', 'stroke', 'translate', 'rotate', 'scale', 'beginPath', 'fillRect', 'setTransform']) context[name] = record(name);
  return new Proxy(context, {set(target, key, value) { log.push(['set', key, value]); target[key] = value; return true; }});
}

describe('the culverin drawings', () => {
  let saved;
  beforeAll(() => { saved = globalThis.Path2D; globalThis.Path2D = FakePath; });
  afterAll(() => { globalThis.Path2D = saved; });

  it('are registered for every level, idle, firing, damaged and broken (T33 names), in the cannon\'s box', () => {
    const names = [...CULVERIN_ART.levels, ...CULVERIN_ART.fire, ...CULVERIN_ART.damaged, ...CULVERIN_ART.broken];
    expect(names).toHaveLength(20);
    expect([CULVERIN_ART.damaged[1], CULVERIN_ART.broken[0]]).toEqual(['island-culverin-l2-damaged', 'island-culverin-broken']);
    for (const name of names) {
      expect(hasCartoon(name), name).toBe(true);
      expect(islandFrame(name).slice(0, 3), name).toEqual(islandFrame('island-cannon').slice(0, 3));
    }
    expect(islandFrame(CULVERIN_ART.shot).slice(0, 3)).toEqual([16, 8, 4]);
    expect(Object.keys(defensesV2Frames()).sort()).toEqual([...names, CULVERIN_ART.shot].sort());
  });
  it('draw a different picture for every level and every firing frame', () => {
    const frames = defensesV2Frames(), pictures = new Set();
    for (const [name, [w, h, , draw]] of Object.entries(frames)) {
      const c = fakeContext();
      expect(() => draw(c, {w, h}), name).not.toThrow();
      expect(c.log.filter(([op]) => op === 'fill').length, name).toBeGreaterThan(name.startsWith('fx-') ? 0 : 10);
      pictures.add(JSON.stringify(c.log));
    }
    expect(pictures.size).toBe(Object.keys(frames).length);
  });
});
