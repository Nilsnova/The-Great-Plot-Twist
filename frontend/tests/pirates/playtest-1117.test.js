// Regression checks for the owner's two-player playtest of 17 Nov (fix/playtest-1117): the round's loot (1), shells
// that land after the wave (2), an instant paid repair (3), thrown bombs drawn at once (4), the weapon in the
// journal (5, 7), the seen tick for blows at moving boarders and smooth motion (6), every structure whole after a
// wave (10) and the legacy shape of a recovery defense's tree (11).
import { describe, expect, it, vi } from 'vitest';
import { createWaveController, roundLootText } from '../../src/pirates/controller.js';
import { createRoomProxy } from '../../src/pirates/room.js';
import { commandForJournal, simulationInputFromJournal } from '../../src/pirates/recovery-transport.js';
import { createWave } from '../../src/pirates/sim.js';
import { createSmoother } from '../../src/pirates/smoothing.js';
import { captainStats } from '../../src/pirates/captain-stats.js';
import { readTree, treeStats } from '../../src/pirates/tower-trees.js';
import { toMessage } from '../../src/pirates/sync.js';

const START = Date.UTC(2026, 10, 18, 20, 0, 0);
const ME = '7165d60f-14f5-4b9e-96a0-2ed457b4c219', MATE = '2b8c0f0e-5a71-4c2e-9d55-0f6b2b7e9a10';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function snapshot({ defenses = [], structures = [], weapon = 'musket' } = {}) {
  return { recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-p', islandEpoch: 'epoch-p', seed: 91,
    startsAt: new Date(START + 1000).toISOString(), weather: { kind: 'calm', ships: 2, fog: 0 }, rules: ['structure_recovery'],
    participants: [ME, MATE].map(participantToken => ({ participantToken, captain: { level: 1, skills: [], weapon } })),
    createWave: { seed: 91, wave: 3, weather: { kind: 'calm', ships: 2, fog: 0 }, island: { hp: 1e9 }, defenses }, structures };
}

function setup({ weapon = 'musket', defenses, structures, finish, startNextWave = null } = {}) {
  let now = START;
  const journal = [], drawn = [], sent = [], timers = [];
  const room = createRoomProxy();
  room.attach({ send: (type, payload) => { sent.push({ type, payload }); return true; }, on: () => () => {} });
  const seal = () => Math.max(-1, Math.floor((now - (START + 1000)) / 50) - 1);
  const transport = {
    readEvents: vi.fn(async ({ after = 0 } = {}) => ({ headSeq: journal.length, sealedThroughTick: seal(), events: journal.slice(after) })),
    sendInputs: vi.fn(async ({ inputs }) => ({ accepted: inputs.map(item => {
      const event = { serverSeq: journal.length + 1, effectiveTick: Math.max(item.tick, seal() + 1), type: 'captain_input', participantToken: ME,
        payload: { inputUid: item.inputUid, actorCounter: item.actorCounter, participantToken: ME, command: item.command,
          captain: { level: 1, skills: [], weapon } } };
      journal.push(event); return event;
    }) })),
    checkpoint: vi.fn(async ({ checkpoint: body }) => ({ accepted: true, throughTick: body.throughTick, inputHeadSeq: body.inputHeadSeq,
      lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits })),
    finishWave: finish ?? vi.fn(async () => null),
  };
  const listeners = new Map(), bus = { events: [],
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { bus.events.push(event); for (const fn of listeners.get(event.type) ?? []) fn(event); } };
  let renderState = null;
  const renderer = { events: list => { for (const event of list) drawn.push({ ...event, at: now }); },
    update: ({ state, simTime }) => { renderState = { state, simTime }; }, setVisible() {}, dispose() {} };
  const hud = { log: [], loot(value) { hud.chip = value; }, banner(title, line) { hud.lastBanner = [title, line]; } };
  const world = { scene: {}, container: {}, player: { position: { x: 0, z: 0 } } };
  const controller = createWaveController({ bus, now: () => now, recoveryTransport: transport, world, room, getDefenses: () => [],
    recoveryPlayoutMs: 0, createRenderer: () => renderer, createHud: () => new Proxy(hud, { get: (target, key) => (key === 'then' ? undefined : target[key] ?? (() => {})) }),
    captainWeapon: () => weapon, startNextWave,
    setTimer: (fn, ms) => { const timer = { at: now + ms, fn }; timers.push(timer); return timer; },
    clearTimer: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); }, accept: () => true });
  const snap = snapshot({ defenses, structures, weapon });
  bus.emit({ type: 'wave_started_server', waveId: 'wave-p', wave: 3, seed: 91, startsAt: snap.startsAt, weather: snap.weather,
    rules: snap.rules, recoveryVersion: 1, waveProtocol: 2, initialSnapshot: snap, participantToken: ME, lastActorCounter: 0 });
  const step = async ms => {
    now += ms;
    for (const timer of timers.filter(item => item.at <= now)) { timers.splice(timers.indexOf(timer), 1); timer.fn(); }
    controller.update(ms / 1000); await tick(); await tick();
  };
  const untilShip = async () => { for (let i = 0; i < 400 && !controller.state?.ships?.length; i++) await step(100); return controller.state.ships[0]; };
  return { controller, drawn, sent, journal, transport, step, untilShip, world, hud, bus, room, render: () => renderState, at: () => now };
}

