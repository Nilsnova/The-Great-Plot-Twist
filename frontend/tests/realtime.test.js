// Live presence client: the rooms, the send allowance, what is accepted and what the screens are told.
// Fakes stand in for Supabase (tests/realtime-fakes.js) and fake timers stand in for waiting, so there is
// no network and no real time. Spec: specs/A4-live-presence.md. The pure rules have their own tests in
// tests/live-rules.test.js.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRealtime } from '../src/online/realtime.js';
import { createFakeClient, playerId, worldOf } from './realtime-fakes.js';

const ME = playerId(1);
const URL = 'https://example.supabase.co';
const KEY = 'test-publishable-key'; // a stand-in: the module never checks the key's form
const HARBOR = 'saltreach_harbor';
const WRECK = 'wreck_point';
const HARBOR_ROOM_1 = 'live:place:saltreach_harbor:1';
const CREW_ID = '11111111-1111-4111-8111-111111111111';
const CREW_TOPIC = `live:crew:${CREW_ID}`;
const STILL = { x: 5, z: 5, facing: 'down', moving: false };

let warn;
beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Let promises finish, and move the fake clock forward by `ms`.
const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const ofType = (ctx, type) => ctx.events.filter(event => event.type === type);
const states = ctx => ofType(ctx, 'live_status_changed').map(event => event.state);
const lastView = ctx => ofType(ctx, 'live_presence_changed').at(-1);
// Refuse a room as "Unauthorized" on its first join and on each of its three tries after (2, 5 and 8 s).
async function refuseEveryTry(ctx, topic, error) {
  for (let knock = 0; knock < 4; knock += 1) {
    ctx.client.open(topic).status('CHANNEL_ERROR', error);
    await settle(10000);
  }
}

// Start the module with fakes. `dice.value` is what random() answers: 0 means "do not wait".
function start(overrides = {}) {
  const { names, ...rest } = overrides;
  const client = createFakeClient({ names });
  const dice = { value: 0 };
  const events = [];
  const options = {
    enabled: true,
    playerId: ME,
    getAccessToken: vi.fn(async () => 'token-1'),
    supabaseUrl: URL,
    publishableKey: KEY,
    emit: event => events.push(event),
    createClient: vi.fn(() => client),
    random: () => dice.value,
    now: () => Date.now(),
    ...rest,
  };
  return { live: startRealtime(options), client, dice, events, options };
}

// Let the module start, join the world room, and give it its first presence. Returns the world room.
async function connect(ctx, people = {}) {
  await settle();
  const world = ctx.client.open('live:world');
  world.status('SUBSCRIBED');
  world.presence(worldOf(people));
  await settle();
  return world;
}

// The game says where we are, and the place room we get is joined. Returns that room.
async function arrive(ctx, place, number = 1) {
  ctx.live.setPlace(place);
  await settle();
  const room = ctx.client.open(`live:place:${place}:${number}`);
  room.status('SUBSCRIBED');
  await settle();
  return room;
}

// We are in Saltreach Harbor, room 1, with `count` other captains. Returns the world room and the place room.
async function inHarborWith(ctx, count = 1) {
  const people = Object.fromEntries(Array.from({ length: count }, (_, i) => [playerId(10 + i), [HARBOR, 1]]));
  ctx.live.setPlace(HARBOR);
  const world = await connect(ctx, people);
  const room = ctx.client.open(HARBOR_ROOM_1);
  room.status('SUBSCRIBED');
  await settle();
  return { world, room };
}

// A valid position message of captain `id`. `seq` goes up by one each time, like the real one.
let nextSeq = 1762300000000;
const position = (id, over = {}) => ({
  v: 1, id, place: HARBOR, x: 1.5, z: -2, facing: 'left', moving: true, seq: (nextSeq += 1), everyMs: 500, ...over,
});

// Play `frames` game frames, `frameMs` apart. `sample(i)` is the update of frame i (a walk to the right by default).
async function walk(ctx, frames, frameMs, sample = i => ({ x: i / 10, z: 0, facing: 'right', moving: true })) {
  for (let i = 0; i < frames; i += 1) {
    ctx.live.update(sample(i));
    await settle(frameMs);
  }
}

// Captain `id` sends `count` valid positions at once, like a flood (each one has its own seq).
function flood(room, id, count) {
  for (let i = 0; i < count; i += 1) room.broadcast('position', position(id));
}

// The room is sent each of the payloads, one after the other.
function sendAll(room, event, payloads) {
  for (const payload of payloads) room.broadcast(event, payload);
}

// A game of 30 where three captains in our room each send one update every 2 seconds, and we walk.
async function playCrowdedGame(ctx, room, seconds) {
  for (let second = 0; second < seconds; second += 1) {
    ctx.live.update({ x: second, z: 0, facing: 'right', moving: true });
    if (second % 2 === 0) sendAll(room, 'position', [2, 3, 4].map(n => position(playerId(n))));
    await settle(1000);
  }
}

// The game changes the place (or the crew) in every frame of 16 ms, for `frames` frames, going round `values`.
async function flip(ctx, method, frames, values) {
  for (let i = 0; i < frames; i += 1) {
    ctx.live[method](values[i % values.length]);
    await settle(16);
  }
}

// How many ms there were between the starts of the rooms, oldest first.
const gapsBetween = rooms => rooms.slice(1).map((room, i) => room.createdAt - rooms[i].createdAt);

// The world room fails with `failure`; it is joined again after `wait` ms, as room number `count` of that topic.
async function failWorldAndRejoin(ctx, failure, wait, count) {
  ctx.client.open('live:world').status(failure, new Error('the socket is gone'));
  expect(ctx.client.open('live:world')).toBeUndefined(); // removed at once, so the library does not retry by itself
  expect(states(ctx).at(-1)).toBe('offline');
  await settle(wait - 1);
  expect(ctx.client.all('live:world')).toHaveLength(count - 1);
  await settle(1);
  expect(ctx.client.all('live:world')).toHaveLength(count);
  expect(states(ctx).at(-1)).toBe('connecting');
}

