// Opening and closing: one uid per click, "Send again" reuses it, and an unknown outcome blocks new trades until settled.
import { describe, expect, it, vi } from 'vitest';
import { createTrades } from '../../src/screens/market/trades.js';
import { createMarketSession } from '../../src/screens/market/session.js';
import { createFakeMarketAdapter } from '../../src/screens/market/fake.js';
import { OUTCOME_UNKNOWN } from '../../src/screens/market/words.js';

const intent = { companyId: 'harbor-trust', side: 'rising', stake: 100 };
const failure = (code, status = 409, extra = {}) => ({ ok: false, code, message: '', status, retryAfterSeconds: null, ...extra });
const unknown = () => failure('outcome_unknown', 0);

async function setup({ scripted = false, fake: fakeOptions } = {}) {
  const fake = createFakeMarketAdapter(fakeOptions);
  const adapter = {
    board: vi.fn((...args) => fake.board(...args)),
    portfolio: vi.fn((...args) => fake.portfolio(...args)),
    open: vi.fn(scripted ? undefined : (...args) => fake.open(...args)),
    close: vi.fn(scripted ? undefined : (...args) => fake.close(...args)),
  };
  const session = createMarketSession({ adapter, timeZone: 'UTC' });
  await session.refreshAll();
  adapter.board.mockClear(); adapter.portfolio.mockClear();
  let count = 0;
  const trades = createTrades({ adapter, session, makeUid: () => `click-uid-${++count}` });
  return { fake, adapter, session, trades };
}

describe('opening a position', () => {
  it('sends the intent with the uid of this click and tells what happened', async () => {
    const { adapter, trades } = await setup();
    const result = await trades.open(intent);
    expect(adapter.open).toHaveBeenCalledWith(intent, { uid: 'click-uid-1' });
    expect(result.kind).toBe('done');
    expect(result.message).toBe('Opened your rising position in Saltreach Harbor Trust at 76,159.21 USDT. Zero point: 68,543.29 USDT. You paid 102 coins and have 838 coins left.');
    expect(trades.pending).toBe(null);
  });

  it('refreshes the board and the portfolio so the new position shows up', async () => {
    const { session, adapter, trades } = await setup();
    const before = session.portfolio.positions.length;
    const result = await trades.open(intent);
    await result.refreshed;
    expect(adapter.board).toHaveBeenCalledTimes(1);
    expect(adapter.portfolio).toHaveBeenCalledTimes(1);
    expect(session.portfolio.positions.length).toBe(before + 1);
  });

  it('makes a new uid for every click', async () => {
    const { adapter, trades } = await setup();
    await trades.open(intent);
    await trades.open({ ...intent, side: 'falling' });
    expect(adapter.open.mock.calls.map(call => call[1].uid)).toEqual(['click-uid-1', 'click-uid-2']);
  });

  it('shows the words of the server for a refusal and uses a new uid on the next click', async () => {
    const { fake, adapter, trades } = await setup();
    fake.dev.failNext('market_closed');
    const result = await trades.open(intent);
    expect(result).toMatchObject({ kind: 'refused', code: 'market_closed' });
    expect(result.message).toContain('closed');
    expect(trades.pending).toBe(null);
    await result.refreshed;
    expect(adapter.board).toHaveBeenCalled();
    await trades.open(intent);
    expect(adapter.open.mock.calls[1][1].uid).toBe('click-uid-2');
  });

  it('names the coins needed when there are not enough', async () => {
    const { fake, trades } = await setup();
    fake.dev.failNext('insufficient_funds');
    expect((await trades.open(intent)).message).toBe('You need 102 coins for this stake and its fee.');
  });

  it('says how long to wait after a too-fast trade and does not ask the server for more', async () => {
    const { fake, adapter, trades } = await setup();
    fake.dev.failNext('too_many_requests');
    const result = await trades.open(intent);
    expect(result.message).toBe('You are trading very fast. Wait 7 seconds, then try again.');
    await result.refreshed;
    expect(adapter.board).not.toHaveBeenCalled();
    expect(adapter.portfolio).not.toHaveBeenCalled();
  });

  it('asks the player to sign in, without refreshing', async () => {
    const { adapter, trades } = await setup({ fake: { signedIn: false } });
    const result = await trades.open(intent);
    expect(result).toMatchObject({ kind: 'refused', code: 'unauthorized', message: 'Sign in to trade on the Island Exchange.' });
    await result.refreshed;
    expect(adapter.portfolio).not.toHaveBeenCalled();
  });

  it('ignores a second click while the first is still on its way', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    let release;
    adapter.open.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true, data: { side: 'rising', stake: 100, fee: 2, coinsChange: -102, coins: 838, entryPrice: 1, zeroPrice: 0.9, companyId: 'harbor-trust', positionId: 'x' } }); }));
    const first = trades.open(intent);
    expect(trades.busy).toBe(true);
    expect(await trades.open(intent)).toMatchObject({ kind: 'busy' });
    release();
    expect((await first).kind).toBe('done');
    expect(trades.busy).toBe(false);
    expect(adapter.open).toHaveBeenCalledTimes(1);
  });
});

