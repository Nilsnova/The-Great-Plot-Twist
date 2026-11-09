// Front-door rules without DOM: what Play starts, where the demo begins and the card's words.
export const FRONT_DOOR_KEY = 'plot_twist_front_door_v1';
export const JOIN_KEY = 'plot_twist_join_v1';
// The demo starts outside, in Saltreach Harbor, through the game's existing world continuation.
export const HARBOR_START = Object.freeze({kind: 'world', place: 'saltreach_harbor'});

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

// "?join=harbor" (from the projector QR) or a typed code. Codes are letters and digits only.
export function joinTarget(value) {
  if (typeof value !== 'string') return null;
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(code)) return null;
  return code === 'HARBOR' ? {kind: 'harbor', code: 'HARBOR'} : {kind: 'crew', code};
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

// Remember a projector invitation (?join=harbor) for the class harbor; the next stage reads it.
export function rememberJoin(search = globalThis.location?.search ?? '', storage = safeSession()) {
  try {
    const join = new URLSearchParams(search).get('join');
    if (!/^[a-z0-9]{1,20}$/i.test(join ?? '')) return null;
    storage?.setItem(JOIN_KEY, join.toLowerCase());
    return join.toLowerCase();
  } catch { return null; }
}
function safeSession() { try { return globalThis.sessionStorage ?? null; } catch { return null; } }
