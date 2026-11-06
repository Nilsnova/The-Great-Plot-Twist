// Live presence in the browser: other captains moving in the same place, preset emotes, and "something
// changed" hints for your crew, over Supabase Realtime. Everything here is only for showing (decision
// D003): a position, a place or an emote decides nothing in the game. The design, the numbers and the
// reasons are in specs/A4-live-presence.md. This file starts and stops it, holds the login token and the
// crew room, and joins the parts together. Each part is one file in src/net/:
//   live-rules.js    the rules as plain functions (room names, sizes, send gaps, what to accept)
//   live-rooms.js    the life of a room: join, fail, wait, join again, leave
//   live-places.js   the world room and our place room: who is where, and what we announce
//   live-sender.js   what we send, inside one allowance, and the guard that slows us down
//   live-view.js     what the screens are told: who is shown, their names, the messages that pass
//
// How to use it (the steps for src/game.js are in docs/INTERFACES.md, section 7):
//   const live = startRealtime({ enabled, playerId, getAccessToken, kit, crew });
//   live.setPlace(placeId | null)            null on the `travel` event, the new place on `arrived`, and once
//                                            right after the start: until then it says nothing about where
//                                            we are, so that the first announcement already holds the room
//   live.update({ x, z, facing, moving })    every frame. The module slows itself down.
//   live.emote('wave')                       true if the emote will be sent
//   live.setCrew({ id, memberIds } | null)   live.setKit(kit | null)   when they change
//   live.stop()                              in dispose(), and when the player signs out
// Import this file only from the lazily loaded game code (src/game.js) or with `await import()`, never
// from the title entry: with its helpers it adds about 16.5 kB to the file that imports it, and the cold
// title has a budget of 35 kB (scripts/check-loading.js). The library itself is a separate chunk.
// Only `enabled: true` starts it. If `enabled` is anything else, or there is no player id, token function,
// Supabase address or key, it imports nothing, connects to nothing and emits nothing.
// `getAccessToken` is async and returns the player's current login token, or null when signed out. The
// library calls it on every connect, every room join and every 25 seconds, so it should answer from the
// session in memory and renew the token before it ends (a room closes after its last token runs out).
//
// The three kinds of private room (every one is joined with the player's login token):
//   live:world                    presence only: who is online, in which place and room, with which kit
//   live:place:<place>:<room>     broadcast only: moves and emotes of the captains in one numbered room
//   live:crew:<crew id>           broadcast only, listen only: the server says "something changed"
//
// Events it emits on the event bus (src/core/events.js). All payloads are plain data.
//   live_status_changed   { state }   connecting, live, slow, offline or off
//   live_presence_changed { place, room, shown: [{ id, name, kit, crewmate }], hiddenCount,
//                           crew: [{ id, name, place }] }   when who is shown, a count or a name changes.
//                           A name that is null is shown as "Captain". Names are read once per session.
//   live_peer_moved       { id, x, z, facing, moving, everyMs }   a shown captain sent a valid position
//   live_peer_emoted      { id, emote }                           a shown captain sent a valid emote
//   live_crew_updated     { kind, data }                          the server sent a crew event
//
// Used by: the game (once it is wired in), the screens adapter that listens to the events, and
// tests/realtime.test.js.
import { emit as busEmit } from '../core/events.js';
import { START_DELAY_MS, crewTopic, describeError, isPlayerId } from '../net/live-rules.js';
import { createPlaces } from '../net/live-places.js';
import { createRooms } from '../net/live-rooms.js';
import { createSender } from '../net/live-sender.js';
import { createView } from '../net/live-view.js';

// What the module hands back when it is switched off: every method does nothing.
const idleController = () => ({ setPlace() {}, update() {}, emote: () => false, setCrew() {}, setKit() {}, stop() {} });

