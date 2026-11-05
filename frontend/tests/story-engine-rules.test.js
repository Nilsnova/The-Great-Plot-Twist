// Engine rules that the acceptance scenarios (A1-A6) do not pin down, tested one rule at a time.
//
// When the engine was imported, mutation checks (breaking one rule in a copy of the engine on
// purpose, then seeing whether any test notices) found rules that nothing exercised. These tests
// close the gaps. They are NOT from the solo game. The Python engine has the same tests in
// backend/plot_twist/tests/test_engine_rules.py.
//
// Rules the real story can never show, so these tests change a copy of it. In the real story every
// pick-up is already blocked a second time by a "requires" condition, and no ending lists any
// actions, so the engine's own safety rules never get a chance to act:
//   - R2: an item is never collected twice;
//   - an ended story offers no actions and accepts none.
//
// Rules the real story does show, but that A1-A6 never check: "not_flags" hides a choice, a note
// is shown only while its conditions hold, a flag is stored once, an accepted move remembers its
// message, and the three fixed texts for a refused move.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/story/engine.js';
import { story, startGame, play } from './story-fixture.js';

// The three fixed texts for a refused move. The Python engine uses exactly the same words.
const ENDED_TEXT = 'This story has ended. Start a new game to play again.';
const NOT_HERE_TEXT = "You can't do that here.";
const NOT_NOW_TEXT = "You can't do that right now.";

const visibleIds = (game) => game.visibleActions().map(({ action }) => action.id);

// The text of the note in a scene that has exactly these conditions. Notes are found by their
// conditions, not by their place in the list, so adding a note to a scene does not break a test.
const noteText = (sceneId, when) =>
  story.scenes[sceneId].notes.find((note) => JSON.stringify(note.when) === JSON.stringify(when)).text;

describe('engine rules the real story cannot show', () => {
  it('R2: an item is never collected twice, even if the story offers it again', () => {
    const offersKeyAgain = structuredClone(story);
    const takeKey = offersKeyAgain.scenes.desk.actions.find((action) => action.id === 'take_key');
    delete takeKey.requires; // now nothing in the story blocks a second pick-up
    const game = startGame(undefined, offersKeyAgain);
    play(game, 'to_desk', 'take_key', 'take_key'); // the story allows it, so the engine must stop it
    expect(game.state.inventory).toEqual(['brass_key']);
  });
  it('an ended story offers no actions, even if the ending lists some', () => {
    const endingWithAction = structuredClone(story);
    endingWithAction.scenes.ending_rescue.actions = [{ id: 'linger', label: 'Stay', message: 'You stay.' }];
    const game = new Game(endingWithAction);
    game.state = { scene: 'ending_rescue', inventory: [], flags: [], ended: true, message: '' };
    expect(game.visibleActions()).toEqual([]);
    expect(game.perform('linger').accepted).toBe(false);
  });
});

describe('engine rules the real story shows, but A1-A6 never check', () => {
  it('not_flags hides the choices once the harbor is warned', () => {
    const game = startGame();
    play(game, 'to_shore', 'warn_harbor');
    expect(visibleIds(game)).not.toContain('trust_fisherman');
    expect(visibleIds(game)).not.toContain('warn_harbor');
  });
  it('a note is shown only while its conditions hold', () => {
    const game = startGame();
    play(game, 'to_shore', 'trust_fisherman');
    // The check stays an exact list: a player who trusted the fisherman sees these notes, in this
    // order, and no other note. Story v2 added the fisherman note, which shows until the harbor is warned.
    const fishermanNote = noteText('shore', { not_flags: ['warned_harbor'] });
    const trustedNote = noteText('shore', { flags: ['trusted_fisherman'] });
    expect(game.sceneNotes()).toEqual([fishermanNote, trustedNote]);
  });
  it('a flag is stored once, even if its action is repeated', () => {
    const game = startGame();
    play(game, 'to_desk', 'read_log', 'read_log');
    expect(game.state.flags).toEqual(['read_log']);
  });
  it('an accepted move remembers its message', () => {
    const game = startGame();
    play(game, 'to_tower');
    const toTower = story.scenes.cottage.actions.find((action) => action.id === 'to_tower');
    expect(game.state.message).toBe(toTower.message);
  });
  it('a blocked choice without a text of its own says you cannot do that right now', () => {
    const game = startGame();
    play(game, 'to_desk', 'take_key', 'desk_back', 'to_desk'); // the drawer is empty now (A3)
    expect(game.perform('take_key').message).toBe(NOT_NOW_TEXT);
  });
  it('a choice that belongs to another scene says you cannot do that here', () => {
    const game = startGame(); // the player is in the cottage, and "climb" belongs to the stairwell
    expect(game.perform('climb').message).toBe(NOT_HERE_TEXT);
  });
  it('after an ending every choice says the story has ended', () => {
    const game = startGame();
    game.state = { scene: 'ending_rescue', inventory: [], flags: [], ended: true, message: '' };
    expect(game.perform('signal').message).toBe(ENDED_TEXT);
  });
});