describe('when it stays switched off', () => {
  it('does nothing when the flag is off', async () => {
    const ctx = start({ enabled: false });

    ctx.live.setPlace(HARBOR);
    ctx.live.update({ x: 1, z: 2, facing: 'down', moving: true });
    expect(ctx.live.emote('wave')).toBe(false);
    ctx.live.setCrew({ id: CREW_ID, memberIds: [ME] });
    ctx.live.setKit('lantern');
    await settle(60000);
    ctx.live.stop();

    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(ctx.options.getAccessToken).not.toHaveBeenCalled();
    expect(ctx.events).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['nothing', () => startRealtime()],
    ['only the flag', () => startRealtime({ enabled: true })], // the Supabase address and key are not set in the tests either
  ])('does nothing when it is called with %s', async (_label, make) => {
    const live = make();

    live.setPlace(HARBOR);
    live.update({ x: 1, z: 2, facing: 'down', moving: true });
    expect(live.emote('wave')).toBe(false);
    live.stop();
    await settle(60000);

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['the text "false"', 'false'],
    ['the number 1', 1],
    ['an object', {}],
  ])('does nothing when the flag is %s and not true', async (_label, enabled) => {
    const ctx = start({ enabled });

    await settle(60000);

    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(ctx.options.getAccessToken).not.toHaveBeenCalled();
    expect(ctx.events).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing when the player is not signed in', async () => {
    const ctx = start({ getAccessToken: vi.fn(async () => null) });

    await settle();

    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(states(ctx)).toEqual(['connecting', 'off']);
    expect(vi.getTimerCount()).toBe(0);
    ctx.live.setPlace(HARBOR);
    expect(ctx.live.emote('wave')).toBe(false);
  });

  it('reports off, with a warning, when the token cannot be read at all', async () => {
    const ctx = start({ getAccessToken: vi.fn(async () => { throw new Error('the session module is broken'); }) });

    await settle();

    expect(states(ctx)).toEqual(['connecting', 'off']);
    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each([
    ['address', { supabaseUrl: '' }],
    ['key', { publishableKey: '' }],
  ])('does nothing when the Supabase %s is missing', async (_label, missing) => {
    const ctx = start(missing);

    await settle(60000);

    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(ctx.options.getAccessToken).not.toHaveBeenCalled();
    expect(ctx.events).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['the token function', { getAccessToken: undefined }],
    ['the player id', { playerId: undefined }],
    ['a player id that is a uuid', { playerId: 'captain-one' }],
  ])('does nothing when %s is missing', async (_label, missing) => {
    const ctx = start(missing);

    await settle(60000);

    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(ctx.events).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('starting up and the login token', () => {
  it('creates one client with the publishable key and the token function, after at most 5 seconds', async () => {
    const ctx = start({ random: () => 0.9 }); // the first join waits a random time between 0 and 5 seconds: here 4.5

    await settle(4499);
    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(states(ctx)).toEqual(['connecting']);

    await settle(1);
    expect(ctx.options.createClient).toHaveBeenCalledOnce();
    const [url, key, options] = ctx.options.createClient.mock.calls[0];
    expect(url).toBe(URL);
    expect(key).toBe(KEY);
    expect(Object.keys(options)).toEqual(['accessToken']);
    expect(typeof options.accessToken).toBe('function');
  });

  it('never waits for 5 seconds or more, however the dice fall', async () => {
    const ctx = start({ random: () => 0.9999999 });

    await settle(4999);

    expect(ctx.options.createClient).toHaveBeenCalledOnce();
  });

  it('asks for a fresh token every time the library asks', async () => {
    let count = 0;
    const getAccessToken = vi.fn(async () => `token-${(count += 1)}`);
    const ctx = start({ getAccessToken });
    await settle();
    const { accessToken } = ctx.options.createClient.mock.calls[0][2];

    expect(await accessToken()).toBe('token-1'); // the one we checked when starting
    expect(await accessToken()).toBe('token-2');
    expect(await accessToken()).toBe('token-3');
    expect(getAccessToken).toHaveBeenCalledTimes(3);
  });

  it('gives the last good token when the token function fails, and keeps the token out of the warning', async () => {
    let count = 0;
    const getAccessToken = vi.fn(async () => `token-${(count += 1)}`);
    const ctx = start({ getAccessToken });
    await settle();
    const { accessToken } = ctx.options.createClient.mock.calls[0][2];
    expect(await accessToken()).toBe('token-1');
    expect(await accessToken()).toBe('token-2');

    getAccessToken.mockImplementationOnce(async () => { throw new Error('session module broke'); });
    expect(await accessToken()).toBe('token-2');
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('token-');
    expect(await accessToken()).toBe('token-3'); // and it asks again next time
    expect(states(ctx)).toEqual(['connecting']); // a hiccup does not stop anything
  });

  it('stops and reports off when the token disappears', async () => {
    const getAccessToken = vi.fn().mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2').mockResolvedValue(null);
    const ctx = start({ getAccessToken });
    ctx.live.setPlace(HARBOR);
    await connect(ctx);
    const { accessToken } = ctx.options.createClient.mock.calls[0][2];
    expect(await accessToken()).toBe('token-1');
    expect(await accessToken()).toBe('token-2');

    expect(await accessToken()).toBe('token-2'); // signed out: the last good token, so no room is sent null
    await settle();

    expect(states(ctx).at(-1)).toBe('off');
    expect(ctx.client.removeAllChannels).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(ctx.live.emote('wave')).toBe(false);
  });

  it('stops quietly when stop() comes before the module has started', async () => {
    const ctx = start();

    ctx.live.stop();
    await settle(10000);

    expect(states(ctx)).toEqual(['connecting', 'off']);
    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(ctx.options.getAccessToken).not.toHaveBeenCalled();
  });

  it('stops quietly when stop() comes while the token is still being asked for', async () => {
    let giveToken;
    const getAccessToken = vi.fn(() => new Promise(resolve => { giveToken = resolve; }));
    const ctx = start({ getAccessToken });
    await settle(); // the module has started and waits for the answer
    expect(getAccessToken).toHaveBeenCalledOnce();

    ctx.live.stop();
    giveToken('token-1'); // and the answer comes too late
    await settle(10000);

    expect(ctx.options.createClient).not.toHaveBeenCalled();
    expect(states(ctx)).toEqual(['connecting', 'off']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('survives a listener that throws', async () => {
    const ctx = start({ emit: () => { throw new Error('a screen listener broke'); } });
    ctx.live.setPlace(null);

    const world = await connect(ctx);

    expect(world.tracks).toHaveLength(1); // the module went on
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('live_status_changed');
  });
});

describe('the world room and the places', () => {
  it('joins the world room privately with the player id as presence key and tracks only v, place, room and kit', async () => {
    const ctx = start();
    ctx.live.setPlace(null); // the game says we are in no place yet

    const world = await connect(ctx);

    expect(world.topic).toBe('live:world');
    expect(world.config).toEqual({ private: true, presence: { key: ME, enabled: true } });
    expect(world.tracks).toEqual([{ v: 1, place: null, room: null, kit: null }]);
    expect(Object.keys(world.tracks[0])).toEqual(['v', 'place', 'room', 'kit']);
    expect(states(ctx)).toEqual(['connecting', 'live']);
    expect(ctx.client.openTopics()).toEqual(['live:world']);
  });

  it('says nothing about where we are until the game has said it once', async () => {
    const ctx = start();

    const world = await connect(ctx);
    await settle(10000);

    expect(world.tracks).toEqual([]);
    expect(ctx.client.openTopics()).toEqual(['live:world']);
  });

  it('joins a place room on arrival and leaves it on travel', async () => {
    const ctx = start();
    ctx.live.setPlace(HARBOR); // asked before the module has started: that is the usual order
    const world = await connect(ctx);
    const harbor = ctx.client.open(HARBOR_ROOM_1);
    harbor.status('SUBSCRIBED');
    await settle();

    expect(harbor.config).toEqual({ private: true });
    expect(ctx.client.openTopics()).toEqual(['live:world', HARBOR_ROOM_1]);
    expect(world.tracks).toEqual([{ v: 1, place: HARBOR, room: 1, kit: null }]); // once, with the place

    ctx.live.setPlace(null); // the boat leaves
    await settle();
    expect(harbor.removed).toBe(true);
    expect(ctx.client.openTopics()).toEqual(['live:world']);

    await settle(1000); // a place room is joined at most once a second
    await arrive(ctx, WRECK); // the boat arrives
    expect(ctx.client.openTopics()).toEqual(['live:world', 'live:place:wreck_point:1']);
    await settle(1500);
    // The stop at sea and the arrival fell into one window of 1.5 seconds: one update, not two.
    expect(world.tracks).toEqual([
      { v: 1, place: HARBOR, room: 1, kit: null },
      { v: 1, place: WRECK, room: 1, kit: null },
    ]);
    expect(ctx.client.all(HARBOR_ROOM_1)).toHaveLength(1);
  });

  it('tells the world about a place at sea, and about a change of kit, at most every 1.5 seconds', async () => {
    const ctx = start({ kit: 'lantern' });
    ctx.live.setPlace(null);
    const world = await connect(ctx);
    expect(world.tracks).toEqual([{ v: 1, place: null, room: null, kit: 'lantern' }]);

    ctx.live.setKit('compass');
    ctx.live.setKit('logbook');
    ctx.live.setKit('Not A Kit'); // refused: the kit becomes none
    await settle(1499);
    expect(world.tracks).toHaveLength(1);
    await settle(1);
    expect(world.tracks).toHaveLength(2);
    expect(world.tracks[1]).toEqual({ v: 1, place: null, room: null, kit: null });

    ctx.live.setKit('Not A Kit'); // the same again: nothing new to say
    ctx.live.setKit(null);
    await settle(5000);
    expect(world.tracks).toHaveLength(2);
  });

  it('opens no room on the home islet', async () => {
    const ctx = start();
    ctx.live.setPlace('home_islet');

    const world = await connect(ctx);
    await settle(5000);

    expect(ctx.client.openTopics()).toEqual(['live:world']);
    expect(world.tracks).toEqual([{ v: 1, place: 'home_islet', room: null, kit: null }]);
    expect(lastView(ctx)).toEqual({ type: 'live_presence_changed', place: 'home_islet', room: null, shown: [], hiddenCount: 0, crew: [] });
  });

  it('refuses a place that is not a place id, as if we were at sea', async () => {
    const ctx = start();
    ctx.live.setPlace('Not a place');

    const world = await connect(ctx);

    expect(world.tracks).toEqual([{ v: 1, place: null, room: null, kit: null }]);
    expect(ctx.client.openTopics()).toEqual(['live:world']);
  });

  it('takes a second room when the first is full, and rooms of 4 when 30 are online', async () => {
    const full = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [playerId(20 + i), [HARBOR, 1]]));
    const elsewhere = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [playerId(100 + i), [WRECK, 1]]));
    const quiet = start();
    quiet.live.setPlace(HARBOR);
    await connect(quiet, full); // 4 online: a room still holds 9
    expect(quiet.client.openTopics()).toEqual(['live:world', HARBOR_ROOM_1]);

    const busy = start();
    busy.live.setPlace(HARBOR);
    await connect(busy, { ...full, ...elsewhere }); // 30 online: a room holds 4, and room 1 has 4
    expect(busy.client.openTopics()).toEqual(['live:world', 'live:place:saltreach_harbor:2']);
  });

  it("moves to the crewmate's room when both arrive at once", async () => {
    const crewmate = playerId(2);
    const strangers = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [playerId(20 + i), [HARBOR, 1]]));
    const ctx = start({ crew: { id: CREW_ID, memberIds: [ME, crewmate] } });
    ctx.live.setPlace(HARBOR);
    const world = await connect(ctx, strangers); // room 1 holds 9 strangers: it is full
    const room2 = ctx.client.open('live:place:saltreach_harbor:2');
    expect(room2).toBeDefined();
    room2.status('SUBSCRIBED');
    await settle(1000); // a place room is joined at most once a second
    expect(world.tracks.at(-1)).toEqual({ v: 1, place: HARBOR, room: 2, kit: null });

    // Our crewmate arrived at the same moment and was let into room 1.
    world.presence(worldOf({ ...strangers, [ME]: [HARBOR, 2], [crewmate]: [HARBOR, 1] }));
    await settle();
    expect(room2.removed).toBe(true);
    const room1 = ctx.client.open(HARBOR_ROOM_1);
    expect(room1).toBeDefined();
    room1.status('SUBSCRIBED');
    await settle(1500);

    expect(world.tracks.at(-1)).toEqual({ v: 1, place: HARBOR, room: 1, kit: null });
    expect(ctx.client.openTopics()).toEqual(['live:world', CREW_TOPIC, HARBOR_ROOM_1]);

    // Room 2 is gone: what it still says is not heard, and what room 1 says is.
    room2.broadcast('position', position(crewmate));
    expect(ofType(ctx, 'live_peer_moved')).toEqual([]);
    room1.broadcast('position', position(crewmate));
    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(1);
  });

  it('goes to the room of a crewmate straight away, even if it is full, and stays where it is when the crewmate is in a higher room', async () => {
    const crewmate = playerId(2);
    const strangers = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [playerId(20 + i), [HARBOR, 1]]));
    const ctx = start({ crew: { id: CREW_ID, memberIds: [crewmate] } });
    ctx.live.setPlace(HARBOR);
    await connect(ctx, { ...strangers, [crewmate]: [HARBOR, 1] }); // the crewmate is in the full room 1
    expect(ctx.client.open(HARBOR_ROOM_1)).toBeDefined();
    const room1 = ctx.client.open(HARBOR_ROOM_1);
    room1.status('SUBSCRIBED');
    await settle();
    const world = ctx.client.open('live:world');

    world.presence(worldOf({ ...strangers, [ME]: [HARBOR, 1], [crewmate]: [HARBOR, 3] })); // they went up to room 3
    await settle();

    expect(room1.removed).toBe(false); // nobody moves up
    expect(ctx.client.openTopics()).toEqual(['live:world', CREW_TOPIC, HARBOR_ROOM_1]);
  });

  it('says the place without a room when it is refused a room', async () => {
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    const world = await connect(ctx);
    const harbor = ctx.client.open(HARBOR_ROOM_1);

    expect(harbor).toBeDefined();
    await refuseEveryTry(ctx, HARBOR_ROOM_1, new Error('Unauthorized: You do not have permissions to read from this Channel topic'));
    await settle(600000);

    expect(world.tracks).toEqual([{ v: 1, place: HARBOR, room: null, kit: null }]);
    expect(ctx.client.all(HARBOR_ROOM_1)).toHaveLength(4); // three more knocks, then no more
    expect(states(ctx).at(-1)).toBe('live'); // the world room itself is fine
  });
});

describe('the join allowance', () => {
  it('makes a new place room wait for its turn: one second after the last place room started to join', async () => {
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    await connect(ctx); // the harbor room starts to join now
    await settle(100);

    ctx.live.setPlace(WRECK);
    await settle(899); // 999 ms after the harbor room started
    expect(ctx.client.all('live:place:wreck_point:1')).toHaveLength(0);
    await settle(1);

    expect(ctx.client.all('live:place:wreck_point:1')).toHaveLength(1);
  });

  it('opens at most one place room a second when the place changes in every frame', async () => {
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    await connect(ctx);

    await flip(ctx, 'setPlace', 188, [WRECK, HARBOR]); // 3008 ms of flipping

    const placeRooms = ctx.client.rooms.filter(room => room.topic.startsWith('live:place:'));
    expect(placeRooms.length).toBeLessThanOrEqual(4);
    expect(Math.min(...gapsBetween(placeRooms))).toBeGreaterThanOrEqual(1000);
  });

  it('joins the place that was asked for last once the flipping stops', async () => {
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    await connect(ctx);
    await flip(ctx, 'setPlace', 31, [WRECK, HARBOR]); // 496 ms of flipping: the last frame asks for the wreck

    await settle(2000);

    expect(ctx.client.openTopics()).toEqual(['live:world', 'live:place:wreck_point:1']);
  });

  it('opens at most one crew room a second when the crew changes in every frame', async () => {
    const otherCrew = '22222222-2222-4222-8222-222222222222';
    const ctx = start();
    ctx.live.setPlace(null);
    await connect(ctx);

    await flip(ctx, 'setCrew', 188, [{ id: CREW_ID, memberIds: [] }, { id: otherCrew, memberIds: [] }]);

    const crewRooms = ctx.client.rooms.filter(room => room.topic.startsWith('live:crew:'));
    expect(crewRooms.length).toBeLessThanOrEqual(4);
    expect(Math.min(...gapsBetween(crewRooms))).toBeGreaterThanOrEqual(1000);
  });

  it('keeps the turns of the three kinds of room apart', async () => {
    const ctx = start({ crew: { id: CREW_ID, memberIds: [ME] } });
    ctx.live.setPlace(HARBOR);
    await connect(ctx, {}); // the world room, the crew room and the harbor room start to join together

    expect(ctx.client.openTopics()).toEqual(['live:world', CREW_TOPIC, HARBOR_ROOM_1]);
  });
});

describe('announcing ourselves', () => {
  it('waits a random time up to 10 seconds after the world room is joined, and not longer', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    await settle();
    ctx.dice.value = 0.5; // the first announcement waits 0.5 x 10 seconds
    const world = ctx.client.open('live:world');
    world.status('SUBSCRIBED');
    world.presence(worldOf({}));

    await settle(4999);
    expect(world.tracks).toEqual([]);
    await settle(1);

    expect(world.tracks).toEqual([{ v: 1, place: null, room: null, kit: null }]);
  });

  it('never waits for 10 seconds or more, however the dice fall', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    await settle();
    ctx.dice.value = 0.9999999;
    const world = ctx.client.open('live:world');
    world.status('SUBSCRIBED');
    world.presence(worldOf({}));

    await settle(9999);

    expect(world.tracks).toHaveLength(1);
  });

  it('waits again after the world room failed and was joined again, and later changes only wait 1.5 seconds', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    const first = await connect(ctx); // the dice say 0: announced at once
    expect(first.tracks).toHaveLength(1);
    ctx.dice.value = 0.5;
    first.status('CHANNEL_ERROR', new Error('the socket is gone'));
    await settle(3000); // the rejoin waits 1 s plus half of 2 s, and the new room is there

    const second = ctx.client.open('live:world');
    second.status('SUBSCRIBED');
    second.presence(worldOf({}));
    await settle(4999);
    expect(second.tracks).toEqual([]);
    await settle(1);
    expect(second.tracks).toHaveLength(1);

    ctx.live.setKit('compass'); // a later change
    await settle(1499);
    expect(second.tracks).toHaveLength(1);
    await settle(1);
    expect(second.tracks).toHaveLength(2);
  });
});

