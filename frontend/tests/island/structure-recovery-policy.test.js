// Saved recovery-v1 policy remains readable when new-wave admission is off.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('keeps saved recovery cards when admission is off, while legacy islands stay unchanged', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport();
    const calls = [];
    let startBody = null;
    const recovery = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: '22345678-1234-4234-8234-123456789abc', revision: 4,
      recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
      remainingPaidUses: null, structures: [{spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc',
        kind: 'wall', level: 1, hpUnits: 500000, maxHP: 60, rateUnitsPerSecond: 1666.67, estimatedFreeSeconds: 300,
        fixedPrice: 10, repairSeq: 0}]};
    const transport = {...base,
      get: async path => {
        calls.push(path);
        if (path.startsWith('/api/island/structures')) return {ok: true, status: 200, data: recovery};
        return base.get(path);
      },
      post: async (path, body) => {
        if (path === '/api/waves/start') { startBody = body; return {ok: false, status: 503, code: 'offline', message: 'Offline.'}; }
        return base.post(path, body);
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}});
    await island.load();
    if (!island.island.spots.find(spot => spot.id === 'wall_1')?.built) await island.build('wall_1', 'wall');
    island.pick('wall_1');
    const persisted = {hp: document.querySelector('.recovery-hp')?.textContent ?? '',
      repair: document.querySelector('.recovery-repair')?.textContent ?? '', read: calls.includes('/api/island/structures')};
    await island.api.startWave({where: 'own'});
    persisted.waveProtocol = startBody?.waveProtocol ?? null;
    island.dispose();

    const legacy = createIsland({container: document.body, emit, on, mode: 'fake', transport: base, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}});
    await legacy.load(); legacy.pick('wall_1');
    const old = {health: !!document.querySelector('.recovery-hp'), card: document.querySelector('.island-card-build')?.innerText ?? ''};
    legacy.dispose();
    return {persisted, old};
  }));
  expect(result.persisted).toEqual({hp: '30 / 60 HP', repair: 'Repair now: pay 10 coins', read: true, waveProtocol: 2});
  expect(result.old.health).toBe(false);
  expect(result.old.card).toContain('Level 2: Opens after wave 2.');
});

it('requires the replayed combat health checkpoint to succeed before submitting a paid repair', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const waveId = '62345678-1234-4234-8234-123456789abc', epoch = '22345678-1234-4234-8234-123456789abc';
    const instanceId = '32345678-1234-4234-8234-123456789abc', token = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
    const base = createFakeIslandTransport();
    let repairPosts = 0, checkpoints = 0;
    let state = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: epoch, revision: 4, recoveryVersion: 1, waveProtocol: 2,
      displayPhase: 'preparing', repairWindow: 'reserved_wave', waveId, remainingPaidUses: 2,
      structures: [{spot: 'wall_1', instanceId, kind: 'wall', level: 1, hpUnits: 500000, maxHP: 60,
        rateUnitsPerSecond: 0, estimatedFreeSeconds: null, fixedPrice: 10, repairSeq: 0}]};
    const initialSnapshot = {recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId, islandEpoch: epoch, seed: 7,
      startsAt: '2026-11-17T12:00:10Z', weather: {kind: 'clear'}, rules: ['structure_recovery'],
      createWave: {defenses: [{id: 'wall_1', kind: 'wall', x: 0, z: 0}]},
      structures: [{spot: 'wall_1', instanceId, kind: 'wall', level: 1, x: 0, z: 0, hpUnits: 500000, maxHP: 60, repairSeq: 0}],
      participants: [{participantToken: token, captain: {level: 1, skills: [], weapon: 'musket'}}]};
    const wave = {waveId, wave: 1, seed: 7, startsAt: initialSnapshot.startsAt, weather: {kind: 'clear'}, flagship: false,
      recoveryVersion: 1, waveProtocol: 2, initialSnapshot, participantToken: token, lastActorCounter: 0};
    const transport = {...base,
      get: async path => path.startsWith('/api/island/structures') ? {ok: true, status: 200, data: state} : base.get(path),
      post: async (path, body) => {
        if (path === '/api/waves/start') return {ok: true, status: 200, data: wave};
        if (path === '/api/island/structures/repair') repairPosts++;
        return base.post(path, body);
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}});
    await island.load();
    if (!island.island.spots.find(spot => spot.id === 'wall_1')?.built) await island.build('wall_1', 'wall');
    await island.flow.ring('own');
    state = {...state, displayPhase: 'combat'};
    island.pick('wall_1');
    await new Promise(resolve => setTimeout(resolve, 80));
    island.setRecoveryCombatState({waveId, islandEpoch: epoch, structures: [{spot: 'wall_1', instanceId,
      hpUnits: 400000, maxHP: 60, repairSeq: 0}]});
    island.setRecoveryCheckpointHandler(async () => { checkpoints++; return {ok: false, code: 'health_sync_required'}; });
    document.querySelector('.recovery-repair')?.click();
    await new Promise(resolve => setTimeout(resolve, 120));
    const error = document.querySelector('.recovery-error')?.textContent ?? '';
    island.dispose();
    return {repairPosts, checkpoints, error};
  }));
  expect(result).toEqual({repairPosts: 0, checkpoints: 1, error: 'Battle damage is still being checked. Refresh and try again.'});
});

it('advertises protocol two for a first wave when admission is enabled on a legacy island', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport();
    let startBody = null;
    const legacyWave = {waveId: '72345678-1234-4234-8234-123456789abc', wave: 1, seed: 7,
      startsAt: '2026-11-17T12:00:10Z', weather: {kind: 'clear'}, flagship: false, recoveryVersion: 0, waveProtocol: 1};
    const transport = {...base,
      post: async (path, body) => {
        if (path === '/api/waves/start') { startBody = body; return {ok: true, status: 200, data: legacyWave}; }
        return base.post(path, body);
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => true, menu: () => () => {}});
    await island.load(); await island.flow.ring('own');
    const answer = {waveProtocol: startBody?.waveProtocol, responseProtocol: island.flow.current?.wave?.waveProtocol};
    island.dispose(); return answer;
  }));
  expect(result).toEqual({waveProtocol: 2, responseProtocol: 1});
});

it('advertises protocol two regardless of the admission flag on a legacy island', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport();
    let request = null;
    const legacyWave = {waveId: '82345678-1234-4234-8234-123456789abc', wave: 1, seed: 8,
      startsAt: '2026-11-17T12:00:10Z', weather: {kind: 'clear'}, flagship: false, recoveryVersion: 0, waveProtocol: 1};
    const transport = {...base, post: async (path, body) => {
      if (path === '/api/waves/start') { request = body; return {ok: true, status: 200, data: legacyWave}; }
      return base.post(path, body);
    }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}});
    await island.load(); await island.flow.ring('own');
    const answer = {waveProtocol: request?.waveProtocol, responseProtocol: island.flow.current?.wave?.waveProtocol};
    island.dispose(); return answer;
  }));
  expect(result).toEqual({waveProtocol: 2, responseProtocol: 1});
});
