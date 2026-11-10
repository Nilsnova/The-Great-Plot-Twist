// The class harbor and the projector panel as plain rules: who is in the class harbor, which presence
// place they announce, the "joined" toast, the projector's words, and where the demo's objects stand
// in Saltreach Harbor. No DOM here.
import {CLASS_HARBOR_PLACE} from '../net/live-rules.js';
import {JOIN_KEY, JOINED_WITHOUT_CODE, classCode, displayCode, joinedHarbor} from '../front-door/logic.js';

export const HARBOR_PLACE = 'saltreach_harbor';
export const GAME_URL = 'https://the-great-plot-twist.vercel.app/';
// The projector QR carries the current class code: https://the-great-plot-twist.vercel.app/?join=K7QXM.
export const joinUrl = code => (classCode(code) ? `${GAME_URL}?join=${classCode(code)}` : '');
// Rehearsal (?demo=1) shows this made-up code; nothing is sent to the server with it.
export const REHEARSAL_CODE = 'TESTS';

// The lock by the lighthouse path, and the three lamp posts along it (x, z in Saltreach Harbor).
export const LOCK_SPOT = Object.freeze({id: 'keepers_lock', x: 6.2, z: 14.2, radius: 1.9});
export const LAMP_SPOTS = Object.freeze([
  Object.freeze({id: 'class_lamp_1', index: 0, x: -5, z: 16.4, radius: 1.6}),
  Object.freeze({id: 'class_lamp_2', index: 1, x: -2, z: 14.6, radius: 1.6}),
  Object.freeze({id: 'class_lamp_3', index: 2, x: 2.4, z: 14.6, radius: 1.6}),
]);

// In the class harbor: a class code from the QR or the Join page, or the in-game button.
export function readInvite(storage) { return joinedHarbor(storage); }
// The in-game "Join the class harbor" keeps a remembered class code and otherwise marks the tab.
export function rememberInvite(storage) {
  try { if (!readInvite(storage)) storage?.setItem(JOIN_KEY, JOINED_WITHOUT_CODE); return true; } catch { return false; }
}

// While in the class harbor, a player in Saltreach Harbor announces the class place instead.
export const presencePlace = (place, joined) => (joined === true && place === HARBOR_PLACE ? CLASS_HARBOR_PLACE : place);

// New captains since the last presence: [{id, name}] of shown ones not in `known`.
export function arrivals(known, shown) {
  return (shown ?? []).filter(peer => peer?.id && !known.has(peer.id));
}
export function joinedText(names) {
  const list = names.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
  if (!list.length) return '';
  if (list.length === 1) return `${list[0]} joined`;
  if (list.length === 2) return `${list[0]} and ${list[1]} joined`;
  return `${list[0]} and ${list.length - 1} others joined`;
}

// The nearest demo spot within its radius, or null. spots: [{id, x, z, radius}], player: {x, z}.
export function nearestSpot(spots, player) {
  let best = null, bestDistance = Infinity;
  for (const spot of spots) {
    const distance = Math.hypot(spot.x - player.x, spot.z - player.z);
    if (distance <= spot.radius && distance < bestDistance) { best = spot; bestDistance = distance; }
  }
  return best;
}

// The projector's words. demo: {flagOn, code, codeSetAt, guests} from GET /api/host/demo, or null
// when unknown. In a rehearsal without a host the made-up REHEARSAL_CODE is shown.
export function projectorModel({demo = null, count = 1, host = false, rehearsal = false, pending = false, error = ''} = {}) {
  const captains = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const code = classCode(demo?.code ?? '') ?? (rehearsal && !demo ? REHEARSAL_CODE : null);
  let statusText = 'Class code: unknown';
  if (demo?.flagOn === false) statusText = 'The demo flag is off on the server: no guest can join.';
  else if (rehearsal && !demo) statusText = 'Rehearsal: a practice code, not checked by the server.';
  else if (demo && !code) statusText = 'No class code yet. Make one to let guests in.';
  else if (demo) {
    const guests = Number.isInteger(demo.guests) && demo.guests >= 0 ? demo.guests : null;
    statusText = guests === null ? 'Guests join with this code.' : `${guests} ${guests === 1 ? 'guest' : 'guests'} joined with a code`;
  }
  return {url: joinUrl(code), code: displayCode(code) || 'No code yet', hasCode: !!code,
    countText: `${captains} ${captains === 1 ? 'captain' : 'captains'} in the harbor`,
    statusText, error,
    canRenew: host === true && !pending && !!demo,
    buttonLabel: pending ? 'Making a new code…' : 'New class code',
    confirmText: 'Make a new class code? The old code stops working for new joins at once. Captains already here stay.',
    steps: code ? ['Scan the code with your phone camera', `Or open the game, choose Join and type ${displayCode(code)}`]
      : ['The presenter makes a class code first']};
}
export const newCodeBody = actionUid => ({actionUid});