describe('sending', () => {
  it('keeps quiet until it has announced itself, and then sends its position, also when it stands still', async () => {
    const friend = playerId(10);
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    ctx.live.update(STILL); // we stand in the harbor
    await settle();
    ctx.dice.value = 0.5; // the first announcement waits 0.5 x 10 seconds
    const world = ctx.client.open('live:world');
    world.status('SUBSCRIBED');
    world.presence(worldOf({ [friend]: [HARBOR, 1] }));
    await settle();
    const room = ctx.client.open(HARBOR_ROOM_1);
    room.status('SUBSCRIBED');

    await settle(4999);
    expect(world.tracks).toEqual([]);
    expect(room.messages).toEqual([]); // the friend ignores a captain he does not know: nothing is sent yet
    await settle(1);

    expect(world.tracks).toEqual([{ v: 1, place: HARBOR, room: 1, kit: null }]);
    expect(room.positions).toHaveLength(1); // and now it is known, our position follows
    expect(room.positions[0]).toMatchObject({ id: ME, x: 5, z: 5, moving: false });
  });

  it('keeps quiet in a new room until the world has been told that we moved there', async () => {
    const friend = playerId(10);
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    await connect(ctx, { [friend]: [WRECK, 1] });
    ctx.client.open(HARBOR_ROOM_1).status('SUBSCRIBED');
    await settle(1000); // the harbor was announced at 0
    ctx.live.update(STILL);

    ctx.live.setPlace(WRECK); // 1000 ms later: the next announcement is due at 1500 ms
    await settle();
    const wreck = ctx.client.open('live:place:wreck_point:1');
    wreck.status('SUBSCRIBED');
    await settle(499);
    expect(wreck.messages).toEqual([]); // the world still thinks that we are in the harbor
    await settle(1);

    expect(ctx.client.open('live:world').tracks.at(-1)).toEqual({ v: 1, place: WRECK, room: 1, kit: null });
    expect(wreck.positions).toHaveLength(1);
  });

  it('keeps quiet while the world room is away, and until it has announced itself again', async () => {
    const friend = playerId(10);
    const ctx = start();
    const { world, room } = await inHarborWith(ctx, 1);
    ctx.live.update({ ...STILL, moving: true });
    await settle(2000);
    const before = room.messages.length;
    expect(before).toBeGreaterThan(0);

    world.status('CHANNEL_ERROR', new Error('the socket is gone'));
    ctx.dice.value = 0.5; // the rejoin waits 2 s, and the new announcement 5 s more
    await walk(ctx, 100, 100); // ten seconds of walking while the world room is away
    expect(room.messages).toHaveLength(before);

    const back = ctx.client.open('live:world');
    back.status('SUBSCRIBED');
    back.presence(worldOf({ [friend]: [HARBOR, 1] }));
    await settle(4999);
    expect(room.messages).toHaveLength(before); // joined again, but the world does not know us yet
    await settle(1);

    expect(back.tracks).toHaveLength(1);
    expect(room.messages.length).toBeGreaterThan(before);
  });

  it('never sends more than 2 updates a second', async () => {
    const ctx = start();
    const { room } = await inHarborWith(ctx);
    const began = Date.now();

    await walk(ctx, 187, 16); // a frame every 16 ms, for 2992 ms

    expect(room.positions).toHaveLength(6);
    expect(room.times.map(time => time - began)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    await settle(8); // 3000 ms: the next one is due
    expect(room.positions).toHaveLength(7);
  });

  it('sends the position as small numbers: v, id, place, x, z, facing, moving, seq and everyMs', async () => {
    const ctx = start();
    const { room } = await inHarborWith(ctx);

    ctx.live.update({ x: 1.23456, z: -7.6543, facing: 'left', moving: true });
    await settle(500);
    ctx.live.update({ x: 2, z: -7, facing: 'sideways', moving: true }); // an unknown facing keeps the last one

    const [first, second] = room.positions;
    expect(room.messages[0].type).toBe('broadcast');
    expect(Object.keys(first)).toEqual(['v', 'id', 'place', 'x', 'z', 'facing', 'moving', 'seq', 'everyMs']);
    expect(first).toMatchObject({ v: 1, id: ME, place: HARBOR, x: 1.23, z: -7.65, facing: 'left', moving: true, everyMs: 500 });
    expect(second.seq).toBe(first.seq + 1);
    expect(second.facing).toBe('left');
    expect(first.seq).toBeGreaterThan(1.7e12); // it starts at the time, so it keeps growing after a reload
  });

  it('sends nothing while standing still and one update when the captain stops', async () => {
    const ctx = start();
    const { room } = await inHarborWith(ctx);

    ctx.live.update(STILL); // the first sample: where we stand is sent once, because we just joined
    expect(room.positions).toHaveLength(1);
    await walk(ctx, 50, 100, () => STILL); // five seconds of standing still
    expect(room.positions).toHaveLength(1);

    await walk(ctx, 4, 100, i => ({ ...STILL, x: 5 + i, moving: true })); // walk for 0.4 seconds
    ctx.live.update({ ...STILL, x: 9, moving: false }); // and stop
    await settle(2000);

    expect(room.positions.slice(1).map(sent => sent.moving)).toEqual([true, false]);
    expect(room.positions.at(-1).x).toBe(9);
    await settle(10000);
    expect(room.positions).toHaveLength(3); // and nothing more
  });

  it('sends nothing when we are alone in the room', async () => {
    const ctx = start();
    const { room } = await inHarborWith(ctx, 0);

    await walk(ctx, 40, 100, i => ({ x: i, z: 0, facing: 'right', moving: true }));

    expect(room.messages).toEqual([]);
    expect(ctx.live.emote('wave')).toBe(false); // nobody could see it
  });

  it('slows down when the room and the game fill', async () => {
    const ctx = start();
    // 30 captains online: us, three in our room, 26 somewhere else.
    const elsewhere = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [playerId(100 + i), [WRECK, 1]]));
    const inRoom = Object.fromEntries([2, 3, 4].map(n => [playerId(n), [HARBOR, 1]]));
    ctx.live.setPlace(HARBOR);
    await connect(ctx, { [ME]: [null, null], ...inRoom, ...elsewhere });
    const room = ctx.client.open(HARBOR_ROOM_1);
    room.status('SUBSCRIBED');
    await settle();
    const began = Date.now();

    await walk(ctx, 624, 16); // 9984 ms of walking

    expect(room.positions.map(sent => sent.everyMs)).toEqual([2000, 2000, 2000, 2000, 2000]);
    expect(room.times.map(time => time - began)).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it('answers a newcomer with one position update', async () => {
    const ctx = start();
    const { world, room } = await inHarborWith(ctx);
    ctx.live.update(STILL);
    await settle(10000);
    expect(room.positions).toHaveLength(1);
    ctx.dice.value = 0.5; // an arrival is answered after 200 + 0.5 x 600 = 500 ms
    const here = { [playerId(10)]: [HARBOR, 1] };

    world.presence(worldOf({ ...here, [playerId(11)]: [HARBOR, 1], [playerId(12)]: [HARBOR, 1] })); // two arrive together
    await settle(499);
    expect(room.positions).toHaveLength(1);
    await settle(1);
    expect(room.positions).toHaveLength(2);
    expect(room.positions[1]).toMatchObject({ x: 5, z: 5, moving: false });

    await settle(10000);
    world.presence(worldOf({ ...here, [playerId(11)]: [HARBOR, 1], [playerId(12)]: [HARBOR, 1] })); // nothing new
    world.presence(worldOf({ ...here, [playerId(13)]: [HARBOR, 2], [playerId(14)]: [WRECK, 1] })); // others elsewhere
    await settle(5000);
    expect(room.positions).toHaveLength(2);
  });

  it('keeps to the allowance when something else wants to go out soon after a message', async () => {
    const ctx = start();
    const { world, room } = await inHarborWith(ctx);
    const began = Date.now();
    ctx.live.update(STILL); // the announcement goes out at 0, and nothing else is waiting
    await settle(50);

    world.presence(worldOf({ [playerId(10)]: [HARBOR, 1], [playerId(11)]: [HARBOR, 1] })); // a newcomer: answered after 200 ms
    await settle(400);
    expect(room.positions).toHaveLength(1); // 250 ms after the last message: too soon
    await settle(100);
    expect(room.positions).toHaveLength(2); // 500 ms after it
    expect(room.times.map(time => time - began)).toEqual([0, 500]);
  });

  it('turns on slow mode when the room is too busy, and after the server says too many messages', async () => {
    const busy = async () => {
      const ctx = start();
      const elsewhere = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [playerId(100 + i), [WRECK, 1]]));
      const inRoom = Object.fromEntries([2, 3, 4].map(n => [playerId(n), [HARBOR, 1]]));
      ctx.live.setPlace(HARBOR);
      const world = await connect(ctx, { [ME]: [null, null], ...inRoom, ...elsewhere });
      const room = ctx.client.open(HARBOR_ROOM_1);
      room.status('SUBSCRIBED');
      await settle();
      return { ctx, world, room, heardFrom: playerId(2) };
    };

    // Too busy: 60 messages in a second, with 30 captains online, is far over the limit.
    const { ctx, room, heardFrom } = await busy();
    expect(states(ctx).at(-1)).toBe('live');
    flood(room, heardFrom, 60);
    await settle(1000);
    expect(states(ctx).at(-1)).toBe('slow');

    ctx.live.update({ x: 1, z: 1, facing: 'down', moving: true });
    await settle(8000);
    expect(room.times.length).toBeGreaterThan(0);
    expect(room.positions.at(-1).everyMs).toBe(4000); // 2000 ms halved to a rate of 1 in 4000

    await settle(5 * 60 * 1000); // five calm minutes
    expect(states(ctx).at(-1)).toBe('live');
    expect(states(ctx).filter(state => state === 'slow')).toHaveLength(1);

    // The server says it: slow mode, and no rejoining for at least 10 seconds.
    const second = await busy();
    second.room.system({ message: 'Too many messages per second', status: 'error', extension: 'system', channel: HARBOR_ROOM_1 });
    expect(states(second.ctx).at(-1)).toBe('slow');
    second.room.status('CLOSED');
    expect(second.room.removed).toBe(true);
    await settle(9999);
    expect(second.ctx.client.all(HARBOR_ROOM_1)).toHaveLength(1);
    await settle(1);
    expect(second.ctx.client.all(HARBOR_ROOM_1)).toHaveLength(2);
  });

  it('does not slow down for the normal traffic of a crowded game', async () => {
    const ctx = start();
    const elsewhere = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [playerId(100 + i), [WRECK, 1]]));
    const inRoom = Object.fromEntries([2, 3, 4].map(n => [playerId(n), [HARBOR, 1]]));
    ctx.live.setPlace(HARBOR);
    await connect(ctx, { [ME]: [null, null], ...inRoom, ...elsewhere });
    const room = ctx.client.open(HARBOR_ROOM_1);
    room.status('SUBSCRIBED');
    await settle();

    await playCrowdedGame(ctx, room, 60); // three captains, each one update every 2 seconds

    expect(states(ctx)).not.toContain('slow');
  });

  it('waits at least 30 seconds after a warning about presence, and does not slow down for it', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    const world = await connect(ctx);

    world.system({ message: 'Too many presence messages per second', status: 'error', extension: 'system', channel: 'live:world' });
    world.status('CLOSED');
    await settle(29999);
    expect(ctx.client.all('live:world')).toHaveLength(1);
    await settle(1);
    expect(ctx.client.all('live:world')).toHaveLength(2);
    expect(states(ctx)).not.toContain('slow');
  });

  it('emotes: preset only, one every 3 seconds, sharing the update allowance', async () => {
    const ctx = start();
    const { room } = await inHarborWith(ctx);
    const began = Date.now();
    ctx.live.update({ ...STILL, moving: true }); // an update goes out at 0
    await settle(100);

    expect(ctx.live.emote('dance')).toBe(false); // not on the list
    expect(ctx.live.emote('hello there')).toBe(false); // free text is never sent
    expect(ctx.live.emote('wave')).toBe(true);
    expect(ctx.live.emote('cheer')).toBe(false); // one every 3 seconds
    await settle(2999);
    expect(ctx.live.emote('cheer')).toBe(false); // 2999 ms since the first
    await settle(1);
    expect(ctx.live.emote('cheer')).toBe(true); // 3000 ms
    await settle(3000);

    // The emote waits for the allowance, goes before the next update, and the updates go on after it.
    const order = room.messages.map(message => message.event);
    expect(order.slice(0, 3)).toEqual(['position', 'emote', 'position']);
    expect(room.times.slice(0, 3).map(time => time - began)).toEqual([0, 500, 1000]);
    expect(room.emotes.map(sent => sent.emote)).toEqual(['wave', 'cheer']);
    expect(Object.keys(room.emotes[0])).toEqual(['v', 'id', 'emote', 'seq']);
    const gaps = room.times.slice(1).map((time, i) => time - room.times[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(500); // never two messages closer than the allowance
  });

  it('sends nothing while the socket is closing, so the library never falls back to sending over HTTPS', async () => {
    const ctx = start();
    const { room } = await inHarborWith(ctx);
    ctx.client.connected = false; // a heartbeat was missed: the socket is closing, but the room has not failed yet

    ctx.live.update({ ...STILL, moving: true });
    expect(ctx.live.emote('wave')).toBe(false);
    await settle(3000);
    expect(room.messages).toEqual([]);

    ctx.client.connected = true; // the socket is back
    ctx.live.update({ ...STILL, moving: true });
    expect(room.positions).toHaveLength(1);
  });

  it('sends nothing into a room that the library does not count as joined', async () => {
    const ctx = start();
    const { room } = await inHarborWith(ctx);
    room.state = 'errored'; // the library knows about the failure a moment before it tells us

    ctx.live.update({ ...STILL, moving: true });
    await settle(3000);

    expect(room.messages).toEqual([]);
  });

  it('drops an emote that was still waiting when the captain became alone in the room', async () => {
    const friend = playerId(10);
    const ctx = start();
    const { world, room } = await inHarborWith(ctx, 1);
    ctx.live.update({ ...STILL, moving: true }); // an update goes out at 0
    await settle(100);
    expect(ctx.live.emote('wave')).toBe(true); // it waits for the allowance, until 500 ms

    world.presence(worldOf({})); // our friend leaves: nobody is left to see it
    await settle(1000); // the allowance frees up and finds nobody to tell
    world.presence(worldOf({ [friend]: [HARBOR, 1] })); // the friend comes back
    await settle(10000);

    expect(room.emotes).toEqual([]);
  });

  it('does not send a position to a room that is not joined yet', async () => {
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    await connect(ctx, { [playerId(10)]: [HARBOR, 1] });
    const room = ctx.client.open(HARBOR_ROOM_1);

    ctx.live.update({ x: 1, z: 1, facing: 'down', moving: true }); // the room has not answered yet
    await settle(5000);
    expect(room.messages).toEqual([]);
    expect(ctx.live.emote('wave')).toBe(false);

    room.status('SUBSCRIBED');
    await settle();
    expect(room.positions).toHaveLength(1); // as soon as it is joined
  });
});

