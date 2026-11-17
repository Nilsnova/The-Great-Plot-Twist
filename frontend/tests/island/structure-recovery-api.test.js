// The recovery API client validates the server view and preserves retry-safe repair quotes.
import {describe, expect, it} from 'vitest';
import {createIslandApi, isStructureRecovery, PATHS} from '../../src/island/api.js';

const waveId = '12345678-1234-4234-8234-123456789abc';
const epoch = '22345678-1234-4234-8234-123456789abc';
const instanceId = '32345678-1234-4234-8234-123456789abc';
const state = (overrides = {}) => ({serverNow: '2026-11-17T12:00:00Z', islandEpoch: epoch, revision: 4,
  recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
  remainingPaidUses: null, structures: [{spot: 'wall_1', instanceId, kind: 'wall', level: 1, hpUnits: 750_000,
    maxHP: 60, rateUnitsPerSecond: 1_666.67, estimatedFreeSeconds: 150, fixedPrice: 10, repairSeq: 0}], ...overrides});
const quote = {spot: 'wall_1', instanceId, expectedEpoch: epoch, expectedWindow: 'between_waves', expectedLevel: 1,
  expectedRepairSeq: 0, quotedPrice: 10, waveProtocol: 2};

describe('structure recovery API', () => {
  it('accepts only the canonical versioned state and requests it for the selected island', async () => {
    expect(isStructureRecovery(state())).toBe(true);
    expect(isStructureRecovery(state({structures: [{...state().structures[0], hpUnits: 1.5}]}))).toBe(false);
    let path;
    const api = createIslandApi({transport: {get: async value => { path = value; return {ok: true, data: state()}; }, post: async () => null}});
    const answer = await api.structureRecovery({code: 'ISLE-FR3ND'});
    expect(path).toBe(PATHS.structures('ISLE-FR3ND'));
    expect(answer.data.structures[0].spot).toBe('wall_1');
  });

  it('submits the quoted fields and retries an unknown result with the same action UID', async () => {
    let count = 0;
    const sent = [];
    const receipt = {actionUid: 'action00001', spot: 'wall_1', instanceId, kind: 'wall', level: 1,
      chargedPrice: 10, balanceAtCommit: 90, waveId: null, useOrdinal: null, eventSeq: null, repairSeq: 1};
    const api = createIslandApi({makeUid: () => 'action00001', transport: {
      get: async () => ({ok: true, data: state()}),
      post: async (path, body) => { sent.push({path, body}); count++; return count === 1
        ? {ok: false, status: 503, code: 'database_unavailable', message: 'Try again.'}
        : {ok: true, status: 200, data: {receipt, currentState: state({revision: 5, structures: [{...state().structures[0], hpUnits: 1_000_000, repairSeq: 1}]}), coins: 90}}; },
    }});
    const first = await api.repairStructure({quote});
    expect(first.ok).toBe(false);
    const second = await api.repairStructure({quote});
    expect(second.ok).toBe(true);
    expect(sent.map(item => item.path)).toEqual([PATHS.structureRepair, PATHS.structureRepair]);
    expect(sent[0].body).toEqual({...quote, actionUid: 'action00001'});
    expect(sent[1].body.actionUid).toBe(sent[0].body.actionUid);
    expect(second.data.currentState.structures[0].hpUnits).toBe(1_000_000);
  });

  it('keeps a stale quote response current state and wallet separately from the refusal', async () => {
    const fresh = state({revision: 5});
    const api = createIslandApi({transport: {get: async () => ({ok: true, data: state()}), post: async () => ({ok: false,
      status: 409, data: {error: {code: 'stale_recovery_quote', message: 'Refresh.'}, currentState: fresh, coins: 87}})}});
    const answer = await api.repairStructure({quote});
    expect(answer).toMatchObject({ok: false, code: 'stale_recovery_quote', currentState: fresh, coins: 87});
  });

  it('remembers the server spot alias from the canonical recovery view for the repair request', async () => {
    const serverState = state({structures: [{...state().structures[0], spot: 'tower_s1', kind: 'cannon'}]});
    const posted = [];
    const api = createIslandApi({makeUid: () => 'action00002', transport: {
      get: async () => ({ok: true, data: serverState}),
      post: async (path, body) => { posted.push(body); return {ok: false, status: 409, code: 'stale_recovery_quote', message: 'Refresh.'}; },
    }});
    const read = await api.structureRecovery();
    expect(read.data.structures[0].spot).toBe('cannon_1');
    await api.repairStructure({quote: {...quote, spot: 'cannon_1'}});
    expect(posted[0].spot).toBe('tower_s1');
  });
});
