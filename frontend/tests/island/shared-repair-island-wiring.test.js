// Actual island repair presentation with declared HTTP fixtures; adapter proofs are tested separately.
import {afterEach, expect, it, vi} from 'vitest';
vi.mock('../../src/island/ui.js', () => ({createIslandUi: () => ({open: null, active: false,
  buildCard(model, handlers) {this.model = model; this.handlers = handlers; this.open = 'build';},
  close() {this.open = null;}, dispose() {}, toast() {}, banner() {}, visit() {}})}));
vi.mock('../../src/island/move-bar.js', () => ({createMoveBar: () => ({render() {}, dispose() {}})}));
vi.mock('../../src/island/village-bar.js', () => ({createVillageBar: () => ({render() {}, setBuildings() {}, dispose() {}})}));
vi.mock('../../src/island/wall-builder-bar.js', () => ({createWallBuilderBar: () => ({render() {}, dispose() {}})}));
import {createIsland} from '../../src/island/index.js';
import {buildCardModel} from '../../src/island/card-model.js';
import {createFakeIslandTransport} from '../../src/pirates/fake-api.js';

const actor = '11111111-1111-4111-8111-111111111111';
const id = digit => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const economy = (available = '100', revision = '1') => ({mode: 'island_shared', version: 1, islandOwner: actor,
  accountId: id('2'), runEpoch: id('3'), revision,
  treasury: {balanceCoins: available, committedCoins: '0', availableCoins: available}});
const state = () => ({serverNow: '2026-11-18T12:00:00Z', islandEpoch: id('4'), revision: 1,
  recoveryVersion: 1, waveProtocol: 2, displayPhase: 'preparing', repairWindow: 'reserved_wave',
  waveId: id('5'), remainingPaidUses: 3, economy: economy(),
  structures: [{spot: 'wall_1', instanceId: id('6'), kind: 'wall', level: 1, hpUnits: 500000,
    maxHP: 60, repairSeq: 0, rateUnitsPerSecond: 0, estimatedFreeSeconds: null, fixedPrice: 10}]});
const instances = [];
afterEach(() => {for (const island of instances.splice(0)) island.dispose();});

it.each([{name: 'newer empty treasury', selected: economy('0', '2')}, {name: 'unknown context', selected: null}])
  ('uses canonical funding for $name instead of an old recovery balance or personal coins', ({selected}) => {
    const model = buildCardModel({spotId: 'wall_1', slot: 'wall', coins: 100000,
      spot: {id: 'wall_1', built: true, kind: 'wall', level: 1, cost: 10},
      recoveryState: state(), recoveryStatus: 'ready', recoveryVersion: 1, economy: selected});
    expect(model.recovery.repairDisabled).toBe(true);
  });

it('does not predict a current heal from an archived shared receipt', async () => {
  const base = createFakeIslandTransport(); base.dev.setWaveBest(4);
  await base.post('/api/island/build', {spot: 'wall_1', kind: 'wall', actionUid: 'fixture-wall-01'});
  const events = [], listeners = new Map();
  const on = (name, listener) => {
    const values = listeners.get(name) ?? new Set(); values.add(listener); listeners.set(name, values);
    return () => values.delete(listener);
  };
  const emit = event => {events.push(event); for (const listener of listeners.get(event.type) ?? []) listener(event);};
  const transport = {...base, async get(path) {
    if (path === '/api/island/structures') return {ok: true, data: state()};
    const answer = await base.get(path);
    return path === '/api/island' ? {...answer, data: {...answer.data, recoveryVersion: 1, economy: economy()}} : answer;
  }};
  const island = createIsland({container: {}, on, emit, transport, getActorId: () => actor,
    storage: null, visitStorage: null, structureRecoveryOn: () => true, menu: () => () => {}, settings: () => () => {}});
  instances.push(island);
  await island.load(); island.pick('wall_1');
  await vi.waitFor(() => expect(island.ui.model.recovery.repairDisabled).toBe(false));
  const repeat = vi.fn(async () => ({ok: true, data: {repeat: true,
    receipt: {origin: economy(), result: {waveId: id('7')}}}}));
  island.api.repairStructure = repeat;
  island.setRecoveryCheckpointHandler(async () => ({ok: true}));
  island.ui.handlers.repairStructure('wall_1', island.ui.model.recovery.repairIntent);
  await vi.waitFor(() => expect(repeat).toHaveBeenCalledOnce());
  await new Promise(resolve => setImmediate(resolve));
  expect(events.filter(event => event.type === 'structure_repair_paid')).toEqual([]);
});
