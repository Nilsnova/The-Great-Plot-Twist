// The games of docs/GAME-V3.md §2 in the browser: the fake routes (Create, Join with the 10-player door,
// Continue, the lobby, leave, the membership rule), the island client, the lobby's rules and the room state
// of src/island/game-room.js with ten players in one room (Start, the host away for 60 s, Pause, late joiners).
import {describe, expect, it} from 'vitest';
import {createIslandApi} from '../../src/island/api.js';
import {createFakeIslandTransport, createSharedFakeStore, MAX_MEMBERS} from '../../src/pirates/fake-api.js';
import {GAME_STARTED, HOST_AWAY_MS, MAX_PLAYERS, canControl, lobbyModel, pausedLine} from '../../src/island/lobby.js';
import {createGameRoom} from '../../src/island/game-room.js';
import {readWaveMessage, WAVE_EVENTS} from '../../src/net/live-rules.js';
import {gamesCopy, gameLine, readGameCode} from '../../src/front-door/logic.js';
import {rememberVisit, visitUrl} from '../../src/island/codes.js';

// One shared fake world, one tab per captain (as scripts/check-multiplayer.js does in the browser).
function world() {
  const items = new Map(), storage = {getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value))};
  let n = 0;
  return (playerId, ownerName) => {
    const transport = createFakeIslandTransport({playerId, ownerName, shared: createSharedFakeStore('g', {storage, locks: null})});
    return createIslandApi({transport, makeUid: () => `uid-${playerId}-${String(++n).padStart(4, '0')}`});
  };
}

