// Recorded malformed successes and lifecycle races cannot grant progress or leak an abandoned account.
import {describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealAdapter} from '../src/online/adapter/index.js';
import {createLazyOnlineAdapter} from '../src/adapter/lazy-online.js';

const me = {id: 'player-placeholder', captainName: 'Placeholder captain', coins: 0,
  kit: null, place: null, crews: []};
const okay = data => ({ok: true, status: 200, data: structuredClone(data)});
function setup(player = me) {
  const session = createSession();
  session.setToken(String(Math.random()));
  const writes = [];
  const replies = new Map([
    ['/api/config', okay({flags: {sign_in: true}})], ['/api/me', okay(player)],
  ]);
  const api = {
    get: async route => structuredClone(replies.get(route)),
    post: async (route, body) => { writes.push({route, body});
      return okay(route === '/api/me/name' ? {captainName: player.captainName, rerollsLeft: 1} : null); },
    del: async () => okay(null),
  };
  const adapter = createRealAdapter({session, api, publicApi: api, document: {}, window: {}});
  const ready = async () => {
    await vi.waitFor(() => expect(adapter.read().account.canReroll).toBe(true));
    expect(writes).toEqual([{route: '/api/me/name', body: undefined}]);
    writes.length = 0; // Probe the player action separately from the required sign-in initialization.
  };
  return {adapter, session, writes, replies, api, ready};
}

describe('real adapter boundaries', () => {
  it.each([null, {}, {deleted: 'true'}, {deleted: false}])('rejects malformed deletion confirmation', async reply => {
    const test = setup();
    try {
      await test.ready();
      test.api.del = async () => okay(reply);
      expect(await test.adapter.deleteMyData({confirm: true})).toMatchObject({accepted: false});
      expect(test.session.isSignedIn()).toBe(true);
      expect(test.adapter.read().account.state).toBe('signed_in');
    } finally { test.adapter.dispose(); }
  });

  it('ignores late name recovery after sign-out and never retries the abandoned write', async () => {
    const test = setup();
    try {
      await test.ready();
      let finish;
      test.api.post = async route => {
        test.writes.push({route});
        if (route === '/api/me/name') return new Promise(resolve => { finish = resolve; });
        return {ok: false, status: 409, code: 'no_name_yet'};
      };
      const pending = test.adapter.rerollName();
      await vi.waitFor(() => expect(typeof finish).toBe('function'));
      await test.adapter.signOut();
      finish(okay({captainName: 'Late placeholder', rerollsLeft: 1}));
      expect(await pending).toMatchObject({accepted: false, reason: 'session_expired'});
      expect(test.writes.map(write => write.route)).toEqual(['/api/me/name/reroll', '/api/me/name']);
      expect(test.adapter.read().account).toMatchObject({state: 'signed_out', captainName: null});
    } finally { test.adapter.dispose(); }
  });

  it('forwards the fallback view before the failed-chunk intent resolves', async () => {
    const adapter = createLazyOnlineAdapter({load: async () => { throw new Error('Placeholder load failure'); }});
    let resolved = false;
    let published = false;
    adapter.subscribe(() => { throw new Error('Placeholder observer failure'); });
    adapter.subscribe(event => { if (event.view.mode === 'unavailable' && !resolved) published = true; });
    try {
      const result = await adapter.rerollName().then(value => { resolved = true; return value; });
      expect(result).toMatchObject({accepted: false, reason: 'not_connected'});
      expect(published).toBe(true);
    } finally { adapter.dispose(); }
  });

  it('isolates throwing subscribers without replacing or orphaning the loaded real adapter', async () => {
    const test = setup();
    const dispose = vi.spyOn(test.adapter, 'dispose');
    const create = vi.fn(() => test.adapter);
    const adapter = createLazyOnlineAdapter({load: async () => ({createRealAdapter: create})});
    adapter.subscribe(() => { throw new Error('Placeholder observer failure'); });
    try {
      await test.ready();
      expect((await adapter.signIn()).accepted).toBe(true);
      expect(adapter.read().mode).toBe('online');
      expect(create).toHaveBeenCalledTimes(1);
      expect(dispose).not.toHaveBeenCalled();
    } finally { adapter.dispose(); }
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
