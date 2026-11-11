// Room wrappers for the wave: {send(type, payload), on(type, handler) -> unsubscribe, close()}.
//
// The real room (live:place:isle_<code>:1, live:place:pirate_point:1) is a Realtime broadcast channel
// that the core lane opens (openRoom in mountPirates). Here are two small helpers:
//   createRoomProxy()   a stable room for the controllers while the real one comes and goes with travel
//   createLocalRoom()   the same room between browser tabs on one computer (BroadcastChannel), for the
//                       dev harness (two tabs with ?pirates=demo) and ?islands=fake (up to ten tabs on
//                       one island, scripts/check-multiplayer.js). It keeps the live room's rules: only
//                       the wave events of src/net/live-rules.js go out, wrapped as the presence sends
//                       them ({v, id, seq, data}), and every arriving one must pass readWaveMessage, so a
//                       payload the live site would drop is dropped here too.
import { WAVE_EVENTS, readWaveMessage } from '../net/live-rules.js';

const tabId = () => {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* below */ }
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
};
export function createRoomProxy() {
  const handlers = new Map();
  let target = null, stops = [];
  const dispatch = type => payload => { for (const handler of [...(handlers.get(type) ?? [])]) handler(payload); };
  function attachType(type) { const stop = target?.on?.(type, dispatch(type)); if (typeof stop === 'function') stops.push(stop); }
  return {
    get attached() { return target !== null; },
    attach(room) {
      for (const stop of stops.splice(0)) stop();
      target = room ?? null;
      if (target) for (const type of handlers.keys()) attachType(type);
    },
    send(type, payload) { try { return target?.send?.(type, payload) ?? false; } catch { return false; } },
    on(type, handler) {
      if (!handlers.has(type)) { handlers.set(type, new Set()); attachType(type); }
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    // A message as if it came from the room (tests, and the rehearsal's simulated captains).
    receive(type, payload) { dispatch(type)(payload); },
    close() { for (const stop of stops.splice(0)) stop(); target = null; handlers.clear(); },
  };
}

export function createLocalRoom(topic, { Channel = globalThis.BroadcastChannel, id = tabId() } = {}) {
  if (typeof Channel !== 'function') return null;
  const channel = new Channel(`tgpt:${topic}`), handlers = new Map();
  let seq = 0, dropped = 0;
  channel.onmessage = event => {
    const { type, payload } = event.data ?? {};
    if (typeof type !== 'string') return;
    const message = readWaveMessage(type, payload);
    if (!message) { dropped++; return; }
    for (const handler of [...(handlers.get(type) ?? [])]) handler(message.data);
  };
  return {
    topic,
    get dropped() { return dropped; },
    send(type, payload) {
      if (!WAVE_EVENTS.includes(type)) return false;
      channel.postMessage({ type, payload: { v: 1, id, seq: ++seq, data: payload } });
      return true;
    },
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    close() { handlers.clear(); channel.close(); },
  };
}
