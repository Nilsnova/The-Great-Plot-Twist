// A teammate's shot drawn at once from the island room (feat/recovery-teammate-instant): drawing only, from a
// participant of this wave, at most 8 a second, never twice (the replayed copy is matched by the teammate's
// token and actor counter) and forgotten when the journal never replays it; the adaptive playout bounds.
import { describe, expect, it, vi } from 'vitest';
import { createWaveController, recoveryPlayoutTarget, RECOVERY_PLAYOUT_MIN_MS } from '../../src/pirates/controller.js';
import { createRoomProxy } from '../../src/pirates/room.js';
import { toMessage } from '../../src/pirates/sync.js';

const START = Date.UTC(2026, 10, 18, 18, 0, 0);
const ME = '7165d60f-14f5-4b9e-96a0-2ed457b4c219', MATE = '2b8c0f0e-5a71-4c2e-9d55-0f6b2b7e9a10';
const LATE = '3c9d1f1f-6b82-4d3f-8e66-1a7c3c8fab21', STRANGER = '4dae2020-7c93-4e40-9f77-2b8d4d9fbc32';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function snapshot() {
  return { recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-t', islandEpoch: 'epoch-t', seed: 91,
    startsAt: new Date(START + 1000).toISOString(), weather: { kind: 'calm', ships: 2, fog: 0 }, rules: ['structure_recovery'],
    participants: [ME, MATE].map(participantToken => ({ participantToken, captain: { level: 1, skills: [], weapon: 'musket' } })),
    createWave: { seed: 91, wave: 3, weather: { kind: 'calm', ships: 2, fog: 0 }, island: { hp: 1e9 }, defenses: [] }, structures: [] };
}

function setup() {
  let now = START;
  const journal = [], drawn = [], sent = [];
  const room = createRoomProxy();
  room.attach({ send: (type, payload) => { sent.push({ type, payload }); return true; }, on: () => () => {} });
  const seal = () => Math.max(-1, Math.floor((now - (START + 1000)) / 50) - 1);
  const transport = {
    readEvents: vi.fn(async ({ after = 0 } = {}) => ({ headSeq: journal.length, sealedThroughTick: seal(), events: journal.slice(after) })),
    sendInputs: vi.fn(async ({ inputs }) => ({ accepted: inputs.map(item => {
      const event = { serverSeq: journal.length + 1, effectiveTick: Math.max(item.tick, seal() + 1), type: 'captain_input', participantToken: ME,
        payload: { inputUid: item.inputUid, actorCounter: item.actorCounter, participantToken: ME, command: item.command,
          captain: { level: 1, skills: [], weapon: 'musket' } } };
      journal.push(event); return event;
    }) })),
    checkpoint: vi.fn(async ({ checkpoint: body }) => ({ accepted: true, throughTick: body.throughTick, inputHeadSeq: body.inputHeadSeq,
      lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits })),
    finishWave: vi.fn(async () => null),
  };
  const listeners = new Map(), bus = {
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
  };
  const renderer = { events: list => { for (const event of list) if (event.type === 'captain_fired' || event.type === 'captain_struck') drawn.push({ ...event, at: now }); },
    update() {}, setVisible() {}, dispose() {} };
  const world = { scene: {}, player: { position: { x: 0, z: 0 } } };
  const controller = createWaveController({ bus, now: () => now, recoveryTransport: transport, world, room, getDefenses: () => [],
    recoveryPlayoutMs: 0, createRenderer: () => renderer, createHud: () => null, setTimer: () => ({}), clearTimer: () => {}, accept: () => true });
  const snap = snapshot();
  bus.emit({ type: 'wave_started_server', waveId: 'wave-t', wave: 3, seed: 91, startsAt: snap.startsAt, weather: snap.weather,
    rules: snap.rules, recoveryVersion: 1, waveProtocol: 2, initialSnapshot: snap, participantToken: ME, lastActorCounter: 0 });
  const step = async ms => { now += ms; controller.update(ms / 1000); await tick(); await tick(); };
  const untilShip = async () => { for (let i = 0; i < 400 && !controller.state?.ships?.length; i++) await step(100); return controller.state.ships[0]; };
  const shot = (by, ship, { seq = 1, waveId = 'wave-t', level = 1 } = {}) => toMessage(
    { type: 'captain_shot', by, targetId: ship.id, level, x: ship.x + 2, z: ship.z, skills: [], weapon: 'musket' },
    { by, seq, tick: controller.wave.ticks, waveId });
  const hear = message => room.receive(message.type, message.payload);
  const journalShot = (by, ship, counter) => journal.push({ serverSeq: journal.length + 1, effectiveTick: seal() + 1, type: 'captain_input',
    participantToken: by, payload: { inputUid: `mate-${counter}`, actorCounter: counter, participantToken: by,
      command: { type: 'captain_shot', targetId: ship.id, x: ship.x + 2, z: ship.z }, captain: { level: 1, skills: [], weapon: 'musket' } } });
  return { controller, drawn, sent, journal, step, untilShip, shot, hear, journalShot, seal, world, at: () => now };
}

