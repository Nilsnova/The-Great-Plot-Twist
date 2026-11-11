// What we send into our place room: positions, preset emotes and replies to newcomers. One allowance
// covers all of it: the gap between two messages comes from sendGapMs (src/net/live-rules.js), so the
// more captains are online and the fuller our room is, the less often we send. This file also holds
// the guard. Once a second it estimates what the whole game costs, if every room were as busy as
// ours, and above the limit it turns on slow mode (double gaps for 5 minutes) before Supabase closes
// the rooms. The rules are plain functions in live-rules.js; this file keeps the queue and the timers.
//
// What it sends, in this order when the allowance is free: a queued emote, the stop update, a reply
// to a newcomer, then the regular update while moving. Alone in the room, nothing is sent.
// It sends only into a joined room over an open socket: supabase-js would otherwise post the message
// over HTTPS (with a console warning), which is a different path with other limits. And only once the
// world knows our place and room (the others ignore a captain they do not know).
//
// In the class harbor (G29) a second, small lane carries preset emotes, lamp states and duel
// invitations at once, one message a second at most, instead of waiting for the next move slot.
//
//   update(sample)       every frame: { x, z, facing, moving }
//   extra(event, data)   class harbor only: true if the lamp state or invitation will be sent
//   emote(id)            true if the emote will be sent (preset only, one every 3 seconds)
//   joined(ids)          our place room is joined; `ids` are the others in it
//   noteMembers(ids)     the world changed; `ids` are the others in our room now
//   pump()               send the next thing if the allowance is free
//   reset()              we left the room: forget what was waiting
//   hear()               a message of another captain arrived (the guard counts it)
//   turnOnSlow(), isSlow()
//
// Used by: src/net/live-places.js, src/online/realtime.js and tests/realtime.test.js.
import {
  EMOTES, EMOTE_COOLDOWN_MS, EXTRA_EVENTS, EXTRA_GAP_MS, FACINGS, GUARD_EVERY_MS, GUARD_WINDOW_MS, LOAD_LIMIT,
  PROTOCOL_VERSION, REPLY_DELAY_MAX_MS, REPLY_DELAY_MIN_MS, SLOW_MS, WAVE_EVENTS, estimatedLoad, isClassPlace, isWavePlace, sendGapMs, waveGapMs,
} from './live-rules.js';

const round2 = value => Math.round(value * 100) / 100;

