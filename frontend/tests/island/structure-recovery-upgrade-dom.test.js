// A damaged v1 structure disables the card's base Upgrade control without sending a charge request.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('shows the repair requirement and sends no upgrade from the damaged recovery card', async () => {
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
    const upgrades = [];
    const transport = {...base,
      get: async path => path.startsWith('/api/island/structures') ? {ok: true, status: 200, data: state} : base.get(path),
      post: async (path, body) => { if (path.includes('/upgrade')) upgrades.push(path); return base.post(path, body); }};
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      structureRecoveryOn: () => false, menu: () => () => {}});
    await island.load();
    if (!island.island.spots.find(spot => spot.id === 'wall_1')?.built) await island.build('wall_1', 'wall');
    island.pick('wall_1');
    await new Promise(resolve => setTimeout(resolve, 100));
    const button = document.querySelector('.island-card[open] [data-focus="upgrade"]');
    const answer = {disabled: button?.disabled ?? null, hp: document.querySelector('.recovery-hp')?.textContent ?? '',
      reason: document.querySelector('.island-card[open] .island-reason')?.textContent ?? '', upgradesBefore: upgrades.length};
    button?.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    answer.upgradesAfter = upgrades.length;
    island.dispose(); return answer;
  }));
  expect(result.disabled).toBe(true);
  expect(result.hp).toBe('45 / 60 HP');
  expect(result.reason).toBe('Repair to full before an upgrade.');
  expect(result).toMatchObject({upgradesBefore: 0, upgradesAfter: 0});
});
