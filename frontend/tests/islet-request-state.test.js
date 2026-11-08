// Actual shared request UI/model and L2 adapter, injected transport and clock only; no network/SDK.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
vi.mock('../src/diagnostics/report-link.js', () => ({createProblemLink: () => {
  const link = document.createElement('a'); link.textContent = 'Report a problem'; return link;
}}));
import {createServerCallState} from '../src/ui/kit/server-call-state.js';
import {createIsletRequests, createIsletRequestClock} from '../src/screens/islet/request-state.js';
import {createIsletAdapter} from '../src/screens/islet/adapter.js';
import {createFakeIsletTransport} from '../src/screens/islet/fake-transport.js';

const ISLET = '/api/islet', STATION = 'islet_signal_station';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const fixtures = [];
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.isConnected = true; }
  append(...children) { for (const child of children) { this.children.push(child); child.parentElement = this; } }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  closest() { return this.dialog ?? this.parentElement?.closest() ?? null; }
  remove() { this.isConnected = false; }
  focus() { document.activeElement = this; }
}
const find = (root, predicate) => predicate(root) ? root : root.children.map(child => find(child, predicate)).find(Boolean);
async function setup() {
  const fake = createFakeIsletTransport(), transport = {
    get: vi.fn(path => fake.get(path)), post: vi.fn((path, body) => fake.post(path, body)),
  };
  const adapter = createIsletAdapter({transport, mode: 'live', makeUid: () => crypto.randomUUID()});
  await adapter.refresh();
  let requests;
  const clock = createIsletRequestClock();
  const call = createServerCallState({now: clock.now, label: 'islet request', onRetry: () => requests.retry()});
  requests = createIsletRequests({adapter, call, presentFailure: failure => clock.fail(call, failure)});
  const fixture = {fake, transport, adapter, call, requests,
    posts: () => transport.post.mock.calls.map(([, body]) => body),
    retry: find(call.element, element => element.dataset.focus === 'retry-server-call'),
    report: find(call.element, element => element.tagName === 'a')};
  fixtures.push(fixture); return fixture;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); vi.stubGlobal('document', {createElement: tag => new Element(tag)}); });
