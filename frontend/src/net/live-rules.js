// The rules of live presence, as plain functions: what the rooms are called, how big a room may
// be, how often a captain may send, and which messages to accept and show. No network, no timers
// and no Three.js here, so Vitest tests every rule without a browser. src/online/realtime.js and
// its helpers do the talking (rooms, timers, events) and ask this file what is allowed.
//
// The design, the numbers and the reasons are in specs/A4-live-presence.md, and the contract for
// the screens is in docs/INTERFACES.md, section 7. In short: Supabase Realtime's free plan allows
// 100 messages a second for the whole project, and every delivered copy counts. So the more
// players are online and the fuller a room is, the less often each captain sends.
//
// Used by: src/online/realtime.js and its helpers src/net/live-rooms.js, live-sender.js,
// live-view.js and live-places.js, the screens adapter that draws other captains (glide,
// shouldSnap, facingFrom), and tests/live-rules.test.js. backend/server/crew_broadcast.py has the
// same list of crew event kinds as CREW_EVENT_KINDS below, and a test keeps the two equal.
// The topic patterns match the policies in supabase/migrations/20261106050000_live_presence.sql,
// and a test reads that file to make sure.

// --- the shapes everybody agrees on ---

export const PROTOCOL_VERSION = 1; // the "v" in every payload, so a newer shape can be refused
export const WORLD_TOPIC = 'live:world';
export const FACINGS = ['up', 'down', 'left', 'right'];
// Preset emotes only, never free text. The names are a proposal; decision D006 (A2) may rename them.
export const EMOTES = ['wave', 'cheer', 'point', 'lantern', 'shrug'];
// What the server may tell a crew (backend/server/crew_broadcast.py has the same list).
export const CREW_EVENT_KINDS = ['board_changed', 'finale_changed', 'case_changed', 'partner_changed', 'crew_changed'];
// Every player has their own home islet, so nobody shares a room there.
const PRIVATE_PLACES = ['home_islet'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PLACE_ID = /^[a-z][a-z0-9_]{1,39}$/; // the ids in src/world/places/registry.js
const KIT = /^[a-z][a-z_]{1,23}$/;

// --- the numbers (each has its reason in the spec, section 6) ---

export const MAX_ROOM_NUMBER = 99;
const MIN_ROOM_SIZE = 4; // a crew fits, however full the game is
const MAX_ROOM_SIZE = 9; // you plus 8 others
const ROOM_BUDGET = 120; // 60 messages a second times the slowest gap we accept, 2 seconds
export const MAX_SHOWN = 8; // other captains drawn at once
const MOVE_BUDGET = 60; // messages a second that moves may use of the project's 100
export const MIN_GAP_MS = 500; // at most 2 updates a second
export const MAX_GAP_MS = 20000;
const GAP_STEP_MS = 100; // gaps are rounded up to a multiple of this
export const LOAD_LIMIT = 80; // above this estimated load, the guard slows us down
export const MAX_COORD = 200; // x and z of a position stay between -200 and 200
export const SPRINT_SPEED = 6; // units a second, from src/player/controller.js
const SNAP_FACTOR = 1.5; // a jump longer than this many gaps of sprinting is not a walk
export const MAX_CREW_DATA_BYTES = 1024;

export const START_DELAY_MS = 5000; // the first join waits a random time up to this

// The class harbor (G29): one shared room for a class demo, live:place:class_harbor:1. Everybody who
// joins by the projector QR stands in Saltreach Harbor but announces this place, so ~30 phones and the
// presenter share one room. Its numbers differ from the normal rooms on purpose:
//   * up to 40 other captains in the room and all of them drawn (the normal rooms: 4 to 9, 8 drawn);
//   * no random start delay, and a shorter announcement jitter (phones arrive one by one from the QR,
//     so they do not announce together the way a whole class opening the game at once would);
//   * moves keep the same budget (sendGapMs): with 30 captains a captain sends about every 15 s;
//   * a small "extras" lane for preset emotes, lamp states and duel invitations, one message a second
//     at most per captain, so a wave shows at once instead of waiting for the next move slot.
export const CLASS_HARBOR_PLACE = 'class_harbor';
export const CLASS_HARBOR_ROOM = 1;
export const CLASS_ROOM_SIZE = 40; // other captains in the class room, all drawn
export const CLASS_TRACK_JITTER_MS = 4000;
export const EXTRA_EVENTS = ['lamp', 'duel'];
// The wave rooms (BUILD-PLAN 3.6): an island's room isle_<code in lowercase> and Pirate Point
// (pirate_point). Everyone defending one island, or Pirate Point, shares room 1 (up to 40 others, all
// drawn, like the class harbor), so the wave's broadcasts reach every defender. Only these broadcast
// events pass, each checked field by field (readWaveMessage); a malformed one is dropped.
export const PIRATE_POINT_PLACE = 'pirate_point';
export const WAVE_EVENTS = ['wave_start', 'cannon_shot', 'wall_repair', 'lamps_lit', 'lamp'];
export const WAVE_GAP_MS = 200; // we send at most one wave message this often (5 a second)
export const MIN_WAVE_GAP_MS = 150; // and accept one per captain and kind this often
const ISLAND_ROOM_PLACE = /^isle_[abcdefghjkmnpqrstuvwxyz23456789]{5}$/;
export const EXTRA_GAP_MS = 1000; // we send at most one extra this often
export const MIN_EXTRA_GAP_MS = 800; // and accept one per captain and kind this often
export const MAX_EXTRA_DATA_BYTES = 512;
// Every announcement of ours is delivered to everyone online, so a class that opens the game together
// (or a Realtime blip that drops everybody) would announce itself all at once. After every join of the
// world room, the first announcement waits a random time up to this, on top of the start delay.
export const TRACK_JITTER_MS = 10000;
export const TRACK_GAP_MS = 1500; // at most one presence update this often
export const JOIN_GAP_MS = 1000; // a room of one kind (world, place, crew) starts to join at most this often
export const EMOTE_COOLDOWN_MS = 3000; // we send at most one emote this often
export const MIN_POSITION_GAP_MS = 400; // we accept a position this soon after the last from the same captain
export const MIN_EMOTE_GAP_MS = 2000; // and an emote this soon
export const REPLY_DELAY_MIN_MS = 200; // an arrival is answered after a random time in this range
export const REPLY_DELAY_MAX_MS = 800;
export const GUARD_WINDOW_MS = 10000; // the guard averages the traffic over this long
export const GUARD_EVERY_MS = 1000; // and looks once in this time
export const SLOW_MS = 5 * 60 * 1000; // slow mode lasts this long
export const CALM_MS = 60 * 1000; // after this long joined, a room's failed tries are forgotten
export const NAME_BATCH = 50; // names are read from profiles this many ids at a time
export const NAME_RETRY_MS = 30000; // a failed name read is tried again after this long
const RETRY_BASE_MS = 1000;
const RETRY_SPREAD_MS = 2000;
const RETRY_SPREAD_CAP_MS = 30000;
const MESSAGE_RATE_WAIT_MS = 10000; // the server said "Too many messages per second"
const PRESENCE_RATE_WAIT_MS = 30000; // the server said something about presence rates

// --- the class harbor ---

export const isClassPlace = place => place === CLASS_HARBOR_PLACE;
export const isWavePlace = place => place === PIRATE_POINT_PLACE || (typeof place === 'string' && ISLAND_ROOM_PLACE.test(place));
// Places whose one shared room 1 holds a whole class (the class harbor, Pirate Point, an island's defenders).
const isSharedPlace = place => isClassPlace(place) || isWavePlace(place);
// The most other captains drawn in a room of this place.
export const shownLimit = place => (isSharedPlace(place) ? CLASS_ROOM_SIZE : MAX_SHOWN);
export const startDelayMs = (classHarbor, random = Math.random) => (classHarbor === true ? 0 : Math.floor(random() * START_DELAY_MS));
export const trackJitterMs = (classHarbor, random = Math.random) => random() * (classHarbor === true ? CLASS_TRACK_JITTER_MS : TRACK_JITTER_MS);

// --- small checks ---

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The text of an error, for a warning in the console. Nothing here ever holds a token.
export function describeError(error) {
  return error instanceof Error ? error.message : String(error ?? '');
}

export function isPlayerId(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function isPlaceId(value) {
  return typeof value === 'string' && PLACE_ID.test(value);
}

export function isKit(value) {
  return typeof value === 'string' && KIT.test(value);
}

export function isPrivatePlace(place) {
  return PRIVATE_PLACES.includes(place);
}

function isRoomNumber(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_ROOM_NUMBER;
}

function isCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORD;
}

function isSequence(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// How many bytes the data takes as compact JSON, like the server counts. Infinity if it is not JSON.
function jsonBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Infinity;
  }
}

