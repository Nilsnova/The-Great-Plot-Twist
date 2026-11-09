// Front-door rules without DOM: what Play starts, where the demo begins and the card's words.
export const FRONT_DOOR_KEY = 'plot_twist_front_door_v1';
export const JOIN_KEY = 'plot_twist_join_v1';
// The demo starts outside, in Saltreach Harbor, through the game's existing world continuation.
// demo: true starts the class demo path (quest strip, class harbor, lock, lamps; src/class-demo/).
export const HARBOR_START = Object.freeze({kind: 'world', place: 'saltreach_harbor', demo: true});

// A saved story (local intro or a cloud continuation) means Play continues; otherwise the front door.
export function playChoice({localIntro = false, account = {}} = {}) {
  return localIntro === true || account?.canContinue === true ? 'continue' : 'front_door';
}

export function readFlag(storage, key) {
  try { return storage?.getItem(key) === '1'; } catch { return false; }
}
export function writeFlag(storage, key, value = true) {
  try { if (value) storage?.setItem(key, '1'); else storage?.removeItem(key); return true; } catch { return false; }
}

// The class code (G29, D030): 5 symbols without 0, O, 1, I or L, shown as HARBOR-K7QXM. The server
// keeps the current one and compares it (POST /api/demo/join); the browser only reads its shape.
// The public symbols a class code is drawn from (not a secret; the scanner sees high entropy).
export const CLASS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // pragma: allowlist secret
export const CLASS_CODE_PREFIX = 'HARBOR';
const CLASS_CODE = new RegExp(`^[${CLASS_CODE_ALPHABET}]{5}$`);
// The value the in-game "Join the class harbor" button stores: in the class room, no code sent.
export const JOINED_WITHOUT_CODE = 'harbor';

// The 5-symbol code in what a player typed ("harbor-k7qxm", "K7Q XM", "HARBORK7QXM"), or null.
export function classCode(value) {
  if (typeof value !== 'string' || value.length > 32) return null;
  let code = value.replace(/[\s-]/g, '').toUpperCase();
  if (code.length === CLASS_CODE_PREFIX.length + 5 && code.startsWith(CLASS_CODE_PREFIX)) code = code.slice(CLASS_CODE_PREFIX.length);
  return CLASS_CODE.test(code) ? code : null;
}
export const displayCode = code => (classCode(code) ? `${CLASS_CODE_PREFIX}-${classCode(code)}` : '');

// A typed code: the class code (with or without HARBOR-), the word HARBOR alone (the class code is
// missing: code null), or a crew code. Codes are letters and digits only; spaces and dashes are ignored.
export function joinTarget(value) {
  if (typeof value !== 'string') return null;
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(code)) return null;
  const klass = classCode(code);
  if (klass) return {kind: 'class', code: klass};
  if (code === CLASS_CODE_PREFIX || code.startsWith(CLASS_CODE_PREFIX) && code.length > 6) return {kind: 'class', code: null};
  return {kind: 'crew', code};
}
export function goalCopy() {
  return {
    title: 'Your goal',
    goal: 'Find out why the lighthouse went dark, and bring its light back.',
    controls: [
      ['Move', 'WASD or arrow keys, or tap where you want to walk.'],
      ['Interact', 'Press E, or tap the button that appears next to you.'],
    ],
    button: 'Got it',
  };
}

// Remember the class code of a projector invitation (?join=K7QXM) for the Join page and the class
// harbor; sessionStorage only, so it ends with the tab. Anything that is not a class code is ignored.
export function rememberJoin(search = globalThis.location?.search ?? '', storage = safeSession()) {
  try {
    const code = classCode(new URLSearchParams(search).get('join') ?? '');
    if (!code) return null;
    storage?.setItem(JOIN_KEY, code);
    return code;
  } catch { return null; }
}
// The remembered class code, or null (also for the in-game "Join the class harbor", which has none).
export function readJoinCode(storage = safeSession()) {
  try { return classCode(storage?.getItem(JOIN_KEY) ?? ''); } catch { return null; }
}
export function forgetJoinCode(storage = safeSession()) {
  try { if (readJoinCode(storage)) storage?.removeItem(JOIN_KEY); return true; } catch { return false; }
}
// In the class harbor: a remembered class code, or the in-game button's mark.
export function joinedHarbor(storage = safeSession()) {
  try { const value = storage?.getItem(JOIN_KEY); return value === JOINED_WITHOUT_CODE || !!classCode(value ?? ''); } catch { return false; }
}
function safeSession() { try { return globalThis.sessionStorage ?? null; } catch { return null; } }
