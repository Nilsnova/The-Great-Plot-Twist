// What the screens are told: which other captains are shown, what they are called, and the messages
// of theirs that pass the checks. Everything that comes in from other browsers or from the server goes
// through here, and only what is valid, small and from the right captain leaves as an event on the bus.
//
//   refresh()            work out who is shown and tell the screens if something changed
//   position(payload)    a position message from our place room
//   emote(payload)       an emote message from our place room
//   crewEvent(payload)   an event of the server from our crew room
//   forgetGone()         forget the last message of captains who left the world
//
// Names come from the table profiles, never from another browser (decision D003): one read for up to 50
// ids, kept for the whole session. A captain that the server renames keeps the old name until the page is
// loaded again. A name that is null is shown as "Captain".
//
// Every check that fails drops the message without a word. The sender must be one of the captains we
// show, so it is in our place and room by the world's presence, and each captain is limited to one
// position every 0.4 seconds and one emote every 2 seconds.
//
// `getFacts()` gives { peers, here, crewIds } as the places module knows them. The events and their
// payloads are described in the header of src/online/realtime.js.
//
// Used by: src/net/live-places.js, src/online/realtime.js and tests/realtime.test.js.
import {
  MIN_EMOTE_GAP_MS, MIN_EXTRA_GAP_MS, MIN_POSITION_GAP_MS, NAME_BATCH, NAME_RETRY_MS, describeError, isClassPlace,
  isPrivatePlace, pickShown, readCrewEvent, readEmote, readExtra, readPosition, shownLimit,
} from './live-rules.js';

export function createView({ getFacts, getClient, isStopped, notify, onHeard, now }) {
  const names = new Map(); // captain id -> display name (null if the table has none)
  const asked = new Map(); // captain id -> when we asked for the name
  const lastSeen = new Map(); // captain id -> { seq, position, emote }: the last message we accepted
  let shownIds = new Set(); // the ones we draw
  let lastView = JSON.stringify({ place: null, room: null, shown: [], hiddenCount: 0, crew: [] }); // nothing to show yet

  function build() {
    const { peers, here, crewIds } = getFacts();
    const inPlace = [];
    for (const [id, peer] of peers) if (here.place && !isPrivatePlace(here.place) && peer.place === here.place) inPlace.push(id);
    const inRoom = here.room === null ? [] : inPlace.filter(id => peers.get(id).room === here.room);
    const picked = pickShown({ peerIds: inRoom, placeCount: inPlace.length, crewIds: [...crewIds], max: shownLimit(here.place) });
    const nameOf = id => names.get(id) ?? null;
    const shown = picked.shownIds.map(id => ({ id, name: nameOf(id), kit: peers.get(id).kit, crewmate: crewIds.has(id) }));
    const crewOnline = [...crewIds].filter(id => peers.has(id)).sort().map(id => ({ id, name: nameOf(id), place: peers.get(id).place }));
    return { place: here.place, room: here.room, shown, hiddenCount: picked.hiddenCount, crew: crewOnline };
  }

  function refresh() {
    const view = build();
    shownIds = new Set(view.shown.map(captain => captain.id));
    askNames([...new Set([...shownIds, ...view.crew.map(member => member.id)])]);
    const text = JSON.stringify(view);
    if (text === lastView) return;
    lastView = text;
    notify({ type: 'live_presence_changed', ...view });
  }

  // One read for up to 50 ids, and each id is asked for once (again after 30 seconds if the read failed).
  function askNames(ids) {
    const missing = ids.filter(id => !names.has(id) && now() - (asked.get(id) ?? -Infinity) >= NAME_RETRY_MS);
    for (let start = 0; start < missing.length; start += NAME_BATCH) {
      const batch = missing.slice(start, start + NAME_BATCH);
      for (const id of batch) asked.set(id, now());
      readNames(batch);
    }
  }

  async function readNames(ids) {
    const client = getClient();
    if (!client) return;
    try {
      const { data, error } = await client.from('profiles').select('id, display_name').in('id', ids);
      if (error) throw new Error(error.message || 'the read failed');
      const found = new Map((data ?? []).map(row => [row.id, row.display_name]));
      for (const id of ids) {
        const name = found.get(id);
        names.set(id, typeof name === 'string' && name.trim() ? name.slice(0, 24) : null);
      }
    } catch (error) {
      console.warn(`Live presence: captain names could not be read (${describeError(error)}).`);
      return;
    }
    if (!isStopped()) refresh();
  }

  function accept(id, seq, kind, minGapMs) {
    const record = lastSeen.get(id) ?? { seq: -1, position: -Infinity, emote: -Infinity };
    record[kind] ??= -Infinity;
    if (seq <= record.seq || now() - record[kind] < minGapMs) return false;
    record.seq = seq;
    record[kind] = now();
    lastSeen.set(id, record);
    return true;
  }

  function position(payload) {
    onHeard();
    const data = readPosition(payload, getFacts().here.place);
    if (!data || !shownIds.has(data.id) || !accept(data.id, data.seq, 'position', MIN_POSITION_GAP_MS)) return;
    notify({ type: 'live_peer_moved', id: data.id, x: data.x, z: data.z, facing: data.facing, moving: data.moving, everyMs: data.everyMs });
  }

  function emote(payload) {
    onHeard();
    const data = readEmote(payload);
    if (!data || !shownIds.has(data.id) || !accept(data.id, data.seq, 'emote', MIN_EMOTE_GAP_MS)) return;
    notify({ type: 'live_peer_emoted', id: data.id, emote: data.emote });
  }

  // An extra of the class harbor (a lamp state or a duel invitation). The sender must be in our room by
  // the world's presence (shown or not), and is limited to one of each kind every 0.8 seconds.
  function extra(event, payload) {
    onHeard();
    const { peers, here } = getFacts();
    const data = readExtra(event, payload);
    if (!data || !isClassPlace(here.place) || here.room === null) return;
    const peer = peers.get(data.id);
    if (!peer || peer.place !== here.place || peer.room !== here.room) return;
    if (!accept(data.id, data.seq, `extra_${event}`, MIN_EXTRA_GAP_MS)) return;
    notify({ type: 'live_peer_extra', id: data.id, event, data: data.data });
  }

  function crewEvent(payload) {
    const event = readCrewEvent(payload);
    if (event) notify({ type: 'live_crew_updated', kind: event.kind, data: event.data });
  }

  function forgetGone() {
    const { peers } = getFacts();
    for (const id of lastSeen.keys()) if (!peers.has(id)) lastSeen.delete(id);
  }

  return { refresh, position, emote, extra, crewEvent, forgetGone };
}