// --- topics ---

// The topic of a place room, for example live:place:saltreach_harbor:1. null if it cannot exist.
export function placeTopic(place, room) {
  if (!isPlaceId(place) || isPrivatePlace(place) || !isRoomNumber(room)) return null;
  return `live:place:${place}:${room}`;
}

// The topic of a crew's room. A crew id is a uuid, and the database wants it in lowercase.
export function crewTopic(crewId) {
  if (typeof crewId !== 'string') return null;
  const id = crewId.toLowerCase();
  return UUID.test(id) ? `live:crew:${id}` : null;
}

// --- room sizes and the send gap ---

// The most captains in one room: 9 while the game is quiet, down to 4 when it is busy.
export function roomLimit(online) {
  const count = Number.isFinite(online) && online >= 1 ? Math.floor(online) : 1;
  return Math.min(MAX_ROOM_SIZE, Math.max(MIN_ROOM_SIZE, Math.floor(ROOM_BUDGET / count)));
}

// What the world says about the rooms of one place: {roomCounts, crewmateRooms}. roomCounts is
// {room number: other captains there now}, and crewmateRooms lists the rooms where a crewmate sits.
// `peers` is the Map from readWorld() and `crewIds` a Set of the other members of our crew.
export function roomsOf(peers, place, crewIds) {
  const roomCounts = {};
  const crewmateRooms = [];
  for (const [id, peer] of peers) {
    if (peer.place !== place || peer.room === null) continue;
    roomCounts[peer.room] = (roomCounts[peer.room] ?? 0) + 1;
    if (crewIds.has(id)) crewmateRooms.push(peer.room);
  }
  return { roomCounts, crewmateRooms };
}

