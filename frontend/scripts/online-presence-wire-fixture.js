// A fake endpoint for the installed Phoenix v2 client. It never opens a server socket.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const socketPattern = 'wss://placeholder.supabase.co/**';
const classify = topic => topic === 'phoenix' ? 'heartbeat' : topic === 'realtime:live:world' ? 'world'
  : topic.startsWith('realtime:live:place:') ? 'place' : topic.startsWith('realtime:live:crew:') ? 'crew' : 'other';

// Realtime 2.118's default protocol uses JSON arrays except outbound user broadcasts (binary kind 3).
// The fixture parses tokens only as discarded protocol fields; its ledger contains no raw frame/topic/ID.
export function decodePresenceFrame(raw) {
  if (typeof raw === 'string') {
    const data = JSON.parse(raw);
    assert.ok(Array.isArray(data) && data.length === 5, 'Phoenix v2 text frame has five fields');
    const [joinRef, ref, topic, event, payload] = data;
    return {joinRef, ref, topic, event, payload};
  }
  const data = Buffer.from(raw);
  assert.ok(data.length >= 7 && data[0] === 3 && data[6] === 1, 'Outbound broadcast uses v2 JSON binary kind 3');
  const sizes = [...data.subarray(1, 6)];
  let offset = 7;
  const fields = sizes.map(size => {
    assert.ok(offset + size <= data.length, 'Binary metadata stays within its frame');
    const value = data.subarray(offset, offset + size).toString('utf8'); offset += size; return value;
  });
  assert.ok(data.length - offset <= 8192, 'Recorded cosmetic payload stays bounded');
  const [joinRef, ref, topic, event] = fields;
  return {joinRef, ref, topic, event: 'broadcast', payload: {type: 'broadcast', event,
    payload: JSON.parse(data.subarray(offset).toString('utf8'))}};
}

