// Boarding and close combat (TOWER-DEFENSE.md §12): ships unload boarders who walk to the heart, walls in
// their way stop them until broken, defenders shoot them, the captain's cutlass, rebuilding broken walls,
// the inputs through the room, determinism and the boarding balance.
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave, crewFor, curveFor } from '../../src/pirates/sim.js';
import { readMessage, toMessage } from '../../src/pirates/sync.js';
import { actionAt, boarderAt, inputFor, promptText } from '../../src/pirates/interact.js';
import { bladeTarget, captainTarget } from '../../src/pirates/controller.js';
import { musketText, waveBarText } from '../../src/pirates/hud.js';
import { measure, ring, runWave, towers } from './balance-fixture.js';

const EAST = [{ id: 'east', bearing: 0 }];
const EAST_RING = { id: 'wall_7', kind: 'wall', level: 1, x: 8.5, z: 2 };
const run = (wave, until, limit = 4000) => {
  const events = [];
  for (let i = 0; i < limit && !wave.done; i++) {
    const step = wave.step(.05);
    events.push(...step);
    if (until?.(step, wave)) break;
  }
  return events;
};

describe('boarding', () => {
  it('lets an anchored ship unload its crew one by one, more with the wave number', () => {
    expect(['sloop', 'brig', 'warship', 'flagship'].map(kind => crewFor(kind, 1))).toEqual([2, 3, 6, 4]);
    expect([crewFor('sloop', 15), crewFor('sloop', 16), crewFor('sloop', 31), crewFor('warship', 100)]).toEqual([2, 3, 4, 10]);
    // From wave 46 the crews grow only every 30 waves (GAME-V3.md §4: the late waves stay fightable), never past crewMax.
    expect([crewFor('sloop', 45), crewFor('sloop', 46), crewFor('sloop', 75), crewFor('sloop', 76), crewFor('redtide', 100)]).toEqual([4, 5, 5, 6, CONFIG.boarding.crewMax]);
    const wave = createWave({ seed: 3, wave: 1, lanes: EAST, island: { hp: 1000 } });
    const events = run(wave, () => wave.state().boardersLanded >= 6);
    const anchored = events.find(event => event.type === 'ship_anchored');
    const landed = events.filter(event => event.type === 'boarder_landed' && event.shipId === anchored.shipId);
    expect(anchored.crew).toBe(2);
    expect(landed).toHaveLength(2);
    expect(landed[0].t - anchored.t).toBeCloseTo(CONFIG.boarding.interval / 2, 1);
    expect(landed[1].t - landed[0].t).toBeCloseTo(CONFIG.boarding.interval, 1);
    expect(landed[0].hp).toBe(CONFIG.boarding.hp);
    expect(wave.state().ships.find(ship => ship.id === anchored.shipId).crew).toBe(0);
    // Later waves: tougher boarders.
    const late = createWave({ seed: 3, wave: 30, lanes: EAST, island: { hp: 5000 } });
    const first = run(late, step => step.some(event => event.type === 'boarder_landed')).find(event => event.type === 'boarder_landed');
    expect(first.hp).toBeCloseTo(CONFIG.boarding.hp * curveFor(30).hp, 1);
  });

  it('walks the boarders to the heart, where each one hurts the island and is gone', () => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 } });
    const events = run(wave, step => step.some(event => event.type === 'island_damaged' && event.boarderId));
    const hit = events.find(event => event.type === 'island_damaged' && event.boarderId);
    expect(hit.damage).toBe(CONFIG.boarding.heartDamage);
    const { heart } = CONFIG.boarding;
    expect(Math.hypot(hit.x - heart.x, hit.z - heart.z)).toBeLessThanOrEqual(CONFIG.boarding.heartRadius + .01);
    expect(wave.state().boarders.find(item => item.id === hit.boarderId)).toBeUndefined();
    // About 20 units from the beach to the heart at a brisk walk.
    const landed = events.find(event => event.type === 'boarder_landed' && event.boarderId === hit.boarderId);
    expect(hit.t - landed.t).toBeGreaterThan(6); expect(hit.t - landed.t).toBeLessThan(16);
  });

  it('stops them at a standing ring wall: they hack it until it breaks, then walk on over the rubble', () => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, defenses: [EAST_RING], island: { hp: 1000 } });
    const events = run(wave, step => step.some(event => event.type === 'island_damaged' && event.boarderId));
    const blows = events.filter(event => event.type === 'wall_damaged' && event.boarderId);
    expect(blows.length).toBeGreaterThan(5);
    expect(blows.every(event => event.wallId === 'wall_7' && event.damage === CONFIG.boarding.hack)).toBe(true);
    const broken = blows.find(event => event.broken);
    expect(broken).toBeTruthy();
    const through = events.find(event => event.type === 'island_damaged' && event.boarderId);
    expect(through.t).toBeGreaterThan(broken.t); // nobody passed while it stood
    // A ring wall far from their heading (the west one) never stops east boarders.
    const west = runWave({ seed: 4, wave: 1, lanes: EAST, defenses: [{ ...EAST_RING, id: 'wall_10', x: -9.5, z: -1 }], island: { hp: 1000 } });
    expect(west.events.some(event => event.type === 'wall_damaged' && event.boarderId)).toBe(false);
  });

  it('a shore wall near the landing is in their way too, and the ships shell it', () => {
    const shore = { id: 'wall_3', kind: 'wall', level: 1, x: 18.5, z: -1 };
    const { events } = runWave({ seed: 4, wave: 1, lanes: EAST, defenses: [shore], island: { hp: 1000 } });
    const blows = events.filter(event => event.type === 'wall_damaged' && event.wallId === 'wall_3');
    expect(blows.some(event => event.boarderId)).toBe(true);
    expect(blows.some(event => event.shipId)).toBe(true);
  });

  it('cannons, mortars and the musket fight boarders; a cannon takes the boarder nearest the heart', () => {
    // A cannon in the north-west corner: out of reach of the east anchorage, so it fights the boarders inland.
    const cannon = { id: 'cannon_1', kind: 'cannon', level: 1, x: -12.5, z: -14.5 };
    const { events } = runWave({ seed: 5, wave: 2, lanes: EAST, defenses: [cannon], island: { hp: 1000 } });
    const atBoarders = events.filter(event => event.type === 'cannon_fired' && event.boarder);
    expect(atBoarders.length).toBeGreaterThan(0);
    expect(events.some(event => event.type === 'boarder_killed' && event.by === 'cannon_1')).toBe(true);
    const firstShot = atBoarders[0], before = events.filter(event => event.t <= firstShot.t);
    expect(before.some(event => event.type === 'cannon_fired' && !event.boarder)).toBe(false); // it never had a ship in sight
    const mortar = { id: 'cannon_1', kind: 'mortar', level: 3, x: -12.5, z: -14.5 };
    const shelled = runWave({ seed: 5, wave: 4, lanes: EAST, defenses: [mortar, ...ring(6)], island: { hp: 1000 } }).events;
    expect(shelled.some(event => event.type === 'boarder_hit' && event.area && event.by === 'cannon_1')).toBe(true);
    // The musket at a boarder: a captain_shot whose target is a boarder.
    const wave = createWave({ seed: 6, wave: 1, lanes: EAST, island: { hp: 1000 } });
    run(wave, () => wave.state().boarders.length > 0);
    const boarder = wave.state().boarders[0];
    const fired = wave.step(.05, [{ type: 'captain_shot', by: 'anna', targetId: boarder.id, level: 1, x: boarder.x - 6, z: boarder.z }]);
    expect(fired.find(event => event.type === 'captain_fired')).toMatchObject({ targetId: boarder.id, damage: 6 });
    const later = run(wave, step => step.some(event => event.type === 'boarder_hit'));
    expect(later.find(event => event.type === 'boarder_hit')).toMatchObject({ boarderId: boarder.id, damage: 6, captain: true });
  });
});

