// The local fake adapter answers in the shapes of spec section 8, with canned data and no game rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeMarketAdapter } from '../../src/screens/market/fake.js';
import { SCENARIOS, REFUSALS, boardFixture, portfolioFixture } from '../../src/screens/market/fixtures.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const hasKeys = (value, keys, label) => { for (const key of keys) expect(value, `${label}.${key}`).toHaveProperty(key); };
function expectBoardShape(board) {
  hasKeys(board, ['generatedAt', 'demo', 'demoNote', 'tradingEnabled', 'relit', 'companies', 'rules', 'credits', 'simulationNote'], 'board');
  hasKeys(board.rules, ['leverage', 'zeroPointMovePercent', 'feePercent', 'minStake', 'maxStake', 'dailyStakeCap', 'maxOpenPositions', 'stakeChoices', 'tradePriceMaxAgeSeconds', 'tradesPer30Seconds', 'gameDayStarts'], 'rules');
  for (const choice of board.rules.stakeChoices) hasKeys(choice, ['stake', 'fee', 'total'], 'stakeChoice');
  for (const company of board.companies) {
    hasKeys(company, ['id', 'name', 'ticker', 'kind', 'follows', 'market', 'marketName', 'currency', 'priceDecimals', 'tagline', 'price', 'priceAt',
      'source', 'status', 'reason', 'holiday', 'opensAt', 'closesAt', 'delisted', 'canOpen', 'canClose', 'zeroPrices'], company.id);
    expect(['open', 'closed', 'stale', 'unavailable']).toContain(company.status);
    expect(company.zeroPrices !== null, `${company.id} zero prices only while open`).toBe(company.status === 'open');
  }
  for (const credit of board.credits) hasKeys(credit, ['text', 'href', 'licenceText', 'licenceHref'], 'credit');
}
function expectPortfolioShape(portfolio) {
  hasKeys(portfolio, ['coins', 'demo', 'feePercent', 'stakedToday', 'dailyStakeCap', 'openCount', 'maxOpenPositions', 'positions', 'recentlyClosed', 'generatedAt'], 'portfolio');
  for (const position of portfolio.positions) {
    hasKeys(position, ['id', 'companyId', 'name', 'ticker', 'follows', 'currency', 'priceDecimals', 'side', 'mode', 'stake', 'openFee', 'entryPrice', 'zeroPrice', 'openedAt', 'price', 'priceAt',
      'companyStatus', 'companyReason', 'opensAt', 'value', 'profit', 'profitPercent', 'closeFee', 'wouldReceive', 'result', 'canClose'], position.id);
  }
  for (const closed of portfolio.recentlyClosed) {
    hasKeys(closed, ['id', 'companyId', 'name', 'currency', 'priceDecimals', 'side', 'mode', 'stake', 'openFee', 'entryPrice', 'zeroPrice', 'openedAt', 'closedAs', 'closePrice', 'closedAt', 'value', 'closeFee', 'coinsChange', 'result'], closed.id);
    expect(['closed', 'zeroed']).toContain(closed.closedAs);
  }
}

