// The recovery API client validates the server view and preserves retry-safe repair quotes.
import {describe, expect, it} from 'vitest';
import {createIslandApi, isJoinableWave, isStructureRecovery, isWave, PATHS} from '../../src/island/api.js';
import {createWaveFlow} from '../../src/island/wave-flow.js';
import {WAVE_STARTED} from '../../src/island/wave-hooks.js';

const waveId = '12345678-1234-4234-8234-123456789abc';
const epoch = '22345678-1234-4234-8234-123456789abc';
const instanceId = '32345678-1234-4234-8234-123456789abc';
const state = (overrides = {}) => ({serverNow: '2026-11-17T12:00:00Z', islandEpoch: epoch, revision: 4,
  recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
  remainingPaidUses: null, structures: [{spot: 'wall_1', instanceId, kind: 'wall', level: 1, hpUnits: 750_000,
    maxHP: 60, rateUnitsPerSecond: 1_666.67, estimatedFreeSeconds: 150, fixedPrice: 10, repairSeq: 0}], ...overrides});
const quote = {spot: 'wall_1', instanceId, expectedEpoch: epoch, expectedWindow: 'between_waves', expectedLevel: 1,
  expectedRepairSeq: 0, quotedPrice: 10, waveProtocol: 2};
const token = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const snapshot = waveId => ({recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId, islandEpoch: epoch, seed: 42,
  startsAt: '2026-11-17T12:00:03Z', weather: {kind: 'clear'}, rules: ['structure_recovery'],
  createWave: {defenses: [{id: 'wall_1', kind: 'wall', x: 0, z: 0}]},
  structures: [{spot: 'wall_1', instanceId, kind: 'wall', level: 1, x: 0, z: 0, hpUnits: 750_000, maxHP: 60, repairSeq: 0}],
  participants: [{participantToken: token, captain: {level: 1, skills: [], weapon: 'musket'}}]});
const recoveryWave = waveId => ({waveId, wave: 1, seed: 42, startsAt: '2026-11-17T12:00:03Z', weather: {kind: 'clear'},
  flagship: false, recoveryVersion: 1, waveProtocol: 2, initialSnapshot: snapshot(waveId), participantToken: token,
  lastActorCounter: 0});

