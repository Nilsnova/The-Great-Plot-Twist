import {describe, expect, it} from 'vitest';
import {createDefenseReport, REPORT_STRUCTURE_LIMIT} from '../../src/pirates/defense-report.js';
import {reportEnding} from '../../src/pirates/defense-report-feature.js';
import {mountPirates} from '../../src/pirates/index.js';
import {wireWaves} from '../../src/pirates/game-wiring.js';
import {menuExtras} from '../../src/shell/menu-extras.js';
import {setWaveFinisher} from '../../src/island/wave-hooks.js';

const defenses = [{id: 'wall_1', kind: 'wall', x: 2, z: 3}, {id: 'cannon_1', kind: 'cannon', x: 4, z: 5}];
const start = (report, waveId = 'w1') => report.begin({waveId, wave: 1, context: 'A'}, defenses);
const end = report => report.events([{type: 'wave_ended', reason: 'island_lost'}]);

describe('local defense report', () => {
  it('sums identical real hits, attributed damage and heart loss without changing its inputs', () => {
    const report = createDefenseReport(); start(report);
    const event = Object.freeze({type: 'wall_damaged', wallId: 'wall_1', damage: 10, hp: 10});
    report.events([event, event, {type: 'ship_hit', by: 'cannon_1', damage: 12.5}, {type: 'boarder_hit', by: 'cannon_1', damage: 2.5}, {type: 'island_damaged', damage: 7}]); end(report);
    const value = report.read('A');
    expect(value.heartDamage).toBe(7); expect(value.structures.map(row => [row.taken, row.dealt])).toEqual([[20, 0], [0, 15]]);
    value.structures[0].taken = 999; expect(report.read('A').structures[0].taken).toBe(20);
    expect(event.damage).toBe(10); expect(value.partial).toBe(true);
  });
  it('counts real zero-HP transitions and a later rebuilt structure, not redraws or zero damage', () => {
    const report = createDefenseReport(); start(report);
    report.events([{type: 'wall_damaged', wallId: 'wall_1', damage: 0, hp: 0},
      {type: 'wall_rebuilt', wallId: 'wall_1', hp: 20}, {type: 'wall_damaged', wallId: 'wall_1', damage: 20, hp: 0},
      {type: 'wall_damaged', wallId: 'wall_1', damage: 0, hp: 0}, {type: 'wall_repaired', wallId: 'wall_1', hp: 20},
      {type: 'wall_damaged', wallId: 'wall_1', damage: 20, hp: 0}]); end(report);
    expect(report.read('A').structures[0].breaks).toBe(2);
    report.events([{type: 'wall_damaged', wallId: 'wall_1', damage: 20, hp: 0}]);
    expect(report.read('A').structures[0].breaks).toBe(2);
  });
  it('retains raw recorded hit damage without pretending it is exact HP loss', () => {
    const report = createDefenseReport(); start(report);
    report.events([{type: 'wall_damaged', wallId: 'wall_1', damage: 10, hp: 5},
      {type: 'wall_damaged', wallId: 'wall_1', damage: 20, hp: 0}]); end(report);
    // Legacy ship shells report raw damage even when only 5 HP remained.
    expect(report.read('A').structures[0]).toMatchObject({taken: 30, breaks: 1});
  });
  it('does not reset a duplicate start, and explicitly clears before rebuilding a replay', () => {
    const report = createDefenseReport(); start(report);
    report.events([{type: 'island_damaged', damage: 3}]); start(report); end(report);
    expect(report.read('A').heartDamage).toBe(3);
    report.clear(); start(report); report.events([{type: 'island_damaged', damage: 3}]); end(report);
    expect(report.read('A').heartDamage).toBe(3);
  });
  it('keeps payout pending until a valid confirmed amount and ignores old or conflicting updates', () => {
    const report = createDefenseReport(); start(report); end(report);
    expect(report.read('A').payout).toEqual({status: 'pending', coins: null});
    report.payout('wrong', {status: 'confirmed', coins: 99}); report.payout('w1', {status: 'confirmed', coins: NaN});
    expect(report.read('A').payout.status).toBe('pending');
    start(report, 'w2'); report.payout('w1', {status: 'confirmed', coins: 35}); report.payout('w1', {status: 'refused'});
    expect(report.read('A').payout).toEqual({status: 'confirmed', coins: 35});
    end(report); expect(report.read('A').payout.status).toBe('pending'); expect(report.read('B')).toBe(null);
  });
  it('bounds structure memory and ignores unknown attackers or invalid damage', () => {
    const report = createDefenseReport(); report.begin({waveId: 'w', context: 'A'}, Array.from({length: 200}, (_, i) => ({id: `wall_${i}`, kind: 'wall'})));
    report.events([{type: 'island_damaged', damage: NaN}, {type: 'island_damaged', damage: -1}, {type: 'ship_hit', by: 'unknown', damage: 100}]); end(report);
    expect(report.read('A').structures).toHaveLength(REPORT_STRUCTURE_LIMIT); expect(report.read('A').heartDamage).toBe(0);
    report.clear(); expect(report.read('A')).toBe(null);
  });
  it('shows the saved result instead of a conflicting local end reason', () => {
    const report = createDefenseReport(); start(report); end(report);
    report.payout('w1', {status: 'confirmed', coins: 15, survived: true});
    expect(reportEnding(report.read('A'))).toBe('Wave won');
    expect(report.read('A').reason).toBe('island_lost'); // Local observations keep their source.
    start(report, 'w2'); report.events([{type: 'wave_ended', reason: 'all_sunk'}]);
    report.payout('w2', {status: 'confirmed', coins: 0, survived: false});
    expect(reportEnding(report.read('A'))).toBe('Wave lost');
  });
  it('keeps an unconfirmed recovery result neutral while preserving legacy end reasons', () => {
    const report = createDefenseReport();
    report.begin({waveId: 'r1', wave: 1, context: 'A', recovery: true}, defenses); end(report);
    expect(reportEnding(report.read('A'))).toBe('Result awaiting confirmation');
    report.payout('r1', {status: 'confirmed', coins: 15, survived: true});
    expect(reportEnding(report.read('A'))).toBe('Wave won');
    start(report, 'legacy'); end(report);
    expect(reportEnding(report.read('A'))).toBe('The island fell');
  });
  it('keeps an unfinished replaced wave for its later receipt without changing the current report', () => {
    const report = createDefenseReport(); start(report);
    report.events([{type: 'island_damaged', damage: 7}]);
    start(report, 'w2');
    report.payout('w1', {status: 'confirmed', coins: 15, survived: true});
    expect(report.read('A')).toMatchObject({waveId: 'w1', survived: true, heartDamage: 7});
    report.events([{type: 'island_damaged', damage: 3}]); end(report);
    expect(report.read('A')).toMatchObject({waveId: 'w2', heartDamage: 3, payout: {status: 'pending'}});
    expect(reportEnding(report.read('A'))).toBe('The island fell');
  });
});

