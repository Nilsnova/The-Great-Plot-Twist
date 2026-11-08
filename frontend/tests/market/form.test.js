// Injected minimal DOM checks actual form lifetime and guards without a browser or service.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createOpenForm} from '../../src/screens/market/open-form.js';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.events = new Map(); this.disabled = false; }
  append(...children) { for (const child of children) { this.children.push(child); if (child instanceof Element) child.parent = this; } }
  setAttribute(name, value) { this[name] = String(value); }
  addEventListener(name, listener) { this.events.set(name, listener); }
  removeEventListener(name) { this.events.delete(name); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  querySelectorAll(tag) {
    return this.children.flatMap(child => child instanceof Element
      ? [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)] : []);
  }
  querySelector(tag) { return this.querySelectorAll(tag)[0] ?? null; }
  fire(name) { return this.events.get(name)?.({target: this}); }
  focus() { document.activeElement = this; }
}
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
beforeEach(() => vi.stubGlobal('document', {createElement: tag => new Element(tag), activeElement: null}));
afterEach(() => vi.unstubAllGlobals());
function setup(onSubmit) {
  const form = createOpenForm({onSubmit});
  form.update({id: 'recorded-company', zeroPrices: {rising: 1, falling: 2}, currency: 'USD', priceDecimals: 2},
    {stakeChoices: [{stake: 100, fee: 2, total: 102}]});
  const choose = () => {
    for (const value of ['rising', '100']) form.element.querySelectorAll('input').find(input => input.value === value).fire('change');
  };
  return {form, choose, confirm: form.element.querySelectorAll('button')[0]};
}

describe('market form lifetime', () => {
  it('releases an old account busy form and ignores its completion while the next account submits', async () => {
    const old = deferred(), fresh = deferred();
    const onSubmit = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise);
    const {form, choose, confirm} = setup(onSubmit);
    choose();
    const first = confirm.fire('click');
    expect(confirm.disabled).toBe(true);
    form.reset(); choose();
    expect(confirm.disabled).toBe(false);
    const second = confirm.fire('click');
    expect(onSubmit).toHaveBeenCalledTimes(2);
    old.resolve({kind: 'done'}); await first;
    expect(confirm.disabled).toBe(true);
    // Direct activation must also honor busy state, even if a caller bypasses a disabled button.
    await confirm.fire('click');
    expect(onSubmit).toHaveBeenCalledTimes(2);
    fresh.resolve({kind: 'refused'}); await second;
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toBe('Open rising position for 102 coins');
  });

  it('blocks direct confirmation during the server countdown and resumes the same choices afterward', async () => {
    const onSubmit = vi.fn(async () => ({kind: 'refused'}));
    const {form, choose, confirm} = setup(onSubmit);
    choose();
    const row = {id: 'recorded-company', zeroPrices: {rising: 1, falling: 2}};
    const rules = {stakeChoices: [{stake: 100, fee: 2, total: 102}]};
    form.update(row, rules, {disabled: true});
    expect(confirm.disabled).toBe(true);
    await confirm.fire('click'); expect(onSubmit).not.toHaveBeenCalled();
    form.update(row, rules, {disabled: false});
    expect(confirm.disabled).toBe(false);
    await confirm.fire('click'); expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
