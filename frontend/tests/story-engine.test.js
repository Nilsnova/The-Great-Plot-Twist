// Tests for the story engine (src/story/engine.js): the acceptance scenarios A1-A6 of the solo
// game and the way progress is saved. The story is the real one, loaded by story-fixture.js from
// backend/content/story.json.
import { describe, it, expect } from 'vitest';
import { Game, memoryStorage, browserStorage, SAVE_KEY } from '../src/story/engine.js';
import { story, GOOD_ENDING, TRAPPED_ROUTE, startGame, play, reopen, routes } from './story-fixture.js';

describe('acceptance scenarios', () => {
  it('A1: a locked route stays locked and changes nothing', () => {
    const game = startGame();
    play(game, 'to_tower');
    const before = structuredClone(game.state);
    const result = game.perform('unlock_door');
    expect(result.accepted).toBe(false);
    expect(result.message).toContain('key');
    expect(game.state).toEqual(before);
  });
  it('A2: an unlocked route opens and the key is not used up', () => {
    const game = startGame();
    play(game, 'to_desk', 'take_key', 'desk_back', 'to_tower', 'unlock_door');
    expect(game.state.scene).toBe('stairwell');
    expect(game.state.inventory).toContain('brass_key');
  });
  it('A3: an item is never collected twice', () => {
    const game = startGame();
    play(game, 'to_desk', 'take_key', 'desk_back', 'to_desk');
    expect(game.visibleActions().map(({ action }) => action.id)).not.toContain('take_key');
    expect(game.perform('take_key').accepted).toBe(false);
    expect(game.state.inventory.filter((id) => id === 'brass_key')).toHaveLength(1);
    expect(game.sceneNotes()).toContain('The drawer is empty now. You already took the key.');
  });
  it('A4: resuming restores the scene, items, decisions and visible routes', () => {
    const game = startGame();
    play(game, 'to_shore', 'take_lantern', 'warn_harbor');
    const resumed = reopen(game);
    expect(resumed.state.scene).toBe('shore');
    expect(resumed.state.inventory).toEqual(['oil_lantern']);
    expect(resumed.state.flags).toEqual(['warned_harbor']);
    expect(routes(resumed)).toEqual(routes(game));
  });
  it('A5: warning the harbor leads to the rescue ending', () => {
    const game = startGame();
    play(game, ...GOOD_ENDING);
    expect(game.state.ended).toBe(true);
    expect(game.state.scene).toBe('ending_rescue');
  });
  it('A5: trusting the fisherman blocks the signal and leads to the trapped ending', () => {
    const game = startGame();
    play(game, ...TRAPPED_ROUTE);
    expect(game.perform('signal').accepted).toBe(false);
    play(game, 'untie');
    expect(game.state.scene).toBe('ending_trapped');
  });
  it('A5: once the story has ended, no action changes anything', () => {
    const game = startGame();
    play(game, ...TRAPPED_ROUTE, 'untie');
    const finished = structuredClone(game.state);
    expect(game.visibleActions()).toEqual([]);
    expect(game.perform('signal').accepted).toBe(false);
    expect(game.perform('untie').accepted).toBe(false);
    expect(game.state).toEqual(finished);
    expect(reopen(game).state).toEqual(finished);
  });
  it('A6: restarting resets everything, and not restarting changes nothing', () => {
    const game = startGame();
    play(game, 'to_shore', 'take_lantern', 'trust_fisherman');
    const saved = structuredClone(game.state);
    expect(reopen(game).state).toEqual(saved); // cancelling means newGame() is never called
    game.newGame();
    const fresh = { scene: 'cottage', inventory: [], flags: [], ended: false, message: '' };
    expect(game.state).toEqual(fresh);
    expect(reopen(game).state).toEqual(fresh);
  });
  it('R4: playing never changes the story data', () => {
    const copy = structuredClone(story);
    play(startGame(), ...GOOD_ENDING);
    expect(story).toEqual(copy);
  });
});

describe('saving and storage', () => {
  it('keeps progress in memory by default, separate for every game', () => {
    play(startGame(), 'to_desk');
    expect(new Game(story).hasSave()).toBe(false);
  });
  it.each([
    ['text that is not JSON', 'not json'],
    ['JSON that is not a save', 'null'],
    ['a scene the story does not have', '{"scene":"moon_base","inventory":[],"flags":[],"ended":false}'],
    ['an item the story does not have', '{"scene":"cottage","inventory":["gold"],"flags":[],"ended":false}'],
    ['an "ended" that is not true or false', '{"scene":"cottage","inventory":[],"flags":[],"ended":"yes"}'],
  ])('ignores a save with %s', (_description, text) => {
    const storage = memoryStorage();
    storage.write(text);
    const game = new Game(story, storage);
    expect(game.hasSave()).toBe(false);
    expect(game.resume()).toBe(false);
    expect(game.state.scene).toBe('cottage');
  });
  it('browserStorage saves under its own key in the storage area it is given', () => {
    const data = new Map();
    const area = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    const game = startGame(browserStorage(area));
    play(game, 'to_desk');
    expect(JSON.parse(data.get(SAVE_KEY)).scene).toBe('desk');
    expect(reopen(game).state.scene).toBe('desk');
  });
  it('browserStorage lets the player keep playing when the browser refuses to store', () => {
    const denied = () => { throw new Error('denied'); };
    const game = startGame(browserStorage({ getItem: denied, setItem: denied }));
    expect(game.perform('to_desk').accepted).toBe(true);
    expect(game.hasSave()).toBe(false);
  });
});
