// What the status line says after an action, and the one-time notice when a position closes at zero. No DOM.
// Used by: trades.js (messages after open and close) and session.js (the zero notice).
import { coinsLabel, priceText, zeroPointText } from './format.js';

export const ALREADY_DONE = 'This was already done. Look under Your positions.';
export const BLOCKED_WORDS = 'Check your last trade first: use Check again or Send again.';
export const CHECKED_WORDS = 'Updated your positions. If your trade is not listed, send it again, or forget it.';
export const FORGOTTEN_WORDS = 'Forgot that trade. It was not sent again. You can start a new one.';

const styleOf = company => ({ priceDecimals: company?.priceDecimals, currency: company?.currency });

export function openedWords(answer, company) {
  const style = styleOf(company);
  return `Opened your ${answer.side} position in ${company?.name ?? answer.companyId} at ${priceText(answer.entryPrice, style)}. `
    + `Zero point: ${zeroPointText(answer.zeroPrice, answer.side, style)}. `
    + `You paid ${coinsLabel(-answer.coinsChange)} and have ${coinsLabel(answer.coins)} left.`;
}

export function closedWords(answer, company) {
  const name = company?.name ?? 'your company';
  if (answer.closedAs === 'zeroed') {
    return `Your position in ${name} had already reached its zero point, so it closed at zero. No coins were paid out. You have ${coinsLabel(answer.coins)}.`;
  }
  const paid = answer.coinsChange > 0
    ? `You received ${coinsLabel(answer.coinsChange)} and now have ${coinsLabel(answer.coins)}.`
    : `No coins were paid out. You have ${coinsLabel(answer.coins)}.`;
  return `Closed your position in ${name} at ${priceText(answer.closePrice, styleOf(company))}. ${paid}`;
}

const listOf = value => (Array.isArray(value) ? value.filter(item => item !== null && typeof item === 'object') : []);

// One line for each position the panel knew as open that has since closed at zero. A position the
// player closed, or one the panel never saw open, says nothing.
export function zeroNotices(previous, current) {
  const stillOpen = new Set(listOf(current?.positions).map(position => position.id));
  const closed = listOf(current?.recentlyClosed);
  return listOf(previous?.positions)
    .filter(position => !stillOpen.has(position.id))
    .map(position => closed.find(row => row.id === position.id))
    .filter(row => row?.closedAs === 'zeroed')
    .map(row => `Your ${row.side} position in ${row.name} reached its zero point and closed at zero.`);
}
