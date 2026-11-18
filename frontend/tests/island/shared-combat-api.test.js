// Shared repair HTTP preserves the original durable intent and never imports island funds into private coins.
import {describe, expect, it} from 'vitest';
import {createSharedCombatApi} from '../../src/island/shared-combat-api.js';

const uuid = digit => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const actor = uuid('1'), owner = uuid('2'), account = uuid('3'), epoch = uuid('4');
const recoveryEpoch = uuid('5'), instance = uuid('6'), wave = uuid('7'), operation = uuid('8');
const economy = (change = {}) => ({mode: 'island_shared', version: 1, islandOwner: owner,
  accountId: account, runEpoch: epoch, revision: '2',
  treasury: {balanceCoins: '90', committedCoins: '0', availableCoins: '90'}, ...change});
const quote = (change = {}) => ({spot: 'wall_1', instanceId: instance, expectedEpoch: recoveryEpoch,
  expectedWindow: 'reserved_wave', expectedWaveId: wave, expectedLevel: 1, expectedRepairSeq: 0,
  quotedPrice: 10, waveProtocol: 2, ...change});
const state = () => ({serverNow: '2026-11-18T12:00:00Z', islandEpoch: recoveryEpoch, revision: 2,
  recoveryVersion: 1, waveProtocol: 2, displayPhase: 'preparing', repairWindow: 'reserved_wave',
  waveId: wave, remainingPaidUses: 2, structures: []});
