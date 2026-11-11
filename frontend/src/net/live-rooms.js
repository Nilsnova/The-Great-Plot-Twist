// The life of a private Realtime room: join it, notice how it goes, leave it, and join it again after a
// wait when it fails. This file knows nothing about what a room is for (presence, moves or crew
// events): the owner of the room passes that in as hooks. The waits and the join allowance are numbers
// in src/net/live-rules.js.
//
//   rooms.open(kind, topic, config, hooks)  joins at once (kind: 'world', 'place' or 'crew') and gives back
//       { topic, kind, config, hooks, channel, subscribed, closed, tries, refusals, minWait, retry, calm }
//   rooms.close(room)                        leaves for good
// The hooks: wire(channel) adds the listeners (required). The others are optional: joining() runs before
// each join, subscribed() when the room is joined, lost() when it fails, and refused() when the rules say
// no ("Unauthorized") three more times, 2, 5 and 8 seconds apart (REFUSED_RETRY_MS): then we do not knock
// again. Each refused try leaves one quiet warning in the console.
//
// A failed room is removed first, which also stops the library's own retries, and joined again after
// 1 s plus a random part that grows with every failure (backoffMs). Supabase's "system" messages can ask
// for a longer wait. A new room waits until the old room of the same topic is gone (the library keeps one
// room for each topic) and until it is its turn: a room of one kind starts to join at most once a second,
// so a place or a crew that changes every frame cannot flood the project (the free plan allows 100
// channel joins a second for all players together).
//
// Used by: src/net/live-places.js (the world and the place rooms), src/online/realtime.js (the crew
// room) and tests/realtime.test.js.
import { CALM_MS, JOIN_GAP_MS, REFUSED_RETRY_MS, backoffMs, describeError, readSystemNotice } from './live-rules.js';

export function createRooms({ getClient, isStopped, onSlowNotice, later, cancel, random, now }) {
  const leaving = new Map(); // topic -> a promise that is done when the old room of that topic is gone
  const nextJoinAt = {}; // kind -> the earliest time that a room of that kind may start to join

  function open(kind, topic, config, hooks) {
    const room = { topic, kind, config, hooks, channel: null, subscribed: false, closed: false, tries: 0, refusals: 0, minWait: 0, retry: null, calm: null };
    join(room);
    return room;
  }

  async function join(room) {
    await leaving.get(room.topic); // a room of the same topic that is still being removed
    if (room.closed || isStopped()) return;
    const wait = (nextJoinAt[room.kind] ?? -Infinity) - now();
    if (wait > 0) { // not our turn yet: the room may be closed again before it comes
      room.retry = later(() => join(room), wait);
      return;
    }
    nextJoinAt[room.kind] = now() + JOIN_GAP_MS;
    room.retry = null;
    room.hooks.joining?.();
    try {
      const channel = getClient().channel(room.topic, { config: room.config });
      room.channel = channel;
      room.hooks.wire(channel);
      channel.on('system', {}, payload => noteSystem(room, payload));
      channel.subscribe((status, error) => onStatus(room, channel, status, error));
    } catch (error) {
      fail(room, error);
    }
  }

  function onStatus(room, channel, status, error) {
    if (room.closed || isStopped() || channel !== room.channel) return; // the last words of a room we removed
    if (status === 'SUBSCRIBED') {
      room.subscribed = true;
      room.minWait = 0;
      room.refusals = 0;
      cancel(room.calm);
      room.calm = later(() => { room.tries = 0; }, CALM_MS); // a calm minute: forget the failed tries
      room.hooks.subscribed?.();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      fail(room, error);
    }
  }

  // Take the room away (this also stops the library's own retries) and join it again later.
  function fail(room, error) {
    if (room.closed || isStopped()) return;
    room.subscribed = false;
    cancel(room.calm);
    dropChannel(room);
    room.hooks.lost?.();
    if (/unauthorized/i.test(describeError(error))) { // the rules say no: knock a few more times, then stop
      const wait = REFUSED_RETRY_MS[room.refusals];
      room.refusals += 1;
      if (wait !== undefined) {
        console.warn(`Live room ${room.kind} refused, trying again in ${wait / 1000} s (${room.refusals} of ${REFUSED_RETRY_MS.length}).`);
        room.retry = later(() => join(room), wait);
        return;
      }
      console.warn(`Live room ${room.kind} refused ${room.refusals} times, giving up.`);
      room.closed = true;
      room.hooks.refused?.();
      return;
    }
    const wait = Math.max(backoffMs(room.tries, random), room.minWait);
    room.tries += 1;
    room.minWait = 0;
    room.retry = later(() => join(room), wait);
  }

  function close(room) {
    room.closed = true;
    room.subscribed = false;
    cancel(room.retry);
    cancel(room.calm);
    dropChannel(room);
  }

  function dropChannel(room) {
    const channel = room.channel;
    const client = getClient();
    room.channel = null;
    if (!channel || !client) return;
    let removing;
    try {
      removing = Promise.resolve(client.removeChannel(channel));
    } catch {
      removing = Promise.resolve();
    }
    const removal = removing.catch(() => {}).then(() => {
      if (leaving.get(room.topic) === removal) leaving.delete(room.topic);
    });
    leaving.set(room.topic, removal);
  }

  // "Too many messages per second" and the presence warnings come as `system` messages just before
  // the room is closed. They decide how long we wait, and whether we slow down.
  function noteSystem(room, payload) {
    const notice = readSystemNotice(payload);
    if (!notice) return;
    room.minWait = Math.max(room.minWait, notice.minWaitMs);
    if (notice.slow) onSlowNotice();
  }

  return { open, close };
}
