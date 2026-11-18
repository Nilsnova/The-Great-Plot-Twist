// Paid revival regressions for issue #466. Used by the recovery API and deterministic replay.
import { describe, expect, it, vi } from 'vitest';
import { createIslandApi } from '../../src/island/api.js';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { simulationInputFromJournal } from '../../src/pirates/recovery-transport.js';
import { createWaveController } from '../../src/pirates/controller.js';

const HELPER = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const TARGET = '2b8c0f0e-5a71-4c2e-9d55-0f6b2b7e9a10';
const position = (by, x, z) => ({ type: 'captain_move', by, x, z });
const hero = wave => (typeof wave.state === 'function' ? wave.state() : wave.state)?.party.find(item => item.id === TARGET);

function fallenWave() {
  const wave = createWave({ seed: 4, wave: 1, lanes: [{ id: 'east', bearing: 0 }], island: { hp: 10000 } });
  wave.step(CONFIG.tick, [position(TARGET, 40, 0), position(HELPER, -18, -10)]);
  for (let tick = 0; tick < 6000 && !wave.done && !hero(wave).down; tick++) {
    const boarder = wave.state().boarders[0] ?? { x: 40, z: 0 };
    wave.step(CONFIG.tick, [position(TARGET, boarder.x, boarder.z), position(HELPER, -18, -10)]);
  }
  expect(hero(wave).down).toBe(true);
  return wave;
}

function paidEvent(wave, downAt = Math.round(hero(wave).downAt / CONFIG.tick)) {
  return { serverSeq: 1, effectiveTick: 1000, type: 'captain_revive', participantToken: HELPER,
    payload: { reviveRef: 'revive:paidrevive01', captain: { level: 1, skills: ['medic'], weapon: 'musket' },
      command: { type: 'captain_revive', targetId: TARGET, downAt, x: hero(wave).x + 1, z: hero(wave).z } } };
}