describe("a teammate's actions over the room (drawing only)", () => {
  it('draws a valid teammate shot at once and ignores another wave, a stranger, yourself and a bad shape', async () => {
    const h = setup();
    const ship = await h.untilShip();
    h.hear(h.shot(MATE, ship));
    expect(h.drawn.filter(event => event.by === MATE)).toHaveLength(1);
    expect(h.drawn[0]).toMatchObject({ type: 'captain_fired', by: MATE, toX: ship.x, toZ: ship.z });
    const before = h.drawn.length;
    h.hear(h.shot(MATE, ship, { seq: 2, waveId: 'other-wave' }));
    h.hear(h.shot(STRANGER, ship, { seq: 3 }));
    h.hear(h.shot(ME, ship, { seq: 4 }));
    h.hear(h.shot(MATE, ship, { seq: 5, level: 9 }));
    h.hear({ type: 'captain_shot', payload: { by: MATE, seq: 6, t: 1, waveId: 'wave-t', targetId: '<b>', level: 1, x: 1, z: 1 } });
    expect(h.drawn.length).toBe(before);
    // A late joiner's token is known from its participant_joined journal event.
    h.journal.push({ serverSeq: h.journal.length + 1, effectiveTick: h.seal() + 1, type: 'participant_joined', participantToken: LATE,
      payload: { participantToken: LATE, captain: { level: 1, skills: [], weapon: 'musket' } } });
    await h.step(1100);
    h.hear(h.shot(LATE, h.controller.state.ships[0], { seq: 1 }));
    expect(h.drawn.filter(event => event.by === LATE)).toHaveLength(1);
    h.controller.dispose();
  });

  it('accepts at most 8 a second from one teammate', async () => {
    const h = setup();
    const ship = await h.untilShip();
    for (let seq = 1; seq <= 20; seq++) h.hear(h.shot(MATE, ship, { seq }));
    expect(h.drawn.filter(event => event.by === MATE)).toHaveLength(8);
    await h.step(1100);
    h.hear(h.shot(MATE, h.controller.state.ships[0], { seq: 21 }));
    expect(h.drawn.filter(event => event.by === MATE)).toHaveLength(9);
    h.controller.dispose();
  });

  it('does not draw the replayed copy of a drawn shot, and forgets one the journal never replays', async () => {
    const h = setup();
    let ship = await h.untilShip();
    h.hear(h.shot(MATE, ship, { seq: 5 }));
    h.journalShot(MATE, ship, 5);
    for (let i = 0; i < 30; i++) await h.step(100);
    expect(h.drawn.filter(event => event.by === MATE)).toHaveLength(1); // drawn by the room, not again by the replay
    // A drawn shot the journal never replays (the sim refused it, the input was lost) is forgotten ...
    ship = h.controller.state.ships[0];
    h.hear(h.shot(MATE, ship, { seq: 7 }));
    for (let i = 0; i < 50; i++) await h.step(100);
    // ... so a later shot that only the journal knows is drawn as usual.
    ship = h.controller.state.ships[0];
    h.journalShot(MATE, ship, 9);
    for (let i = 0; i < 30; i++) await h.step(100);
    expect(h.drawn.filter(event => event.by === MATE)).toHaveLength(3);
    h.controller.dispose();
  });

  it('tells the room about your own shot with your token and actor counter', async () => {
    const h = setup();
    const ship = await h.untilShip();
    h.controller.wave.captainAt = -Infinity;
    h.world.player.position = { x: ship.x + 2, z: ship.z };
    expect(h.controller.shoot(ship.id)).toBe(true);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: 'captain_shot', payload: { by: ME, seq: h.controller.wave.actorCounter, waveId: 'wave-t', targetId: ship.id } });
    h.controller.dispose();
  });
});

describe('the adaptive playout', () => {
  it('follows the round trip between its floor and the configured ceiling', () => {
    expect(recoveryPlayoutTarget(100)).toBe(750);
    expect(recoveryPlayoutTarget(200)).toBe(800);
    expect(recoveryPlayoutTarget(450)).toBe(925);
    expect(recoveryPlayoutTarget(2000)).toBe(1000);
    expect(recoveryPlayoutTarget(0)).toBeGreaterThanOrEqual(RECOVERY_PLAYOUT_MIN_MS);
    expect(recoveryPlayoutTarget(200, 0)).toBe(0);
  });
});
