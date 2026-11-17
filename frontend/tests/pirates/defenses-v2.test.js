// The second wave of defenses (T43, decision D048 proposed; specs/T43-new-defenses.md): the culverin's stats as
// data the sim can read, the cards and the server's file in step, the feature flag defenses_v2 hiding it while it
// is off, and its cartoon drawings (registered, in the cannon's box, one picture per level and per firing frame).
// The culverin in the battle itself (sim.js, behind the wave rule defenses_v2) is tests/pirates/culverin.test.js.
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
  it('is the table the sim fights with (wired in by T43\'s integration step; tests/pirates/culverin.test.js)', () => {
    expect(CONFIG.levels.culverin).toEqual(C.levels.map(({damage, range, reload}) => ({damage, range, reload})));
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
    expect(towerKinds({flags: {islands: true}})).toEqual(['cannon', 'mortar', 'harpoon', 'swivel']);
    expect(towerKinds({flags: {defenses_v2: true}})).toEqual(['cannon', 'mortar', 'harpoon', 'swivel', 'culverin']);
    // Pirate Point never gets it.
    expect(towerKinds({flags: {defenses_v2: true}, point: true})).toBe(POINT_TOWER_KINDS);
  });
  it('keeps today\'s build card free of it, even when a server lists it on a spot', () => {
    const spot = {id: 'cannon_5', kind: 'cannon', kinds: ['cannon', 'mortar', 'harpoon', 'culverin'], built: false, level: 0, cost: 30};
    const unlocks = readUnlocks({unlocks: {wave: 30, unlocked: ['culverin:1', 'cannon:1', 'mortar:1', 'harpoon:1'], locked: {}}});
    const card = buildCardModel({spotId: 'cannon_5', slot: 'tower', spot, coins: 5000, unlocks});
    expect(card.mode).toBe('choose');
    expect(card.choices.map(choice => choice.kind)).toEqual(['cannon', 'mortar', 'harpoon', 'swivel']);
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

// The integration step (specs/T43-new-defenses.md "Sim wiring note", item 12): the card, the island, the wave's
// renderer and the dev fake know the culverin, and each shows it only where the flag (or the wave's rule) says so.
describe('the culverin outside the sim', () => {
  it('is a build choice of an island tower spot while the flag is on, locked until its wave', () => {
    const spot = {id: 'cannon_5', kind: 'cannon', kinds: ['cannon', 'mortar', 'harpoon', 'culverin'], built: false, level: 0, cost: 30};
    const on = {defenses_v2: true};
    const open = buildCardModel({spotId: 'cannon_5', slot: 'tower', spot, coins: 5000, flags: on,
      unlocks: readUnlocks({unlocks: {wave: 30, unlocked: ['culverin:1', 'cannon:1', 'mortar:1', 'harpoon:1'], locked: {}}})});
    expect(open.choices.map(choice => choice.kind)).toEqual(['cannon', 'mortar', 'harpoon', 'swivel', 'culverin']);
    expect(open.choices[4]).toMatchObject({name: 'Culverin', line: CULVERIN_CARD.line, price: '🪙 80', disabled: false});
    const early = buildCardModel({spotId: 'cannon_5', slot: 'tower', spot, coins: 5000, flags: on, unlocks: readUnlocks({waveBest: 3})});
    expect(early.choices[4]).toMatchObject({kind: 'culverin', disabled: true, locked: true});
    expect(early.choices[4].reason).toContain('15');
    // A visitor's card reads the friend's island by its best won wave alone (index.js islandUnlocks): the culverin
    // opens there with that island's waves too, as the server allows it.
    const visit = wave => buildCardModel({spotId: 'cannon_5', slot: 'tower', spot, coins: 5000, flags: on, visitor: true, unlocks: readUnlocks({waveBest: wave})});
    expect(visit(14).choices[4]).toMatchObject({kind: 'culverin', disabled: true, reason: 'Opens after wave 15.'});
    expect(visit(15).choices[4]).toMatchObject({kind: 'culverin', disabled: false, reason: ''});
    expect([15, 20, 30].map(wave => readUnlocks({waveBest: wave}).levels.culverin)).toEqual([3, 4, 5]);
    // Pirate Point never offers it.
    const point = buildCardModel({spotId: 'pp_tower_1', slot: 'tower', spot: {...spot, id: 'pp_tower_1'}, coins: 5000, flags: on, point: true});
    expect(point.choices.map(choice => choice.kind)).toEqual(['cannon', 'mortar']);
    // A built culverin shows its level, its stats and the next one.
    const built = buildCardModel({spotId: 'cannon_5', slot: 'tower', spot: {...spot, kind: 'culverin', built: true, level: 1, upgradeCost: 160}, coins: 5000, flags: on,
      unlocks: readUnlocks({unlocks: {wave: 30, unlocked: ['culverin:1', 'culverin:2'], locked: {}}})});
    expect(built).toMatchObject({mode: 'upgrade', title: 'Culverin', maxLevel: 5});
    expect(built.upgrade.stats).toBe('Damage 30 → 42 · Range 44 → 46');
  });
  it('has its own frames on the wave screen (a cannon stands in on a pixel atlas)', async () => {
    const {CULVERIN_IDS, towerFrame} = await import('../../src/pirates/render.js');
    const all = () => true, none = id => !id.includes('culverin');
    expect(towerFrame('culverin', 3, false, all)).toBe('island-culverin-l3');
    expect(towerFrame('culverin', 1, true, all)).toBe('island-culverin-fire');
    expect(towerFrame('culverin', 2, false, all, 'damaged')).toBe('island-culverin-l2-damaged');
    expect(towerFrame('culverin', 5, false, all, 'broken')).toBe('island-culverin-l5-broken');
    expect(towerFrame('culverin', 2, false, none)).toBe(towerFrame('cannon', 2, false, none));
    expect(CULVERIN_IDS).toEqual([...CULVERIN_ART.levels, ...CULVERIN_ART.fire, CULVERIN_ART.shot]);
  });
  it('stands on the island with its level art and pips, hidden in a battle like every tower', async () => {
    const {LEVEL_ART, buildingArt, pipCount} = await import('../../src/island/world.js');
    expect(LEVEL_ART.culverin).toEqual(CULVERIN_ART.levels);
    expect(buildingArt('culverin', 4)).toBe('island-culverin-l4');
    expect(pipCount('culverin', 1)).toBe(1);
  });
  it('keeps a saved culverin upgradeable with the catalogue flag off', () => {
    const islandAnswer = {
      waveBest: 40,
      unlocks: {wave: 40, unlocked: ['culverin:1', 'culverin:2', 'culverin:3', 'culverin:4', 'culverin:5'], locked: {}},
      spots: [
        {id: 'cannon_11', kind: 'culverin', kinds: ['cannon', 'mortar', 'harpoon', 'swivel', 'culverin'], built: true, level: 4, upgradeCost: 640},
        {id: 'cannon_7', kind: 'cannon', kinds: ['cannon', 'mortar', 'harpoon', 'swivel'], built: false, level: 0, cost: 30},
      ],
    };
    const recovery = (hpUnits, repairWindow = 'between_waves') => ({
      recoveryVersion: 1, repairWindow, structures: [{spot: 'cannon_11', hpUnits}],
    });
    const card = state => buildCardModel({
      spotId: 'cannon_11', slot: 'tower', spot: islandAnswer.spots[0], coins: 5000,
      flags: {defenses_v2: false}, unlocks: readUnlocks(islandAnswer),
      campaign: {wave: 40, open: new Set(), research: {done: new Set(), tiers: {}}},
      recoveryState: state, recoveryStatus: 'ready', recoveryVersion: 1,
    });

    expect(card(recovery(1_000_000))).toMatchObject({mode: 'upgrade', disabled: false, upgrade: {label: 'Level 5 · 🪙 640'}});
    expect(card(recovery(500_000))).toMatchObject({disabled: true, reason: 'Repair to full before an upgrade.'});
    expect(card(recovery(1_000_000, 'reserved_wave'))).toMatchObject({disabled: true, reason: 'Upgrades are available between waves.'});
    const empty = buildCardModel({spotId: 'cannon_7', slot: 'tower', spot: islandAnswer.spots[1], coins: 5000,
      flags: {defenses_v2: false}, unlocks: readUnlocks(islandAnswer)});
    expect(empty.choices.map(choice => choice.kind)).not.toContain('culverin');
  });
  it('is in the dev fake only with ?fakeflags=defenses_v2, and its waves then carry the rule', async () => {
    const {createFakeIslandApi} = await import('../../src/pirates/fake-api.js');
    const off = createFakeIslandApi(), on = createFakeIslandApi({flags: {defenses_v2: true}});
    const before = await off.island();
    expect(before.spots.find(item => item.id === 'cannon_1').kinds).toEqual(['cannon', 'mortar', 'harpoon', 'swivel']);
    expect(before.prices.kinds).not.toHaveProperty('culverin');
    expect(before.unlocks.unlocked.some(id => id.startsWith('culverin'))).toBe(false);
    await expect(off.build({spot: 'cannon_1', kind: 'culverin', actionUid: 'c-off'})).rejects.toMatchObject({status: 422});
    expect((await off.startWave({where: 'own', actionUid: 'w-off'})).rules).toBeUndefined();
    const answer = await on.island();
    expect(answer.spots.find(item => item.id === 'cannon_1').kinds).toEqual(['cannon', 'mortar', 'harpoon', 'swivel', 'culverin']);
    expect(answer.prices.kinds.culverin).toEqual(CULVERIN_CARD.price);
    const built = await on.build({spot: 'cannon_1', kind: 'culverin', actionUid: 'c-on'});
    expect(built.spots.find(item => item.id === 'cannon_1')).toMatchObject({kind: 'culverin', built: true, level: 1});
    expect((await on.startWave({where: 'own', actionUid: 'w-on'})).rules).toEqual(['defenses_v2']);
  });
});
