// Captain health (GAME-V3.md §3, lane H): hp from the first position, boarders within reach going for the
// nearest captain, falling, a paid revive by a teammate, every captain down losing the wave, the messages
// through the room, the controller (positions, the pin, holding E, the narrator events), the HUD words, the
// fake server's revive route, and the balance numbers of the doc (waves 1-3 are hard to lose this way).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CONFIG, createWave, curveFor, revivePrice } from '../../src/pirates/sim.js';
import { INPUT_LEAD_TICKS, ROOM_EVENTS, readMessage, toMessage } from '../../src/pirates/sync.js';
import { HEARD_EVERY_MS, LOST_FALLEN, createWaveController } from '../../src/pirates/controller.js';
import { DOWN_TITLE, clockText, downLine, healthText } from '../../src/pirates/hud.js';
import { FakeApiError, createFakeIslandApi, createFakeWorld } from '../../src/pirates/fake-api.js';
import { DOWN_IDS } from '../../src/pirates/render.js';
import { peopleFrames } from '../../src/art/people.js';
import { ISLANDS, ring, towers } from './balance-fixture.js';

const H = CONFIG.health;
const EAST = [{ id: 'east', bearing: 0 }];
const move = (by, x, z, extra = {}) => ({ type: 'captain_move', by, x, z, ...extra });
const hero = (wave, id) => wave.state().party.find(item => item.id === id);
// Runs the sim at the fixed tick until `until(events)` or the wave ends; inputs(t) may add inputs per tick.
function run(wave, until, inputs = () => [], limit = 6000) {
  const all = [];
  for (let i = 0; i < limit && !wave.done; i++) {
    const step = wave.step(CONFIG.tick, inputs(i * CONFIG.tick, wave));
    all.push(...step);
    if (until?.(step, wave)) break;
  }
  return all;
}
// A captain that keeps saying where it stands (every half second), as the controller does.
const standing = (by, at) => (t, wave) => (Math.round(t * 20) % 10 === 0 ? [move(by, typeof at === 'function' ? at(wave).x : at.x, typeof at === 'function' ? at(wave).z : at.z)] : []);
// The first boarder ashore, and a captain standing right on it from then on.
const onBoarder = wave => { const b = wave.state().boarders[0]; return b ? { x: b.x, z: b.z } : { x: 30, z: 0 }; };