describe('an adapter that breaks its promise never to throw', () => {
  it('counts a throw on open as an unknown outcome and keeps the attempt for sending again', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockRejectedValueOnce(new Error('boom'));
    const result = await trades.open(intent);
    expect(result.kind).toBe('unknown');
    expect(trades.pending).toEqual({ kind: 'open', intent, uid: 'click-uid-1' });
    expect(trades.busy).toBe(false);
  });
});

describe('when the outcome is not known', () => {
  it('keeps the attempt, refreshes the portfolio and says to check', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown());
    const result = await trades.open(intent);
    expect(result).toMatchObject({ kind: 'unknown', message: OUTCOME_UNKNOWN });
    expect(trades.pending).toEqual({ kind: 'open', intent, uid: 'click-uid-1' });
    await result.refreshed;
    expect(adapter.portfolio).toHaveBeenCalledTimes(1);
  });

  it('sends again with the same uid, and takes already_applied as done', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown()).mockResolvedValueOnce(failure('already_applied'));
    await trades.open(intent);
    const again = await trades.sendAgain();
    expect(adapter.open.mock.calls[1]).toEqual([intent, { uid: 'click-uid-1' }]);
    expect(again).toMatchObject({ kind: 'already_done', message: 'This was already done. Look under Your positions.' });
    expect(trades.pending).toBe(null);
  });

  it('sends again with the same uid, and does the trade if the first never arrived', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    const answer = { positionId: 'x', companyId: 'harbor-trust', side: 'rising', stake: 100, fee: 2, coinsChange: -102, coins: 838, entryPrice: 76159.21, zeroPrice: 68543.289 };
    adapter.open.mockResolvedValueOnce(unknown()).mockResolvedValueOnce({ ok: true, data: answer });
    await trades.open(intent);
    const again = await trades.sendAgain();
    expect(again.kind).toBe('done');
    expect(adapter.open.mock.calls.map(call => call[1].uid)).toEqual(['click-uid-1', 'click-uid-1']);
    expect(trades.pending).toBe(null);
  });

  it('stays pending when sending again is also unknown', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown()).mockResolvedValueOnce(unknown());
    await trades.open(intent);
    expect((await trades.sendAgain()).kind).toBe('unknown');
    expect(trades.pending.uid).toBe('click-uid-1');
  });

  it('refuses a new trade until the unknown one is settled', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown());
    await trades.open(intent);
    const blocked = await trades.open({ ...intent, side: 'falling' });
    expect(blocked.kind).toBe('blocked');
    expect(blocked.message).toContain('Check your last trade');
    expect(await trades.close({ positionId: 'x' })).toMatchObject({ kind: 'blocked' });
    expect(adapter.open).toHaveBeenCalledTimes(1);
    expect(adapter.close).not.toHaveBeenCalled();
  });

  it('clears the attempt when sending again is refused for a clear reason', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown()).mockResolvedValueOnce(failure('market_closed'));
    await trades.open(intent);
    expect((await trades.sendAgain()).kind).toBe('refused');
    expect(trades.pending).toBe(null);
  });

  it('checks again by refreshing the portfolio and explains what to look for', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown());
    await (await trades.open(intent)).refreshed;
    adapter.portfolio.mockClear();
    const checked = await trades.checkAgain();
    expect(adapter.portfolio).toHaveBeenCalledTimes(1);
    expect(checked).toMatchObject({ kind: 'checked', message: 'Updated your positions. If your trade is not listed, send it again, or forget it.' });
    expect(trades.pending).not.toBe(null);
  });

  it('does nothing when there is nothing to send again', async () => {
    const { trades } = await setup();
    expect(await trades.sendAgain()).toMatchObject({ kind: 'nothing' });
  });
});

