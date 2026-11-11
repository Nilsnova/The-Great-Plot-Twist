// Where everybody is, and which room we are in. It owns the world room (presence: who is online, in
// which place and room, with which kit), our place and numbered room, and what we announce about
// ourselves. One presence update per trip: we say nothing until the game has told us a place once,
// and then announce the place together with its room, once the room is joined.
//
// The world room is the only place where everybody can be seen. From each presence sync this file
// works out the other captains (`peers`), how many are online, which of them are in our room, and
// whether a crewmate sits in a lower room (then we move down). It hands the rest on to the sender
// (replies to newcomers), the view (who is shown) and the connection state.
//
//   openWorld()          join the world room
//   setPlace(place)      the game says where we are (a place id, or null at sea)
//   setKit(kit)          our kit changed
//   followCrewmate()     the crew changed: move to a crewmate's room if it is lower
//   peers(), online(), here(), room(), worldSubscribed(), announced()   what we know
//   stop()               forget the rooms (the connection is going away)
//
// Our announcement is at most one every 1.5 seconds, and the first one after every join of the world
// room waits a random time up to 10 seconds, so a class that opens the game together does not announce
// itself all at once (see TRACK_JITTER_MS in src/net/live-rules.js). The others ignore the messages of a
// captain they do not know, so the sender keeps quiet until the announcement of our place and room
// has been made (announced()), and is asked to send again right after it.
//
// Used by: src/online/realtime.js and tests/realtime.test.js.
import {
  EXTRA_EVENTS, PROTOCOL_VERSION, TRACK_GAP_MS, WAVE_EVENTS, WORLD_TOPIC,
  chooseRoom, isClassPlace, isWavePlace, isKit, isPlaceId, isPrivatePlace, placeTopic, readWorld, roomsOf, roomToMoveTo, trackJitterMs,
} from './live-rules.js';

