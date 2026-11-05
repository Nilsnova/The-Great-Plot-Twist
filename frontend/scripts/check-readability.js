import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle,closeSettings} from './shell-browser-tools.js';
// Check readable DOM text and panel bounds at laptop and large-desktop resolutions.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openWorldBrowser, settle } from './world-browser-tools.js';
const env = await openWorldBrowser(), { page } = env;
const report = { checked: new Date().toISOString(), viewports: [] };
try {
  await stubIntro(page);await page.goto(env.url);await startFromTitle(page);
  await page.evaluate(async () => { await window.__island.world.goTo('saltreach_harbor', { fast: true }); window.__island.player.position.set(-8,1.03,10.3); window.__island.settings.hour = 12; });
  for (const [width, height] of [[1365,768],[1920,1080],[1100,700]]) {
    await page.setViewportSize({ width, height }); await settle(page);
    const fonts = await page.evaluate(() => Object.fromEntries(['.wordmark','.chapter','.controls','.conditions','.interact strong'].map(selector => [selector, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])));
    assert.ok(Object.values(fonts).every(size => size >= 14), 'Primary game labels are at least 14 CSS px');
    await page.screenshot({ path:`captures/20261105_World-Readable-${width}.png` });
    await page.keyboard.press('KeyM'); await page.locator('.sea-chart').waitFor({ state:'visible' });
    const chart = await page.locator('.sea-chart').evaluate(dialog => {
      const nodes = [...dialog.querySelectorAll('[data-place] span')];
      const labels = nodes.map(node => { const r=node.getBoundingClientRect(); return { id:node.closest('button').dataset.place,size:parseFloat(getComputedStyle(node).fontSize),left:r.left,top:r.top,right:r.right,bottom:r.bottom }; });
      return { labels, overflow:dialog.scrollWidth > dialog.clientWidth + 1 };
    });
    await page.screenshot({ path:`captures/20261105_World-Readable-Chart-${width}.png` });
    assert.ok(chart.labels.every(label => label.size >= 16 && label.right > label.left && label.bottom > label.top), 'Chart place names are at least 16 CSS px');
    assert.equal(chart.overflow, false, 'Chart has no horizontal overflow');
    for (const [i,a] of chart.labels.entries()) for (const b of chart.labels.slice(i+1)) assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `Chart labels do not overlap: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    await page.screenshot({ path:`captures/20261105_World-Readable-Chart-${width}.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name:'Open visual settings' }).click();
    const panel = await page.locator('.shell-screen').evaluate(node => { const r=node.getBoundingClientRect(); return { left:r.left,top:r.top,right:r.right,bottom:r.bottom }; });
    assert.ok(panel.left >= 0 && panel.top >= 0 && panel.right <= width && panel.bottom <= height, 'Settings fit the viewport');
    await closeSettings(page); report.viewports.push({ width,height,fonts,chart,panel });
  }
  assert.deepEqual(env.errors, []); report.errors = env.errors; console.log(JSON.stringify(report,null,2));
} finally { await writeFile('captures/20261105_World-Readability-Checks.json', JSON.stringify(report,null,2)); await env.close(); }
