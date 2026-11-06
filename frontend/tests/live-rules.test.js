// The rules of live presence: topics, room sizes, the send gap, what to accept and what to show.
// Pure functions, so there is no network and no timer here. Spec: specs/A4-live-presence.md.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CREW_EVENT_KINDS, EMOTES, JOIN_GAP_MS, LOAD_LIMIT, MAX_SHOWN, START_DELAY_MS, TRACK_GAP_MS, TRACK_JITTER_MS, WORLD_TOPIC,
  backoffMs, chooseRoom, crewTopic, describeError, estimatedLoad, facingFrom, glide, isPlaceId, isPlayerId, placeTopic,
  pickShown, readCrewEvent, readEmote, readPosition, readPresenceMeta, readSystemNotice, readWorld,
  roomLimit, roomsOf, roomToMoveTo, sendGapMs, shouldSnap,
} from '../src/net/live-rules.js';

// Player ids are lowercase uuids. These have letters in them, so a test can also use capitals.
const ME = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const CREWMATE = 'a1b2c3d4-0000-4000-8000-00000000000a';
const CREW = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
// A made-up id for the nth player, so a test can have a whole crowd.
const player = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// The patterns are read from the migration itself, so the browser and the database cannot drift apart.
const migration = readFileSync(new URL('../../supabase/migrations/20261106050000_live_presence.sql', import.meta.url), 'utf8');
const placePatterns = [...migration.matchAll(/'(\^live:place:[^']+\$)'/g)].map(match => match[1]);
const crewPatterns = [...migration.matchAll(/'(\^live:crew:[^']+\$)'/g)].map(match => match[1]);
const placeRule = new RegExp(placePatterns[0]);
const crewRule = new RegExp(crewPatterns[0]);
const nulls = count => Array(count).fill(null);

describe('topics', () => {
  it('builds the world, place-room and crew topics', () => {
    expect(WORLD_TOPIC).toBe('live:world');
    expect(placeTopic('saltreach_harbor', 1)).toBe('live:place:saltreach_harbor:1');
    expect(placeTopic('the_teeth', 99)).toBe('live:place:the_teeth:99');
    expect(crewTopic(CREW)).toBe(`live:crew:${CREW}`);
    expect(crewTopic(CREW.toUpperCase())).toBe(`live:crew:${CREW}`);
  });

  it.each(['', 'Saltreach', 'a', 'x'.repeat(41), '1harbor', 'harbor-1', 'harbor 1', 'harbor:1', null, undefined, 7])(
    'builds no place topic for the place %j', place => {
      expect(placeTopic(place, 1)).toBeNull();
    });

  it.each([0, 100, -1, 1.5, '1', null, NaN])('builds no place topic for the room %j', room => {
    expect(placeTopic('saltreach_harbor', room)).toBeNull();
  });

  it.each(['', 'nope', `${CREW}x`, `live:crew:${CREW}`, null, undefined, 12])('builds no crew topic for the id %j', id => {
    expect(crewTopic(id)).toBeNull();
  });

  it('gives no room to the home islet, because every player has their own', () => {
    expect(placeTopic('home_islet', 1)).toBeNull();
  });

  it('knows a player id from anything else', () => {
    expect(isPlayerId(ME)).toBe(true);
    expect(['', 'nope', ME.toUpperCase(), `${ME}x`, ` ${ME}`, null, undefined, 5].map(isPlayerId)).toEqual(Array(8).fill(false));
  });

  it('has one pattern for the place rooms (the same for listening and sending) and one for the crew rooms in the migration', () => {
    expect(placePatterns).toHaveLength(2); // one for listening, one for sending
    expect(new Set(placePatterns).size).toBe(1);
    expect(crewPatterns).toHaveLength(1);
    expect(migration).toContain(`'${WORLD_TOPIC}'`);
  });

  it.each(['saltreach_harbor', 'wreck_point', 'the_teeth', 'ab', `a${'b'.repeat(39)}`])(
    'the topics that we build for the place %s fit the database rule', place => {
      expect([1, 9, 10, 99].map(room => placeRule.test(placeTopic(place, room)))).toEqual([true, true, true, true]);
    });

  it('the crew topics that we build fit the database rule, and capitals do not', () => {
    expect(crewRule.test(crewTopic(CREW))).toBe(true);
    expect(crewRule.test(crewTopic(CREWMATE))).toBe(true);
    expect(crewRule.test(`live:crew:${CREW.toUpperCase()}`)).toBe(false);
  });

  it.each(['a', 'x'.repeat(41), 'Saltreach', '1harbor'])('the database refuses what we refuse to build: the place %s', place => {
    expect(isPlaceId(place)).toBe(false);
    expect(placeRule.test(`live:place:${place}:1`)).toBe(false);
  });

  it('the database refuses the rooms 0 and 100', () => {
    expect([0, 100].map(room => placeRule.test(`live:place:saltreach_harbor:${room}`))).toEqual([false, false]);
  });
});

