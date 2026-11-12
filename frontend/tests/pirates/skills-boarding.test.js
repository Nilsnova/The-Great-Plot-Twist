// The captain skills (§14) and weapons (§15) meet boarding (§12): the cutlass strike scaled by the
// Brawler skills, a rebuild with Master shipwright, weapons that hit boarders on foot, the strike and
// rebuild messages that carry the sender's skills, the button label, and determinism across two sims.
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { captainStats } from '../../src/pirates/captain-stats.js';
import { readMessage, toMessage } from '../../src/pirates/sync.js';
import { readWaveMessage } from '../../src/net/live-rules.js';
import { musketText } from '../../src/pirates/hud.js';
import { ring, towers } from './balance-fixture.js';

const EAST = [{ id: 'east', bearing: 0 }];
// A strong east ring wall: the boarders of the east lane crowd in front of it, hacking.
const EAST_RING = { id: 'wall_7', kind: 'wall', level: 3, x: 8.5, z: 2 };
const run = (wave, until, limit = 4000) => {
  const events = [];
  for (let i = 0; i < limit && !wave.done; i++) {
    const step = wave.step(.05);
    events.push(...step);
    if (until?.(step, wave)) break;
  }
  return events;
};
const strike = (by, boarder, skills = [], level = 1) => ({ type: 'captain_strike', by, targetId: boarder.id, level, skills, x: boarder.x - 1, z: boarder.z });
const blows = events => events.filter(event => event.type === 'captain_struck');
const boarderHits = (events, by) => events.filter(event => event.type === 'boarder_hit' && event.by === `captain:${by}`);

// One boarder ashore (seed 6, east lane), far from the others.
function oneBoarder() {
  const wave = createWave({ seed: 6, wave: 1, lanes: EAST, island: { hp: 1000 } });
  run(wave, () => wave.state().boarders.length > 0);
  return { wave, boarder: wave.state().boarders[0] };
}
// Boarders crowded at the ring wall: the first one with at least one other within the sweep radius.
function crowd(seed = 4, wave = 3) {
  const sim = createWave({ seed, wave, lanes: EAST, defenses: [EAST_RING], island: { hp: 5000 } });
  const sweepRadius = captainStats(1, ['sweep']).sweepRadius;
  let pair = null;
  run(sim, () => {
    const list = sim.state().boarders.filter(item => item.state === 'hacking' && item.hp === item.maxHp);
    for (const a of list) {
      const near = list.filter(b => b !== a && Math.hypot(a.x - b.x, a.z - b.z) <= sweepRadius);
      if (near.length) { pair = { target: a, near }; return true; }
    }
    return false;
  });
  expect(pair, 'two boarders hacking side by side').toBeTruthy();
  return { wave: sim, ...pair };
}

