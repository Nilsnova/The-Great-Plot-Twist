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
      repair: document.querySelector('.recovery-repair')?.textContent ?? '', read: calls.includes('/api/island/structures'),
      recoveryVersion: island.recoveryVersion};
    await island.api.startWave({where: 'own'});
    persisted.waveProtocol = startBody?.waveProtocol ?? null;
    island.dispose();

    const legacy = createIsland({container: document.body, emit, on, mode: 'fake', transport: base, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}});
    await legacy.load(); legacy.pick('wall_1');
    const old = {health: !!document.querySelector('.recovery-hp'), card: document.querySelector('.island-card-build')?.innerText ?? '',
      recoveryVersion: legacy.recoveryVersion};
    legacy.dispose();
    return {persisted, old};
  }));
  expect(result.persisted).toEqual({hp: '30 / 60 HP', repair: 'Repair now: pay 10 coins', read: true,
    recoveryVersion: 1, waveProtocol: 2});
  expect(result.old.health).toBe(false);
  expect(result.old.recoveryVersion).toBe(0);
  expect(result.old.card).toContain('Level 2: Opens after wave 2.');
});

it('keeps an island with unavailable canonical health fail closed, then discovers v1 policy on retry', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport();
    base.dev.setWaveBest(20); base.dev.setCoins(5000);
    const state = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: '22345678-1234-4234-8234-123456789abc', revision: 4,
      recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
      remainingPaidUses: null, structures: [{spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc',
        kind: 'wall', level: 1, hpUnits: 750_000, maxHP: 60, rateUnitsPerSecond: 1666.67, estimatedFreeSeconds: 150,
        fixedPrice: 10, repairSeq: 0}]};
    let failures = 5, canonicalReads = 0, nextTimer = 1;
    const timers = new Map();
    const setTimer = (run, ms) => { const id = nextTimer++; timers.set(id, {run, ms}); return id; };
    const clearTimer = id => timers.delete(id);
    const transport = {...base,
      get: async path => {
        if (path.startsWith('/api/island/structures')) {
          canonicalReads++;
          if (failures-- > 0) return {ok: false, status: 503, code: 'database_unavailable', message: 'Try again.'};
          return {ok: true, status: 200, data: state};
        }
        if (path.startsWith('/api/island/walls')) return {ok: true, status: 200,
          data: {coins: 5000, walls: [{spot: 'wall_1', level: 1, health: 50, recoversAt: null, repairCost: 10}]}};
        return base.get(path);
      },
      post: async (path, body) => {
        const answer = await base.post(path, body);
        if (answer.ok && answer.data?.spots) answer.data.recoveryVersion = 1;
        return answer;
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, wallRecovery: () => true, menu: () => () => {}, setTimer, clearTimer});
    await island.load();
    await island.build('wall_1', 'wall');
    island.pick('wall_1');
    await new Promise(resolve => setTimeout(resolve, 120));
    const unavailable = {message: document.querySelector('.recovery-message')?.textContent ?? '',
      paidButton: !!document.querySelector('.recovery-repair'), legacyAction: !!document.querySelector('[data-focus="repair"]'),
      upgradeDisabled: document.querySelector('[data-focus="upgrade"]')?.disabled ?? null};
    failures = 0;
    const poll = [...timers.values()].find(timer => timer.ms === 5000);
    await poll.run();
    const recovered = {reads: canonicalReads, hp: document.querySelector('.recovery-hp')?.textContent ?? '',
      paidButton: !!document.querySelector('.recovery-repair'), legacyAction: !!document.querySelector('[data-focus="repair"]')};
    island.dispose(); return {unavailable, recovered};
  }));
  expect(result.unavailable).toMatchObject({message: 'Building health could not be loaded.', paidButton: false,
    legacyAction: false, upgradeDisabled: true});
  expect(result.recovered).toMatchObject({reads: 3, hp: '45 / 60 HP', paidButton: true, legacyAction: false});
});