describe('receiving', () => {
  it('passes only valid positions from captains in the room on as live_peer_moved', async () => {
    const [inRoom, otherRoom, otherPlace, stranger] = [10, 11, 12, 99].map(playerId);
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    await connect(ctx, { [inRoom]: [HARBOR, 1], [otherRoom]: [HARBOR, 2], [otherPlace]: [WRECK, 1] });
    const room = ctx.client.open(HARBOR_ROOM_1);
    room.status('SUBSCRIBED');
    await settle();

    room.broadcast('position', position(inRoom, { x: 3, z: 4, facing: 'up', moving: false, everyMs: 1100 }));
    expect(ofType(ctx, 'live_peer_moved')).toEqual([{ type: 'live_peer_moved', id: inRoom, x: 3, z: 4, facing: 'up', moving: false, everyMs: 1100 }]);

    const dropped = [
      position(otherRoom), // sent by someone in another room of this place
      position(otherPlace), // someone in another place
      position(stranger), // someone the world does not know
      position(ME), // ourselves
      position(inRoom, { v: 2 }),
      position(inRoom, { x: NaN }),
      position(inRoom, { z: 500 }),
      position(inRoom, { facing: 'north' }),
      position(inRoom, { place: WRECK }),
      position(inRoom, { id: 'captain-10' }),
      position(inRoom, { everyMs: 100 }),
      position(inRoom, { seq: -4 }),
      'hello', null, [position(inRoom)],
    ];
    await settle(1000);
    sendAll(room, 'position', dropped);
    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(1);

    // An old message, and one that comes too soon after the last one, are dropped. A new one is not.
    room.broadcast('position', position(inRoom, { seq: 5 }));
    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(1); // old, though 1000 ms have passed
    room.broadcast('position', position(inRoom)); // new, and 1000 ms after the last good one: fine
    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(2);
    await settle(399);
    room.broadcast('position', position(inRoom)); // 399 ms: too soon
    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(2);
    await settle(1);
    room.broadcast('position', position(inRoom)); // 400 ms: fine
    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(3);
    expect(Object.keys(ofType(ctx, 'live_peer_moved')[0])).toEqual(['type', 'id', 'x', 'z', 'facing', 'moving', 'everyMs']);
  });

  it('drops a replayed position: the very same message again, even a second later', async () => {
    const friend = playerId(10);
    const ctx = start();
    const { room } = await inHarborWith(ctx, 1);
    const message = position(friend);

    room.broadcast('position', message);
    await settle(1000);
    room.broadcast('position', message);

    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(1);
  });

  it('drops a replayed emote: the very same message again, even 3 seconds later', async () => {
    const friend = playerId(10);
    const ctx = start();
    const { room } = await inHarborWith(ctx, 1);
    const message = { v: 1, id: friend, emote: 'wave', seq: (nextSeq += 1) };

    room.broadcast('emote', message);
    await settle(3000);
    room.broadcast('emote', message);

    expect(ofType(ctx, 'live_peer_emoted')).toHaveLength(1);
  });

  it('starts afresh with a captain who left the world and came back', async () => {
    const friend = playerId(10);
    const ctx = start();
    const { world, room } = await inHarborWith(ctx, 1);
    room.broadcast('position', position(friend, { seq: 5000 }));
    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(1);

    world.presence(worldOf({})); // the friend leaves the game ...
    await settle(1000);
    world.presence(worldOf({ [friend]: [HARBOR, 1] })); // ... and comes back, with a clock that went back
    await settle(1000);
    room.broadcast('position', position(friend, { seq: 40 }));

    expect(ofType(ctx, 'live_peer_moved')).toHaveLength(2);
  });

  it('passes on only preset emotes, one every 2 seconds for each captain', async () => {
    const [friend, other] = [10, 11].map(playerId);
    const ctx = start();
    const { room } = await inHarborWith(ctx, 0);
    ctx.client.open('live:world').presence(worldOf({ [friend]: [HARBOR, 1], [other]: [HARBOR, 1] }));
    await settle();
    const emote = (id, name) => ({ v: 1, id, emote: name, seq: (nextSeq += 1) });

    room.broadcast('emote', emote(friend, 'wave'));
    room.broadcast('emote', emote(friend, 'dance')); // not on the list
    room.broadcast('emote', emote(friend, 'hello there')); // never text
    room.broadcast('emote', emote(friend, 'cheer')); // too soon: 2 seconds
    room.broadcast('emote', emote(other, 'lantern')); // another captain has their own count
    room.broadcast('emote', emote(playerId(99), 'wave')); // not in the room
    await settle(1999);
    room.broadcast('emote', emote(friend, 'cheer'));
    await settle(1);
    room.broadcast('emote', emote(friend, 'point'));

    expect(ofType(ctx, 'live_peer_emoted')).toEqual([
      { type: 'live_peer_emoted', id: friend, emote: 'wave' },
      { type: 'live_peer_emoted', id: other, emote: 'lantern' },
      { type: 'live_peer_emoted', id: friend, emote: 'point' },
    ]);
  });

  it('drops what a room we left still says', async () => {
    const friend = playerId(10);
    const ctx = start();
    const { room } = await inHarborWith(ctx);
    ctx.client.open('live:world').presence(worldOf({ [friend]: [HARBOR, 1] }));
    ctx.live.setPlace(null);
    await settle();

    room.broadcast('position', position(friend));
    room.broadcast('emote', { v: 1, id: friend, emote: 'wave', seq: 5 });

    expect(ofType(ctx, 'live_peer_moved')).toEqual([]);
    expect(ofType(ctx, 'live_peer_emoted')).toEqual([]);
  });
});

