// The lobby of a game (docs/GAME-V3.md §2) as plain rules: who may press Start or Pause, and what the
// lobby card says. No DOM, no network: game-room.js keeps the room state, ui.js draws the card.
//   canControl({me, hostId, hostAwayMs})  the host, or any member once the host has been away for 60 s
//   lobbyModel({...})                      the card: code, link, members with who is online and their colour, Start
//   captainColours(members)                each member's captain colour 0-9 by join order (host first)
import {displayIslandCode, visitUrl} from './codes.js';

export const MAX_PLAYERS = 10; // the host plus up to 9 friends (the server's 409 game_full)
export const HOST_AWAY_MS = 60000; // Start and Pause pass to any member after this long without the host
export const GAME_STARTED = 'game_started'; // bus event {first: true | false} for the narrator lane (lane N)
export const STARTED_KEY = 'plot_twist_games_started_v1'; // games this device has started (the opening once)

export function canControl({me = null, hostId = null, hostAwayMs = 0} = {}) {
  if (!me) return false;
  return me === hostId || (Number.isFinite(hostAwayMs) && hostAwayMs >= HOST_AWAY_MS);
}

export const pausedLine = name => `Paused by ${typeof name === 'string' && name.trim() ? name.trim() : 'a captain'}`;
export const playersLine = count => `${count} of ${MAX_PLAYERS} players`;

// Each member's captain colour (GAME-V3.md §2 and §7): an index 0-9 by join order, the host first (the order
// of GET /api/games/{code}), so 10 players never share one. Map id -> index; src/art/people.js has the ten.
export const CAPTAIN_COLOURS = 10;
export function captainColours(members = []) {
  const list = Array.isArray(members) ? members.filter(member => member && typeof member.id === 'string') : [];
  const ordered = [...list.filter(member => member.role === 'host'), ...list.filter(member => member.role !== 'host')];
  const colours = new Map();
  for (const member of ordered) if (!colours.has(member.id) && colours.size < CAPTAIN_COLOURS) colours.set(member.id, colours.size);
  return colours;
}

// members: [{id, name, role, you}] from GET /api/games/{code}; online: a Set of player ids in the room.
// started: Start was pressed (the card then says the game is on). problem: a plain message or ''.
export function lobbyModel({code = null, base, members = [], online = new Set(), me = null, hostId = null,
  hostAwayMs = 0, started = false, problem = ''} = {}) {
  const shown = displayIslandCode(code);
  const host = members.find(member => member.role === 'host') ?? null;
  const mine = !!me && me === hostId;
  const colours = captainColours(members);
  const rows = members.map(member => ({id: member.id, name: member.name || 'A captain', role: member.role,
    you: member.id === me, online: member.id === me || online.has(member.id), colour: colours.get(member.id) ?? 0,
    tag: member.role === 'host' ? 'Host' : ''}));
  const here = rows.filter(row => row.online).length;
  const control = canControl({me, hostId, hostAwayMs});
  const model = {title: mine ? 'Your game' : `${host?.name || 'Your friend'}'s game`, code: shown || 'Loading…',
    url: shown ? visitUrl(code, base) : '', rows, count: rows.length ? playersLine(rows.length) : '',
    online: rows.length ? `${here} online` : '', copy: 'Copy link',
    lead: shown ? 'Send the link or the code to your friends.' : 'The game is loading.',
    start: {show: !started, disabled: !control || !shown, label: 'Start', line: ''}, problem};
  if (started) model.start.line = 'The game is on. Ring the bell when you are ready.';
  else if (control && !mine) model.start.line = 'The host is away, so you can start.';
  else if (!control) model.start.line = `Waiting for ${host?.name || 'the host'} to start.`;
  else model.start.line = here > 1 ? 'Everyone here? Press Start.' : 'Start now, or wait for your friends.';
  return model;
}

// Whether this device has started this game before (the narrator's opening plays the first time only).
export function startedBefore(storage, code) {
  try { return new Set(JSON.parse(storage?.getItem(STARTED_KEY) ?? '[]')).has(code); } catch { return false; }
}
export function rememberStarted(storage, code) {
  try {
    const seen = new Set(JSON.parse(storage?.getItem(STARTED_KEY) ?? '[]'));
    seen.add(code);
    storage?.setItem(STARTED_KEY, JSON.stringify([...seen].slice(-50)));
    return true;
  } catch { return false; }
}