it('does not downgrade a persisted v1 island when the structure endpoint says feature_off', async () => {
  const captureDir = process.env.RECOVERY_POLICY_CAPTURE_DIR;
  const result = await browser.withPage(async page => {
    const fixture = await page.evaluate(async ({retainForCapture}) => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport({flags: {wall_recovery: true}});
    base.dev.setWaveBest(20); base.dev.setCoins(5000);
    const transport = {...base,
      get: async path => {
        if (path === '/api/island') {
          const answer = await base.get(path);
          if (answer.ok) answer.data.recoveryVersion = 1;
          return answer;
        }
        if (path.startsWith('/api/island/structures')) return {ok: false, status: 404, code: 'feature_off', message: 'Unavailable.'};
        if (path.startsWith('/api/island/walls')) return {ok: true, status: 200,
          data: {coins: 5000, walls: [{spot: 'wall_1', level: 1, health: 50, recoversAt: null, repairCost: 10}]}};
        return base.get(path);
      },
      post: async (path, body) => {
        const answer = await base.post(path, body);
        if (answer.ok && answer.data?.spots) answer.data.recoveryVersion = 1;
        return answer;
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, wallRecovery: () => true, menu: () => () => {}});
    await island.load();
    for (const [spot, kind] of [['wall_1', 'wall'], ['cannon_1', 'cannon']]) {
      if (!island.island.spots.find(item => item.id === spot)?.built) await island.build(spot, kind);
    }
    island.pick('wall_1');
    await new Promise(resolve => setTimeout(resolve, 100));
    const wall = {message: document.querySelector('.recovery-message')?.textContent ?? '',
      legacyRepair: !!document.querySelector('.island-card[open] [data-focus="repair"]'), policyVersion: island.recoveryVersion};
    if (retainForCapture) {
      window.recoveryPolicyCaptureIsland = island;
      return {wall};
    }
    island.pick('cannon_1');
    await new Promise(resolve => setTimeout(resolve, 50));
    const upgrade = document.querySelector('.island-card[open] [data-focus="upgrade"]');
    const tower = {message: document.querySelector('.recovery-message')?.textContent ?? '', upgradeDisabled: upgrade?.disabled ?? null,
      upgradeReason: document.querySelector('.island-card[open] .island-reason')?.textContent ?? ''};
    island.dispose();
    return {wall, tower};
    }, {retainForCapture: !!captureDir});
    if (!captureDir) return fixture;
    const {mkdir, readFile} = await import('node:fs/promises');
    const {join} = await import('node:path');
    await mkdir(captureDir, {recursive: true});
    for (const stylesheet of ['../../src/ui/base.css', '../../src/ui/kit/kit.css']) {
      await page.addStyleTag({content: await readFile(new URL(stylesheet, import.meta.url), 'utf8')});
    }
    await page.setViewportSize({width: 1440, height: 900});
    await page.locator('.island-card[open]').screenshot({path: join(captureDir, 't59-policy-fallback-wall-error-desktop.png')});
    const tower = await page.evaluate(async () => {
      const island = window.recoveryPolicyCaptureIsland;
      island.pick('cannon_1');
      await new Promise(resolve => setTimeout(resolve, 50));
      const upgrade = document.querySelector('.island-card[open] [data-focus="upgrade"]');
      return {message: document.querySelector('.recovery-message')?.textContent ?? '', upgradeDisabled: upgrade?.disabled ?? null,
        upgradeReason: document.querySelector('.island-card[open] .island-reason')?.textContent ?? ''};
    });
    await page.setViewportSize({width: 375, height: 812});
    await page.locator('.island-card[open]').screenshot({path: join(captureDir, 't59-policy-fallback-cannon-phone.png')});
    await page.evaluate(() => { window.recoveryPolicyCaptureIsland.dispose(); delete window.recoveryPolicyCaptureIsland; });
    return {...fixture, tower};
  });
  expect(result.wall).toEqual({message: 'Building health could not be loaded.', legacyRepair: false, policyVersion: 1});
  expect(result.tower).toEqual({message: 'Building health could not be loaded.', upgradeDisabled: true,
    upgradeReason: 'Wait until building health has loaded.'});
});