describe('the cutlass', () => {
  const setup = () => {
    const wave = createWave({ seed: 6, wave: 1, lanes: EAST, island: { hp: 1000 } });
    run(wave, () => wave.state().boarders.length > 0);
    return { wave, boarder: wave.state().boarders[0] };
  };
  const strike = (by, boarder, level = 1, dx = 1) => ({ type: 'captain_strike', by, targetId: boarder.id, level, x: boarder.x - dx, z: boarder.z });

  it('strikes a boarder within reach at once, harder than the musket, with a short reload per captain', () => {
    const { wave, boarder } = setup();
    const events = wave.step(.05, [strike('anna', boarder), strike('anna', boarder), strike('ben', boarder, 3)]);
    const blows = events.filter(event => event.type === 'captain_struck');
    expect(blows.map(event => [event.by, event.damage])).toEqual([['anna', 14], ['ben', 24]]); // anna's second is reloading
    expect(CONFIG.captain.cutlass.levels.map(item => item.damage)).toEqual([14, 18, 24, 30, 38]);
    expect(CONFIG.captain.cutlass.levels[0].damage).toBeGreaterThan(CONFIG.captain.levels[0].damage * 2);
    expect(events.find(event => event.type === 'boarder_killed')).toMatchObject({ boarderId: boarder.id, by: 'captain:ben', blade: true });
    // After the reload anna may swing again, at the nearest boarder if hers is gone.
    run(wave, () => wave.state().time >= blows[0].t + CONFIG.captain.cutlass.reload && wave.state().boarders.length > 0);
    const next = wave.state().boarders[0];
    const again = wave.step(.05, [{ ...strike('anna', next), targetId: boarder.id }]).filter(event => event.type === 'captain_struck');
    expect(again).toHaveLength(1); expect(again[0].targetId).toBe(next.id);
  });

  it('refuses a strike out of reach, a bad sender or a missing position', () => {
    const { wave, boarder } = setup();
    const far = strike('anna', boarder, 1, CONFIG.captain.cutlass.reach + CONFIG.captain.cutlass.slack + 1);
    const junk = [far, { ...strike('x', boarder), by: '<b>' }, { ...strike('y', boarder), x: NaN }];
    expect(wave.step(.05, junk).filter(event => event.type === 'captain_struck')).toHaveLength(0);
  });

  it('is what F does next to a boarder: bladeTarget, the button says Cutlass', () => {
    const state = { ships: [{ id: 'ship_1', x: 10, z: 0 }], boarders: [{ id: 'boarder_1', x: 1.5, z: 0 }, { id: 'boarder_2', x: 4, z: 0 }] };
    expect(bladeTarget({ x: 0, z: 0 }, state)?.id).toBe('boarder_1');
    expect(bladeTarget({ x: -3, z: 0 }, state)).toBe(null);
    expect(captainTarget({ x: -3, z: 0 }, state, 1)?.id).toBe('boarder_1'); // the musket takes the nearest, ship or boarder
    expect(musketText(true, true)).toBe('Cutlass'); expect(musketText(true)).toBe('Musket'); expect(musketText(false)).toBe('No pirate in range');
    expect(boarderAt({ x: 4, z: -1.2 }, state)?.id).toBe('boarder_2');
    expect(waveBarText({ wave: 3, shipsLeft: 2, islandHp: 80, maxIslandHp: 100, boardersLeft: 4 })).toBe('Wave 3 · 2 ships left · 4 ashore · ♥ 80');
    expect(waveBarText({ wave: 3, shipsLeft: 1, islandHp: 80, maxIslandHp: 100 })).toBe('Wave 3 · 1 ship left · ♥ 80');
  });

  it('crosses the room like the musket shot', () => {
    // Both carry the sender's skills (§14; an empty list without any): skills-boarding.test.js.
    const input = { type: 'captain_strike', by: 'a', targetId: 'boarder_3', level: 2, x: 4.5, z: -2, skills: [] };
    const message = toMessage(input, { by: 'a', seq: 1, tick: 20, waveId: 'w' });
    expect(message).toEqual({ type: 'captain_strike', payload: { by: 'a', seq: 1, t: 1, waveId: 'w', targetId: 'boarder_3', level: 2, x: 4.5, z: -2, skills: [] } });
    expect(readMessage(message.type, message.payload, 'w')).toEqual({ by: 'a', seq: 1, tick: 20, input });
    expect(readMessage(message.type, { ...message.payload, by: 'b' }, 'w').input.by).toBe('b'); // never somebody else's blow
    const rebuild = toMessage({ type: 'rebuild', wallId: 'wall_9' }, { by: 'a', seq: 2, tick: 40, waveId: 'w' });
    expect(rebuild).toEqual({ type: 'wall_rebuild', payload: { by: 'a', seq: 2, t: 2, waveId: 'w', wallId: 'wall_9', skills: [] } });
    expect(readMessage(rebuild.type, rebuild.payload, 'w').input).toEqual({ type: 'rebuild', wallId: 'wall_9', skills: [] });
  });
});