// Which room to join. `roomCounts` is {room number: captains there now}, without us.
// A room where a crewmate already is wins, even if it is full. Otherwise the first room with space.
// null only if all 99 rooms are full.
// The class harbor (place class_harbor) holds 40 others in room 1 before it opens room 2.
export function chooseRoom({ roomCounts = {}, crewmateRooms = [], online = 1, place = null } = {}) {
  if (isWavePlace(place)) return 1; // the wave room: every defender in room 1
  if (crewmateRooms.length > 0 && !isClassPlace(place)) return Math.min(...crewmateRooms);
  const limit = isClassPlace(place) ? CLASS_ROOM_SIZE : roomLimit(online);
  for (let room = 1; room <= MAX_ROOM_NUMBER; room += 1) {
    if ((roomCounts[room] ?? 0) < limit) return room;
  }
  return null;
}

// If two crewmates arrived at the same moment and landed in different rooms, the one in the higher
// room moves down. Gives the room to move to, or null to stay.
export function roomToMoveTo(currentRoom, crewmateRooms) {
  const lowest = Math.min(currentRoom, ...crewmateRooms);
  return lowest < currentRoom ? lowest : null;
}

// How many milliseconds to wait between two messages of ours: moves, emotes and replies share it.
// `online` is the captains in the whole game, `room` the captains in our room (counting us).
// rate = min(2, 60 / (online x room)) updates a second; slow mode halves it. The gap is rounded up
// to 100 ms, and stays between 500 ms and 20 s. null when we are alone: nobody would hear us.
export function sendGapMs(online, room, slow = false) {
  if (!(room > 1)) return null;
  const stretch = slow ? 2 : 1;
  const crowd = Math.max(online || 0, room); // the game is never smaller than our room
  const budgetGap = (1000 * stretch * crowd * room) / MOVE_BUDGET;
  const wanted = Math.max(MIN_GAP_MS * stretch, budgetGap);
  const rounded = Math.ceil(wanted / GAP_STEP_MS) * GAP_STEP_MS;
  return Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, rounded));
}

// The guard's guess of what the whole game costs, if every room were as busy as ours.
export function estimatedLoad(heardPerSecond, sentPerSecond, online) {
  return (heardPerSecond + sentPerSecond) * online;
}

// --- what to accept ---
// Anything that fails a check is dropped. Each reader gives back only the fields we know, as a
// new object, so a name, a login or any other extra field never gets through.

// One entry of the world's presence: where a captain says they are. null if it is not valid.
export function readPresenceMeta(meta) {
  if (!isRecord(meta) || meta.v !== PROTOCOL_VERSION) return null;
  const place = meta.place ?? null;
  const room = meta.room ?? null;
  const kit = meta.kit ?? null;
  if (place !== null && !isPlaceId(place)) return null;
  if (room !== null && !isRoomNumber(room)) return null;
  if (room !== null && (place === null || isPrivatePlace(place))) return null; // no room at sea or at home
  if (kit !== null && !isKit(kit)) return null;
  return { place, room, kit };
}

