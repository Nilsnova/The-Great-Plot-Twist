// Live presence with the REAL supabase-js library, talking to a pretend Realtime server. The fakes in
// tests/realtime-fakes.js are our idea of what the library does. This file checks that idea: the real
// library creates the rooms, sends the login token and the private flag, builds the presence state,
// delivers broadcasts and reports a refused join, all as realtime.js expects. There is no network: the
// library gets a fake WebSocket instead of a real one, and a few lines of pretend server answer it. The
// library's one other way out, fetch, is a fake too: it answers the read of captain names (the table
// profiles) with an empty list, and anything else it is asked for is an error. The global fetch is
// blocked as well, so a path that skips our fake would fail loudly instead of reaching the internet.
//
// The pretend server speaks the plain-text form of the Realtime protocol (version 1.0.0). The library's
// default is a binary form for broadcasts; that is its own business and not what we are checking.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRealtime } from '../src/online/realtime.js';
import { playerId, worldOf } from './realtime-fakes.js';

const ME = playerId(1);
const FRIEND = playerId(2);
const HARBOR = 'saltreach_harbor';
const CREW_ID = '11111111-1111-4111-8111-111111111111';
const URL = 'https://example.supabase.co';
const KEY = 'sb_publishable_not_a_real_key';

// The state of one pretend server, and the fake WebSocket that talks to it.
let server;
class FakeSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    server.sockets.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }

  send(text) {
    server.receive(this, JSON.parse(text));
  }

  close(code, reason) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

function makeServer() {
  return {
    sockets: [],
    joins: [], // every phx_join: { topic, payload }
    pushes: [], // everything else a client pushed: { topic, event, payload }
    refused: new Map(), // topic -> the reason a join is refused with
    presence: {}, // the raw presence state, by topic
    deliver(topic, event, payload) { // push a message to the client, as the server does
      const socket = this.sockets.at(-1);
      socket.onmessage({ data: JSON.stringify({ topic, event, payload, ref: null, join_ref: this.joinRefs[topic] ?? null }) });
    },
    joinRefs: {},
    receive(socket, message) {
      const { topic, event, payload, ref, join_ref: joinRef } = message;
      const reply = response => socket.onmessage({ data: JSON.stringify({ topic, event: 'phx_reply', payload: response, ref, join_ref: joinRef }) });
      if (event === 'heartbeat') return reply({ status: 'ok', response: {} });
      if (event === 'phx_leave') return reply({ status: 'ok', response: {} });
      if (event !== 'phx_join') {
        this.pushes.push({ topic, event, payload });
        return undefined;
      }
      this.joins.push({ topic, payload });
      this.joinRefs[topic] = joinRef;
      if (this.refused.has(topic)) return reply({ status: 'error', response: { reason: this.refused.get(topic) } });
      reply({ status: 'ok', response: {} });
      // A room with presence turned on is sent the state of the room right after the join.
      if (payload.config?.presence?.enabled) setTimeout(() => this.deliver(topic, 'presence_state', this.presence[topic] ?? {}), 0);
      return undefined;
    },
  };
}

// The raw form of presence on the wire: { key: { metas: [{ phx_ref, ...what the player tracked }] } }
const raw = people => Object.fromEntries(Object.entries(worldOf(people)).map(([id, [meta]]) => [id, { metas: [{ phx_ref: '1', ...meta }] }]));