describe('the cutlass with the Brawler skills', () => {
  it('Cutlass: the strike does 50% more damage', () => {
    const plain = oneBoarder(), skilled = oneBoarder();
    const a = blows(plain.wave.step(.05, [strike('anna', plain.boarder)]));
    const b = blows(skilled.wave.step(.05, [strike('anna', skilled.boarder, ['cutlass'])]));
    expect(a[0].damage).toBe(CONFIG.captain.cutlass.levels[0].damage);
    expect(b[0].damage).toBe(CONFIG.captain.cutlass.levels[0].damage * captainStats(1, ['cutlass']).strikeMultiplier); // 21
    expect(b[0].damage).toBe(21);
    // A level-3 captain with Cutlass: 24 × 1.5.
    const third = oneBoarder();
    expect(blows(third.wave.step(.05, [strike('ben', third.boarder, ['cutlass'], 3)]))[0].damage).toBe(36);
  });

  it('Second wind: the strike reloads 30% faster (0.35 s instead of 0.5 s)', () => {
    const swingAgain = skills => {
      const { wave, boarder } = oneBoarder();
      const first = blows(wave.step(.05, [strike('anna', boarder, skills)]));
      for (let i = 0; i < 7; i++) wave.step(.05); // 0.35 s later
      const next = wave.state().boarders[0];
      return { first: first[0], again: next ? blows(wave.step(.05, [strike('anna', next, skills)])) : [] };
    };
    const plain = swingAgain([]), quick = swingAgain(['second_wind']); // no Cutlass: the first blow must not kill (20 hp)
    expect(plain.first.reload).toBe(CONFIG.captain.cutlass.reload);
    expect(plain.again).toHaveLength(0); // still reloading
    expect(quick.first.reload).toBe(.35);
    expect(quick.again).toHaveLength(1);
  });

  it('Sweep: every other boarder within 2 units of the struck one takes half the damage', () => {
    const { wave, target, near } = crowd();
    const events = wave.step(.05, [strike('anna', target, ['cutlass', 'sweep'])]);
    const [blow] = blows(events);
    expect(blow.targetId).toBe(target.id);
    expect(new Set(blow.swept)).toEqual(new Set(near.map(item => item.id)));
    const hits = boarderHits(events, 'anna');
    expect(hits.find(event => event.boarderId === target.id)).toMatchObject({ damage: Math.min(21, target.hp), blade: true });
    const swept = hits.filter(event => event.sweep);
    expect(swept.map(event => event.boarderId).sort()).toEqual(near.map(item => item.id).sort());
    for (const event of swept) expect(event.damage).toBe(Math.min(10.5, near.find(item => item.id === event.boarderId).hp));
    // Without Sweep only the struck boarder is hurt.
    const plain = crowd(), plainEvents = plain.wave.step(.05, [strike('anna', plain.target, ['cutlass'])]);
    expect(boarderHits(plainEvents, 'anna').map(event => event.boarderId)).toEqual([plain.target.id]);
    expect(blows(plainEvents)[0].swept).toBeUndefined();
  });
});

describe('rebuilding with Master shipwright', () => {
  const broken = () => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, defenses: [{ ...EAST_RING, level: 1 }], island: { hp: 1000 } });
    run(wave, step => step.some(event => event.type === 'wall_damaged' && event.broken));
    return wave;
  };
  it('a rebuilt wall comes back with 60% of its hp instead of 40%', () => {
    const full = CONFIG.levels.wall[0].hp, plain = broken(), master = broken();
    const a = plain.step(.05, [{ type: 'rebuild', wallId: 'wall_7', skills: [] }]).find(event => event.type === 'wall_rebuilt');
    const b = master.step(.05, [{ type: 'rebuild', wallId: 'wall_7', skills: ['quick_fix', 'long_reach', 'master_shipwright'] }])
      .find(event => event.type === 'wall_rebuilt');
    expect(a.hp).toBe(Math.round(full * .4));
    expect(b.hp).toBe(Math.round(full * captainStats(1, ['quick_fix', 'long_reach', 'master_shipwright']).rebuildShare));
    expect(b.hp).toBe(36);
  });
});

describe('weapons hit boarders as well as ships', () => {
  it('the blunderbuss cone hits boarders on foot in front of you', () => {
    const { wave, target, near } = crowd();
    const from = { x: target.x - 4, z: target.z };
    const events = wave.step(.05, [{ type: 'captain_shot', by: 'gun', targetId: null, level: 1, skills: [], weapon: 'blunderbuss',
      x: from.x, z: from.z, ax: target.x, az: target.z }]);
    const fired = events.find(event => event.type === 'captain_fired');
    expect(fired.weapon).toBe('blunderbuss');
    const ids = fired.targets.map(item => item.id);
    expect(ids).toContain(target.id);
    expect(ids.length).toBeLessThanOrEqual(3);
    expect(fired.targets.filter(item => item.boarder).length).toBeGreaterThanOrEqual(Math.min(3, 1 + near.length) - 1);
    const later = run(wave, null, 20);
    const hit = boarderHits(later, 'gun');
    expect(hit.length).toBe(fired.targets.filter(item => item.boarder).length);
    expect(hit.every(event => event.captain && event.damage <= captainStats(1, [], 'blunderbuss').damage)).toBe(true);
  });

  it('a tap on a boarder aims at it: a musket shot named after a boarder, the rifle pierces to the next one, a bomb burns them', () => {
    const { wave, target } = crowd();
    const rifle = wave.step(.05, [{ type: 'captain_shot', by: 'r', targetId: target.id, level: 1, skills: [], weapon: 'long_rifle', x: target.x - 10, z: target.z }])
      .find(event => event.type === 'captain_fired');
    expect(rifle).toMatchObject({ targetId: target.id, boarder: true });
    expect(rifle.targets[0]).toMatchObject({ id: target.id, boarder: true });
    const bomb = crowd();
    const thrown = bomb.wave.step(.05, [{ type: 'captain_shot', by: 'f', targetId: null, level: 1, skills: [], weapon: 'fire_bombs',
      x: bomb.target.x - 6, z: bomb.target.z, ax: bomb.target.x, az: bomb.target.z }]);
    expect(thrown.find(event => event.type === 'captain_fired')).toMatchObject({ weapon: 'fire_bombs' });
    const later = run(bomb.wave, step => step.some(event => event.type === 'captain_blast'), 60);
    const blast = later.find(event => event.type === 'captain_blast');
    expect(blast.hits).toBeGreaterThanOrEqual(2);
    expect(boarderHits(later, 'f').some(event => event.boarderId === bomb.target.id && event.area)).toBe(true);
  });
});