describe('room sizes and the send gap', () => {
  it('rooms shrink from 9 to 4 as the game fills', () => {
    expect([1, 8, 13, 14, 20, 30, 60].map(roomLimit)).toEqual([9, 9, 9, 8, 6, 4, 4]);
  });

  it('treats a missing count of players as one', () => {
    expect([0, -3, NaN, undefined].map(roomLimit)).toEqual([9, 9, 9, 9]);
  });

  it('the gap between updates grows as the room and the game fill', () => {
    expect(sendGapMs(2, 2)).toBe(500);
    expect(sendGapMs(4, 4)).toBe(500);
    expect(sendGapMs(8, 8)).toBe(1100);
    expect(sendGapMs(30, 4)).toBe(2000);
    expect(sendGapMs(30, 9)).toBe(4500);
    expect(sendGapMs(4, 4, true)).toBe(1000); // slow mode halves the rate
    expect(sendGapMs(30, 4, true)).toBe(4000);
  });

  it('rounds the gap up to the next 100 ms, and leaves a gap that is already a multiple alone', () => {
    expect(sendGapMs(31, 2)).toBe(1100); // 1033 ms wanted
    expect(sendGapMs(12, 6)).toBe(1200); // exactly 1200 ms wanted
    expect(sendGapMs(13, 5)).toBe(1100); // 1083 ms wanted
  });

  it('never goes under half a second or over twenty seconds', () => {
    expect(sendGapMs(2, 2)).toBeGreaterThanOrEqual(500);
    expect(sendGapMs(200, 99)).toBe(20000);
    expect(sendGapMs(200, 99, true)).toBe(20000);
  });

  it('counts the room as part of the game, even before our own presence shows', () => {
    expect(sendGapMs(0, 4)).toBe(500);
    expect(sendGapMs(1, 8)).toBe(1100);
  });

  it('sends nothing when alone in the room', () => {
    expect(sendGapMs(30, 1)).toBeNull();
    expect(sendGapMs(1, 1)).toBeNull();
    expect(sendGapMs(5, 0)).toBeNull();
    expect(sendGapMs(5, 1, true)).toBeNull();
  });

  it('keeps a whole game of walkers under 60 messages a second', () => {
    // Every captain sends one update per gap, and every update is delivered to the others in the room.
    const games = [[4, 4], [8, 8], [13, 9], [20, 6], [30, 4], [60, 4], [100, 4]];
    const perSecond = games.map(([online, room]) => (online * room * 1000) / sendGapMs(online, room));
    expect(Math.max(...perSecond)).toBeLessThanOrEqual(60 + 1e-9);
  });

  it('the guard estimate multiplies the room traffic by the captains online', () => {
    expect(estimatedLoad(3, 0.5, 30)).toBe(105);
    expect(estimatedLoad(3, 0.5, 30)).toBeGreaterThan(LOAD_LIMIT);
    expect(LOAD_LIMIT).toBe(80);
    expect(estimatedLoad(2, 0.5, 4)).toBeLessThan(LOAD_LIMIT); // a crew of four on its own is fine
  });
});