describe('forgetting a trade that could not be confirmed', () => {
  it('drops the attempt without sending anything, so a new trade can start with a new uid', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown());
    await trades.open(intent);
    expect(trades.pending).not.toBe(null);

    const forgotten = trades.forget();

    expect(forgotten).toMatchObject({ kind: 'forgotten', message: 'Forgot that trade. It was not sent again. You can start a new one.' });
    expect(trades.pending).toBe(null);
    expect(adapter.open).toHaveBeenCalledTimes(1); // forgetting sends nothing
    adapter.open.mockResolvedValueOnce({ ok: true, data: { positionId: 'y', companyId: 'harbor-trust', side: 'falling', stake: 100, fee: 2, coinsChange: -102, coins: 838, entryPrice: 76159.21, zeroPrice: 83775.131 } });
    expect((await trades.open({ ...intent, side: 'falling' })).kind).toBe('done');
    expect(adapter.open.mock.calls.map(call => call[1].uid)).toEqual(['click-uid-1', 'click-uid-2']);
  });

  it('has nothing to send again after forgetting', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown());
    await trades.open(intent);
    trades.forget();
    expect(await trades.sendAgain()).toMatchObject({ kind: 'nothing' });
  });

  it('forgets a close that could not be confirmed too', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.close.mockResolvedValueOnce(unknown());
    await trades.close({ positionId: 'x' });
    expect(trades.forget().kind).toBe('forgotten');
    expect(trades.pending).toBe(null);
  });

  it('does nothing when no trade is waiting', async () => {
    const { trades } = await setup();
    expect(trades.forget()).toMatchObject({ kind: 'nothing', message: '' });
  });

  it('does not drop an attempt that is still on its way', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.open.mockResolvedValueOnce(unknown());
    await trades.open(intent);
    let release;
    adapter.open.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(unknown()); }));
    const again = trades.sendAgain();
    expect(trades.forget().kind).toBe('nothing');
    expect(trades.pending).not.toBe(null);
    release();
    await again;
    expect(trades.pending.uid).toBe('click-uid-1');
  });
});

describe('closing a position', () => {
  it('sends the position id with the uid of this click and says what was received', async () => {
    const { session, adapter, trades } = await setup();
    const id = session.portfolio.positions.find(item => item.canClose).id;
    const result = await trades.close({ positionId: id });
    expect(adapter.close).toHaveBeenCalledWith({ positionId: id }, { uid: 'click-uid-1' });
    expect(result.kind).toBe('done');
    expect(result.message).toBe('Closed your position in Saltreach Harbor Trust at 76,159.21 USDT. You received 113 coins and now have 1,053 coins.');
    await result.refreshed;
    expect(session.portfolio.positions.some(item => item.id === id)).toBe(false);
  });

  it('explains a position that was already used up when the player pressed close', async () => {
    const { session, adapter, trades } = await setup({ scripted: true });
    const id = session.portfolio.positions[0].id;
    adapter.close.mockResolvedValueOnce({ ok: true, data: { positionId: id, closedAs: 'zeroed', closePrice: 68000, value: 0, fee: 0, coinsChange: 0, coins: 940 } });
    const result = await trades.close({ positionId: id });
    expect(result.message).toContain('had already reached its zero point');
    expect(result.message).toContain('Saltreach Harbor Trust');
  });

  it('uses the price style of the position when the board no longer lists its company', async () => {
    const { session, adapter, trades } = await setup({ scripted: true });
    const position = { ...session.portfolio.positions.find(item => item.companyId === 'pier-post-courier'), canClose: true };
    session.board.companies = session.board.companies.filter(company => company.id !== 'pier-post-courier');
    session.portfolio.positions = [position];
    adapter.close.mockResolvedValueOnce({ ok: true, data: { positionId: position.id, closedAs: 'closed', closePrice: 2.4012, value: 49, fee: 1, coinsChange: 48, coins: 988 } });
    const result = await trades.close({ positionId: position.id });
    expect(result.message).toBe('Closed your position in Pier Post Courier at 2.4012 USDT. You received 48 coins and now have 988 coins.');
  });

  it('keeps the uid for sending a close again', async () => {
    const { adapter, trades } = await setup({ scripted: true });
    adapter.close.mockResolvedValueOnce(unknown()).mockResolvedValueOnce(failure('already_applied'));
    await trades.close({ positionId: 'x' });
    expect(trades.pending).toEqual({ kind: 'close', intent: { positionId: 'x' }, uid: 'click-uid-1' });
    await trades.sendAgain();
    expect(adapter.close.mock.calls[1]).toEqual([{ positionId: 'x' }, { uid: 'click-uid-1' }]);
  });
});
