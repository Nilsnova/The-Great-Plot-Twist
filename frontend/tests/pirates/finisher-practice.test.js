// T28: first-time guidance is personal and practice never advances the scored clock.
import {expect, it} from 'vitest';
import {createPracticeMemory} from '../../src/pirates/finisher/practice.js';
import {createFinisher, FINISHER} from '../../src/pirates/finisher/rules.js';

it('remembers only the player, island and task explicitly finished or skipped', () => {
  const data = new Map(), storage = {getItem: key => data.get(key), setItem: (key, value) => data.set(key, value)};
  const memory = createPracticeMemory({player: 'alice', island: 'ISLE-ABCDE', storage});
  expect(memory.seen('haul')).toBe(false);
  memory.finish('haul');
  expect(createPracticeMemory({player: 'alice', island: 'ISLE-ABCDE', storage}).seen('haul')).toBe(true);
  for (const [player, island, task] of [['bob', 'ISLE-ABCDE', 'haul'], ['alice', 'ISLE-FGHIJ', 'haul'], ['alice', 'ISLE-ABCDE', 'cannon']]) {
    expect(createPracticeMemory({player, island, storage}).seen(task)).toBe(false);
  }
});

it('keeps session memory if storage is blocked without pretending it is account progress', () => {
  const storage = {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}};
  const memory = createPracticeMemory({player: 'alice', island: 'island', storage});
  memory.finish('duel'); expect(memory.seen('duel')).toBe(true);
  expect(createPracticeMemory({player: 'alice', island: 'island', storage}).seen('duel')).toBe(false);
});

function prepared() {
  const f = createFinisher({wave: 5, enabled: true, preparation: true});
  const ship = {id: 'boss_1', kind: 'warship', boss: true, hp: 1, maxHp: 100, x: 0, z: 0};
  f.bind({party: new Map([['a', {id: 'a'}], ['b', {id: 'b'}]]), presentAt: () => true, now: () => 0});
  f.watch(ship); f.begin([]); return f;
}

it('two clients freeze scoring until both captains are ready; duplicates and watchers do nothing', () => {
  const clients = [prepared(), prepared()];
  for (const f of clients) {
    for (let i = 0; i < 40; i++) f.tick([]);
    expect(f.state()).toMatchObject({phase: 'prepare', sample: 0});
    f.input({type: 'finisher_ready', by: 'watcher', shipId: 'boss_1'});
    f.input({type: 'finisher_ready', by: 'a', shipId: 'old_boss'});
    f.input({type: 'finisher_ready', by: 'a', shipId: 'boss_1'});
    f.input({type: 'finisher_ready', by: 'a', shipId: 'boss_1'});
    f.tick([]); expect(f.state().phase).toBe('prepare');
    f.input({type: 'finisher_input', by: 'a', from: FINISHER.intro, marks: [100]});
    expect(f.state().heard).toEqual([]);
    f.input({type: 'finisher_ready', by: 'b', shipId: 'boss_1'});
    f.tick([]); expect(f.state()).toMatchObject({phase: 'intro', sample: 0});
  }
  expect(clients[0].state()).toEqual(clients[1].state());
});

it('an inactive captain cannot block preparation forever and the scored task retains its full time', () => {
  const f = prepared();
  for (let i = 0; i < FINISHER.prepareTicks; i++) f.tick([]);
  expect(f.state()).toMatchObject({phase: 'intro', sample: 0});
  for (let i = 0; i < FINISHER.intro * FINISHER.tick; i++) f.tick([]);
  expect(f.state()).toMatchObject({phase: 'task', sample: FINISHER.intro});
});
