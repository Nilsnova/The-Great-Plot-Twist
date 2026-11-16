// T51 (found by Nicolas Radomski): a signed-out player who presses Play sees the Play card first, over open
// water. No intro, no How to play pages, no goal card and no island until they have a game.
import {describe, expect, it, vi} from 'vitest';
import {createFrontDoor} from '../../src/front-door/index.js';
import {signedOutPlayer} from '../../src/front-door/logic.js';

function memory() {
  const map = new Map();
  return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)};
}
function setup({account = 'signed_out', mode = 'online', choice = null, seen = false} = {}) {
  const calls = {lore: 0, tutorial: 0, card: 0, begin: 0, arrival: 0, leave: 0, games: 0};
  const lane = {api: {}};
  const runtime = {gameLane: async () => lane, begin: async () => { calls.begin++; }, playArrival: async () => { calls.arrival++; }, openLobby() {}};
  const storage = memory(); if (seen) storage.setItem('plot_twist_front_door_v1', '1');
  const door = createFrontDoor({container: {}, storage, session: memory(), openAccount: () => {},
    loadPlayer: async () => { calls.lore++; throw new Error('no intro for a signed-out player'); },
    loadTutorial: async () => { calls.tutorial++; throw new Error('no pages for a signed-out player'); },
    loadGames: async () => ({chooseGame: () => { calls.games++; return {done: Promise.resolve(choice), close() {}, dispose() {}}; }})});
  const adapter = {read: () => ({mode, account: {state: account}}), signIn: async () => ({})};
  const run = () => door.run({loadGame: async () => runtime, adapter, leave: () => { calls.leave++; }});
  return {calls, run};
}

describe('signed-out Play', () => {
  it('knows a signed-out player: online, not signed in', () => {
    expect(signedOutPlayer({mode: 'online', account: {state: 'signed_out'}})).toBe(true);
    expect(signedOutPlayer({mode: 'online', account: {state: 'signed_in'}})).toBe(false);
    expect(signedOutPlayer({mode: 'local', account: {state: 'signed_out'}})).toBe(false);
    expect(signedOutPlayer(null)).toBe(false);
  });

  it('shows the Play card first, with no intro, no tutorial, no goal and no island', async () => {
    const {calls, run} = setup();
    expect(await run()).toBe(false);
    expect(calls).toEqual({lore: 0, tutorial: 0, card: 0, begin: 0, arrival: 0, leave: 1, games: 1});
  });

  it('a guest who joins a game is taken to its island (the guided start is the tutorial lane\'s)', async () => {
    const {calls, run} = setup({account: 'signed_in', seen: true, choice: {code: 'ISLE-K7Q2M', role: 'member', joined: true}});
    expect(await run()).toBe(true);
    expect(calls).toMatchObject({games: 1, begin: 1, leave: 0, lore: 0, tutorial: 0});
  });
});