describe('captain health: the sim', () => {
  it('adds a captain with full hp on their first position, and a boarder within reach goes for them and hurts them', () => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 } });
    let events = wave.step(CONFIG.tick, [move('p-ann', 40, 0, { colour: 4 })]);
    expect(events.find(event => event.type === 'captain_joined')).toMatchObject({ captainId: 'p-ann', hp: H.hp });
    expect(hero(wave, 'p-ann')).toMatchObject({ hp: H.hp, maxHp: H.hp, down: false, colour: 4, present: true });
    events = run(wave, step => step.some(event => event.type === 'captain_hit'), standing('p-ann', onBoarder));
    const hit = events.find(event => event.type === 'captain_hit');
    expect(hit).toMatchObject({ captainId: 'p-ann', damage: H.damage * curveFor(1).damage, hp: H.hp - H.damage });
    expect(wave.state().boarders.find(item => item.id === hit.boarderId)).toMatchObject({ state: 'fighting', foe: 'p-ann' });
  });

  it('lets a captain fall at 0 hp: the boarders walk on, a fallen captain cannot move, shoot or strike', () => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 } });
    // Two captains, so the wave goes on when one falls; Ben stands far away on the other side.
    wave.step(CONFIG.tick, [move('p-ann', 40, 0), move('p-ben', -18, -10)]);
    const events = run(wave, step => step.some(event => event.type === 'captain_fell'),
      (t, w) => [...standing('p-ann', onBoarder)(t, w), ...standing('p-ben', { x: -18, z: -10 })(t, w)]);
    const fell = events.find(event => event.type === 'captain_fell');
    expect(fell.captainId).toBe('p-ann');
    const ann = hero(wave, 'p-ann');
    expect(ann).toMatchObject({ hp: 0, down: true, downAt: fell.t });
    expect(wave.state().boarders.every(item => item.foe !== 'p-ann')).toBe(true);
    expect(wave.done).toBe(false);
    const boarder = wave.state().boarders[0];
    const after = wave.step(CONFIG.tick, [move('p-ann', 5, 5),
      { type: 'captain_strike', by: 'p-ann', targetId: boarder?.id ?? 'boarder_1', level: 5, x: ann.x, z: ann.z },
      { type: 'captain_shot', by: 'p-ann', targetId: boarder?.id ?? 'boarder_1', level: 5, x: ann.x, z: ann.z }]);
    expect(after.some(event => event.type === 'captain_struck' || event.type === 'captain_fired')).toBe(false);
    expect(hero(wave, 'p-ann')).toMatchObject({ x: ann.x, z: ann.z, down: true });
  });

  it('loses the wave when every captain is down (alone: when you fall)', () => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 } });
    wave.step(CONFIG.tick, [move('p-solo', 40, 0)]);
    const events = run(wave, null, standing('p-solo', onBoarder));
    expect(events.some(event => event.type === 'captain_fell' && event.captainId === 'p-solo')).toBe(true);
    expect(wave.done).toBe(true);
    expect(wave.endReason).toBe('captains_fallen');
    expect(events.at(-1)).toMatchObject({ type: 'wave_ended', reason: 'captains_fallen', survived: false });
    expect(wave.result().survived).toBe(false);
    expect(wave.result().islandHp).toBeGreaterThan(0);
  });

  it('stands a fallen captain up when a standing teammate next to them revives (half hp), and only then', () => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 } });
    wave.step(CONFIG.tick, [move('p-ann', 40, 0), move('p-ben', -18, -10)]);
    run(wave, step => step.some(event => event.type === 'captain_fell'),
      (t, w) => [...standing('p-ann', onBoarder)(t, w), ...standing('p-ben', { x: -18, z: -10 })(t, w)]);
    const ann = hero(wave, 'p-ann');
    const revive = (by, x, z, targetId = 'p-ann') => wave.step(CONFIG.tick, [{ type: 'captain_revive', by, targetId, x, z }]);
    expect(revive('p-ben', ann.x + H.revive.reach + H.revive.slack + .5, ann.z).some(event => event.type === 'captain_revived')).toBe(false); // too far
    expect(revive('p-ghost', ann.x, ann.z).some(event => event.type === 'captain_revived')).toBe(false); // not in the wave
    expect(revive('p-ann', ann.x, ann.z, 'p-ann').some(event => event.type === 'captain_revived')).toBe(false); // yourself
    expect(revive('p-ben', ann.x + 1, ann.z, 'p-ben').some(event => event.type === 'captain_revived')).toBe(false); // not down
    const done = revive('p-ben', ann.x + 1.5, ann.z).find(event => event.type === 'captain_revived');
    expect(done).toMatchObject({ captainId: 'p-ann', by: 'p-ben', hp: H.hp * H.revive.share });
    expect(hero(wave, 'p-ann')).toMatchObject({ down: false, hp: H.hp * H.revive.share, downAt: null });
    expect(hero(wave, 'p-ben')).toMatchObject({ x: ann.x + 1.5, z: ann.z });
  });

  it('counts only captains on the island: away or not heard for `stale` seconds is out (no target, not counted)', () => {
    const wave = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 } });
    wave.step(CONFIG.tick, [move('p-ann', 40, 0), move('p-ben', -18, -10)]);
    // Ben says nothing more: after `stale` seconds Ann alone counts, and her fall ends the wave.
    run(wave, null, standing('p-ann', onBoarder));
    expect(wave.endReason).toBe('captains_fallen');
    expect(hero(wave, 'p-ben')).toMatchObject({ down: false, present: false });
    // Away: leaving the island takes you out at once, and a boarder never goes for you.
    const other = createWave({ seed: 4, wave: 1, lanes: EAST, island: { hp: 1000 } });
    other.step(CONFIG.tick, [move('p-ann', 40, 0), move('p-ben', 40, 0, { away: true })]);
    expect(other.state().party.map(item => item.id)).toEqual(['p-ann']);
    other.step(CONFIG.tick, [move('p-ann', 40, 0, { away: true })]);
    expect(hero(other, 'p-ann').present).toBe(false);
  });

  it('puts at most `crowd` boarders on one captain, and the nearest captain within reach is the one', () => {
    const wave = createWave({ seed: 5, wave: 6, lanes: EAST, island: { hp: 5000 } });
    let most = 0;
    run(wave, () => wave.state().boardersLanded >= 8, (t, w) => {
      const on = w.state().boarders.filter(item => item.foe === 'p-ann').length; most = Math.max(most, on);
      return standing('p-ann', { x: 15, z: 0 })(t, w);
    });
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(H.crowd);
  });

  it('runs the same on every screen: the inputs through the room give the same party at the same tick', () => {
    const inputs = (t, w) => [...standing('p-ann', onBoarder)(t, w), ...standing('p-ben', { x: -18, z: -10 })(t, w)];
    const play = () => {
      const wave = createWave({ seed: 9, wave: 2, lanes: EAST, island: { hp: 1000 } });
      const seen = [];
      for (let i = 0; i < 1500 && !wave.done; i++) {
        const local = inputs(i * CONFIG.tick, wave).map(input => {
          const message = toMessage(input, { by: input.by, seq: i, tick: i, waveId: 'w' });
          return readMessage(message.type, message.payload, 'w').input;
        });
        wave.step(CONFIG.tick, local);
        if (i % 50 === 0) seen.push(JSON.stringify(wave.state().party));
      }
      return seen;
    };
    expect(play()).toEqual(play());
  });

  it('prices a revive 20 + 5 x wave, the same as the server (backend/content/islands.json)', () => {
    expect([revivePrice(1), revivePrice(3), revivePrice(10), revivePrice(100)]).toEqual([25, 35, 70, 520]);
    const content = JSON.parse(readFileSync(new URL('../../../backend/content/islands.json', import.meta.url), 'utf8'));
    expect({ base: content.revive.base, perWave: content.revive.perWave }).toEqual({ base: H.revive.base, perWave: H.revive.perWave });
  });
});

