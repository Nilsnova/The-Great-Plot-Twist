// The injected transport and opaque account scopes never contact an account, database or service.
import {describe, expect, it} from 'vitest';
import {createDeskAdapter} from '../../src/screens/predictions/adapter.js';
import {createDeskFlow} from '../../src/screens/predictions/flow.js';
import {createDeskScope, predictionEnabled} from '../../src/screens/predictions/g9-policy.js';

const ask = {questionId: 'recorded-question', side: 'yes', amount: 20};
const good = data => ({ok: true, status: 200, data});
const ok = data => ({kind: 'ok', data});
const unknown = () => ({kind: 'unknown', status: 503, code: 'database_unavailable'});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};

function injected() {
  const calls = [];
  let identity = 1;
  const request = {
    publicGet: async path => { calls.push({kind: 'public', path}); return good({questions: []}); },
    get: async path => { calls.push({kind: 'private', path}); return good({stakes: [], coins: 100}); },
    post: async (path, body) => { calls.push({kind: 'write', path, body}); return good({...ask}); },
  };
  return {calls, request, getIdentity: () => identity, change: value => { identity = value; }};
}

describe('G9 prediction transport composition', () => {
  it('uses the public client for questions and private client for own stakes', async () => {
    const fixture = injected();
    const adapter = await createDeskAdapter({...fixture, search: '', getFlags: () => ({predictions: true})});
    await adapter.list(); await adapter.mine(); await adapter.stake({...ask, stakeId: crypto.randomUUID()});
    expect(fixture.calls.map(call => [call.kind, call.path])).toEqual([
      ['public', '/api/predictions'], ['private', '/api/predictions/mine'], ['write', '/api/predictions/stake'],
    ]);
  });

  it('fails closed without an explicit public client or strict feature flag', async () => {
    for (const flags of [{}, {predictions: false}, {predictions: 'true'}]) {
      const fixture = injected();
      const adapter = await createDeskAdapter({...fixture, search: '', getFlags: () => flags});
      expect((await adapter.list()).kind).toBe('closed');
      expect((await adapter.stake(ask)).kind).toBe('closed'); expect(fixture.calls).toEqual([]);
    }
    const fixture = injected();
    delete fixture.request.publicGet;
    const adapter = await createDeskAdapter({...fixture, search: '', getFlags: () => ({predictions: true})});
    expect((await adapter.list()).kind).toBe('closed'); expect(fixture.calls).toEqual([]);
  });

  it('never opens HTTP in the server-free demo, even with enabled flags', async () => {
    const fixture = injected();
    const adapter = await createDeskAdapter({...fixture, search: '?demo=1', getFlags: () => ({predictions: true})});
    expect((await adapter.list()).kind).toBe('closed'); expect((await adapter.mine()).kind).toBe('closed');
    expect(fixture.calls).toEqual([]);
  });

  it('blocks private calls with a null identity even if the injected client has an old credential', async () => {
    const fixture = injected();
    const oldCredential = `runtime-${crypto.randomUUID()}`;
    fixture.request.getToken = () => oldCredential;
    const adapter = await createDeskAdapter({...fixture, search: '', getFlags: () => ({predictions: true})});
    fixture.change(null);
    expect((await adapter.mine()).kind).toBe('signin');
    expect((await adapter.stake(ask)).kind).toBe('signin'); expect(fixture.calls).toEqual([]);
  });

  it('discards old-account private answers and provides no ordinary settlement request', async () => {
    const fixture = injected(), pending = deferred();
    fixture.request.get = () => pending.promise;
    const adapter = await createDeskAdapter({...fixture, search: '', getFlags: () => ({predictions: true})});
    const task = adapter.mine(); fixture.change(2); pending.resolve(good({stakes: [], coins: 999}));
    expect(await task).toMatchObject({kind: 'signin'});
    expect(await adapter.settle({questionId: ask.questionId, outcome: 'yes'})).toMatchObject({status: 403});
    expect(fixture.calls).toEqual([]);
  });
});