describe('choosing a room', () => {
  it("chooses the crewmate's room first, then the first room with space", () => {
    // A crewmate sits in room 2, which is full. We still go there.
    expect(chooseRoom({ roomCounts: { 1: 3, 2: 9 }, crewmateRooms: [2], online: 14 })).toBe(2);
    // Crewmates in two rooms: the lower one.
    expect(chooseRoom({ roomCounts: { 1: 2, 2: 2, 3: 2 }, crewmateRooms: [3, 2], online: 6 })).toBe(2);
    // No crewmate. Room 1 is full (9 captains while 13 or fewer are online), so room 2.
    expect(chooseRoom({ roomCounts: { 1: 9 }, crewmateRooms: [], online: 12 })).toBe(2);
    // Room 1 has space for one more.
    expect(chooseRoom({ roomCounts: { 1: 8 }, crewmateRooms: [], online: 12 })).toBe(1);
    // An empty place.
    expect(chooseRoom({ roomCounts: {}, crewmateRooms: [], online: 1 })).toBe(1);
    // The first room with space can be a gap between full rooms.
    expect(chooseRoom({ roomCounts: { 1: 9, 2: 0, 3: 9 }, crewmateRooms: [], online: 12 })).toBe(2);
  });

  it('uses the smaller rooms of a busy game', () => {
    // 30 online: a room holds 4. Three others are in room 1, so there is space; four are not.
    expect(chooseRoom({ roomCounts: { 1: 3 }, crewmateRooms: [], online: 30 })).toBe(1);
    expect(chooseRoom({ roomCounts: { 1: 4 }, crewmateRooms: [], online: 30 })).toBe(2);
  });

  it('gives up when every room up to 99 is full', () => {
    const full = Object.fromEntries(Array.from({ length: 99 }, (_, i) => [i + 1, 9]));
    expect(chooseRoom({ roomCounts: full, crewmateRooms: [], online: 1 })).toBeNull();
  });

  it('counts the other captains in each room of one place and finds the rooms of the crewmates', () => {
    const peers = new Map([
      [player(2), { place: 'saltreach_harbor', room: 1, kit: null }],
      [player(3), { place: 'saltreach_harbor', room: 1, kit: null }],
      [player(4), { place: 'saltreach_harbor', room: 3, kit: null }],
      [player(5), { place: 'wreck_point', room: 1, kit: null }], // another place
      [player(6), { place: 'saltreach_harbor', room: null, kit: null }], // here, without a room
      [player(7), { place: null, room: null, kit: null }], // at sea
    ]);

    const { roomCounts, crewmateRooms } = roomsOf(peers, 'saltreach_harbor', new Set([player(4), player(5), player(9)]));

    expect(roomCounts).toEqual({ 1: 2, 3: 1 });
    expect(crewmateRooms).toEqual([3]); // the crewmate at wreck_point is not here
    expect(roomsOf(new Map(), 'saltreach_harbor', new Set())).toEqual({ roomCounts: {}, crewmateRooms: [] });
  });

  it('moves down to a crewmate in a lower room, and only down', () => {
    expect(roomToMoveTo(3, [1])).toBe(1);
    expect(roomToMoveTo(3, [4, 2])).toBe(2);
    expect(roomToMoveTo(2, [2])).toBeNull();
    expect(roomToMoveTo(2, [5])).toBeNull();
    expect(roomToMoveTo(2, [])).toBeNull();
  });
});

describe('who is shown', () => {
  it('shows at most 8 other captains, crewmates first, and counts the rest', () => {
    const everyone = Array.from({ length: 12 }, (_, i) => player(i + 1));
    const crew = [player(11), player(12)]; // they sort last by id
    const { shownIds, hiddenCount } = pickShown({ peerIds: everyone, placeCount: 12, crewIds: crew });
    expect(MAX_SHOWN).toBe(8);
    expect(shownIds).toHaveLength(8);
    expect(shownIds.slice(0, 2)).toEqual(crew);
    expect(shownIds.slice(2)).toEqual(everyone.slice(0, 6)); // then the rest, in id order
    expect(hiddenCount).toBe(4);
  });

  it('counts the captains in the other rooms of the place as hidden too', () => {
    const inMyRoom = [player(1), player(2), player(3)];
    const { shownIds, hiddenCount } = pickShown({ peerIds: inMyRoom, placeCount: 7, crewIds: [] });
    expect(shownIds).toEqual(inMyRoom);
    expect(hiddenCount).toBe(4); // "+4 more here"
  });

  it('puts crewmates first however the ids sort, and ignores crew ids that are not here', () => {
    const { shownIds } = pickShown({ peerIds: [player(9), player(1), player(5)], placeCount: 3, crewIds: [player(5), player(77)] });
    expect(shownIds).toEqual([player(5), player(1), player(9)]);
  });

  it('never reports a negative count', () => {
    expect(pickShown({ peerIds: [player(1)], placeCount: 0, crewIds: [] }).hiddenCount).toBe(0);
    expect(pickShown({ peerIds: [], placeCount: 0, crewIds: [] })).toEqual({ shownIds: [], hiddenCount: 0 });
  });
});

