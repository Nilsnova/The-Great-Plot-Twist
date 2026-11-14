// T33 art prep: every tower kind draws in every damage state, the state defaults to intact (today's
// look), and the new frames sit in the island registry with the towers' 48 x 32 box. No canvas in node, so a
// recording stand-in context counts what each drawing paints.
import {beforeAll, describe, expect, it} from 'vitest';
import {drawTower, islandFrames} from '../src/art/island.js';
import {TOWER_KINDS, TOWER_STATES, towerState, towerStateFrame} from '../src/art/tower-states.js';
import {islandFrame} from '../src/art/registry.js';

class FakePath { constructor() { this.ops = []; } addPath() {} }
for (const name of ['moveTo', 'lineTo', 'arc', 'ellipse', 'quadraticCurveTo', 'rect', 'roundRect', 'closePath', 'bezierCurveTo', 'arcTo'])
  FakePath.prototype[name] = function (...args) { this.ops.push([name, ...args]); };
beforeAll(() => { globalThis.Path2D ??= FakePath; });

// A 2D context that records the sequence of calls; any property write is accepted.
function recorder() {
  const calls = [], c = new Proxy({}, {
    get: (target, key) => (key === 'calls' ? calls : key === 'shadows' ? null : key in target ? target[key] : (...args) => { calls.push(String(key)); return undefined; }),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  return c;
}
const SIZE = {w: 48, h: 32, pad: 0};
const paintedWith = (kind, level, state, firing) => { const c = recorder(); drawTower(kind, level, state, firing)(c, SIZE); return c.calls; };

describe('tower damage art', () => {
  it('reads unknown states as intact and names the frames', () => {
    expect(towerState(undefined)).toBe('intact');
    expect(towerState('on fire')).toBe('intact');
    expect(TOWER_STATES).toEqual(['intact', 'damaged', 'broken']);
    expect(towerStateFrame('cannon', 1)).toBe('island-cannon');
    expect(towerStateFrame('mortar', 3, 'damaged')).toBe('island-mortar-l3-damaged');
    expect(towerStateFrame('harpoon', 9, 'broken')).toBe('island-harpoon-l5-broken');
    expect(towerStateFrame('cannon', 2, 'nonsense')).toBe('island-cannon-l2');
  });
  it('draws every kind, level and state, with and without a shot, without error', () => {
    for (const kind of TOWER_KINDS) for (let level = 1; level <= 5; level++) for (const state of TOWER_STATES) for (const firing of [false, true])
      expect(paintedWith(kind, level, state, firing).length, `${kind} ${level} ${state}`).toBeGreaterThan(10);
  });
  it('defaults to intact: the same drawing calls as asking for intact, and the same as the old call shape', () => {
    for (const kind of TOWER_KINDS) {
      expect(paintedWith(kind, 3)).toEqual(paintedWith(kind, 3, 'intact'));
      expect(paintedWith(kind, 3, 'nonsense')).toEqual(paintedWith(kind, 3, 'intact'));
    }
  });
  it('damaged and broken differ from intact and from each other', () => {
    for (const kind of TOWER_KINDS) {
      const [intact, damaged, broken] = TOWER_STATES.map(state => paintedWith(kind, 2, state));
      expect(damaged.length).toBeGreaterThan(intact.length); // the intact tower plus cracks, scorch and smoke
      expect(JSON.stringify(broken)).not.toBe(JSON.stringify(intact));
      expect(JSON.stringify(broken)).not.toBe(JSON.stringify(damaged));
    }
  });
  it('a broken tower never shows a shot: firing makes no difference', () => {
    for (const kind of TOWER_KINDS) expect(paintedWith(kind, 4, 'broken', true)).toEqual(paintedWith(kind, 4, 'broken', false));
  });
  it('unknown kinds draw as a cannon instead of throwing', () => {
    expect(paintedWith('catapult', 1, 'broken')).toEqual(paintedWith('cannon', 1, 'broken'));
  });
  it('registers a damaged and a broken frame per kind and level, in the towers box, beside the unchanged intact ones', () => {
    const frames = islandFrames();
    for (const kind of TOWER_KINDS) for (let level = 1; level <= 5; level++) for (const state of TOWER_STATES) {
      const name = towerStateFrame(kind, level, state);
      expect(frames[name], name).toBeTruthy();
      expect(frames[name].slice(0, 3), name).toEqual([48, 32, 5]);
      expect(islandFrame(name), name).not.toBeNull();
    }
  });
});