// classHarbor: true when the player came for the class harbor (G29); the first announcement then waits
// a shorter random time (CLASS_TRACK_JITTER_MS instead of TRACK_JITTER_MS).
export function createPlaces({ playerId, kit, rooms, sender, view, getCrewIds, setState, later, random, now, classHarbor = false }) {
  let world = null, placeRoom = null; // the rooms, made by rooms.open()
  let worldReady = false; // the first presence sync of the world room has come
  let wantedPlace; // the place the game asked for (undefined until it first says where we are)
  let activePlace; // the place we are working on
  let wantedKit = isKit(kit) ? kit : null;
  // Where we say we are. `settled` is false while we still wait for a room, so that presence is
  // told once per trip, when the room is joined, and not before.
  let here = { place: null, room: null, settled: false };
  let peers = new Map(), online = 0; // the world: other captains by id, and how many are online
  let trackedJson = null, lastTrackAt = -Infinity, trackNotBefore = 0, trackTimer = null;
  let announcedAs = null; // the place and room that the world has been told about, or null

  // ---- the world room: who is online, and where ----
  function openWorld() {
    const config = { private: true, presence: { key: playerId, enabled: true } };
    world = rooms.open('world', WORLD_TOPIC, config, {
      wire: channel => channel.on('presence', { event: 'sync' }, () => onWorldSync(channel)),
      joining: () => setState('connecting'),
      subscribed: () => {
        trackedJson = null; // a new room does not know us yet
        announcedAs = null;
        trackNotBefore = now() + trackJitterMs(classHarbor, random);
        setState(sender.isSlow() ? 'slow' : 'live');
        scheduleTrack();
      },
      lost: () => {
        worldReady = false;
        announcedAs = null;
        setWorld(new Map(), 0);
        setState('offline');
      },
      refused: () => setState('offline'),
    });
  }

  function onWorldSync(channel) {
    if (!world || channel !== world.channel) return;
    const state = readWorld(channel.presenceState(), playerId);
    setWorld(state.peers, state.online);
    if (!worldReady) {
      worldReady = true;
      reconcile();
    }
  }

  function setWorld(nextPeers, nextOnline) {
    peers = nextPeers;
    online = nextOnline;
    view.forgetGone();
    followCrewmate();
    sender.noteMembers(idsHere());
    view.refresh();
    sender.pump();
  }

  // Say where we are, but at most once every 1.5 seconds. Changes in that time go out together,
  // because the update is made when the timer runs, from what is true then.
  function scheduleTrack() {
    if (trackTimer) return;
    trackTimer = later(runTrack, Math.max(0, lastTrackAt + TRACK_GAP_MS - now(), trackNotBefore - now()));
  }

  function runTrack() {
    trackTimer = null;
    if (!worldReady || !here.settled || !world?.subscribed) return; // not yet: placeJoined() or the sync asks again
    const meta = { v: PROTOCOL_VERSION, place: here.place, room: here.room, kit: wantedKit };
    const json = JSON.stringify(meta);
    if (json === trackedJson) return;
    trackedJson = json;
    announcedAs = { place: here.place, room: here.room };
    lastTrackAt = now();
    Promise.resolve(world.channel.track(meta)).then(() => sender.pump(), () => {}); // send what waited for this
  }

  // True once the world has been told the place and room that we are in now.
  function announced() {
    return announcedAs !== null && announcedAs.place === here.place && announcedAs.room === here.room;
  }

  // ---- places and place rooms ----
  function setPlace(place) {
    wantedPlace = isPlaceId(place) ? place : null;
    reconcile();
  }

  function reconcile() {
    if (!worldReady || wantedPlace === undefined) return;
    if (activePlace !== wantedPlace) {
      switchPlace(wantedPlace);
      view.refresh();
    }
    scheduleTrack();
  }

  function switchPlace(place) {
    activePlace = place;
    leavePlaceRoom();
    if (!place || isPrivatePlace(place)) { // at sea or at home: no room, only presence
      here = { place, room: null, settled: true };
      return;
    }
    here = { place, room: null, settled: false };
    enterRoom(chooseRoom({ ...roomsOf(peers, place, getCrewIds()), online, place }));
  }

  function enterRoom(number) {
    leavePlaceRoom();
    here = { place: here.place, room: null, settled: false };
    if (number === null) { // all rooms are full: we are here, without a room
      here.settled = true;
      return;
    }
    placeRoom = rooms.open('place', placeTopic(here.place, number), { private: true }, {
      wire: channel => {
        channel.on('broadcast', { event: 'position' }, message => channel === placeRoom?.channel && view.position(message?.payload));
        channel.on('broadcast', { event: 'emote' }, message => channel === placeRoom?.channel && view.emote(message?.payload));
        // The class harbor's extras (lamp states, duel invitations) exist only in that room.
        if (isClassPlace(here.place)) for (const event of EXTRA_EVENTS) {
          channel.on('broadcast', { event }, message => channel === placeRoom?.channel && view.extra(event, message?.payload));
        }
        // A wave room (an island's isle_<code> or pirate_point): the wave's shots, repairs, start and lamps.
        if (isWavePlace(here.place)) for (const event of WAVE_EVENTS) {
          channel.on('broadcast', { event }, message => channel === placeRoom?.channel && view.wave(event, message?.payload));
        }
      },
      subscribed: () => placeJoined(number),
      refused: () => { // we may not join: say the place only
        here = { place: here.place, room: null, settled: true };
        scheduleTrack();
        view.refresh();
      },
    });
  }

  function placeJoined(number) {
    here = { place: here.place, room: number, settled: true };
    sender.joined(idsHere());
    scheduleTrack();
    view.refresh();
    sender.pump();
  }

  function leavePlaceRoom() {
    if (placeRoom) rooms.close(placeRoom);
    placeRoom = null;
    sender.reset();
  }

  function idsHere() {
    const ids = new Set();
    if (here.room === null) return ids;
    for (const [id, peer] of peers) if (peer.place === here.place && peer.room === here.room) ids.add(id);
    return ids;
  }

  // Two crewmates who arrived at the same moment may sit in different rooms. The one in the higher room moves down.
  function followCrewmate() {
    if (!placeRoom || here.room === null || !here.settled || isClassPlace(here.place) || isWavePlace(here.place)) return;
    const lower = roomToMoveTo(here.room, roomsOf(peers, here.place, getCrewIds()).crewmateRooms);
    if (lower !== null) enterRoom(lower);
  }

  function setKit(next) {
    wantedKit = isKit(next) ? next : null;
    scheduleTrack();
  }

  function stop() {
    world = placeRoom = null;
  }

  return {
    openWorld, setPlace, setKit, followCrewmate, stop,
    peers: () => peers, online: () => online, here: () => here, room: () => placeRoom,
    worldSubscribed: () => Boolean(world?.subscribed), announced,
  };
}