describe('the games routes of the fake (the server rules of 20261112040000_game_rooms.sql)', () => {
  it('Create answers your own game; Join makes a friend a member for good; Continue lists newest first', async () => {
    const tab = world(), host = tab('me', 'Nils'), ben = tab('ben', 'Ben');
    const created = await host.createGame();
    expect(created.ok).toBe(true);
    expect(created.data.game).toMatchObject({code: 'ISLE-K7Q2M', hostName: 'Nils', role: 'host', members: 1, maxMembers: 10});
    const joined = await ben.joinGame('k7q2m');
    expect(joined.data.game).toMatchObject({code: 'ISLE-K7Q2M', role: 'member', members: 2});
    const again = await ben.joinGame('ISLE-K7Q2M');
    expect(again.data.game.members).toBe(2);
    const list = (await ben.games()).data.games;
    expect(list[0]).toMatchObject({code: 'ISLE-K7Q2M', hostName: 'Nils', role: 'member'});
    expect(list.some(game => game.role === 'host')).toBe(false); // Ben never opened his own island: no game of his own yet
    const fresh = tab('newbie', 'Newbie');
    expect((await fresh.games()).data.games).toEqual([]); // a brand-new player: Create and Join first
    await fresh.createGame();
    expect((await fresh.games()).data.games.map(game => game.role)).toEqual(['host']);
  });
  it('a game takes 10 players and refuses the 11th with 409 game_full', async () => {
    const tab = world(), host = tab('me', 'Nils');
    await host.createGame();
    expect(MAX_MEMBERS).toBe(10);
    for (let i = 1; i <= 9; i++) expect((await tab(`p${i}`, `P${i}`).joinGame('ISLE-K7Q2M')).ok).toBe(true);
    const full = await tab('p10', 'P10').joinGame('ISLE-K7Q2M');
    expect(full).toMatchObject({ok: false, status: 409, code: 'game_full', message: 'This game has 10 players already.'});
    expect((await tab('p3', 'P3').joinGame('ISLE-K7Q2M')).ok).toBe(true); // a member coming back is not new
    expect((await tab('p1', 'P1').leaveGame('ISLE-K7Q2M')).data).toEqual({left: true});
    expect((await tab('p10', 'P10').joinGame('ISLE-K7Q2M')).ok).toBe(true);
  });
  it('the lobby lists the host first and marks you; it is for members only', async () => {
    const tab = world(), host = tab('me', 'Nils'), ben = tab('ben', 'Ben'), ana = tab('ana', 'Ana');
    await host.createGame(); await ben.joinGame('ISLE-K7Q2M');
    const lobby = (await ben.lobby('ISLE-K7Q2M')).data;
    expect(lobby.members).toEqual([{id: 'me', name: 'Nils', role: 'host', you: false}, {id: 'ben', name: 'Ben', role: 'member', you: true}]);
    expect(await ana.lobby('ISLE-K7Q2M')).toMatchObject({ok: false, status: 403, code: 'not_member'});
    expect(await ana.lobby('ISLE-ZZZZZ')).toMatchObject({ok: false, status: 404, code: 'no_such_game'});
  });
  it('only members build, upgrade and ring the bell on a game\'s island; the host cannot leave', async () => {
    const tab = world(), host = tab('me', 'Nils'), ana = tab('ana', 'Ana');
    await host.createGame();
    expect(await ana.build({spot: 'wall_1', kind: 'wall', code: 'ISLE-K7Q2M'})).toMatchObject({ok: false, status: 403, code: 'not_member'});
    expect(await ana.startWave({where: 'ISLE-K7Q2M'})).toMatchObject({ok: false, status: 403, code: 'not_member'});
    await ana.joinGame('ISLE-K7Q2M');
    expect((await ana.build({spot: 'wall_1', kind: 'wall', code: 'ISLE-K7Q2M'})).ok).toBe(true);
    expect(await host.leaveGame('ISLE-K7Q2M')).toMatchObject({ok: false, status: 409, code: 'host_cannot_leave'});
    expect((await ana.leaveGame('ISLE-K7Q2M')).data).toEqual({left: true});
    expect(await ana.build({spot: 'wall_2', kind: 'wall', code: 'ISLE-K7Q2M'})).toMatchObject({ok: false, code: 'not_member'});
  });
  it('the invite route is an alias of join (with no_such_island for an unknown code)', async () => {
    const tab = world(), host = tab('me', 'Nils'), ben = tab('ben', 'Ben');
    await host.createGame();
    expect((await ben.joinInvite('ISLE-K7Q2M')).data.game).toMatchObject({role: 'member'});
    expect(await ben.joinInvite('ISLE-ZZZZZ')).toMatchObject({ok: false, code: 'no_such_island'});
    expect(await ben.joinGame('ISLE-ZZZZZ')).toMatchObject({ok: false, code: 'no_such_game'});
    expect(await ben.joinGame('nope')).toMatchObject({ok: false, code: 'validation_error'});
  });
});

describe('codes, links and the games card', () => {
  it('reads a game code typed either way and shares ?game= links (?visit= still works)', () => {
    expect(readGameCode('isle-k7q2m')).toBe('ISLE-K7Q2M');
    expect(readGameCode('K7Q 2M')).toBe('ISLE-K7Q2M');
    expect(readGameCode('HARBOR-K7QXM')).toBe(null);
    expect(readGameCode('K7Q2O')).toBe(null);
    expect(visitUrl('K7Q2M')).toBe('https://the-great-plot-twist.vercel.app/?game=ISLE-K7Q2M');
    const items = new Map(), storage = {setItem: (key, value) => items.set(key, value), getItem: key => items.get(key) ?? null};
    expect(rememberVisit('?game=isle-k7q2m', storage)).toBe('K7Q2M');
    expect(rememberVisit('?visit=ISLE-FR3ND', storage)).toBe('FR3ND');
  });
  it('a brand-new player sees Create and Join; with games Continue comes first, newest first', () => {
    expect(gamesCopy({games: []})).toMatchObject({continue: null, create: {button: 'Create a game'}, join: {button: 'Join', label: 'Game code'}});
    const copy = gamesCopy({games: [{code: 'ISLE-FR3ND', hostName: 'Captain Gull', role: 'member', waveBest: 7, members: 3},
      {code: 'ISLE-K7Q2M', hostName: 'Nils', role: 'host', waveBest: 0, members: 1}]});
    expect(copy.continue.games.map(game => game.title)).toEqual(["Captain Gull's game · ISLE-FR3ND", 'Your game · ISLE-K7Q2M']);
    expect(copy.continue.games.map(game => game.line)).toEqual(['wave 7 · 3 players', 'no wave yet · 1 player']);
    expect(gameLine({code: 'ISLE-K7Q2M', role: 'host', waveBest: 2, members: 10}).line).toBe('wave 2 · 10 players');
    expect(gamesCopy({signedOut: true}).join.line).toContain('guest');
  });
});