describe('rebuilding broken walls', () => {
  const broken = (crew) => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, defenses: [EAST_RING], island: { hp: 1000 }, crew });
    const events = run(wave, step => step.some(event => event.type === 'wall_damaged' && event.broken));
    return { wave, events };
  };

  it('a broken wall is rebuilt to 40% by the rebuild input, once per cooldown; repair does not touch it', () => {
    const { wave } = broken();
    expect(wave.state().walls[0]).toMatchObject({ hp: 0, broken: true, rebuildReady: true });
    expect(wave.step(.05, [{ type: 'repair', wallId: 'wall_7' }]).some(event => event.type === 'wall_repaired')).toBe(false);
    expect(wave.state().walls[0].repairing).toBe(false);
    const events = wave.step(.05, [{ type: 'rebuild', wallId: 'wall_7' }]);
    expect(events.find(event => event.type === 'wall_rebuilt')).toMatchObject({ wallId: 'wall_7', by: 'player' });
    expect(wave.state().walls[0].hp).toBeGreaterThan(0);
    expect(wave.state().walls[0].hp).toBeLessThanOrEqual(CONFIG.levels.wall[0].hp * CONFIG.wall.rebuild);
    // Standing again: a rebuild input does nothing; a quick second rebuild after it falls again waits for the cooldown.
    expect(wave.step(.05, [{ type: 'rebuild', wallId: 'wall_7' }]).some(event => event.type === 'wall_rebuilt')).toBe(false);
  });

  it('the carpenter rebuilds a broken wall after a few seconds of work', () => {
    const { wave, events } = broken({ carpenter: 1 });
    const at = events.find(event => event.broken).t;
    const later = run(wave, step => step.some(event => event.type === 'wall_rebuilt'));
    const rebuilt = later.find(event => event.type === 'wall_rebuilt');
    expect(rebuilt).toMatchObject({ wallId: 'wall_7', by: 'carpenter', hp: CONFIG.levels.wall[0].hp * CONFIG.wall.rebuild });
    expect(rebuilt.t - at).toBeCloseTo(CONFIG.crew.carpenter.rebuild, 0);
  });

  it('E says Rebuild next to a broken wall and sends the rebuild input', () => {
    const defenses = [EAST_RING];
    const state = { phase: 'running', ships: [], boarders: [], walls: [{ id: 'wall_7', hp: 0, maxHp: 60, broken: true, rebuildReady: true }] };
    const action = actionAt({ x: 8.5, z: 3.5 }, defenses, state);
    expect(action).toMatchObject({ kind: 'rebuild', wallId: 'wall_7', ready: true });
    expect(promptText(action)).toBe('Rebuild');
    expect(inputFor(action)).toEqual({ type: 'rebuild', wallId: 'wall_7' });
    const waiting = actionAt({ x: 8.5, z: 3.5 }, defenses, { ...state, walls: [{ ...state.walls[0], rebuildReady: false }] });
    expect(inputFor(waiting)).toBe(null);
    const damaged = actionAt({ x: 8.5, z: 3.5 }, defenses, { ...state, walls: [{ id: 'wall_7', hp: 30, maxHp: 60 }] });
    expect(promptText(damaged)).toBe('Repair');
  });
});