// The whole world from presenceState(): {peers: Map of id to {place, room, kit}, online}.
// `online` counts every valid captain, us too if we have announced ourselves. peers leaves us out.
// When one player has two tabs open, the newest entry counts.
export function readWorld(state, me) {
  const peers = new Map();
  let online = 0;
  for (const [id, entries] of Object.entries(state ?? {})) {
    if (!isPlayerId(id)) continue;
    const meta = readPresenceMeta(Array.isArray(entries) ? entries.at(-1) : entries);
    if (!meta) continue;
    online += 1;
    if (id !== me) peers.set(id, meta);
  }
  return { peers, online };
}

// A position from a place room. `place` is the place we are in. null if it is not valid.
export function readPosition(payload, place) {
  if (!isRecord(payload) || payload.v !== PROTOCOL_VERSION) return null;
  if (!isPlaceId(place) || payload.place !== place || !isPlayerId(payload.id)) return null;
  const { id, x, z, facing, moving, seq, everyMs } = payload;
  if (!isCoordinate(x) || !isCoordinate(z) || !FACINGS.includes(facing) || typeof moving !== 'boolean') return null;
  if (!isSequence(seq)) return null;
  if (!Number.isFinite(everyMs) || everyMs < MIN_GAP_MS || everyMs > MAX_GAP_MS) return null;
  return { id, place, x, z, facing, moving, seq, everyMs };
}

// A preset emote from a place room. null if the emote is not on the list.
export function readEmote(payload) {
  if (!isRecord(payload) || payload.v !== PROTOCOL_VERSION) return null;
  if (!isPlayerId(payload.id) || !EMOTES.includes(payload.emote) || !isSequence(payload.seq)) return null;
  return { id: payload.id, emote: payload.emote, seq: payload.seq };
}

// An event of the server in a crew room: a known kind and a small object of data.
export function readCrewEvent(payload) {
  if (!isRecord(payload) || payload.v !== PROTOCOL_VERSION || !CREW_EVENT_KINDS.includes(payload.kind)) return null;
  const data = payload.data === undefined ? {} : payload.data;
  if (!isRecord(data) || jsonBytes(data) > MAX_CREW_DATA_BYTES) return null;
  return { kind: payload.kind, data };
}

// An extra of the class harbor: a lamp state or a duel invitation, {v, id, seq, data}. Only the kinds
// in EXTRA_EVENTS, and data a small object. null if it is not valid.
export function readExtra(event, payload) {
  if (!EXTRA_EVENTS.includes(event) || !isRecord(payload) || payload.v !== PROTOCOL_VERSION) return null;
  if (!isPlayerId(payload.id) || !isSequence(payload.seq)) return null;
  if (!isRecord(payload.data) || jsonBytes(payload.data) > MAX_EXTRA_DATA_BYTES) return null;
  return { id: payload.id, event, seq: payload.seq, data: payload.data };
}

// The topic of a wave room: live:place:isle_k7q2m:1 or live:place:pirate_point:1. null otherwise.
export function waveTopic(place) {
  return isWavePlace(place) ? `live:place:${place}:1` : null;
}