describe('the room carries the striker\'s and rebuilder\'s skills', () => {
  const entry = { by: 'p-1', seq: 2, tick: 40, waveId: 'w' };
  it('sync.js: captain_strike and wall_rebuild keep the skills; junk is refused; an older message reads as no skills', () => {
    const message = toMessage({ type: 'captain_strike', targetId: 'boarder_3', level: 2, x: 4.5, z: -2, skills: ['second_wind', 'cutlass', 'sweep'] }, entry);
    expect(message).toEqual({ type: 'captain_strike', payload: { by: 'p-1', seq: 2, t: 2, waveId: 'w', targetId: 'boarder_3', level: 2, x: 4.5, z: -2,
      skills: ['cutlass', 'sweep', 'second_wind'] } });
    expect(readMessage(message.type, message.payload, 'w').input).toEqual({ type: 'captain_strike', by: 'p-1', targetId: 'boarder_3', level: 2,
      x: 4.5, z: -2, skills: ['cutlass', 'sweep', 'second_wind'] });
    for (const bad of [{ skills: ['nope'] }, { skills: ['sweep', 'sweep'] }, { skills: 'cutlass' }]) {
      expect(readMessage(message.type, { ...message.payload, ...bad }, 'w')).toBe(null);
    }
    const { skills: _, ...old } = message.payload;
    expect(readMessage(message.type, old, 'w').input.skills).toEqual([]);
    const rebuild = toMessage({ type: 'rebuild', wallId: 'wall_9', skills: ['master_shipwright'] }, entry);
    expect(rebuild.payload).toMatchObject({ wallId: 'wall_9', skills: ['master_shipwright'] });
    expect(readMessage(rebuild.type, rebuild.payload, 'w').input).toEqual({ type: 'rebuild', wallId: 'wall_9', skills: ['master_shipwright'] });
    expect(readMessage(rebuild.type, { ...rebuild.payload, skills: ['x'] }, 'w')).toBe(null);
  });
  it('live-rules.js: the wave room passes the skills and drops a bad list or an extra field', () => {
    const wrap = data => ({ v: 1, id: '11111111-2222-4333-8444-555555555555', seq: 1, data });
    const blow = { by: 'p-1', seq: 2, t: 1, waveId: 'w', targetId: 'boarder_1', level: 1, x: 1, z: 2 };
    expect(readWaveMessage('captain_strike', wrap(blow))).not.toBe(null);
    expect(readWaveMessage('captain_strike', wrap({ ...blow, skills: ['cutlass', 'sweep'] }))).not.toBe(null);
    for (const bad of [{ skills: ['x'] }, { skills: 'cutlass' }, { weapon: 'musket' }, { ax: 1, az: 2 }, { level: 6 }]) {
      expect(readWaveMessage('captain_strike', wrap({ ...blow, ...bad }))).toBe(null);
    }
    const wall = { by: 'p-1', seq: 2, t: 1, waveId: 'w', wallId: 'wall_9' };
    expect(readWaveMessage('wall_rebuild', wrap(wall))).not.toBe(null);
    expect(readWaveMessage('wall_rebuild', wrap({ ...wall, skills: ['master_shipwright'] }))).not.toBe(null);
    expect(readWaveMessage('wall_rebuild', wrap({ ...wall, skills: ['nope'] }))).toBe(null);
  });
});