describe('determinism with boarders', () => {
  it('gives the same wave for the same inputs, strikes and rebuilds included, whatever the frame rate', () => {
    const options = { seed: 77, wave: 6, weather: { ships: 1.5 }, defenses: [...towers([['cannon', 2], ['mortar', 2]]), ...ring(6)], crew: { carpenter: 1 } };
    const play = dt => {
      const wave = createWave(options), events = [];
      for (let tick = 0; !wave.done; tick++) {
        const state = wave.state(), boarder = state.boarders[0], broken = state.walls.find(wall => wall.broken);
        const inputs = [];
        if (boarder && tick % 10 === 0) inputs.push({ type: 'captain_strike', by: 'p1', targetId: boarder.id, level: 2, x: boarder.x - 1, z: boarder.z });
        if (broken && tick % 40 === 0) inputs.push({ type: 'rebuild', wallId: broken.id });
        events.push(...wave.step(dt, inputs));
      }
      return { events, result: wave.result() };
    };
    const a = play(.05), b = play(.05);
    expect(b.events).toEqual(a.events);
    expect(a.events.some(event => event.type === 'captain_struck')).toBe(true);
    expect(a.events.some(event => event.type === 'boarder_landed')).toBe(true);
  });
});

describe('boarding balance', () => {
  // Measured over 8 seeds (TOWER-DEFENSE.md §12; the numbers are in the build report).
  const C1 = towers([['cannon', 1]]), C2 = towers([['cannon', 1], ['cannon', 1]]);
  it('wave 3 is lost with no walls and no towers', () => {
    expect(measure({ defenses: [] }, 3).won).toBe(0);
  });
  it('wave 3 is won with the inner ring and 2 cannons', () => {
    expect(measure({ defenses: [...ring(6), ...C2] }, 3).won).toBe(8);
  });
  it('the ring makes a one-cannon island hold wave 3', () => {
    const without = measure({ defenses: C1 }, 3), withRing = measure({ defenses: [...C1, ...ring(6)] }, 3);
    expect(withRing.won).toBeGreaterThanOrEqual(7);
    expect(withRing.won).toBeGreaterThan(without.won);
    expect(withRing.hp).toBeGreaterThan(without.hp * 2);
  });
  it('the heart is lost mainly through boarders', () => {
    const { events } = runWave({ seed: 7919, wave: 3, defenses: [] });
    const hurt = events.filter(event => event.type === 'island_damaged');
    const boarders = hurt.filter(event => event.boarderId).reduce((sum, event) => sum + event.damage, 0);
    expect(boarders / hurt.reduce((sum, event) => sum + event.damage, 0)).toBeGreaterThan(.75);
  });
});
