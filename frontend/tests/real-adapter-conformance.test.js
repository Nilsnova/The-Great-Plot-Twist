// The same schema-1 suite runs against recorded real routes with fresh private state per adapter.
import {expect, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealAdapter} from '../src/online/adapter/index.js';
import {defineAdapterConformance} from '../src/adapter/conformance/suite.js';

const success = data => ({ok: true, status: 200, data: structuredClone(data)});
const initialMe = {
  id: 'player-placeholder', captainName: 'Placeholder captain', coins: 0, kit: null, place: null, crews: [],
};

function createRecordedAdapter() {
  const session = createSession();
  session.setToken(String(Math.random()));
  const me = structuredClone(initialMe);
  const api = {
    async get(route) {
      if (route === '/api/config') return success({flags: {sign_in: true}});
      if (route === '/api/me') return success(me);
      return {ok: false, status: 404, code: 'feature_off'};
    },
    async post(route) {
      if (route === '/api/me/name') return success({captainName: me.captainName, rerollsLeft: 1});
      return {ok: false, status: 404, code: 'feature_off'};
    },
    async del() { return {ok: false, status: 404, code: 'feature_off'}; },
  };
  return createRealAdapter({session, api, publicApi: api, document: {}, window: {}});
}

defineAdapterConformance('real', createRecordedAdapter, {
  create: createRecordedAdapter,
  prepare: adapter => vi.waitFor(() => {
    expect(adapter.read().account.captainName).toBe(initialMe.captainName);
  }),
  sequence: [{method: 'signIn', repeat: true}],
  assertProgress: view => {
    expect(view.mode).toBe('online');
    expect(view.account.state).toBe('signed_in');
    expect(view.captain).toEqual({name: initialMe.captainName, coins: 0});
  },
});
