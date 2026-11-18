import { describe, expect, it, vi } from 'vitest';
import { commandForJournal, createRecoveryTransport, simulationInputFromJournal } from '../../src/pirates/recovery-transport.js';

const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';

describe('recovery-v1 command transport', () => {
  it('sends only player intent and rejects Captain E repair/rebuild', () => {
    expect(commandForJournal({ type: 'captain_shot', by: 'profile-id', targetId: 'ship_1', x: 2, z: 3,
      level: 5, skills: ['retired_repair_skill'], weapon: 'blunderbuss' })).toEqual({ type: 'captain_shot', targetId: 'ship_1', x: 2, z: 3 });
    expect(commandForJournal({ type: 'repair', wallId: 'wall_1', skills: ['quick_fix'] })).toBeNull();
    expect(commandForJournal({ type: 'rebuild', wallId: 'wall_1' })).toBeNull();
  });

  it('restores accepted Captain metadata from the journal and identifies actors by stable token', () => {
    const event = { serverSeq: 4, effectiveTick: 10, type: 'captain_shot', participantToken: TOKEN,
      payload: { command: { type: 'captain_shot', targetId: 'ship_1', x: 2, z: 3 },
        captain: { level: 3, skills: ['steady_aim'], weapon: 'musket' } } };
    expect(simulationInputFromJournal(event)).toEqual({ type: 'captain_shot', targetId: 'ship_1', x: 2, z: 3,
      by: TOKEN, level: 3, skills: ['steady_aim'], weapon: 'musket' });
    expect(simulationInputFromJournal({ ...event, participantToken: undefined })).toBeNull();
    expect(simulationInputFromJournal({ ...event, participantToken: 'profile-uuid' })).toBeNull();
    expect(simulationInputFromJournal({ ...event, type: 'captain_input', payload: { ...event.payload,
      participantToken: TOKEN, inputUid: 'accepted-uid-1', actorCounter: 7 } })).toEqual({ type: 'captain_shot', targetId: 'ship_1', x: 2, z: 3,
      by: TOKEN, level: 3, skills: ['steady_aim'], weapon: 'musket' });
    expect(simulationInputFromJournal({ ...event, type: 'captain_input', payload: { ...event.payload,
      participantToken: 'a7856e02-de9f-4e2d-b3cc-abc856524dac', inputUid: 'accepted-uid-1', actorCounter: 7 } })).toBeNull();
    expect(simulationInputFromJournal({ ...event, type: 'captain_input', payload: { ...event.payload,
      inputUid: 'accepted-uid-1', actorCounter: 7 } })).toBeNull();
    expect(simulationInputFromJournal({ serverSeq: 5, effectiveTick: 10, type: 'participant_joined', participantToken: TOKEN,
      payload: { captain: { level: 3, skills: [], weapon: 'musket' } } })).toBeNull();
  });

  it('accepts server-paid repair events without a Captain token, but only as a special journal input', () => {
    const event = { serverSeq: 2, effectiveTick: 0, type: 'structure_repaired', participantToken: null,
      payload: { spot: 'cannon_8', instanceId: 'instance-1', hpUnits: 1_000_000, maxHP: 80, repairSeq: 2, chargedPrice: 100 } };
    expect(simulationInputFromJournal(event)).toEqual({ type: 'structure_repaired', event });
  });

  it('uses the injected authenticated get/post transport for journal endpoints', async () => {
    const get = vi.fn(async path => ({ ok: true, data: { headSeq: 0, sealedThroughTick: 0, events: [] } }));
    const post = vi.fn(async (path, body) => ({ ok: true, data: body }));
    const transport = createRecoveryTransport({ get, post });
    expect(await transport.readEvents({ waveId: 'wave/a', after: 4, through: 8, sealedThroughTick: 6 })).toEqual({ headSeq: 0, sealedThroughTick: 0, events: [] });
    expect(await transport.sendInputs({ waveId: 'wave/a', inputs: [{ inputUid: 'uid-1', actorCounter: 1, tick: 8,
      command: { type: 'captain_move', x: 1, z: 2 } }] })).toMatchObject({ waveProtocol: 2 });
    expect(get).toHaveBeenCalledWith('/api/waves/wave%2Fa/events?after=4&through=8&sealedThroughTick=6');
    expect(post).toHaveBeenCalledWith('/api/waves/wave%2Fa/inputs', { waveProtocol: 2, inputs: [expect.objectContaining({ actorCounter: 1 })] });
  });

  it('requires both fixed-page watermarks while allowing the preparation seal -1', async () => {
    const get = vi.fn(async () => ({ headSeq: 0, sealedThroughTick: -1, events: [] }));
    const transport = createRecoveryTransport({ get, post: vi.fn() });
    expect(await transport.readEvents({ waveId: 'wave-a', after: 0, through: 2 })).toBeNull();
    expect(await transport.readEvents({ waveId: 'wave-a', after: 0, sealedThroughTick: -1 })).toBeNull();
    expect(await transport.readEvents({ waveId: 'wave-a', after: 0, through: 2, sealedThroughTick: -1 }))
      .toMatchObject({ sealedThroughTick: -1 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/waves/wave-a/events?after=0&through=2&sealedThroughTick=-1');
  });

  it('treats failed authenticated responses as uncertain outcomes (refusals for the refusal policy)', async () => {
    const transport = createRecoveryTransport({ get: vi.fn(async () => ({ ok: false })), post: vi.fn(async () => { throw new Error('offline'); }) });
    expect(await transport.readEvents({ waveId: 'wave-a' })).toEqual({ refused: true, status: 0, code: 'network_error', retryAfterSeconds: null });
    expect(await transport.sendInputs({ waveId: 'wave-a', inputs: [{ inputUid: 'uid-1', actorCounter: 1, tick: 0,
      command: { type: 'captain_move', x: 1, z: 2 } }] })).toEqual({ refused: true, status: 0, code: 'network_error', retryAfterSeconds: null });
  });

  it('posts a complete v2 terminal checkpoint through the injected authenticated client', async () => {
    const post = vi.fn(async () => ({ ok: true, data: { loot: 5, recovery: { waveId: 'wave-a' } } }));
    const transport = createRecoveryTransport({ get: vi.fn(), post });
    const body = { waveId: 'wave-a', survived: true, shipsSunk: 3, waveProtocol: 2,
      checkpoint: { islandEpoch: 'epoch-a', checkpointUid: 'checkpointuid1234', throughTick: 20, inputHeadSeq: 4,
        lastRepairSeq: 1, basisRepairSeq: { 'instance-a': 2 }, hpUnits: { 'instance-a': 900_000 } } };
    expect(await transport.finishWave(body)).toMatchObject({ ok: true });
    expect(post).toHaveBeenCalledWith('/api/waves/finish', body);
    expect(await transport.finishWave({ ...body, checkpoint: { ...body.checkpoint, hpUnits: {} } })).toBeNull();
    const direct = createRecoveryTransport({ get: vi.fn(async () => ({ headSeq: 0, sealedThroughTick: -1, events: [] })),
      post: vi.fn(async () => ({ loot: 5, recovery: { waveId: 'wave-a' } })) });
    expect(await direct.readEvents({ waveId: 'wave-a' })).toMatchObject({ sealedThroughTick: -1 });
    expect(await direct.finishWave(body)).toMatchObject({ ok: true, data: { loot: 5 } });
    expect(await transport.finishWave({ ...body, checkpoint: { ...body.checkpoint, basisRepairSeq: {}, hpUnits: {} } })).toMatchObject({ ok: true });
  });

  it('posts the accepted complete health vector to the active wave checkpoint endpoint', async () => {
    const checkpoint = { islandEpoch: 'epoch-a', checkpointUid: 'checkpointuid1234', throughTick: 8, inputHeadSeq: 3,
      lastRepairSeq: 1, basisRepairSeq: { 'instance-a': 1 }, hpUnits: { 'instance-a': 450_000 } };
    const post = vi.fn(async () => ({ accepted: true, repeated: false, throughTick: 8, inputHeadSeq: 3,
      lastRepairSeq: 1, hpUnits: { 'instance-a': 450_000 } }));
    const transport = createRecoveryTransport({ get: vi.fn(), post });
    expect(await transport.checkpoint({ waveId: 'wave-a', checkpoint })).toMatchObject({ accepted: true, hpUnits: checkpoint.hpUnits });
    expect(post).toHaveBeenCalledWith('/api/waves/wave-a/health', { waveProtocol: 2, ...checkpoint });
    expect(await transport.checkpoint({ waveId: 'wave-a', checkpoint: { ...checkpoint, hpUnits: {} } })).toBeNull();
  });

  it('rejects overlarge batches before making an HTTP request', async () => {
    const post = vi.fn();
    const transport = createRecoveryTransport({ get: vi.fn(), post });
    const inputs = Array.from({ length: 33 }, (_, i) => ({ inputUid: `uid-${i}`, actorCounter: i + 1, tick: i,
      command: { type: 'captain_move', x: 1, z: 2 } }));
    expect(await transport.sendInputs({ waveId: 'wave-a', inputs })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