describe('captain health: the balance (GAME-V3.md §3)', () => {
  // A captain who stands their ground and swings the cutlass at the nearest boarder within reach.
  function fight(island, wave, seed, at) {
    const sim = createWave({ seed: seed * 7919, wave, ...island });
    let t = 0, blade = -9;
    sim.step(0, [move('p-solo', at.x, at.z)]);
    while (!sim.done) {
      const inputs = [];
      t += CONFIG.tick;
      if (Math.round(t * 20) % 10 === 0) inputs.push(move('p-solo', at.x, at.z));
      const near = t - blade >= CONFIG.captain.cutlass.reload ? sim.state().boarders.find(b => Math.hypot(b.x - at.x, b.z - at.z) <= CONFIG.captain.cutlass.reach) : null;
      if (near) { inputs.push({ type: 'captain_strike', by: 'p-solo', targetId: near.id, level: 1, x: at.x, z: at.z }); blade = t; }
      sim.step(CONFIG.tick, inputs);
    }
    return sim.endReason;
  }
  it('a captain who fights does not fall in waves 1 to 3 (8 seeds, at the heart and on the beach)', () => {
    const islands = [{ defenses: [] }, ISLANDS.first, { defenses: [...towers([['cannon', 1]]), ...ring(6)] }];
    for (const island of islands) for (const wave of [1, 2, 3]) for (const at of [{ x: 0, z: 2 }, { x: 16, z: 0 }]) {
      for (let seed = 1; seed <= 8; seed++) expect(fight(island, wave, seed, at), `wave ${wave} seed ${seed} at ${at.x},${at.z}`).not.toBe('captains_fallen');
    }
  });
});