// A wave message, {v, id, seq, data}: the sender's player id, its sequence number and the data of one of
// WAVE_EVENTS with exactly its fields (src/pirates/sync.js and pirate-point.js write them). null if not valid.
const WAVE_ID = /^[A-Za-z0-9_-]{1,64}$/, WAVE_ITEM = /^[a-z0-9_-]{1,32}$/i, WAVE_BY = /^[A-Za-z0-9_.:-]{1,64}$/;
const isWaveTime = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 900;
const isLampAge = value => value === null || (Number.isInteger(value) && value >= 0 && value <= 3600000);
const hasKeys = (data, keys) => Object.keys(data).length === keys.length && keys.every(key => Object.hasOwn(data, key));
const WAVE_DATA = {
  wave_start: data => hasKeys(data, ['waveId', 'seed', 'startsAt']) && Number.isSafeInteger(data.seed) && data.seed >= 0
    && typeof data.startsAt === 'string' && data.startsAt.length <= 40 && Number.isFinite(Date.parse(data.startsAt)),
  cannon_shot: data => hasKeys(data, ['by', 'seq', 't', 'waveId', 'cannonId', 'targetId']) && WAVE_ITEM.test(String(data.cannonId)) && WAVE_ITEM.test(String(data.targetId)),
  wall_repair: data => hasKeys(data, ['by', 'seq', 't', 'waveId', 'wallId']) && WAVE_ITEM.test(String(data.wallId)),
  lamps_lit: data => hasKeys(data, ['by', 'seq', 't', 'waveId']),
  lamp: data => hasKeys(data, ['v', 'lamps', 'relit', 'started', 'waveId']) && data.v === 1 && Array.isArray(data.lamps)
    && data.lamps.length === 3 && data.lamps.every(isLampAge) && isLampAge(data.relit) && isLampAge(data.started),
};
export function readWaveMessage(event, payload) {
  if (!WAVE_EVENTS.includes(event) || !isRecord(payload) || payload.v !== PROTOCOL_VERSION) return null;
  if (!isPlayerId(payload.id) || !isSequence(payload.seq)) return null;
  const data = payload.data;
  if (!isRecord(data) || jsonBytes(data) > MAX_EXTRA_DATA_BYTES || typeof data.waveId !== 'string' || !WAVE_ID.test(data.waveId)) return null;
  if (Object.hasOwn(data, 'by') && (typeof data.by !== 'string' || !WAVE_BY.test(data.by) || !isSequence(data.seq) || !isWaveTime(data.t))) return null;
  return WAVE_DATA[event](data) ? { id: payload.id, event, seq: payload.seq, data: { ...data } } : null;
}

// A "system" message of Supabase. Only the two warnings about rates matter: they say how long to
// wait before we join again, and whether to slow down. Everything else gives null.
export function readSystemNotice(payload) {
  const message = typeof payload?.message === 'string' ? payload.message.toLowerCase() : '';
  if (message.includes('presence') && (message.includes('too many') || message.includes('rate limit'))) {
    return { minWaitMs: PRESENCE_RATE_WAIT_MS, slow: false };
  }
  if (message.includes('too many messages per second')) {
    return { minWaitMs: MESSAGE_RATE_WAIT_MS, slow: true };
  }
  return null;
}

// --- what to show ---

// Which captains of our room to draw: at most `max`, crewmates first, then the rest by id.
// `placeCount` is all the other captains in our place, in every room, so the rest can be counted.
export function pickShown({ peerIds, placeCount, crewIds = [], max = MAX_SHOWN }) {
  // max: shownLimit(place), so 40 in the class harbor.
  const crew = new Set(crewIds);
  const byId = [...peerIds].sort();
  const ordered = [...byId.filter(id => crew.has(id)), ...byId.filter(id => !crew.has(id))];
  const shownIds = ordered.slice(0, max);
  return { shownIds, hiddenCount: Math.max(0, placeCount - shownIds.length) };
}

// Where a captain on screen is drawn `elapsedMs` after a new position arrived: on the straight
// line from where it was drawn (`from`) to the new spot (`to`), arriving after one gap.
export function glide(from, to, everyMs, elapsedMs) {
  const progress = everyMs > 0 ? Math.min(1, Math.max(0, elapsedMs / everyMs)) : 1;
  return { x: from.x + (to.x - from.x) * progress, z: from.z + (to.z - from.z) * progress };
}

// True if the new spot is further away than a captain could sprint in 1.5 gaps. Then the screen
// jumps there instead of gliding.
export function shouldSnap(from, to, everyMs) {
  return Math.hypot(to.x - from.x, to.z - from.z) > SPRINT_SPEED * SNAP_FACTOR * (everyMs / 1000);
}

// The facing for a movement of (dx, dz): the same choice as createCharacter().face(dx, dz) in
// src/player/character.js. A movement too small to count keeps the facing we had.
export function facingFrom(dx, dz, previous = 'down') {
  if (Math.abs(dz) > Math.abs(dx)) return dz < 0 ? 'up' : 'down';
  if (Math.abs(dx) > 0.001) return dx < 0 ? 'left' : 'right';
  return previous;
}

// --- waiting before a retry ---

// How long to wait before joining a room again after `tries` failures in a row:
// 1 second plus a random part that grows with every failure, up to 30 seconds. At most 31 s.
export function backoffMs(tries, random = Math.random) {
  const failures = Number.isFinite(tries) && tries > 0 ? Math.floor(tries) : 0;
  return RETRY_BASE_MS + random() * Math.min(RETRY_SPREAD_CAP_MS, RETRY_SPREAD_MS * 2 ** failures);
}