describe('structure recovery API', () => {
  it('delegates shared repair aliases and preserves the original common receipt', async () => {
    const actor = '42345678-1234-4234-8234-123456789abc', owner = '52345678-1234-4234-8234-123456789abc';
    const accountId = '62345678-1234-4234-8234-123456789abc', operation = '72345678-1234-4234-8234-123456789abc';
    const economy = {mode: 'island_shared', version: 1, islandOwner: owner, accountId, runEpoch: token,
      revision: '1', treasury: {balanceCoins: '100', committedCoins: '0', availableCoins: '100'}};
    const fresh = {...economy, revision: '2', treasury: {balanceCoins: '90', committedCoins: '0', availableCoins: '90'}};
    const currentState = state({displayPhase: 'preparing', repairWindow: 'reserved_wave', waveId, remainingPaidUses: 2,
      structures: [{...state().structures[0], spot: 'tower_s1', kind: 'cannon'}]});
    const sent = [], values = new Map();
    const pendingStore = {getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
    const api = createIslandApi({getEconomy: () => economy, getActorId: () => actor, pendingStore,
      makeUid: () => 'shared-repair-01', transport: {
        get: async () => ({ok: true, data: {...currentState, economy}}),
        post: async (path, body, options) => {
          sent.push({path, body, options});
          return {ok: true, data: {repeat: false, economy: fresh, currentState,
            receipt: {receiptId: operation, actionUid: body.actionUid, action: 'structure_repair', actorId: actor,
              origin: {mode: 'island_shared', version: 1, islandOwner: owner, accountId, runEpoch: token},
              result: {spot: body.spot, instanceId, recoveryEpoch: epoch, kind: 'cannon', level: 1,
                chargedPrice: '10', waveId, useOrdinal: 1, eventSeq: 1, repairSeq: 1,
                financialReceipt: {id: owner, actorId: actor, accountId, runEpoch: token,
                  actionUid: `fx_${operation.replaceAll('-', '')}_repair`, reference: `repair:${operation}`,
                  kind: 'spend', reason: 'structure_repair', balanceDelta: '-10', committedDelta: '0',
                  balanceAtCommit: '90', committedAtCommit: '0', revisionAtCommit: '2', sourceReservationId: null}}}}};
        },
      }});
    expect((await api.structureRecovery()).data.structures[0].spot).toBe('cannon_1');
    const answer = await api.repairStructure({quote: {...quote, spot: 'cannon_1', expectedWindow: 'reserved_wave', expectedWaveId: waveId}, code: 'ISLE-FR3ND'});
    expect(answer.ok).toBe(true);
    expect(sent[0].body).toMatchObject({spot: 'tower_s1', economy: {mode: 'island_shared', version: 1, islandOwner: owner, runEpoch: token}});
    expect(sent[0].body).not.toHaveProperty('code');
    expect(sent[0].options.headers['X-Island-Economy-Version']).toBe('1');
    expect(answer.data.currentState.structures[0].spot).toBe('cannon_1');
    expect(answer.data.receipt.result.spot).toBe('tower_s1');
    expect(answer.data).not.toHaveProperty('coins');
  });

  it('refuses repair before a private POST when a supplied context is unknown', async () => {
    const sent = [];
    const api = createIslandApi({getEconomy: () => null, transport: {
      get: async () => ({ok: true, data: state()}),
      post: async (...args) => {sent.push(args); return {ok: false, status: 503};},
    }});
    expect((await api.repairStructure({quote})).code).toBe('economy_context_required');
    expect(sent).toEqual([]);
  });

  it('retains the personal repair protocol for an explicitly legacy context', async () => {
    const sent = [];
    const api = createIslandApi({getEconomy: () => ({mode: 'personal_legacy', version: 0}), transport: {
      get: async () => ({ok: true, data: state()}),
      post: async (path, body) => {sent.push({path, body}); return {ok: false, status: 503};},
    }});
    await api.repairStructure({quote});
    expect(sent[0].body.expectedWindow).toBe('between_waves');
    expect(sent[0].body).not.toHaveProperty('economy');
  });

  it('rejects a legacy recovery reply after the selected mode changes during the read', async () => {
    let selected = {mode: 'personal_legacy', version: 0}, release;
    const held = new Promise(resolve => {release = resolve;});
    const api = createIslandApi({getEconomy: () => selected, transport: {
      get: () => held, post: async () => null,
    }});
    const reading = api.structureRecovery();
    selected = {mode: 'island_shared', version: 1};
    release({ok: true, data: state()});
    expect(await reading).toMatchObject({ok: false, code: 'economy_context_required'});
  });

  it('rejects a discovery reply after the authenticated actor changes during the read', async () => {
    let actor = 'captain-a', release;
    const held = new Promise(resolve => {release = resolve;});
    const api = createIslandApi({getEconomy: () => ({mode: 'personal_legacy', version: 0}), getActorId: () => actor,
      transport: {get: () => held, post: async () => null}});
    const reading = api.structureRecovery(); actor = 'captain-b';
    release({ok: true, data: state()});
    expect(await reading).toMatchObject({ok: false, code: 'economy_context_required'});
  });
  it('requests protocol two from the persisted policy and preserves the entire recovery wave DTO', async () => {
    const sent = [];
    const waveId = '62345678-1234-4234-8234-123456789abc';
    const data = recoveryWave(waveId);
    const api = createIslandApi({waveProtocol: () => 2, makeUid: () => 'wave-action-1', transport: {
      get: async path => { sent.push({method: 'get', path}); return {ok: true, data}; },
      post: async (path, body) => { sent.push({method: 'post', path, body}); return {ok: true, data}; },
    }});
    expect(isWave(data)).toBe(true);
    expect((await api.startWave({where: 'own'})).data).toEqual(data);
    expect(sent[0]).toMatchObject({method: 'post', path: PATHS.start,
      body: {where: 'own', actionUid: 'wave-action-1', waveProtocol: 2}});
    expect((await api.joinWave({waveId})).data.initialSnapshot).toEqual(data.initialSnapshot);
    expect(sent[1]).toEqual({method: 'post', path: PATHS.join, body: {waveId, waveProtocol: 2}});
    expect((await api.currentWave({where: 'own'})).data.participantToken).toBe(token);
    expect(sent[2].path).toBe('/api/waves/current?where=own&waveProtocol=2');
    expect(isWave({...data, participantToken: 'profile-id'})).toBe(false);
    expect(isWave({...data, initialSnapshot: {...data.initialSnapshot, configVersion: 9}})).toBe(false);
  });

  it('lets a second player find a teammate\'s recovery wave without a token and join it for their own', async () => {
    const waveId = '82345678-1234-4234-8234-123456789abc';
    const mine = '8165d60f-14f5-4b9e-96a0-2ed457b4c219';
    const full = recoveryWave(waveId);
    const {initialSnapshot: _snapshot, participantToken: _token, lastActorCounter: _counter, ...open} = full;
    const joinable = {...open, recoveryVersion: 1, waveProtocol: 2};
    const joinedReply = {...full, initialSnapshot: {...full.initialSnapshot, participants: [
      ...full.initialSnapshot.participants, {participantToken: mine, captain: {level: 1, skills: [], weapon: 'musket'}}]},
    participantToken: mine, lastActorCounter: 0};
    expect(isWave(joinable)).toBe(false);
    expect(isJoinableWave(joinable)).toBe(true);
    expect(isJoinableWave({...joinable, participantToken: token})).toBe(false);
    expect(isJoinableWave({...joinable, recoveryVersion: 0, waveProtocol: 1})).toBe(false);
    const sent = [];
    const api = createIslandApi({waveProtocol: where => (where === 'pirate_point' ? 1 : 2), transport: {
      get: async path => { sent.push({method: 'get', path}); return {ok: true, data: joinable}; },
      post: async (path, body) => { sent.push({method: 'post', path, body}); return {ok: true, data: joinedReply}; },
    }});
    const events = [];
    const flow = createWaveFlow({api, emit: event => events.push(event), setTimer: () => 0, clearTimer: () => {}});
    const looked = await flow.look('ISLE-FR3ND');
    expect(looked.ok).toBe(true);
    expect(flow.current).toMatchObject({joined: false, wave: {waveId}});
    expect(events).toEqual([]);
    const joined = await flow.join('ISLE-FR3ND');
    expect(joined.ok).toBe(true);
    expect(sent).toEqual([{method: 'get', path: '/api/waves/current?where=ISLE-FR3ND&waveProtocol=2'},
      {method: 'post', path: PATHS.join, body: {waveId, waveProtocol: 2}}]);
    expect(flow.current.joined).toBe(true);
    expect(events.find(event => event.type === WAVE_STARTED)).toMatchObject({waveId, recoveryVersion: 1, waveProtocol: 2,
      participantToken: mine, lastActorCounter: 0, initialSnapshot: joinedReply.initialSnapshot});
    flow.dispose();
  });

  it('advertises protocol two for first-wave admission while accepting a frozen legacy reply', async () => {
    const legacy = {waveId: '72345678-1234-4234-8234-123456789abc', wave: 1, seed: 42,
      startsAt: '2026-11-17T12:00:03Z', weather: {kind: 'clear'}, flagship: false, recoveryVersion: 0, waveProtocol: 1};
    let sent;
    const api = createIslandApi({waveProtocol: () => 2, makeUid: () => 'new-island-wave', transport: {
      get: async () => ({ok: true, data: null}),
      post: async (path, body) => { sent = {path, body}; return {ok: true, status: 200, data: legacy}; },
    }});
    expect(isWave(legacy)).toBe(true);
    expect((await api.startWave({where: 'own'})).data).toEqual(legacy);
    expect(sent).toEqual({path: PATHS.start, body: {where: 'own', actionUid: 'new-island-wave', waveProtocol: 2}});
  });

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