describe('captain health: the messages', () => {
  it('writes and reads a position and a revive, always as the sender', () => {
    const base = { by: 'p-ann', seq: 3, tick: 40, waveId: 'w1' };
    const moved = toMessage(move('p-ann', 1.25, -2, { colour: 2 }), base);
    expect(moved).toEqual({ type: ROOM_EVENTS.captain_move, payload: { by: 'p-ann', seq: 3, t: 2, waveId: 'w1', x: 1.25, z: -2, colour: 2 } });
    expect(readMessage(moved.type, { ...moved.payload, by: 'p-ben' }, 'w1').input).toEqual(move('p-ben', 1.25, -2, { colour: 2 }));
    const away = toMessage(move('p-ann', 1, 1, { away: true }), base);
    expect(readMessage(away.type, away.payload, 'w1').input).toEqual(move('p-ann', 1, 1, { away: true }));
    const revive = toMessage({ type: 'captain_revive', by: 'p-ann', targetId: 'p-ben', x: 1, z: 2 }, base);
    expect(readMessage(revive.type, revive.payload, 'w1')).toEqual({ by: 'p-ann', seq: 3, tick: 40,
      input: { type: 'captain_revive', by: 'p-ann', targetId: 'p-ben', x: 1, z: 2 } });
    for (const bad of [{ ...moved.payload, colour: 12 }, { ...moved.payload, away: 'yes' }, { ...moved.payload, x: Infinity }]) {
      expect(readMessage(moved.type, bad, 'w1')).toBe(null);
    }
    expect(readMessage(revive.type, { ...revive.payload, targetId: 'p-ann' }, 'w1')).toBe(null); // yourself
    expect(readMessage(revive.type, { ...revive.payload, targetId: 'p ben' }, 'w1')).toBe(null);
  });
});