describe('who is shown', () => {
  it('reports at most 8 shown captains, crewmates first, with names from profiles', async () => {
    const crewmates = [playerId(30), playerId(31)]; // these two sort last by id
    const inRoom = Array.from({ length: 12 }, (_, i) => playerId(20 + i)); // 20 to 31
    const inAnotherRoom = [playerId(40), playerId(41), playerId(42)];
    const names = { [playerId(20)]: 'Brave Puffin 17', [playerId(30)]: 'Calm Gull 4', [playerId(31)]: 'Quiet Seal 9', [playerId(21)]: 'Tidy Crab 2' };
    const ctx = start({ names, crew: { id: CREW_ID, memberIds: [ME, ...crewmates] } });
    ctx.live.setPlace(HARBOR);
    const world = await connect(ctx, {
      ...Object.fromEntries(inRoom.map(id => [id, [HARBOR, 1], ])),
      ...Object.fromEntries(inAnotherRoom.map(id => [id, [HARBOR, 2]])),
    });
    const room = ctx.client.open(HARBOR_ROOM_1); // a crewmate is in room 1, so we go there, full or not
    room.status('SUBSCRIBED');
    await settle();

    const view = lastView(ctx);
    expect(view.place).toBe(HARBOR);
    expect(view.room).toBe(1);
    expect(view.shown).toHaveLength(8);
    expect(view.shown.slice(0, 2).map(captain => captain.id)).toEqual(crewmates);
    expect(view.shown.slice(2).map(captain => captain.id)).toEqual(inRoom.slice(0, 6));
    expect(view.shown.map(captain => captain.crewmate)).toEqual([true, true, false, false, false, false, false, false]);
    expect(view.hiddenCount).toBe(15 - 8); // 12 in our room and 3 in the other, minus those we draw
    expect(view.shown.map(captain => captain.name)).toEqual(['Calm Gull 4', 'Quiet Seal 9', 'Brave Puffin 17', 'Tidy Crab 2', null, null, null, null]);
    expect(view.shown.every(captain => captain.kit === null)).toBe(true);
    expect(view.crew).toEqual([
      { id: crewmates[0], name: 'Calm Gull 4', place: HARBOR },
      { id: crewmates[1], name: 'Quiet Seal 9', place: HARBOR },
    ]);
    // The names come from the table profiles, never from another browser, and each id is asked for once.
    expect(ctx.client.reads.map(read => [read.table, read.columns, read.column])).toEqual(ctx.client.reads.map(() => ['profiles', 'id, display_name', 'id']));
    const asked = ctx.client.reads.flatMap(read => read.values).sort();
    expect(asked).toEqual(view.shown.map(captain => captain.id).sort());
    expect(world.tracks).toHaveLength(1);

    // Hearing from a hidden captain changes nothing, and nobody is asked for twice.
    expect(view.shown.map(captain => captain.id)).not.toContain(inRoom[8]);
    room.broadcast('position', position(inRoom[8])); // number 28 is in the room, but not among the 8
    expect(ofType(ctx, 'live_peer_moved')).toEqual([]);
    world.presence(world.people);
    await settle();
    expect(ctx.client.reads.flatMap(read => read.values).sort()).toEqual(asked);
  });

  it('asks for the names of the captains it shows with one read', async () => {
    const friends = [10, 11, 12, 13, 14].map(playerId);
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    await connect(ctx, Object.fromEntries(friends.map(id => [id, [HARBOR, 1]])));
    ctx.client.open(HARBOR_ROOM_1).status('SUBSCRIBED');
    await settle();

    expect(ctx.client.reads).toHaveLength(1);
    expect([...ctx.client.reads[0].values].sort()).toEqual(friends);
  });

  it('reads at most 50 names at a time', async () => {
    const crew = Array.from({ length: 60 }, (_, i) => playerId(200 + i));
    const ctx = start({ crew: { id: CREW_ID, memberIds: crew } });
    ctx.live.setPlace(null);

    await connect(ctx, Object.fromEntries(crew.map(id => [id, [WRECK, 1]])));

    expect(ctx.client.reads.map(read => read.values.length)).toEqual([50, 10]);
  });

  it('shows the captains that the world says are in our room, with their kits, and counts the rest as hidden', async () => {
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    const world = await connect(ctx, {
      [playerId(10)]: [HARBOR, 1, 'lantern'], [playerId(11)]: [HARBOR, 1], [playerId(12)]: [HARBOR, 2], [playerId(13)]: [WRECK, 1],
    });
    const room = ctx.client.open(HARBOR_ROOM_1);
    room.status('SUBSCRIBED');
    await settle();

    expect(lastView(ctx).shown).toEqual([
      { id: playerId(10), name: null, kit: 'lantern', crewmate: false },
      { id: playerId(11), name: null, kit: null, crewmate: false },
    ]);
    expect(lastView(ctx).hiddenCount).toBe(1); // "+1 more here": the one in room 2
    const count = ofType(ctx, 'live_presence_changed').length;

    world.presence(world.people); // the same again
    await settle();
    expect(ofType(ctx, 'live_presence_changed')).toHaveLength(count); // nothing changed, so nothing is said

    world.presence(worldOf({ [playerId(11)]: [HARBOR, 1] })); // one leaves
    await settle();
    expect(lastView(ctx).shown.map(captain => captain.id)).toEqual([playerId(11)]);
    expect(lastView(ctx).hiddenCount).toBe(0);
  });

  it('shows nobody on the home islet and keeps the name of a failed read for later', async () => {
    const ctx = start({ names: {} });
    ctx.live.setPlace('home_islet');
    await connect(ctx, { [playerId(10)]: ['home_islet', null], [playerId(11)]: ['home_islet', null] });
    expect(ofType(ctx, 'live_presence_changed').every(view => view.shown.length === 0 && view.hiddenCount === 0)).toBe(true);

    const crewmate = playerId(12);
    ctx.client.failReads = true;
    ctx.live.setCrew({ id: CREW_ID, memberIds: [crewmate] });
    ctx.client.open('live:world').presence(worldOf({ [crewmate]: [WRECK, 1] }));
    await settle();
    expect(lastView(ctx).crew).toEqual([{ id: crewmate, name: null, place: WRECK }]);
    expect(warn).toHaveBeenCalledOnce(); // one warning for the failed read
    expect(ctx.client.reads).toHaveLength(1);

    ctx.client.failReads = false;
    ctx.client.names[crewmate] = 'Late Heron 3';
    ctx.client.open('live:world').presence(worldOf({ [crewmate]: [WRECK, 1] }));
    await settle(29000);
    expect(ctx.client.reads).toHaveLength(1); // not again within 30 seconds
    await settle(1000);
    ctx.client.open('live:world').presence(worldOf({ [crewmate]: [WRECK, 1], [playerId(13)]: [WRECK, 1] }));
    await settle();
    expect(ctx.client.reads).toHaveLength(2);
    expect(lastView(ctx).crew[0].name).toBe('Late Heron 3');
  });
});

