import {startFromTitle,closeSettings} from './shell-browser-tools.js';
// Exercise every real place, accessible chart travel and ten round trips in Chrome.
import {BOARD as sportsBoard} from '../tests/sports/sample-answers.js';
import { stubIntro,dismissIntro } from './intro-browser-fixture.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { placeIds, places } from '../src/world/places/registry.js';
import { openWorldBrowser, settle, measure, explorerVisible } from './world-browser-tools.js';
const env = await openWorldBrowser(), { page } = env;
const report = { checked: new Date().toISOString(), browser: env.browser.version(), viewport: '1440 × 900, DPR 1', checks: [], places: {}, roundTrips: [] };
const check = (ok, label) => { assert.ok(ok, label); report.checks.push(label); };
const captureRoot = process.env.CAPTURE_DIR || 'captures';
await mkdir(captureRoot, {recursive:true});
const capture = name => page.screenshot({ path: `${captureRoot}/20261105_World-${name}.png` });
const go = async id => { await page.evaluate(id => window.__island.world.goTo(id, { fast: true }), id); await settle(page); };
// The four home plots open the islet panel (package L2) after a lazy import. Close it before
// dismissIntro looks once, or the panel opens late and swallows the next hotspot's E. The signal
// station's hotspot opens the finale screen instead, which dismissIntro closes.
const panels = { plot_1: '.islet-modal', plot_2: '.islet-modal', plot_3: '.islet-modal', plot_4: '.islet-modal', market_hall: '.market-modal', prediction_kiosk: '.desk-modal', sports_pavilion: '.sports-modal', arena_gate: '.duel-modal' };
const closePanel = async id => { const panel = page.locator(panels[id]); await panel.waitFor({ state: 'visible' }); await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' }); };
try {
  // Presentation proof uses a fictional sports board; provider/auth semantics have their own gate.
  await page.route('**/api/sports',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(sportsBoard)}));
  await stubIntro(page);await page.goto(env.url + '?market=local&desk=local&arena=local');await startFromTitle(page);
  await page.evaluate(() => {
    window.__worldEvents = [];
    for (const type of ['travel', 'arrived', 'interact', 'plot_clicked']) window.__island.on(type, e => window.__worldEvents.push(e));
  });
  await page.keyboard.press('KeyM'); await page.locator('.sea-chart').waitFor({ state: 'visible' }); await capture('Sea-Chart');
  check(await page.locator('[data-place=gulls_rest]').getAttribute('aria-disabled') === 'true', 'Uncharted Gull’s Rest is locked');
  await page.locator('[data-place=gulls_rest]').focus(); await page.keyboard.press('Enter');
  check(await page.evaluate(() => window.__worldEvents.length === 0 && window.__island.world.current.id === 'lighthouse_isle'), 'Locked chart selection emits nothing and preserves the place');
  await page.locator('[data-place=lighthouse_isle]').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await page.locator('.sailing').waitFor({ state: 'visible' }); await page.waitForTimeout(200); await capture('Sailing');
  check(await page.evaluate(() => window.__island.world.current === null && window.__island.scene.children.filter(o => o.name.startsWith('place:')).length === 0), 'Only the passage is in memory during travel');
  await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__island.world.current?.id === 'saltreach_harbor'); await settle(page);
  check(await page.evaluate(() => JSON.stringify(window.__worldEvents.slice(-2)) === JSON.stringify([{ type: 'travel', to: 'saltreach_harbor' }, { type: 'arrived', place: 'saltreach_harbor' }])), 'Keyboard chart travel and skip emit exact travel and arrival payloads');
  await page.evaluate(() => { window.__island.settings.hour = 0; }); await settle(page); await capture('Harbor-Office-Night');
  check(await page.evaluate(() => {
    const g = window.__island, glow = g.world.current.group.children.find(o => o.userData.asset === 'harbour-office-glow');
    const p = glow.position.clone().set(-5.9, -4.495, 0).project(g.camera);
    return glow.material.opacity > .8 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
  }), 'The lit office window is visible from the dock spawn at night');
  await page.evaluate(() => { window.__island.settings.hour = 12; });
  for (const id of placeIds.filter(id => id !== 'gulls_rest')) {
    await go(id);
    // The optional bulletin has its own enabled-state browser check.
    const availableZones=places[id].zones.filter(zone=>zone.id!=='bulletin_board');
    check(await page.evaluate(zones=>JSON.stringify(window.__island.world.current.zones)===JSON.stringify(zones),availableZones), `${id}: only enabled hotspots are offered`);
    for (const zone of availableZones) {
      // Full-room inspection, legal story navigation and both endings are exercised by check-intro.
      if(id==='lighthouse_isle'&&['cottage','desk','shore','tower_door'].includes(zone.id))continue;
      await page.evaluate(z => { window.__island.player.position.set(z.x, z.y, z.z); }, zone);
      await page.waitForFunction(id => document.querySelector('.interact').dataset.zone === id, zone.id);
      const before = await page.evaluate(() => window.__worldEvents.filter(e => e.type === 'interact').length);
      await page.keyboard.down('KeyE'); await page.waitForTimeout(100); await page.keyboard.up('KeyE'); if (panels[zone.id]) await closePanel(zone.id); await dismissIntro(page);
      check(await page.evaluate(({ before, id, place }) => {
        const events = window.__worldEvents.filter(e => e.type === 'interact');
        return events.length === before + 1 && JSON.stringify(events.at(-1)) === JSON.stringify({ type: 'interact', id, place });
      }, { before, id: zone.id, place: id }), `${id}/${zone.id}: exact event, once per held E`);
    }
    await page.evaluate(() => { window.__island.player.position.set(0, 1.03, 3); }); await page.waitForTimeout(750);
    report.places[id] = await measure(page);
    check(await explorerVisible(page), `${id}: explorer visible on the path`); await capture(id);
    check(report.places[id].calls < 150 && report.places[id].triangles < 150000, `${id} within rendering budget`);
    if (id === 'home_islet') {
      const point = await page.evaluate(() => {
        const g = window.__island, p = g.camera.position.clone().set(-8, -2 * .72, 0).project(g.camera), r = g.renderer.domElement.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
      });
      const before = await page.evaluate(() => window.__worldEvents.filter(e => e.type === 'plot_clicked').length);
      await page.mouse.click(point.x, point.y); await settle(page);
      check(await page.evaluate(before => {
        const events = window.__worldEvents.filter(e => e.type === 'plot_clicked');
        return events.length === before + 1 && JSON.stringify(events.at(-1)) === JSON.stringify({ type: 'plot_clicked', plot: 'plot_1' });
      }, before), 'Pointer selection emits the exact plot payload');
    }
  }
  await page.evaluate(() => window.__island.world.setRelightingComplete(true)); await go('gulls_rest');
  check(await page.evaluate(() => window.__island.world.current.id === 'gulls_rest'), 'The integration gate opens Gull’s Rest'); await capture('gulls_rest');
  await page.evaluate(() => window.__island.world.setRelightingComplete(false));
  await go('lighthouse_isle'); report.before = await measure(page);
  for (let i = 0; i < 10; i++) { await go('saltreach_harbor'); await go('lighthouse_isle'); report.roundTrips.push(await measure(page, 4)); }
  report.after = await measure(page);
  check(report.roundTrips.every(s => s.geometries === report.before.geometries && s.textures === report.before.textures && s.roots === 1 && s.objects === report.before.objects), 'Ten round trips retain exactly the same resource and object counts');
  check(report.after.calls < 150 && report.after.triangles < 150000 && report.after.fps >= 30, 'After ten round trips: FPS and rendering within budget');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedStart = Date.now(); await page.evaluate(() => window.__island.world.goTo('home_islet')); await settle(page);
  report.reducedMotionMs = Date.now() - reducedStart;
  check(report.reducedMotionMs < 1500 && await page.locator('.sailing').isHidden(), 'Reduced motion skips sailing');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.evaluate(() => window.__island.quality('low'));
  await page.evaluate(() => {
    const fade=document.querySelector('.arrival-fade');window.__sawLowFade=false;
    const observer=new MutationObserver(()=>{if(!fade.hidden){window.__sawLowFade=true;observer.disconnect();}});
    observer.observe(fade,{attributes:true,attributeFilter:['hidden','style']});
    window.__lowTrip=window.__island.world.goTo('saltreach_harbor');
  });
  await page.waitForFunction(() => window.__island.world.current?.id === 'saltreach_harbor');
  check(await page.locator('.sailing').isHidden() && await page.evaluate(()=>window.__sawLowFade), 'Low quality reveals the landing through a flat fade');
  await page.locator('.arrival-fade').waitFor({state:'hidden'});
  await page.evaluate(() => { window.__island.quality('high'); window.__island.setWeather({ wind: 1 }); window.__trip = window.__island.world.goTo('wreck_point'); });
  const passageStart = Date.now(); await page.waitForFunction(() => window.__island.world.current?.id === 'wreck_point'); report.windOnePassageMs = Date.now() - passageStart;
  check(report.windOnePassageMs > 3000 && report.windOnePassageMs < 7500, 'Unskipped wind-driven passage lasts about five seconds');
  report.errors = env.errors; report.externalRequests = env.external;
  check(env.errors.length === 0, 'No browser errors'); check(env.external.length === 0, 'No external requests');
  console.log(JSON.stringify(report, null, 2));
} finally { await writeFile(`${captureRoot}/20261105_World-Checks.json`, JSON.stringify(report, null, 2)); await env.close(); }
