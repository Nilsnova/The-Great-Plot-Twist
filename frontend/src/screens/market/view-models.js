// View models: turn server answers into the exact words and numbers the panel shows. No DOM, no rules.
// Every coin, fee and zero point comes from the answer; the only thing done here is rounding for display.
// Used by: board-view.js, open-form.js, positions-view.js and panel.js.
import { coinsText, coinsLabel, signedCoinsText, priceText, zeroPointText, momentText } from './format.js';
import { statusWords, profitWords, sideWords, demoWords, DELISTED_WORDS } from './words.js';

export const SOON_WORDS = 'Trading opens soon.';
const SIMULATION_FALLBACK = 'Simulation with play money. Real names and real prices, no real money and no prizes.';
const listOf = value => (Array.isArray(value) ? value.filter(item => item !== null && typeof item === 'object') : []);
// How to show a price: the first source that knows it. A position knows its own (the server sends them), else the board's company does.
const styleOf = (...sources) => ({
  priceDecimals: sources.find(item => Number.isInteger(item?.priceDecimals))?.priceDecimals,
  currency: sources.find(item => typeof item?.currency === 'string')?.currency,
});

function blockedWords(company, tradingEnabled, statusText) {
  if (company.delisted) return DELISTED_WORDS;
  if (!tradingEnabled) return SOON_WORDS;
  if (company.status === 'open') return 'Not open for new positions right now.';
  return statusText;
}

function boardRow(company, tradingEnabled, context) {
  const statusText = statusWords(company, context);
  return {
    id: company.id, heading: company.name, ticker: company.ticker, kind: company.kind, status: company.status, tagline: company.tagline,
    followsText: `Follows ${company.follows}`, marketName: company.marketName,
    priceLabel: company.status === 'open' ? 'Price' : 'Last price',
    priceText: company.price == null ? 'Not available' : priceText(company.price, styleOf(company)),
    priceAtText: company.priceAt ? momentText(company.priceAt, context) : '',
    statusText, canOpen: Boolean(company.canOpen), delisted: Boolean(company.delisted),
    blockedText: company.canOpen ? null : blockedWords(company, tradingEnabled, statusText),
    zeroPrices: company.zeroPrices ?? null, ...styleOf(company),
  };
}

export function boardRows(board, options = {}) {
  const context = { ...options, now: board?.generatedAt };
  return listOf(board?.companies).map(company => boardRow(company, board.tradingEnabled !== false, context));
}

const numberOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const SIDES = ['rising', 'falling'];

// What the open form shows for the chosen side and stake. `choice` is an entry of rules.stakeChoices, or its stake.
export function openPreview(row, side, choice, rules) {
  const picked = typeof choice === 'number' ? listOf(rules?.stakeChoices).find(item => item.stake === choice) : choice;
  const hasChoice = Boolean(picked) && Number.isSafeInteger(picked.total);
  const hasSide = SIDES.includes(side);
  const zero = hasSide ? row?.zeroPrices?.[side] : null;
  const times = numberOr(rules?.leverage, 10), move = numberOr(rules?.zeroPointMovePercent, 10);
  let confirmLabel = 'Choose a side and a stake';
  if (hasSide && !hasChoice) confirmLabel = 'Choose a stake';
  else if (!hasSide && hasChoice) confirmLabel = 'Choose a side';
  else if (hasSide && hasChoice) confirmLabel = `Open ${side} position for ${coinsLabel(picked.total)}`;
  return {
    ready: hasSide && hasChoice && Number.isFinite(zero),
    side: hasSide ? side : null, stake: hasChoice ? picked.stake : null, fee: hasChoice ? picked.fee : null, total: hasChoice ? picked.total : null,
    noteText: `${times}x: every 1 % the price moves changes your position by ${times} % of your stake. `
      + `If the price reaches the zero point (${move} % against you), the position closes by itself at zero.`,
    zeroText: Number.isFinite(zero) ? `Zero point: ${zeroPointText(zero, side, row)} (estimate; set by the price at the moment you open)` : null,
    lossText: hasChoice ? `You can lose at most ${coinsLabel(picked.total)}` : null,
    confirmLabel,
  };
}

