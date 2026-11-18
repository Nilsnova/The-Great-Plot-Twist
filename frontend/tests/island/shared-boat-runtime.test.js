// Shared boat wire scope and durable replay checks; server authority is covered separately in SQL.
import {expect, it} from 'vitest';
import {createSharedBoatApi} from '../../src/island/shared-boat-api.js';
import {createBoatRoundSession} from '../../src/island/shared-boat-session.js';
import {sharedBoatPay, sharedBoatResult} from '../../src/island/shared-boat-card.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ACTOR = id(1), ORIGIN = {mode: 'island_shared', version: 1, islandOwner: id(2), accountId: id(3), runEpoch: id(4)};
function memory() {
  const map = new Map();
  return {get length() {return map.size;}, key: i => [...map.keys()][i], getItem: k => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k)};
}
function world() {
  let current = {...ORIGIN}, actor = ACTOR, uid = 0, rounds = 0, loseStart = false, loseClaim = false;
  const saved = new Map(), calls = [], applied = [], storage = memory();
  const transport = {async post(path, body, options) {
    calls.push({path, body: structuredClone(body), options});
    const cacheKey = `${actor}:${body.actionUid}`;
    if (saved.has(cacheKey)) return {ok: true, status: 200, data: {...saved.get(cacheKey), repeat: true, ...(path.endsWith('claim') ? {currentEconomy: null} : {})}};
    const start = path.endsWith('start'), result = start ? {round: {id: id(20 + ++rounds), actorId: actor, ...ORIGIN, game: body.game, recordWave: 30, maximumCoins: '36'}}
      : {roundId: body.roundId, game: 'dash', recordWave: 30, stars: body.stars, coins: String(body.stars * 12), cumulativeCoins: String(body.stars * 12), maximumCoins: '36', treasuryReceiptId: body.stars ? id(80) : null};
    const data = {status: start ? 'started' : 'done', repeat: false, receipt: {
      receiptId: id(100 + uid), actionUid: body.actionUid, action: start ? 'boat:start' : 'boat:claim', actorId: actor, origin: {...ORIGIN}, result},
      ...(!start ? {currentEconomy: {...ORIGIN, treasury: {balanceCoins: '236', committedCoins: '0', availableCoins: '236'}, revision: '2'}} : {})};
    saved.set(cacheKey, data);
    if ((start && loseStart) || (!start && loseClaim)) {loseStart = false;loseClaim = false;return {ok: false, status: 503, code: 'database_unavailable'};}
    return {ok: true, status: 200, data};
  }};
  const api = createSharedBoatApi({transport, getEconomy: () => current, onEconomy: (...args) => applied.push(args)});
  const session = () => createBoatRoundSession({api, getEconomy: () => current, getActorId: () => actor, storage, makeUid: () => `boat-${String(++uid).padStart(8, '0')}`});
  return {session, api, calls, applied, storage, set current(value) {current = value;}, set actor(value) {actor = value;},
    loseStart() {loseStart = true;}, loseClaim() {loseClaim = true;}};
}
it('keeps the original start UID after a lost reply and reload', async () => {
  const w = world();w.loseStart();
  expect((await w.session().begin('dash')).ok).toBe(false);
  expect((await w.session().begin('dash')).ok).toBe(true);
  expect(w.calls[0].body).toEqual(w.calls[1].body);
  expect(w.calls[0].options.headers['X-Island-Economy-Version']).toBe('1');
  expect(w.calls[0].body.economy).toEqual({mode: 'island_shared', version: 1, islandOwner: ORIGIN.islandOwner, runEpoch: ORIGIN.runEpoch});
  expect(w.calls[0].body.economy).not.toHaveProperty('accountId');
});
it('retries original score and epoch after reload and island switch without projecting another treasury', async () => {
  const w = world(), session = w.session();
  await session.begin('dash');w.loseClaim();expect((await session.finish(2)).ok).toBe(false);
  const original = w.calls.at(-1).body;
  w.current = {...ORIGIN, islandOwner: id(9), accountId: id(10), runEpoch: id(11)};
  expect((await w.session().recover()).ok).toBe(true);
  expect(w.calls.at(-1).body).toEqual(original);expect(w.applied).toHaveLength(0);expect(w.storage.length).toBe(0);
});
it('does not send a different signed-in actors saved score', async () => {
  const w = world(), session = w.session();
  await session.begin('dash');w.loseClaim();await session.finish(3);
  const count = w.calls.length;w.actor = id(8);
  expect((await w.session().recover()).ok).toBe(true);expect(w.calls).toHaveLength(count);
});
it('missing canonical context or storage never sends a personal fallback', async () => {
  const w = world();w.current = null;
  expect((await w.session().begin('dash')).code).toBe('economy_context_required');expect(w.calls).toHaveLength(0);
  const session = createBoatRoundSession({api: w.api, getEconomy: () => ORIGIN, getActorId: () => ACTOR, storage: null});
  expect((await session.begin('dash')).code).toBe('storage_unavailable');expect(w.calls).toHaveLength(0);
});
it('completes zero-star rounds, protects completion during close, and starts a new round after success', async () => {
  const w = world(), session = w.session(), first = await session.begin('dash');
  const finishing = session.finish(0);session.cancel();expect((await finishing).ok).toBe(true);
  expect(w.calls.at(-1).body.stars).toBe(0);
  expect((await session.begin('dash')).data.round.id).not.toBe(first.data.round.id);
  expect(w.calls.filter(call => call.path.endsWith('start'))).toHaveLength(2);
});
it('an uncertain score keeps its immutable UID and rejects changed stars', async () => {
  const w = world(), session = w.session();
  await session.begin('dash');w.loseClaim();await session.finish(1);const calls = w.calls.length;
  expect((await session.finish(3)).code).toBe('idempotency_conflict');expect(w.calls).toHaveLength(calls);
  expect((await session.finish(1)).ok).toBe(true);expect(w.calls.at(-1).body).toEqual(w.calls.at(-2).body);
});
it('describes shared improvement and cap without a per-player allowance', () => {
  expect(sharedBoatPay({claimedCoins: '12', remainingCoins: '24', maximumCoins: '36'})).toContain('Island +12 / 36');
  expect(sharedBoatPay({remainingCoins: '0'})).toContain('play for fun');
  const reply = {ok: true, data: {receipt: {result: {coins: '0', cumulativeCoins: '36', maximumCoins: '36'}}}};
  expect(sharedBoatResult(reply).line).toContain('Island cap reached');
});
