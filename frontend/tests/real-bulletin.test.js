// Public reads use injected clients and clocks; all service answers and hook text are placeholders.
import {describe, expect, it, vi} from 'vitest';
import {createApi} from '../src/online/api.js';
import {createSession} from '../src/online/session.js';
import {createOnlineBulletin, BULLETIN_CACHE_MS} from '../src/online/case-adapter/bulletin.js';
import {recordedBulletin} from './fixtures/server/bulletin.js';

const okay = data => ({ok: true, status: 200, data});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
function setup({enabled = true, publicApi, onRead} = {}) {
  let now = 1000, scope = 0, closed = false, nextTimer = 0;
  const timers = new Map(), listeners = new Map(), windowListeners = new Map();
  const state = {config: {flags: {bulletin: enabled}}};
  const document = {hidden: false, addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); })};
  const window = {addEventListener: vi.fn((name, listener) => windowListeners.set(name, listener)),
    removeEventListener: vi.fn((name, listener) => { if (windowListeners.get(name) === listener) windowListeners.delete(name); })};
  const api = publicApi ?? {get: vi.fn(async () => okay(recordedBulletin()))};
  const privateApi = {get: vi.fn(() => { throw new Error('Private client must stay unused'); })};
  const store = {commit: vi.fn(patch => Object.assign(state, patch)), isClosed: () => closed, scope: () => scope};
  const bulletin = createOnlineBulletin({state, store, publicApi: api, api: privateApi}, {
    document, window, onRead, now: () => now, setTimer: (callback, delay) => {
      const id = ++nextTimer; timers.set(id, {callback, delay}); return id;
    }, clearTimer: id => timers.delete(id),
  });
  return {bulletin, state, store, api, privateApi, timers, document, listeners, window, windowListeners,
    async fireTimer() {
      const [id, job] = timers.entries().next().value; timers.delete(id); now += job.delay;
      const before = api.get.mock.calls.length; job.callback(); await Promise.resolve();
      expect(api.get).toHaveBeenCalledTimes(before + 1); await bulletin.refresh();
    },
    now: () => now, advance: ms => { now += ms; }, changeScope: () => { scope += 1; }, closeStore: () => { closed = true; }};
}