function recoveryController() {
  const start = Date.UTC(2026, 10, 18, 12), journal = [];
  let now = start, hold;
  const seal = () => Math.max(-1, Math.floor((now - start - 1000) / 50) - 1);
  const append = (type, participantToken, command, metadata = {}) => {
    const event = { serverSeq: journal.length + 1, effectiveTick: seal() + 2, type, participantToken,
      payload: { command, ...metadata } };
    journal.push(event); return event;
  };
  const captain = { level: 1, skills: [], weapon: 'musket' };
  const transport = {
    readEvents: vi.fn(async ({ after = 0 }) => ({ headSeq: journal.length, sealedThroughTick: seal(), events: journal.slice(after) })),
    sendInputs: vi.fn(async ({ inputs }) => ({ accepted: inputs.map(item => append('captain_input', HELPER, item.command,
      { inputUid: item.inputUid, actorCounter: item.actorCounter, participantToken: HELPER, captain })) })),
    checkpoint: vi.fn(async ({ checkpoint: body }) => ({ accepted: true, ...body })), finishWave: vi.fn(async () => null),
  };
  const reviveCaptain = vi.fn(async body => {
    append('captain_revive', HELPER, { type: 'captain_revive', targetId: body.fallen, downAt: body.downAt, x: body.x, z: body.z }, { captain });
    return { price: 25, coins: 75, repeat: false, journaled: true };
  });
  const player = { x: -18, z: -10 }, hud = new Proxy({}, { get: (_, key) => key === 'then' ? undefined : () => {} });
  const controller = createWaveController({ now: () => now, world: { scene: {}, container: {}, player: { position: player } },
    bus: { on: () => () => {}, emit() {} }, recoveryTransport: transport, recoveryPlayoutMs: 0, reviveCaptain,
    createRenderer: () => null, createHud: options => { hold = options.onPromptHold; return hud; },
    setTimer: () => ({}), clearTimer() {}, getDefenses: () => [] });
  const initialSnapshot = { recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-paid', islandEpoch: 'epoch-paid', seed: 4,
    startsAt: new Date(start + 1000).toISOString(), weather: { kind: 'calm', ships: 1, fog: 0 }, rules: ['structure_recovery'],
    participants: [HELPER, TARGET].map(participantToken => ({ participantToken, captain })), structures: [],
    createWave: { seed: 4, wave: 1, lanes: [{ id: 'east', bearing: 0 }], island: { hp: 10000 }, defenses: [] } };
  controller.start({ waveId: 'wave-paid', wave: 1, seed: 4, startsAt: initialSnapshot.startsAt, weather: initialSnapshot.weather,
    rules: initialSnapshot.rules, recoveryVersion: 1, waveProtocol: 2, initialSnapshot, participantToken: HELPER, lastActorCounter: 0 });
  const advance = async () => { now += 50; controller.update(.05); for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return { controller, transport, reviveCaptain, player, advance, hold: value => hold(value),
    moveTarget: at => append('captain_move', TARGET, { type: 'captain_move', x: at.x, z: at.z }) };
}

describe('durable paid revival', () => {
  it('sends captured helper coordinates and requires durable confirmation from the server', async () => {
    const post = vi.fn(async () => ({ ok: true, data: { price: 25, coins: 75, repeat: false, journaled: true } }));
    const api = createIslandApi({ transport: { get: vi.fn(), post }, makeUid: () => 'paidrevive01' });
    const body = { waveId: 'wave-paid', fallen: TARGET, downAt: 10, waveProtocol: 2, x: 1, z: 2 };
    expect((await api.reviveCaptain(body)).ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/api/waves/revive', { ...body, actionUid: 'paidrevive01' });
    post.mockResolvedValue({ ok: true, data: { price: 25, coins: 75, repeat: false } });
    expect((await api.reviveCaptain(body)).ok).toBe(false);
  });

  it('replays the paid effect in a newly created simulation after the payer disappeared', () => {
    const beforeReload = fallenWave();
    const event = paidEvent(beforeReload);
    const afterReload = fallenWave();
    const input = simulationInputFromJournal(event);
    expect(input).toMatchObject({ by: HELPER, downAt: event.payload.command.downAt, skills: ['medic'] });
    expect(afterReload.step(CONFIG.tick, [input])).toContainEqual(expect.objectContaining({
      type: 'captain_revived', captainId: TARGET, by: HELPER,
    }));
    expect(hero(afterReload)).toMatchObject({ down: false, hp: Math.round(CONFIG.health.hp * .75) });
    expect(afterReload.step(CONFIG.tick, [input]).some(item => item.type === 'captain_revived')).toBe(false);
  });

  it('does not apply an old paid revival to a different fall', () => {
    const wave = fallenWave();
    const staleEvent = paidEvent(wave, Math.round(hero(wave).downAt / CONFIG.tick) - 1);
    const input = simulationInputFromJournal(staleEvent);
    expect(wave.step(CONFIG.tick, [input]).some(item => item.type === 'captain_revived')).toBe(false);
    expect(hero(wave).down).toBe(true);
  });

  it('lets the paid journal revive a teammate without appending a second client input', async () => {
    const h = recoveryController();
    for (let tick = 0; tick < 6000 && !hero(h.controller)?.down; tick++) {
      if (tick % 10 === 0) h.moveTarget(h.controller.state.boarders[0] ?? { x: 40, z: 0 });
      await h.advance();
    }
    const fallen = hero(h.controller);
    expect(fallen.down).toBe(true);
    h.player.x = fallen.x + 1; h.player.z = fallen.z;
    h.hold(true);
    for (let tick = 0; tick < 100 && !h.reviveCaptain.mock.calls.length; tick++) await h.advance();
    expect(h.reviveCaptain).toHaveBeenCalledOnce();
    expect(h.reviveCaptain).toHaveBeenCalledWith(expect.objectContaining({
      waveProtocol: 2, fallen: TARGET, downAt: Math.round(fallen.downAt / CONFIG.tick), x: h.player.x, z: h.player.z,
    }));
    for (let tick = 0; tick < 100 && hero(h.controller).down; tick++) await h.advance();
    expect(hero(h.controller).down).toBe(false);
    expect(h.transport.sendInputs.mock.calls.flatMap(([body]) => body.inputs)
      .some(item => item.command.type === 'captain_revive')).toBe(false);
    h.controller.dispose();
  });
});