describe('the lobby rules', () => {
  const members = [{id: 'me', name: 'Nils', role: 'host'}, {id: 'ben', name: 'Ben', role: 'member'}, {id: 'ana', name: 'Ana', role: 'member'}];
  it('Start is the host\'s, and passes to any member after the host has been away for 60 s', () => {
    expect(MAX_PLAYERS).toBe(10);
    expect(canControl({me: 'me', hostId: 'me'})).toBe(true);
    expect(canControl({me: 'ben', hostId: 'me', hostAwayMs: HOST_AWAY_MS - 1})).toBe(false);
    expect(canControl({me: 'ben', hostId: 'me', hostAwayMs: HOST_AWAY_MS})).toBe(true);
    expect(canControl({me: null, hostId: 'me', hostAwayMs: 1e9})).toBe(false);
  });
  it('shows the code, the link, who is online and why Start is off', () => {
    const host = lobbyModel({code: 'K7Q2M', members, online: new Set(['ben']), me: 'me', hostId: 'me'});
    expect(host).toMatchObject({title: 'Your game', code: 'ISLE-K7Q2M', url: 'https://the-great-plot-twist.vercel.app/?game=ISLE-K7Q2M',
      count: '3 of 10 players', online: '2 online', start: {show: true, disabled: false, label: 'Start'}});
    expect(host.rows.map(row => [row.name, row.online, row.you, row.tag])).toEqual([['Nils', true, true, 'Host'], ['Ben', true, false, ''], ['Ana', false, false, '']]);
    const member = lobbyModel({code: 'K7Q2M', members, online: new Set(), me: 'ben', hostId: 'me', hostAwayMs: 1000});
    expect(member).toMatchObject({title: "Nils's game", start: {disabled: true, line: 'Waiting for Nils to start.'}});
    expect(lobbyModel({code: 'K7Q2M', members, me: 'ben', hostId: 'me', hostAwayMs: 61000}).start).toMatchObject({disabled: false, line: 'The host is away, so you can start.'});
    expect(lobbyModel({code: 'K7Q2M', members, me: 'ben', hostId: 'me', started: true}).start).toMatchObject({show: false});
    expect(pausedLine('Nils')).toBe('Paused by Nils');
  });
});

