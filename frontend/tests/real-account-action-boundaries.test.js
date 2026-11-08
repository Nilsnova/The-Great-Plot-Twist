// Real transport continuations cannot restore or delete an account that has already changed.
import {describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/case-adapter/store.js';
import {createAdapterTransport} from '../src/online/case-adapter/transport.js';
import {createProfileHandlers} from '../src/online/case-adapter/profile.js';

const okay = data => ({ok: true, status: 200, data});
const me = {id: 'previous-player', captainName: 'Previous Captain', coins: 0,
  kit: null, place: null, crews: []};
const profile = {ending: 'ending_rescue', decision: 'warned', readLog: false,
  coinsPaid: 5, alreadyGranted: false, kit: {id: 'true_keeper', name: 'True Keeper', coins: 5,
    startPlace: 'saltreach_harbor', item: {id: 'item', name: 'Old account item', text: 'Old account text.'}}};
const actions = ['to_desk'];
const intents = [
  ['rerollName', [], {captainName: 'Late Captain', rerollsLeft: 0}],
  ['completeIntro', [{actions}], profile],
  ['deleteMyData', [{confirm: true}], {deleted: true}],
];

function setup() {
  const session = createSession();session.setToken('previous-synthetic-token');
  const store = createAdapterStore({session});store.commit({me});
  let finish;
  const change = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const api = {post: change, del: change, get: vi.fn(async () => okay(me))};
  const ctx = {session, store, state: store.state, api, publicApi: api, now: () => 0, random: () => 0.5,
    accept: (message = '') => ({accepted: true, reason: null, message}),
    refuse: reason => ({accepted: false, reason, message: reason}),
    saves: {stageReplay: vi.fn(async () => ({accepted: true}))},
    auth: {readOwnLedger: vi.fn(async () => ({ok: true, rows: []}))}};
  ctx.signOut = vi.fn(async () => { session.clearToken(); });
  ctx.onDeleted = vi.fn(() => { store.commit({deviceSave: null}); });
  ctx.transport = createAdapterTransport(ctx);
  return {ctx, store, session, handlers: createProfileHandlers(ctx), finish: data => finish(okay(data))};
}

describe('account action completion identity boundaries', () => {
  describe.each(['sign_out', 'switch_account'])('%s', boundary => {
    it.each(intents)('ignores the old %s reply after transport settles', async (intent, args, reply) => {
      const test = setup();
      const pending = test.handlers[intent](...args);
      test.finish(reply);
      let currentState;
      // Transport observes its original scope first; the handler resumes after account cleanup.
      queueMicrotask(() => {
        test.session.clearToken();test.store.invalidate();
        test.store.commit({accountState: 'signed_out', me: null, nameReply: null, profile: null});
        if (boundary === 'switch_account') {
          test.session.setToken('next-synthetic-token');
          test.store.commit({accountState: 'signed_in', me: {...me, id: 'next-player', captainName: 'Next Captain'},
            nameReply: {captainName: 'Next Captain', rerollsLeft: 1},
            deviceSave: {data: {kind: 'intro', actions: ['to_shore'], place: 'lighthouse_isle'}}});
        }
        currentState = structuredClone(test.store.state);
      });
      expect(await pending).toMatchObject({accepted: false, reason: 'session_expired'});
      expect(test.store.state).toEqual(currentState);
      expect(test.session.isSignedIn()).toBe(boundary === 'switch_account');
      expect(test.ctx.api.get).not.toHaveBeenCalled();
      expect(test.ctx.saves.stageReplay).not.toHaveBeenCalled();
      expect(test.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
      expect(test.ctx.onDeleted).not.toHaveBeenCalled();
      expect(test.ctx.signOut).not.toHaveBeenCalled();
    });
  });
  it('does not start a new identity ledger read after the old arrival save finishes', async () => {
    const test = setup();let finishSave;
    test.ctx.saves.stageReplay.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
    const pending = test.handlers.completeIntro({actions});test.finish(profile);
    await vi.waitFor(() => expect(typeof finishSave).toBe('function'));
    test.session.setToken('next-synthetic-token');test.store.invalidate();
    test.store.commit({me: {...me, id: 'next-player', captainName: 'Next Captain'}, profile: null});
    const currentState = structuredClone(test.store.state);
    finishSave({accepted: true});
    expect(await pending).toMatchObject({accepted: false, reason: 'session_expired'});
    expect(test.ctx.auth.readOwnLedger).not.toHaveBeenCalled();
    expect(test.store.state).toEqual(currentState);
  });
});