export async function installPresenceWire(page, {playerId, peerIds = Array.from({length: 10}, () => randomUUID())} = {}) {
  const sockets = new Set(), channels = new Set(), records = [], failures = [];
  let sequence = 1, peers = [], place = null, room = 1, closed = false, lastPosition = null;
  const safeRecord = (event, topic, extra = {}) => records.push({event, roomKind: classify(topic), at: Date.now(), ...extra});
  const send = (channel, event, payload, ref = null) => {
    if (!closed && !channel.closed) channel.socket.send(JSON.stringify([channel.joinRef, ref, channel.topic, event, payload]));
  };
  const worldState = () => Object.fromEntries(peers.map(peer => [peer.id, {metas: [{
    phx_ref: peer.reference, v: 1, place: peer.place, room: peer.room, kit: peer.kit,
  }]}]));
  function sync() { for (const channel of channels) if (classify(channel.topic) === 'world') send(channel, 'presence_state', worldState()); }
  function seed({shown = 2, hidden = 0, currentPlace = place, currentRoom = room} = {}) {
    assert.ok(shown >= 0 && shown <= 8 && hidden >= 0 && shown + hidden <= peerIds.length);
    peers = peerIds.slice(0, shown + hidden).map((id, index) => ({id, reference: randomUUID(),
      place: currentPlace, room: index < shown ? currentRoom : currentRoom === 99 ? 98 : currentRoom + 1,
      kit: index % 2 ? 'witness' : 'stranger'}));
    sync();
  }
  const handler = socket => {
    if (closed) { void socket.close(); return; }
    sockets.add(socket);
    records.push({event: 'socket_opened', at: Date.now()});
    socket.onClose(() => {
      sockets.delete(socket);
      for (const channel of channels) if (channel.socket === socket) { channel.closed = true; channels.delete(channel); }
      records.push({event: 'socket_closed', at: Date.now()});
    });
    socket.onMessage(raw => {
      try {
        const frame = decodePresenceFrame(raw);
        const {topic, event, ref, joinRef, payload} = frame;
        const kind = classify(topic);
        if (event === 'phx_join') {
          assert.notEqual(kind, 'other', 'Only approved private A4 rooms are joined');
          assert.equal(payload?.config?.private, true, 'A4 joins private rooms');
          assert.ok(typeof payload?.access_token === 'string' && payload.access_token.length > 0,
            'The intercepted private join has a generated bearer');
          const channel = {socket, topic, joinRef: joinRef ?? ref, closed: false};
          channels.add(channel); safeRecord('join', topic);
          send(channel, 'phx_reply', {status: 'ok', response: {postgres_changes: []}}, ref);
          if (kind === 'world') send(channel, 'presence_state', worldState());
          if (kind === 'place') {
            const parts = topic.split(':'); place = parts[3]; room = Number(parts[4]);
            seed({shown: peers.filter(peer => peer.room === room).length || 2,
              hidden: peers.filter(peer => peer.room !== room).length});
          }
          return;
        }
        const channel = [...channels].find(candidate => candidate.socket === socket && candidate.topic === topic);
        if (event === 'heartbeat') {
          socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', {status: 'ok', response: {}}]));
          return;
        }
        if (event === 'phx_leave') {
          if (channel) {
            send(channel, 'phx_reply', {status: 'ok', response: {}}, ref);
            channel.closed = true; channels.delete(channel);
          }
          safeRecord('leave', topic); return;
        }
        if (event === 'access_token') { safeRecord('token_refresh', topic); return; }
        if (event === 'presence') {
          assert.equal(payload?.event, 'track');
          assert.equal(kind, 'world');
          const meta = payload.payload;
          assert.deepEqual(Object.keys(meta).sort(), ['kit', 'place', 'room', 'v'], 'Track metadata has no coordinates or name');
          safeRecord('track', topic, {place: meta.place, room: meta.room, kit: meta.kit});
          if (channel) send(channel, 'phx_reply', {status: 'ok', response: {}}, ref);
          return;
        }
        if (event === 'broadcast') {
          assert.equal(kind, 'place', 'The browser sends cosmetic broadcasts only to its place');
          const body = payload?.payload;
          assert.equal(body?.id, playerId, 'Outbound identity comes from the intercepted signed-in account');
          assert.equal(body?.v, 1);
          if (payload.event === 'position') {
            assert.deepEqual(Object.keys(body).sort(), ['everyMs', 'facing', 'id', 'moving', 'place', 'seq', 'v', 'x', 'z']);
            lastPosition = {x: body.x, z: body.z, facing: body.facing, moving: body.moving, place: body.place};
            safeRecord('position', topic, {...lastPosition, everyMs: body.everyMs, seq: body.seq});
          } else {
            assert.equal(payload.event, 'emote');
            assert.ok(['wave', 'cheer', 'point', 'lantern', 'shrug'].includes(body.emote));
            safeRecord('emote', topic, {emote: body.emote, seq: body.seq});
          }
          return;
        }
        assert.fail('Unexpected intercepted Realtime protocol event');
      } catch (error) { failures.push(error.name); }
    });
  };
  await page.routeWebSocket(socketPattern, handler);
  function broadcast(event, payload) {
    for (const channel of channels) if (classify(channel.topic) === 'place') send(channel, 'broadcast', {type: 'broadcast', event, payload});
  }
  return {
    records, failures, peerIds,
    get lastPosition() { return lastPosition && {...lastPosition}; },
    get connectionCount() { return sockets.size; },
    get activeRoomKinds() { return [...channels].map(channel => classify(channel.topic)); },
    seed,
    move(index, {x, z, facing = 'down', moving = true, everyMs = 500} = {}) {
      assert.ok(peers[index]);
      broadcast('position', {v: 1, id: peers[index].id, place, x, z, facing, moving, everyMs, seq: sequence++});
    },
    emote(index, emote = 'wave') {
      assert.ok(peers[index]); broadcast('emote', {v: 1, id: peers[index].id, emote, seq: sequence++});
    },
    crewEvent(kind, data = {}) {
      for (const channel of channels) if (classify(channel.topic) === 'crew') send(channel, 'broadcast',
        {type: 'broadcast', event: 'crew_event', payload: {v: 1, kind, data}});
    },
    // Explicit server refusal/offline paths stay on this intercepted route; reconnect remains observable.
    async disconnect() {
      for (const socket of [...sockets]) {
        sockets.delete(socket);
        for (const channel of channels) if (channel.socket === socket) { channel.closed = true; channels.delete(channel); }
        await socket.close({code: 1011, reason: 'Recorded interruption'});
      }
    },
    async dispose() { closed = true; for (const socket of [...sockets]) await socket.close(); sockets.clear(); channels.clear(); },
  };
}
