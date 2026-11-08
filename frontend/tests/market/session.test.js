// The session keeps the last good board and portfolio, notes failed refreshes and spots positions that closed at zero.
import { describe, expect, it, vi } from 'vitest';
import { createMarketSession } from '../../src/screens/market/session.js';
import { createFakeMarketAdapter } from '../../src/screens/market/fake.js';

const at = { timeZone: 'UTC' };
const ok = data => ({ ok: true, data });
const failure = (code, status = 0) => ({ ok: false, code, message: '', status, retryAfterSeconds: null });
const position = (id, extra) => ({ id, companyId: 'pier-post-courier', name: 'Pier Post Courier', side: 'falling', ...extra });
const portfolio = (positions, recentlyClosed = []) => ({ coins: 1, positions, recentlyClosed });

describe('the board', () => {
  it('keeps the latest board and has no note while all goes well', async () => {
    const session = createMarketSession({ adapter: createFakeMarketAdapter(), ...at });
    expect(session.board).toBe(null);
    await session.refreshBoard();
    expect(session.board.companies.length).toBeGreaterThan(3);
    expect(session.boardNote).toBe(null);
    expect(session.company('harbor-trust').name).toBe('Saltreach Harbor Trust');
    expect(session.company('nobody')).toBe(null);
  });

  it('keeps the last good board and says when it was last updated after a failure', async () => {
    const adapter = createFakeMarketAdapter();
    const session = createMarketSession({ adapter, ...at });
    await session.refreshBoard();
    adapter.dev.failNext('network_error', 'board');
    await session.refreshBoard();
    expect(session.board).not.toBe(null);
    expect(session.boardNote).toBe('Could not refresh (last update 12:05)');
    await session.refreshBoard();
    expect(session.boardNote).toBe(null);
  });

  it('explains a failure when there is no board to keep', async () => {
    const adapter = createFakeMarketAdapter();
    adapter.dev.failNext('network_error', 'board');
    const session = createMarketSession({ adapter, ...at });
    await session.refreshBoard();
    expect(session.board).toBe(null);
    expect(session.boardNote).toBe('Could not reach the Island Exchange. Check your connection and try again.');
  });
});

describe('an adapter that breaks its promise never to throw', () => {
  it('keeps the last good board and notes the failure instead of crashing', async () => {
    let fail = false;
    const adapter = { board: vi.fn(async () => { if (fail) throw new Error('boom'); return ok({ generatedAt: '2026-11-06T12:05:03Z', companies: [], rules: { stakeChoices: [] } }); }), portfolio: vi.fn(() => { throw new Error('sync boom'); }) };
    const session = createMarketSession({ adapter, ...at });
    await session.refreshBoard();
    fail = true;
    await expect(session.refreshBoard()).resolves.toMatchObject({ ok: false });
    expect(session.board).not.toBe(null);
    expect(session.boardNote).toBe('Could not refresh (last update 12:05)');
    await expect(session.refreshPortfolio()).resolves.toMatchObject({ ok: false });
    expect(session.portfolioNote).toBe('Could not reach the Island Exchange. Check your connection and try again.');
  });
});

describe('the portfolio', () => {
  it('knows when the player is signed out and shows no portfolio', async () => {
    const adapter = createFakeMarketAdapter({ signedIn: false });
    const session = createMarketSession({ adapter, ...at });
    expect(session.signedIn).toBe(null);
    await session.refreshPortfolio();
    expect(session.signedIn).toBe(false);
    expect(session.portfolio).toBe(null);
    expect(session.portfolioNote).toBe(null);
  });

  it('knows when the player is signed in', async () => {
    const session = createMarketSession({ adapter: createFakeMarketAdapter(), ...at });
    await session.refreshPortfolio();
    expect(session.signedIn).toBe(true);
    expect(session.portfolio.coins).toBeGreaterThan(0);
  });

  it('keeps the last portfolio and notes a failed refresh', async () => {
    const adapter = createFakeMarketAdapter();
    const session = createMarketSession({ adapter, ...at });
    await session.refreshPortfolio();
    adapter.dev.failNext('database_error', 'portfolio');
    await session.refreshPortfolio();
    expect(session.portfolio).not.toBe(null);
    expect(session.portfolioNote).toBe('Could not refresh (last update 12:05)');
  });

  it('explains a refusal when there is nothing to keep', async () => {
    const adapter = createFakeMarketAdapter();
    adapter.dev.failNext('feature_off', 'portfolio');
    const session = createMarketSession({ adapter, ...at });
    await session.refreshPortfolio();
    expect(session.portfolioNote).toBe('The Island Exchange is not open yet.');
  });

  it('refreshes both together', async () => {
    const adapter = { board: vi.fn(async () => ok({ generatedAt: 'x', companies: [], rules: {} })), portfolio: vi.fn(async () => ok(portfolio([]))) };
    const session = createMarketSession({ adapter, ...at });
    await session.refreshAll();
    expect(adapter.board).toHaveBeenCalledTimes(1);
    expect(adapter.portfolio).toHaveBeenCalledTimes(1);
  });

  it('shares one request between refreshes that overlap', async () => {
    let release;
    const adapter = { board: vi.fn(() => new Promise(resolve => { release = () => resolve(ok({ companies: [], rules: {} })); })), portfolio: vi.fn() };
    const session = createMarketSession({ adapter, ...at });
    const first = session.refreshBoard(), second = session.refreshBoard();
    release();
    await Promise.all([first, second]);
    expect(adapter.board).toHaveBeenCalledTimes(1);
  });
});