describe('the gun button', () => {
  it('says Cutlass with a boarder in strike reach, else the equipped weapon\'s name', () => {
    expect(musketText(true, true, 'Blunderbuss')).toBe('Cutlass');
    expect(musketText(true, false, 'Blunderbuss')).toBe('Blunderbuss');
    expect(musketText(true, false, captainStats(1, [], 'long_rifle').name)).toBe('Long rifle');
    expect(musketText(false, false, 'Pistols')).toBe('No pirate in range');
  });
});

describe('determinism of strikes with skills', () => {
  it('two sims, one fed through the room messages, stay identical with skilled strikes, sweeps, rebuilds and weapons', () => {
    // One cannon and the ring: the boarders crowd at the walls, so the sweeps and the spray find several.
    const options = { seed: 77, wave: 6, weather: { ships: 1.5 }, defenses: [...towers([['cannon', 1]]), ...ring(6)], crew: { carpenter: 1 }, island: { hp: 3000 } };
    const a = createWave(options), b = createWave(options), eventsA = [], eventsB = [];
    let seq = 0;
    for (let tick = 0; !a.done && tick < 4000; tick++) {
      // The strikes go for the boarder with the most others around it, so the sweep has work.
      const state = a.state(), crowded = list => list.map(item => [item, list.filter(other => Math.hypot(other.x - item.x, other.z - item.z) <= 2).length])
        .sort((p, q) => q[1] - p[1])[0]?.[0];
      const boarder = crowded(state.boarders), broken = state.walls.find(wall => wall.broken), ship = state.ships[0];
      const inputs = [];
      if (boarder && tick % 60 === 0) inputs.push({ type: 'captain_strike', by: 'p1', targetId: boarder.id, level: 2, skills: ['cutlass', 'sweep', 'second_wind'], x: boarder.x - 1, z: boarder.z });
      if (boarder && tick % 120 === 30) inputs.push({ type: 'captain_strike', by: 'p2', targetId: boarder.id, level: 1, skills: ['cutlass'], x: boarder.x + 1, z: boarder.z });
      if (broken && tick % 40 === 0) inputs.push({ type: 'rebuild', wallId: broken.id, skills: tick % 80 ? ['master_shipwright'] : [] });
      if (boarder && tick % 90 === 45) inputs.push({ type: 'captain_shot', by: 'p3', targetId: boarder.id, level: 3, skills: ['steady_aim'], weapon: 'blunderbuss', x: boarder.x - 3, z: boarder.z, ax: boarder.x, az: boarder.z });
      if (ship && tick % 45 === 0) inputs.push({ type: 'captain_shot', by: 'p4', targetId: ship.id, level: 2, skills: [], weapon: 'fire_bombs', x: ship.x * .8, z: ship.z * .8, ax: ship.x, az: ship.z });
      // b hears every input through the room: toMessage, then readMessage on the other client.
      const heard = inputs.map(input => {
        const by = input.by ?? 'p5', message = toMessage(input, { by, seq: seq++, tick, waveId: 'w' });
        return readMessage(message.type, message.payload, 'w').input;
      });
      eventsA.push(...a.step(.05, inputs));
      eventsB.push(...b.step(.05, heard));
    }
    expect(eventsB).toEqual(eventsA);
    expect(b.result()).toEqual(a.result());
    expect(eventsA.some(event => event.type === 'captain_struck' && event.swept?.length)).toBe(true);
    expect(eventsA.some(event => event.type === 'boarder_hit' && event.sweep)).toBe(true);
    expect(eventsA.some(event => event.type === 'captain_fired' && event.weapon === 'blunderbuss' && event.targets.some(item => item.boarder))).toBe(true);
  });
});
