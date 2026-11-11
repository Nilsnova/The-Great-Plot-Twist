// Room wrappers for the wave: {send(type, payload), on(type, handler) -> unsubscribe, close()}.
//
// The real room (live:place:isle_<code>:1, live:place:pirate_point:1) is a Realtime broadcast channel
// that the core lane opens (openRoom in mountPirates). Here are two small helpers:
//   createRoomProxy()   a stable room for the controllers while the real one comes and goes with travel
//   createLocalRoom()   the same room between browser tabs on one computer (BroadcastChannel), for the
//                       dev harness: two tabs with ?pirates=demo play one wave together, no server
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

export function createLocalRoom(topic, { Channel = globalThis.BroadcastChannel } = {}) {
  if (typeof Channel !== 'function') return null;
  const channel = new Channel(`tgpt:${topic}`), handlers = new Map();
  channel.onmessage = event => {
    const { type, payload } = event.data ?? {};
    if (typeof type !== 'string') return;
    for (const handler of [...(handlers.get(type) ?? [])]) handler(payload);
  };
  return {
    topic,
    send(type, payload) { channel.postMessage({ type, payload }); return true; },
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    close() { handlers.clear(); channel.close(); },
  };
}
