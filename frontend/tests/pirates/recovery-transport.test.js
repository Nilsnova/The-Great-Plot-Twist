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
    expect(await transport.readEvents({ waveId: 'wave/a', after: 4, through: 8 })).toEqual({ headSeq: 0, sealedThroughTick: 0, events: [] });
    expect(await transport.sendInputs({ waveId: 'wave/a', inputs: [{ inputUid: 'uid-1', actorCounter: 1, tick: 8,
      command: { type: 'captain_move', x: 1, z: 2 } }] })).toMatchObject({ waveProtocol: 2 });
    expect(get).toHaveBeenCalledWith('/api/waves/wave%2Fa/events?after=4&through=8');
    expect(post).toHaveBeenCalledWith('/api/waves/wave%2Fa/inputs', { waveProtocol: 2, inputs: [expect.objectContaining({ actorCounter: 1 })] });
  });

  it('treats failed authenticated responses as uncertain outcomes', async () => {
    const transport = createRecoveryTransport({ get: vi.fn(async () => ({ ok: false })), post: vi.fn(async () => { throw new Error('offline'); }) });
    expect(await transport.readEvents({ waveId: 'wave-a' })).toBeNull();
    expect(await transport.sendInputs({ waveId: 'wave-a', inputs: [{ inputUid: 'uid-1', actorCounter: 1, tick: 0,
      command: { type: 'captain_move', x: 1, z: 2 } }] })).toBeNull();
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