// Ten game rooms joined by one room bus that checks every message like the live room does.
function tenPlayers({ids = ['me', ...Array.from({length: 9}, (_, i) => `p${i + 1}`)], live = false} = {}) {
  const clock = {now: 1000}, listeners = [], events = [], timers = [], sent = [];
  const roomFor = id => ({
    send(type, data) {
      if (!WAVE_EVENTS.includes(type)) return false;
      const payload = {v: 1, id: '00000000-0000-4000-8000-000000000001', seq: sent.length, data};
      sent.push({from: id, type});
      for (const listener of listeners) if (listener.id !== id && listener.type === type) {
        const message = readWaveMessage(type, payload);
        if (message) listener.handler(message.data);
      }
      return true;
    },
    on(type, handler) { const item = {id, type, handler}; listeners.push(item); return () => listeners.splice(listeners.indexOf(item), 1); },
  });
  const members = ids.map((id, index) => ({id, name: `Captain ${id}`, role: index === 0 ? 'host' : 'member'}));
  const rooms = new Map(ids.map(id => [id, createGameRoom({room: roomFor(id), emit: event => events.push({...event, at: id}), now: () => clock.now,
    random: () => 0.5, storage: null, later: (run, ms) => { const timer = {run, at: clock.now + ms}; timers.push(timer); return () => timers.splice(timers.indexOf(timer), 1); },
    every: () => () => {}})]));
  const advance = ms => { clock.now += ms; for (const timer of timers.filter(item => item.at <= clock.now)) { timers.splice(timers.indexOf(timer), 1); timer.run(); } };
  const lobby = id => ({game: {code: 'ISLE-K7Q2M', waveBest: 0}, members: members.map(member => ({...member, you: member.id === id}))});
  return {ids, rooms, events, sent, clock, advance, lobby, setAll() { for (const id of ids) rooms.get(id).setGame(lobby(id)); if (live) for (const id of ids) rooms.get(id).setPresence({live: true, ids: ids.filter(other => other !== id)}); }};
}

describe('ten players in one game room', () => {
  it('everyone hears everyone (hello), the host starts, and every lobby gets game_started once', () => {
    const h = tenPlayers();
    h.setAll(); h.advance(10000);
    for (const id of h.ids) expect(h.rooms.get(id).state.online.size).toBe(10);
    expect(h.rooms.get('p4').start()).toBe(false); // not the host
    expect(h.rooms.get('me').start()).toBe(true);
    h.advance(7000);
    const started = h.events.filter(event => event.type === GAME_STARTED);
    expect(started.map(event => event.at).sort()).toEqual([...h.ids].sort());
    expect(started.every(event => event.first === true)).toBe(true);
    for (const id of h.ids) expect(h.rooms.get(id).state.started).toBe(true);
  });
  it('the host away for 60 s hands Start to any member', () => {
    const h = tenPlayers({live: true});
    for (const id of h.ids.slice(1)) {
      h.rooms.get(id).setGame(h.lobby(id));
      h.rooms.get(id).setPresence({live: true, ids: h.ids.slice(1).filter(other => other !== id)}); // the host is not here
    }
    h.advance(30000);
    expect(h.rooms.get('p2').state.canControl).toBe(false);
    h.advance(31000);
    expect(h.rooms.get('p2').state.canControl).toBe(true);
    expect(h.rooms.get('p2').start()).toBe(true);
    h.advance(7000);
    expect(h.events.filter(event => event.type === GAME_STARTED)).toHaveLength(9);
  });
  it('Pause holds the break for the whole room and says who paused; a late joiner learns the state', () => {
    const h = tenPlayers();
    h.setAll(); h.advance(5000);
    expect(h.rooms.get('p5').hold()).toBe(null); // a member while the host is here: no button
    expect(h.rooms.get('me').hold()).toMatchObject({paused: false, label: 'Pause', canToggle: true});
    expect(h.rooms.get('me').togglePause()).toBe(true);
    h.advance(10);
    for (const id of h.ids) expect(h.rooms.get(id).state.paused).toBe(true);
    expect(h.rooms.get('p5').hold()).toMatchObject({paused: true, line: 'Paused by Captain me', label: 'Resume', canToggle: false});
    // A friend who opens the game now hears the state from whoever answers first, and only once.
    const before = h.sent.filter(item => item.type === 'game_state').length;
    h.rooms.get('p9').clear(); h.rooms.get('p9').setGame(h.lobby('p9'));
    h.advance(1000);
    const answers = h.sent.filter(item => item.type === 'game_state').length - before;
    expect(answers).toBe(1);
    expect(h.rooms.get('p9').state.paused).toBe(true);
    h.rooms.get('me').togglePause(); h.advance(10);
    for (const id of h.ids) expect(h.rooms.get(id).state.paused).toBe(false);
  });
});