describe('1. the "+coins" of a round', () => {
  it('shows nothing before the answer, then this wave\'s loot (never a run total); the lost banner says the same', async () => {
    const finish = vi.fn(async body => ({ ok: true, data: { loot: 0, coins: 120, waveBest: 1, flags: 1, recovery: {
      waveId: body.waveId, islandEpoch: 'epoch-p', closedAt: new Date(START).toISOString(), closedHp: {}, checkpointUid: 'closeuid0001',
      throughTick: body.checkpoint.throughTick, inputHeadSeq: body.checkpoint.inputHeadSeq, lastRepairSeq: 0, basisRepairSeq: {} } } }));
    const h = setup({ finish, startNextWave: () => new Promise(() => {}) });
    await h.step(1000);
    expect(h.hud.chip ?? null).toBeNull();
    for (let i = 0; i < 40 && !h.controller.wave?.done; i++) await h.step(60_000);
    for (let i = 0; i < 20 && !h.controller.wave?.recoveryFinishAnswered; i++) await h.step(500);
    const current = h.controller.wave;
    expect(current.roundLoot).toBe(0);
    if (!current.result.survived) expect(h.hud.lastBanner[1]).toContain(roundLootText(0));
    current.done && h.controller.update(0); // the next frame shows this round's coins
    expect(h.hud.chip).toBe(0);
    h.controller.dispose();
  });
});

describe('2. shells and bombs in flight after the wave', () => {
  it('keeps the drawing clock running after the end, so flights land instead of hanging in the air', async () => {
    const h = setup();
    await h.step(1000);
    for (let i = 0; i < 40 && !h.controller.wave?.done; i++) await h.step(60_000);
    const at = h.render().simTime;
    await h.step(500); await h.step(500);
    expect(h.render().simTime).toBeGreaterThan(at + .9);
    h.controller.dispose();
  });
});

describe('3 and 10. repair and the break', () => {
  const wall = { id: 'wall_1', kind: 'wall', level: 1, x: 0, z: 11 };
  const row = { spot: 'wall_1', instanceId: 'wall-1', kind: 'wall', level: 1, x: 0, z: 11, hpUnits: 400_000, maxHP: 60, repairSeq: 0 };
  it('a paid repair needs no round trips when the saved checkpoint already holds the screen, and draws the wall whole at once', async () => {
    const h = setup({ defenses: [wall], structures: [row] });
    await h.step(1000);
    const calls = () => h.transport.readEvents.mock.calls.length + h.transport.checkpoint.mock.calls.length + h.transport.sendInputs.mock.calls.length;
    const before = calls();
    expect(await h.controller.checkpointBeforeRepair()).toEqual({ ok: true, reused: true });
    expect(calls()).toBe(before);
    h.controller.repairedNow('wall_1');
    await h.step(16);
    expect(h.render().state.walls[0].hp).toBe(60); // drawn whole in the next frame
    expect(h.controller.state.walls[0].hp).toBeLessThan(60); // the sim waits for the replayed repair
    h.controller.dispose();
  });
  it('the break draws every wall and tower whole (the server repaired them as the wave closed)', async () => {
    const h = setup({ defenses: [wall], structures: [row] });
    await h.step(1000);
    for (let i = 0; i < 40 && !h.controller.wave?.done; i++) await h.step(60_000);
    await h.step(16);
    expect(h.render().state.walls.every(item => item.hp === item.maxHp && !item.broken)).toBe(true);
    h.controller.dispose();
  });
});

