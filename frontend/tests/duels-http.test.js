// Lantern Duels, the HTTP adapter: how the screen talks to /api/config and the five duel routes.
// A scripted fake fetch stands in for the server and fake timers stand in for the polling clock,
// so nothing touches the network. The contract is docs/INTERFACES.md, Lantern Duels.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '../src/screens/duels/http-adapter.js';
import { messageFor } from '../src/screens/duels/messages.js';

const START = Date.parse('2026-11-06T10:00:00Z');
const TOKEN = 'test-token';
const DUEL_ID = '6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44';
const SIGNALS = ['flash', 'shade', 'shade', 'mirror', 'shade'];

// A fake answer from fetch: a status, headers and a json() that gives the data.
const reply = (data, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300, status, headers: { get: name => headers[name] ?? null }, json: async () => data,
});
const refusal = (code, status, headers) => reply({ error: { code, message: 'Words from the server that must never be shown.' } }, status, headers);
const CONFIG_ON = reply({ env: 'local', demoMode: false, flags: { arena: true, market: false }, auth: { provider: 'github', supabaseUrl: '' } });
const CONFIG_OFF = reply({ env: 'local', demoMode: false, flags: { arena: false }, auth: { provider: 'github', supabaseUrl: '' } });
const summary = (extra = {}) => ({
  id: DUEL_ID, status: 'open', isOpen: false, you: 'challenger', challengerName: 'Me', opponentName: 'Captain-3fa85f', rounds: 5, oil: 5,
  stake: 100, cutPercent: 5, winnerTakes: 190, createdAt: '2026-11-06T10:00:00Z', expiresAt: '2026-11-07T10:00:00Z', closedAt: null,
  score: null, yourResult: null, coinsChange: null, heldStake: 100, canAnswer: false, canWithdraw: true, canDecline: false, ...extra,
});
// The server clock moves with the fake clock, as a real server's would.
const serverNow = () => new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const listOf = (extra = {}) => reply({
  rules: { roundChoices: [3, 5] }, coins: 900, heldCoins: 0, incoming: [], openChallenges: [], yours: [], recent: [],
  serverTime: serverNow(), ...extra,
});
const detailOf = (extra = {}) => reply({ duel: { ...summary(), yourSignals: SIGNALS, reveal: null, ...extra }, coins: 900, serverTime: '2026-11-06T10:00:06Z' });

// Routes by "METHOD /path". A handler is a reply, a function, or a list of replies used in order
// (the last one repeats). A request nobody expected throws, which fails the test.
function serverWith(routes) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, options = {}) => {
    const key = `${options.method ?? 'GET'} ${url}`;
    calls.push({ key, options, body: options.body ? JSON.parse(options.body) : undefined });
    const handler = routes[key];
    if (handler === undefined) throw new Error(`unexpected request ${key}`);
    if (Array.isArray(handler)) return handler[Math.min(calls.filter(call => call.key === key).length - 1, handler.length - 1)]();
    return typeof handler === 'function' ? handler(options) : handler;
  });
  return { fetchImpl, calls, keys: () => calls.map(call => call.key), last: key => calls.filter(call => call.key === key).at(-1) };
}
const networkDown = () => { throw new TypeError('Failed to fetch'); };

let adapters;
function open(routes, { token = TOKEN, ...options } = {}) {
  const server = serverWith({ 'GET /api/config': CONFIG_ON, 'GET /api/duels': () => listOf(), ...routes });
  const adapter = createHttpAdapter({ fetchImpl: server.fetchImpl, getToken: () => token, ...options });
  adapters.push(adapter);
  return { adapter, server };
}
const opened = async (routes, options) => {
  const result = open(routes, options);
  await result.adapter.setVisible(true);
  return result;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  adapters = [];
});
afterEach(() => {
  adapters.forEach(adapter => adapter.dispose());
  vi.useRealTimers();
});