describe('online bulletin lifecycle', () => {
  it.each([false, 'true', 1, undefined])('requests nothing unless the flag is strict true, received %s', async enabled => {
    const test = setup({enabled}); test.state.config.flags.bulletin = enabled;
    await test.bulletin.refresh();
    expect(test.api.get).not.toHaveBeenCalled();
    expect(test.state.bulletin.status).toBe('off');
    delete test.state.config.flags.bulletin;
    await test.bulletin.refresh();
    expect(test.api.get).not.toHaveBeenCalled();
    expect(test.privateApi.get).not.toHaveBeenCalled();
    test.bulletin.dispose();
  });
  it('uses the token-free client even while another session holds an access token', async () => {
    const session = createSession(); session.setToken(`test-${crypto.randomUUID()}`);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(recordedBulletin())));
    const publicApi = createApi({session: {getToken: () => null, clearToken() {}}, fetchImpl});
    const test = setup({publicApi});
    await test.bulletin.refresh();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/bulletin');
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({});
    expect(session.isSignedIn()).toBe(true);
    expect(test.privateApi.get).not.toHaveBeenCalled();
    test.bulletin.dispose();
  });
  it('shares a pending read and reuses a good bulletin for five minutes', async () => {
    const held = deferred(), api = {get: vi.fn().mockImplementationOnce(() => held.promise)
      .mockResolvedValue(okay(recordedBulletin()))};
    const test = setup({publicApi: api});
    const first = test.bulletin.refresh(), second = test.bulletin.refresh();
    expect(test.state.bulletin.status).toBe('loading');
    await Promise.resolve(); expect(api.get).toHaveBeenCalledTimes(1);
    held.resolve(okay(recordedBulletin({hook: true})));
    await Promise.all([first, second]);
    expect(test.state.bulletin).toMatchObject({status: 'ready', stale: false});
    expect(test.state.bulletinObservations).toHaveLength(1);
    test.advance(BULLETIN_CACHE_MS - 1); await test.bulletin.refresh();
    expect(api.get).toHaveBeenCalledTimes(1);
    test.advance(1); await test.bulletin.refresh();
    expect(api.get).toHaveBeenCalledTimes(2);
    test.bulletin.dispose();
  });
  it('keeps the last good bulletin with a stale note on network failure', async () => {
    const test = setup(); await test.bulletin.refresh();
    test.api.get.mockResolvedValue({ok: false, status: 0, code: 'network_error'});
    test.advance(BULLETIN_CACHE_MS); await test.bulletin.refresh();
    expect(test.state.bulletin).toMatchObject({status: 'ready', stale: true});
    expect(test.state.bulletin.message).toMatch(/last posted|unavailable/i);
    expect(test.state.bulletin.lines).toEqual(recordedBulletin().lines);
    test.bulletin.dispose();
  });
  it('honors bulletin_unavailable even after a prior good cached bulletin', async () => {
    const api = {get: vi.fn().mockResolvedValueOnce(okay(recordedBulletin({hook: true})))
      .mockResolvedValue({ok: false, status: 503, code: 'bulletin_unavailable'})};
    const test = setup({publicApi: api}); await test.bulletin.refresh();
    expect(test.state.bulletinObservations).toHaveLength(1);
    await test.bulletin.refresh({force: true});
    expect(test.state.bulletin).toMatchObject({status: 'unavailable', lines: [], chapterTwoHook: null});
    expect(test.state.bulletinObservations).toEqual([]);
    test.bulletin.dispose();
  });
  it('shows unavailable without a good cache and stops after bounded read retries', async () => {
    const api = {get: vi.fn(async () => ({ok: false, status: 503, code: 'bulletin_unavailable'}))};
    const test = setup({publicApi: api}); await test.bulletin.refresh();
    expect(test.state.bulletin).toMatchObject({status: 'unavailable', lines: [], chapterTwoHook: null});
    for (const delay of [5000, 15000, 30000]) {
      expect(test.bulletin.remaining()).toBe(delay);
      test.advance(delay); await test.bulletin.refresh();
    }
    expect(api.get).toHaveBeenCalledTimes(4);
    expect(test.bulletin.remaining()).toBe(Infinity);
    test.advance(600000); await test.bulletin.refresh();
    expect(api.get).toHaveBeenCalledTimes(4);
    await test.bulletin.refresh({force: true});
    expect(api.get).toHaveBeenCalledTimes(5);
    test.bulletin.dispose();
  });
  it.each(['feature_off', 'feature_disabled'])('turns the bulletin off for server code %s', async code => {
    const test = setup(); await test.bulletin.refresh();
    test.api.get.mockResolvedValue({ok: false, status: 404, code});
    await test.bulletin.refresh({force: true});
    expect(test.state.bulletin.status).toBe('off');
    expect(test.state.bulletinObservations).toEqual([]);
    test.bulletin.dispose();
  });
  it('pauses requests while hidden and removes owned listeners and timers on disposal', async () => {
    const test = setup(); await test.bulletin.refresh();
    expect(test.timers.size).toBe(1);
    test.document.hidden = true; test.listeners.get('visibilitychange')();
    expect(test.timers.size).toBe(0);
    test.advance(BULLETIN_CACHE_MS); await test.bulletin.refresh();
    expect(test.api.get).toHaveBeenCalledTimes(1);
    test.document.hidden = false; test.listeners.get('visibilitychange')();
    expect([...test.timers.values()][0].delay).toBe(0);
    test.bulletin.dispose();
    expect(test.timers.size).toBe(0); expect(test.listeners.size).toBe(0); expect(test.windowListeners.size).toBe(0);
  });
  it.each(['scope', 'off', 'disposed'])('ignores a late response after %s', async change => {
    const held = deferred(), test = setup({publicApi: {get: vi.fn(() => held.promise)}});
    const pending = test.bulletin.refresh();
    await Promise.resolve();
    const calls = test.store.commit.mock.calls.length;
    if (change === 'scope') test.changeScope();
    if (change === 'off') { test.state.config.flags.bulletin = false; test.bulletin.stop(); }
    if (change === 'disposed') test.bulletin.dispose();
    const afterChange = test.store.commit.mock.calls.length;
    held.resolve(okay(recordedBulletin({hook: true}))); await pending;
    expect(test.store.commit).toHaveBeenCalledTimes(afterChange);
    expect(test.state.bulletin.chapterTwoHook).toBeNull();
    if (change !== 'off') expect(afterChange).toBe(calls);
    test.bulletin.dispose();
  });
  it('lets a fresh scope read win while an older public read is still pending', async () => {
    const held = deferred(), api = {get: vi.fn().mockImplementationOnce(() => held.promise)
      .mockResolvedValue(okay(recordedBulletin({text: 'New recorded bulletin.'})))};
    const test = setup({publicApi: api});
    const first = test.bulletin.refresh(); await Promise.resolve();
    test.changeScope();
    await test.bulletin.refresh();
    expect(test.state.bulletin.lines[0].text).toBe('New recorded bulletin.');
    held.resolve(okay(recordedBulletin({text: 'Old recorded bulletin.'}))); await first;
    expect(test.state.bulletin.lines[0].text).toBe('New recorded bulletin.');
    test.bulletin.dispose();
  });
  it('settles an optional read observer once when a pending bulletin is stopped', async () => {
    const held = deferred(), finish = vi.fn();
    const test = setup({publicApi: {get: vi.fn(() => held.promise)}, onRead: () => finish});
    const pending = test.bulletin.refresh(); await Promise.resolve();
    test.bulletin.stop();
    expect(finish).toHaveBeenCalledExactlyOnceWith({status: 0, accepted: true, reason: null, cancelled: true});
    held.resolve(okay(recordedBulletin())); await pending;
    expect(finish).toHaveBeenCalledTimes(1);
    test.bulletin.dispose();
  });
  it.each(['stop', 'dispose', 'off', 'hidden', 'scope', 'closed'])('does not dispatch a queued read after synchronous %s', async change => {
    const test = setup(), pending = test.bulletin.refresh();
    if (change === 'stop') test.bulletin.stop();
    if (change === 'dispose') test.bulletin.dispose();
    if (change === 'off') test.state.config.flags.bulletin = false;
    if (change === 'hidden') test.document.hidden = true;
    if (change === 'scope') test.changeScope();
    if (change === 'closed') test.closeStore();
    await pending;
    expect(test.api.get).not.toHaveBeenCalled(); expect(test.privateApi.get).not.toHaveBeenCalled();
    if (change === 'off' || change === 'dispose') expect(test.bulletin.read().status).toBe('off');
    test.bulletin.dispose();
  });
  it('cancels dispatch and settles presentation once when the read observer stops it reentrantly', async () => {
    const finish = vi.fn(); let test;
    test = setup({onRead: () => { test.bulletin.stop(); return finish; }});
    await test.bulletin.refresh();
    expect(test.api.get).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledExactlyOnceWith({status: 0, accepted: true, reason: null, cancelled: true});
    expect(test.bulletin.read().status).toBe('off'); test.bulletin.dispose();
  });
  it('preserves a newer read started by a cancellation observer instead of retaining the stopped promise', async () => {
    const held = deferred(), api = {get: vi.fn().mockImplementationOnce(() => held.promise)
      .mockResolvedValue(okay(recordedBulletin({text: 'Observer restart bulletin.'})))};
    let newer, test; const finish = vi.fn(() => { newer ??= test.bulletin.refresh(); });
    test = setup({publicApi: api, onRead: () => finish}); const older = test.bulletin.refresh(); await Promise.resolve();
    test.bulletin.stop(); await newer;
    expect(api.get).toHaveBeenCalledTimes(2); expect(test.state.bulletin.lines[0].text).toBe('Observer restart bulletin.');
    held.resolve(okay(recordedBulletin({text: 'Stopped older bulletin.'}))); await older;
    expect(test.state.bulletin.lines[0].text).toBe('Observer restart bulletin.'); test.bulletin.dispose();
  });
  it('drops completed cache and its hook when the store scope changes, then reads the new scope', async () => {
    const api = {get: vi.fn().mockResolvedValueOnce(okay(recordedBulletin({hook: true})))
      .mockResolvedValue(okay(recordedBulletin({text: 'New scope public bulletin.'})))};
    const test = setup({publicApi: api}); await test.bulletin.refresh();
    expect(test.bulletin.read().chapterTwoHook).not.toBeNull(); test.changeScope();
    expect(test.bulletin.read()).toMatchObject({status: 'off', chapterTwoHook: null});
    expect(test.bulletin.remaining()).toBe(0); await test.bulletin.refresh();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(test.state.bulletin.lines[0].text).toBe('New scope public bulletin.');
    expect(test.state.bulletinObservations).toEqual([]); test.bulletin.dispose();
  });
  it('runs only the three scheduled retries, keeps focus from restarting the exhausted budget, and allows a manual reset', async () => {
    const api = {get: vi.fn(async () => ({ok: false, status: 0, code: 'network_error'}))};
    const test = setup({publicApi: api}); await test.bulletin.refresh();
    for (const delay of [5000, 15000, 30000]) {
      expect([...test.timers.values()].map(job => job.delay)).toEqual([delay]);
      await test.fireTimer();
    }
    expect(api.get).toHaveBeenCalledTimes(4); expect(test.timers.size).toBe(0);
    test.advance(BULLETIN_CACHE_MS); test.windowListeners.get('focus')(); await test.bulletin.refresh();
    expect(api.get).toHaveBeenCalledTimes(4); expect(test.bulletin.remaining()).toBe(Infinity);
    await test.bulletin.refresh({force: true}); expect(api.get).toHaveBeenCalledTimes(5);
    expect(test.bulletin.remaining()).toBe(5000); test.bulletin.dispose();
  });
  it('keeps cache freshness on focus and blocks focus reads while hidden until visible again', async () => {
    const test = setup(); await test.bulletin.refresh();
    test.windowListeners.get('focus')(); await test.bulletin.refresh(); expect(test.api.get).toHaveBeenCalledTimes(1);
    test.document.hidden = true; test.listeners.get('visibilitychange')(); test.advance(BULLETIN_CACHE_MS);
    test.windowListeners.get('focus')(); await test.bulletin.refresh(); expect(test.api.get).toHaveBeenCalledTimes(1);
    test.document.hidden = false; test.listeners.get('visibilitychange')();
    expect([...test.timers.values()].map(job => job.delay)).toEqual([0]);
    await test.fireTimer(); expect(test.api.get).toHaveBeenCalledTimes(2); test.bulletin.dispose();
  });
  it('starts a fresh retry budget in a new scope and clears its local snapshot on disposal', async () => {
    const test = setup({publicApi: {get: vi.fn(async () => ({ok: false, status: 503, code: 'bulletin_unavailable'}))}});
    await test.bulletin.refresh(); for (let attempt = 0; attempt < 3; attempt++) await test.fireTimer();
    expect(test.bulletin.remaining()).toBe(Infinity); test.changeScope(); await test.bulletin.refresh();
    expect(test.api.get).toHaveBeenCalledTimes(5); expect(test.bulletin.remaining()).toBe(5000);
    test.api.get.mockResolvedValue(okay(recordedBulletin({hook: true}))); await test.bulletin.refresh({force: true});
    test.bulletin.dispose(); expect(test.bulletin.read()).toMatchObject({status: 'off', lines: [], chapterTwoHook: null});
  });
  it('does not replace a good cache with a malformed successful answer', async () => {
    const test = setup(); await test.bulletin.refresh();
    test.api.get.mockResolvedValue(okay({day: {}, lines: []}));
    await test.bulletin.refresh({force: true});
    expect(test.state.bulletin).toMatchObject({status: 'ready', stale: true});
    expect(test.state.bulletin.lines).toEqual(recordedBulletin().lines);
    test.bulletin.dispose();
  });
});