it('keeps a previously discovered v1 policy when a later structure read says feature_off', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport({flags: {wall_recovery: true}});
    base.dev.setWaveBest(20); base.dev.setCoins(5000);
    const state = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: '22345678-1234-4234-8234-123456789abc', revision: 4,
      recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
      remainingPaidUses: null, structures: [{spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc',
        kind: 'wall', level: 1, hpUnits: 500_000, maxHP: 60, rateUnitsPerSecond: 1666.67, estimatedFreeSeconds: 300,
        fixedPrice: 10, repairSeq: 0}]};
    let featureOff = false, nextTimer = 1;
    const timers = new Map();
    const setTimer = (run, ms) => { const id = nextTimer++; timers.set(id, {run, ms}); return id; };
    const clearTimer = id => timers.delete(id);
    const transport = {...base,
      get: async path => {
        if (path.startsWith('/api/island/structures')) return featureOff
          ? {ok: false, status: 404, code: 'feature_off', message: 'Unavailable.'}
          : {ok: true, status: 200, data: state};
        if (path.startsWith('/api/island/walls')) return {ok: true, status: 200,
          data: {coins: 5000, walls: [{spot: 'wall_1', level: 1, health: 50, recoversAt: null, repairCost: 10}]}};
        return base.get(path);
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, wallRecovery: () => true, setTimer, clearTimer, menu: () => () => {}});
    await island.load();
    for (const [spot, kind] of [['wall_1', 'wall'], ['cannon_1', 'cannon']]) {
      if (!island.island.spots.find(item => item.id === spot)?.built) await island.build(spot, kind);
    }
    island.pick('wall_1');
    await new Promise(resolve => setTimeout(resolve, 100));
    const before = island.recoveryVersion;
    featureOff = true;
    const pollId = [...timers.entries()].find(([, timer]) => timer.ms === 5000)?.[0];
    const poll = timers.get(pollId);
    if (poll) { timers.delete(pollId); await poll.run(); }
    const wall = {message: document.querySelector('.recovery-message')?.textContent ?? '',
      legacyRepair: !!document.querySelector('.island-card[open] [data-focus="repair"]'), policyVersion: island.recoveryVersion};
    featureOff = false;
    island.pick('wall_1');
    await new Promise(resolve => setTimeout(resolve, 80));
    const resumed = {hp: document.querySelector('.recovery-hp')?.textContent ?? '',
      legacyRepair: !!document.querySelector('.island-card[open] [data-focus="repair"]')};
    featureOff = true;
    island.pick('cannon_1');
    await new Promise(resolve => setTimeout(resolve, 50));
    const upgrade = document.querySelector('.island-card[open] [data-focus="upgrade"]');
    const tower = {message: document.querySelector('.recovery-message')?.textContent ?? '', upgradeDisabled: upgrade?.disabled ?? null};
    island.dispose();
    return {before, wall, resumed, tower};
  }));
  expect(result.before).toBe(1);
  expect(result.wall).toEqual({message: 'Building health could not be loaded.', legacyRepair: false, policyVersion: 1});
  expect(result.resumed).toEqual({hp: '30 / 60 HP', legacyRepair: false});
  expect(result.tower).toEqual({message: 'Building health could not be loaded.', upgradeDisabled: true});
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

it('keeps a paid-repair refusal visible after canonical refresh and background poll', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport();
    const state = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: '22345678-1234-4234-8234-123456789abc', revision: 4,
      recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
      remainingPaidUses: null, structures: [{spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc',
        kind: 'wall', level: 1, hpUnits: 750000, maxHP: 60, rateUnitsPerSecond: 1666.67, estimatedFreeSeconds: 150,
        fixedPrice: 10, repairSeq: 0}]};
    let repairPosts = 0, reads = 0, nextTimer = 1;
    const timers = new Map();
    const setTimer = (run, ms) => { const id = nextTimer++; timers.set(id, {run, ms}); return id; };
    const clearTimer = id => timers.delete(id);
    const transport = {...base,
      get: async path => {
        if (path.startsWith('/api/island/structures')) { reads++; return {ok: true, status: 200, data: state}; }
        return base.get(path);
      },
      post: async (path, body) => {
        if (path === '/api/island/structures/repair') { repairPosts++; return {ok: false, status: 409,
          code: 'insufficient_funds', message: 'Not enough coins for this repair.'}; }
        return base.post(path, body);
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}, setTimer, clearTimer});
    await island.load();
    if (!island.island.spots.find(spot => spot.id === 'wall_1')?.built) await island.build('wall_1', 'wall');
    island.pick('wall_1'); document.querySelector('.recovery-repair')?.click();
    await new Promise(resolve => setTimeout(resolve, 150));
    const errorBeforePoll = document.querySelector('.recovery-error')?.textContent ?? '';
    const poll = [...timers.entries()].find(([, timer]) => timer.ms === 5000);
    if (poll) { timers.delete(poll[0]); await poll[1].run(); }
    const answer = {repairPosts, reads, hp: document.querySelector('.recovery-hp')?.textContent ?? '',
      errorBeforePoll, errorAfterPoll: document.querySelector('.recovery-error')?.textContent ?? ''};
    island.dispose(); return answer;
  }));
  expect(result).toMatchObject({repairPosts: 1, hp: '45 / 60 HP', errorBeforePoll: 'Not enough coins for this repair.',
    errorAfterPoll: 'Not enough coins for this repair.'});
  expect(result.reads).toBeGreaterThanOrEqual(2);
});

