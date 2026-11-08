// Private write owner with generated UIDs and explicit injected protocol/DTO ports only.
import {randomUUID} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createCaseIntents} from '../src/online/case-adapter/case-intents.js';
import {buildCaseRequest} from '../src/online/case-adapter/case-wire.js';

const good = data => ({ok: true, status: 200, data});
const failed = (status, code = 'database_unavailable', extra = {}) => ({ok: false, status, code, ...extra});
const snapshot = revision => ({recordedRevision: revision, publicLine: 'Recorded earned line.'});
const answer = (revision = 1, extra = {}) => good({accepted: true, reason: null,
  message: 'Recorded accepted action.', case: snapshot(revision), ...extra});
const barriers = [], fixtures = [];
function deferred() {let resolve; const promise = new Promise(done => {resolve = done;});
  const gate = {promise, resolve}; barriers.push(gate); return gate;}
function setup() {
  let scope = Object.freeze({identity: randomUUID(), crew: randomUUID()}), life = 0, visible = true, time = 1000.25;
  const posts = [], reads = [], applied = [], calls = [];
  const api = {post: vi.fn((route, body) => {
    calls.push({method: 'POST', route, body: structuredClone(body)});
    const next = posts.shift(); return next ? next(route, body) : Promise.resolve(answer(3));
  })};
  const ports = {api, getScope: () => scope, capture: () => ({scope, life}),
    isCurrent: ticket => visible && ticket?.scope === scope && ticket.life === life,
    validateCase: vi.fn(raw => raw === null ? {ok: true, value: null}
      : raw && Number.isInteger(raw.recordedRevision) && raw.recordedRevision >= 0
        ? {ok: true, value: {...raw, normalized: true}} : {ok: false}),
    applyCase: vi.fn((value, owner) => {applied.push({value, source: owner.source, current: owner.isCurrent()});}),
    readCase: vi.fn(options => {calls.push({method: 'GET', options});
      const next = reads.shift(); return next ? next(options) : Promise.resolve(good({case: snapshot(2)}));}),
    now: () => time};
  const intents = createCaseIntents(ports);
  const f = {intents, ports, api, posts, reads, applied, calls,
    setTime(value) {time = value;}, setVisible(value) {visible = value;},
    replaceScope() {scope = Object.freeze({identity: randomUUID(), crew: randomUUID()}); life += 1;},
    replaceCrew() {scope = Object.freeze({identity: scope.identity, crew: randomUUID()}); life += 1;},
    postCalls: () => calls.filter(call => call.method === 'POST'),
    dispose() {intents.dispose();}};
  fixtures.push(f); return f;
}
afterEach(() => {for (const f of fixtures.splice(0)) f.dispose();
  for (const gate of barriers.splice(0)) gate.resolve(failed(0));});
const routes = [
  ['pin', {cardId: 'C1'}, '/api/board/pin'], ['pair', {cards: ['C2', 'C8']}, '/api/board/pair'],
  ['search', {routeId: 'C1.recorded_route', paidConfirmed: false, expectedPrice: null}, '/api/case/search'],
  ['orderPartner', {seat: 4, order: 'fetch', target: 'recorded_target', allowPaid: false}, '/api/crews/me/orders'],
  ['callNightfall', {}, '/api/finale/nightfall'], ['takePost', {light: 'keepers_lamp'}, '/api/finale/post'],
  ['aim', {light: 'keepers_lamp', bearing: -90}, '/api/finale/signal'],
  ['accuse', {suspect: 'recorded_suspect'}, '/api/case/accuse'],
];

