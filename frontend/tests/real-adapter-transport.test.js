// Injected A2 fetch replies prove uncertain write recovery and lifecycle safety without a socket.
import {describe, expect, it, vi} from 'vitest';
import {createApi} from '../src/online/api.js';
import {createSession} from '../src/online/session.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';

const me = {id: 'player-placeholder', captainName: 'Placeholder captain', coins: 5,
  kit: null, place: null, crews: []};
const okay = body => ({status: 200, body});
const failure = (status, code) => ({status, body: {error: {code, message: 'Placeholder refusal.'}}});
const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };

function setup(postReplies = []) {
  const session = createSession();
  session.setToken(String(Math.random()));
  const calls = [];
  const reads = new Map([
    ['/api/config', okay({flags: {sign_in: true}})], ['/api/me', okay(me)],
    ['/api/save', okay({version: 1, data: {}})], ['/api/crews/me', okay({crew: null})],
  ]);
  const fetchImpl = async (route, options) => {
    calls.push({method: options.method, route, body: options.body ? JSON.parse(options.body) : null});
    let reply = options.method === 'GET' ? reads.get(route)
      : route === '/api/me/name' ? okay({captainName: me.captainName, rerollsLeft: 1}) : postReplies.shift();
    if (typeof reply === 'function') reply = await reply();
    if (reply instanceof Error) throw reply;
    reply ??= failure(404, 'feature_off');
    return new Response(JSON.stringify(reply.body), {status: reply.status});
  };
  const api = createApi({session, fetchImpl});
  const publicApi = createApi({session: {getToken: () => null, clearToken() {}}, fetchImpl});
  const adapter = createRealCaseAdapter({session, api, publicApi, document: {}, window: {}});
  const ready = async () => {
    await vi.waitFor(() => expect(adapter.read().account.canReroll).toBe(true));
    expect(calls.filter(call => call.route === '/api/me/name')).toEqual([
      {method: 'POST', route: '/api/me/name', body: null},
    ]);
    await flush();
  };
  return {adapter, session, calls, reads, ready};
}

describe('real adapter transport', () => {
  it.each([failure(503, 'database_unavailable'), new TypeError('Placeholder network failure')])(
    'reads before one retry of an uncertain write and retains its action UID', async first => {
      const test = setup([first, okay({captainName: me.captainName, rerollsLeft: 0})]);
      try {
        await test.ready();
        test.calls.length = 0;
        expect((await test.adapter.rerollName()).accepted).toBe(true);
        expect(test.calls.slice(0, 3).map(call => `${call.method} ${call.route}`)).toEqual([
          'POST /api/me/name/reroll', 'GET /api/me', 'POST /api/me/name/reroll',
        ]);
        const writes = test.calls.filter(call => call.method === 'POST');
        expect(writes).toHaveLength(2);
        expect(writes[0].body.actionUid).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
        expect(writes[1].body.actionUid).toBe(writes[0].body.actionUid);
      } finally { test.adapter.dispose(); }
    },
  );

  it('stops after one uncertain retry and grants no captain change', async () => {
    const test = setup([failure(503, 'database_unavailable'), failure(503, 'database_unavailable')]);
    try {
      await test.ready();
      test.calls.length = 0;
      const result = await test.adapter.rerollName();
      expect(result).toMatchObject({accepted: false, reason: 'not_connected'});
      expect(test.calls.filter(call => call.method === 'POST')).toHaveLength(2);
      expect(result.view.account.captainName).toBe(me.captainName);
    } finally { test.adapter.dispose(); }
  });

  it.each(['already_applied', 'already_seated', 'already_started'])('accepts %s then rereads', async code => {
    const test = setup([failure(409, code)]);
    try {
      await test.ready();
      test.calls.length = 0;
      expect((await test.adapter.muster()).accepted).toBe(true);
      expect(test.calls[0]).toMatchObject({method: 'POST', route: '/api/crews/me/start'});
      expect(test.calls.slice(1).some(call => call.method === 'GET' && call.route === '/api/crews/me')).toBe(true);
      expect(test.calls.filter(call => call.method === 'POST')).toHaveLength(1);
    } finally { test.adapter.dispose(); }
  });

  it('maps A2 unauthorized replies to expired and clears its private session', async () => {
    const test = setup([failure(401, 'unauthorized')]);
    try {
      await test.ready();
      expect(await test.adapter.rerollName()).toMatchObject({accepted: false, reason: 'session_expired'});
      expect(test.session.isSignedIn()).toBe(false);
      expect(test.adapter.read().account.state).toBe('expired');
    } finally { test.adapter.dispose(); }
  });

  it.each([null, {}, {captainName: 'Broken placeholder'}, {...me, coins: -1}])(
    'keeps the last valid player view on malformed successful reads', async body => {
      const test = setup();
      try {
        await test.ready();
        const before = test.adapter.read();
        test.reads.set('/api/me', okay(body));
        await test.adapter.continueGame();
        expect(test.adapter.read().account.captainName).toBe(before.account.captainName);
        expect(test.adapter.read().captain.coins).toBe(before.captain.coins);
        expect(test.adapter.read().crew).toEqual(before.crew);
      } finally { test.adapter.dispose(); }
    },
  );

  it('ignores a late private read after disposal and emits no further events', async () => {
    const test = setup();
    try {
      await test.ready();
      let finish;
      test.reads.set('/api/me', () => new Promise(resolve => { finish = resolve; }));
      let events = 0;
      test.adapter.subscribe(() => { events += 1; });
      const pending = test.adapter.continueGame();
      await vi.waitFor(() => expect(typeof finish).toBe('function'));
      const before = test.adapter.read();
      const delivered = events;
      test.adapter.dispose();
      finish(okay({...me, captainName: 'Late placeholder', coins: 99}));
      await pending;
      await flush();
      expect(test.adapter.read()).toEqual(before);
      expect(events).toBe(delivered);
    } finally { test.adapter.dispose(); }
  });
});
