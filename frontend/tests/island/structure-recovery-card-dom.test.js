// The integrated structure card view in a browser at desktop and phone widths.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

async function draw(page, viewport, row, state) {
  await page.setViewportSize(viewport);
  await page.evaluate(async ({row, state}) => {
    await window.g20Import('/src/ui/kit/kit.css');
    const {createIslandUi} = await window.g20Import('/src/island/ui.js');
    const {buildCardModel} = await window.g20Import('/src/island/card-model.js');
    window.repairIntent = null;
    window.recoveryUi = window.recoveryUi ?? createIslandUi({container: document.body});
    const kind = row.kind;
    const slot = kind === 'wall' ? 'wall' : 'tower';
    const spot = {id: row.spot, kind, built: true, level: row.level, cost: 30, upgradeCost: 60};
    window.recoveryUi.buildCard(buildCardModel({spotId: row.spot, slot, spot, coins: 100,
      recoveryState: state, recoveryStatus: 'ready'}), {repairStructure: (_spot, quote) => { window.repairIntent = quote; }});
  }, {row, state});
}

it('renders real structure cards and repair feedback at desktop and phone widths', async () => {
  await browser.withPage(async page => {
    const base = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: '22345678-1234-4234-8234-123456789abc', revision: 4,
      recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
      remainingPaidUses: null};
    const wall = {spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc', kind: 'wall', level: 1,
      hpUnits: 750000, maxHP: 60, rateUnitsPerSecond: 1666.67, estimatedFreeSeconds: 150, fixedPrice: 10, repairSeq: 0};
    await draw(page, {width: 1440, height: 900}, wall, {...base, structures: [wall]});
    expect(await page.locator('.recovery-hp').textContent()).toBe('45 / 60 HP');
    expect(await page.locator('.recovery-free').count()).toBe(0);
    expect(await page.locator('.recovery-helper').textContent()).toBe('All buildings are fully repaired when a wave ends.');
    expect(await page.locator('.recovery-repair').textContent()).toBe('Repair now: pay 10 coins');
    await page.locator('.recovery-repair').click();
    expect(await page.evaluate(() => window.repairIntent)).toMatchObject({spot: 'wall_1', quotedPrice: 10, expectedWindow: 'between_waves'});

    const cannon = {spot: 'cannon_1', instanceId: '42345678-1234-4234-8234-123456789abc', kind: 'cannon', level: 1,
      hpUnits: 0, maxHP: 80, rateUnitsPerSecond: 1666.67, estimatedFreeSeconds: 600, fixedPrice: 30, repairSeq: 0};
    const reserved = {...base, displayPhase: 'preparing', repairWindow: 'reserved_wave', waveId: '12345678-1234-4234-8234-123456789abc',
      remainingPaidUses: 2, structures: [cannon]};
    await draw(page, {width: 390, height: 844}, cannon, reserved);
    expect(await page.locator('.recovery-hp').textContent()).toBe('0 / 80 HP');
    expect(await page.locator('.recovery-marker').textContent()).toBe('!');
    expect(await page.locator('.recovery-free').count()).toBe(0);
    expect(await page.locator('.recovery-status').textContent()).toBe('No free repair during this wave. Full HP is restored when it ends.');
    expect(await page.locator('.recovery-quota').textContent()).toBe('2 shared Repair now uses left this wave');
    expect(await page.evaluate(() => {
      const button = document.querySelector('.recovery-repair'), bar = document.querySelector('.recovery-bar');
      const buttonBox = button.getBoundingClientRect();
      return {width: buttonBox.width, height: buttonBox.height, barWidth: bar.getBoundingClientRect().width,
        left: buttonBox.left, right: buttonBox.right, overflows: document.documentElement.scrollWidth > innerWidth};
    })).toMatchObject({width: expect.any(Number), height: expect.any(Number), overflows: false});
    expect(await page.locator('.recovery-repair').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await page.locator('.recovery-repair').evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(390);

    const harpoon = {spot: 'tower_1', instanceId: '52345678-1234-4234-8234-123456789abc', kind: 'harpoon', level: 1,
      hpUnits: 1, maxHP: 60, rateUnitsPerSecond: 1666.67, estimatedFreeSeconds: 600, fixedPrice: 40, repairSeq: 0};
    await draw(page, {width: 375, height: 812}, harpoon, {...base, structures: [harpoon]});
    expect(await page.locator('.recovery-hp').textContent()).toBe('0.00006 / 60 HP');
    expect(await page.locator('.health-fill').evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.recovery-repair').evaluate(node => node.getBoundingClientRect().right)).toBeLessThanOrEqual(375);
  });
});
