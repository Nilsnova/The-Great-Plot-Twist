// The tutorials' memory (T52): what was explained is kept for the whole device, across island codes and reloads
// (owner, 16 Nov: "once re-entering the island, do not always re-explain things").
import {describe, expect, it} from 'vitest';
import {createTutorialMemory, TUTORIALS_KEY} from '../../src/tutorial/memory.js';
import {createMemory, explains, STORE_KEY} from '../../src/narrator/logic.js';

const memoryStorage = (entries = []) => { const map = new Map(entries); return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map}; };

describe('the tutorials memory', () => {
  it('a card seen on one island code is seen on every other one, also after a reload', () => {
    const storage = memoryStorage(), memory = createTutorialMemory(storage);
    memory.mark('ISLE-AAAAA', ['harbor']);
    expect(memory.seenAnywhere('harbor')).toBe(true);
    expect(memory.game('ISLE-BBBBB')).toBeNull();
    expect(createTutorialMemory(storage).seenAnywhere('harbor')).toBe(true);
  });
  it('keeps the guided start shown for the device, after a reload', () => {
    const storage = memoryStorage(), memory = createTutorialMemory(storage);
    expect(memory.guided()).toBe(false);
    memory.setGuided();
    expect(createTutorialMemory(storage).guided()).toBe(true);
    expect(JSON.parse(storage.map.get(TUTORIALS_KEY)).guided).toBe(true);
  });
  it('reads a guide begun or finished in an older memory as shown', () => {
    for (const guide of [{status: 'done', step: 7}, {status: 'skipped', step: 2}, {status: 'active', step: 3}]) {
      const storage = memoryStorage([[TUTORIALS_KEY, JSON.stringify({version: 1, seen: [], games: {'ISLE-AAAAA': {guide}}})]]);
      expect(createTutorialMemory(storage).guided()).toBe(true);
    }
    const fresh = memoryStorage([[TUTORIALS_KEY, JSON.stringify({version: 1, seen: [], games: {'ISLE-AAAAA': {guide: {status: 'active', step: 0}}}})]]);
    expect(createTutorialMemory(fresh).guided()).toBe(false);
  });
});

describe('the narrator memory', () => {
  it('knows which lines explain the game', () => {
    for (const trigger of ['game_opening', 'wave_start:1', 'wave_unlock:5', 'boarders_ashore', 'guide:shoot', 'wave_event:storm']) expect(explains(trigger)).toBe(true);
    for (const trigger of ['game_welcome_back', 'wave_start:100', 'wave_every_ten:10', 'wave_milestone:25', 'victory', 'wave_won']) expect(explains(trigger)).toBe(false);
  });
  it('an explaining line told on one island is told on every island, also after a reset (T53) and a reload', () => {
    const storage = memoryStorage(), memory = createMemory(storage);
    memory.mark('ISLE-AAAAA', ['game_opening', 'wave_milestone:25']);
    memory.remember(['game_opening']);
    expect(memory.told('ISLE-BBBBB').has('game_opening')).toBe(true);
    expect(memory.told('ISLE-BBBBB').has('wave_milestone:25')).toBe(false); // the story stays per island
    memory.forget('ISLE-AAAAA');
    expect(memory.told('ISLE-AAAAA').has('game_opening')).toBe(true);
    expect(memory.toldHere('ISLE-AAAAA').size).toBe(0);
    expect(createMemory(storage).everywhere('game_opening')).toBe(true);
  });
  it('reads the explaining triggers of an older memory as told on the device', () => {
    const storage = memoryStorage([[STORE_KEY, JSON.stringify({version: 1, games: {'ISLE-AAAAA': {told: ['game_opening', 'opening_1', 'wave_start:1', 'wave_milestone:25']}}})]]);
    const memory = createMemory(storage);
    expect(memory.told('ISLE-BBBBB').has('game_opening')).toBe(true);
    expect(memory.told('ISLE-BBBBB').has('wave_start:1')).toBe(true);
    expect(memory.told('ISLE-BBBBB').has('wave_milestone:25')).toBe(false);
  });
});
