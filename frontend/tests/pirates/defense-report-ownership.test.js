import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
import {CARDS} from '../../src/tutorial/unlock-cards.js';
const browser = browserHarness();

const clearOwners = {report: false, island: false, village: false, tutorial: false, guide: false, queued: 0,
  classDemo: false, shell: false, market: false, sports: false, chart: false, sailing: false, worldBusy: false,
  captainDown: false, dialogs: 0, quality: 'high'};
const inputOwners = page => page.evaluate(() => {
  const g = window.__island, t = g.tutorials;
  return {report: g.waves.reportActive, island: g.island.active, village: g.island.managing,
    tutorial: t.active, guide: t.guide !== null, queued: t.queue.length, classDemo: !!g.classDemo?.active,
    shell: !!g.shell.blocked, market: !!g.marketUi?.active, sports: !!g.sportsUi.active,
    chart: !!g.chart.open, sailing: !!g.sailing.active, worldBusy: !!g.world.busy,
    captainDown: !!g.waves.island.captainDown, dialogs: document.querySelectorAll('dialog[open]').length, quality: g.settings.quality};
});

async function settleUnlocks(page) {
  // Consume the real campaign change before testing calm: an empty old queue is not readiness.
  await page.evaluate(() => window.__island.tutorials.update(0));
  await page.waitForFunction(() => {
    const t = window.__island.tutorials, memory = JSON.parse(localStorage.getItem('tgpt:tutorials:v1'));
    // active includes cardLoading, so a late card import cannot count as ready.
    return memory?.games?.[t.code]?.wave === 30 && !t.active && t.queue.length === 0
      && !document.querySelector('dialog.unlock-card[open]');
  });
}

it('the actual game blocks keyboard and gamepad movement while the report owns input', async () => {
  await browser.withPage(async (page, base) => {
    // A veteran device has seen actual cards through wave30, including previous flag variants.
    await page.addInitScript(seen => {
      localStorage.setItem('plot_twist_front_door_v1', '1'); localStorage.setItem('plot_twist_island_arrival_v1', '1');
      localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen, games: {}}));
      window.reportPad = {id: 'report-pad', connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({length: 16}, () => ({pressed: false}))};
      Object.defineProperty(navigator, 'getGamepads', {value: () => [window.reportPad]});
    }, CARDS.filter(card => card.wave <= 30).map(card => card.id));
    await page.goto(`${base}/?islands=fake&fakeplayer=coc39-input`);
    await page.locator('#play').click();
    await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    await page.locator('.island-card-lobby[open]').getByRole('button', {name: 'Start', exact: true}).click();
    await page.waitForFunction(() => window.__island?.waves && !document.querySelector('dialog[open]'));
    await page.addScriptTag({type: 'module', content: 'window.g20Import = path => import(path);'});
    await page.waitForFunction(() => !!window.g20Import);
    await page.evaluate(async () => {
      const g = window.__island; g.island.dev.setWaveBest(30); g.island.dev.setCoins(5000); await g.island.load();
      await g.island.api.build({spot: 'cannon_1', kind: 'cannon'});
      for (let i = 0; i < 4; i++) await g.island.api.upgrade({spot: 'cannon_1'});
      await g.island.load();
      const {setWaveFinisher} = await window.g20Import('/src/island/wave-hooks.js');
      setWaveFinisher(async () => ({ok: true, data: {loot: 0}})); // No backend payout in this input fixture.
    });
    await settleUnlocks(page);
    expect(await inputOwners(page)).toEqual(clearOwners);
    await page.evaluate(() => {
      const g = window.__island;
      g.emit({type: 'wave_started_server', waveId: 'input-report', wave: 1, seed: 77, startsAt: new Date(Date.now() - 300000).toISOString()});
      for (let i = 0; i < 100 && !g.waves.island.wave?.done; i++) g.waves.pirates.update(.1);
      const zone = g.world.current.zones.find(item => item.id === 'cannon_3'); g.player.position.set(zone.x, zone.y, zone.z);
      g.renderer.domElement.focus();
    });
    await page.evaluate(async () => {
      const {menuExtras} = await window.g20Import('/src/shell/menu-extras.js');
      const entry = menuExtras().find(item => item.label === 'Last defense report');
      if (!entry) throw new Error('The real completed-wave report is unavailable'); entry.onSelect();
    });
    const frames = () => page.evaluate(() => new Promise(resolve => {
      let left = 12; const step = () => --left ? requestAnimationFrame(step) : resolve(); requestAnimationFrame(step);
    }));
    const position = () => page.evaluate(() => { const p = window.__island.player.position; return {x: p.x, z: p.z}; });
    expect(await page.evaluate(() => window.__island.waves.reportActive)).toBe(true);
    // world.busy includes isBlocked(); it is a derived report-blocking flag, not another owner.
    expect(await inputOwners(page)).toEqual({...clearOwners, report: true, worldBusy: true, dialogs: 1});
    expect(await page.getByRole('dialog', {name: 'Last defense report', exact: true}).count()).toBe(1);
    const before = await position();
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyA'})); window.reportPad.axes[0] = -1; });
    await frames(); expect(await position()).toEqual(before);
    await page.getByRole('button', {name: 'Close dialog', exact: true}).click();
    expect(await page.evaluate(() => window.__island.waves.reportActive)).toBe(false);
    expect(await inputOwners(page)).toEqual(clearOwners);
    await frames(); expect((await position()).x).toBeLessThan(before.x - .01);
    await page.evaluate(() => { window.reportPad.axes[0] = 0; window.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyA'})); });
    expect(await inputOwners(page)).toEqual(clearOwners);
  });
});
