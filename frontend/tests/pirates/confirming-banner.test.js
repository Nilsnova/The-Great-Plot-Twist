// Playtest 21 Nov (live, wave 74): after a won wave "Wave over · Confirming the result…" stayed on the island
// for as long as the break was paused. The banner belongs to the wait for the server's answer; once the
// answer is there the break card takes over, so the banner must go, paused or not.
import { describe, expect, it } from 'vitest';
import { createWaveController } from '../../src/pirates/controller.js';

const START = Date.UTC(2026, 10, 21, 12, 0, 0), STARTS = START + 5000, TICK_MS = 50, FRAME_MS = 16, ROUND_TRIP_MS = 200;
const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const defenses = [
  { id: 'wall_1', kind: 'wall', level: 2, x: 0, z: 11 }, { id: 'wall_2', kind: 'wall', level: 2, x: 8, z: 8 },
  { id: 'cannon_1', kind: 'cannon', level: 2, x: -8, z: -3 }, { id: 'cannon_2', kind: 'cannon', level: 2, x: 8, z: -3 },
];
const snapshot = () => ({ recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-banner', islandEpoch: 'epoch-banner', seed: 20261121,
  startsAt: new Date(STARTS).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'],
  participants: [{ participantToken: TOKEN, captain: { level: 1, skills: [], weapon: 'musket' } }],
  createWave: { seed: 20261121, wave: 2, weather: { ships: 1, fog: 0 }, island: { hp: 10_000 }, towerHealth: true, pathing: true, towerObstacles: true, defenses },
  structures: defenses.map(item => ({ spot: item.id, instanceId: `${item.id}-b`, kind: item.kind, level: item.level, x: item.x, z: item.z,
    hpUnits: 1_000_000, maxHP: item.kind === 'wall' ? 120 : 130, repairSeq: 0 })) });

/** One recovery wave against a small journal server with a fixed round trip; the HUD records its banner and break card. */
async function playToTheBreak({ paused }) {
  let now = START, sealed = -1;
  const listeners = new Map(), bus = {
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); } };
  const queue = [], timers = [], seen = [];
  const hud = { banner: null, card: null };
  const serverTick = at => Math.floor((at - STARTS) / TICK_MS);
  const request = answer => new Promise(resolve => { const sent = now;
    queue.push({ at: sent + ROUND_TRIP_MS / 2, run: () => { const value = answer(now); queue.push({ at: sent + ROUND_TRIP_MS, run: () => resolve(value) }); } }); });
  const transport = {
    readEvents: ({ after = 0, through, sealedThroughTick } = {}) => request(at => {
      if (through === undefined) { sealed = at < STARTS ? Math.max(sealed, -1) : Math.max(sealed, serverTick(at) - 1); return { headSeq: 0, sealedThroughTick: sealed, events: [] }; }
      return { headSeq: through, through, sealedThroughTick, events: [] };
    }),
    sendInputs: () => request(() => ({ headSeq: 0, accepted: [] })),
    checkpoint: ({ checkpoint: body }) => request(() => ({ accepted: true, throughTick: body.throughTick, inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits })),
    finishWave: body => request(at => ({ ok: true, data: { survived: body.survived, loot: 10, recovery: { waveId: body.waveId,
      islandEpoch: body.checkpoint.islandEpoch, closedAt: new Date(at).toISOString(), closedHp: body.checkpoint.hpUnits,
      checkpointUid: body.checkpoint.checkpointUid, throughTick: body.checkpoint.throughTick, inputHeadSeq: body.checkpoint.inputHeadSeq,
      lastRepairSeq: body.checkpoint.lastRepairSeq, basisRepairSeq: body.checkpoint.basisRepairSeq } } })),
  };
  const noop = () => {};
  const controller = createWaveController({ bus, now: () => now, recoveryTransport: transport, world: { container: {} }, getDefenses: () => defenses,
    holdBreak: () => (paused ? { paused: true, line: 'Paused', label: 'Resume', canToggle: true } : null),
    createRenderer: () => null, startNextWave: () => new Promise(() => {}), loadAuto: () => false, saveAuto: noop, breakSeconds: 600,
    createHud: () => new Proxy({ banner(title, line = '') { hud.banner = title ? `${title} · ${line}` : null; if (title) seen.push(hud.banner); }, pause(info) { hud.card = info; } },
      { get: (target, key) => (key === 'then' ? undefined : target[key] ?? noop) }), // not a thenable: the controller awaits the HUD
    setTimer: (run, ms) => { const timer = { at: now + ms, run }; timers.push(timer); return timer; },
    clearTimer: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); } });
  const snap = snapshot();
  bus.emit({ type: 'wave_started_server', waveId: snap.waveId, wave: 2, seed: snap.seed, startsAt: snap.startsAt, weather: snap.weather,
    rules: snap.rules, recoveryVersion: 1, waveProtocol: 2, initialSnapshot: snap, participantToken: TOKEN, lastActorCounter: 0 });
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  let breakAt = null;
  while (now < STARTS + 240_000 && (breakAt === null || now < breakAt + 20_000)) {
    now += FRAME_MS;
    for (let again = true; again;) {
      again = false; queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= now) { queue.shift().run(); again = true; }
      for (const timer of timers.filter(item => item.at <= now)) { timers.splice(timers.indexOf(timer), 1); timer.run(); again = true; }
      await settle();
    }
    controller.update(FRAME_MS / 1000); await settle();
    if (breakAt === null && controller.inBreak) breakAt = now;
  }
  const result = { inBreak: controller.inBreak, answered: controller.wave?.recoveryFinishAnswered === true, survived: controller.wave?.result?.survived,
    banner: hud.banner, card: hud.card, seen };
  controller.dispose();
  return result;
}

describe('"Confirming the result…" after a won recovery wave', () => {
  it.each([[false, 'a running break'], [true, 'a paused break']])('is gone once the server answered and the break card is up (%s: %s)', async paused => {
    const result = await playToTheBreak({ paused });
    expect(result).toMatchObject({ inBreak: true, answered: true, survived: true });
    expect(result.seen).toContain('Wave over · Confirming the result…'); // it was shown while waiting
    expect(result.banner).toBeNull();                                     // and left with the answer
    expect(result.card).toMatchObject({ title: 'Wave 2 won!', paused });
  }, 120000);
});