describe('G9 prediction lifecycle and unknown outcomes', () => {
  it('invalidates private work on close, identity change, flags and disposal', () => {
    let identity = 1, enabled = true;
    const scope = createDeskScope({getIdentity: () => identity, enabled: () => enabled});
    scope.open(); const ticket = scope.capture(); expect(scope.current(ticket, {privateRead: true})).toBe(true);
    identity = null; expect(scope.current(ticket, {privateRead: true})).toBe(false);
    const anonymous = scope.capture(); expect(scope.current(anonymous)).toBe(true);
    expect(scope.current(anonymous, {privateRead: true})).toBe(false);
    identity = 1; scope.invalidate(); expect(scope.current(ticket)).toBe(false);
    const next = scope.capture(); enabled = false; expect(scope.current(next)).toBe(false);
    enabled = true; scope.close(); expect(scope.current(next)).toBe(false);
    scope.open(); const last = scope.capture(); scope.dispose(); expect(scope.current(last)).toBe(false);
    expect(predictionEnabled(() => ({predictions: 'true'}))).toBe(false);
    expect(predictionEnabled(() => { throw new Error('blocked'); })).toBe(false);
  });

  it('rereads before a manual unknown-outcome retry and reuses the exact stake id', async () => {
    const calls = [], receipts = [unknown(), ok({...ask})];
    const adapter = {makeStakeId: () => crypto.randomUUID(),
      stake: async body => { calls.push({method: 'POST', body}); return receipts.shift(); },
      mine: async () => { calls.push({method: 'GET'}); return ok({stakes: [], coins: 100}); }};
    const flow = createDeskFlow({adapter, readBeforeRetry: true, validateReceipt: true});
    expect((await flow.stake(ask)).done).toBe(false);
    expect(calls).toHaveLength(1);
    expect((await flow.stake(ask)).done).toBe(true);
    expect(calls.map(call => call.method)).toEqual(['POST', 'GET', 'POST']);
    expect(calls[2].body.stakeId).toBe(calls[0].body.stakeId);
  });

  it('does not retry when rereading fails or when mine already confirms the stake', async () => {
    let writes = 0, read = unknown();
    const adapter = {makeStakeId: () => crypto.randomUUID(), stake: async () => { writes += 1; return unknown(); },
      mine: async () => read};
    const flow = createDeskFlow({adapter, readBeforeRetry: true});
    await flow.stake(ask); await flow.stake(ask); expect(writes).toBe(1);
    read = ok({stakes: [{...ask}], coins: 80});
    expect((await flow.stake(ask)).done).toBe(true); expect(writes).toBe(1);
  });

  it('does not send queued work after sign-out or accept a late private write receipt', async () => {
    let identity = 1, writes = 0;
    const scope = createDeskScope({getIdentity: () => identity, enabled: () => true}); scope.open();
    const pending = deferred();
    const adapter = {makeStakeId: () => crypto.randomUUID(), stake: () => { writes += 1; return pending.promise; }};
    const flow = createDeskFlow({adapter, capture: scope.capture,
      isCurrent: ticket => scope.current(ticket, {privateRead: true})});
    const queued = flow.stake(ask); identity = null;
    expect((await queued).cancelled).toBe(true); expect(writes).toBe(0);
    identity = 2; scope.invalidate(); const running = flow.stake(ask); await Promise.resolve();
    expect(writes).toBe(1); flow.dispose(); pending.resolve(ok({...ask}));
    expect((await running).cancelled).toBe(true);
  });

  it('does not claim a malformed success receipt or expose settlement in ordinary play', async () => {
    let settlements = 0;
    const adapter = {makeStakeId: () => crypto.randomUUID(), stake: async () => ok({coins: 1000}),
      settle: async () => { settlements += 1; return ok({}); }};
    const flow = createDeskFlow({adapter, validateReceipt: true, allowSettle: false});
    expect(await flow.stake(ask)).toMatchObject({done: false, keepId: true, reply: {kind: 'unknown'}});
    expect((await flow.settle({questionId: ask.questionId, outcome: 'yes'})).cancelled).toBe(true);
    expect(settlements).toBe(0);
  });
});