describe('public bulletin request presentation and server waits', () => {
  it.each([
    [0, 'network_error', 'offline', 'You are offline. Your progress on this device is kept.'],
    [401, 'unauthorized', 'internal_error', 'The public bulletin could not be read. Try again or report a problem.'],
    [404, 'feature_off', 'feature_off', 'The harbor bulletin is closed. You can keep exploring.'],
    [409, 'stale_save', 'internal_error', 'The public bulletin could not be read. Try again or report a problem.'],
    [429, 'too_many_requests', 'rate_limited', 'Too many attempts. Try again in a moment.'],
    [502, 'database_error', 'internal_error', 'The public bulletin could not be read. Try again or report a problem.'],
    [503, 'bulletin_unavailable', 'not_connected', 'The harbor bulletin is unavailable right now. Try again in a moment.'],
  ])('presents public HTTP%s without copying server prose or private state', async (status, code, reason, message) => {
    const secret = `private-${crypto.randomUUID()}`, finish = vi.fn();
    const test = setup({publicApi: {get: vi.fn(async () => ({ok: false, status, code, message: secret,
      retryAfterSeconds: 3, raw: {secret}}))}, onRead: () => finish});
    const privateState = {account: {state: 'signed_in'}, crew: {id: crypto.randomUUID()},
      cloudSave: {version: 8, data: {}}, deviceSave: {data: {kind: 'intro', actions: []}}};
    Object.assign(test.state, structuredClone(privateState));
    try {
      const result = await test.bulletin.refresh();
      expect(result.reason).toBe(reason);
      expect(result.bulletin.request).toEqual({reason, message, status, ...(status === 429 ? {retryUntil: 4000} : {})});
      expect(JSON.stringify(result.bulletin.request)).not.toContain(secret);
      expect(test.state.bulletin.status).toBe(status === 404 ? 'off' : 'unavailable');
      expect(test.state.bulletin.lines).toEqual([]); expect(test.state.bulletinObservations).toEqual([]);
      for (const key of Object.keys(privateState)) expect(test.state[key]).toEqual(privateState[key]);
      expect(test.privateApi.get).not.toHaveBeenCalled();
      expect(finish).toHaveBeenCalledExactlyOnceWith({status, accepted: false, reason});
    } finally { test.bulletin.dispose(); }
  });

  it.each([401, 409])('keeps a real private session intact for anonymous A2 HTTP%s', async status => {
    const privateSession = createSession(); privateSession.setToken(`fixture-${crypto.randomUUID()}`);
    const scope = privateSession.getScope(), fetchImpl = vi.fn(async () => new Response(JSON.stringify({error: {
      code: status === 401 ? 'unauthorized' : 'stale_save', message: `private-${crypto.randomUUID()}`,
    }}), {status, headers: {'Content-Type': 'application/json'}}));
    const publicApi = createApi({session: {getToken: () => null, clearToken() {}}, fetchImpl});
    const test = setup({publicApi});
    try {
      expect((await test.bulletin.refresh()).bulletin.request.reason).toBe('internal_error');
      expect(fetchImpl.mock.calls[0][1].headers).toEqual({});
      expect(privateSession.isSignedIn()).toBe(true); expect(privateSession.getScope()).toBe(scope);
      expect(test.privateApi.get).not.toHaveBeenCalled();
    } finally { test.bulletin.dispose(); }
  });

  it('holds the original fractional client deadline across forced, focus and observer retry attempts', async () => {
    let observedRetry;
    const onRead = vi.fn(({retry}) => { observedRetry = retry; return vi.fn(); });
    const api = {get: vi.fn().mockResolvedValueOnce({ok: false, status: 429, retryAfterSeconds: 1.2})
      .mockResolvedValue(okay(recordedBulletin()))};
    const test = setup({publicApi: api, onRead}); test.advance(.5);
    try {
      await test.bulletin.refresh();
      const before = test.bulletin.read(), deadline = 3000.5;
      expect(before.request.retryUntil).toBe(deadline); expect(test.bulletin.remaining()).toBe(5000);
      test.advance(1999.5); // 0.5ms remains; integer seconds must never restart the original wait.
      await test.bulletin.refresh({force: true}); await observedRetry();
      test.windowListeners.get('focus')(); await test.bulletin.refresh();
      expect(api.get).toHaveBeenCalledTimes(1); expect(onRead).toHaveBeenCalledTimes(1);
      expect(test.bulletin.read()).toEqual(before); expect(test.bulletin.remaining()).toBe(3000.5);
      test.advance(.5); await test.bulletin.refresh({force: true});
      expect(api.get).toHaveBeenCalledTimes(2); expect(test.bulletin.read().request).toBeNull();
      expect(test.bulletin.remaining()).toBe(BULLETIN_CACHE_MS);
    } finally { test.bulletin.dispose(); }
  });

  it('uses one automatic timer at the later of backoff and Retry-After', async () => {
    const api = {get: vi.fn().mockResolvedValueOnce({ok: false, status: 429, retryAfterSeconds: 7.5})
      .mockResolvedValue(okay(recordedBulletin()))};
    const test = setup({publicApi: api});
    try {
      await test.bulletin.refresh();
      expect(test.bulletin.read().request.retryUntil).toBe(9000);
      expect([...test.timers.values()].map(job => job.delay)).toEqual([8000]);
      await test.fireTimer(); expect(api.get).toHaveBeenCalledTimes(2);
      expect(test.bulletin.read().request).toBeNull(); expect(test.timers.size).toBe(1);
    } finally { test.bulletin.dispose(); }
  });

  it.each([[0, 0], [1.5, 2000], [86400, 86400000]])('bounds and rounds response Retry-After %s once', async (seconds, milliseconds) => {
    const test = setup({publicApi: {get: vi.fn(async () => ({ok: false, status: 429, retryAfterSeconds: seconds}))}});
    try {
      await test.bulletin.refresh(); expect(test.bulletin.read().request.retryUntil).toBe(1000 + milliseconds);
    } finally { test.bulletin.dispose(); }
  });

  it.each([-1, 86400.1, NaN, Infinity, '3', null, undefined])('does not invent a wait for malformed Retry-After %s', async retryAfterSeconds => {
    const test = setup({publicApi: {get: vi.fn(async () => ({ok: false, status: 429, retryAfterSeconds}))}});
    try {
      await test.bulletin.refresh(); expect(test.bulletin.read().request.retryUntil).toBe(1000);
      expect(test.bulletin.remaining()).toBe(5000);
    } finally { test.bulletin.dispose(); }
  });

  it('keeps the last good cache during a wait and returns detached request objects', async () => {
    const api = {get: vi.fn().mockResolvedValueOnce(okay(recordedBulletin({hook: true})))
      .mockResolvedValue({ok: false, status: 429, retryAfterSeconds: 3})};
    const test = setup({publicApi: api});
    try {
      await test.bulletin.refresh(); await test.bulletin.refresh({force: true});
      const before = test.bulletin.read(); expect(before).toMatchObject({status: 'ready', stale: true});
      expect(before.lines).toEqual(recordedBulletin().lines); expect(test.state.bulletinObservations).toHaveLength(1);
      const caller = test.bulletin.read(); caller.request.retryUntil = 0; caller.request.message = 'Changed'; caller.lines.length = 0;
      await test.bulletin.refresh({force: true}); expect(api.get).toHaveBeenCalledTimes(2);
      expect(test.bulletin.read()).toEqual(before);
    } finally { test.bulletin.dispose(); }
  });

  it('preserves exhausted retry attempts and its held wait until a real manual read can begin', async () => {
    const api = {get: vi.fn(async () => ({ok: false, status: 429, retryAfterSeconds: 1}))};
    const test = setup({publicApi: api});
    try {
      await test.bulletin.refresh(); for (let attempt = 0; attempt < 3; attempt++) await test.fireTimer();
      const deadline = test.bulletin.read().request.retryUntil;
      expect(test.bulletin.remaining()).toBe(Infinity); expect(test.timers.size).toBe(0);
      test.advance(500); await test.bulletin.refresh({force: true}); test.windowListeners.get('focus')(); await test.bulletin.refresh();
      expect(api.get).toHaveBeenCalledTimes(4); expect(test.bulletin.remaining()).toBe(Infinity);
      expect(test.bulletin.read().request.retryUntil).toBe(deadline); expect(test.timers.size).toBe(0);
      test.advance(500); await test.bulletin.refresh({force: true});
      expect(api.get).toHaveBeenCalledTimes(5); expect(test.bulletin.remaining()).toBe(5000);
    } finally { test.bulletin.dispose(); }
  });

  it('does not pause or extend the server wait while hidden and sends only the resumed eligible read', async () => {
    const api = {get: vi.fn().mockResolvedValueOnce({ok: false, status: 429, retryAfterSeconds: 3})
      .mockResolvedValue(okay(recordedBulletin()))};
    const test = setup({publicApi: api});
    try {
      await test.bulletin.refresh(); const before = test.bulletin.read();
      test.document.hidden = true; test.listeners.get('visibilitychange')(); test.advance(10000);
      await test.bulletin.refresh({force: true}); test.windowListeners.get('focus')(); await test.bulletin.refresh();
      expect(api.get).toHaveBeenCalledTimes(1); expect(test.bulletin.read()).toEqual(before); expect(test.timers.size).toBe(0);
      test.document.hidden = false; test.listeners.get('visibilitychange')();
      expect([...test.timers.values()].map(job => job.delay)).toEqual([0]); await test.fireTimer();
      expect(api.get).toHaveBeenCalledTimes(2); expect(test.bulletin.read().request).toBeNull();
    } finally { test.bulletin.dispose(); }
  });

  it('cannot install an older scope wait after a current scope succeeds', async () => {
    const older = deferred(), api = {get: vi.fn().mockReturnValueOnce(older.promise)
      .mockResolvedValue(okay(recordedBulletin({text: 'Current recorded bulletin.'})))};
    const test = setup({publicApi: api});
    try {
      const pending = test.bulletin.refresh(); await Promise.resolve(); test.changeScope(); await test.bulletin.refresh();
      const current = test.bulletin.read(); older.resolve({ok: false, status: 429, retryAfterSeconds: 86400}); await pending;
      expect(test.bulletin.read()).toEqual(current); expect(current.request).toBeNull();
      expect(test.bulletin.remaining()).toBe(BULLETIN_CACHE_MS); expect(api.get).toHaveBeenCalledTimes(2);
    } finally { test.bulletin.dispose(); }
  });

  it('retains the closed-feature request only while enabled and masks it immediately on config-off', async () => {
    const api = {get: vi.fn().mockResolvedValueOnce({ok: false, status: 404, code: 'feature_off'})
      .mockResolvedValue(okay(recordedBulletin()))};
    const test = setup({publicApi: api});
    try {
      await test.bulletin.refresh(); expect(test.bulletin.read()).toMatchObject({status: 'off', request: {reason: 'feature_off', status: 404}});
      test.windowListeners.get('focus')(); await test.bulletin.refresh(); expect(api.get).toHaveBeenCalledTimes(1);
      test.state.config.flags.bulletin = false; expect(test.bulletin.read()).toMatchObject({status: 'off', request: null});
      await test.bulletin.refresh({force: true}); expect(test.state.bulletin.request).toBeNull(); expect(api.get).toHaveBeenCalledTimes(1);
      test.state.config.flags.bulletin = true; await test.bulletin.refresh();
      expect(test.bulletin.read()).toMatchObject({status: 'ready', request: null}); expect(api.get).toHaveBeenCalledTimes(2);
    } finally { test.bulletin.dispose(); }
  });

  it.each(['config cycle', 'scope change'])('keeps server feature-off terminal until %s, including retained forced callbacks', async boundary => {
    let retainedRetry;
    const onRead = vi.fn(({retry}) => { retainedRetry = retry; return vi.fn(); });
    const api = {get: vi.fn().mockResolvedValueOnce({ok: false, status: 404, code: 'feature_off'})
      .mockResolvedValue(okay(recordedBulletin({text: 'Re-enabled recorded bulletin.'})))};
    const test = setup({publicApi: api, onRead});
    try {
      await test.bulletin.refresh(); const closed = test.bulletin.read();
      expect(closed).toMatchObject({status: 'off', lines: [], chapterTwoHook: null, request: {reason: 'feature_off', status: 404}});
      expect(test.timers.size).toBe(0);
      expect((await test.bulletin.refresh({force: true})).reason).toBe('feature_off');
      expect((await retainedRetry()).reason).toBe('feature_off');
      test.windowListeners.get('focus')(); await test.bulletin.refresh();
      test.advance(60000); test.windowListeners.get('focus')(); await test.bulletin.refresh({force: true});
      expect(api.get).toHaveBeenCalledTimes(1); expect(onRead).toHaveBeenCalledTimes(1);
      expect(test.bulletin.read()).toEqual(closed); expect(test.timers.size).toBe(0);
      expect(test.bulletin.remaining()).toBe(Infinity);
      if (boundary === 'config cycle') {
        test.state.config.flags.bulletin = false; await test.bulletin.refresh({force: true});
        expect(test.bulletin.read()).toMatchObject({status: 'off', request: null});
        test.state.config.flags.bulletin = true;
      } else test.changeScope();
      expect((await test.bulletin.refresh()).ok).toBe(true);
      expect(api.get).toHaveBeenCalledTimes(2); expect(onRead).toHaveBeenCalledTimes(2);
      expect(test.bulletin.read()).toMatchObject({status: 'ready', request: null});
      expect(test.bulletin.read().lines[0].text).toBe('Re-enabled recorded bulletin.');
      expect(test.bulletin.remaining()).toBe(BULLETIN_CACHE_MS);
    } finally { test.bulletin.dispose(); }
  });

  it.each(['dispose', 'closed store'])('clears display failure and ignores a late wait after %s', async boundary => {
    const held = deferred(), test = setup({publicApi: {get: vi.fn(() => held.promise)}});
    const pending = test.bulletin.refresh(); await Promise.resolve();
    if (boundary === 'dispose') test.bulletin.dispose(); else test.closeStore();
    const commits = test.store.commit.mock.calls.length;
    held.resolve({ok: false, status: 429, retryAfterSeconds: 3}); await pending;
    expect(test.store.commit).toHaveBeenCalledTimes(commits); expect(test.bulletin.read()).toMatchObject({status: 'off', request: null});
    test.bulletin.dispose();
  });
});
