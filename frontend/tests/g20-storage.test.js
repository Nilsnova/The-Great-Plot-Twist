// Browser-local persistence contracts; storage is isolated in memory, never a network service.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/story/engine.js';
import { browserStorage, memoryStorage, SAVE_KEY } from '../src/story/storage.js';
import { parseSavedState } from '../src/story/saves.js';
import { introJournal, INTRO_JOURNAL_KEY } from '../src/story/intro-journal.js';
import { story, startGame, play } from './story-fixture.js';
afterEach(() => vi.unstubAllGlobals());
const save = () => ({ scene: story.start, inventory: [], flags: [], ended: false, message: 'A remembered line' });

describe('G20 local save validation', () => {
  it.each([
    ['missing scene', s => { delete s.scene; }],
    ['inherited scene name', s => { s.scene = 'constructor'; }],
    ['non-array inventory', s => { s.inventory = {}; }],
    ['unknown item', s => { s.inventory = ['g20_unknown_item']; }],
    ['inherited item name', s => { s.inventory = ['toString']; }],
    ['non-array flags', s => { s.flags = 'read_log'; }],
    ['missing ended', s => { delete s.ended; }],
    ['numeric ended', s => { s.ended = 1; }],
  ])('rejects %s', (_name, mutate) => {
    const value = save(); mutate(value); expect(parseSavedState(JSON.stringify(value), story)).toBeNull();
  });
  it('defaults an absent message and discards unrelated stored fields', () => {
    const value = save(); delete value.message; value.extra = 'not game state';
    expect(parseSavedState(JSON.stringify(value), story)).toEqual({ ...save(), message: '' });
  });
  it('returns independent state on every load', () => {
    const text = JSON.stringify(save()), first = parseSavedState(text, story);
    first.inventory.push('brass_key'); first.flags.push('read_log');
    expect(parseSavedState(text, story)).toEqual(save());
  });
  // G20-S1 regression: a saved flag array must contain only strings.
  it('G20-S1: rejects non-string flag members in a corrupt local save', () => {
    expect(parseSavedState(JSON.stringify({ ...save(), flags: [null, {}, 12] }), story)).toBeNull();
  });
});

describe('G20 storage adapters', () => {
  it('writes accepted moves only, restores without overwriting storage and resets on new game', () => {
    const data = new Map(), setItem = vi.fn((key, text) => data.set(key, text));
    const area = { getItem: key => data.get(key) ?? null, setItem };
    const game = startGame(browserStorage(area)); play(game, 'to_desk', 'take_key');
    expect(setItem).toHaveBeenCalledTimes(3);
    expect(game.perform('to_shore').accepted).toBe(false); expect(setItem).toHaveBeenCalledTimes(3);
    const restored = new Game(story, browserStorage(area)); expect(restored.resume()).toBe(true);
    expect(restored.state).toEqual(game.state); expect(setItem).toHaveBeenCalledTimes(3);
    restored.newGame(); expect(restored.state).toEqual(saveWithEmptyMessage());
    expect([...data.keys()]).toEqual([SAVE_KEY]);
  });
  it('reports quota/read failure without crashing or sharing fallback memory', () => {
    expect(browserStorage(undefined).read()).toBeNull(); expect(browserStorage(undefined).write('text')).toBe(false);
    const first = memoryStorage(), second = memoryStorage(); expect(first.write('one')).toBe(true);
    expect(first.read()).toBe('one'); expect(second.read()).toBeNull();
  });
  it('keeps the move journal separate from engine saves', () => {
    const data = new Map([[SAVE_KEY, 'existing game']]);
    vi.stubGlobal('window', { localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } });
    const journal = introJournal(); expect(journal.read()).toBeNull(); journal.write('["to_desk"]');
    expect(introJournal().read()).toBe('["to_desk"]'); expect(data.get(SAVE_KEY)).toBe('existing game');
    expect([...data.keys()].sort()).toEqual([SAVE_KEY, INTRO_JOURNAL_KEY].sort());
  });
  it('survives denied access to the localStorage property itself', () => {
    vi.stubGlobal('window', Object.defineProperty({}, 'localStorage', { get() { throw new Error('denied'); } }));
    const journal = introJournal(); expect(journal.read()).toBeNull(); expect(() => journal.write('[]')).not.toThrow();
  });
});
function saveWithEmptyMessage() { return { ...save(), message: '' }; }