describe('the crew room', () => {
  it('joins the crew room privately, never sends in it, and passes server events on as live_crew_updated', async () => {
    const ctx = start({ crew: { id: CREW_ID.toUpperCase(), memberIds: [ME, playerId(2)] } });
    ctx.live.setPlace(HARBOR);
    await connect(ctx, { [playerId(2)]: [HARBOR, 1] });
    const crewRoom = ctx.client.open(CREW_TOPIC);
    crewRoom.status('SUBSCRIBED');
    const room = ctx.client.open(HARBOR_ROOM_1);
    room.status('SUBSCRIBED');
    await settle();

    expect(crewRoom.config).toEqual({ private: true });
    crewRoom.broadcast('crew_event', { v: 1, kind: 'board_changed', data: { version: 3 } });
    crewRoom.broadcast('crew_event', { v: 1, kind: 'pins_changed', data: {} }); // not a kind we know
    crewRoom.broadcast('crew_event', { v: 1, kind: 'case_changed', data: [1] }); // data is not an object
    crewRoom.broadcast('crew_event', { v: 2, kind: 'crew_changed', data: {} });
    crewRoom.broadcast('crew_event', 'board_changed');
    expect(ofType(ctx, 'live_crew_updated')).toEqual([{ type: 'live_crew_updated', kind: 'board_changed', data: { version: 3 } }]);

    // However much we walk and wave, nothing is ever sent into the crew room.
    await walk(ctx, 100, 100, i => ({ x: i, z: 0, facing: 'right', moving: true }));
    expect(ctx.live.emote('wave')).toBe(true);
    await settle(2000);
    expect(crewRoom.messages).toEqual([]);
    expect(crewRoom.tracks).toEqual([]);
    expect(room.messages.length).toBeGreaterThan(0);
  });

  it('joins the crew room again when the crew is set again after the rules refused it', async () => {
    const ctx = start({ crew: { id: CREW_ID, memberIds: [ME] } });
    ctx.live.setPlace(null);
    await connect(ctx);
    await refuseEveryTry(ctx, CREW_TOPIC, new Error(`Unauthorized: You do not have permissions to read from this Channel topic: ${CREW_TOPIC}`));
    await settle(600000);
    expect(ctx.client.all(CREW_TOPIC)).toHaveLength(4); // after three more tries it does not knock again by itself

    ctx.live.setCrew({ id: CREW_ID, memberIds: [ME, playerId(2)] }); // the seat is there now
    await settle();
    const again = ctx.client.open(CREW_TOPIC);
    again.status('SUBSCRIBED');
    again.broadcast('crew_event', { v: 1, kind: 'crew_changed', data: { version: 2 } });

    expect(ctx.client.all(CREW_TOPIC)).toHaveLength(5);
    expect(ofType(ctx, 'live_crew_updated')).toEqual([{ type: 'live_crew_updated', kind: 'crew_changed', data: { version: 2 } }]);
  });

  it('joins and leaves the crew room when the crew changes, and ignores a crew id that is not a uuid', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    await connect(ctx);
    expect(ctx.client.openTopics()).toEqual(['live:world']);

    ctx.live.setCrew({ id: CREW_ID, memberIds: [ME] });
    await settle();
    expect(ctx.client.openTopics()).toEqual(['live:world', CREW_TOPIC]);
    const firstCrewRoom = ctx.client.open(CREW_TOPIC);

    ctx.live.setCrew({ id: CREW_ID, memberIds: [ME, playerId(2)] }); // same crew, one more member
    await settle();
    expect(ctx.client.all(CREW_TOPIC)).toHaveLength(1);

    ctx.live.setCrew({ id: 'not-a-uuid', memberIds: [] });
    await settle();
    expect(ctx.client.openTopics()).toEqual(['live:world']);
    firstCrewRoom.broadcast('crew_event', { v: 1, kind: 'board_changed', data: { version: 9 } }); // a room we left
    expect(ofType(ctx, 'live_crew_updated')).toEqual([]);

    await settle(1000); // a crew room is joined at most once a second
    ctx.live.setCrew({ id: '22222222-2222-4222-8222-222222222222', memberIds: [] });
    await settle();
    expect(ctx.client.openTopics()).toEqual(['live:world', 'live:crew:22222222-2222-4222-8222-222222222222']);

    ctx.live.setCrew(null);
    await settle();
    expect(ctx.client.openTopics()).toEqual(['live:world']);
  });
});

