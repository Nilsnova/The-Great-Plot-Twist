// Semantic DOM only: pixel bounds, readable text and real shared-image rendering need the browser lane.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createMoveBar} from '../../src/island/move-bar.js';
import {createVillageBar} from '../../src/island/village-bar.js';
import {moveModel} from '../../src/island/move-mode.js';

class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.events = {}; this.dataset = {}; this.className = '';
    this.classList = {toggle: (name, on) => { this.className = [...this.className.split(' ').filter(n => n !== name), ...(on ? [name] : [])].join(' '); }};
  }
  append(...children) { children.forEach(child => { this.children.push(child); child.parent = this; }); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(name, listener) { this.events[name] = listener; }
  fire() { if (!this.disabled) this.events.click?.(); }
}
const all = element => [element, ...element.children.flatMap(all)];
const byClass = (element, name) => all(element).find(item => item.className.split(' ').includes(name));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {resolve, promise}; };
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const model = extra => ({title: 'Move Cannon', line: 'Tap the island where it should stand, or use the arrows.', status: 'This square is free.',
  ok: true, busy: false, refused: false, placeLabel: 'Place here', portrait: {kind: 'cannon', level: 1, spec: null}, ...extra});
beforeEach(() => vi.stubGlobal('document', {createElement: tag => new Element(tag)}));
afterEach(() => vi.unstubAllGlobals());

describe('reference village controls', () => {
  it('keeps the exact step callbacks, disabled placement, busy state and enabled Cancel', () => {
    const handlers = {nudge: vi.fn(), place: vi.fn(), cancel: vi.fn()};
    const bar = createMoveBar({container: new Element('div'), handlers, loadPortrait: async () => null});
    bar.render(model());
    const buttons = all(bar.element).filter(item => item.tagName === 'button');
    buttons.slice(0, 4).forEach(button => button.fire());
    expect(handlers.nudge.mock.calls).toEqual([[-1, 0], [0, -1], [0, 1], [1, 0]]);
    expect(buttons.slice(0, 4).map(b => b.dataset.direction)).toEqual(['west', 'north', 'south', 'east']);
    buttons[5].fire(); expect(handlers.place).toHaveBeenCalledOnce();
    bar.render(model({ok: false, busy: true, placeLabel: 'Placing…', refused: true, status: 'A wave is under way. Move buildings between waves.'}));
    buttons.slice(0, 4).forEach(button => expect(button.disabled).toBe(true));
    buttons[5].fire(); expect(handlers.place).toHaveBeenCalledOnce();
    buttons[4].fire(); expect(handlers.cancel).toHaveBeenCalledOnce();
    expect(byClass(bar.element, 'island-move-status').textContent).toBe('A wave is under way. Move buildings between waves.');
    expect(byClass(bar.element, 'island-move-copy').tabIndex).toBe(0); bar.dispose();
  });
  it('loads the actual frame once and ignores stale selection completions without repainting on nudges', async () => {
    const old = deferred(), current = deferred(), loadPortrait = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const bar = createMoveBar({container: new Element('div'), loadPortrait});
    bar.render(model()); await settle();
    const house = model({portrait: {kind: 'house', level: 3, spec: 'tavern'}});
    bar.render(house); bar.render({...house, status: 'That square is occupied.'}); await settle();
    expect(loadPortrait.mock.calls).toEqual([['island-cannon'], ['island-house-tavern-l3']]);
    const portrait = byClass(bar.element, 'island-move-portrait'), canvas = new Element('canvas');
    old.resolve(new Element('stale-canvas')); await settle(); expect(portrait.children[0].tagName).toBe('span');
    current.resolve(canvas); await settle(); expect(portrait.children).toEqual([canvas]);
    bar.render(null); bar.render(house); await settle();
    expect(portrait.children).toEqual([canvas]); expect(loadPortrait).toHaveBeenCalledTimes(2); bar.dispose();
  });
  it('keeps empty/unavailable art neutral and invalidates pending work on hide and disposal', async () => {
    const pending = deferred(), loadPortrait = vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('unavailable'));
    const bar = createMoveBar({container: new Element('div'), loadPortrait});
    const portrait = byClass(bar.element, 'island-move-portrait');
    bar.render(model()); await settle(); bar.render(null); pending.resolve(new Element('late-canvas')); await settle();
    expect(portrait.children[0].tagName).toBe('span'); expect(bar.element.hidden).toBe(true);
    bar.render(model()); await settle(); expect(portrait.children[0].tagName).toBe('span');
    bar.render(model({portrait: null})); expect(loadPortrait).toHaveBeenCalledTimes(2);
    const disposed = deferred(); const other = createMoveBar({container: new Element('div'), loadPortrait: () => disposed.promise});
    other.render(model()); await settle(); other.dispose(); disposed.resolve(new Element('late-canvas')); await settle();
    expect(byClass(other.element, 'island-move-portrait').children[0].tagName).toBe('span'); bar.dispose();
  });
  it('adds Work beside explicit Fit while preserving the Build walls eligibility and Exit callbacks', () => {
    const container = new Element('div'), onCamera = vi.fn(), onLeave = vi.fn(), onBuildWalls = vi.fn();
    let walls = false;
    const bar = createVillageBar({container, onCamera, onLeave, onBuildWalls, showWalls: () => walls});
    bar.render(true); const buttons = all(container).filter(item => item.tagName === 'button');
    buttons.slice(0, 4).forEach(button => button.fire());
    expect(onCamera.mock.calls).toEqual([['out'], ['in'], ['work'], ['fit']]);
    expect(buttons[4].hidden).toBe(true); walls = true; bar.render(true); expect(buttons[4].hidden).toBe(false);
    buttons[4].fire(); buttons[5].fire(); expect(onBuildWalls).toHaveBeenCalledOnce(); expect(onLeave).toHaveBeenCalledOnce();
    bar.render(false); expect(container.children[0].hidden).toBe(true); bar.dispose(); expect(container.children).toEqual([]);
  });
  it('uses confirmed kind, level and role only; unsupported or empty data cannot invent a portrait', () => {
    const make = actual => moveModel({spotId: 'house_1', spots: [actual], verdict: {ok: true}}).portrait;
    expect(make({id: 'house_1', kind: 'house', level: 3, spec: 'tavern', built: true})).toEqual({kind: 'house', level: 3, spec: 'tavern'});
    for (const changed of [{built: false}, {kind: 'ghost'}, {level: 0}, {level: '3'}, {level: NaN}]) {
      expect(make({id: 'house_1', kind: 'house', level: 3, built: true, ...changed})).toBe(null);
    }
  });
});
