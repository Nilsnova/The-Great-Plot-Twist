// The narrator's pure rules: the lines file, line selection, once per island game, and the queue.
import {describe, expect, it} from 'vitest';
import data from '../../src/narrator/lines.json';
import {indexLines, selectLines, parseTrigger, ruleFor, startTriggers, finishTriggers, wonLineDue, readingMs,
  gameKey, createMemory, createQueue, STORE_KEY, MAX_GAMES, PRIORITY} from '../../src/narrator/logic.js';

const memoryStorage = () => { const map = new Map(); return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map}; };

describe('the lines file', () => {
  it('holds 50 to 90 short narrator lines with unique ids and known triggers', () => {
    const lines = data.lines;
    expect(lines.length).toBeGreaterThanOrEqual(50);
    expect(lines.length).toBeLessThanOrEqual(90); // 57 lines, plus 22 for the wave events and the boss finishers (v3 waves)
    expect(new Set(lines.map(line => line.id)).size).toBe(lines.length);
    for (const line of lines) {
      expect(line.id).toMatch(/^[a-z0-9_]{1,48}$/);
      expect(line.voice).toBe('narrator');
      expect(line.text.length).toBeLessThanOrEqual(220);
      expect(line.text.split(/[.!?](\s|$)/).filter(part => part && part.trim()).length).toBeLessThanOrEqual(3);
      expect(ruleFor(line.trigger), line.trigger).not.toBeNull();
      expect([1, 2, 3]).toContain(line.priority);
    }
  });
  it('covers the opening, waves 1 to 5, every unlock of the campaign table and the big moments', () => {
    const index = indexLines(data.lines);
    const needed = ['game_opening', 'game_welcome_back', 'wave_start:1', 'wave_start:2', 'wave_start:3', 'wave_start:4', 'wave_start:5',
      'boss_first', 'wave_start:100', 'victory', 'boarders_ashore', 'player_fell', 'player_revived', 'all_fallen', 'heart_low', 'wave_lost', 'wave_won',
      ...[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 50].map(wave => `wave_unlock:${wave}`),
      ...[10, 20, 30, 40, 50, 60, 70, 80, 90].map(wave => `wave_every_ten:${wave}`),
      ...[25, 50, 75].map(wave => `wave_milestone:${wave}`)];
    for (const trigger of needed) expect(index.get(trigger)?.length ?? 0, trigger).toBeGreaterThan(0);
    // v3 waves: every wave event's first time, and each finisher kind's start, success and failure.
    for (const id of ['fog_bank', 'storm', 'night_raid', 'fire_ships', 'pincer', 'armada', 'siege_barge', 'treasure_galleon', 'smugglers', 'kraken'])
      expect(index.get(`wave_event:${id}`)?.length, id).toBe(1);
    for (const kind of ['haul', 'cannon', 'duel', 'redtide']) for (const phase of ['start', 'won', 'failed'])
      expect(index.get(`finisher_${phase}:${kind}`)?.length, `${phase} ${kind}`).toBe(1);
    expect(index.get('wave_won').length).toBeGreaterThanOrEqual(3);
    expect(index.get('wave_lost').length).toBeGreaterThanOrEqual(3);
    // One line for each thing the table opens: captain and houses after wave 1, level 2 and the mortar after 2 ...
    expect(index.get('wave_unlock:1').map(line => line.id)).toEqual(['unlock_captain', 'unlock_houses']);
    expect(index.get('wave_unlock:5').map(line => line.id)).toEqual(['unlock_inner_walls', 'unlock_carpenter']);
  });
  it('generates the most important lines first: the opening, waves 1 to 5 and the unlocks up to wave 10', () => {
    const first = data.lines.filter(line => line.priority === 1).map(line => line.trigger);
    expect(first).toContain('game_opening');
    for (const wave of [1, 2, 3, 4, 5]) expect(first).toContain(`wave_start:${wave}`);
    for (const wave of [1, 2, 3, 4, 5, 6, 7, 8, 10]) expect(first).toContain(`wave_unlock:${wave}`);
  });
});

