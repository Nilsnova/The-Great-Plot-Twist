// Real transport continuations cannot restore or delete an account that has already changed.
import {describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createAdapterStore} from '../src/online/adapter/store.js';
import {createAdapterTransport} from '../src/online/adapter/transport.js';
import {createProfileHandlers} from '../src/online/adapter/profile.js';

const okay = data => ({ok: true, status: 200, data});
const me = {id: 'previous-player', captainName: 'Previous Captain', coins: 0,
  kit: null, place: null, crews: []};
const intents = [
  ['rerollName', [], {captainName: 'Late Captain', rerollsLeft: 0}],
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
    refuse: reason => ({accepted: false, reason, message: reason})};
  ctx.signOut = vi.fn(async () => { session.clearToken(); });
  ctx.onDeleted = vi.fn();
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
        test.store.commit({accountState: 'signed_out', me: null, nameReply: null});
        if (boundary === 'switch_account') {
          test.session.setToken('next-synthetic-token');
          test.store.commit({accountState: 'signed_in', me: {...me, id: 'next-player', captainName: 'Next Captain'},
            nameReply: {captainName: 'Next Captain', rerollsLeft: 1}});
        }
        currentState = structuredClone(test.store.state);
      });
      expect(await pending).toMatchObject({accepted: false, reason: 'session_expired'});
      expect(test.store.state).toEqual(currentState);
      expect(test.session.isSignedIn()).toBe(boundary === 'switch_account');
      expect(test.ctx.api.get).not.toHaveBeenCalled();
      expect(test.ctx.onDeleted).not.toHaveBeenCalled();
      expect(test.ctx.signOut).not.toHaveBeenCalled();
    });
  });
});