export function createSender({ playerId, getRoom, getOnline, getPlace, isAnnounced, isSocketOpen, onSlowChange, later, cancel, random, now }) {
  const out = { sample: null, moving: false, stop: false, reply: false, replyTimer: null, emote: null, emoteAt: -Infinity, sentAt: -Infinity, timer: null, seq: Date.now() };
  const lane = { queue: new Map(), sentAt: -Infinity, timer: null }; // the class harbor's extras lane
  const waves = { queue: [], sentAt: -Infinity, timer: null }; // the wave room's lane (shots, repairs, lamps)
  const WAVE_QUEUE = 20; // a burst beyond this is dropped: a wave input is only useful while it is fresh
  const heard = [], sent = []; // when we heard or sent a message in the last 10 seconds (the guard)
  let members = new Set(); // the others in our room (the ones we could hear)
  let slowUntil = 0, slowTimer = null, guardTimer = null;

  const isSlow = () => now() < slowUntil;

  function roomIsOpen() {
    const room = getRoom();
    return Boolean(room?.subscribed) && room.channel?.state === 'joined' && isSocketOpen() && isAnnounced();
  }

  // How long to wait between two messages: the whole game's cost decides (see sendGapMs).
  function currentGap() {
    const inRoom = members.size + 1; // the others, and us
    return sendGapMs(Math.max(getOnline(), inRoom), inRoom, isSlow());
  }

  function nextItem() {
    if (out.emote) return 'emote';
    if (!out.sample) return null;
    if (out.stop) return 'stop';
    if (out.reply) return 'reply';
    return out.moving ? 'move' : null;
  }

  // Send the next thing if the allowance is free, otherwise try again when it is.
  function pump() {
    if (out.timer || !roomIsOpen()) return;
    const gap = currentGap();
    if (gap === null) { // alone in the room: nobody would hear us
      out.stop = false;
      out.reply = false;
      out.emote = null;
      return;
    }
    const item = nextItem();
    if (!item) return;
    const wait = out.sentAt + gap - now();
    if (wait > 0) {
      out.timer = later(wake, wait);
      return;
    }
    transmit(item, gap);
    out.sentAt = now();
    if (nextItem()) out.timer = later(wake, gap);
  }

  function wake() {
    out.timer = null;
    pump();
  }

  function transmit(item, everyMs) {
    out.seq += 1;
    if (item === 'emote') {
      broadcast('emote', { v: PROTOCOL_VERSION, id: playerId, emote: out.emote, seq: out.seq });
      out.emote = null;
      return;
    }
    const moving = item === 'move' || (item === 'reply' && out.moving);
    const { x, z, facing } = out.sample;
    broadcast('position', { v: PROTOCOL_VERSION, id: playerId, place: getPlace(), x: round2(x), z: round2(z), facing, moving, seq: out.seq, everyMs });
    out.reply = false; // any position tells a newcomer where we are
    if (item === 'stop') out.stop = false;
  }

  function broadcast(event, payload) {
    Promise.resolve(getRoom().channel.send({ type: 'broadcast', event, payload })).catch(() => {});
    sent.push(now());
  }

  function update({ x, z, facing, moving } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    out.sample = { x, z, facing: FACINGS.includes(facing) ? facing : (out.sample?.facing ?? 'down') };
    if (moving === true) out.stop = false;
    else if (out.moving) out.stop = true; // the captain just stopped: one more update says so
    out.moving = moving === true;
    pump();
  }

  function emote(id) {
    if (!EMOTES.includes(id) || !roomIsOpen() || currentGap() === null) return false;
    if (now() - out.emoteAt < EMOTE_COOLDOWN_MS) return false;
    out.emoteAt = now();
    if (isClassPlace(getPlace())) { // the class harbor: the wave shows at once
      lane.queue.set('emote', id);
      pumpLane();
      return true;
    }
    out.emote = id;
    pump();
    return true;
  }

  // ---- the wave lane (an island's room or Pirate Point): every message goes, in order, 5 a second in a
  // small room and slower in a full one (waveGapMs: up to 10 players keep the room's deliveries in budget) ----
  // The room only needs to be joined: a defender's first shot must not wait for the presence announcement.
  function waveRoomIsOpen() {
    const room = getRoom();
    return Boolean(room?.subscribed) && room.channel?.state === 'joined' && isSocketOpen();
  }
  function wave(event, data) {
    if (!WAVE_EVENTS.includes(event) || !isWavePlace(getPlace()) || !waveRoomIsOpen()) return false;
    if (waves.queue.length >= WAVE_QUEUE) return false;
    waves.queue.push([event, data]);
    pumpWaves();
    return true;
  }
  function pumpWaves() {
    if (waves.timer || !waves.queue.length) return;
    if (!waveRoomIsOpen()) { waves.queue.length = 0; return; }
    const gap = waveGapMs(members.size + 1);
    const wait = waves.sentAt + gap - now();
    if (wait > 0) { waves.timer = later(() => { waves.timer = null; pumpWaves(); }, wait); return; }
    const [event, data] = waves.queue.shift();
    out.seq += 1;
    broadcast(event, { v: PROTOCOL_VERSION, id: playerId, seq: out.seq, data });
    waves.sentAt = now();
    if (waves.queue.length) waves.timer = later(() => { waves.timer = null; pumpWaves(); }, gap);
  }

  // ---- the extras lane (class harbor only) ----
  function extra(event, data) {
    if (!EXTRA_EVENTS.includes(event) || !isClassPlace(getPlace()) || !roomIsOpen() || currentGap() === null) return false;
    lane.queue.set(event, data); // a newer state of the same kind replaces the waiting one
    pumpLane();
    return true;
  }

  function pumpLane() {
    if (lane.timer || !lane.queue.size || !roomIsOpen()) return;
    const wait = lane.sentAt + EXTRA_GAP_MS * (isSlow() ? 2 : 1) - now();
    if (wait > 0) {
      lane.timer = later(() => { lane.timer = null; pumpLane(); }, wait);
      return;
    }
    const [event, data] = lane.queue.entries().next().value;
    lane.queue.delete(event);
    out.seq += 1;
    if (event === 'emote') broadcast('emote', { v: PROTOCOL_VERSION, id: playerId, emote: data, seq: out.seq });
    else broadcast(event, { v: PROTOCOL_VERSION, id: playerId, seq: out.seq, data });
    lane.sentAt = now();
    if (lane.queue.size) lane.timer = later(() => { lane.timer = null; pumpLane(); }, EXTRA_GAP_MS);
  }

  // ---- the others in our room ----
  function joined(ids) {
    members = ids;
    out.reply = true; // tell the room where we stand, once
    startGuard();
  }

  // Someone new in our room: answer with our position, after 0.2 to 0.8 seconds, once.
  function noteMembers(ids) {
    let newcomer = false;
    for (const id of ids) if (!members.has(id)) newcomer = true;
    members = ids;
    if (!newcomer || out.replyTimer || !getRoom()?.subscribed) return;
    const wait = REPLY_DELAY_MIN_MS + random() * (REPLY_DELAY_MAX_MS - REPLY_DELAY_MIN_MS);
    out.replyTimer = later(() => {
      out.replyTimer = null;
      out.reply = true;
      pump();
    }, wait);
  }

  // We left the room: whatever waited to be sent is not for the next room.
  function reset() {
    cancel(out.timer);
    cancel(out.replyTimer);
    cancel(lane.timer);
    lane.timer = null;
    lane.queue.clear();
    cancel(waves.timer);
    waves.timer = null;
    waves.queue.length = 0;
    out.timer = null;
    out.replyTimer = null;
    out.reply = false;
    out.stop = false;
    out.emote = null;
    cancel(guardTimer);
    guardTimer = null;
    heard.length = 0;
    sent.length = 0;
    members = new Set();
  }

  // ---- the guard: slow down before Supabase closes the rooms ----
  function startGuard() {
    if (!guardTimer) guardTimer = later(guardTick, GUARD_EVERY_MS);
  }

  function guardTick() {
    guardTimer = null;
    if (!getRoom()) return;
    const since = now() - GUARD_WINDOW_MS;
    while (heard.length && heard[0] <= since) heard.shift();
    while (sent.length && sent[0] <= since) sent.shift();
    const seconds = GUARD_WINDOW_MS / 1000;
    if (estimatedLoad(heard.length / seconds, sent.length / seconds, getOnline()) > LOAD_LIMIT) turnOnSlow();
    startGuard();
  }

  function turnOnSlow() {
    slowUntil = now() + SLOW_MS;
    cancel(slowTimer);
    slowTimer = later(() => {
      slowTimer = null;
      onSlowChange(false);
    }, SLOW_MS);
    onSlowChange(true);
  }

  function hear() {
    heard.push(now());
  }

  return { update, emote, extra, wave, joined, noteMembers, pump, reset, hear, turnOnSlow, isSlow };
}
