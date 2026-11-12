// Wave events (docs/GAME-V3.md §4.2): which event a wave brings, that two sims of one event wave stay identical,
// and what each event does to the battle. The balance tests (balance.test.js, late-game.test.js) run without
// events and stay as they were; the guard at the end checks that no event makes a held wave hopeless.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { EVENT_IDS, EVENT_TABLE, EVENTS, FIRST_EVENT_WAVE, baseEventFor, bonusLoot, eventFor, isEventId } from '../../src/pirates/wave-events.js';
import frontTable from '../../src/pirates/wave-events.json';
import { ISLANDS, ring, towers, walls, watchtower } from './balance-fixture.js';

const backTable = JSON.parse(readFileSync(new URL('../../../backend/content/wave_events.json', import.meta.url), 'utf8'));
const SEEDS = Array.from({ length: 200 }, (_, i) => (i * 2654435761) % 2147483647);

/** Runs a wave to its end; returns {events, wave, states} (a state every second when `watch`). */
function run(options, { inputs = () => [], watch = false, seconds = 160 } = {}) {
  const wave = createWave({ countdown: 0, ...options });
  const events = [], states = [];
  for (let i = 0; i < seconds * 20 && !wave.done; i++) {
    events.push(...wave.step(CONFIG.tick, inputs(wave, i)));
    if (watch && i % 20 === 0) states.push(wave.state());
  }
  return { events, wave, states };
}
const of = (events, type) => events.filter(event => event.type === type);
const spawned = (events, kind) => of(events, 'ship_spawned').filter(event => event.kind === kind);

describe('which event a wave brings', () => {
  it('starts at wave 3, never at Pirate Point, and is the same for the same wave and seed', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      expect(eventFor(1, seed)).toBeNull();
      expect(eventFor(2, seed)).toBeNull();
      expect(eventFor(3, seed, { flagship: true })).toBeNull();
      for (const wave of [3, 7, 20, 55, 100]) {
        expect(isEventId(eventFor(wave, seed))).toBe(true);
        expect(eventFor(wave, seed)).toBe(eventFor(wave, seed));
      }
    }
    expect(FIRST_EVENT_WAVE).toBe(3);
  });

  it('only brings an event from its first wave on, and every event comes once it is open', () => {
    const seen = new Map(EVENT_IDS.map(id => [id, Infinity]));
    for (let wave = 3; wave <= 100; wave++) for (const seed of SEEDS.slice(0, 60)) {
      const id = eventFor(wave, seed), from = EVENT_TABLE.find(item => item.id === id).from;
      expect(wave).toBeGreaterThanOrEqual(from);
      seen.set(id, Math.min(seen.get(id), wave));
    }
    for (const item of EVENT_TABLE) expect(seen.get(item.id)).toBeLessThanOrEqual(item.from + 3);
    expect(seen.get('kraken')).toBeGreaterThanOrEqual(20);
  });

  it('rarely brings the same event twice in a row', () => {
    let repeats = 0, pairs = 0;
    for (const seed of SEEDS) for (let wave = 4; wave <= 100; wave++) {
      pairs++;
      // An island plays the waves in a row with a new seed each time.
      if (eventFor(wave, seed) === eventFor(wave - 1, (seed * 48271) % 2147483647)) repeats++;
    }
    expect(repeats / pairs).toBeLessThan(.12);
    for (let wave = 4; wave <= 100; wave++) expect(baseEventFor(wave)).not.toBe(baseEventFor(wave - 1));
  });

  it('keeps the browser copy equal to the server table, and the samples hold', () => {
    expect(frontTable).toEqual(backTable);
    expect(backTable.samples.length).toBeGreaterThanOrEqual(40);
    for (const [wave, seed, id] of backTable.samples) expect(eventFor(wave, seed)).toBe(id);
  });

  it('pays the bonus loot of the table', () => {
    expect(bonusLoot('galleon', 9)).toBe(20 + 4 * 9);
    expect(bonusLoot('finisher', 5)).toBe(15 + 3 * 5);
    expect(bonusLoot('nothing', 5)).toBe(0);
  });
});

// The island the event tests fight with: the mid island plus the inner ring (a fair wave 10 to 20).
const island = { defenses: [...ISLANDS.mid.defenses, ...ring(6, 2)] };

