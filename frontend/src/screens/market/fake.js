// A local stand-in for the Exchange server: the dev build with ?market=local, and the tests. Memory only.
// It answers in the shapes of spec section 8 from canned data (fixtures.js) and has no game rules: it never works
// out a fee, a value, a zero point or a profit. It adds and subtracts the numbers it was given, nothing more.
// It has the same surface as http.js, so a screen cannot tell them apart. Used by: index.js.
import { REFUSALS, boardFixture, portfolioFixture } from './fixtures.js';

const REFUSE_BY_STATUS = { closed: 'market_closed', stale: 'prices_stale', unavailable: 'company_unavailable' };
const KEEP_RECENT = 10;

export function createFakeMarketAdapter({ scenario = 'mixed', signedIn: startSignedIn = true } = {}) {
  let board, portfolio, signedIn, queue, uids, count;

  function load(name) {
    board = boardFixture(name); portfolio = portfolioFixture(name);
    signedIn = startSignedIn; queue = []; uids = new Set(); count = 0;
  }
  load(scenario);

  const refuse = code => {
    const { message, status, retryAfterSeconds = null } = REFUSALS[code];
    return { ok: false, code, message, status, retryAfterSeconds };
  };
  const good = data => ({ ok: true, data: structuredClone(data) });
  const isTrade = method => method === 'open' || method === 'close';
  function rehearsal(method) {
    const index = queue.findIndex(item => item.method === method || (item.method === 'trade' && isTrade(method)));
    return index === -1 ? null : queue.splice(index, 1)[0];
  }

  function openNow(intent, uid) {
    if (!signedIn) return refuse('unauthorized');
    if (uids.has(uid)) return refuse('already_applied');
    if (board.tradingEnabled === false) return refuse('feature_off');
    const company = board.companies.find(item => item.id === intent.companyId);
    if (!company) return refuse('no_such_company');
    if (company.delisted) return refuse('company_delisted');
    if (!company.canOpen) return refuse(REFUSE_BY_STATUS[company.status] ?? 'company_unavailable');
    const choice = board.rules.stakeChoices.find(item => item.stake === intent.stake);
    if (!choice || !company.zeroPrices?.[intent.side]) return refuse('validation_error');
    if (portfolio.coins < choice.total) return refuse('insufficient_funds');
    uids.add(uid);
    portfolio.coins -= choice.total; portfolio.stakedToday += choice.stake; portfolio.openCount += 1;
    // A position that was just opened is worth its stake, and closing it costs the same fee again.
    const position = {
      id: `fake-position-${++count}`, companyId: company.id, name: company.name, ticker: company.ticker, follows: company.follows,
      currency: company.currency, priceDecimals: company.priceDecimals, side: intent.side,
      mode: board.demo ? 'replay' : 'live', stake: choice.stake, openFee: choice.fee, entryPrice: company.price, zeroPrice: company.zeroPrices[intent.side],
      openedAt: board.generatedAt, price: company.price, priceAt: company.priceAt,
      companyStatus: company.status, companyReason: company.reason, opensAt: company.opensAt,
      value: choice.stake, profit: 0, profitPercent: 0, closeFee: choice.fee, wouldReceive: choice.stake - choice.fee,
      result: -choice.fee - choice.fee, canClose: company.canClose,
    };
    portfolio.positions.unshift(position);
    return good({ positionId: position.id, companyId: company.id, side: intent.side, stake: choice.stake, fee: choice.fee, coinsChange: -choice.total,
      coins: portfolio.coins, entryPrice: position.entryPrice, zeroPrice: position.zeroPrice, feePercent: board.rules.feePercent, openedAt: board.generatedAt });
  }

  function closeNow(intent, uid) {
    if (!signedIn) return refuse('unauthorized');
    if (uids.has(uid)) return refuse('already_applied');
    const position = portfolio.positions.find(item => item.id === intent.positionId);
    if (!position) return refuse(portfolio.recentlyClosed.some(item => item.id === intent.positionId) ? 'position_closed' : 'no_such_position');
    if (!position.canClose) return refuse(REFUSE_BY_STATUS[position.companyStatus] ?? 'company_unavailable');
    uids.add(uid);
    portfolio.positions = portfolio.positions.filter(item => item !== position);
    portfolio.openCount -= 1; portfolio.coins += position.wouldReceive;
    const { id, companyId, name, currency, priceDecimals, side, mode, stake, openFee, entryPrice, zeroPrice, openedAt, value, closeFee, result } = position;
    portfolio.recentlyClosed.unshift({ id, companyId, name, currency, priceDecimals, side, mode, stake, openFee, entryPrice, zeroPrice, openedAt, closedAs: 'closed',
      closePrice: position.price, closedAt: portfolio.generatedAt, value, closeFee, coinsChange: position.wouldReceive, result });
    portfolio.recentlyClosed.length = Math.min(portfolio.recentlyClosed.length, KEEP_RECENT);
    return good({ positionId: id, closedAs: 'closed', closePrice: position.price, value, fee: closeFee,
      coinsChange: position.wouldReceive, coins: portfolio.coins, closedAt: portfolio.generatedAt });
  }

  // A rehearsed refusal answers instead of the real work, unless it says the trade went through and only the answer was lost.
  function trade(method, work) {
    return async (intent, { uid } = {}) => {
      const planned = rehearsal(method);
      if (planned && !planned.applied) return refuse(planned.code);
      const result = work(intent ?? {}, uid);
      return planned && result.ok ? refuse(planned.code) : result;
    };
  }
  function read(method, work) {
    return async () => {
      const planned = rehearsal(method);
      return planned ? refuse(planned.code) : work();
    };
  }

  return {
    board: read('board', () => good(board)),
    portfolio: read('portfolio', () => (signedIn ? good(portfolio) : refuse('unauthorized'))),
    open: trade('open', openNow),
    close: trade('close', closeNow),
    // For rehearsals in the dev build (window.__market.adapter.dev) and for tests.
    dev: {
      failNext(code, method = 'trade', { applied = false } = {}) { queue.push({ code, method, applied }); },
      scenario(name) { load(name); },
      reset() { load(scenario); },
      signedIn(flag) { signedIn = Boolean(flag); },
    },
  };
}