describe('when a room fails', () => {
  it('rejoins a failed room with growing waits, and forgets the failed tries after a calm minute', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    await connect(ctx);
    ctx.dice.value = 0.5; // the wait is 1 s plus half of min(30 s, 2 s x 2^tries)

    await failWorldAndRejoin(ctx, 'CHANNEL_ERROR', 2000, 2);
    await failWorldAndRejoin(ctx, 'TIMED_OUT', 3000, 3);
    await failWorldAndRejoin(ctx, 'CLOSED', 5000, 4);
    await failWorldAndRejoin(ctx, 'CHANNEL_ERROR', 9000, 5);
    await failWorldAndRejoin(ctx, 'TIMED_OUT', 16000, 6);
    await failWorldAndRejoin(ctx, 'CLOSED', 16000, 7); // the wait stops growing at 16 s

    // After a calm minute of being joined, the count of failed tries starts again.
    ctx.client.open('live:world').status('SUBSCRIBED');
    expect(states(ctx).at(-1)).toBe('live');
    await settle(60000);
    await failWorldAndRejoin(ctx, 'CLOSED', 2000, 8);
  });

  it('gives up on a room the rules say it may not join, and a world room that is refused is offline', async () => {
    const ctx = start({ crew: { id: CREW_ID, memberIds: [ME] } });
    ctx.live.setPlace(null);
    const world = await connect(ctx);
    const refusal = new Error(`Unauthorized: You do not have permissions to read from this Channel topic: ${CREW_TOPIC}`);

    await refuseEveryTry(ctx, CREW_TOPIC, refusal);
    await settle(600000);
    expect(ctx.client.all(CREW_TOPIC)).toHaveLength(4); // three more tries, then it never knocks again
    expect(states(ctx).at(-1)).toBe('live'); // and the rest goes on

    world.status('CHANNEL_ERROR', new Error('Unauthorized: You do not have permissions to read from this Channel topic: live:world'));
    expect(states(ctx).at(-1)).toBe('offline');
    await settle(10000);
    for (let knock = 0; knock < 3; knock += 1) {
      ctx.client.open('live:world').status('CHANNEL_ERROR', new Error('Unauthorized: live:world'));
      await settle(10000);
    }
    await settle(600000);
    expect(ctx.client.all('live:world')).toHaveLength(4);
    expect(states(ctx).at(-1)).toBe('offline');
    expect(warn.mock.calls.map(call => String(call[0])).filter(line => /refused/.test(line))).toHaveLength(8); // one quiet line a refusal
  });

  it('tries a refused room again after 2, 5 and 8 seconds and joins it when the rules allow it by then', async () => {
    const ctx = start({ crew: { id: CREW_ID, memberIds: [ME] } });
    ctx.live.setPlace(null);
    await connect(ctx);
    const refusal = new Error(`Unauthorized: You do not have permissions to read from this Channel topic: ${CREW_TOPIC}`);

    ctx.client.open(CREW_TOPIC).status('CHANNEL_ERROR', refusal);
    await settle(1999);
    expect(ctx.client.all(CREW_TOPIC)).toHaveLength(1); // not before 2 seconds
    await settle(1);
    expect(ctx.client.all(CREW_TOPIC)).toHaveLength(2);
    ctx.client.open(CREW_TOPIC).status('CHANNEL_ERROR', refusal);
    await settle(4999);
    expect(ctx.client.all(CREW_TOPIC)).toHaveLength(2); // the second wait is 5 seconds
    await settle(1);
    const third = ctx.client.open(CREW_TOPIC);
    third.status('SUBSCRIBED'); // the seat is there now
    third.broadcast('crew_event', { v: 1, kind: 'crew_changed', data: { version: 3 } });
    await settle(600000);

    expect(ctx.client.all(CREW_TOPIC)).toHaveLength(3);
    expect(ofType(ctx, 'live_crew_updated')).toEqual([{ type: 'live_crew_updated', kind: 'crew_changed', data: { version: 3 } }]);
    const lines = warn.mock.calls.map(call => String(call[0])).filter(line => /refused/.test(line));
    expect(lines).toEqual(['Live room crew refused, trying again in 2 s (1 of 3).', 'Live room crew refused, trying again in 5 s (2 of 3).']);
    expect(JSON.stringify(lines)).not.toContain(CREW_ID); // the warning names no room id
  });

  it('ignores what a room it has already removed goes on saying', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    const world = await connect(ctx);
    ctx.dice.value = 0.5;

    world.status('CHANNEL_ERROR', new Error('the socket is gone'));
    world.status('CLOSED'); // the library says more than once
    world.status('TIMED_OUT');
    world.status('SUBSCRIBED'); // and even this is not true any more
    await settle(1999);
    expect(ctx.client.all('live:world')).toHaveLength(1);
    await settle(1);

    expect(ctx.client.all('live:world')).toHaveLength(2); // one new room, after the first wait
    expect(states(ctx).at(-1)).toBe('connecting');
    await settle(60000);
    expect(ctx.client.all('live:world')).toHaveLength(2);
  });

  it('shows nobody while the world room is away, and announces itself again when it is back', async () => {
    const friend = playerId(10);
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    const world = await connect(ctx, { [friend]: [HARBOR, 1] });
    const room = ctx.client.open(HARBOR_ROOM_1);
    room.status('SUBSCRIBED');
    await settle();
    expect(lastView(ctx).shown.map(captain => captain.id)).toEqual([friend]);
    expect(world.tracks).toHaveLength(1);

    world.status('CHANNEL_ERROR', new Error('the socket is gone'));
    await settle();
    expect(lastView(ctx).shown).toEqual([]);
    ctx.live.update({ ...STILL, moving: true });
    await settle(1000);
    const sentBefore = room.messages.length;
    room.broadcast('position', position(friend)); // we cannot tell who this is: dropped
    expect(ofType(ctx, 'live_peer_moved')).toEqual([]);

    await settle(2000);
    const back = ctx.client.open('live:world');
    back.status('SUBSCRIBED');
    back.presence(worldOf({ [friend]: [HARBOR, 1] }));
    await settle(1500);
    expect(states(ctx).at(-1)).toBe('live');
    expect(back.tracks).toEqual([{ v: 1, place: HARBOR, room: 1, kit: null }]);
    expect(lastView(ctx).shown.map(captain => captain.id)).toEqual([friend]);
    expect(room.messages.length).toBeGreaterThanOrEqual(sentBefore);
  });

  it('ignores the presence that a world room it has already removed still reports', async () => {
    const [friend, stranger] = [10, 11].map(playerId);
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    const old = await connect(ctx, { [friend]: [HARBOR, 1] });
    ctx.client.open(HARBOR_ROOM_1).status('SUBSCRIBED');
    old.status('CHANNEL_ERROR', new Error('the socket is gone'));
    await settle(1000);
    const back = ctx.client.open('live:world');
    back.status('SUBSCRIBED');
    back.presence(worldOf({ [friend]: [HARBOR, 1] }));
    await settle();

    old.presence(worldOf({ [stranger]: [HARBOR, 1] })); // the room that was removed still talks
    await settle();

    expect(lastView(ctx).shown.map(captain => captain.id)).toEqual([friend]);
  });

  it('waits for a longer time only once after a warning of the server', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    const world = await connect(ctx);
    world.system({ message: 'Too many presence messages per second', status: 'error', extension: 'system', channel: 'live:world' });
    world.status('CLOSED');
    await settle(30000);
    expect(ctx.client.all('live:world')).toHaveLength(2); // the warning made it wait 30 seconds
    ctx.client.open('live:world').status('SUBSCRIBED');
    await settle(60000); // a calm minute: the failed tries are forgotten
    ctx.dice.value = 0.5;

    ctx.client.open('live:world').status('CHANNEL_ERROR', new Error('the socket is gone'));
    await settle(1999);
    expect(ctx.client.all('live:world')).toHaveLength(2);
    await settle(1);

    expect(ctx.client.all('live:world')).toHaveLength(3); // 1 s plus half of 2 s, and not 30 seconds again
  });

  it('does not carry a warning of the server over to the next failed try', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    const world = await connect(ctx);
    world.system({ message: 'Too many presence messages per second', status: 'error', extension: 'system', channel: 'live:world' });
    world.status('CLOSED');
    await settle(30000);
    ctx.dice.value = 0.5;

    ctx.client.open('live:world').status('TIMED_OUT'); // the room that was joined again fails at once
    await settle(2999);
    expect(ctx.client.all('live:world')).toHaveLength(2);
    await settle(1);

    expect(ctx.client.all('live:world')).toHaveLength(3); // 1 s plus half of 4 s, and not 30 seconds again
  });

  it('forgets a warning of the server that came while the room was joining, once the room is joined', async () => {
    const ctx = start();
    ctx.live.setPlace(null);
    const world = await connect(ctx);
    world.status('CLOSED');
    await settle(1000); // the room is joined again: a new room, which has not answered yet
    const joining = ctx.client.open('live:world');
    joining.system({ message: 'Too many presence messages per second', status: 'error', extension: 'system', channel: 'live:world' });
    joining.status('SUBSCRIBED');
    await settle(60000); // a calm minute: the failed tries are forgotten
    ctx.dice.value = 0.5;

    joining.status('CHANNEL_ERROR', new Error('the socket is gone'));
    await settle(1999);
    expect(ctx.client.all('live:world')).toHaveLength(2);
    await settle(1);

    expect(ctx.client.all('live:world')).toHaveLength(3); // 1 s plus half of 2 s, and not the 30 seconds of the old warning
  });

  it('does not use the old room by mistake when the same room is joined again', async () => {
    const ctx = start();
    ctx.live.setPlace(HARBOR);
    await connect(ctx);
    const first = ctx.client.open(HARBOR_ROOM_1);
    first.status('SUBSCRIBED');
    await settle(1000); // a place room is joined at most once a second: let that wait pass first
    let finishLeaving;
    ctx.client.removeChannel.mockImplementationOnce(room => {
      room.removed = true;
      return new Promise(resolve => { finishLeaving = () => resolve('ok'); });
    });

    ctx.live.setPlace(null); // leave the harbor ...
    ctx.live.setPlace(HARBOR); // ... and come straight back, before the server has answered the leave
    await settle(100);
    expect(ctx.client.all(HARBOR_ROOM_1)).toHaveLength(1); // the new room waits for the old one to be gone
    finishLeaving();
    await settle();
    expect(ctx.client.all(HARBOR_ROOM_1)).toHaveLength(2);
  });
});