function success(body, {repeat = false, fresh = true} = {}) {
  return {ok: true, status: 200, data: {repeat, receipt: {
    receiptId: operation, actionUid: body.actionUid, action: 'structure_repair', actorId: actor,
    origin: {mode: 'island_shared', version: 1, islandOwner: owner, accountId: account, runEpoch: epoch},
    result: {recoveryEpoch, spot: body.spot, instanceId: instance, kind: 'wall', level: 1,
      chargedPrice: '10', waveId: wave, useOrdinal: 1, eventSeq: 1, repairSeq: 1,
      financialReceipt: {id: uuid('9'), accountId: account, runEpoch: epoch, actorId: actor,
        actionUid: `fx_${operation.replaceAll('-', '')}_repair`, kind: 'spend', reason: 'structure_repair',
        reference: `repair:${operation}`, balanceDelta: '-10', committedDelta: '0',
        balanceAtCommit: '90', committedAtCommit: '0', revisionAtCommit: '2', sourceReservationId: null}},
  }, ...(!repeat && fresh ? {economy: economy(), currentState: state()} : {})}};
}
function storage() {
  const values = new Map();
  return {values, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
}
function make(options = {}) {
  const pendingStore = options.pendingStore ?? storage();
  const requests = [], updates = [], expectedOrigins = [];
  let current = economy();
  const transport = {get: async (path, config) => {requests.push({path, config});
    return {ok: true, data: {...state(), economy: economy()}};},
  post: async (path, body, config) => {requests.push({path, body, config}); return success(body);}};
  const api = createSharedCombatApi({transport, getActorId: () => actor, getEconomy: () => current,
    onEconomy: (value, expectedOrigin) => {updates.push(value); expectedOrigins.push(expectedOrigin);},
    makeUid: () => 'repair-action-01', pendingStore, ...options});
  return {api, requests, updates, expectedOrigins, transport, pendingStore, setCurrent: value => {current = value;}};
}

describe('shared combat API', () => {
  it('uses negotiated authenticated transport and sends only the published economy intent', async () => {
    const value = make();
    const answer = await value.api.repairStructure({quote: quote(), code: 'ISLE-K7Q2M'});
    expect(answer.ok).toBe(true);
    expect(value.requests[0]).toMatchObject({path: '/api/island/structures/repair',
      config: {headers: {'X-Island-Economy-Version': '1'}},
      body: {actionUid: 'repair-action-01', economy: {mode: 'island_shared',
        version: 1, islandOwner: owner, runEpoch: epoch}}});
    expect(value.requests[0].body.economy).not.toHaveProperty('accountId');
    expect(value.requests[0].body).not.toHaveProperty('code');
    expect(answer.data).not.toHaveProperty('coins');
    expect(value.updates).toEqual([economy()]);
    expect(value.expectedOrigins).toEqual([{mode: 'island_shared', version: 1,
      islandOwner: owner, accountId: account, runEpoch: epoch}]);
    expect(value.pendingStore.values.size).toBe(0);
  });

  it('preserves an unknown payload and UID byte-for-byte across a reload and refreshed quote', async () => {
    const pendingStore = storage(), first = make({pendingStore});
    first.transport.post = async (path, body) => {first.requests.push({path, body}); return {ok: false, status: 503};};
    expect((await first.api.repairStructure({quote: quote()})).ok).toBe(false);
    const second = make({pendingStore, makeUid: () => 'different-click'});
    expect((await second.api.repairStructure({quote: quote({expectedRepairSeq: 19})})).ok).toBe(true);
    expect(second.requests[0].body).toEqual(first.requests[0].body);
  });

  it('keeps a durable unknown intent when a transport throws', async () => {
    const value = make();
    value.transport.post = async () => {throw new Error('offline');};
    expect((await value.api.repairStructure({quote: quote()})).status).toBe(0);
    expect(value.pendingStore.values.size).toBe(1);
  });

  it('rejects an unrelated financial receipt and keeps the unknown intent for verification', async () => {
    const value = make();
    value.transport.post = async (_path, body) => {const reply = success(body);
      reply.data.receipt.result.financialReceipt.accountId = uuid('0'); return reply;};
    expect((await value.api.repairStructure({quote: quote()})).code).toBe('unreadable');
    expect(value.updates).toEqual([]);
    expect(value.pendingStore.values.size).toBe(1);
  });

  it('does not update current funds or health when a late receipt belongs to the previous island', async () => {
    const value = make();
    value.transport.post = async (_path, body) => {value.setCurrent(economy({runEpoch: uuid('0')})); return success(body);};
    const answer = await value.api.repairStructure({quote: quote()});
    expect(answer.ok).toBe(true);
    expect(answer.data).not.toHaveProperty('economy');
    expect(answer.data).not.toHaveProperty('currentState');
    expect(value.updates).toEqual([]);
  });

  it('accepts owned receipt-only retries without inventing a fresh balance', async () => {
    const value = make();
    value.transport.post = async (_path, body) => success(body, {repeat: true});
    expect((await value.api.repairStructure({quote: quote({expectedRepairSeq: 8})})).ok).toBe(true);
    expect(value.updates).toEqual([]);
  });

  it('accepts an already committed receipt when the optional fresh state is unavailable', async () => {
    const value = make();
    value.transport.post = async (_path, body) => success(body, {fresh: false});
    expect((await value.api.repairStructure({quote: quote()})).ok).toBe(true);
    expect(value.updates).toEqual([]);
  });

  it('refuses missing context without a private-payment fallback', async () => {
    const value = make({getEconomy: () => null});
    expect((await value.api.repairStructure({quote: quote()})).code).toBe('economy_context_required');
    expect(value.requests).toEqual([]);
  });

  it('fails before sending when durable retry storage cannot save the intent', async () => {
    const value = make({pendingStore: {getItem: () => null, setItem: () => {throw new Error('denied');}, removeItem() {}}});
    expect((await value.api.repairStructure({quote: quote()})).ok).toBe(false);
    expect(value.requests).toEqual([]);
  });

  it('reads shared structure context with capability and prevents legacy snapshots on that path', async () => {
    const value = make();
    expect((await value.api.structureRecovery({code: 'ISLE-K7Q2M'})).ok).toBe(true);
    expect(value.requests[0]).toMatchObject({path: '/api/island/structures?code=ISLE-K7Q2M',
      config: {headers: {'X-Island-Economy-Version': '1'}}});
    value.transport.get = async () => ({ok: true, data: state()});
    expect((await value.api.structureRecovery({})).code).toBe('unreadable');
  });

  it('discards a structure read completed after the authenticated actor changes', async () => {
    let selectedActor = actor;
    const value = make({getActorId: () => selectedActor});
    value.transport.get = async () => {
      selectedActor = uuid('0');
      return {ok: true, data: {...state(), economy: economy()}};
    };
    expect((await value.api.structureRecovery({})).code).toBe('economy_epoch_mismatch');
    expect(value.updates).toEqual([]);
  });

  it('freezes the original origin even if a caller mutates its context object during a read', async () => {
    const selected = economy(), value = make({getEconomy: () => selected});
    value.transport.get = async () => {
      selected.runEpoch = uuid('0');
      return {ok: true, data: {...state(), economy: economy()}};
    };
    expect((await value.api.structureRecovery({})).code).toBe('economy_epoch_mismatch');
    expect(value.updates).toEqual([]);
  });
});