describe('what to accept', () => {
  const GOOD = {
    v: 1, id: ME, place: 'saltreach_harbor', x: 12.34, z: -5.6, facing: 'left', moving: true, seq: 1762300000000, everyMs: 500,
  };
  const PLACE = 'saltreach_harbor';

  describe('accepts a well-formed position and rejects every malformed one', () => {
    it('accepts a well-formed position and drops fields it does not know', () => {
      const wanted = { id: ME, place: PLACE, x: 12.34, z: -5.6, facing: 'left', moving: true, seq: 1762300000000, everyMs: 500 };
      expect(readPosition(GOOD, PLACE)).toEqual(wanted);
      const withExtras = { ...GOOD, name: 'Evil Captain', login: 'octocat', email: 'a@b.c', extra: { deep: 1 } };
      expect(readPosition(withExtras, PLACE)).toEqual(wanted);
      expect(Object.keys(readPosition(withExtras, PLACE)).sort()).toEqual(Object.keys(wanted).sort());
    });

    it('accepts the edges of every range', () => {
      expect(readPosition({ ...GOOD, x: 200, z: -200 }, PLACE)).not.toBeNull();
      expect(readPosition({ ...GOOD, everyMs: 500 }, PLACE)).not.toBeNull();
      expect(readPosition({ ...GOOD, everyMs: 20000 }, PLACE)).not.toBeNull();
      expect(readPosition({ ...GOOD, seq: 0 }, PLACE)).not.toBeNull();
      expect(readPosition({ ...GOOD, moving: false, facing: 'up' }, PLACE)).not.toBeNull();
    });

    const BAD = [
      ['x is not a number', { x: NaN }],
      ['x is text', { x: '12' }],
      ['x is missing', { x: undefined }],
      ['x is too big', { x: 200.01 }],
      ['z is too small', { z: -200.5 }],
      ['z is infinite', { z: Infinity }],
      ['the facing is not one of four', { facing: 'north' }],
      ['moving is not true or false', { moving: 'yes' }],
      ['the place is another place', { place: 'wreck_point' }],
      ['the place is not a place id', { place: 'Saltreach Harbor' }],
      ['the id is not a uuid', { id: 'captain-1' }],
      ['the id is in capitals', { id: ME.toUpperCase() }],
      ['the gap is under 500', { everyMs: 499 }],
      ['the gap is over 20000', { everyMs: 20001 }],
      ['the gap is not a number', { everyMs: 'fast' }],
      ['the gap is not finite', { everyMs: NaN }],
      ['seq is negative', { seq: -1 }],
      ['seq has a fraction', { seq: 1.5 }],
      ['seq is text', { seq: '5' }],
      ['the version is 2', { v: 2 }],
      ['the version is missing', { v: undefined }],
    ];
    it.each(BAD)('rejects a position where %s', (_label, change) => {
      expect(readPosition({ ...GOOD, ...change }, PLACE)).toBeNull();
    });

    it('rejects a position that is not an object, or when we are in no place', () => {
      expect([null, undefined, 'position', 5, [GOOD], []].map(payload => readPosition(payload, PLACE))).toEqual(nulls(6));
      expect(readPosition(GOOD, null)).toBeNull();
      expect(readPosition(GOOD, undefined)).toBeNull();
    });
  });

  it('accepts only preset emotes', () => {
    expect(EMOTES).toEqual(['wave', 'cheer', 'nod', 'shrug', 'follow_me', 'help']);
    expect(EMOTES.map(emote => readEmote({ v: 1, id: ME, emote, seq: 7 }))).toEqual(EMOTES.map(emote => ({ id: ME, emote, seq: 7 })));
    expect(readEmote({ v: 1, id: ME, emote: 'wave', seq: 7, text: 'hello there', name: 'x' })).toEqual({ id: ME, emote: 'wave', seq: 7 });
  });

  it.each([
    ['the emote is not on the list', { v: 1, id: ME, emote: 'dance', seq: 7 }],
    ['the emote is free text', { v: 1, id: ME, emote: 'hello there', seq: 7 }],
    ['the emote is empty', { v: 1, id: ME, emote: '', seq: 7 }],
    ['the emote is a list', { v: 1, id: ME, emote: ['wave'], seq: 7 }],
    ['seq is negative', { v: 1, id: ME, emote: 'wave', seq: -1 }],
    ['seq is text', { v: 1, id: ME, emote: 'wave', seq: 'x' }],
    ['the id is not a uuid', { v: 1, id: 'someone', emote: 'wave', seq: 7 }],
    ['the version is 2', { v: 2, id: ME, emote: 'wave', seq: 7 }],
    ['it is null', null],
    ['it is text', 'wave'],
    ['it is a list', []],
  ])('rejects an emote where %s', (_label, bad) => {
    expect(readEmote(bad)).toBeNull();
  });

  it('accepts only known crew event kinds with small data', () => {
    expect(CREW_EVENT_KINDS).toEqual(['board_changed', 'finale_changed', 'case_changed', 'partner_changed', 'crew_changed']);
    expect(CREW_EVENT_KINDS.map(kind => readCrewEvent({ v: 1, kind, data: { version: 4 } })))
      .toEqual(CREW_EVENT_KINDS.map(kind => ({ kind, data: { version: 4 } })));
    expect(readCrewEvent({ v: 1, kind: 'crew_changed' })).toEqual({ kind: 'crew_changed', data: {} });
    expect(readCrewEvent({ v: 1, kind: 'crew_changed', data: { version: 1 }, extra: true })).toEqual({ kind: 'crew_changed', data: { version: 1 } });
    // 1024 bytes of compact JSON are fine, 1025 are not, and bytes count, not characters.
    expect(readCrewEvent({ v: 1, kind: 'case_changed', data: { x: 'a'.repeat(1016) } })).not.toBeNull();
    expect(readCrewEvent({ v: 1, kind: 'case_changed', data: { x: 'a'.repeat(1017) } })).toBeNull();
    expect(readCrewEvent({ v: 1, kind: 'case_changed', data: { note: '\u00e9'.repeat(600) } })).toBeNull();
  });

  it.each([
    ['the kind is not known', { v: 1, kind: 'pins_changed', data: {} }],
    ['the kind is empty', { v: 1, kind: '', data: {} }],
    ['the data is a list', { v: 1, kind: 'board_changed', data: [1, 2] }],
    ['the data is text', { v: 1, kind: 'board_changed', data: 'version' }],
    ['the data is null', { v: 1, kind: 'board_changed', data: null }],
    ['the version is 2', { v: 2, kind: 'board_changed', data: {} }],
    ['it is null', null],
    ['it is text', 'board_changed'],
    ['it is a list', []],
  ])('rejects a crew event where %s', (_label, bad) => {
    expect(readCrewEvent(bad)).toBeNull();
  });

  it('reads presence metas and ignores names, logins and unknown fields', () => {
    expect(readPresenceMeta({ v: 1, place: 'saltreach_harbor', room: 2, kit: 'lantern' })).toEqual({ place: 'saltreach_harbor', room: 2, kit: 'lantern' });
    expect(readPresenceMeta({ v: 1, place: null, room: null, kit: null })).toEqual({ place: null, room: null, kit: null }); // at sea
    expect(readPresenceMeta({ v: 1, place: 'home_islet', room: null, kit: 'compass' })).toEqual({ place: 'home_islet', room: null, kit: 'compass' });
    expect(readPresenceMeta({ v: 1, place: 'saltreach_harbor', room: null, kit: null })).toEqual({ place: 'saltreach_harbor', room: null, kit: null });
    const noisy = { v: 1, place: 'wreck_point', room: 1, kit: null, name: 'Evil', login: 'octocat', email: 'a@b.c', presence_ref: 'ref-1' };
    expect(readPresenceMeta(noisy)).toEqual({ place: 'wreck_point', room: 1, kit: null });
    expect(readPresenceMeta({ v: 1 })).toEqual({ place: null, room: null, kit: null });
  });

  it.each([
    ['the version is 2', { v: 2, place: null, room: null, kit: null }],
    ['the place is not a place id', { v: 1, place: 'Bad Place', room: 1, kit: null }],
    ['the room is 0', { v: 1, place: 'wreck_point', room: 0, kit: null }],
    ['the room is 100', { v: 1, place: 'wreck_point', room: 100, kit: null }],
    ['the room has a fraction', { v: 1, place: 'wreck_point', room: 1.5, kit: null }],
    ['the room is text', { v: 1, place: 'wreck_point', room: '1', kit: null }],
    ['there is a room at sea', { v: 1, place: null, room: 3, kit: null }],
    ['the home islet has a room', { v: 1, place: 'home_islet', room: 1, kit: null }],
    ['the kit has capitals', { v: 1, place: null, room: null, kit: 'Lantern' }],
    ['the kit is one letter', { v: 1, place: null, room: null, kit: 'a' }],
    ['the kit is too long', { v: 1, place: null, room: null, kit: 'a'.repeat(25) }],
    ['the kit is text with a space', { v: 1, place: null, room: null, kit: 'old kit' }],
    ['the kit is a number', { v: 1, place: null, room: null, kit: 5 }],
  ])('rejects a presence meta where %s', (_label, meta) => {
    expect(readPresenceMeta(meta)).toBeNull();
  });

  it('rejects a presence meta that is not an object', () => {
    expect([null, undefined, 'here', 3, []].map(readPresenceMeta)).toEqual(nulls(5));
  });

  it('reads the world: valid keys only, the last tab of a player wins, and we count the game', () => {
    const state = {
      [ME]: [{ presence_ref: 'a', v: 1, place: 'saltreach_harbor', room: 1, kit: null }],
      [CREWMATE]: [
        { presence_ref: 'b', v: 1, place: 'wreck_point', room: 1, kit: null },
        { presence_ref: 'c', v: 1, place: 'saltreach_harbor', room: 1, kit: 'compass' }, // a second tab
      ],
      [player(5)]: [{ presence_ref: 'd', v: 1, place: null, room: null, kit: null }],
      'not-a-uuid': [{ presence_ref: 'e', v: 1, place: null, room: null, kit: null }],
      [player(6)]: [{ presence_ref: 'f', v: 7, place: null, room: null, kit: null }], // a shape we do not know
      [player(7)]: [],
    };
    const { peers, online } = readWorld(state, ME);
    expect(online).toBe(3); // me, the crewmate and the player at sea
    expect([...peers.keys()].sort()).toEqual([CREWMATE, player(5)].sort());
    expect(peers.get(CREWMATE)).toEqual({ place: 'saltreach_harbor', room: 1, kit: 'compass' });
    expect(readWorld(undefined, ME)).toEqual({ peers: new Map(), online: 0 });
    expect(readWorld(null, ME).online).toBe(0);
  });

  it('turns the two rate-limit messages of the server into a wait, and ignores the rest', () => {
    expect(readSystemNotice({ message: 'Too many messages per second', status: 'error', extension: 'system' })).toEqual({ minWaitMs: 10000, slow: true });
    expect(readSystemNotice({ message: 'too many messages per second' })).toEqual({ minWaitMs: 10000, slow: true });
    expect(readSystemNotice({ message: 'Too many presence messages per second' })).toEqual({ minWaitMs: 30000, slow: false });
    expect(readSystemNotice({ message: 'Client presence rate limit exceeded' })).toEqual({ minWaitMs: 30000, slow: false });
    const others = [{ message: 'Subscribed to PostgreSQL' }, { message: 5 }, {}, null, undefined, 'Too many messages per second'];
    expect(others.map(readSystemNotice)).toEqual(nulls(6));
  });
});