// Every address that the library asked fetch for. The only read of a table is the names of captains.
let fetched;
const isProfilesRead = url => url.includes('/rest/v1/profiles');
async function fakeFetch(input) {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  fetched.push(url);
  if (!isProfilesRead(url)) throw new Error(`No network in tests, but the library asked for ${url}`);
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  server = makeServer();
  fetched = [];
  vi.stubGlobal('fetch', () => { throw new Error('No network in tests: the global fetch was used.'); });
});
afterEach(() => {
  expect(fetched.filter(url => !isProfilesRead(url))).toEqual([]);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Start the module with the real library and a fake WebSocket.
async function startWithRealLibrary(over = {}) {
  const { createClient } = await import('@supabase/supabase-js');
  const events = [];
  const live = startRealtime({
    enabled: true,
    playerId: ME,
    getAccessToken: async () => 'token-for-tests',
    supabaseUrl: URL,
    publishableKey: KEY,
    emit: event => events.push(event),
    createClient: (url, key, options) => createClient(url, key, {
      ...options, global: { fetch: fakeFetch }, realtime: { transport: FakeSocket, vsn: '1.0.0' },
    }),
    random: () => 0,
    ...over,
  });
  return { live, events };
}

const waitFor = assertion => vi.waitFor(assertion, { timeout: 4000, interval: 10 });
const topics = () => server.joins.map(join => join.topic);

describe('the real library, with a pretend server', () => {
  it('joins the private rooms with the token, announces itself, sends positions and hears the others', async () => {
    server.presence['realtime:live:world'] = raw({ [FRIEND]: [HARBOR, 1] });
    const { live, events } = await startWithRealLibrary({ crew: { id: CREW_ID, memberIds: [ME, FRIEND] } });
    live.setPlace(HARBOR);

    // The world room and the crew room are joined as private rooms, with the login token.
    await waitFor(() => expect(topics()).toContain('realtime:live:world'));
    const world = server.joins.find(join => join.topic === 'realtime:live:world');
    expect(world.payload.config.private).toBe(true);
    expect(world.payload.config.presence).toMatchObject({ key: ME, enabled: true });
    expect(world.payload.access_token).toBe('token-for-tests');
    expect(server.sockets[0].url).toContain('apikey=' + KEY);
    expect(server.sockets[0].url).not.toContain('token-for-tests');
    await waitFor(() => expect(topics()).toContain(`realtime:live:crew:${CREW_ID}`));
    expect(server.joins.find(join => join.topic === `realtime:live:crew:${CREW_ID}`).payload.config.private).toBe(true);

    // Our friend is in room 1 of the harbor, and a friend is a reason to go there. The room is private.
    await waitFor(() => expect(topics()).toContain('realtime:live:place:saltreach_harbor:1'));
    const room = server.joins.find(join => join.topic === 'realtime:live:place:saltreach_harbor:1');
    expect(room.payload.config.private).toBe(true);
    expect(room.payload.access_token).toBe('token-for-tests');

    // Once the room is joined, we tell the world where we are, and only that.
    await waitFor(() => expect(server.pushes.find(push => push.event === 'presence')).toBeDefined());
    const track = server.pushes.find(push => push.event === 'presence' && push.topic === 'realtime:live:world');
    expect(track.payload).toEqual({ type: 'presence', event: 'track', payload: { v: 1, place: HARBOR, room: 1, kit: null } });

    // The world shows our friend in our room, so we see them.
    await waitFor(() => expect(events.filter(event => event.type === 'live_presence_changed').at(-1)?.shown).toHaveLength(1));
    expect(events.filter(event => event.type === 'live_presence_changed').at(-1).shown[0]).toMatchObject({ id: FRIEND, crewmate: true });
    expect(events.map(event => event.state).filter(Boolean)).toEqual(['connecting', 'live']);

    // We walk: a position goes into the room as a broadcast, as one small message.
    live.update({ x: 3, z: 4, facing: 'left', moving: true });
    await waitFor(() => expect(server.pushes.find(push => push.event === 'broadcast')).toBeDefined());
    const sent = server.pushes.find(push => push.event === 'broadcast');
    expect(sent.topic).toBe('realtime:live:place:saltreach_harbor:1');
    expect(sent.payload).toMatchObject({ type: 'broadcast', event: 'position' });
    expect(sent.payload.payload).toMatchObject({ v: 1, id: ME, place: HARBOR, x: 3, z: 4, facing: 'left', moving: true, everyMs: 500 });

    // Our friend moves: the server delivers it to the room, and the screens are told.
    server.deliver('realtime:live:place:saltreach_harbor:1', 'broadcast', {
      type: 'broadcast', event: 'position',
      payload: { v: 1, id: FRIEND, place: HARBOR, x: 8, z: -2, facing: 'up', moving: true, seq: 1762300000001, everyMs: 500 },
    });
    await waitFor(() => expect(events.find(event => event.type === 'live_peer_moved')).toBeDefined());
    expect(events.find(event => event.type === 'live_peer_moved')).toEqual({ type: 'live_peer_moved', id: FRIEND, x: 8, z: -2, facing: 'up', moving: true, everyMs: 500 });

    // The server tells the crew that something changed.
    server.deliver(`realtime:live:crew:${CREW_ID}`, 'broadcast', { type: 'broadcast', event: 'crew_event', payload: { v: 1, kind: 'board_changed', data: { version: 4 } } });
    await waitFor(() => expect(events.find(event => event.type === 'live_crew_updated')).toBeDefined());
    expect(events.find(event => event.type === 'live_crew_updated')).toEqual({ type: 'live_crew_updated', kind: 'board_changed', data: { version: 4 } });

    // Nothing was ever pushed into the crew room by us.
    expect(server.pushes.filter(push => push.topic === `realtime:live:crew:${CREW_ID}`)).toEqual([]);

    // The name of our crewmate was read from the table profiles, through the fake fetch: that is all it fetched.
    expect(fetched).toHaveLength(1);
    expect(decodeURIComponent(fetched[0])).toBe(`${URL}/rest/v1/profiles?select=id,display_name&id=in.(${FRIEND})`);

    live.stop();
    await waitFor(() => expect(events.at(-1)).toEqual({ type: 'live_status_changed', state: 'off' }));
  });

  it('slows down and waits before it joins again when the server says too many messages and closes the room', async () => {
    const { live, events } = await startWithRealLibrary();
    live.setPlace(null);
    await waitFor(() => expect(events.map(event => event.state).filter(Boolean)).toEqual(['connecting', 'live']));

    // Just before it closes a room for sending too much, Supabase sends a `system` message.
    server.deliver('realtime:live:world', 'system', { message: 'Too many messages per second', status: 'error', extension: 'system', channel: 'live:world' });
    server.deliver('realtime:live:world', 'phx_error', {});

    await waitFor(() => expect(events.map(event => event.state).filter(Boolean)).toEqual(['connecting', 'live', 'slow', 'offline']));
    await new Promise(resolve => setTimeout(resolve, 1300)); // an ordinary retry would be due after 1 second
    expect(topics().filter(topic => topic === 'realtime:live:world')).toHaveLength(1); // but it waits at least 10 seconds

    live.stop();
  });

  it('gives up on a room the server refuses as unauthorized, and reports offline when it is the world room', async () => {
    const refusal = 'Unauthorized: You do not have permissions to read from this Channel topic: ';
    server.refused.set(`realtime:live:crew:${CREW_ID}`, refusal + `live:crew:${CREW_ID}`);
    const { live, events } = await startWithRealLibrary({ crew: { id: CREW_ID, memberIds: [ME] } });
    live.setPlace(null);

    await waitFor(() => expect(topics()).toContain(`realtime:live:crew:${CREW_ID}`));
    await waitFor(() => expect(events.map(event => event.state).filter(Boolean)).toEqual(['connecting', 'live']));
    await new Promise(resolve => setTimeout(resolve, 1300)); // longer than the 1 second a retry would wait
    expect(topics().filter(topic => topic === `realtime:live:crew:${CREW_ID}`)).toHaveLength(1); // it does not knock again

    live.stop();
  });

  it('reports offline when the world room itself is refused', async () => {
    server.refused.set('realtime:live:world', 'Unauthorized: You do not have permissions to read from this Channel topic: live:world');
    const { live, events } = await startWithRealLibrary();
    live.setPlace(null);

    await waitFor(() => expect(events.map(event => event.state).filter(Boolean)).toEqual(['connecting', 'offline']));
    await new Promise(resolve => setTimeout(resolve, 1300)); // longer than the 1 second a retry would wait
    expect(topics().filter(topic => topic === 'realtime:live:world')).toHaveLength(1);

    live.stop();
  });
});