describe('4. a thrown bomb', () => {
  it('your own throw is drawn in the frame of the press and bursts where it lands; the replayed copies are not drawn again', async () => {
    const h = setup({ weapon: 'fire_bombs' });
    const ship = await h.untilShip();
    h.controller.wave.captainAt = -Infinity;
    h.world.player.position = { x: ship.x + 3, z: ship.z };
    const pressedAt = h.at();
    expect(h.controller.aim({ x: ship.x, z: ship.z })).toBe(true);
    const throwDrawn = h.drawn.filter(event => event.type === 'captain_fired' && event.by === ME);
    expect(throwDrawn).toHaveLength(1);
    expect(throwDrawn[0]).toMatchObject({ weapon: 'fire_bombs', mode: 'area', at: pressedAt });
    expect(h.sent.at(-1)).toMatchObject({ type: 'captain_shot', payload: { by: ME, weapon: 'fire_bombs' } });
    for (let i = 0; i < 40; i++) await h.step(100);
    expect(h.drawn.filter(event => event.type === 'captain_blast' && event.by === `captain:${ME}`)).toHaveLength(1);
    expect(h.drawn.filter(event => event.type === 'captain_fired' && event.by === ME)).toHaveLength(1);
    h.controller.dispose();
  });
  it("a teammate's throw from the room is drawn at once too", async () => {
    const h = setup();
    const ship = await h.untilShip();
    const message = toMessage({ type: 'captain_shot', by: MATE, targetId: null, level: 1, x: ship.x + 3, z: ship.z, ax: ship.x, az: ship.z,
      skills: [], weapon: 'fire_bombs' }, { by: MATE, seq: 1, tick: h.controller.wave.ticks, waveId: 'wave-p' });
    h.drawn.length = 0;
    h.room.receive(message.type, message.payload);
    expect(h.drawn.filter(event => event.type === 'captain_fired' && event.by === MATE)).toMatchObject([{ weapon: 'fire_bombs', mode: 'area' }]);
    for (let i = 0; i < 20; i++) await h.step(100);
    expect(h.drawn.filter(event => event.type === 'captain_blast' && event.by === `captain:${MATE}`)).toHaveLength(1);
    h.controller.dispose();
  });
});

describe('5 and 7. every input kind through the journal', () => {
  const inputs = [
    { type: 'fire', cannonId: 'cannon_1', targetId: 'ship_1' },
    { type: 'captain_shot', targetId: 'ship_1', x: 1, z: 2, seen: 40 },
    { type: 'captain_shot', targetId: null, x: 1, z: 2, ax: 4, az: 5, seen: 40 },
    { type: 'captain_strike', targetId: 'boarder_1', x: 1, z: 2, seen: 40 },
    { type: 'captain_move', x: 1, z: 2, colour: 3 },
    { type: 'captain_revive', targetId: MATE, x: 1, z: 2 },
    { type: 'finisher_ready', shipId: 'ship_1' },
    { type: 'finisher_input', from: 0, marks: [1, 2], easy: true },
  ];
  for (const input of inputs) {
    it(`${input.type}${input.ax !== undefined ? ' (thrown at a point)' : ''} survives commandForJournal and the replay`, () => {
      const command = commandForJournal(input);
      expect(command).toEqual(input);
      const replayed = simulationInputFromJournal({ serverSeq: 1, effectiveTick: 5, type: 'captain_input', participantToken: ME,
        payload: { inputUid: 'uid-00001', actorCounter: 1, participantToken: ME, command, captain: { level: 2, skills: [], weapon: 'fire_bombs' } } });
      expect(replayed).toMatchObject({ ...input, by: ME });
      if (input.type === 'captain_shot') expect(replayed.weapon).toBe('fire_bombs'); // the journal's weapon decides
    });
  }
  it('a fire bomb from the journal bursts in the sim (the weapon the server attached, not a musket)', () => {
    const sim = createWave({ seed: 5, wave: 3, defenses: [], recoveryVersion: 1, waveProtocol: 2, rules: ['structure_recovery'],
      recoveryStructures: [], island: { hp: 1e9 } });
    const events = [];
    for (let i = 0; i < 400 && !sim.state().ships.length; i++) events.push(...sim.step(.05));
    const ship = sim.state().ships[0];
    const input = simulationInputFromJournal({ serverSeq: 1, effectiveTick: 5, type: 'captain_input', participantToken: ME,
      payload: { inputUid: 'uid-00001', actorCounter: 1, participantToken: ME,
        command: { type: 'captain_shot', targetId: null, x: ship.x + 3, z: ship.z, ax: ship.x, az: ship.z },
        captain: { level: 2, skills: [], weapon: 'fire_bombs' } } });
    sim.step(.05, [{ type: 'captain_move', by: ME, x: ship.x + 3, z: ship.z }]);
    const out = sim.step(.05, [input]);
    for (let i = 0; i < 80; i++) out.push(...sim.step(.05));
    expect(out.some(event => event.type === 'captain_fired' && event.weapon === 'fire_bombs')).toBe(true);
    expect(out.some(event => event.type === 'captain_blast')).toBe(true);
  });
});

