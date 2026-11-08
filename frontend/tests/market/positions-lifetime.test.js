// Actual position controls use an injected minimal DOM and deferred callbacks, without services.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createPositionsView} from '../../src/screens/market/positions-view.js';
import {createFakeMarketAdapter} from '../../src/screens/market/fake.js';
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.events = new Map(); this.dataset = {}; this.attributes = {}; this._text = ''; }
  get textContent() { return this._text + this.children.map(child => child instanceof Element ? child.textContent : String(child)).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...children) { for (const child of children) { this.children.push(child); if (child instanceof Element) child.parent = this; } }
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
  insertBefore(child, next) {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    const index = this.children.indexOf(next); this.children.splice(index < 0 ? this.children.length : index, 0, child); child.parent = this;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) { this.events.set(name, listener); }
  removeEventListener(name) { this.events.delete(name); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  querySelectorAll(tag) { return this.children.flatMap(child => child instanceof Element ? [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)] : []); }
  querySelector(tag) { return this.querySelectorAll(tag)[0] ?? null; }
  fire(name) { return this.events.get(name)?.({target: this}); }
  focus() { document.activeElement = this; }
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const views = [];
const rows = view => view.element.querySelectorAll('li').filter(element => element.className === 'market-position');
const controls = row => { const [ask, yes] = row.querySelectorAll('button'); return {ask, yes}; };
async function setup(onClosePosition = vi.fn(async () => ({kind: 'done'}))) {
  const fake = createFakeMarketAdapter(), board = (await fake.board()).data, portfolio = (await fake.portfolio()).data;
  const view = createPositionsView({onClosePosition}); views.push(view);
  const data = {board, portfolio: {...portfolio, positions: portfolio.positions.filter(position => position.canClose).slice(0, 1)}, signedIn: true};
  view.update(data); return {view, data, onClosePosition};
}
beforeEach(() => vi.stubGlobal('document', {createElement: tag => new Element(tag), activeElement: null}));
afterEach(() => { for (const view of views.splice(0)) view.dispose(); vi.unstubAllGlobals(); });

describe('private market confirmation lifetime', () => {
  it.each(['removed', 'signed_out'])('invalidates a held confirmation when its position is %s', async boundary => {
    const {view, data, onClosePosition} = await setup(), old = rows(view)[0], {ask, yes} = controls(old);
    ask.fire('click'); const oldClick = yes.events.get('click');
    view.update(boundary === 'removed' ? {...data, portfolio: {...data.portfolio, positions: []}}
      : {...data, portfolio: null, signedIn: false});
    await yes.fire('click'); await oldClick({});
    expect(onClosePosition).not.toHaveBeenCalled(); expect(old.children).toEqual([]); expect(rows(view)).toEqual([]);
    view.update(data); const next = rows(view)[0], fresh = controls(next);
    expect(next).not.toBe(old); fresh.ask.fire('click'); await fresh.yes.fire('click');
    expect(onClosePosition).toHaveBeenCalledExactlyOnceWith({positionId: data.portfolio.positions[0].id});
  });

  it('does not let an old close finally unlock a new control for the same recorded position', async () => {
    const old = deferred(), fresh = deferred(), close = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const {view, data} = await setup(close), first = controls(rows(view)[0]);
    first.ask.fire('click'); const older = first.yes.fire('click');
    view.update({...data, portfolio: null, signedIn: false}); view.update(data);
    const current = controls(rows(view)[0]); current.ask.fire('click'); const newer = current.yes.fire('click');
    expect(current.yes.disabled).toBe(true);
    old.resolve({kind: 'done'}); await older;
    expect(current.yes.disabled).toBe(true); await current.yes.fire('click'); expect(close).toHaveBeenCalledTimes(2);
    fresh.resolve({kind: 'refused'}); await newer; expect(current.yes.disabled).toBe(false);
  });

  it('blocks unconfirmed, no-longer-closeable and disposed controls before a callback can run', async () => {
    const {view, data, onClosePosition} = await setup(), old = rows(view)[0], {ask, yes} = controls(old);
    await yes.fire('click'); expect(onClosePosition).not.toHaveBeenCalled();
    ask.fire('click'); view.update({...data, portfolio: {...data.portfolio,
      positions: data.portfolio.positions.map(position => ({...position, canClose: false}))}});
    await yes.fire('click'); expect(onClosePosition).not.toHaveBeenCalled();
    const callback = yes.events.get('click'); view.dispose(); view.dispose(); await callback({});
    view.update(data); expect(view.element.children).toEqual([]); expect(onClosePosition).not.toHaveBeenCalled();
  });
});
