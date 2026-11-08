// The view models turn server answers into the exact words and numbers the panel shows. They add no rules:
// every coin, fee and zero point below comes from the answer, and the screen only rounds for display.
import { describe, expect, it } from 'vitest';
import { boardRows, openPreview, positionRows, creditRows, boardNotes } from '../../src/screens/market/view-models.js';

const at = { timeZone: 'UTC' };
const RULES = {
  leverage: 10, zeroPointMovePercent: 10, feePercent: 2, minStake: 10, maxStake: 500, dailyStakeCap: 2000, maxOpenPositions: 20,
  stakeChoices: [{ stake: 10, fee: 1, total: 11 }, { stake: 100, fee: 2, total: 102 }, { stake: 500, fee: 10, total: 510 }],
};
const company = (extra) => ({
  id: 'harbor-trust', name: 'Saltreach Harbor Trust', ticker: 'SHT', kind: 'island', follows: 'Bitcoin', market: 'always',
  marketName: 'Around the clock', currency: 'USDT', priceDecimals: 2, tagline: 'The old harbor bank.',
  price: 76159.21, priceAt: '2026-11-06T12:05:00Z', source: 'cache', status: 'open', reason: null, holiday: null,
  opensAt: null, closesAt: null, delisted: false, canOpen: true, canClose: true,
  zeroPrices: { rising: 68543.289, falling: 83775.131 }, ...extra,
});
const board = (companies, extra) => ({
  generatedAt: '2026-11-06T12:05:03Z', demo: false, demoNote: null, tradingEnabled: true, relit: false,
  companies, rules: RULES, credits: [], simulationNote: 'Simulation with play money.', ...extra,
});