it('mountPirates forwards the real island simulation to the report hook', () => {
  const handlers = new Map(), observed = [];
  const on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); };
  const emit = event => { for (const fn of [...(handlers.get(event.type) ?? [])]) fn(event); };
  const mounted = mountPirates({on, emit, loop: false, battleGuide: false, world: {current: {id: 'home_islet'}}, onIslandEvents: events => observed.push(...events)});
  emit({type: 'wave_started_server', waveId: 'real', wave: 1, seed: 77, startsAt: new Date(Date.now() - 20000).toISOString()});
  mounted.update(.1);
  expect(observed.some(event => event.type === 'wave_started')).toBe(true);
  mounted.dispose();
});

it('the running-game wiring exposes a completed real wave in the menu and cleans up', async () => {
  const handlers = new Map();
  const on = (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); };
  const emit = event => { for (const fn of [...(handlers.get(event.type) ?? [])]) fn(event); };
  const island = {island: {code: 'A'}, api: {}, defenses: () => defenses, roomPlace: () => null,
    setBattle() {}, setPointBattle() {}, refreshDefended() {}};
  const stopFinish = setWaveFinisher(async () => ({ok: true, data: {loot: 0}}));
  const wired = wireWaves({on, emit, island, loop: false, world: {current: {id: 'home_islet'}},
    every: () => () => {}, later: () => () => {}, islandSimOptions: {island: {hp: 1}}});
  try {
    emit({type: 'wave_started_server', waveId: 'wired', wave: 1, seed: 77, startsAt: new Date(Date.now() - 300000).toISOString()});
    for (let i = 0; i < 100 && !wired.island.wave?.done; i++) wired.pirates.update(.1);
    await Promise.resolve(); await Promise.resolve();
    expect(wired.island.wave?.done).toBe(true);
    expect(menuExtras().some(item => item.label === 'Last defense report')).toBe(true);
  } finally { wired.dispose(); stopFinish(); }
  expect(menuExtras().some(item => item.label === 'Last defense report')).toBe(false);
});
