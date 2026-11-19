// Actual Chromium rendering of the shared repair component; these are synthetic component fixtures.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('renders the island payer and exact shared funds on desktop and phone without between-wave offers', async () => {
  await browser.withPage(async page => {
    await page.evaluate(async () => {
      await window.g20Import('/src/island/structure-recovery.css');
      const {buildStructureRecoveryView} = await window.g20Import('/src/island/structure-recovery-model.js');
      const {renderStructureRecoveryView} = await window.g20Import('/src/island/structure-recovery-view.js');
      window.drawRepair = ({reserved = true, available = '90071992547409939999'} = {}) => {
        const economy = {mode: 'island_shared', version: 1, revision: '2',
          islandOwner: '11111111-1111-4111-8111-111111111111', accountId: '22222222-2222-4222-8222-222222222222',
          runEpoch: '33333333-3333-4333-8333-333333333333',
          treasury: {balanceCoins: available, committedCoins: '0', availableCoins: available}};
        const state = {economy, islandEpoch: '44444444-4444-4444-8444-444444444444', revision: 2,
          recoveryVersion: 1, waveProtocol: 2, displayPhase: reserved ? 'preparing' : 'between_waves',
          repairWindow: reserved ? 'reserved_wave' : 'between_waves',
          waveId: reserved ? '55555555-5555-4555-8555-555555555555' : null,
          remainingPaidUses: reserved ? 2 : null};
        const row = {instanceId: '66666666-6666-4666-8666-666666666666', spot: 'wall_1', kind: 'wall',
          level: 1, hpUnits: 0, maxHP: 60, repairSeq: 0, fixedPrice: 10, estimatedFreeSeconds: 300};
        const container = document.createElement('div');
        document.body.replaceChildren(container);
        window.repairClick = null;
        renderStructureRecoveryView(container, buildStructureRecoveryView(state, row, {coins: 1000000}), {
          onRepair: quote => {window.repairClick = quote;},
        });
      };
    });
    await page.setViewportSize({width: 1280, height: 720});
    await page.evaluate(() => window.drawRepair());
    expect(await page.locator('.recovery-payer').textContent()).toBe('Paid from the island treasury.');
    expect(await page.locator('.recovery-repair').isEnabled()).toBe(true);
    await page.locator('.recovery-repair').click();
    expect(await page.evaluate(() => window.repairClick.expectedWindow)).toBe('reserved_wave');
    if (process.env.MP_ECO_REPAIR_CAPTURE_DIR) await page.locator('.recovery-card').screenshot({
      path: `${process.env.MP_ECO_REPAIR_CAPTURE_DIR}/shared-repair-desktop.png`,
    });
    await page.setViewportSize({width: 375, height: 812});
    await page.evaluate(() => window.drawRepair({available: '3'}));
    expect(await page.locator('.recovery-repair').isDisabled()).toBe(true);
    expect(await page.locator('.recovery-funds').textContent()).toBe('Need 7 more available island coins.');
    expect(await page.locator('.recovery-repair').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.recovery-card').evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(375);
    if (process.env.MP_ECO_REPAIR_CAPTURE_DIR) await page.locator('.recovery-card').screenshot({
      path: `${process.env.MP_ECO_REPAIR_CAPTURE_DIR}/shared-repair-phone.png`,
    });
    await page.evaluate(() => window.drawRepair({reserved: false}));
    expect(await page.locator('.recovery-repair, .recovery-free, .recovery-helper, .recovery-status').count()).toBe(0);
    expect(await page.locator('.recovery-hp').textContent()).toBe('0 / 60 HP');
  });
});