describe('published case intent transport ownership', () => {
  it('releases a settled terminal receipt without retaining a replay or issuing another request', async () => {
    const f = setup(), body = {cardId: 'C1', actionUid: randomUUID()};
    const packet = await f.intents.send('pin', body);
    expect(packet.mapped.accepted).toBe(true); expect(packet.answer.case).toEqual(snapshot(3));
    expect(f.intents.release(body.actionUid)).toBe(true);
    expect(f.intents.release(body.actionUid)).toBe(false);
    const missing = await f.intents.retry(body.actionUid);
    expect(missing.mapped).toMatchObject({accepted: false, reason: 'not_ready'});
    expect(missing).not.toHaveProperty('answer'); expect(missing).not.toHaveProperty('reply');
    expect(f.postCalls()).toHaveLength(1); expect(f.ports.readCase).not.toHaveBeenCalled(); expect(f.applied).toHaveLength(1);
  });

  it('protects a busy or uncertain attempt until its explicit same-UID retry is definitively answered', async () => {
    const f = setup(), held = deferred(), started = deferred(), body = {cardId: 'C1', actionUid: randomUUID()};
    f.posts.push(() => {started.resolve(); return held.promise;});
    const first = f.intents.send('pin', body); await started.promise;
    expect(f.intents.release(body.actionUid)).toBe(false);
    held.resolve(failed(503)); expect((await first).uncertain).toBe(true);
    expect(f.intents.release(body.actionUid)).toBe(false);
    expect((await f.intents.retry(body.actionUid)).mapped.accepted).toBe(true);
    expect(f.postCalls()).toHaveLength(2); expect(f.postCalls()[1].body).toEqual(f.postCalls()[0].body);
    expect(f.intents.release(body.actionUid)).toBe(true);
    expect((await f.intents.retry(body.actionUid)).mapped.reason).toBe('not_ready');
    expect(f.postCalls()).toHaveLength(2); expect(f.ports.readCase).toHaveBeenCalledOnce();
  });

  it.each([403, 422])('releases a definitive HTTP%i refusal without retaining its reply', async status => {
    const f = setup(), body = {cardId: 'C1', actionUid: randomUUID()};
    f.posts.push(() => Promise.resolve(failed(status, status === 403 ? 'forbidden' : 'validation_error')));
    expect((await f.intents.send('pin', body)).mapped.accepted).toBe(false);
    expect(f.intents.release(body.actionUid)).toBe(true);
    expect((await f.intents.retry(body.actionUid)).mapped.reason).toBe('not_ready');
    expect(f.postCalls()).toHaveLength(1); expect(f.ports.readCase).not.toHaveBeenCalled();
  });

  it.each(routes)('sends the exact %s wire body once and applies only the validated fresh write case', async (intent, fields, route) => {
    const f = setup(), body = {...fields, actionUid: randomUUID()}, expected = buildCaseRequest(intent, body);
    const packet = await f.intents.send(intent, body);
    expect(f.postCalls()).toEqual([{method: 'POST', route, body: expected.body}]);
    expect(f.api.post.mock.calls[0][1]).not.toBe(body); expect(packet.mapped.accepted).toBe(true);
    expect(packet.mapped).not.toHaveProperty('recovery'); expect(f.ports.readCase).not.toHaveBeenCalled();
    expect(f.applied).toEqual([{value: {...snapshot(3), normalized: true}, source: 'write', current: true}]);
    expect(body.actionUid).toBe(expected.body.actionUid);
  });

  it('rejects invalid/extra fields before HTTP and fails closed when lifecycle or DTO ports are absent', async () => {
    const f = setup(), actionUid = randomUUID();
    for (const [intent, body] of [['pin', {cardId: 'C9', actionUid}], ['pin', {cardId: 'C1', actionUid, playerId: randomUUID()}],
      ['callNightfall', {}], ['unsupported', {actionUid}]]) {
      expect((await f.intents.send(intent, body)).mapped).toMatchObject({accepted: false, reason: 'invalid_request'});
    }
    expect(f.api.post).not.toHaveBeenCalled();
    const missingScope = Object.freeze({});
    const unavailable = createCaseIntents({api: f.api, getScope: () => missingScope});
    try {expect((await unavailable.send('pin', {cardId: 'C1', actionUid})).mapped.accepted).toBe(false);}
    finally {unavailable.dispose();}
    expect(f.api.post).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent identical sends, refuses UID mutation, and caches a repeated refusal without recovery or GET', async () => {
    const f = setup(), held = deferred(), started = deferred(), body = {cardId: 'C1', actionUid: randomUUID()};
    f.posts.push(() => {started.resolve(); return held.promise;});
    const first = f.intents.send('pin', body), duplicate = f.intents.send('pin', {...body}); await started.promise;
    expect(duplicate).toBe(first);
    expect((await f.intents.send('pin', {...body, cardId: 'C2'})).mapped.reason).toBe('invalid_request');
    held.resolve(answer(4, {accepted: false, reason: 'wrong_pair', message: 'Recorded refusal.', repeat: true}));
    const packet = await first;
    expect(packet.mapped).toMatchObject({accepted: false, reason: 'wrong_pair', repeat: true});
    expect(packet.mapped).not.toHaveProperty('recovery'); expect(packet.answer.repeat).toBe(true);
    expect(await f.intents.retry(body.actionUid)).toEqual(packet);
    expect(await f.intents.send('pin', body)).toEqual(packet);
    expect(f.postCalls()).toHaveLength(1); expect(f.applied).toHaveLength(1); expect(f.ports.readCase).not.toHaveBeenCalled();
  });

  it('preserves repeat:false and a valid null case without inventing a replay read', async () => {
    const f = setup(), body = {suspect: 'recorded_suspect', actionUid: randomUUID()};
    f.posts.push(() => Promise.resolve(answer(1, {accepted: false, reason: 'accusation_refused', repeat: false, case: null})));
    const packet = await f.intents.send('accuse', body);
    expect(packet.mapped).toMatchObject({accepted: false, repeat: false}); expect(packet.answer.repeat).toBe(false);
    expect(f.applied).toEqual([{value: null, source: 'write', current: true}]); expect(f.ports.readCase).not.toHaveBeenCalled();
  });

  it('treats no-answer, every 5xx and malformed200 as uncertain without an automatic read or repeat', async () => {
    const replies = [failed(0), ...Array.from({length: 100}, (_, index) => failed(500 + index)),
      good(null), good({accepted: true, reason: null, message: '', case: {unreadable: true}})];
    for (const reply of replies) {
      const f = setup(), body = {cardId: 'C1', actionUid: randomUUID()}; f.posts.push(() => Promise.resolve(reply));
      const packet = await f.intents.send('pin', body);
      expect(packet.mapped.accepted).toBe(false); expect(packet.uncertain).toBe(true); expect(packet.mapped).not.toHaveProperty('recovery');
      expect((await f.intents.send('pin', {...body})).needsRetry).toBe(true);
      expect(f.postCalls()).toHaveLength(1); expect(f.ports.readCase).not.toHaveBeenCalled(); expect(f.applied).toEqual([]);
    }
  });

  it('waits for a fresh validated retry read and repeats the exact cloned body/UID without guessing from similar case data', async () => {
    const f = setup(), body = {cards: ['C1', 'C2'], actionUid: randomUUID()}, read = deferred(), started = deferred();
    f.posts.push(() => Promise.resolve(failed(503)));
    await f.intents.send('pair', body); body.cards[0] = 'C8';
    f.reads.push(options => {expect(options).toEqual({fresh: true}); started.resolve(); return read.promise;});
    const retry = f.intents.retry(body.actionUid); await started.promise;
    expect(f.postCalls()).toHaveLength(1); expect(f.applied).toEqual([]);
    read.resolve(good({case: {...snapshot(8), looksLike: {cards: ['C1', 'C2'], complete: true}}}));
    expect((await retry).mapped.accepted).toBe(true);
    expect(f.calls.map(call => call.method)).toEqual(['POST', 'GET', 'POST']);
    expect(f.postCalls()[1].body).toEqual(f.postCalls()[0].body);
    expect(f.applied.map(event => event.source)).toEqual(['retry-read', 'write']); expect(f.applied.every(event => event.current)).toBe(true);
  });

  it.each([failed(503), good({}), good({case: {unreadable: true}}), {ok: true, status: 204, data: {case: snapshot(9)}}])
  ('does not POST after an unsuccessful or unreadable fresh read %j', async reply => {
    const f = setup(), body = {cardId: 'C1', actionUid: randomUUID()}; f.posts.push(() => Promise.resolve(failed(0)));
    await f.intents.send('pin', body); f.reads.push(() => Promise.resolve(reply));
    expect(await f.intents.retry(body.actionUid)).toMatchObject({mapped: {accepted: false}, uncertain: true, needsRetry: true});
    expect(f.postCalls()).toHaveLength(1); expect(f.applied).toEqual([]);
    expect((await f.intents.retry(body.actionUid)).mapped.accepted).toBe(true);
    expect(f.postCalls()).toHaveLength(2); expect(f.postCalls()[1].body).toEqual(f.postCalls()[0].body);
  });

  it('applies a validated null retry read but sends no write without a current case', async () => {
    const f = setup(), body = {cardId: 'C1', actionUid: randomUUID()}; f.posts.push(() => Promise.resolve(failed(503)));
    await f.intents.send('pin', body); f.reads.push(() => Promise.resolve(good({case: null})));
    expect((await f.intents.retry(body.actionUid)).mapped.reason).toBe('crew_required');
    expect(f.postCalls()).toHaveLength(1); expect(f.applied).toEqual([{value: null, source: 'retry-read', current: true}]);
  });

  it.each([false, {then() {}}])('does not continue a retry when the synchronous apply port refuses or returns a thenable %j', async result => {
    const f = setup(), body = {cardId: 'C1', actionUid: randomUUID()}; f.posts.push(() => Promise.resolve(failed(503)));
    await f.intents.send('pin', body); f.ports.applyCase.mockReturnValue(result);
    expect((await f.intents.retry(body.actionUid)).mapped.accepted).toBe(false);
    expect(f.ports.applyCase).toHaveBeenCalledOnce(); expect(f.postCalls()).toHaveLength(1);
  });

  it('does not let an old POST/finally overwrite a newer paused-owner retry or start another retry read', async () => {
    const f = setup(), post = deferred(), posted = deferred(), read = deferred(), reading = deferred();
    const body = {cardId: 'C1', actionUid: randomUUID()};
    f.posts.push(() => {posted.resolve(); return post.promise;});
    const old = f.intents.send('pin', body); await posted.promise; f.intents.pause();
    f.reads.push(() => {reading.resolve(); return read.promise;});
    const current = f.intents.retry(body.actionUid); await reading.promise;
    post.resolve(answer(1)); expect((await old).stale).toBe(true); expect(f.applied).toEqual([]);
    expect(f.intents.retry(body.actionUid)).toBe(current); expect(f.ports.readCase).toHaveBeenCalledOnce();
    read.resolve(good({case: snapshot(2)})); expect((await current).mapped.accepted).toBe(true);
    expect(f.applied.map(event => event.value.recordedRevision)).toEqual([2, 3]); expect(f.postCalls()).toHaveLength(2);
  });

  it.each(['identity', 'crew', 'hidden', 'reset', 'dispose'])('fences late write payloads at the %s boundary', async boundary => {
    const f = setup(), post = deferred(), posted = deferred(), body = {cardId: 'C1', actionUid: randomUUID()};
    f.posts.push(() => {posted.resolve(); return post.promise;}); const pending = f.intents.send('pin', body); await posted.promise;
    if (boundary === 'identity') f.replaceScope(); if (boundary === 'crew') f.replaceCrew();
    if (boundary === 'hidden') f.setVisible(false); if (boundary === 'reset') f.intents.reset(); if (boundary === 'dispose') f.intents.dispose();
    post.resolve(answer(99)); expect((await pending).stale).toBe(true); expect(f.applied).toEqual([]);
    expect(f.ports.readCase).not.toHaveBeenCalled(); expect(f.postCalls()).toHaveLength(1);
  });

  it.each(['identity', 'crew', 'hidden', 'dispose'])('does not apply a late retry GET or send its POST after %s', async boundary => {
    const f = setup(), held = deferred(), started = deferred(), body = {cardId: 'C1', actionUid: randomUUID()};
    f.posts.push(() => Promise.resolve(failed(0))); await f.intents.send('pin', body);
    f.reads.push(() => {started.resolve(); return held.promise;}); const retry = f.intents.retry(body.actionUid); await started.promise;
    if (boundary === 'identity') f.replaceScope(); if (boundary === 'crew') f.replaceCrew();
    if (boundary === 'hidden') f.setVisible(false); if (boundary === 'dispose') f.intents.dispose();
    held.resolve(good({case: snapshot(99)})); expect((await retry).stale).toBe(true);
    expect(f.applied).toEqual([]); expect(f.postCalls()).toHaveLength(1);
  });

  it('keeps the original global429 deadline across pause and blocks all forced sends/retries until it expires', async () => {
    const f = setup(), body = {cardId: 'C1', actionUid: randomUUID()};
    f.posts.push(() => Promise.resolve(failed(429, 'too_many_requests', {retryAfterSeconds: 3.1})));
    const first = await f.intents.send('pin', body); expect(first.retryUntil).toBe(5000.25); expect(f.intents.getRetryUntil()).toBe(5000.25);
    expect(f.intents.release(body.actionUid)).toBe(false);
    f.setTime(2500.5); f.intents.pause();
    expect((await f.intents.send('pin', {cardId: 'C2', actionUid: randomUUID()})).mapped.reason).toBe('rate_limited');
    expect((await f.intents.retry(body.actionUid)).mapped.reason).toBe('rate_limited');
    expect(f.intents.getRetryUntil()).toBe(5000.25); expect(f.postCalls()).toHaveLength(1); expect(f.ports.readCase).not.toHaveBeenCalled();
    f.setTime(5000); expect((await f.intents.retry(body.actionUid)).mapped.reason).toBe('rate_limited');
    f.setTime(5000.25); expect((await f.intents.retry(body.actionUid)).mapped.accepted).toBe(true);
    expect(f.calls.map(call => call.method)).toEqual(['POST', 'GET', 'POST']); expect(f.postCalls()[1].body).toEqual(f.postCalls()[0].body);
  });

  it.each(['pause', 'identity', 'crew', 'reset', 'dispose'])('retains late429 only for a paused same-scope owner, not %s cleanup', async boundary => {
    const f = setup(), post = deferred(), posted = deferred(), body = {cardId: 'C1', actionUid: randomUUID()};
    f.posts.push(() => {posted.resolve(); return post.promise;}); const pending = f.intents.send('pin', body); await posted.promise;
    if (boundary === 'pause') f.intents.pause(); if (boundary === 'identity') f.replaceScope(); if (boundary === 'crew') f.replaceCrew();
    if (boundary === 'reset') f.intents.reset(); if (boundary === 'dispose') f.intents.dispose();
    f.setTime(1500.5); post.resolve(failed(429, 'too_many_requests', {retryAfterSeconds: 3}));
    expect((await pending).stale).toBe(true); expect(f.intents.getRetryUntil()).toBe(boundary === 'pause' ? 4500.5 : 0);
    expect(f.applied).toEqual([]); expect(f.postCalls()).toHaveLength(1); expect(f.ports.readCase).not.toHaveBeenCalled();
  });
});
