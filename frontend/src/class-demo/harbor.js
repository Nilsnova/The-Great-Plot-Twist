// The class harbor and the projector panel as plain rules: who is in the class harbor, which presence
// place they announce, the "joined" toast, the projector's words, and where the demo's objects stand
// in Saltreach Harbor. No DOM here.
import {CLASS_HARBOR_PLACE} from '../net/live-rules.js';
import {JOIN_KEY} from '../front-door/logic.js';

export const HARBOR_PLACE = 'saltreach_harbor';
export const JOIN_URL = 'https://the-great-plot-twist.vercel.app/?join=harbor';
export const JOIN_CODE = 'HARBOR';
export const PATH_KEY = 'plot_twist_path_v1'; // 'full' after "Full mystery"; otherwise the demo path

// The lock by the lighthouse path, and the three lamp posts along it (x, z in Saltreach Harbor).
export const LOCK_SPOT = Object.freeze({id: 'keepers_lock', x: 6.2, z: 14.2, radius: 1.9});
export const LAMP_SPOTS = Object.freeze([
  Object.freeze({id: 'class_lamp_1', index: 0, x: -5, z: 16.4, radius: 1.6}),
  Object.freeze({id: 'class_lamp_2', index: 1, x: -2, z: 14.6, radius: 1.6}),
  Object.freeze({id: 'class_lamp_3', index: 2, x: 2.4, z: 14.6, radius: 1.6}),
]);

export function readInvite(storage) {
  try { return storage?.getItem(JOIN_KEY) === 'harbor'; } catch { return false; }
}
export function rememberInvite(storage) {
  try { storage?.setItem(JOIN_KEY, 'harbor'); return true; } catch { return false; }
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

// The projector's words. demo: {flagOn, open, openUntil} from GET /api/host/demo, or null when unknown.
export function projectorModel({demo = null, count = 1, host = false, rehearsal = false, pending = false, error = '', now = Date.now()} = {}) {
  const captains = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  let windowText = 'Demo window: unknown', open = false;
  if (demo?.flagOn === false) windowText = 'The demo flag is off on the server.';
  else if (demo?.open === true && demo.openUntil && Date.parse(demo.openUntil) > now) {
    open = true;
    windowText = `Demo open until ${clock(demo.openUntil)}`;
  } else if (demo) windowText = 'Demo closed: guests cannot join yet.';
  if (rehearsal && !demo) windowText = 'Rehearsal: the demo window is not checked.';
  return {url: JOIN_URL, code: JOIN_CODE, open,
    countText: `${captains} ${captains === 1 ? 'captain' : 'captains'} in the harbor`,
    windowText, error,
    canOpen: host === true && !pending && demo?.flagOn !== false,
    buttonLabel: pending ? 'Opening…' : open ? 'Keep open for 2 more hours' : 'Open demo for 2 hours',
    steps: ['Scan the code with your phone camera', `Or open the game and choose Join, code ${JOIN_CODE}`]};
}
export const openDemoBody = actionUid => ({hours: 2, actionUid});

function clock(iso) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Demo path or full mystery. The front door (Play, Join HARBOR) is the demo path unless the player chose
// "Full mystery" on this device; the Lighthouse prologue and a saved story are the full mystery.
export function readPath(storage) {
  try { return storage?.getItem(PATH_KEY) === 'full' ? 'full' : 'demo'; } catch { return 'demo'; }
}
export function writePath(storage, path) {
  try { storage?.setItem(PATH_KEY, path === 'full' ? 'full' : 'demo'); return true; } catch { return false; }
}
