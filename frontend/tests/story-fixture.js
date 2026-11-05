// Shared set-up for the story tests. It is not a test file itself.
//
// The fixture is the real story, loaded from backend/content/story.json: the same file the Python
// engine plays, so these tests and the Python tests check the same content. The helpers play it.
//
// Used by: story-engine.test.js and story-engine-rules.test.js.
import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/story/engine.js';

const storyUrl = new URL('../../backend/content/story.json', import.meta.url);
export const story = JSON.parse(readFileSync(storyUrl, 'utf8'));

// Two complete walks through the story, ending in the rescue and in the trapped ending.
export const GOOD_ENDING = ['to_desk', 'take_key', 'read_log', 'desk_back', 'to_shore',
  'take_lantern', 'warn_harbor', 'shore_back', 'to_tower', 'unlock_door', 'climb', 'signal'];
export const TRAPPED_ROUTE = ['to_desk', 'take_key', 'desk_back', 'to_shore', 'take_lantern',
  'trust_fisherman', 'shore_back', 'to_tower', 'unlock_door', 'climb'];

// A new game on the given story (the real one by default) and storage (memory by default).
export function startGame(storage, storyData = story) {
  const game = new Game(storyData, storage);
  game.newGame();
  return game;
}

// Plays the actions in order and fails with a clear message if one is rejected.
export function play(game, ...actionIds) {
  for (const id of actionIds) {
    const result = game.perform(id);
    expect(result.accepted, `${id} was rejected: ${result.message}`).toBe(true);
  }
}

// Closing and reopening the page: a new Game on the same storage, resumed from the save.
export function reopen(game) {
  const reopened = new Game(game.story, game.storage);
  expect(reopened.resume()).toBe(true);
  return reopened;
}

// What the player sees as choices: [action id, allowed] pairs.
export const routes = (game) => game.visibleActions().map(({ action, allowed }) => [action.id, allowed]);