describe('positions that close at zero', () => {
  const scripted = answers => ({ board: vi.fn(), portfolio: vi.fn(async () => answers.shift()) });

  it('tells the panel once when a position it knew has closed at zero', async () => {
    const notices = [];
    const adapter = scripted([
      ok(portfolio([position('p1')])),
      ok(portfolio([], [position('p1', { closedAs: 'zeroed' })])),
      ok(portfolio([], [position('p1', { closedAs: 'zeroed' })])),
    ]);
    const session = createMarketSession({ adapter, ...at, onNotice: text => notices.push(text) });
    await session.refreshPortfolio();
    expect(notices).toEqual([]);
    await session.refreshPortfolio();
    expect(notices).toEqual(['Your falling position in Pier Post Courier reached its zero point and closed at zero.']);
    await session.refreshPortfolio();
    expect(notices.length).toBe(1);
  });

  it('says nothing about a position the player closed, or one that closed before the panel looked', async () => {
    const notices = [];
    const adapter = scripted([
      ok(portfolio([], [position('old', { closedAs: 'zeroed' })])),
      ok(portfolio([position('p2')], [position('old', { closedAs: 'zeroed' })])),
      ok(portfolio([], [position('p2', { closedAs: 'closed' })])),
    ]);
    const session = createMarketSession({ adapter, ...at, onNotice: text => notices.push(text) });
    for (let i = 0; i < 3; i += 1) await session.refreshPortfolio();
    expect(notices).toEqual([]);
  });

  it('does not compare with a portfolio that failed to load', async () => {
    const notices = [];
    const adapter = scripted([ok(portfolio([position('p1')])), failure('network_error'), ok(portfolio([position('p1')]))]);
    const session = createMarketSession({ adapter, ...at, onNotice: text => notices.push(text) });
    for (let i = 0; i < 3; i += 1) await session.refreshPortfolio();
    expect(notices).toEqual([]);
  });
});

describe('listeners', () => {
  it('tells listeners after every change and stops when asked', async () => {
    const session = createMarketSession({ adapter: createFakeMarketAdapter(), ...at });
    const heard = vi.fn();
    const stop = session.subscribe(heard);
    await session.refreshBoard();
    await session.refreshPortfolio();
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    await session.refreshBoard();
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe('private identity boundaries', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
  };
  it('clears private positions immediately and isolates late reads from the next identity', async () => {
    const old = deferred(), fresh = deferred(), onNotice = vi.fn();
    const adapter = {portfolio: vi.fn().mockResolvedValueOnce(ok(portfolio([position('old-position')]))), board: vi.fn()};
    const session = createMarketSession({adapter, onNotice});
    await session.refreshPortfolio();
    adapter.portfolio.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => fresh.promise);
    const oldRead = session.refreshPortfolio();
    session.resetPrivate(false);
    expect(session.portfolio).toBeNull();
    expect(session.portfolioNote).toBeNull();
    expect(session.signedIn).toBe(false);
    session.resetPrivate(true);
    const freshRead = session.refreshPortfolio();
    expect(adapter.portfolio).toHaveBeenCalledTimes(3);
    old.resolve(ok(portfolio([], [position('old-position', {closedAs: 'zeroed'})])));
    expect(await oldRead).toMatchObject({ok: false, code: 'unauthorized'});
    expect(session.portfolio).toBeNull();
    expect(onNotice).not.toHaveBeenCalled();
    expect(session.refreshPortfolio()).toBe(freshRead);
    fresh.resolve(ok({...portfolio([position('fresh-position')]), coins: 27}));
    await freshRead;
    expect(session.portfolio.positions.map(item => item.id)).toEqual(['fresh-position']);
    expect(session.portfolio.coins).toBe(27);
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('keeps the public price board across an identity reset but ignores private replies after disposal', async () => {
    const pending = deferred(), heard = vi.fn();
    const adapter = createFakeMarketAdapter();
    const session = createMarketSession({adapter});
    await session.refreshBoard();
    const board = session.board;
    session.resetPrivate(false);
    expect(session.board).toBe(board);
    adapter.portfolio = () => pending.promise;
    const reading = session.refreshPortfolio();
    session.dispose();
    session.subscribe(heard);
    pending.resolve(ok(portfolio([position('old-position')])));
    await reading;
    expect(session.portfolio).toBeNull();
    expect(heard).not.toHaveBeenCalled();
  });
});
