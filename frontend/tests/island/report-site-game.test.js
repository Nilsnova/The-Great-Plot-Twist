import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('selects only a verified current instance and cancels a late lookup after visiting', async () => {
  await browser.withPage(async (page, base) => {
    await page.addInitScript(() => {
      localStorage.setItem('plot_twist_front_door_v1', '1');
      localStorage.setItem('plot_twist_island_arrival_v1', '1');
      localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
    });
    await page.goto(`${base}/?islands=fake&fakeplayer=report-instance`);
    await page.locator('#play').click();
    await page.getByRole('button', {name: 'Create a game', exact: true}).click();
    await page.getByRole('button', {name: 'Start', exact: true}).click();
    await page.waitForFunction(() => window.__island?.waves && !document.querySelector('dialog[open]'));
    const outcomes = await page.evaluate(async () => {
      const island = window.__island.island, api = island.api;
      await api.build({spot: 'cannon_1', kind: 'cannon'});
      await island.load();
      const {id, kind, x, z} = island.defenses().find(item => item.id === 'cannon_1');
      const intent = {id, kind, x, z, identity: island.defenseReportIdentity,
        epoch: '8bb0a645-b352-4004-8887-30f8396f7852', instanceId: '22d9575e-a4e9-43c1-87a3-5159f66cbe13'};
      const writes = [];
      for (const name of ['build', 'upgrade', 'repairStructure', 'demolish']) {
        const send = api[name];
        api[name] = (...args) => { writes.push(name); return send(...args); };
      }
      const read = (changes = {}) => ({ok: true, data: {islandEpoch: intent.epoch,
        repairWindow: 'between_waves', structures: [{spot: id, kind, instanceId: intent.instanceId}], ...changes}});
      api.structureRecovery = async () => read();
      const verified = await island.resolveDefenseReport(intent);
      island.focusDefenseReport(intent, verified);
      const selected = island.selection, keyboardFocus = document.activeElement?.dataset.focus;

      api.structureRecovery = async () => read({structures: [{spot: id, kind, instanceId: 'replacement'}]});
      const replaced = await island.resolveDefenseReport(intent);
      island.focusDefenseReport(intent, replaced);
      const historic = island.selection;

      api.structureRecovery = async () => read({repairWindow: 'reserved_wave'});
      const reserved = await island.resolveDefenseReport(intent);
      api.structureRecovery = async () => read({islandEpoch: 'new-epoch'});
      const reset = await island.resolveDefenseReport(intent);

      let finish;
      api.structureRecovery = () => new Promise(resolve => { finish = resolve; });
      const pending = island.resolveDefenseReport(intent);
      island.visit('ISLE-TMP54');
      finish(read());
      const departed = await pending;
      return {verified, selected, keyboardFocus, replaced, historic, reserved, reset, departed, writes,
        afterTravel: island.selection, x, z};
    });
    expect(outcomes.verified).toEqual({spot: 'cannon_1'});
    expect(outcomes.selected).toMatchObject({spotId: 'cannon_1', x: outcomes.x, z: outcomes.z});
    expect(outcomes.keyboardFocus).toBe('details');
    expect(outcomes.replaced).toEqual({spot: null});
    expect(outcomes.historic).toEqual({positionOnly: true, x: outcomes.x, z: outcomes.z, lift: 1});
    expect(outcomes.reserved).toBe(null);
    expect(outcomes.reset).toBe(null);
    expect(outcomes.departed).toBe(null);
    expect(outcomes.afterTravel).toBe(null);
    expect(outcomes.writes).toEqual([]);
  });
}, 60000);