describe('moving other captains on screen', () => {
  const from = { x: 0, z: 0 };
  const to = { x: 10, z: -4 };

  it("glides from the drawn spot to the new one over the sender's gap and snaps on jumps", () => {
    expect(glide(from, to, 1000, 0)).toEqual({ x: 0, z: 0 });
    expect(glide(from, to, 1000, 250)).toEqual({ x: 2.5, z: -1 });
    expect(glide(from, to, 1000, 500)).toEqual({ x: 5, z: -2 });
    expect(glide(from, to, 1000, 1000)).toEqual(to);
    expect(glide(from, to, 1000, 5000)).toEqual(to); // never overshoots
    expect(glide(from, to, 1000, -50)).toEqual(from); // nor starts before the start
    expect(glide(from, to, 0, 0)).toEqual(to); // a zero gap is an instant move

    // A captain can sprint 6 units a second. In 1.5 gaps that is 4.5 units at a gap of 500 ms.
    expect(shouldSnap(from, { x: 4.5, z: 0 }, 500)).toBe(false);
    expect(shouldSnap(from, { x: 4.6, z: 0 }, 500)).toBe(true);
    expect(shouldSnap(from, { x: 3, z: 3.3 }, 500)).toBe(false); // 4.46 along the diagonal
    expect(shouldSnap(from, { x: 3, z: 3.4 }, 500)).toBe(true); // 4.53 along the diagonal
    expect(shouldSnap(from, { x: 18, z: 0 }, 2000)).toBe(false); // 6 x 1.5 x 2 s
    expect(shouldSnap(from, { x: 18.1, z: 0 }, 2000)).toBe(true);
    expect(shouldSnap(from, from, 500)).toBe(false);
  });

  it('turns a movement into a facing like the local character does', () => {
    // The same choice as createCharacter().face(dx, dz) in src/player/character.js.
    expect(facingFrom(0, -1)).toBe('up'); // away from the camera is the back view
    expect(facingFrom(0, 1)).toBe('down');
    expect(facingFrom(-1, 0)).toBe('left');
    expect(facingFrom(1, 0)).toBe('right');
    expect(facingFrom(1, -2)).toBe('up'); // the longer axis wins
    expect(facingFrom(-3, 2)).toBe('left');
    expect(facingFrom(2, 2)).toBe('right'); // a tie goes to the side view, like the character
    expect(facingFrom(-2, -2)).toBe('left');
    expect(facingFrom(0.0005, 0)).toBe('down'); // too small to count: the facing does not change
    expect(facingFrom(0, 0, 'left')).toBe('left');
    expect(facingFrom(0, 0)).toBe('down');
  });
});

