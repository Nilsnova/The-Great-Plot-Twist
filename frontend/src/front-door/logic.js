// Front-door rules without DOM: where Play lands, the class code and the goal card's words.
export const FRONT_DOOR_KEY = 'plot_twist_front_door_v1';
export const JOIN_KEY = 'plot_twist_join_v1';
// The demo starts outside, in Saltreach Harbor, through the game's existing world continuation.
// demo: true starts the class demo path (quest strip, class harbor, lock, lamps; src/class-demo/).
export const HARBOR_START = Object.freeze({kind: 'world', place: 'saltreach_harbor', demo: true});

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
// The goal card after the intro (docs/PITCH.md, the first 3 minutes). A player who came with a class
// code gets the class goals instead; the quest strip then shows the same goals.
export function goalCopy({classHarbor = false} = {}) {
  return classHarbor ? {
    title: 'The class harbor',
    goal: "Wave to a captain, win a friendly duel and open the Keeper's Lock, then light the three lamps together.",
    controls: GOAL_CONTROLS, button: 'Got it',
  } : {
    title: 'Your island',
    goal: 'Build a cannon, then ring the bell: the pirates are coming.',
    controls: GOAL_CONTROLS, button: 'Got it',
  };
}
const GOAL_CONTROLS = Object.freeze([
  ['Walk', 'WASD or arrow keys, or tap where you want to go.'],
  ['Use', 'Press E, or tap the Use button that appears next to you.'],
]);

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

// --- the games card (docs/GAME-V3.md §2): Continue, Create a game, Join a game ---
// A game code: ISLE-K7Q2M, its 5 symbols, any case, with spaces or dashes ("isle k7q2m", "k7q-2m").
const GAME_SYMBOLS = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
export function readGameCode(value) {
  if (typeof value !== 'string' || value.length > 32) return null;
  let code = value.replace(/[\s-]/g, '').toUpperCase();
  if (code.length === 9 && code.startsWith('ISLE')) code = code.slice(4);
  return GAME_SYMBOLS.test(code) ? `ISLE-${code}` : null;
}
const players = count => `${count} ${count === 1 ? 'player' : 'players'}`;
// One line of Continue: whose game, the wave reached and how many are in it.
export function gameLine(game) {
  const host = game?.role === 'host' ? 'Your game' : `${game?.hostName || 'A friend'}'s game`;
  const wave = Number.isSafeInteger(game?.waveBest) && game.waveBest > 0 ? `wave ${game.waveBest}` : 'no wave yet';
  return {title: `${host} · ${game?.code ?? ''}`, line: `${wave} · ${players(Math.max(1, game?.members ?? 1))}`};
}
// What the card says: games [{code, hostName, role, waveBest, members}] newest first (GET /api/games).
export function gamesCopy({games = [], signedOut = false} = {}) {
  const list = Array.isArray(games) ? games.filter(game => game && typeof game.code === 'string') : [];
  const hosting = list.some(game => game.role === 'host');
  return {
    continue: list.length ? {title: 'Continue', games: list.map(game => ({...gameLine(game), code: game.code, raw: game}))} : null,
    create: {title: 'Create a game', button: 'Create a game',
      line: hosting ? 'Your island is your game, so Create opens it. Up to 10 players.' : 'Start on your own island. Up to 10 players can join.'},
    join: {title: 'Join a game', label: 'Game code', button: 'Join',
      line: signedOut ? 'Got a code from a friend? Type it here. You join as a guest.' : 'Got a code from a friend? Type it here.'},
  };
}
