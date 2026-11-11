// The islet view: its first shape, how a server answer becomes view data, and the notices the panel shows. Pure, no DOM.
import {formatCoins} from '../../lib/coins.js';

export const PLAY_MONEY_NOTE = 'Play money. No cash value. It cannot be bought or cashed out.';
export const MESSAGES = {
  notConnected: 'Your islet will be saved to your account once sign-in is connected.',
  signIn: 'Please sign in again.',
  network: 'No connection to the server. Check your internet and try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
  unknown: 'Something went wrong. Try again.',
  unreadable: 'We could not read the answer from the server. Please try again.',
  tooMany: 'Too many attempts. Try again in a moment.',
  featureOff: 'This feature is unavailable. You can keep exploring.',
  saveConflict: 'This save changed on another device. Choose which copy to keep.',
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
const BUSINESS_CODES = new Set(['insufficient_funds', 'not_enough_timber', 'plot_occupied', 'not_buildable_yet',
  'no_such_plot', 'no_such_building', 'wrong_plot', 'validation_error']);
const FAILURE_CODES = new Set([...BUSINESS_CODES, 'network_error', 'timeout', 'unauthorized', 'forbidden',
  'database_unavailable', 'islet_unavailable', 'server_error', 'unavailable', 'unreadable',
  'too_many_requests', 'feature_off', 'stale_save']);
// The published five-plot catalogue. Keep this pure view independent of world rendering.
const PLOT_TYPES = new Map([
  ['plot_1', 'cabin'], ['plot_2', 'workshop'], ['plot_3', 'windmill'], ['plot_4', 'greenhouse'],
  ['islet_signal_station', 'signal_station'],
]);

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';
const readCount = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);

export const makeNotice = (tone, code, message) => ({tone, code, message});
export const coinsText = amount => formatCoins(amount);

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
  if (PLOT_TYPES.get(raw.plot) !== raw.type) return null;
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
  if (!isRecord(data) || !Array.isArray(data.spots) || data.spots.length !== PLOT_TYPES.size
    || typeof data.signalStationBuilt !== 'boolean') return null;
  const spots = Array.from(data.spots, readSpot);
  const coins = readCount(data.coins);
  const timber = readCount(data.timber);
  const plots = new Set(spots.map(spot => spot?.plot));
  if (spots.includes(null) || coins === null || timber === null || plots.size !== spots.length) return null;
  const cabin = spots.find(spot => spot.plot === 'plot_1');
  const station = spots.find(spot => spot.plot === 'islet_signal_station');
  if (cabin.state !== 'built' || data.signalStationBuilt !== (station.state === 'built')) return null;
  return {
    coins, timber, spots, signalStationBuilt: data.signalStationBuilt,
    playMoneyNote: isText(data.playMoneyNote) ? data.playMoneyNote : PLAY_MONEY_NOTE,
  };
}

export const builtPlots = view => view.spots.filter(spot => spot.state === 'built').map(spot => spot.plot);

// An unreadable successful write may still have charged the server-owned cost: read back before deciding.
export function validBuildReceipt(receipt, spot) {
  return isRecord(receipt) && receipt.plot === spot.plot && receipt.type === spot.type
    && isText(receipt.name) && Number.isSafeInteger(receipt.level) && receipt.level > 0
    && ['coinsPaid', 'timberPaid', 'coins', 'timber'].every(key => readCount(receipt[key]) !== null);
}

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

// Only the published business refusals carry server prose. Transport failures have fixed public copy.
export function failureNotice(result) {
  const code = FAILURE_CODES.has(result.code) ? result.code : 'error';
  let message;
  if (result.status === 401 || result.status === 0) message = fallbackMessage(result.status);
  else if (result.status === 429) message = MESSAGES.tooMany;
  else if (result.status >= 500) message = MESSAGES.server;
  else if (code === 'unreadable') message = MESSAGES.unreadable;
  else if (code === 'feature_off') message = MESSAGES.featureOff;
  else if (code === 'stale_save') message = MESSAGES.saveConflict;
  else if (result.status >= 400 && result.status < 500 && BUSINESS_CODES.has(code) && isText(result.message)) message = result.message;
  else message = fallbackMessage(result.status);
  return makeNotice('error', code, message);
}
