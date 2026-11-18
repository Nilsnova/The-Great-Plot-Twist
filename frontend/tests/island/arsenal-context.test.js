// Controlled delayed replies at the controller boundary; server authority stays in the existing API.
import {expect, it, vi} from 'vitest';
import {createArsenal} from '../../src/island/arsenal.js';
import {createArsenalApi} from '../../src/island/arsenal-api.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
const data = code => ({code, capacity: 20, stored: 0, copies: [], waveRunning: false, coins: 1000, carried: 'musket'});
const refused = {ok: false, code: 'taken', message: 'Another captain took that weapon just now.'};
// All continuations of the controlled promises finish before the next event-loop turn.
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  let code = 'ISLE-K7Q2M';
  const api = {state: vi.fn(async asked => ({ok: true, data: data(asked)}))};
  const ui = {open: 'arsenal', arsenalCard: vi.fn(), toast: vi.fn()};
  const emit = vi.fn(), onCoins = vi.fn();
  const arsenal = createArsenal({api, ui, emit, onCoins, enabled: () => true, code: () => code});
  return {api, ui, emit, onCoins, arsenal, visit: next => { code = next; },
    clear: () => { ui.arsenalCard.mockClear(); ui.toast.mockClear(); emit.mockClear(); onCoins.mockClear(); }};
}

for (const action of ['buy', 'take', 'giveBack']) {
  it.each(['success', 'refusal'])(`a late ${action} %s cannot overwrite the new island`, async outcome => {
    const f = setup(), reply = deferred();
    await f.arsenal.refresh();
    f.api[action] = vi.fn(() => reply.promise);
    f.arsenal.handlers[action](action === 'buy' ? 'pistols' : 'copy-a');
    f.visit('ISLE-P9Z4R');
    await f.arsenal.refresh();
    const current = f.arsenal.answer;
    f.clear();
    reply.resolve(outcome === 'success' ? {ok: true, data: data('ISLE-K7Q2M')} : refused);
    await settle();
    expect(f.arsenal.answer).toEqual(current);
    expect(f.onCoins).not.toHaveBeenCalled();
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.ui.toast).not.toHaveBeenCalled();
    expect(f.ui.arsenalCard.mock.calls.at(-1)?.[0].message ?? '').toBe('');
    expect(f.api[action]).toHaveBeenCalledOnce();
    // The old pending action is released, so an intentional action on the new island still works.
    f.api[action].mockResolvedValue({ok: true, data: current});
    f.arsenal.handlers[action](action === 'buy' ? 'pistols' : 'copy-b');
    await settle();
    expect(f.api[action]).toHaveBeenCalledTimes(2);
  });
}

it.each(['success', 'refusal'])('a late initial read %s does not paint the next island', async outcome => {
  const f = setup(), reply = deferred();
  f.api.state.mockImplementationOnce(() => reply.promise);
  const reading = f.arsenal.refresh();
  f.visit('ISLE-P9Z4R');
  f.clear();
  reply.resolve(outcome === 'success' ? {ok: true, data: data('ISLE-K7Q2M')} : refused);
  await reading;
  expect(f.arsenal.answer).toBeNull();
  expect(f.ui.arsenalCard).not.toHaveBeenCalled();
  expect(f.onCoins).not.toHaveBeenCalled();
  await f.arsenal.refresh();
  expect(f.ui.arsenalCard.mock.calls.at(-1)[0].message).toBe('');
});

it('travel during the refresh after a refusal does not carry its message across', async () => {
  const f = setup(), read = deferred();
  await f.arsenal.refresh();
  f.api.take = vi.fn(async () => refused);
  f.api.state.mockImplementationOnce(() => read.promise);
  f.arsenal.handlers.take('copy-a');
  await settle();
  f.visit('ISLE-P9Z4R');
  read.resolve({ok: true, data: data('ISLE-K7Q2M')});
  await settle();
  await f.arsenal.refresh();
  expect(f.ui.arsenalCard.mock.calls.at(-1)[0].message).toBe('');
});

it('a same-island delayed success still updates coins and emits the existing events once', async () => {
  const f = setup(), reply = deferred();
  await f.arsenal.refresh();
  f.clear();
  f.api.buy = vi.fn(() => reply.promise);
  f.arsenal.handlers.buy('pistols');
  const answer = {...data('ISLE-K7Q2M'), coins: 940, mine: 'copy-a', carried: 'pistols',
    copies: [{id: 'copy-a', no: 1, weapon: 'pistols', holder: 'me', you: true, away: false}]};
  reply.resolve({ok: true, data: answer});
  await settle();
  expect(f.arsenal.answer).toEqual(answer);
  expect(f.onCoins).toHaveBeenCalledExactlyOnceWith(940, expect.any(Function));
  expect(f.emit.mock.calls.map(([event]) => event.type)).toEqual(['island_spots_changed', 'arsenal_changed']);
  expect(f.ui.toast).toHaveBeenCalledExactlyOnceWith('Pistols #1 bought: you carry it now.', 'success');
});

it('ignoring a late reply does not undo a purchase already completed by the fake server', async () => {
  const transport = createFakeIslandTransport({coins: 1000, unlocking: false});
  const real = createArsenalApi({transport}), reply = deferred(), bought = deferred();
  let code = null;
  const api = {...real, state: asked => asked ? Promise.resolve({ok: true, data: data(asked)}) : real.state(),
    buy: async args => { const result = await real.buy(args); bought.resolve(); await reply.promise; return result; }};
  const arsenal = createArsenal({api, code: () => code, enabled: () => true,
    ui: {open: null, toast: vi.fn()}});
  await arsenal.refresh();
  arsenal.handlers.buy('pistols');
  await bought.promise;
  code = 'ISLE-P9Z4R'; await arsenal.refresh();
  reply.resolve(); await settle();
  expect(arsenal.answer.copies).toEqual([]);
  code = null; await arsenal.refresh();
  expect(arsenal.answer.copies).toHaveLength(1);
  expect(arsenal.answer.coins).toBe(940);
  expect(arsenal.weapon()).toBe('pistols');
});
