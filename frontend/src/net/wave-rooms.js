// openRoom(topic) for the pirate waves (BUILD-PLAN 3.6), on top of the live presence's Realtime client:
// the wave room is the place room the presence already holds for an island (live:place:isle_<code>:1)
// or for Pirate Point (live:place:pirate_point:1). send() goes out only while we are in that very room
// (src/net/live-extras.js, sendWave); arriving messages were checked by readWaveMessage (live-rules.js)
// and reach the bus as live_room_message. Display and sync only: the server decides loot and waves.
//   const room = openRoom('live:place:pirate_point:1');   // {topic, send(type, payload), on(type, handler), close()}
import {on as busOn} from '../core/events.js';
import {sendWave} from './live-extras.js';
import {WAVE_EVENTS} from './live-rules.js';

export const WAVE_TOPIC = /^live:place:(?:pirate_point|isle_[abcdefghjkmnpqrstuvwxyz23456789]{5}):1$/;

export function openRoom(topic, {on = busOn, send = sendWave} = {}) {
  if (typeof topic !== 'string' || !WAVE_TOPIC.test(topic)) return null;
  const stops = [];
  let closed = false;
  return {
    topic,
    send(type, payload) { return !closed && WAVE_EVENTS.includes(type) && send(topic, type, payload) === true; },
    on(type, handler) {
      const stop = on('live_room_message', event => {
        if (!closed && event?.topic === topic && event.event === type) handler(event.data);
      });
      stops.push(stop);
      return stop;
    },
    close() { closed = true; for (const stop of stops.splice(0)) stop(); },
  };
}
