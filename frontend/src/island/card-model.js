// What the island's small cards say, as pure functions (no DOM): the build card of a spot, the harbor
// bell, the invite card and the loot toast. The server decides; these only describe its last answer.
import {KINDS} from './spots.js';
import {displayIslandCode, visitUrl} from './codes.js';

// Coins always read "🪙 120" (BUILD-PLAN 3.2). Lane H's formatCoins in src/lib/coins.js replaces this.
export const coinText = n => `🪙 ${Number.isSafeInteger(n) ? n : '?'}`;

// spot: the server's {id, kind, built, cost} or null while the island is loading.
export function buildCardModel({spotId, kind, spot = null, coins = null, visitor = false, ownerName = '',
  busy = false, message = ''} = {}) {
  const info = KINDS[spot?.kind ?? kind] ?? {name: 'Build spot', purpose: '', cost: null};
  const cost = spot?.cost ?? info.cost;
  const model = {spotId, title: info.name, purpose: info.purpose, cost: coinText(cost),
    coins: visitor || coins === null ? '' : `You have ${coinText(coins)}`, button: 'Build', disabled: true,
    reason: '', message, built: spot?.built === true};
  if (visitor) model.reason = spot?.built ? `${ownerName || 'The owner'} built this ${info.name.toLowerCase()}.`
    : `Only ${ownerName || 'the owner'} can build here.`;
  else if (!spot) model.reason = message ? '' : 'Your island is still loading.';
  else if (spot.built) model.reason = `Your ${info.name.toLowerCase()} stands here.`;
  else if (busy) { model.button = 'Building…'; }
  else if (coins === null) model.reason = 'Your coins are still loading.';
  else if (coins < cost) model.reason = `You need ${coinText(cost - coins)} more.`;
  else model.disabled = false;
  return model;
}

// wave: the running wave there or null. countdown: whole seconds left before it starts, or null.
export function bellModel({wave = null, joined = false, countdown = null, busy = false, visitor = false,
  ownerName = '', waveBest = 0, message = ''} = {}) {
  const next = Math.max(1, (Number.isSafeInteger(waveBest) ? waveBest : 0) + 1);
  const model = {title: 'Harbor bell', line: '', button: 'Ring the bell', disabled: busy, message, action: 'ring'};
  if (wave && !joined) {
    model.line = `Wave ${wave.wave} is under way${visitor ? ` on ${ownerName ? `${ownerName}'s island` : 'this island'}` : ''}.`;
    model.button = busy ? 'Joining…' : 'Join the defense'; model.action = 'join';
  } else if (wave) {
    model.line = countdown > 0 ? `Wave ${wave.wave} arrives in ${countdown} s.` : `Wave ${wave.wave} is under way.`;
    model.button = 'Under way'; model.disabled = true; model.action = 'none';
  } else {
    model.line = `Ring it and wave ${next} sails in after a 10 second countdown.`;
    if (busy) model.button = 'Ringing…';
  }
  return model;
}

export function inviteModel(code, base) {
  const shown = displayIslandCode(code);
  return {title: 'Invite a friend', code: shown || 'Loading…', url: shown ? visitUrl(code, base) : '',
    line: shown ? 'Your friend scans the code, or chooses Join and types it, and lands on your island.'
      : 'Your island code is still loading.'};
}

export const lootText = ({loot, coins}) => `${coinText(loot).replace('🪙 ', '🪙 +')} loot · you have ${coinText(coins)}`;
export const countdownText = (seconds, wave) => (seconds > 0 ? `Pirates in ${seconds} s! Wave ${wave}` : `Wave ${wave}: the pirates are here!`);
// Whole seconds until startsAt. A clock far off the server's falls back to the full countdown.
export function secondsUntil(startsAt, now = Date.now(), {fresh = false, countdown = 10} = {}) {
  const left = (Date.parse(startsAt) - now) / 1000;
  if (!Number.isFinite(left)) return fresh ? countdown : 0;
  if (fresh && (left < 0 || left > countdown + 2)) return countdown;
  return Math.max(0, Math.ceil(left));
}