describe('boardRows', () => {
  it('shows an open island company with its real price, currency and time', () => {
    const [row] = boardRows(board([company()]), at);
    expect(row).toMatchObject({
      id: 'harbor-trust', heading: 'Saltreach Harbor Trust', ticker: 'SHT', followsText: 'Follows Bitcoin',
      priceLabel: 'Price', priceText: '76,159.21 USDT', priceAtText: '12:05', statusText: 'Open around the clock',
      status: 'open', canOpen: true, blockedText: null, delisted: false,
    });
  });

  it('uses the status and reason of the server for a closed stock and shows its last price', () => {
    const apple = company({
      id: 'apple', name: 'Apple', ticker: 'AAPL', kind: 'stock', follows: 'Apple Inc. shares (Nasdaq)', market: 'us',
      currency: 'USD', price: 271.2, priceAt: '2026-11-05T20:59:59Z', status: 'closed', reason: 'outside_hours',
      opensAt: '2026-11-06T14:30:00Z', canOpen: false, canClose: false, zeroPrices: null,
    });
    const [row] = boardRows(board([apple]), at);
    expect(row.priceLabel).toBe('Last price');
    expect(row.priceText).toBe('271.20 USD');
    expect(row.priceAtText).toBe('yesterday 20:59');
    expect(row.statusText).toBe('Closed, opens 14:30 Lisbon time');
    expect(row.canOpen).toBe(false);
    expect(row.blockedText).toBe('Closed, opens 14:30 Lisbon time');
  });

  it('never leaves a company without a reason when it cannot be opened', () => {
    const stale = company({ status: 'stale', reason: 'source_away', canOpen: false, zeroPrices: null });
    const none = company({ id: 'tesla', status: 'unavailable', reason: 'no_price', price: null, priceAt: null, canOpen: false, zeroPrices: null });
    const rows = boardRows(board([stale, none]), at);
    expect(rows[0].blockedText).toBe('Price source not answering. Last price 12:05. Trading paused.');
    expect(rows[0].priceLabel).toBe('Last price');
    expect(rows[1].blockedText).toBe('No price yet.');
    expect(rows[1].priceText).toBe('Not available');
    expect(rows[1].priceAtText).toBe('');
  });

  it('labels an unquoted closed stock without changing its unavailable status or open capability', () => {
    const stock = company({id:'apple',kind:'stock',market:'us',status:'unavailable',reason:'no_price',price:null,
      priceAt:null,opensAt:'2026-11-09T14:30:00Z',canOpen:false,canClose:false,zeroPrices:null});
    const original = structuredClone(stock), snapshot = board([stock],{generatedAt:'2026-11-08T12:00:00Z'});
    const [row] = boardRows(snapshot,{timeZone:'America/New_York'});
    expect(row).toMatchObject({status:'unavailable',canOpen:false,zeroPrices:null,priceText:'Not available',
      statusText:'Closed, opens Monday 14:30 Lisbon time. No price yet.',
      blockedText:'Closed, opens Monday 14:30 Lisbon time. No price yet.'});
    expect(boardRows({...snapshot,tradingEnabled:false})[0].blockedText).toBe('Trading opens later.');
    expect(stock).toEqual(original);
  });

  it('explains a delisted company and a board with trading switched off', () => {
    const delisted = company({ delisted: true, canOpen: false });
    expect(boardRows(board([delisted]), at)[0].blockedText).toBe('Delisted after the Relighting: you can only close positions.');
    const soon = boardRows(board([company({ canOpen: false })], { tradingEnabled: false }), at)[0];
    expect(soon.blockedText).toBe('Trading opens later.');
    expect(soon.statusText).toBe('Open around the clock');
  });

  it('shows no open control without a price or while the server board turns trading off', () => {
    expect(boardRows(board([company({price: null})]), at)[0].canOpen).toBe(false);
    expect(boardRows(board([company()], {tradingEnabled: false}), at)[0])
      .toMatchObject({canOpen: false, blockedText: 'Trading opens later.'});
  });

  it('copes with a missing or broken board', () => {
    expect(boardRows(null, at)).toEqual([]);
    expect(boardRows({}, at)).toEqual([]);
    expect(boardRows({ companies: 'no' }, at)).toEqual([]);
  });

  it('skips list entries that are not objects, so one bad entry cannot break the panel', () => {
    expect(boardRows(board([null, 5, 'x', company()]), at).map(row => row.id)).toEqual(['harbor-trust']);
    expect(positionRows({ positions: [null, 3], recentlyClosed: [undefined] }, null, at)).toMatchObject({ open: [], closed: [] });
    expect(creditRows({ credits: [null, { text: 'Ok', href: null }] })).toHaveLength(1);
  });

  it('keeps hostile text as plain strings', () => {
    const [row] = boardRows(board([company({ name: '<img src=x onerror=alert(1)>' })]), at);
    expect(row.heading).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('openPreview', () => {
  const [row] = boardRows(board([company()]), at);
  const hundred = RULES.stakeChoices[1];

  it('takes fee, total and zero point from the server and rounds the zero point toward the entry price', () => {
    const rising = openPreview(row, 'rising', hundred, RULES);
    expect(rising.ready).toBe(true);
    expect(rising.zeroText).toBe('Zero point: 68,543.29 USDT (estimate; set by the price at the moment you open)');
    expect(rising.lossText).toBe('You can lose at most 102 coins');
    expect(rising.confirmLabel).toBe('Open rising position for 102 coins');
    const falling = openPreview(row, 'falling', hundred, RULES);
    expect(falling.zeroText).toBe('Zero point: 83,775.13 USDT (estimate; set by the price at the moment you open)');
    expect(falling.confirmLabel).toBe('Open falling position for 102 coins');
  });

  it('states the 10x rule with the numbers of the server rules', () => {
    const { noteText } = openPreview(row, null, null, RULES);
    expect(noteText).toBe('10x: every 1 % the price moves changes your position by 10 % of your stake. '
      + 'If the price reaches the zero point (10 % against you), the position closes by itself at zero.');
    const other = openPreview(row, null, null, { leverage: 5, zeroPointMovePercent: 20 }).noteText;
    expect(other).toContain('5x');
    expect(other).toContain('20 %');
  });

  it('is not ready until a side and a stake are chosen, but still shows what it can', () => {
    expect(openPreview(row, null, null, RULES)).toMatchObject({ ready: false, zeroText: null, lossText: null, confirmLabel: 'Choose a side and a stake' });
    expect(openPreview(row, 'rising', null, RULES)).toMatchObject({ ready: false, confirmLabel: 'Choose a stake' });
    expect(openPreview(row, null, hundred, RULES)).toMatchObject({ ready: false, lossText: 'You can lose at most 102 coins', confirmLabel: 'Choose a side' });
  });

  it('accepts the stake as a plain number too', () => {
    expect(openPreview(row, 'rising', 100, RULES).confirmLabel).toBe('Open rising position for 102 coins');
    expect(openPreview(row, 'rising', 77, RULES).ready).toBe(false);
  });

  it('is not ready when the company has no zero point to show', () => {
    const [closed] = boardRows(board([company({ status: 'closed', reason: 'outside_hours', canOpen: false, zeroPrices: null })]), at);
    const preview = openPreview(closed, 'rising', hundred, RULES);
    expect(preview.ready).toBe(false);
    expect(preview.zeroText).toBe(null);
  });
});

describe('positionRows', () => {
  const PORTFOLIO = {
    coins: 940, demo: false, feePercent: 2, stakedToday: 100, dailyStakeCap: 2000, openCount: 1, maxOpenPositions: 20,
    generatedAt: '2026-11-06T12:05:03Z',
    positions: [{
      id: '7b3e', companyId: 'harbor-trust', name: 'Saltreach Harbor Trust', ticker: 'SHT', follows: 'Bitcoin', side: 'rising',
      mode: 'live', stake: 100, openFee: 2, entryPrice: 75000, zeroPrice: 67500, openedAt: '2026-11-06T11:40:12Z',
      price: 76159.21, priceAt: '2026-11-06T12:05:00Z', companyStatus: 'open', companyReason: null, opensAt: null,
      value: 115, profit: 15, profitPercent: 15, closeFee: 2, wouldReceive: 113, result: 11, canClose: true,
    }],
    recentlyClosed: [
      { id: '9a71', companyId: 'pier-post-courier', name: 'Pier Post Courier', side: 'falling', mode: 'live', stake: 50, openFee: 1,
        entryPrice: 2.4, zeroPrice: 2.64, openedAt: '2026-11-06T09:12:40Z', closedAs: 'zeroed', closePrice: 2.6512,
        closedAt: '2026-11-06T10:02:31Z', value: 0, closeFee: 0, coinsChange: 0, result: -51 },
      { id: 'c3d4', companyId: 'harbor-trust', name: 'Saltreach Harbor Trust', side: 'rising', mode: 'live', stake: 100, openFee: 2,
        entryPrice: 76000, zeroPrice: 68400, openedAt: '2026-11-06T08:00:00Z', closedAs: 'closed', closePrice: 77520,
        closedAt: '2026-11-06T09:30:00Z', value: 120, closeFee: 2, coinsChange: 118, result: 16 },
    ],
  };
  const withDecimals = board([company(), company({ id: 'pier-post-courier', name: 'Pier Post Courier', priceDecimals: 4 })]);

  it('summarises the account', () => {
    const view = positionRows(PORTFOLIO, withDecimals, at);
    expect(view.coinsText).toBe('940 coins');
    expect(view.stakedText).toBe('Staked today: 100 of 2,000 coins');
    expect(view.openCountText).toBe('Open positions: 1 of 20');
  });

  it('shows an open position with value, profit in words and what closing would pay', () => {
    const [row] = positionRows(PORTFOLIO, withDecimals, at).open;
    expect(row).toMatchObject({
      id: '7b3e', heading: 'Saltreach Harbor Trust', sideText: 'Rising', stakeText: '100 coins',
      entryText: '75,000.00 USDT', zeroText: '67,500.00 USDT', priceLabel: 'Price now', priceText: '76,159.21 USDT',
      priceAtText: '12:05', valueText: '115 coins', profitText: 'Up 15 coins (15.00 %)', direction: 'up',
      canClose: true, receiveText: 'If you close now: you receive 113 coins', confirmText: 'Close and receive about 113 coins?',
      closeLabel: 'Close your rising position in Saltreach Harbor Trust', blockedText: null,
    });
  });

  it('says down for a loss', () => {
    const losing = { ...PORTFOLIO.positions[0], value: 80, profit: -20, profitPercent: -20, wouldReceive: 78, result: -24 };
    const [row] = positionRows({ ...PORTFOLIO, positions: [losing] }, withDecimals, at).open;
    expect(row.profitText).toBe('Down 20 coins (-20.00 %)');
    expect(row.direction).toBe('down');
  });

  it('shows the last price and the reason when the market is closed, and offers no close button', () => {
    const waiting = {
      ...PORTFOLIO.positions[0], id: 'a1', companyId: 'apple', name: 'Apple', price: 271.2, priceAt: '2026-11-05T20:59:59Z',
      companyStatus: 'closed', companyReason: 'outside_hours', opensAt: '2026-11-06T14:30:00Z', canClose: false,
    };
    const apple = company({ id: 'apple', name: 'Apple', kind: 'stock', market: 'us', currency: 'USD', status: 'closed', reason: 'outside_hours', canOpen: false });
    const view = positionRows({ ...PORTFOLIO, positions: [waiting] }, board([apple]), at);
    expect(view.open[0]).toMatchObject({ canClose: false, priceLabel: 'Last price', priceText: '271.20 USD', receiveText: null, confirmText: null });
    expect(view.open[0].blockedText).toBe('Closed, opens 14:30 Lisbon time');
  });

  it('uses Lisbon opening captions on stock positions while preserving their player-local price timestamps', () => {
    const waiting = { ...PORTFOLIO.positions[0], companyStatus: 'closed', companyReason: 'outside_hours', canClose: false,
      opensAt: '2026-07-07T13:30:00Z', priceAt: '2026-07-07T11:59:00Z' };
    const stock = company({ kind: 'stock', market: 'us', currency: 'USD', canOpen: false });
    const [row] = positionRows({ ...PORTFOLIO, generatedAt: '2026-07-07T12:00:00Z', positions: [waiting] }, board([stock]),
      { timeZone: 'America/New_York' }).open;
    expect(row.blockedText).toBe('Closed, opens 14:30 Lisbon time');
    expect(row.priceAtText).toBe('07:59'); expect(row.canClose).toBe(false);
  });

  it.each([false,true])('keeps an unquoted stock position\'s supplied canClose=%s while improving its blocked words', canClose => {
    const waiting = {...PORTFOLIO.positions[0],companyStatus:'unavailable',companyReason:'no_price',
      opensAt:'2026-11-09T14:30:00Z',price:null,priceAt:null,canClose};
    const stock = company({kind:'stock',market:'us',canOpen:false,canClose:false});
    const [row] = positionRows({...PORTFOLIO,generatedAt:'2026-11-08T12:00:00Z',positions:[waiting]},board([stock]),at).open;
    expect(row.canClose).toBe(canClose);
    expect(row.blockedText).toBe(canClose?null:'Closed, opens Monday 14:30 Lisbon time. No price yet.');
    expect(waiting.companyStatus).toBe('unavailable');expect(waiting.companyReason).toBe('no_price');
  });

  it('names the holiday from the board when the position row has only the reason', () => {
    const waiting = { ...PORTFOLIO.positions[0], companyStatus: 'closed', companyReason: 'holiday', opensAt: '2026-11-27T14:30:00Z', canClose: false };
    const apple = company({ status: 'closed', reason: 'holiday', holiday: 'Thanksgiving Day', canOpen: false });
    const [row] = positionRows({ ...PORTFOLIO, positions: [waiting] }, board([apple]), at).open;
    expect(row.blockedText).toBe('Closed for Thanksgiving Day, opens Friday 14:30');
  });

  it('describes a position closed by the player and one that closed at zero', () => {
    const { closed } = positionRows(PORTFOLIO, withDecimals, at);
    expect(closed[0].line).toBe('Closed at zero: the price reached 2.6512 USDT (your zero point was 2.6400 USDT)');
    expect(closed[0].resultText).toBe('Result after both fees: -51 coins');
    expect(closed[0].zeroed).toBe(true);
    expect(closed[1].line).toBe('Closed by you: +118 coins');
    expect(closed[1].resultText).toBe('Result after both fees: +16 coins');
    expect(closed[1].zeroed).toBe(false);
  });

  it('still works when the board is not loaded, using two decimals', () => {
    const view = positionRows(PORTFOLIO, null, at);
    expect(view.open[0].entryText).toBe('75,000.00');
    expect(view.open[0].blockedText).toBe(null);
  });

  it('shows the prices of a position in its own currency and decimals, without a board', () => {
    const own = { currency: 'USDT', priceDecimals: 4 };
    const portfolio = {
      ...PORTFOLIO,
      positions: [{ ...PORTFOLIO.positions[0], ...own }],
      recentlyClosed: [{ ...PORTFOLIO.recentlyClosed[0], ...own }],
    };
    const view = positionRows(portfolio, null, at);
    expect(view.open[0]).toMatchObject({ entryText: '75,000.0000 USDT', zeroText: '67,500.0000 USDT', priceText: '76,159.2100 USDT' });
    expect(view.closed[0].line).toBe('Closed at zero: the price reached 2.6512 USDT (your zero point was 2.6400 USDT)');
  });

  it('prefers the style of the position over the board and falls back to the board when the position has none', () => {
    const board4 = board([company({ priceDecimals: 4, currency: 'EUR' })]);
    const own = { ...PORTFOLIO.positions[0], currency: 'USDT', priceDecimals: 2 };
    expect(positionRows({ ...PORTFOLIO, positions: [own] }, board4, at).open[0].entryText).toBe('75,000.00 USDT');
    const none = { ...PORTFOLIO.positions[0], currency: null, priceDecimals: null };
    expect(positionRows({ ...PORTFOLIO, positions: [none] }, board4, at).open[0].entryText).toBe('75,000.0000 EUR');
    expect(positionRows({ ...PORTFOLIO, positions: [none] }, null, at).open[0].entryText).toBe('75,000.00');
  });

  it('says why a position opened on the other kind of prices cannot be closed, instead of a bare "not available"', () => {
    const other = {
      ...PORTFOLIO.positions[0], mode: 'replay', price: null, priceAt: null, companyStatus: 'unavailable', companyReason: 'wrong_price_mode',
      value: null, profit: null, profitPercent: null, closeFee: null, wouldReceive: null, result: null, canClose: false,
    };
    const [row] = positionRows({ ...PORTFOLIO, positions: [other] }, withDecimals, at).open;
    expect(row.canClose).toBe(false);
    expect(row.blockedText).toBe('Opened on the demo recording: it can be closed only in demo mode.');
    expect(row.receiveText).toBe(null);
  });

  it('has friendly empty lines', () => {
    const empty = positionRows({ ...PORTFOLIO, positions: [], recentlyClosed: [], openCount: 0 }, withDecimals, at);
    expect(empty.open).toEqual([]);
    expect(empty.emptyOpenText).toBe('You have no open positions. Open one from the Prices tab.');
    expect(empty.emptyClosedText).toBe('Nothing closed yet.');
  });

  it('copes with a missing portfolio', () => {
    expect(positionRows(null, withDecimals, at)).toMatchObject({ open: [], closed: [], coinsText: 'unknown' });
  });
});

describe('notes and credits', () => {
  it('collects the notes shown above the prices', () => {
    const live = boardNotes(board([company()]));
    expect(live).toEqual({ demo: null, soon: null, simulation: 'Simulation with play money.' });
    const demo = boardNotes(board([company()], { demo: true, demoNote: null, tradingEnabled: false, simulationNote: '' }));
    expect(demo.demo).toContain('Demo recording');
    expect(demo.soon).toBe('Trading opens later.');
    expect(demo.simulation).toBe('Simulation with play money. Real names and real prices, no real money and no prizes.');
  });

  it('keeps credits with their links and drops links that are not https', () => {
    const rows = creditRows(board([], {
      credits: [
        { text: 'Real prices from Binance market data.', href: null, licenceText: null, licenceHref: null },
        { text: 'Stock prices from Finnhub.', href: 'https://finnhub.io', licenceText: null, licenceHref: null },
        { text: 'Demo', href: 'javascript:alert(1)', licenceText: 'CC BY-NC-SA 4.0', licenceHref: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
      ],
    }));
    expect(rows[0]).toEqual({ text: 'Real prices from Binance market data.', href: null, licenceText: null, licenceHref: null });
    expect(rows[1].href).toBe('https://finnhub.io');
    expect(rows[2].href).toBe(null);
    expect(rows[2].licenceHref).toBe('https://creativecommons.org/licenses/by-nc-sa/4.0/');
    expect(creditRows(null)).toEqual([]);
  });
});
