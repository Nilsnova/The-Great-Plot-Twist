// The islet view: its first shape, how a server answer becomes view data, and the notices the panel shows. Pure, no DOM.
import {formatCoins} from '../../ui/kit/logic.js';

export const PLAY_MONEY_NOTE = 'Play money. No cash value. It cannot be bought or cashed out.';
export const MESSAGES = {
  notConnected: 'Your islet will be saved to your account once sign-in is connected.',
  signIn: 'Please sign in again.',
  network: 'No connection to the server. Check your internet and try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
  unknown: 'Something went wrong. Try again.',
  unreadable: 'We could not read the answer from the server. Please try again.',
  busy: 'Another build is still running.',
  noSuchPlot: 'That plot is not on your islet.',
  checking: 'We could not confirm the build. Checking your islet now.',
  confirmed: 'Built.',
  alreadyApplied: 'Built. It was already counted, so you were not charged twice.',
  notDone: 'The build did not go through. Press Try again. You will not be charged twice.',
  unconfirmed: 'We could not confirm the build. Check your connection, then press Try again. You will not be charged twice.',
  reloadFailed: 'We could not reload your islet. Press Refresh.',
};

const STATES = ['built', 'empty', 'locked'];
const NEEDS = ['coins', 'timber'];
const MAX_SPOTS = 10;

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';
const readCount = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);

export const makeNotice = (tone, code, message) => ({tone, code, message});
export const coinsText = amount => `${formatCoins(amount)} ${amount === 1 ? 'coin' : 'coins'}`;

// The view before the first answer. Unavailable mode never asks the server, so it is final.
export function createEmptyView(mode) {
  const unavailable = mode === 'unavailable';
  return {
    schema: 1, mode, status: unavailable ? 'unavailable' : 'loading', busyPlot: null, coins: null, timber: null,
    playMoneyNote: PLAY_MONEY_NOTE, signalStationBuilt: false, spots: [],
    notice: unavailable ? makeNotice('info', 'not_connected', MESSAGES.notConnected) : null, revision: 0,
  };
}

// A cost is null when absent and undefined when broken.
function readCost(raw) {
  if (raw === null || raw === undefined) return null;
  const coins = readCount(raw.coins);
  const timber = readCount(raw.timber);
  return coins === null || timber === null ? undefined : {coins, timber};
}

function readSpot(raw) {
  if (!isRecord(raw) || !STATES.includes(raw.state)) return null;
  if (![raw.plot, raw.plotName, raw.type, raw.name, raw.about].every(isText)) return null;
  const cost = readCost(raw.cost);
  if (cost === undefined) return null;
  return {
    plot: raw.plot, plotName: raw.plotName, type: raw.type, name: raw.name, about: raw.about, state: raw.state,
    level: readCount(raw.level), builtAt: isText(raw.builtAt) ? raw.builtAt : null, cost,
    missing: Array.isArray(raw.missing) ? raw.missing.filter(need => NEEDS.includes(need)) : [],
    canBuild: raw.canBuild === true, lockedNote: isText(raw.lockedNote) ? raw.lockedNote : null, retry: false,
  };
}

// Copies the fields of GET /api/islet that the panel uses. Null means the answer cannot be trusted.
export function readIsletAnswer(data) {
  if (!isRecord(data) || !Array.isArray(data.spots) || data.spots.length > MAX_SPOTS) return null;
  const spots = data.spots.map(readSpot);
  const coins = readCount(data.coins);
  const timber = readCount(data.timber);
  const plots = new Set(spots.map(spot => spot?.plot));
  if (spots.includes(null) || coins === null || timber === null || plots.size !== spots.length) return null;
  return {
    coins, timber, spots, signalStationBuilt: data.signalStationBuilt === true,
    playMoneyNote: isText(data.playMoneyNote) ? data.playMoneyNote : PLAY_MONEY_NOTE,
  };
}

export const builtPlots = view => view.spots.filter(spot => spot.state === 'built').map(spot => spot.plot);

export const buildingNotice = spot => makeNotice('info', 'building', `Building the ${spot.name.toLowerCase()}...`);

// The receipt of a good build. The numbers are shown only when the receipt has them.
export function builtNotice(spot, receipt, reloaded = true) {
  const hasNumbers = Number.isSafeInteger(receipt?.coins) && Number.isSafeInteger(receipt?.timber);
  const left = hasNumbers ? ` You have ${coinsText(receipt.coins)} and ${receipt.timber} timber left.` : '';
  const reload = reloaded ? '' : ` ${MESSAGES.reloadFailed}`;
  return makeNotice('success', 'built', `${spot.name} built.${left}${reload}`);
}

// The note for a retry that found its build already counted. Nothing was charged twice.
export function alreadyAppliedNotice(reloaded = true) {
  const reload = reloaded ? '' : ` ${MESSAGES.reloadFailed}`;
  return makeNotice('success', 'already_applied', `${MESSAGES.alreadyApplied}${reload}`);
}

function fallbackMessage(status) {
  if (status === 401) return MESSAGES.signIn;
  if (status === 0) return MESSAGES.network;
  if (status >= 500) return MESSAGES.server;
  return MESSAGES.unknown;
}

// A failed answer becomes an error notice. The message of the server wins over our own words.
export function failureNotice(result) {
  const message = isText(result.message) ? result.message : fallbackMessage(result.status);
  return makeNotice('error', isText(result.code) ? result.code : 'error', message);
}