describe('stopping', () => {
  it('stop leaves every room and sends nothing afterwards', async () => {
    const ctx = start({ crew: { id: CREW_ID, memberIds: [ME, playerId(2)] } });
    ctx.live.setPlace(HARBOR);
    const world = await connect(ctx, { [playerId(2)]: [HARBOR, 1] });
    const room = ctx.client.open(HARBOR_ROOM_1);
    room.status('SUBSCRIBED');
    ctx.client.open(CREW_TOPIC).status('SUBSCRIBED');
    await settle();
    ctx.live.update({ ...STILL, moving: true });
    await settle(1000);
    const sent = room.messages.length;
    const tracked = world.tracks.length;
    const rooms = ctx.client.rooms.length;
    const eventsBefore = ctx.events.length;

    ctx.live.stop();

    expect(ctx.client.removeAllChannels).toHaveBeenCalledOnce();
    expect(ctx.client.openTopics()).toEqual([]);
    expect(states(ctx).at(-1)).toBe('off');
    expect(vi.getTimerCount()).toBe(0);
    ctx.live.update({ ...STILL, moving: true });
    expect(ctx.live.emote('wave')).toBe(false);
    ctx.live.setPlace(WRECK);
    ctx.live.setCrew(null);
    ctx.live.setKit('compass');
    ctx.live.stop(); // a second stop is harmless
    room.broadcast('position', position(playerId(2))); // and a late message is ignored
    room.status('CLOSED');
    world.presence(worldOf({}));
    await settle(600000);

    expect(room.messages).toHaveLength(sent);
    expect(world.tracks).toHaveLength(tracked);
    expect(ctx.client.rooms).toHaveLength(rooms);
    expect(ctx.events.slice(eventsBefore)).toEqual([{ type: 'live_status_changed', state: 'off' }]);
  });
});

describe('the real library', () => {
  it('has every call we make, and needs no network to build them', async () => {
    vi.useRealTimers();
    // Make sure nothing here reaches the network: any use of fetch or a WebSocket is an error.
    const fetchUsed = vi.fn(() => { throw new Error('This test must not use fetch.'); });
    const socketUsed = vi.fn();
    vi.stubGlobal('fetch', fetchUsed);
    vi.stubGlobal('WebSocket', class { constructor() { socketUsed(); throw new Error('This test must not open a WebSocket.'); } });
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(URL, KEY, { accessToken: async () => 'token-1' });
    try {
      const room = client.channel('live:world', { config: { private: true, presence: { key: ME, enabled: true } } });
      expect(room.on('presence', { event: 'sync' }, () => {})).toBe(room);
      expect(room.on('system', {}, () => {})).toBe(room);
      expect(room.on('broadcast', { event: 'position' }, () => {})).toBe(room);
      expect(['subscribe', 'send', 'track', 'presenceState'].map(name => typeof room[name])).toEqual(['function', 'function', 'function', 'function']);
      expect(room.presenceState()).toEqual({});
      expect(room.state).toBe('closed'); // the sender looks at this ('joined') and at the socket before it sends
      expect(typeof client.realtime.isConnected).toBe('function');
      const read = client.from('profiles').select('id, display_name').in('id', [ME]);
      expect(typeof read.then).toBe('function'); // built, but never awaited: that would call the network
      expect(await client.removeChannel(room)).toBe('ok');
    } finally {
      await client.removeAllChannels();
    }
    expect(fetchUsed).not.toHaveBeenCalled();
    expect(socketUsed).not.toHaveBeenCalled();
  });
});