describe('line selection', () => {
  const index = indexLines(data.lines);
  it('parses wave triggers and skips broken lines', () => {
    expect(parseTrigger('wave_unlock:12')).toEqual({name: 'wave_unlock', wave: 12});
    expect(parseTrigger('game_opening')).toEqual({name: 'game_opening', wave: null});
    const small = indexLines([{id: 'Bad id', trigger: 'wave_won', text: 'x'}, {id: 'ok', trigger: 'nope', text: 'x'},
      {id: 'empty', trigger: 'wave_won', text: '  '}, {id: 'good', trigger: 'wave_won', text: 'Well done.'}]);
    expect([...small.keys()]).toEqual(['wave_won']);
    expect(small.get('wave_won').map(line => line.id)).toEqual(['good']);
  });
  it('plays a sequence in order and only what was not told yet', () => {
    expect(selectLines(index, 'game_opening').map(line => line.id)).toEqual(['opening_1', 'opening_2']);
    expect(selectLines(index, 'game_opening', {told: new Set(['opening_1'])}).map(line => line.id)).toEqual(['opening_2']);
    expect(selectLines(index, 'game_opening', {told: new Set(['game_opening'])})).toEqual([]);
    expect(selectLines(index, 'wave_unlock:9')).toEqual([]);
  });
  it('picks one variant by the wave number, also when it was heard before', () => {
    const won = index.get('wave_won');
    expect(selectLines(index, 'wave_won', {seed: 0})).toEqual([won[0]]);
    expect(selectLines(index, 'wave_won', {seed: 6})).toEqual([won[6 % won.length]]);
    expect(selectLines(index, 'wave_won', {seed: 6, told: new Set(['wave_won', won[2].id])})).toEqual([won[2]]);
  });
  it('maps waves to their moments', () => {
    expect(startTriggers(1)).toEqual(['wave_start:1']);
    expect(startTriggers(7)).toEqual([]);
    expect(startTriggers(20, {boss: true})).toEqual(['wave_every_ten:20', 'boss_first']);
    expect(startTriggers(5, {boss: true})).toEqual(['wave_start:5']);
    expect(startTriggers(100)).toEqual(['wave_start:100']);
    expect(startTriggers(0)).toEqual([]);
    // The unlock lines come with campaign_unlocked (GAME-V3.md §4), not with the wave's result.
    expect(finishTriggers(3, true)).toEqual(['wave_milestone:3']);
    expect(finishTriggers(100, true)).toEqual(['victory']);
    expect(finishTriggers(4, false)).toEqual(['wave_lost']);
    expect(finishTriggers(null, true)).toEqual(['wave_won']);
    // A wave that opens something (4, 12) waits for its unlock lines; 9 opens nothing, 11 is not every third.
    expect([wonLineDue(4), wonLineDue(9), wonLineDue(11), wonLineDue(12), wonLineDue(21)]).toEqual([false, true, false, false, true]);
  });
  it('gives a caption without audio a reading time between 3 and 11 seconds', () => {
    expect(readingMs('Hi.')).toBe(3000);
    expect(readingMs('x'.repeat(120))).toBe(1200 + 120 * 65);
    expect(readingMs('x'.repeat(400))).toBe(11000);
  });
});

describe('once per island game', () => {
  it('normalizes island codes and keeps other places apart', () => {
    expect(gameKey('isle-k7q2m')).toBe('ISLE-K7Q2M');
    expect(gameKey('K7Q2M')).toBe('ISLE-K7Q2M');
    expect(gameKey('ISLE-K7Q2M')).toBe('ISLE-K7Q2M');
    expect(gameKey('pirate_point')).toBe('pirate_point');
    expect(gameKey(null)).toBe('local');
    expect(gameKey('nonsense code')).toBe('local');
  });
  it('remembers what was told per code in localStorage and survives a reload', () => {
    const storage = memoryStorage();
    const memory = createMemory(storage);
    memory.mark('ISLE-K7Q2M', ['game_opening', 'opening_1']);
    expect(memory.told('ISLE-K7Q2M').has('opening_1')).toBe(true);
    expect(memory.known('ISLE-AAAAA')).toBe(false);
    const again = createMemory(storage);
    expect([...again.told('ISLE-K7Q2M')]).toEqual(['game_opening', 'opening_1']);
    expect(JSON.parse(storage.map.get(STORE_KEY)).version).toBe(1);
  });
  it('keeps only the newest games and works without storage', () => {
    let clock = 0;
    const storage = memoryStorage(), memory = createMemory(storage, {now: () => ++clock});
    for (let index = 0; index < MAX_GAMES + 5; index++) memory.mark(`ISLE-${String(index).padStart(5, 'A')}`, ['x']);
    expect(Object.keys(JSON.parse(storage.map.get(STORE_KEY)).games)).toHaveLength(MAX_GAMES);
    const broken = createMemory({getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }});
    broken.mark('local', ['a']);
    expect(broken.told('local').has('a')).toBe(true);
  });
});

describe('the queue', () => {
  const line = id => ({id, text: id});
  it('plays one at a time, the highest priority first, then the oldest', () => {
    const queue = createQueue({now: () => 0});
    queue.push(line('won'), {priority: PRIORITY.LOW});
    queue.push(line('unlock_a'), {priority: PRIORITY.HIGH});
    queue.push(line('unlock_b'), {priority: PRIORITY.HIGH});
    queue.push(line('unlock_a'), {priority: PRIORITY.HIGH}); // already queued
    expect(queue.ids).toEqual(['won', 'unlock_a', 'unlock_b']);
    expect([queue.next().line.id, queue.next().line.id, queue.next().line.id, queue.next()]).toEqual(['unlock_a', 'unlock_b', 'won', null]);
  });
  it('drops stale lines past their ttl and below a priority, and the lowest when full', () => {
    let time = 0;
    const queue = createQueue({now: () => time, limit: 3});
    queue.push(line('fell'), {priority: PRIORITY.NORMAL, ttl: 6000});
    queue.push(line('unlock'), {priority: PRIORITY.HIGH, ttl: null});
    time = 7000;
    expect(queue.ids).toEqual(['unlock']);
    queue.push(line('won_1'), {priority: PRIORITY.LOW});
    queue.push(line('won_2'), {priority: PRIORITY.LOW});
    queue.push(line('lost'), {priority: PRIORITY.NORMAL});
    expect(queue.ids).toEqual(['unlock', 'won_2', 'lost']);
    queue.dropBelow(PRIORITY.HIGH);
    expect(queue.ids).toEqual(['unlock']);
  });
});