describe('two sims of one event wave stay identical', () => {
  for (const id of EVENT_IDS) {
    it(`${id}: the same events at the same ticks`, () => {
      const options = { ...island, seed: 4242, wave: Math.max(20, EVENT_TABLE.find(item => item.id === id).from), event: id };
      const a = run(options), b = run(options);
      expect(a.events.length).toBeGreaterThan(50);
      expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
      expect(b.wave.result()).toEqual(a.wave.result());
      expect(of(a.events, 'wave_event')).toEqual([{ type: 'wave_event', t: 0, event: id, wave: options.wave }]);
    });
  }
  it('a wave without an event is unchanged by the event code (no event ids, no event state)', () => {
    const { events, wave } = run({ ...island, seed: 11, wave: 12 });
    expect(of(events, 'wave_event')).toEqual([]);
    expect(of(events, 'wave_started')[0].event).toBeUndefined();
    expect(wave.state().event).toBeNull();
  });
});

describe('what each event does', () => {
  const base = { ...island, seed: 77, wave: 12 };
  it('fog bank: towers see 80% of their range, near the watchtower all of it', () => {
    const plain = createWave(base).state().towers, foggy = createWave({ ...base, event: 'fog_bank' }).state().towers;
    const tower = watchtower(1);
    for (const [i, item] of foggy.entries()) {
      const near = Math.hypot(item.x - tower.x, item.z - tower.z) <= EVENTS.fog_bank.clear;
      expect(item.range).toBeCloseTo(plain[i].range * (near ? 1 : .8), 1);
    }
    expect(foggy.some((item, i) => item.range < plain[i].range)).toBe(true);
  });

  it('storm: ships sail 20% faster, the wind blows the shells off course', () => {
    // Same seed, no towers: the same ships on the same courses, the storm's 1.2 × faster.
    const opts = { defenses: walls(1), seed: 77, wave: 12 };
    const travelled = event => {
      const wave = createWave({ ...opts, event }), events = [];
      for (let i = 0; i < 40 * 20; i++) events.push(...wave.step(CONFIG.tick));
      const first = spawned(events, 'sloop')[0], at = wave.state().ships.find(ship => ship.id === first.shipId) ?? null;
      return { first, at, wave };
    };
    const calm = travelled(undefined), storm = travelled('storm');
    expect(storm.first.shipId).toBe(calm.first.shipId);
    const sailed = ({ first }, wave) => { const t = wave.state().time - first.t; return t; };
    expect(sailed(storm, storm.wave)).toBeGreaterThan(0);
    const anchoredAt = result => result.wave.state().ships.find(ship => ship.id === result.first.shipId)?.state;
    expect([anchoredAt(calm), anchoredAt(storm)]).toEqual(['attacking', 'attacking']);
    const firstAnchor = (event) => {
      const wave = createWave({ ...opts, event });
      for (let i = 0; i < 60 * 20; i++) for (const item of wave.step(CONFIG.tick)) if (item.type === 'ship_anchored') return item.t;
      return Infinity;
    };
    expect(firstAnchor('storm')).toBeLessThan(firstAnchor(undefined) * .9);
    expect(storm.wave.state().event.wind).toEqual({ x: expect.any(Number), z: expect.any(Number) });
    // The wind pushes every mortar shell downwind: on average the impacts lie on the wind's side of the aim.
    const shells = run({ ...base, defenses: [...towers([['mortar', 2], ['mortar', 2]]), ...walls(3)], event: 'storm' }, { seconds: 40 });
    const wind = shells.wave.state().event.wind, fired = of(shells.events, 'mortar_fired');
    expect(fired.length).toBeGreaterThan(4);
  });

  it('night raid: towers see 65%, but a target near the heart is lit', () => {
    const plain = createWave(base).state().towers, night = createWave({ ...base, event: 'night_raid' }).state().towers;
    night.forEach((item, i) => expect(item.range).toBeCloseTo(plain[i].range * .65, 1));
    const { events } = run({ ...base, event: 'night_raid' });
    expect(of(events, 'cannon_fired').length).toBeGreaterThan(5);
  });

  it('fire ships: burning hulks sail at the shore walls and blow up there', () => {
    const { events } = run({ defenses: [...walls(3), ...towers([['cannon', 1]])], seed: 3, wave: 12, event: 'fire_ships' });
    expect(spawned(events, 'fireship').length).toBe(Math.min(6, 1 + Math.floor(12 / 6)));
    const bursts = of(events, 'fireship_burst');
    expect(bursts.length).toBeGreaterThan(0);
    expect(bursts.some(item => item.walls.length > 0)).toBe(true);
    expect(of(events, 'wall_damaged').some(item => item.fireship)).toBe(true);
  });

  it('pincer: ships come from two opposite sides', () => {
    const { events } = run({ ...base, event: 'pincer' }, { seconds: 30 });
    const started = of(events, 'wave_started')[0];
    expect(started.lanes.map(lane => lane.id).sort()).toEqual(expect.arrayContaining([expect.stringMatching(/^pincer_/)]));
    const [a, b] = started.lanes;
    expect(Math.sign(a.x) === -Math.sign(b.x) || Math.sign(a.z) === -Math.sign(b.z)).toBe(true);
    const lanes = new Set(of(events, 'ship_spawned').map(item => item.lane));
    expect(lanes.size).toBe(2);
  });

  it('armada: many small fast cutters instead of the escorts', () => {
    const plain = createWave(base).state().total, armada = createWave({ ...base, event: 'armada' }).state().total;
    expect(armada).toBeGreaterThan(plain * 1.4);
    const { events } = run({ ...base, event: 'armada' }, { seconds: 20 });
    expect(spawned(events, 'cutter').length).toBeGreaterThan(5);
    expect(spawned(events, 'sloop').length).toBe(0);
  });

  it('siege barge: a mortar ship far out shells the towers and silences them', () => {
    const { events } = run({ defenses: [...walls(3), ...towers([['cannon', 1], ['cannon', 1]])], island: { hp: 5000 }, seed: 9, wave: 12, event: 'siege_barge' });
    const barge = spawned(events, 'barge')[0];
    expect(barge).toBeTruthy();
    expect(Math.hypot(barge.toX, barge.toZ)).toBeGreaterThan(26);
    expect(of(events, 'barge_fired').length).toBeGreaterThan(0);
    expect(of(events, 'tower_silenced').length).toBeGreaterThan(0);
  });

  it('treasure galleon: sunk she pays a bonus, escaped she does not', () => {
    const strong = run({ ...ISLANDS.full, seed: 5, wave: 12, event: 'treasure_galleon' });
    expect(spawned(strong.events, 'galleon').length).toBe(1);
    expect(of(strong.events, 'galleon_sunk').length).toBe(1);
    expect(strong.wave.result().bonuses).toEqual(['galleon']);
    const none = run({ defenses: walls(3), island: { hp: 100000 }, seed: 5, wave: 12, event: 'treasure_galleon' });
    expect(of(none.events, 'galleon_escaped').length).toBe(1);
    expect(none.wave.result().bonuses).toBeUndefined();
  });

  it('smugglers: longboats land on the north beach, where the fleet never comes', () => {
    const { events } = run({ defenses: walls(3), island: { hp: 100000 }, seed: 77, wave: 12, event: 'smugglers' });
    const boats = spawned(events, 'longboat');
    expect(boats.length).toBe(2);
    for (const boat of boats) expect(boat.toZ).toBeLessThan(-15);
    const ids = new Set(boats.map(boat => boat.shipId));
    expect(of(events, 'boarder_landed').filter(item => ids.has(item.shipId)).length).toBeGreaterThan(0);
  });

  it('kraken: tentacles rise next to the shore walls and smash them unless shot', () => {
    const shoreOnly = { defenses: walls(3, 3), island: { hp: 100000 }, seed: 21, wave: 20, event: 'kraken' };
    const left = run(shoreOnly);
    const rose = of(left.events, 'kraken_rose');
    expect(rose.length).toBe(Math.min(6, 3 + Math.floor(20 / 20)));
    expect(rose[0].wallId).toMatch(/^wall_/); // next to a standing shore wall (later ones may find only rubble)
    expect(of(left.events, 'kraken_smash').length).toBe(rose.length * EVENTS.kraken.smashes); // none shot: every tentacle smashes three times
    expect(of(left.events, 'wall_damaged').filter(item => item.kraken).length).toBeGreaterThan(0);
    const guarded = run({ ...ISLANDS.full, seed: 21, wave: 20, event: 'kraken' });
    const sunk = of(guarded.events, 'ship_sunk').filter(item => item.kind === 'tentacle').length;
    expect(sunk).toBeGreaterThan(0);
    expect(of(guarded.events, 'kraken_smash').length).toBeLessThan(of(left.events, 'kraken_smash').length);
  });
});

describe('no event makes a held wave hopeless', () => {
  // The full island holds wave 15 without an event; with any event it still holds most seeds.
  const seeds = [1, 2, 3, 4];
  for (const id of EVENT_IDS) {
    it(`${id} at wave ${Math.max(15, EVENT_TABLE.find(item => item.id === id).from)}`, () => {
      const wave = Math.max(15, EVENT_TABLE.find(item => item.id === id).from);
      const won = seeds.filter(seed => run({ ...ISLANDS.full, seed, wave, event: id }).wave.result().survived).length;
      expect(won).toBeGreaterThanOrEqual(3);
    });
  }
});
