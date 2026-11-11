// Pirate Point (task 0.4): the bell, joining a running wave, and the three lamps sending lamps_lit once.
import { describe, expect, it } from 'vitest';
import { createFakeIslandApi, createFakeWorld } from '../../src/pirates/fake-api.js';
import { BELL_SPOT, COAST, DEFENSES, LAMP_SPOTS, LANES, PLACE, ROOM_TOPIC, createPiratePoint, lampHint, LAMP_HINT_SECONDS } from '../../src/pirates/pirate-point.js';
import { createWave } from '../../src/pirates/sim.js';
import { encodeLamps, lightLamp, mergeLamps, createLamps } from '../../src/class-demo/lamp-sync.js';

function createBus() {
  const listeners = new Map(), log = [];
  return { log, on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { log.push(event); for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event); } };
}
function fakeRoom() {
  const handlers = new Map(), sent = [];
  return { sent, handlers, send(type, payload) { sent.push({ type, payload }); return true; },
    on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); }, close() { handlers.clear(); } };
}
function setup({ api, room = fakeRoom(), clock = { now: Date.UTC(2026, 10, 11, 12) } } = {}) {
  const world = createFakeWorld();
  api ??= createFakeIslandApi({ world, now: () => clock.now });
  const finales = [], cutscenes = [], bus = createBus(), opened = [];
  const point = createPiratePoint({ bus, api, world: { place: () => PLACE, player: { position: { x: BELL_SPOT.x, z: BELL_SPOT.z } } },
    openRoom: topic => { opened.push(topic); return room; }, playerId: 'me', playCutscene: async id => { cutscenes.push(id); },
    createFinale: options => { const finale = { options, state: { lamps: [{}, {}, {}] }, update: () => ({ progress: 0 }), lit: () => false, receive() {}, dispose() {} }; finales.push(finale); return finale; },
    controllerOptions: { now: () => clock.now, createRenderer: () => null, createHud: () => null, setTimer: () => 0, clearTimer() {} } });
  return { point, api, room, clock, finales, cutscenes, bus, opened, world };
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('Pirate Point', () => {
  it('keeps its shared defenses on Lighthouse Isle and wins only with the lamps', () => {
    expect(DEFENSES.filter(item => item.kind === 'cannon')).toHaveLength(4);
    expect(DEFENSES.filter(item => item.kind === 'wall')).toHaveLength(4);
    expect(LAMP_SPOTS).toHaveLength(3);
    const play = lamps => {
      const wave = createWave({ seed: 5, wave: 1, flagship: true, defenses: DEFENSES, coast: COAST, lanes: LANES });
      while (!wave.done) { const f = wave.state().ships.find(ship => ship.kind === 'flagship'); wave.step(.05, lamps && f ? [{ type: 'lamps_lit' }] : []); }
      return wave.result();
    };
    expect(play(true).survived).toBe(true);
    expect(play(false).survived).toBe(false);
  });

  it('rings the bell, tells the room, plays the armada once and sends lamps_lit once', async () => {
    const h = setup();
    expect(h.opened).toEqual([ROOM_TOPIC]);
    expect(await h.point.ringBell()).toBe(true);
    await flush();
    const start = h.room.sent.find(item => item.type === 'wave_start');
    expect(start.payload).toMatchObject({ waveId: expect.any(String), seed: expect.any(Number), startsAt: expect.any(String) });
    expect(h.cutscenes).toEqual(['armada']);
    expect(h.point.controller.wave.info.flagship).toBe(true);
    expect(await h.point.ringBell()).toBe(false); // a wave is running
    // Into the wave; then all three lamps burn (twice, as a second phone's message would say again).
    h.clock.now = Date.parse(start.payload.startsAt) + 3000; h.point.update(.1);
    expect(h.finales).toHaveLength(1);
    h.finales[0].options.onRelit({ celebrate: true });
    h.point.update(.1);
    h.finales[0].options.onRelit({ celebrate: true });
    for (let i = 0; i < 5; i++) { h.clock.now += 100; h.point.update(.1); }
    const lamps = h.room.sent.filter(item => item.type === 'lamps_lit');
    expect(lamps).toHaveLength(1);
    expect(lamps[0].payload).toMatchObject({ by: 'me', waveId: start.payload.waveId });
    expect(h.point.controller.lampsLit()).toBe(false);
    expect(h.point.controller.state.lampsLit).toBe(true);
    // The lamp states travel in the same room, tagged with the wave.
    h.finales[0].options.send('lamp', { v: 1, lamps: [0, null, null], relit: null, started: 0 });
    expect(h.room.sent.at(-1)).toMatchObject({ type: 'lamp', payload: { waveId: start.payload.waveId } });
    h.point.dispose();
    expect(h.room.handlers.size).toBe(0);
  });

  it('does not send lamps_lit when another captain already did, and joins a wave it hears of', async () => {
    const shared = createFakeWorld(), clock = { now: Date.UTC(2026, 10, 11, 12) };
    const ringer = createFakeIslandApi({ world: shared, playerId: 'ringer', now: () => clock.now });
    const info = await ringer.startWave({ where: 'pirate_point', actionUid: 'ring-1' });
    const h = setup({ api: createFakeIslandApi({ world: shared, playerId: 'me', now: () => clock.now }), clock });
    await flush(); // arriving: GET current, then join
    expect(h.point.controller.wave?.info.waveId).toBe(info.waveId);
    h.room.handlers.get('wave_start')?.({ waveId: info.waveId }); // hearing it again changes nothing
    clock.now = Date.parse(info.startsAt) + 2000; h.point.update(.1);
    h.room.handlers.get('lamps_lit')({ by: 'ringer', seq: 1, t: 2.5, waveId: info.waveId });
    h.finales[0].options.onRelit({ celebrate: true });
    for (let i = 0; i < 10; i++) { clock.now += 100; h.point.update(.1); }
    expect(h.room.sent.filter(item => item.type === 'lamps_lit')).toHaveLength(0);
    expect(h.point.controller.state.lampsLit).toBe(true);
    h.point.dispose();
  });
});

// Three captains on three pages at Pirate Point: one room each, joined by a hub that hands every message
// to the other pages (as live:place:pirate_point:1 does). The finale is the class demo's real lamp sync.
describe('Pirate Point with three captains', () => {
  it('one rings, all join, three different captains light the three lamps, one lamps_lit, the flagship sinks, all get loot', async () => {
    const shared = createFakeWorld(), clock = { now: Date.UTC(2026, 10, 11, 12) };
    const rooms = [];
    const hubRoom = () => {
      const handlers = new Map(), sent = [];
      const room = { sent, handlers, send(type, payload) { sent.push({ type, payload });
        for (const other of rooms) if (other !== room) for (const fn of [...(other.handlers.get(type) ?? [])]) fn(payload);
        return true; },
      on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type)?.delete(fn); },
      close() { handlers.clear(); } };
      rooms.push(room); return room;
    };
    const captains = ['ana', 'ben', 'max'].map(playerId => {
      const room = hubRoom(), finales = [], bus = createBus();
      const api = createFakeIslandApi({ world: shared, playerId, now: () => clock.now });
      const point = createPiratePoint({ bus, api, world: { place: () => PLACE, player: { position: { x: 30, z: 30 } } }, playerId,
        openRoom: () => room, playCutscene: async () => {},
        // The real lamp sync (lamp-sync.js) behind the finale: light(index) is this captain holding E at a lamp.
        createFinale: options => {
          let state = createLamps();
          const apply = result => { if (!result.changed) return; state = result.state; if (result.relitNow) options.onRelit({ celebrate: true }); };
          const finale = { options, get state() { return state; }, update: () => ({ progress: 0 }), lit: () => false, dispose() {},
            light(index) { apply(lightLamp(state, index, playerId, clock.now)); options.send('lamp', encodeLamps(state, clock.now)); },
            receive(data) { apply(mergeLamps(state, data, clock.now)); } };
          finales.push(finale); return finale;
        },
        controllerOptions: { now: () => clock.now, createRenderer: () => null, createHud: () => null, setTimer: () => 0, clearTimer() {} } });
      return { playerId, room, finales, bus, point };
    });
    const [ana, ben, max] = captains;
    await flush();
    expect(await ana.point.ringBell()).toBe(true);
    for (let i = 0; i < 4; i++) await flush(); // ben and max hear wave_start and join
    const waveId = ana.point.controller.wave.info.waveId;
    expect(captains.map(c => c.point.controller.wave?.info.waveId)).toEqual([waveId, waveId, waveId]);
    expect(captains.every(c => c.point.controller.wave.info.flagship)).toBe(true);

    // Into the wave: each captain lights a different lamp, a second apart.
    const start = ana.room.sent.find(item => item.type === 'wave_start').payload;
    clock.now = Date.parse(start.startsAt) + 3000;
    for (const c of captains) c.point.update(.1);
    for (const c of captains) expect(c.finales).toHaveLength(1);
    captains.forEach((c, index) => { clock.now += 1000; c.finales[0].light(index); for (const d of captains) d.point.update(.1); });
    for (let i = 0; i < 5; i++) { clock.now += 100; for (const c of captains) c.point.update(.1); }
    const sentLit = captains.flatMap(c => c.room.sent.filter(item => item.type === 'lamps_lit').map(item => item.payload.by));
    expect(sentLit).toHaveLength(1); // the lamps burn together: one lamps_lit for everybody
    // Each captain told the room about his own lamp, tagged with the wave (three different senders).
    expect(captains.map(c => c.room.sent.filter(item => item.type === 'lamp' && item.payload.waveId === waveId).length > 0)).toEqual([true, true, true]);
    expect(captains.map(c => c.finales[0].state.relitAt)).toEqual(captains.map(() => expect.any(Number))); // every page saw all three burn
    expect(captains.every(c => c.point.controller.state.lampsLit)).toBe(true);

    // The beam burns the flagship; the wave ends on every page and each captain gets loot.
    for (let i = 0; i < 6000 && !captains.every(c => c.bus.log.some(e => e.type === 'wave_finish_answered')); i++) {
      clock.now += 100; for (const c of captains) c.point.update(.1);
      if (i % 20 === 0) await flush();
    }
    for (const c of captains) {
      const finished = c.bus.log.find(e => e.type === 'wave_finished' && e.waveId === waveId);
      expect(finished, c.playerId).toMatchObject({ survived: true });
      expect(c.bus.log.find(e => e.type === 'wave_finish_answered').loot, c.playerId).toBeGreaterThan(0);
    }
    for (const c of captains) c.point.dispose();
  });
});

describe('the lamp hint', () => {
  it('tucks away after 6 s and comes back near a lamp, when a lamp lights or when the ships come', () => {
    let hint = lampHint({ age: 0, key: null, lit: -1 }, { key: 'w:countdown', lit: 0, near: false });
    for (let i = 0; i < 70; i++) hint = lampHint(hint, { key: 'w:countdown', lit: 0, near: false, dt: .1 });
    expect(hint.tucked).toBe(true); expect(LAMP_HINT_SECONDS).toBe(6);
    hint = lampHint(hint, { key: 'w:running', lit: 0, near: false, dt: .1 });
    expect(hint.tucked).toBe(false);
    for (let i = 0; i < 70; i++) hint = lampHint(hint, { key: 'w:running', lit: 0, near: false, dt: .1 });
    expect(hint.tucked).toBe(true);
    expect(lampHint(hint, { key: 'w:running', lit: 0, near: true, dt: .1 }).tucked).toBe(false);
    expect(lampHint(hint, { key: 'w:running', lit: 1, near: false, dt: .1 }).tucked).toBe(false);
  });
});
