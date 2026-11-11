// Island codes and visits as plain rules (BUILD-PLAN 3.3 and 3.6). No DOM, no network.
//   islandCode('isle-k7q2m') -> 'K7Q2M'      displayIslandCode('K7Q2M') -> 'ISLE-K7Q2M'
//   islandRoom('ISLE-K7Q2M') -> 'isle_k7q2m' (the presence place; the room topic is live:place:isle_k7q2m:1)
// A visit link is ?visit=ISLE-K7Q2M. The code is kept in sessionStorage only, so it ends with the tab.
export const ISLAND_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // pragma: allowlist secret
export const ISLAND_PREFIX = 'ISLE';
export const VISIT_KEY = 'plot_twist_visit_v1';
export const GAME_URL = 'https://the-great-plot-twist.vercel.app/';
const FIVE = new RegExp(`^[${ISLAND_ALPHABET}]{5}$`);

// The 5 symbols of an island code, or null. With requirePrefix the text must start with ISLE (the
// Join field: a bare 5-symbol code there is a class code). Spaces and dashes are ignored, any case.
export function islandCode(value, {requirePrefix = false} = {}) {
  if (typeof value !== 'string' || value.length > 32) return null;
  let code = value.replace(/[\s-]/g, '').toUpperCase();
  const prefixed = code.length === ISLAND_PREFIX.length + 5 && code.startsWith(ISLAND_PREFIX);
  if (prefixed) code = code.slice(ISLAND_PREFIX.length);
  else if (requirePrefix) return null;
  return FIVE.test(code) ? code : null;
}
export const displayIslandCode = value => (islandCode(value) ? `${ISLAND_PREFIX}-${islandCode(value)}` : '');
export const islandRoom = value => (islandCode(value) ? `isle_${islandCode(value).toLowerCase()}` : null);
export const visitUrl = (value, base = GAME_URL) => (islandCode(value) ? `${base}?visit=${displayIslandCode(value)}` : '');

const safeSession = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };
// Remember ?visit=ISLE-K7Q2M from the address. Anything that is not an island code is ignored.
export function rememberVisit(search = globalThis.location?.search ?? '', storage = safeSession()) {
  try {
    const code = islandCode(new URLSearchParams(search).get('visit') ?? '');
    if (!code) return null;
    storage?.setItem(VISIT_KEY, code);
    return code;
  } catch { return null; }
}
export function storeVisit(value, storage = safeSession()) {
  const code = islandCode(value);
  try { if (code) storage?.setItem(VISIT_KEY, code); } catch { return null; }
  return code;
}
export function readVisit(storage = safeSession()) {
  try { return islandCode(storage?.getItem(VISIT_KEY) ?? ''); } catch { return null; }
}
export function forgetVisit(storage = safeSession()) {
  try { storage?.removeItem(VISIT_KEY); return true; } catch { return false; }
}