export function startRealtime({
  enabled, playerId, getAccessToken, kit = null, crew = null,
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
  publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  emit = busEmit, createClient = null, random = Math.random, now = () => performance.now(),
} = {}) {
  if (enabled !== true || !isPlayerId(playerId) || typeof getAccessToken !== 'function' || !supabaseUrl || !publishableKey) {
    return idleController();
  }

  // ---- what we know ----
  const timers = new Set(); // every timer we started, so that stop() can clear them all
  let stopped = false;
  let state = 'off'; // the connection: connecting, live, slow, offline or off
  let client = null;
  let firstToken = null; // the token we hold before the library asks for one
  let lastGoodToken = null;
  let crewRoom = null, crewIds = new Set(), wantedCrewTopic = null; // the crew room, and the other members of our crew

  function later(run, ms) {
    const id = setTimeout(() => { timers.delete(id); run(); }, ms);
    timers.add(id);
    return id;
  }

  function cancel(id) {
    if (id === null || id === undefined) return;
    clearTimeout(id);
    timers.delete(id);
  }

  function notify(event) {
    if (stopped && event.type !== 'live_status_changed') return;
    try {
      emit(event);
    } catch (error) {
      console.warn(`Live presence: a listener of ${event.type} failed (${describeError(error)}).`);
    }
  }

  function setState(next) {
    if (next === state) return;
    state = next;
    notify({ type: 'live_status_changed', state });
  }

  // ---- the parts (each one asks the others through these small functions) ----
  const rooms = createRooms({ getClient: () => client, isStopped: () => stopped, onSlowNotice: () => sender.turnOnSlow(), later, cancel, random, now });
  const sender = createSender({
    playerId, getRoom: () => places.room(), getOnline: () => places.online(), getPlace: () => places.here().place,
    isAnnounced: () => places.announced(),
    isSocketOpen: () => client?.realtime?.isConnected?.() !== false,
    onSlowChange: slow => { if (places.worldSubscribed()) setState(slow ? 'slow' : 'live'); },
    later, cancel, random, now,
  });
  const view = createView({
    getFacts: () => ({ peers: places.peers(), here: places.here(), crewIds }),
    getClient: () => client, isStopped: () => stopped, notify, onHeard: () => sender.hear(), now,
  });
  const places = createPlaces({ playerId, kit, rooms, sender, view, getCrewIds: () => crewIds, setState, later, random, now });

  // ---- the login token ----
  // The library asks for the token on connect, when a room is joined and every 25 seconds. It always
  // gets the newest one. If the session module has none any more, the player signed out: we give back
  // the last good token (so no room is sent a null) and stop everything.
  async function freshToken() {
    if (firstToken) {
      const token = firstToken;
      firstToken = null;
      return token;
    }
    try {
      const token = await getAccessToken();
      if (typeof token === 'string' && token) {
        lastGoodToken = token;
        return token;
      }
    } catch (error) {
      console.warn(`Live presence: the login token could not be renewed (${describeError(error)}).`);
      return lastGoodToken;
    }
    later(shutDown, 0); // not inside the library's own call
    return lastGoodToken;
  }

  // ---- the crew room: the server says "something changed" ----
  function applyCrew(next) {
    const memberIds = Array.isArray(next?.memberIds) ? next.memberIds : [];
    crewIds = new Set(memberIds.filter(id => isPlayerId(id) && id !== playerId));
    wantedCrewTopic = crewTopic(next?.id);
    reconcileCrewRoom();
    places.followCrewmate();
    view.refresh();
  }

  function reconcileCrewRoom() {
    if (!client || stopped || (crewRoom?.topic ?? null) === wantedCrewTopic) return;
    if (crewRoom) rooms.close(crewRoom);
    crewRoom = null;
    if (!wantedCrewTopic) return;
    crewRoom = rooms.open('crew', wantedCrewTopic, { private: true }, { // we only listen here, we never send
      wire: channel => channel.on('broadcast', { event: 'crew_event' }, message => channel === crewRoom?.channel && view.crewEvent(message?.payload)),
      refused: () => { crewRoom = null; }, // the rules said no: only a new setCrew() knocks again
    });
  }

  // ---- starting and stopping ----
  async function boot() {
    try {
      firstToken = await getAccessToken();
      if (stopped) return;
      if (typeof firstToken !== 'string' || !firstToken) { // not signed in
        firstToken = null;
        shutDown();
        return;
      }
      lastGoodToken = firstToken;
      const make = createClient ?? (await import('@supabase/supabase-js')).createClient; // loaded only when needed
      if (stopped) return;
      client = make(supabaseUrl, publishableKey, { accessToken: freshToken });
      places.openWorld();
      reconcileCrewRoom();
    } catch (error) {
      console.warn(`Live presence could not start (${describeError(error)}).`);
      shutDown();
    }
  }

  function shutDown() {
    if (stopped) return;
    stopped = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    try {
      if (client) Promise.resolve(client.removeAllChannels()).catch(() => {});
    } catch {
      // the connection is going away anyway
    }
    places.stop();
    crewRoom = null;
    setState('off');
  }

  applyCrew(crew);
  setState('connecting');
  later(boot, Math.floor(random() * START_DELAY_MS));

  return {
    setPlace(place) { if (!stopped) places.setPlace(place); },
    update(sample) { if (!stopped) sender.update(sample); },
    emote: id => !stopped && sender.emote(id),
    setCrew(next) { if (!stopped) applyCrew(next); },
    setKit(next) { if (!stopped) places.setKit(next); },
    stop: shutDown,
  };
}
