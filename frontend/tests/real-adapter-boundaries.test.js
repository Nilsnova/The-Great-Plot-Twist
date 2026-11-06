// Recorded malformed successes and lifecycle races cannot grant progress or leak an abandoned account.
import {describe, expect, it, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {createLazyOnlineAdapter} from '../src/adapter/lazy-online.js';

const me = {id: 'player-placeholder', captainName: 'Placeholder captain', coins: 0,
  kit: null, place: null, crews: []};
const okay = data => ({ok: true, status: 200, data: structuredClone(data)});
const profile = {ending: 'ending_rescue', decision: 'warned', readLog: false,
  coinsPaid: 5, alreadyGranted: false, kit: {id: 'true_keeper', name: 'True Keeper', coins: 5,
    startPlace: 'saltreach_harbor', item: {id: 'item-placeholder', name: 'Placeholder item', text: 'Placeholder text.'}}};
function setup(player = me) {
  const session = createSession();
  session.setToken(String(Math.random()));
  const writes = [];
  const replies = new Map([
    ['/api/config', okay({flags: {sign_in: true}})], ['/api/me', okay(player)],
    ['/api/save', okay({version: 1, data: {}})], ['/api/crews/me', okay({crew: null})],
  ]);
  const api = {
    get: async route => structuredClone(replies.get(route)),
    post: async (route, body) => { writes.push({route, body});
      return okay(route === '/api/me/name' ? {captainName: player.captainName, rerollsLeft: 1} : null); },
    del: async () => okay(null),
  };
  const adapter = createRealCaseAdapter({session, api, publicApi: api, document: {}, window: {}});
  const ready = async () => {
    await vi.waitFor(() => expect(adapter.read().account.canReroll).toBe(true));
    expect(writes).toEqual([{route: '/api/me/name', body: undefined}]);
    writes.length = 0; // Probe the player action separately from the required sign-in initialization.
  };
  return {adapter, session, writes, replies, api, ready};
}

describe('real adapter boundaries', () => {
  it.each([null, {}, {...profile, kit: {id: 'true_keeper'}}, {...profile, coinsPaid: '5'}])(
    'refuses malformed successful intro replies without granting a kit', async reply => {
      const test = setup();
      try {
        await test.ready();
        test.api.post = async () => okay(reply);
        expect(await test.adapter.completeIntro({actions: ['to_desk']}))
          .toMatchObject({accepted: false, reason: 'invalid_request'});
        expect(test.adapter.read().account.hasKit).toBe(false);
        expect(test.adapter.read().arrival.status).toBe('pending');
        expect(test.adapter.read().captain.coins).toBe(0);
      } finally { test.adapter.dispose(); }
    },
  );

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

  it.each([['UPPER'], ['../placeholder'], [null], Array(301).fill('to_desk')])(
    'keeps invalid cloud replay actions out of continuation', async (...actions) => {
      const test = setup();
      try {
        await test.ready();
        test.replies.set('/api/save', okay({version: 1, data: {kind: 'intro', actions}}));
        const result = await test.adapter.continueGame();
        expect(result.accepted).toBe(true);
        expect(result.view.continuation).toMatchObject({source: 'local', kind: 'intro', actions: null});
      } finally { test.adapter.dispose(); }
    },
  );

  it.each(['true', 1, null, {}])('rejects nonboolean join confirmation without a POST', async confirm => {
    const test = setup();
    try {
      await test.ready();
      expect(await test.adapter.joinCrew('PLACEHOLDER', {confirm}))
        .toMatchObject({accepted: false, reason: 'invalid_request'});
      expect(test.writes).toHaveLength(0);
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

  it('continues in the world when a captain has a kit but the cloud save is not set up', async () => {
    const test = setup({...me, kit: 'true_keeper', place: 'saltreach_harbor'});
    try {
      await test.ready();
      test.replies.set('/api/save', {ok: false, status: 404, code: 'player_not_set_up'});
      expect(await test.adapter.continueGame()).toMatchObject({accepted: true, view: {
        continuation: {source: 'cloud', kind: 'world', actions: [], place: 'saltreach_harbor'},
      }});
    } finally { test.adapter.dispose(); }
  });

  it('forwards fallback continuation events before the failed-chunk intent resolves', async () => {
    const adapter = createLazyOnlineAdapter({load: async () => { throw new Error('Placeholder load failure'); }});
    let resolved = false;
    let published = false;
    adapter.subscribe(() => { throw new Error('Placeholder observer failure'); });
    adapter.subscribe(event => { if (event.view.continuation && !resolved) published = true; });
    try {
      const result = await adapter.continueGame().then(value => { resolved = true; return value; });
      expect(result.accepted).toBe(true);
      expect(published).toBe(true);
    } finally { adapter.dispose(); }
  });

  it('isolates throwing subscribers without replacing or orphaning the loaded real adapter', async () => {
    const test = setup();
    const dispose = vi.spyOn(test.adapter, 'dispose');
    const create = vi.fn(() => test.adapter);
    const adapter = createLazyOnlineAdapter({load: async () => ({createRealCaseAdapter: create})});
    adapter.subscribe(() => { throw new Error('Placeholder observer failure'); });
    try {
      await test.ready();
      expect((await adapter.continueGame()).accepted).toBe(true);
      expect(adapter.read().mode).toBe('online');
      expect(create).toHaveBeenCalledTimes(1);
      expect(dispose).not.toHaveBeenCalled();
    } finally { adapter.dispose(); }
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