// The controller with a player, a room that records what it sends and a HUD that records what it shows.
const START = Date.UTC(2026, 10, 12, 12, 0, 0);
const INFO = { waveId: 'w-h', wave: 3, seed: 21, startsAt: new Date(START + 1000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, flagship: false };
function harness({ reviveCaptain = vi.fn(async () => ({ price: 35, coins: 65 })), playerId = 'p-me' } = {}) {
  const clock = { now: START }, sent = [], handlers = new Map(), shown = { prompt: [], health: [], down: [], marks: [] }, bus = [];
  const room = { send: (type, payload) => { sent.push({ type, payload }); return true; },
    on: (type, handler) => { handlers.set(type, handler); return () => handlers.delete(type); } };
  const player = { x: 30, z: 0 };
  const hud = { countdown() {}, bar() {}, banner() {}, setVisible() {}, dispose() {}, musket() {}, loot() {}, boss() {},
    prompt: (...args) => shown.prompt.push(args), health: info => shown.health.push(info), down: info => shown.down.push(info), marks: list => shown.marks.push(list) };
  const hudOptions = {};
  const controller = createWaveController({ bus: { on: () => () => {}, emit: event => bus.push(event) }, room, playerId, now: () => clock.now,
    world: { scene: {}, container: {}, player: { position: player }, project: (x, z) => ({ x: x * 10, y: z * 10 }) },
    getDefenses: () => [], createRenderer: () => ({ events() {}, update() {}, setVisible() {}, dispose() {} }),
    createHud: options => { Object.assign(hudOptions, options); return hud; },
    reviveCaptain, setTimer: () => 0, clearTimer() {}, captainColour: () => 6 });
  const advance = async ms => { for (let t = 0; t < ms; t += 50) { clock.now += 50; controller.update(.05); await Promise.resolve(); } };
  // A friend's message as if it came through the room.
  const hear = (type, payload) => handlers.get(type)?.({ waveId: INFO.waveId, ...payload });
  return { clock, sent, shown, bus, player, controller, advance, hear, reviveCaptain, hold: held => hudOptions.onPromptHold(held) };
}

describe('captain health: the controller', () => {
  it('sends your position while the wave runs (moved: every half second, still: every 3 s), in your colour', async () => {
    const h = harness();
    h.controller.start(INFO);
    await h.advance(1100);
    const moves = () => h.sent.filter(item => item.type === 'captain_move');
    expect(moves()).toHaveLength(1);
    expect(moves()[0].payload).toMatchObject({ by: 'p-me', x: 30, z: 0, colour: 6 });
    // Sent further ahead than a shot: it may wait one room gap in the send queue.
    expect(moves()[0].payload.t * 20 - 1).toBeGreaterThan(INPUT_LEAD_TICKS);
    await h.advance(1500);
    expect(moves()).toHaveLength(1);
    await h.advance(HEARD_EVERY_MS);
    expect(moves()).toHaveLength(2);
    h.player.x = 25;
    await h.advance(600);
    expect(moves().at(-1).payload).toMatchObject({ x: 25, z: 0 });
    expect(h.controller.captain).toMatchObject({ id: 'p-me', hp: H.hp, down: false });
    expect(h.shown.health.at(-1)).toEqual({ hp: H.hp, maxHp: H.hp, down: false });
  });

  it('pins you where you fell, takes your gun away, says so, and tells the narrator; every captain down is a lost wave', async () => {
    const h = harness();
    h.controller.start(INFO);
    await h.advance(1100);
    // Stand on the boarders until you fall (you are alone, so the wave is lost then).
    for (let i = 0; i < 4000 && !h.controller.captainDown && h.controller.wave && !h.controller.wave.done; i++) {
      const boarder = h.controller.state.boarders[0];
      if (boarder) { h.player.x = boarder.x; h.player.z = boarder.z; }
      await h.advance(50);
    }
    const fell = h.bus.find(event => event.type === 'player_fell');
    expect(fell).toMatchObject({ playerId: 'p-me', self: true });
    expect(h.bus.some(event => event.type === 'captains_all_fallen')).toBe(true);
    expect(h.controller.wave.done).toBe(true);
    expect(h.controller.wave.sim.endReason).toBe('captains_fallen');
    expect(LOST_FALLEN).toBe('Every captain fell.');
  });

  it('holds E next to a fallen teammate for 2 s: the server charges you, then the revive goes to the room', async () => {
    const h = harness();
    h.controller.start(INFO);
    await h.advance(1100);
    // A friend (p-ben) far out on the beach: their position comes through the room, then they stand on a boarder.
    const benAt = { x: 40, z: 0 };
    let seq = 1;
    const tell = () => h.hear('captain_move', { by: 'p-ben', seq: seq++, t: (h.controller.wave.ticks + 8) * .05, x: benAt.x, z: benAt.z });
    for (let i = 0; i < 6000 && !h.controller.state.party?.find(item => item.id === 'p-ben')?.down; i++) {
      const boarder = h.controller.state.boarders[0];
      if (boarder) { benAt.x = boarder.x; benAt.z = boarder.z; }
      if (i % 10 === 0) tell();
      h.player.x = -18; h.player.z = -10;
      await h.advance(50);
    }
    const ben = h.controller.state.party.find(item => item.id === 'p-ben');
    expect(ben.down).toBe(true);
    expect(h.bus.find(event => event.type === 'player_fell')).toMatchObject({ playerId: 'p-ben', self: false });
    expect(h.shown.marks.at(-1)).toEqual([expect.objectContaining({ id: 'p-ben', mine: false })]);
    // Walk up to Ben and hold E.
    h.player.x = ben.x + 1; h.player.z = ben.z;
    await h.advance(100);
    expect(h.controller.wave.action).toMatchObject({ kind: 'revive', targetId: 'p-ben', price: revivePrice(3) });
    expect(h.shown.prompt.at(-1)[0]).toBe('Hold to help up · 🪙 35');
    // Hold the prompt (E works the same): a short hold that lets go starts over and charges nothing.
    h.hold(true); await h.advance(1000); h.hold(false); await h.advance(100);
    expect(h.reviveCaptain).not.toHaveBeenCalled();
    h.hold(true); await h.advance(1000);
    expect(h.controller.revive).toMatchObject({ targetId: 'p-ben' });
    expect(h.controller.revive.share).toBeGreaterThan(.4);
    await h.advance(1100);
    expect(h.reviveCaptain).toHaveBeenCalledTimes(1);
    expect(h.reviveCaptain).toHaveBeenCalledWith({ waveId: INFO.waveId, fallen: 'p-ben' });
    await h.advance(400);
    const revive = h.sent.find(item => item.type === 'captain_revive');
    expect(revive.payload).toMatchObject({ by: 'p-me', targetId: 'p-ben' });
    await h.advance(600);
    expect(h.controller.state.party.find(item => item.id === 'p-ben')).toMatchObject({ down: false, hp: H.hp * H.revive.share });
    expect(h.bus.find(event => event.type === 'player_revived')).toMatchObject({ playerId: 'p-ben', self: false, by: 'p-me' });
    h.hold(false);
  });

  it('shows the refusal (too few coins) and charges nothing more until you let go', async () => {
    const reviveCaptain = vi.fn(async () => { throw new FakeApiError(409, 'insufficient_funds', 'Helping a captain up costs 35 coins. You need more coins.'); });
    const h = harness({ reviveCaptain });
    h.controller.start(INFO);
    await h.advance(1100);
    let seq = 1;
    const benAt = { x: 40, z: 0 };
    for (let i = 0; i < 6000 && !h.controller.state.party?.find(item => item.id === 'p-ben')?.down; i++) {
      const boarder = h.controller.state.boarders[0];
      if (boarder) { benAt.x = boarder.x; benAt.z = boarder.z; }
      if (i % 10 === 0) h.hear('captain_move', { by: 'p-ben', seq: seq++, t: (h.controller.wave.ticks + 8) * .05, x: benAt.x, z: benAt.z });
      h.player.x = -18; h.player.z = -10;
      await h.advance(50);
    }
    const ben = h.controller.state.party.find(item => item.id === 'p-ben');
    h.player.x = ben.x + 1; h.player.z = ben.z;
    h.hold(true); await h.advance(2600);
    expect(reviveCaptain).toHaveBeenCalledTimes(1);
    expect(h.shown.prompt.at(-1)[0]).toBe('Helping a captain up costs 35 coins. You need more coins.');
    await h.advance(3000);
    expect(reviveCaptain).toHaveBeenCalledTimes(1);
    expect(h.sent.some(item => item.type === 'captain_revive')).toBe(false);
    h.hold(false); await h.advance(100); h.hold(true); await h.advance(2200);
    expect(reviveCaptain).toHaveBeenCalledTimes(2);
  });
});

describe('captain health: the HUD words and the art', () => {
  it('says your hp, the fallen strip and the timers in plain words', () => {
    expect(healthText({ hp: 72.4, maxHp: 100 })).toBe('Captain 73 / 100');
    expect([clockText(0), clockText(9.7), clockText(75)]).toEqual(['0:00', '0:09', '1:15']);
    expect(DOWN_TITLE).toBe('You have fallen');
    expect(downLine(false)).toBe('a teammate can hold E next to you');
    expect(downLine(true)).toBe('every captain is down');
  });
  it('draws a fallen captain in each of the ten lobby colours', () => {
    const frames = peopleFrames();
    expect(DOWN_IDS).toHaveLength(10);
    for (const id of DOWN_IDS) expect(frames[id]?.slice(0, 3)).toEqual([40, 24, 3]);
  });
});

describe('captain health: the fake server (POST /api/waves/revive)', () => {
  it('charges the reviver 20 + 5 x wave once per actionUid, only in the wave and with the coins', async () => {
    const world = createFakeWorld({ seed: 3 });
    const api = createFakeIslandApi({ world, playerId: 'me', code: 'K7Q2M', now: () => START });
    await api.island();
    const wave = await api.startWave({ where: 'own', actionUid: 'bell-0001' });
    const later = createFakeIslandApi({ world, playerId: 'me', code: 'K7Q2M', now: () => START + 15000 });
    const price = revivePrice(wave.wave), before = (await later.island()).coins;
    const paid = await later.reviveCaptain({ waveId: wave.waveId, fallen: 'p-ben', actionUid: 'revive-0001' });
    expect(paid).toEqual({ price, coins: before - price, repeat: false });
    expect(await later.reviveCaptain({ waveId: wave.waveId, fallen: 'p-ben', actionUid: 'revive-0001' })).toEqual({ price, coins: before - price, repeat: true });
    const stranger = createFakeIslandApi({ world, playerId: 'ana', now: () => START + 15000 });
    await stranger.island();
    await expect(stranger.reviveCaptain({ waveId: wave.waveId, fallen: 'p-me', actionUid: 'revive-0002' })).rejects.toBeInstanceOf(FakeApiError);
    await expect(later.reviveCaptain({ waveId: 'fake-wave-99', fallen: 'p-ben', actionUid: 'revive-0003' })).rejects.toMatchObject({ code: 'no_such_wave' });
    world.players.get('me').coins = price - 1;
    await expect(later.reviveCaptain({ waveId: wave.waveId, fallen: 'p-ben', actionUid: 'revive-0004' })).rejects.toMatchObject({ code: 'insufficient_funds' });
  });
});