describe('opening the ring', () => {
  it('reads /api/config first and then the list', async () => {
    const { server } = await opened({});
    expect(server.keys()).toEqual(['GET /api/config', 'GET /api/duels']);
  });

  it('asks nothing more while the flag is off, and says the ring is closed', async () => {
    const { adapter, server } = await opened({ 'GET /api/config': CONFIG_OFF });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(server.keys()).toEqual(['GET /api/config']);
    expect(adapter.read()).toMatchObject({ mode: 'closed', polling: 'off', notice: { code: 'feature_off', message: 'The ring is closed for now.' } });
  });

  it('asks nothing but the config without a token, and says how to sign in', async () => {
    const { adapter, server } = await opened({}, { token: null });
    expect(server.keys()).toEqual(['GET /api/config']);
    expect(adapter.read()).toMatchObject({ mode: 'signed_out', notice: { message: 'Sign in with GitHub to duel.' } });
  });

  it('never sends the token to /api/config', async () => {
    const { server } = await opened({});
    expect(server.last('GET /api/config').options.headers.Authorization).toBeUndefined();
  });

  it('sends the Bearer token with the list request and nothing else about the player', async () => {
    const { server } = await opened({});
    const call = server.last('GET /api/duels');
    expect(call.options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(call.options.body).toBeUndefined();
  });

  it('fills the view from the list', async () => {
    const { adapter } = await opened({ 'GET /api/duels': listOf({ coins: 900, heldCoins: 100, yours: [summary()] }) });
    expect(adapter.read()).toMatchObject({ mode: 'ready', coins: 900, heldCoins: 100, polling: 'fast' });
    expect(adapter.read().yours).toHaveLength(1);
  });

  it('keeps the list exactly as the server sent it', async () => {
    const waiting = summary();
    const { adapter } = await opened({ 'GET /api/duels': listOf({ yours: [waiting] }) });
    expect(adapter.read().yours[0]).toEqual(waiting);
  });

  it('keeps the device clock when it agrees with the server and corrects it when it does not', async () => {
    const { adapter } = await opened({});
    expect(adapter.read().serverOffsetMs).toBe(0);
    const behind = await opened({ 'GET /api/duels': listOf({ serverTime: '2026-11-06T11:00:00Z' }) });
    expect(behind.adapter.read().serverOffsetMs).toBe(3600 * 1000);
  });

  it('goes back to sign-in when the server refuses the token', async () => {
    const { adapter, server } = await opened({ 'GET /api/duels': refusal('unauthorized', 401) });
    await vi.advanceTimersByTimeAsync(60000);
    expect(adapter.read().mode).toBe('signed_out');
    expect(server.keys().filter(key => key === 'GET /api/duels')).toHaveLength(1);
  });

  it('closes the ring when the flag is switched off while the panel is open', async () => {
    const { adapter } = await opened({ 'GET /api/duels': [() => listOf(), () => refusal('feature_off', 404)] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(adapter.read().mode).toBe('closed');
  });
});

describe('polling', () => {
  it('asks the list again every 5 seconds and the config only once', async () => {
    const { server } = await opened({});
    await vi.advanceTimersByTimeAsync(10000);
    expect(server.keys()).toEqual(['GET /api/config', 'GET /api/duels', 'GET /api/duels', 'GET /api/duels']);
  });

  it('does not redraw the view when the list has not changed', async () => {
    const { adapter } = await opened({});
    const listener = vi.fn();
    adapter.subscribe(listener);
    await vi.advanceTimersByTimeAsync(15000);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops while the page is hidden and opens again once when it is shown', async () => {
    const { adapter, server } = await opened({});
    await adapter.setVisible(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(server.keys()).toHaveLength(2);
    await adapter.setVisible(true);
    expect(server.keys().slice(2)).toEqual(['GET /api/config', 'GET /api/duels']);
  });

  it('keeps the last view and says so when the ring does not answer, then recovers', async () => {
    const { adapter } = await opened({ 'GET /api/duels': [() => listOf({ coins: 777 }), networkDown, () => listOf({ coins: 777 })] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(adapter.read()).toMatchObject({ coins: 777, notice: { code: 'retrying', message: 'The ring did not answer. Retrying.' } });
    await vi.advanceTimersByTimeAsync(10000);
    expect(adapter.read().notice).toBe(null);
  });

  it('waits twice as long after a failure', async () => {
    const { server } = await opened({ 'GET /api/duels': [() => listOf(), networkDown] });
    await vi.advanceTimersByTimeAsync(5000);
    const afterFailure = server.keys().length;
    await vi.advanceTimersByTimeAsync(9999);
    expect(server.keys()).toHaveLength(afterFailure);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.keys()).toHaveLength(afterFailure + 1);
  });

  it('waits for Retry-After after a 429 and shows the busy sentence', async () => {
    const { adapter, server } = await opened({ 'GET /api/duels': [() => refusal('too_many_requests', 429, { 'Retry-After': '20' }), () => listOf()] });
    expect(adapter.read().notice).toMatchObject({ code: 'too_many_requests', message: 'The ring is busy. Trying again in a moment.' });
    await vi.advanceTimersByTimeAsync(19999);
    expect(server.keys().filter(key => key === 'GET /api/duels')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(server.keys().filter(key => key === 'GET /api/duels')).toHaveLength(2);
  });

  it('shows an unreachable ring on the first open as unavailable', async () => {
    const { adapter } = await opened({ 'GET /api/config': networkDown });
    expect(adapter.read().mode).toBe('unavailable');
  });

  it('sends one request at a time, even when a click arrives during a poll', async () => {
    let inFlight = 0, mostAtOnce = 0;
    const slow = makeReply => () => new Promise(resolve => {
      inFlight += 1;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      setTimeout(() => { inFlight -= 1; resolve(makeReply()); }, 100);
    });
    const { adapter } = open({ 'GET /api/duels': slow(() => listOf()), 'POST /api/duels': slow(() => detailOf()) });
    const requests = [
      adapter.setVisible(true),
      adapter.challenge({ opponentName: null, rounds: 5, stake: 0, signals: SIGNALS }),
      adapter.refresh(),
    ];
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all(requests);
    expect(mostAtOnce).toBe(1);
  });

  it('asks again at once after the player acts', async () => {
    const { adapter, server } = await opened({});
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    const before = server.keys().length;
    await adapter.refresh();
    expect(server.keys()).toHaveLength(before + 1);
  });
});

describe('sending intents', () => {
  const challengeArgs = { opponentName: 'Captain-3fa85f', rounds: 5, stake: 100, signals: SIGNALS };

  it('posts a challenge with the exact path, header and body, and never a player id', async () => {
    const { adapter, server } = await opened({ 'POST /api/duels': detailOf() });
    await adapter.challenge(challengeArgs);
    const call = server.last('POST /api/duels');
    expect(call.options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(call.options.headers['Content-Type']).toBe('application/json');
    expect(call.body).toEqual({ ...challengeArgs, actionUid: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/) });
    expect(Object.keys(call.body)).not.toContain('playerId');
  });

  it('leaves the opponent name out of an open challenge', async () => {
    const { adapter, server } = await opened({ 'POST /api/duels': detailOf() });
    await adapter.challenge({ ...challengeArgs, opponentName: '  ' });
    expect(server.last('POST /api/duels').body).not.toHaveProperty('opponentName');
  });

  it('shows the new duel with the sealed signals and then reads the list', async () => {
    const { adapter, server } = await opened({ 'POST /api/duels': detailOf() });
    const result = await adapter.challenge(challengeArgs);
    expect(result.ok).toBe(true);
    expect(result.view.selected.id).toBe(DUEL_ID);
    expect(result.view.sealed[DUEL_ID]).toEqual(SIGNALS);
    expect(server.keys().slice(-2)).toEqual(['POST /api/duels', 'GET /api/duels']);
  });

  it('posts an answer to the move route', async () => {
    const finished = { status: 'finished', reveal: [{ round: 1, yours: 'flash', theirs: 'shade', point: 'you' }] };
    const { adapter, server } = await opened({ [`POST /api/duels/${DUEL_ID}/move`]: detailOf(finished) });
    const result = await adapter.answer(DUEL_ID, SIGNALS);
    expect(server.last(`POST /api/duels/${DUEL_ID}/move`).body).toEqual({ signals: SIGNALS, actionUid: expect.any(String) });
    expect(result.view.selected.status).toBe('finished');
  });

  it('posts a withdraw or decline to the cancel route with no body', async () => {
    const { adapter, server } = await opened({ [`POST /api/duels/${DUEL_ID}/cancel`]: detailOf({ status: 'withdrawn' }) });
    await adapter.cancel(DUEL_ID);
    const call = server.last(`POST /api/duels/${DUEL_ID}/cancel`);
    expect(call.options.body).toBeUndefined();
    expect(call.options.headers['Content-Type']).toBeUndefined();
  });

  it.each([
    ['insufficient_funds', 409], ['too_many_waiting', 409], ['duel_taken', 409], ['daily_pair_limit', 409], ['name_not_unique', 409],
    ['no_such_captain', 404], ['no_such_duel', 404], ['cannot_duel_yourself', 422], ['not_enough_oil', 422], ['not_your_duel', 403],
  ])('maps the refusal %s (%i) to its own sentence and keeps the last view', async (code, status) => {
    const { adapter } = await opened({ 'POST /api/duels': refusal(code, status), 'GET /api/duels': listOf({ coins: 640 }) });
    const result = await adapter.challenge(challengeArgs);
    expect(result).toMatchObject({ ok: false, code, message: messageFor(code) });
    expect(result.message).not.toContain('Words from the server');
    expect(adapter.read()).toMatchObject({ coins: 640, notice: { code } });
  });

  it('gives an unknown refusal the generic sentence', async () => {
    const { adapter } = await opened({ 'POST /api/duels': refusal('something_new', 418) });
    expect((await adapter.challenge(challengeArgs)).message).toBe('Something went wrong. Try again.');
  });

  it('counts already_applied as done, shows no refusal, and reads again', async () => {
    const { adapter, server } = await opened({ 'POST /api/duels': refusal('already_applied', 409) });
    const result = await adapter.challenge(challengeArgs);
    expect(result.ok).toBe(true);
    expect(adapter.read().notice).toBe(null);
    expect(server.keys().at(-1)).toBe('GET /api/duels');
  });

  it('loads the finished duel after an answer that already went through', async () => {
    const finished = { status: 'finished', reveal: [{ round: 1, yours: 'flash', theirs: 'shade', point: 'you' }] };
    const { adapter } = await opened({ [`POST /api/duels/${DUEL_ID}/move`]: refusal('already_applied', 409), [`GET /api/duels/${DUEL_ID}`]: detailOf(finished) });
    const result = await adapter.answer(DUEL_ID, SIGNALS);
    expect(result.view.selected.status).toBe('finished');
  });

  it('sends the player to sign in when the token stops working during an intent', async () => {
    const { adapter } = await opened({
      'POST /api/duels': refusal('unauthorized', 401),
      'GET /api/duels': [() => listOf(), () => refusal('unauthorized', 401)],
    });
    await adapter.challenge(challengeArgs);
    expect(adapter.read()).toMatchObject({ mode: 'signed_out', polling: 'off', notice: { message: 'Sign in with GitHub to duel.' } });
  });

  it('loads one duel in full for the reveal', async () => {
    const { adapter } = await opened({ [`GET /api/duels/${DUEL_ID}`]: detailOf({ status: 'finished' }) });
    const result = await adapter.select(DUEL_ID);
    expect(result.view.selected.status).toBe('finished');
  });
});

describe('a lost answer', () => {
  const challengeArgs = { opponentName: null, rounds: 5, stake: 100, signals: SIGNALS };
  const bodiesSent = server => server.calls.filter(call => call.key === 'POST /api/duels').map(call => call.body);

  it.each([
    ['a network failure', networkDown], ['a 503', () => refusal('database_unavailable', 503)],
    ['a 502', () => refusal('database_error', 502)], ['a 500', () => refusal('server_error', 500)],
  ])('keeps the intent after %s, reads the list and offers a retry', async (_label, failure) => {
    const { adapter, server } = await opened({ 'POST /api/duels': [failure, () => detailOf()] });
    const result = await adapter.challenge(challengeArgs);
    expect(result).toMatchObject({ ok: false, code: 'database_unavailable' });
    expect(result.view.canRetry).toBe(true);
    expect(server.keys().at(-1)).toBe('GET /api/duels');
    expect(adapter.read().notice.message).toBe('The ring did not answer. Your duel may have gone through; checking.');
  });

  it('sends the very same actionUid when it retries, so nothing is created twice', async () => {
    const { adapter, server } = await opened({ 'POST /api/duels': [networkDown, () => detailOf()] });
    await adapter.challenge(challengeArgs);
    const retried = await adapter.retry();
    const [first, second] = bodiesSent(server);
    expect(second.actionUid).toBe(first.actionUid);
    expect(retried.ok).toBe(true);
    expect(adapter.read().canRetry).toBe(false);
  });

  it('reuses the actionUid when the player clicks the same challenge again', async () => {
    const { adapter, server } = await opened({ 'POST /api/duels': [networkDown, () => detailOf()] });
    await adapter.challenge(challengeArgs);
    await adapter.challenge(challengeArgs);
    const [first, second] = bodiesSent(server);
    expect(second.actionUid).toBe(first.actionUid);
  });

  it('makes a new actionUid for a different challenge', async () => {
    const { adapter, server } = await opened({ 'POST /api/duels': [networkDown, () => detailOf()] });
    await adapter.challenge(challengeArgs);
    await adapter.challenge({ ...challengeArgs, stake: 50 });
    const [first, second] = bodiesSent(server);
    expect(second.actionUid).not.toBe(first.actionUid);
  });

  it('makes a new actionUid after a definite answer', async () => {
    const { adapter, server } = await opened({ 'POST /api/duels': [() => refusal('insufficient_funds', 409), () => detailOf()] });
    await adapter.challenge(challengeArgs);
    await adapter.challenge(challengeArgs);
    const [first, second] = bodiesSent(server);
    expect(second.actionUid).not.toBe(first.actionUid);
  });

  it('only reads again when there is nothing to retry', async () => {
    const { adapter, server } = await opened({});
    await adapter.retry();
    expect(server.keys().at(-1)).toBe('GET /api/duels');
    expect(adapter.read().canRetry).toBe(false);
  });
});

describe('a challenge that was waiting gets decided', () => {
  it('loads the reveal and tells the challenger', async () => {
    const waiting = summary();
    const decided = summary({ status: 'finished', score: { you: 1, them: 3 }, yourResult: 'lost', coinsChange: -100, heldStake: 0, canWithdraw: false });
    const reveal = [{ round: 1, yours: 'flash', theirs: 'mirror', point: 'them' }];
    const { adapter, server } = await opened({
      'GET /api/duels': [() => listOf({ yours: [waiting] }), () => listOf({ recent: [decided] })],
      [`GET /api/duels/${DUEL_ID}`]: detailOf({ status: 'finished', reveal }),
    });
    await vi.advanceTimersByTimeAsync(5000);
    const view = adapter.read();
    expect(view.selected.reveal).toEqual(reveal);
    expect(view.notice).toMatchObject({ code: 'decided', duelId: DUEL_ID, message: 'Your duel with Captain-3fa85f is decided. Watch the reveal.' });
    expect(server.keys().filter(key => key === `GET /api/duels/${DUEL_ID}`)).toHaveLength(1);
  });
});