it('refreshes saved recovery while no card is open and clears the timer on dispose', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport();
    const partial = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: '22345678-1234-4234-8234-123456789abc', revision: 4,
      recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
      remainingPaidUses: null, structures: [{spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc',
        kind: 'wall', level: 1, hpUnits: 750000, maxHP: 60, rateUnitsPerSecond: 1666.67, estimatedFreeSeconds: 150,
        fixedPrice: 10, repairSeq: 0}]};
    let state = partial, reads = 0, nextId = 1;
    const timers = new Map();
    const setTimer = (run, ms) => { const id = nextId++; timers.set(id, {run, ms}); return id; };
    const clearTimer = id => timers.delete(id);
    const transport = {...base, get: async path => {
      if (path.startsWith('/api/island/structures')) { reads++; return {ok: true, status: 200, data: state}; }
      return base.get(path);
    }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}, setTimer, clearTimer});
    await island.load();
    await island.api.build({spot: 'wall_1', kind: 'wall'});
    await island.load();
    const hadClosedCard = !document.querySelector('.island-card-build');
    const poll = [...timers.entries()].find(([, item]) => item.ms === 5000);
    const readsBeforePoll = reads;
    state = {...partial, revision: 5, structures: [{...partial.structures[0], hpUnits: 1_000_000, repairSeq: 1, estimatedFreeSeconds: 0}]};
    timers.delete(poll[0]); await poll[1].run();
    const readsAfterPoll = reads;
    island.pick('wall_1');
    const answer = {hadClosedCard, readsBeforePoll, readsAfterPoll, reads, hpHiddenAfterFull: !document.querySelector('.recovery-hp'), timersBeforeDispose: timers.size};
    island.dispose(); answer.timersAfterDispose = timers.size;
    return answer;
  }));
  expect(result.hadClosedCard).toBe(true);
  expect(result.readsAfterPoll).toBe(result.readsBeforePoll + 1);
  expect(result).toMatchObject({hpHiddenAfterFull: true, timersBeforeDispose: 1, timersAfterDispose: 0});
});

it('allows preparation repair after the wave checkpoint gate succeeds', async () => {
  const result = await browser.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const waveId = '92345678-1234-4234-8234-123456789abc', epoch = '22345678-1234-4234-8234-123456789abc';
    const instanceId = '32345678-1234-4234-8234-123456789abc', token = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
    const base = createFakeIslandTransport();
    let checkpoints = 0, repairPosts = 0, postedBody = null;
    let state = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: epoch, revision: 4, recoveryVersion: 1, waveProtocol: 2,
      displayPhase: 'preparing', repairWindow: 'reserved_wave', waveId, remainingPaidUses: 3,
      structures: [{spot: 'wall_1', instanceId, kind: 'wall', level: 1, hpUnits: 500000, maxHP: 60,
        rateUnitsPerSecond: 0, estimatedFreeSeconds: null, fixedPrice: 10, repairSeq: 0}]};
    const initialSnapshot = {recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId, islandEpoch: epoch, seed: 7,
      startsAt: '2026-11-17T12:00:10Z', weather: {kind: 'clear'}, rules: ['structure_recovery'],
      createWave: {defenses: [{id: 'wall_1', kind: 'wall', x: 0, z: 0}]},
      structures: [{spot: 'wall_1', instanceId, kind: 'wall', level: 1, x: 0, z: 0, hpUnits: 500000, maxHP: 60, repairSeq: 0}],
      participants: [{participantToken: token, captain: {level: 1, skills: [], weapon: 'musket'}}]};
    const wave = {waveId, wave: 1, seed: 7, startsAt: initialSnapshot.startsAt, weather: {kind: 'clear'}, flagship: false,
      recoveryVersion: 1, waveProtocol: 2, initialSnapshot, participantToken: token, lastActorCounter: 0};
    const full = {...state, revision: 5, remainingPaidUses: 2,
      structures: [{...state.structures[0], hpUnits: 1_000_000, repairSeq: 1}]};
    const receipt = {actionUid: 'action00001', spot: 'wall_1', instanceId, kind: 'wall', level: 1,
      chargedPrice: 10, balanceAtCommit: 90, waveId, useOrdinal: 1, eventSeq: 1, repairSeq: 1};
    const transport = {...base,
      get: async path => path.startsWith('/api/island/structures') ? {ok: true, status: 200, data: state} : base.get(path),
      post: async (path, body) => {
        if (path === '/api/waves/start') return {ok: true, status: 200, data: wave};
        if (path === '/api/island/structures/repair') {
          repairPosts++; postedBody = body; state = full;
          return {ok: true, status: 200, data: {receipt: {...receipt, actionUid: body.actionUid}, currentState: full, coins: 90}};
        }
        return base.post(path, body);
      }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}});
    await island.load();
    if (!island.island.spots.find(spot => spot.id === 'wall_1')?.built) await island.build('wall_1', 'wall');
    await island.flow.ring('own');
    island.pick('wall_1');
    island.setRecoveryCheckpointHandler(async () => { checkpoints++; return {ok: true}; });
    document.querySelector('.recovery-repair')?.click();
    await new Promise(resolve => setTimeout(resolve, 120));
    const answer = {checkpoints, repairPosts, expectedWindow: postedBody?.expectedWindow,
      expectedWaveId: postedBody?.expectedWaveId, fullHealthHidden: !document.querySelector('.recovery-hp')};
    island.dispose(); return answer;
  }));
  expect(result).toEqual({checkpoints: 1, repairPosts: 1, expectedWindow: 'reserved_wave',
    expectedWaveId: '92345678-1234-4234-8234-123456789abc', fullHealthHidden: true});
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