function openRow(position, company, context) {
  const style = styleOf(position, company), canClose = Boolean(position.canClose);
  const profit = profitWords(position.profit, position.profitPercent);
  const priceAt = position.priceAt ? momentText(position.priceAt, context) : '';
  const status = { ...company, status: position.companyStatus, reason: position.companyReason, opensAt: position.opensAt, priceAt: position.priceAt, mode: position.mode };
  return {
    id: position.id, heading: position.name, side: position.side, sideText: sideWords(position.side),
    stakeText: coinsLabel(position.stake), entryText: priceText(position.entryPrice, style),
    zeroText: zeroPointText(position.zeroPrice, position.side, style),
    priceLabel: position.companyStatus === 'open' ? 'Price now' : 'Last price', priceText: priceText(position.price, style), priceAtText: priceAt,
    valueText: coinsLabel(position.value), profitText: profit.text, direction: profit.direction, canClose,
    receiveText: canClose ? `If you close now: you receive ${coinsLabel(position.wouldReceive)}` : null,
    confirmText: canClose ? `Close and receive about ${coinsLabel(position.wouldReceive)}?` : null,
    closeLabel: `Close your ${position.side} position in ${position.name}`,
    blockedText: canClose ? null : statusWords(status, context),
  };
}

function closedRow(position, company) {
  const style = styleOf(position, company), zeroed = position.closedAs === 'zeroed';
  const reached = `the price reached ${priceText(position.closePrice, style)} (your zero point was ${zeroPointText(position.zeroPrice, position.side, style)})`;
  return {
    id: position.id, heading: position.name, sideText: sideWords(position.side), zeroed,
    line: zeroed ? `Closed at zero: ${reached}` : `Closed by you: ${signedCoinsText(position.coinsChange)} coins`,
    resultText: `Result after both fees: ${signedCoinsText(position.result)} coins`,
  };
}

const ofTotal = (label, amount, limit, unit = '') => (Number.isSafeInteger(amount) && Number.isSafeInteger(limit)
  ? `${label}: ${coinsText(amount)} of ${coinsText(limit)}${unit}` : '');

export function positionRows(portfolio, board, options = {}) {
  const context = { ...options, now: portfolio?.generatedAt };
  const companies = new Map(listOf(board?.companies).map(company => [company.id, company]));
  const companyOf = position => companies.get(position.companyId);
  return {
    coinsText: Number.isSafeInteger(portfolio?.coins) ? coinsLabel(portfolio.coins) : 'unknown',
    stakedText: ofTotal('Staked today', portfolio?.stakedToday, portfolio?.dailyStakeCap, ' coins'),
    openCountText: ofTotal('Open positions', portfolio?.openCount, portfolio?.maxOpenPositions),
    open: listOf(portfolio?.positions).map(position => openRow(position, companyOf(position), context)),
    closed: listOf(portfolio?.recentlyClosed).map(position => closedRow(position, companyOf(position))),
    emptyOpenText: 'You have no open positions. Open one from the Prices tab.',
    emptyClosedText: 'Nothing closed yet.',
  };
}

// Only https links are shown as links; anything else stays plain text.
const safeLink = href => {
  try { return new URL(href).protocol === 'https:' ? href : null; } catch { return null; }
};

export const creditRows = board => listOf(board?.credits).map(credit => ({
  text: String(credit.text ?? ''), href: safeLink(credit.href),
  licenceText: credit.licenceText ?? null, licenceHref: safeLink(credit.licenceHref),
}));

export function boardNotes(board) {
  const simulation = typeof board?.simulationNote === 'string' ? board.simulationNote.trim() : '';
  return { demo: demoWords(board), soon: board?.tradingEnabled === false ? SOON_WORDS : null, simulation: simulation || SIMULATION_FALLBACK };
}
