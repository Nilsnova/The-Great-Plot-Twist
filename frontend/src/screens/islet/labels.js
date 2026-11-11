// The texts of the islet panel, worked out from the view. Display only: the server decides what can be built.
import {formatCoins} from '../../lib/coins.js';

// The same words as coinsText in view.js, copied on purpose: if this file imported view.js, the
// bundler would put view.js in a chunk shared with the game, and the cold title would list one more
// file (scripts/check-loading.js keeps the title within 21,080 bytes).
const coinsText = amount => formatCoins(amount);

const BADGES = {built: 'Standing', empty: 'Empty plot', locked: 'Coming later'};
const BUSY_LABEL = 'Building...';

export function costText(cost) {
  const coins = coinsText(cost.coins);
  return cost.timber > 0 ? `${coins} and ${cost.timber} timber` : coins;
}

export function walletLine(view) {
  if (!Number.isSafeInteger(view.coins) || !Number.isSafeInteger(view.timber)) return null;
  return `You have ${coinsText(view.coins)} and ${view.timber} timber.`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
}

// "120 more coins", or just "more coins" when the amount held is not known yet.
function shortfall(need, cost, view) {
  if (!Number.isSafeInteger(view[need])) return `more ${need}`;
  const amount = Math.max(0, cost[need] - view[need]);
  return need === 'coins' ? `${formatCoins(amount)} more` : `${amount} more ${need}`;
}

function missingText(spot, view) {
  if (spot.state !== 'empty' || spot.missing.length === 0 || !spot.cost) return null;
  return `You need ${spot.missing.map(need => shortfall(need, spot.cost, view)).join(' and ')}`;
}

function costLabel(spot) {
  if (!spot.cost || spot.state === 'built') return null;
  const prefix = spot.state === 'locked' ? 'Price when it opens' : 'Cost';
  return `${prefix}: ${costText(spot.cost)}`;
}

// A locked plot shows why. A built plot shows its level and the day it was built.
function noteText(spot) {
  if (spot.state === 'locked') return spot.lockedNote;
  if (spot.state !== 'built') return null;
  const parts = [];
  if (spot.level !== null) parts.push(`Level ${spot.level}`);
  const date = spot.builtAt ? formatDate(spot.builtAt) : null;
  if (date) parts.push(`built ${date}`);
  const text = parts.join(', ');
  return text === '' ? null : text[0].toUpperCase() + text.slice(1);
}

// Every button names its building, so a list of the buttons on the page never holds two with the same name.
function buttonLabel(spot, view) {
  if (spot.plot === view.busyPlot) return BUSY_LABEL;
  const name = spot.name.toLowerCase();
  if (spot.retry) return `Try again: build the ${name} (it will not charge twice)`;
  return spot.cost ? `Build the ${name} for ${costText(spot.cost)}` : `Build the ${name}`;
}

// The button is on only when the server said canBuild (or a safe retry is pending) and nothing is running.
function buttonFor(spot, view) {
  if (spot.state === 'built') return null;
  const allowed = spot.canBuild || spot.retry;
  return {label: buttonLabel(spot, view), disabled: view.busyPlot !== null || !allowed};
}

export function cardLabels(spot, view) {
  return {
    badge: BADGES[spot.state], tone: spot.state, cost: costLabel(spot), missing: missingText(spot, view),
    note: noteText(spot), button: buttonFor(spot, view),
  };
}