afterEach(() => {
  for (const f of fixtures.splice(0)) { f.requests.dispose(); f.adapter.dispose(); }
  expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('islet shared request lifecycle', () => {
  it('shows only delayed 300ms loading and 5s slow-read state, then clears its timer on success', async () => {
    const f = await setup(), held = deferred(); f.transport.get.mockReturnValueOnce(held.promise);
    const pending = f.requests.refresh();
    expect(f.call.element.hidden).toBe(true); expect(f.call.phase).toBe('loading');
    await vi.advanceTimersByTimeAsync(299); expect(f.call.element.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1); expect(f.call.element.dataset.state).toBe('loading');
    await vi.advanceTimersByTimeAsync(4700); expect(f.call.element.dataset.state).toBe('slow');
    expect(f.report.hidden).toBe(false); expect(f.call.read().message).toMatch(/longer than expected/);
    held.resolve(await f.fake.get(ISLET)); expect((await pending).accepted).toBe(true);
    expect(f.call.phase).toBe('ready'); expect(f.call.element.hidden).toBe(true); expect(vi.getTimerCount()).toBe(0);
    expect(f.transport.get).toHaveBeenCalledTimes(2); expect(f.transport.post).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'network_error', 'offline', /offline/i], [401, 'unauthorized', 'expired', /sign in again/i],
    [404, 'feature_off', 'error', /feature.*unavailable/i], [409, 'stale_save', 'error', /save changed/i],
    [502, 'server_error', 'error', /could not complete/i], [503, 'unavailable', 'error', /service unavailable/i],
  ])('keeps the original %s failure phase through an unbuilt readback, with a real report action', async (status, code, phase, words) => {
    const f = await setup(); f.transport.post.mockResolvedValueOnce({ok: false, status, code, message: `private-${crypto.randomUUID()}`});
    const result = await f.requests.build(STATION);
    expect(result.accepted).toBe(false); expect(f.call.phase).toBe(phase); expect(f.call.read().message).toMatch(words);
    expect(f.report.hidden).toBe(false); expect(f.posts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000); expect(f.posts()).toHaveLength(1);
    expect(f.adapter.read()).toMatchObject({coins: 1000, timber: 20, signalStationBuilt: false});
  });

  it('guards the original 429 deadline during a delayed readback and every programmatic retry path', async () => {
    const f = await setup(), readback = deferred();
    f.transport.post.mockResolvedValueOnce({ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 3});
    f.transport.get.mockReturnValueOnce(readback.promise);
    const failed = deferred(), originalFail = f.call.fail;
    vi.spyOn(f.call, 'fail').mockImplementation(failure => { originalFail(failure); failed.resolve(); });
    const pending = f.requests.build(STATION); await failed.promise;
    expect(f.call.phase).toBe('rate_limited'); expect(f.call.read().remaining).toBe(3);
    await vi.advanceTimersByTimeAsync(1500);
    readback.resolve(await f.fake.get(ISLET)); const settled = await pending;
    expect(settled.failure).toMatchObject({retryAfterSeconds: 2, retryAt: 3000});
    expect(f.call.read().remaining).toBe(2); expect(f.retry.disabled).toBe(true);
    const reads = f.transport.get.mock.calls.length;
    await f.requests.build(STATION); await f.requests.refresh(); await f.requests.retry(); f.retry.onclick();
    expect((await f.adapter.build(STATION)).code).toBe('too_many_requests');
    expect((await f.adapter.refresh()).code).toBe('too_many_requests');
    expect(f.posts()).toHaveLength(1); expect(f.transport.get).toHaveBeenCalledTimes(reads);
    await vi.advanceTimersByTimeAsync(1499); expect(f.call.read().remaining).toBe(1);
    await f.requests.build(STATION); expect(f.posts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.call.read().remaining).toBe(0); expect(f.retry.disabled).toBe(false);
    expect(f.posts()).toHaveLength(1); expect((await f.requests.retry()).accepted).toBe(true);
    expect(f.posts()).toHaveLength(2); expect(f.adapter.read().coins).toBe(700);
  });

  it('reads first on an explicit unknown-outcome retry and then reuses the exact held UID only if still unbuilt', async () => {
    const f = await setup(); f.fake.dev.failNext('server');
    expect((await f.requests.build(STATION)).code).toBe('unconfirmed');
    expect(f.call.read().message).toMatch(/service unavailable/i); expect(f.posts()).toHaveLength(1);
    const reads = f.transport.get.mock.calls.length, uid = f.posts()[0].actionUid;
    expect((await f.requests.retry()).accepted).toBe(true);
    expect(f.transport.get).toHaveBeenCalledTimes(reads + 2); // user read, then L2's accepted-build readback
    expect(f.posts()).toHaveLength(2); expect(f.posts()[1].actionUid).toBe(uid);
    expect(f.adapter.read()).toMatchObject({coins: 700, timber: 10, signalStationBuilt: true});
  });

  it('retains the exact original 429 deadline across close and reopen in the middle of a second', async () => {
    const f = await setup();
    f.transport.post.mockResolvedValueOnce({ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 3});
    await f.requests.build(STATION); await vi.advanceTimersByTimeAsync(1500); f.requests.cancel();
    const reads = f.transport.get.mock.calls.length;
    const reopened = await f.requests.refresh(); expect(reopened.failure.retryAt).toBe(3000);
    expect(f.call.read().remaining).toBe(2); expect(f.transport.get).toHaveBeenCalledTimes(reads);
    await vi.advanceTimersByTimeAsync(1499); expect(f.call.read().remaining).toBe(1);
    await vi.advanceTimersByTimeAsync(1); expect(f.call.read().remaining).toBe(0); expect(f.retry.disabled).toBe(false);
    expect((await f.requests.refresh()).accepted).toBe(true); expect(f.posts()).toHaveLength(1);
  });

  it('never retries a write from a superseded preflight read while a newer authoritative read is pending', async () => {
    const f = await setup(); f.fake.dev.failNext('server'); await f.requests.build(STATION);
    const uid = f.posts()[0].actionUid, old = deferred(), latest = deferred();
    f.transport.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const retry = f.requests.retry(), newer = f.adapter.refresh();
    old.resolve(await f.fake.get(ISLET));
    expect(await retry).toMatchObject({accepted: false, code: 'superseded', stale: true});
    expect(f.posts()).toHaveLength(1); expect(f.call.read().message).toMatch(/still refreshing/);
    latest.resolve(await f.fake.get(ISLET)); await newer;
    expect((await f.requests.retry()).accepted).toBe(true);
    expect(f.posts()).toHaveLength(2); expect(f.posts()[1].actionUid).toBe(uid);
  });

  it('confirms an already applied unknown build on the explicit retry GET without repeating its POST', async () => {
    const f = await setup(); f.fake.dev.failNext('timeout'); f.fake.dev.failNext('network');
    expect((await f.requests.build(STATION)).code).toBe('unconfirmed'); expect(f.posts()).toHaveLength(1);
    expect((await f.requests.retry()).code).toBe('confirmed');
    expect(f.posts()).toHaveLength(1); expect(f.call.read().message).toBe('Built.');
    expect(f.adapter.read()).toMatchObject({coins: 700, timber: 10, signalStationBuilt: true});
  });

  it('cancels private UI state on adapter reset and prevents old finally from unlocking a new pending request', async () => {
    const f = await setup(), old = deferred(), newer = deferred(); f.transport.post.mockReturnValueOnce(old.promise);
    const oldBuild = f.requests.build(STATION);
    f.adapter.resetPrivate(); expect(f.call.phase).toBe('idle'); expect(f.requests.busy).toBe(false);
    await f.adapter.refresh(); f.transport.get.mockReturnValueOnce(newer.promise);
    const newRead = f.requests.refresh(); expect(f.requests.busy).toBe(true);
    old.resolve({ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 3}); await oldBuild;
    expect(f.requests.busy).toBe(true); expect(f.call.phase).toBe('loading');
    newer.resolve(await f.fake.get(ISLET)); await newRead; expect(f.call.phase).toBe('ready');
    expect(f.adapter.read().coins).toBe(1000);
  });

  it('cancels timers and ignores late private responses after disposal', async () => {
    const f = await setup(), held = deferred(); f.transport.get.mockReturnValueOnce(held.promise);
    const pending = f.requests.refresh(); await vi.advanceTimersByTimeAsync(300); expect(f.call.phase).toBe('loading');
    f.requests.dispose(); f.adapter.dispose(); const closed = f.adapter.read();
    held.resolve(await f.fake.get(ISLET)); await pending; await vi.advanceTimersByTimeAsync(6000);
    expect(f.adapter.read()).toEqual(closed); expect(f.call.element.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0); expect(f.transport.post).not.toHaveBeenCalled();
  });
});
