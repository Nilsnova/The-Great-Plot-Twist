// Semantic DOM and UI-host checks. Native dialog behavior/pixel layout are separate browser evidence.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {buildCardModel} from '../../src/island/card-model.js';
import {canDockSelection, holdOtherBuildingAction} from '../../src/island/selection-dock.js';
import {createIslandUi} from '../../src/island/ui.js';
vi.mock('../../src/island/building-portrait.js', () => ({createBuildingPortrait: () => ({
  element: document.createElement('div'), render: vi.fn(), dispose: vi.fn(),
})}));
vi.mock('../../src/ui/kit/modal.js', () => ({createModal: ({onCancel}) => {
  const element = document.createElement('dialog'); element.cancel = onCancel;
  return {element, setTitle() {}, setContent: body => element.replaceChildren(body),
    open(parent, target) { element.open = true; parent.append(element); target?.focus(); },
    dispose() { element.open = false; element.remove(); }};
}}));
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.className = ''; this.events = {};
    this.classList = {add: (...names) => { this.className += ` ${names.join(' ')}`; }, toggle: (name, on) => { if (on) this.className += ` ${name}`; }}; }
  append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(key, value) { this[key] = String(value); }
  removeAttribute(key) { delete this[key]; }
  addEventListener(name, callback) { this.events[name] = callback; }
  focus() { document.activeElement = this; }
  contains(element) { return all(this).includes(element); }
  querySelector(selector) { return all(this).find(item => item.dataset.focus === selector.match(/data-focus="([^"]+)"/)?.[1]); }
  click() { if (!this.disabled) this.events.click?.(); }
}
const all = node => [node, ...node.children.flatMap(all)];
const button = (node, key) => all(node).find(child => child.dataset.focus === key);
const text = node => all(node).map(child => child.textContent ?? '').join(' ');
const wall = (id = 'wall_1') => buildCardModel({spotId: id, slot: 'wall', coins: 1000, movable: true,
  spot: {id, kind: 'wall', built: true, level: 1, upgradeCost: 37}});
beforeEach(() => vi.stubGlobal('document', {createElement: tag => new Element(tag), activeElement: null}));
afterEach(() => vi.unstubAllGlobals());

describe('management wall dock', () => {
  it('keeps only simple walls compact and makes other pending actions a visible hold', () => {
    const model = wall(); expect(canDockSelection(model)).toBe(true); expect(model.upgradePrice).toBe('🪙 37');
    for (const change of [{built: false}, {kind: 'cannon'}, {tree: {}}, {mode: 'repair'}, {recovery: {visible: true}}, {recovery: {actionPending: true}}])
      expect(canDockSelection({...model, ...change})).toBe(false);
    const held = holdOtherBuildingAction(model, 'wall_2');
    expect(held).toMatchObject({disabled: true, reason: 'Another building action is in progress.', move: {disabled: true}, demolish: {disabled: true}});
    expect(holdOtherBuildingAction(model, model.spotId)).toBe(model); expect(model.disabled).toBe(false);
    const complex = holdOtherBuildingAction({...model, choices: [{disabled: false}], skills: {choices: [{disabled: false}]}, tree: {detail: {disabled: false}}}, 'wall_2');
    expect([complex.choices[0].disabled, complex.skills.choices[0].disabled, complex.tree.detail.disabled]).toEqual([true, true, true]);
  });
  it('uses actual health and price, allows A→B selection, preserves errors and calls only current handlers', () => {
    const container = new Element('div'), handlers = {move: vi.fn(), upgrade: vi.fn()}, ui = createIslandUi({container});
    const a = {...wall(), recovery: {status: 'ready', actualHp: 60, maxHP: 60}};
    ui.buildCard(a, handlers, {dock: true}); expect(ui.active).toBe(false); expect(ui.open).toBe('build');
    expect(text(ui.selectionElement)).toContain('60 / 60 HP'); expect(button(ui.selectionElement, 'upgrade').textContent).toBe('Upgrade · 🪙 37');
    const first = ui.selectionElement; ui.buildCard({...wall('wall_2'), message: 'Payment could not be checked.'}, handlers, {dock: true});
    expect(ui.selectionElement).toBe(first); expect(text(first)).toContain(wall('wall_2').stats); expect(text(first)).toContain('Payment could not be checked.');
    expect(all(first).find(node => node.role === 'meter')?.hidden).toBe(true);
    button(first, 'move').click(); button(first, 'upgrade').click();
    expect(handlers.move).toHaveBeenCalledWith('wall_2'); expect(handlers.upgrade).toHaveBeenCalledWith('wall_2');
    ui.buildCard({...wall('wall_2'), recovery: {status: 'error', message: 'Building health could not be loaded.'}}, handlers, {dock: true});
    expect(all(first).find(node => node.role === 'alert')?.textContent).toBe('Building health could not be loaded.'); ui.dispose();
  });
  it('does not label a new level with a previous level health read or enable another upgrade on it', () => {
    const recoveryState = {recoveryVersion: 1, structures: [{spot: 'wall_1', kind: 'wall', level: 1, hpUnits: 1000000, maxHP: 60}]};
    const model = buildCardModel({spotId: 'wall_1', coins: 1000, spot: {id: 'wall_1', kind: 'wall', built: true, level: 2}, recoveryState, recoveryStatus: 'ready'});
    expect(model).toMatchObject({recoveryLevel: 1, disabled: true, reason: 'Building health is unavailable. Try again.'});
    const ui = createIslandUi({container: new Element('div')}); ui.buildCard(model, {}, {dock: true});
    expect(text(ui.selectionElement)).toContain('Loading building health…');
    expect(text(ui.selectionElement)).not.toContain('60 / 60 HP'); ui.dispose();
  });
  it('returns from refreshed native Details on user cancel, while unconditional close/travel cannot reopen it', () => {
    const container = new Element('div'), focus = vi.fn(), onSelection = vi.fn(), ui = createIslandUi({container, focus, onSelection});
    ui.buildCard(wall(), {}, {dock: true}); button(ui.selectionElement, 'details').click();
    expect(ui.active).toBe(true); expect(ui.selectionElement).toBe(null);
    ui.buildCard({...wall(), level: 2, message: 'Fresh response'}, {}, {dock: true});
    const dialog = container.children.find(child => child.tagName === 'dialog'); dialog.cancel();
    expect(ui.active).toBe(false); expect(text(ui.selectionElement)).toContain('Level 2'); expect(text(ui.selectionElement)).toContain('Fresh response');
    expect(document.activeElement.dataset.focus).toBe('details');
    button(ui.selectionElement, 'details').click(); expect(ui.close()).toBe(true);
    expect(ui.open).toBe(null); expect(ui.selectionElement).toBe(null); expect(ui.cancel()).toBe(false);
    expect(focus).toHaveBeenCalled(); expect(onSelection.mock.calls.at(-1)).toEqual([false]); ui.dispose();
  });
});