describe('6. blows at moving boarders and smooth motion', () => {
  it('the sim checks range at the tick the shooter saw (2 s back at most): a shot at a boarder at the edge of range hits', () => {
    const range = captainStats(1).range, hits = { seen: 0, unseen: 0 }, tries = { seen: 0, unseen: 0 };
    for (const seen of [true, false]) {
      const sim = createWave({ seed: 11, wave: 6, defenses: [], recoveryVersion: 1, waveProtocol: 2, rules: ['structure_recovery'],
        recoveryStructures: [], island: { hp: 1e9 } });
      for (let i = 0; i < 6000 && tries[seen ? 'seen' : 'unseen'] < 25; i++) {
        const walking = sim.state().boarders.find(item => item.state === 'walking');
        if (walking && i % 30 === 0) {
          const viewTick = Math.round(sim.state().time / .05);
          // Where the shooter stands: just inside musket range, behind the boarder's walk (it walks away).
          const heart = { x: 0, z: 2 }, dx = walking.x - heart.x, dz = walking.z - heart.z, d = Math.hypot(dx, dz) || 1;
          const at = { x: walking.x + dx / d * (range - .3), z: walking.z + dz / d * (range - .3) };
          if (Math.abs(at.x) > 480 || Math.abs(at.z) > 480) { sim.step(.05); continue; }
          for (let k = 0; k < 20; k++) sim.step(.05, [{ type: 'captain_move', by: ME, x: at.x, z: at.z }]); // lands ~1 s later
          const out = sim.step(.05, [{ type: 'captain_shot', by: ME, targetId: walking.id, level: 1, skills: [], weapon: 'musket', x: at.x, z: at.z,
            ...(seen ? { seen: viewTick } : {}) }]);
          tries[seen ? 'seen' : 'unseen']++;
          if (out.some(event => event.type === 'captain_fired')) hits[seen ? 'seen' : 'unseen']++;
        } else sim.step(.05);
      }
    }
    process.stdout.write(`\n[playtest] musket shots at a walking boarder just inside range where drawn, landing 1 s later: ${JSON.stringify({ hits, tries })}\n`);
    expect(hits.seen).toBeGreaterThan(hits.unseen);
  });
  it('a ship or boarder glides between ticks and a burst of ticks does not teleport it; a long jump snaps', () => {
    let clock = 0;
    const smooth = createSmoother(() => clock);
    expect(smooth({ id: 'boarder_1', x: 0, z: 0 })).toMatchObject({ x: 0, z: 0 });
    clock = .01;
    const mid = smooth({ id: 'boarder_1', x: 1.2, z: 0 }); // four ticks at once
    expect(mid.x).toBe(0);
    clock = .04; expect(smooth({ id: 'boarder_1', x: 1.2, z: 0 }).x).toBeCloseTo(.6, 5);
    clock = .1; expect(smooth({ id: 'boarder_1', x: 1.2, z: 0 }).x).toBe(1.2);
    clock = .11; expect(smooth({ id: 'boarder_1', x: 20, z: 0 }).x).toBe(20); // caught up a long stretch: drawn at once
  });
});

describe('11. a recovery defense has the legacy shape', () => {
  it('reads a tree stored as [a, b] like {a, b}, so towers in older snapshots keep their tree', () => {
    expect(readTree('cannon', [2, 0])).toEqual(readTree('cannon', { a: 2, b: 0 }));
    expect(treeStats('cannon', [2, 0])).toEqual(treeStats('cannon', { a: 2, b: 0 }));
    const legacy = createWave({ seed: 3, wave: 30, defenses: [{ id: 'cannon_1', kind: 'cannon', level: 5, x: 2, z: 1, tree: { a: 2, b: 0 } }] });
    const stored = createWave({ seed: 3, wave: 30, defenses: [{ id: 'cannon_1', kind: 'cannon', level: 5, x: 2, z: 1, tree: [2, 0] }] });
    expect(stored.state().towers).toEqual(legacy.state().towers);
  });
});