describe('waiting before a retry', () => {
  it('waits longer after each failed join, with jitter, never more than 31 seconds', () => {
    // 1 s + random x min(30 s, 2 s x 2^tries)
    expect([0, 1, 2, 3, 4, 5, 9].map(tries => backoffMs(tries, () => 0))).toEqual([1000, 1000, 1000, 1000, 1000, 1000, 1000]);
    expect([0, 1, 2, 3, 4, 5, 9].map(tries => backoffMs(tries, () => 0.5))).toEqual([2000, 3000, 5000, 9000, 16000, 16000, 16000]);
    const failures = Array.from({ length: 40 }, (_, tries) => tries);
    expect(Math.max(...failures.map(tries => backoffMs(tries, () => 0.999999)))).toBeLessThan(31000);
    expect(Math.min(...failures.map(tries => backoffMs(tries, () => 0)))).toBeGreaterThanOrEqual(1000);
    // The longest wait grows with every failure until the 30 second cap is reached at the fifth.
    const longest = [0, 1, 2, 3, 4, 5].map(tries => backoffMs(tries, () => 0.999999));
    const growth = longest.slice(1, 5).map((wait, i) => wait - longest[i]);
    expect(Math.min(...growth)).toBeGreaterThan(0);
    expect(longest[5]).toBe(longest[4]);
  });

  it('treats a bad try count as the first try, and uses the real random numbers by default', () => {
    expect([-1, NaN, undefined].map(tries => backoffMs(tries, () => 0.5))).toEqual([2000, 2000, 2000]);
    const wait = backoffMs(2);
    expect(wait).toBeGreaterThanOrEqual(1000);
    expect(wait).toBeLessThan(9000);
  });
});

describe('the start, the announcements and the joins', () => {
  it('spreads the first announcements of a class of 30 over 15 seconds, so the busiest second stays near 60 deliveries', () => {
    // Every announcement is delivered to everyone online, so N captains announcing within W seconds
    // cost about N x N / W deliveries a second at the end of that window (docs/INTERFACES.md, section 7).
    const windowSeconds = (START_DELAY_MS + TRACK_JITTER_MS) / 1000;
    expect(START_DELAY_MS).toBe(5000);
    expect(TRACK_JITTER_MS).toBe(10000);
    expect((30 * 30) / windowSeconds).toBe(60);
  });

  it('allows one announcement every 1.5 seconds and one join of a kind of room every second', () => {
    expect(TRACK_GAP_MS).toBe(1500);
    expect(JOIN_GAP_MS).toBe(1000);
  });
});

describe('the text of an error', () => {
  it('gives the message of an error, the text of anything else, and nothing for nothing', () => {
    expect(describeError(new Error('the socket is gone'))).toBe('the socket is gone');
    expect(describeError('plain text')).toBe('plain text');
    expect([undefined, null].map(describeError)).toEqual(['', '']);
  });
});