describe('fixtures', () => {
  it('has every scenario the rehearsal needs', () => {
    expect(SCENARIOS).toEqual(['mixed', 'us-open', 'holiday', 'demo', 'off', 'relit']);
  });

  it('keeps every board and portfolio in the shape of section 8', () => {
    for (const name of SCENARIOS) { expectBoardShape(boardFixture(name)); expectPortfolioShape(portfolioFixture(name)); }
  });

  it('covers open, closed, stale and unavailable companies, and both closing reasons', () => {
    const statuses = new Set(SCENARIOS.flatMap(name => boardFixture(name).companies.map(company => company.status)));
    expect([...statuses].sort()).toEqual(['closed', 'open', 'stale', 'unavailable']);
    const reasons = new Set(SCENARIOS.flatMap(name => boardFixture(name).companies.map(company => company.reason)));
    for (const reason of ['outside_hours', 'holiday', 'source_away', 'quote_old', 'waiting_first_price', 'no_price']) expect(reasons.has(reason), reason).toBe(true);
  });

  it('shows demo mode with its label and licence, trading switched off, and the Relighting', () => {
    const demo = boardFixture('demo');
    expect(demo.demo).toBe(true);
    expect(demo.demoNote).toContain('Demo recording');
    expect(demo.companies.every(company => company.kind === 'island' && company.source === 'replay')).toBe(true);
    expect(demo.credits.some(credit => credit.licenceHref?.startsWith('https://'))).toBe(true);
    expect(boardFixture('off').tradingEnabled).toBe(false);
    expect(boardFixture('off').companies.every(company => !company.canOpen)).toBe(true);
    const relit = boardFixture('relit');
    expect(relit.relit).toBe(true);
    expect(relit.rules.feePercent).toBe(1);
    expect(relit.companies.find(company => company.id === 'greyfathom-salvage')).toMatchObject({ delisted: true, canOpen: false, canClose: true });
  });

  it('falls back to the mixed board for a scenario it does not know', () => {
    expect(boardFixture('nonsense').companies.length).toBe(boardFixture('mixed').companies.length);
    expect(boardFixture(undefined).generatedAt).toBe(boardFixture('mixed').generatedAt);
    expect(portfolioFixture('nonsense').coins).toBe(portfolioFixture('mixed').coins);
  });

  it('returns a fresh copy every time', () => {
    const first = boardFixture('mixed');
    first.companies.length = 0;
    expect(boardFixture('mixed').companies.length).toBeGreaterThan(3);
  });

  it('has a refusal with plain words for every error the panel can meet', () => {
    const codes = [
      'unauthorized', 'feature_off', 'no_such_company', 'no_such_position', 'already_applied', 'market_closed', 'prices_stale',
      'company_unavailable', 'company_delisted', 'daily_stake_cap', 'too_many_positions', 'insufficient_funds', 'position_closed',
      'wrong_price_mode', 'validation_error', 'stake_too_small', 'stake_too_big', 'invalid_transaction', 'too_many_requests',
      'database_error', 'database_not_configured', 'market_unavailable', 'outcome_unknown', 'network_error',
    ];
    for (const code of codes) {
      expect(REFUSALS[code], code).toBeDefined();
      expect(REFUSALS[code].message.length, code).toBeGreaterThan(10);
      expect(Number.isInteger(REFUSALS[code].status), code).toBe(true);
    }
    expect(REFUSALS.too_many_requests.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('reading', () => {
  it('answers board and portfolio in the shapes of section 8', async () => {
    for (const scenario of SCENARIOS) {
      const adapter = createFakeMarketAdapter({ scenario });
      const board = await adapter.board();
      const portfolio = await adapter.portfolio();
      expect(board.ok).toBe(true);
      expect(portfolio.ok).toBe(true);
      expectBoardShape(board.data);
      expectPortfolioShape(portfolio.data);
    }
  });

  it('hands out copies, so a screen cannot change the canned data', async () => {
    const adapter = createFakeMarketAdapter();
    (await adapter.board()).data.companies.length = 0;
    expect((await adapter.board()).data.companies.length).toBeGreaterThan(3);
  });

  it('never calls fetch', async () => {
    const fetchSpy = vi.fn(() => { throw new Error('the fake must not fetch'); });
    vi.stubGlobal('fetch', fetchSpy);
    const adapter = createFakeMarketAdapter();
    await adapter.board(); await adapter.portfolio();
    await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 }, { uid: 'u-1234567' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('can start signed out, so the sign-in line can be rehearsed', async () => {
    const adapter = createFakeMarketAdapter({ signedIn: false });
    expect((await adapter.board()).ok).toBe(true);
    expect(await adapter.portfolio()).toMatchObject({ ok: false, code: 'unauthorized', status: 401 });
    expect(await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 }, { uid: 'u-1234567' })).toMatchObject({ ok: false, code: 'unauthorized' });
    expect(await adapter.close({ positionId: 'x' }, { uid: 'u-1234567' })).toMatchObject({ ok: false, code: 'unauthorized' });
  });
});

describe('opening a position', () => {
  const rising = { companyId: 'harbor-trust', side: 'rising', stake: 100 };

  it('accepts it and answers in the shape of section 8.3 using the numbers of the board', async () => {
    const adapter = createFakeMarketAdapter();
    const board = (await adapter.board()).data;
    const before = (await adapter.portfolio()).data;
    const result = await adapter.open(rising, { uid: 'u-1234567' });
    const company = board.companies.find(item => item.id === 'harbor-trust');
    const choice = board.rules.stakeChoices.find(item => item.stake === 100);
    expect(result.ok).toBe(true);
    hasKeys(result.data, ['positionId', 'companyId', 'side', 'stake', 'fee', 'coinsChange', 'coins', 'entryPrice', 'zeroPrice', 'feePercent', 'openedAt'], 'opened');
    expect(result.data).toMatchObject({ companyId: 'harbor-trust', side: 'rising', stake: 100, fee: choice.fee, coinsChange: -choice.total, entryPrice: company.price, zeroPrice: company.zeroPrices.rising });
    expect(result.data.coins).toBe(before.coins - choice.total);
  });

  it('puts the new position in the portfolio and counts it', async () => {
    const adapter = createFakeMarketAdapter();
    const before = (await adapter.portfolio()).data;
    const { data } = await adapter.open({ ...rising, side: 'falling' }, { uid: 'u-1234567' });
    const after = (await adapter.portfolio()).data;
    expectPortfolioShape(after);
    expect(after.positions[0]).toMatchObject({ id: data.positionId, side: 'falling', stake: 100, zeroPrice: data.zeroPrice, entryPrice: data.entryPrice, canClose: true });
    expect(after.positions[0]).toMatchObject({ currency: 'USDT', priceDecimals: 2 }); // the price style of the company, as on the board
    expect(after.openCount).toBe(before.openCount + 1);
    expect(after.stakedToday).toBe(before.stakedToday + 100);
    expect(after.coins).toBe(data.coins);
  });

  it('answers a repeated uid with already_applied and changes nothing', async () => {
    const adapter = createFakeMarketAdapter();
    await adapter.open(rising, { uid: 'u-1234567' });
    const after = (await adapter.portfolio()).data;
    expect(await adapter.open(rising, { uid: 'u-1234567' })).toMatchObject({ ok: false, code: 'already_applied', status: 409 });
    expect((await adapter.portfolio()).data).toEqual(after);
  });

  it.each([
    ['apple', 'market_closed'], ['swiftwater-ferries', 'prices_stale'], ['nvidia', 'company_unavailable'],
    ['no-such-company', 'no_such_company'],
  ])('refuses %s with %s', async (companyId, code) => {
    const adapter = createFakeMarketAdapter();
    const result = await adapter.open({ ...rising, companyId }, { uid: 'u-1234567' });
    expect(result).toMatchObject({ ok: false, code });
    expect(result.message.length).toBeGreaterThan(10);
  });

  it('refuses a delisted company, a switched-off market and a stake that is not offered', async () => {
    expect(await createFakeMarketAdapter({ scenario: 'relit' }).open({ ...rising, companyId: 'greyfathom-salvage' }, { uid: 'u-1234567' })).toMatchObject({ code: 'company_delisted' });
    expect(await createFakeMarketAdapter({ scenario: 'off' }).open(rising, { uid: 'u-1234567' })).toMatchObject({ code: 'feature_off' });
    expect(await createFakeMarketAdapter().open({ ...rising, stake: 77 }, { uid: 'u-1234567' })).toMatchObject({ code: 'validation_error', status: 422 });
  });

  it('refuses when the coins would not cover the stake and fee, and then changes nothing', async () => {
    const adapter = createFakeMarketAdapter();
    const coins = (await adapter.portfolio()).data.coins;
    let uid = 0, last;
    for (let i = 0; i < 12 && !last; i += 1) {
      const result = await adapter.open({ ...rising, stake: 500 }, { uid: `uid-number-${++uid}` });
      if (!result.ok) last = result;
    }
    expect(last).toMatchObject({ ok: false, code: 'insufficient_funds', status: 409 });
    expect((await adapter.portfolio()).data.coins).toBeLessThanOrEqual(coins);
    expect((await adapter.portfolio()).data.coins).toBeGreaterThanOrEqual(0);
  });
});

describe('closing a position', () => {
  it('pays what the position says it would pay and moves it to recently closed', async () => {
    const adapter = createFakeMarketAdapter();
    const before = (await adapter.portfolio()).data;
    const position = before.positions.find(item => item.canClose);
    const result = await adapter.close({ positionId: position.id }, { uid: 'close-uid-1' });
    hasKeys(result.data, ['positionId', 'closedAs', 'closePrice', 'value', 'fee', 'coinsChange', 'coins', 'closedAt'], 'closed');
    expect(result.data).toMatchObject({ positionId: position.id, closedAs: 'closed', value: position.value, fee: position.closeFee, coinsChange: position.wouldReceive });
    expect(result.data.coins).toBe(before.coins + position.wouldReceive);
    const after = (await adapter.portfolio()).data;
    expectPortfolioShape(after);
    expect(after.positions.some(item => item.id === position.id)).toBe(false);
    expect(after.recentlyClosed[0]).toMatchObject({ id: position.id, closedAs: 'closed', coinsChange: position.wouldReceive });
    expect(after.openCount).toBe(before.openCount - 1);
  });

  it('answers a repeated uid with already_applied, a second close with position_closed, and an unknown id with no_such_position', async () => {
    const adapter = createFakeMarketAdapter();
    const id = (await adapter.portfolio()).data.positions.find(item => item.canClose).id;
    await adapter.close({ positionId: id }, { uid: 'close-uid-1' });
    expect(await adapter.close({ positionId: id }, { uid: 'close-uid-1' })).toMatchObject({ code: 'already_applied' });
    expect(await adapter.close({ positionId: id }, { uid: 'close-uid-2' })).toMatchObject({ code: 'position_closed' });
    expect(await adapter.close({ positionId: 'nobody' }, { uid: 'close-uid-3' })).toMatchObject({ code: 'no_such_position', status: 404 });
  });

  it('refuses to close a position of a company whose market is closed', async () => {
    const adapter = createFakeMarketAdapter();
    const waiting = (await adapter.portfolio()).data.positions.find(item => !item.canClose);
    expect(waiting).toBeDefined();
    expect(await adapter.close({ positionId: waiting.id }, { uid: 'close-uid-1' })).toMatchObject({ ok: false, code: 'market_closed' });
  });
});

describe('rehearsing refusals', () => {
  it('answers the next trade with any chosen refusal, once', async () => {
    for (const [code, entry] of Object.entries(REFUSALS)) {
      const adapter = createFakeMarketAdapter();
      adapter.dev.failNext(code);
      const failed = await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 }, { uid: 'u-1234567' });
      expect(failed, code).toMatchObject({ ok: false, code, status: entry.status, message: entry.message });
      if (entry.retryAfterSeconds) expect(failed.retryAfterSeconds).toBe(entry.retryAfterSeconds);
      expect((await adapter.open({ companyId: 'harbor-trust', side: 'rising', stake: 100 }, { uid: 'u-7654321' })).ok, `${code} once`).toBe(true);
    }
  });

  it('can refuse a close, a board and a portfolio too', async () => {
    const adapter = createFakeMarketAdapter();
    adapter.dev.failNext('network_error', 'board');
    adapter.dev.failNext('database_error', 'portfolio');
    adapter.dev.failNext('prices_stale', 'close');
    expect(await adapter.board()).toMatchObject({ ok: false, code: 'network_error', status: 0 });
    expect((await adapter.board()).ok).toBe(true);
    expect(await adapter.portfolio()).toMatchObject({ ok: false, code: 'database_error' });
    expect(await adapter.close({ positionId: 'any' }, { uid: 'u-1234567' })).toMatchObject({ ok: false, code: 'prices_stale' });
  });

  it('does not count a rehearsed refusal as a used uid', async () => {
    const adapter = createFakeMarketAdapter();
    adapter.dev.failNext('outcome_unknown');
    const intent = { companyId: 'harbor-trust', side: 'rising', stake: 100 };
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject({ code: 'outcome_unknown' });
    expect((await adapter.open(intent, { uid: 'u-1234567' })).ok).toBe(true);
  });

  it('can pretend the trade went through while the answer was lost, so "Send again" meets already_applied', async () => {
    const adapter = createFakeMarketAdapter();
    const before = (await adapter.portfolio()).data;
    const intent = { companyId: 'harbor-trust', side: 'rising', stake: 100 };
    adapter.dev.failNext('outcome_unknown', 'trade', { applied: true });
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject({ ok: false, code: 'outcome_unknown' });
    expect((await adapter.portfolio()).data.openCount).toBe(before.openCount + 1);
    expect(await adapter.open(intent, { uid: 'u-1234567' })).toMatchObject({ ok: false, code: 'already_applied' });
    expect((await adapter.portfolio()).data.openCount).toBe(before.openCount + 1);
  });

  it('can switch scenario and reset', async () => {
    const adapter = createFakeMarketAdapter();
    adapter.dev.scenario('demo');
    expect((await adapter.board()).data.demo).toBe(true);
    adapter.dev.reset();
    expect((await adapter.board()).data.demo).toBe(false);
  });
});
