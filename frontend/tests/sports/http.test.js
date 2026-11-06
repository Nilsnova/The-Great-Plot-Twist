// Sports routes/auth and uncertain writes are checked with stand-in fetch, never a provider.
import { describe, expect, it, vi } from 'vitest';
import { createSportsHttp } from '../../src/screens/sports/http.js';
import { BOARD, MINE, OPEN_STAKE, SAVED } from './sample-answers.js';
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const error = (status, code) => response({ error: { code, message: 'Unavailable for this check.' } }, status);
const draft = { fixtureId: 'fd-123', pick: 'home', amount: 10, stakeId: 'same-stake-123' };

describe('sports same-origin API boundary', () => {
  it('reads the public board without a token or query, including sparse empty pool sides', async () => {
    const getToken = vi.fn(() => 'private-token'), fetchImpl = vi.fn(async () => response(BOARD));
    const reply = await createSportsHttp({ getToken, fetchImpl }).board();
    expect(reply.ok).toBe(true); expect(getToken).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/sports');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it('uses the current sign-in for mine and accepts an open stake with no payout', async () => {
    let token = 'first';
    const fetchImpl = vi.fn(async () => response({ ...MINE, stakes: [OPEN_STAKE] }));
    const adapter = createSportsHttp({ getToken: () => token, fetchImpl });
    expect((await adapter.mine()).ok).toBe(true); token = 'second'; await adapter.mine();
    expect(fetchImpl.mock.calls.map(call => call[1].headers.Authorization)).toEqual(['Bearer first', 'Bearer second']);
  });
  it('sends only fixture/pick/amount/reference for a stake; never a player, result or payout', async () => {
    const fetchImpl = vi.fn(async () => response(SAVED));
    expect((await createSportsHttp({ fetchImpl }).stake({ ...draft, playerId: 'bad', outcome: 'home', payout: 999 })).ok).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/sports/stake');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(draft);
  });
  it('settles only an own fixture intent, with no caller-supplied outcome', async () => {
    const fetchImpl = vi.fn(async () => response({ settled: true, repeat: false, fixtureId: 'fd-123', settlement: 'winners', paidCoins: 19, cutCoins: 1 }));
    expect((await createSportsHttp({ getToken: () => 'signed-in', fetchImpl }).settle({ fixtureId: 'fd-123', outcome: 'away' })).ok).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/sports/settle');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ fixtureId: 'fd-123' });
  });
  it.each([500, 502, 503, 504])('keeps %i write answers unknown', async status => {
    const adapter = createSportsHttp({ fetchImpl: async () => error(status, 'database_unavailable') });
    expect(await adapter.stake(draft)).toMatchObject({ ok: false, unknown: true, status });
  });
  it('treats missing provider and flag-off reads as clear unavailable/closed states', async () => {
    expect(await createSportsHttp({ fetchImpl: async () => error(503, 'sports_unavailable') }).board())
      .toMatchObject({ ok: false, unknown: false, code: 'sports_unavailable' });
    expect(await createSportsHttp({ fetchImpl: async () => error(404, 'feature_off') }).board())
      .toMatchObject({ ok: false, code: 'feature_off' });
  });
  it('keeps unreadable successful writes and lost connections unknown', async () => {
    expect(await createSportsHttp({ fetchImpl: async () => response({}) }).stake(draft)).toMatchObject({ unknown: true });
    expect(await createSportsHttp({ fetchImpl: async () => { throw new Error('offline'); } }).stake(draft)).toMatchObject({ status: 0, unknown: true });
  });
  it('aborts a hanging write without inventing an outcome', async () => {
    const fetchImpl = vi.fn((path, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    expect(await createSportsHttp({ fetchImpl, timeoutMs: 5 }).stake(draft)).toMatchObject({ unknown: true });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('rejects malformed pool rows rather than inventing stakeable values', async () => {
    const broken = structuredClone(BOARD); broken.fixtures[0].pool.sides.home = { coins: -1, players: 3 };
    expect(await createSportsHttp({ fetchImpl: async () => response(broken) }).board()).toMatchObject({ ok: false, code: 'bad_response' });
  });
  it('does not invent a draw when a settled pool has no verified outcome', async () => {
    const broken = structuredClone(BOARD);
    Object.assign(broken.fixtures[0].pool, { status: 'settled', outcome: null, paidCoins: 0, cutCoins: 0 });
    expect(await createSportsHttp({ fetchImpl: async () => response(broken) }).board()).toMatchObject({ ok: false });
  });
});
