import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('the actual game blocks keyboard and gamepad movement while the report owns input', async () => {
  await browser.withPage(async (page, base) => {
    await page.addInitScript(() => {
      localStorage.setItem('plot_twist_front_door_v1', '1'); localStorage.setItem('plot_twist_island_arrival_v1', '1');
      window.reportPad = {id: 'report-pad', connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({length: 16}, () => ({pressed: false}))};
      Object.defineProperty(navigator, 'getGamepads', {value: () => [window.reportPad]});
    });
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
    const before = await position();
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyA'})); window.reportPad.axes[0] = -1; });
    await frames(); expect(await position()).toEqual(before);
    await page.getByRole('button', {name: 'Close dialog', exact: true}).click();
    expect(await page.evaluate(() => window.__island.waves.reportActive)).toBe(false);
    await frames(); expect((await position()).x).toBeLessThan(before.x - .01);
    await page.evaluate(() => { window.reportPad.axes[0] = 0; window.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyA'})); });
  });
});
