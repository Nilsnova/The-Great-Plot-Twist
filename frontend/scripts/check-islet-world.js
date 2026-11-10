// Checks that home-islet scenery follows only the islet_changed world event.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { startFromTitle } from './shell-browser-tools.js';
import { openWorldBrowser, settle, measure } from './world-browser-tools.js';

const env = await openWorldBrowser(), { page } = env;
const report = { checked: new Date().toISOString(), checks: [], captures: {}, measurements: {}, errors: [], external: [] };
const check = (ok, label) => { assert.ok(ok, label); report.checks.push(label); console.log(`✓ ${label}`); };
const capture = async name => {
  const path = `captures/20261106_G8-Islet-World-${name}.png`;
  await page.screenshot({ path, fullPage: true }); report.captures[name] = path;
};
try {
   await page.goto(env.url); await startFromTitle(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => window.__island.world.goTo('home_islet', { fast: true })); await settle(page);
  check(await page.evaluate(() => {
    const meshes = window.__island.world.current.group.children;
    const visible = id => meshes.find(mesh => mesh.userData.asset === id && mesh.visible);
    return !!visible('cabin') && !visible('workshop') && !visible('windmill') && !visible('greenhouse') && !visible('islet-signal-station');
  }), 'Only the cabin is shown before a good islet_changed answer');
  await page.evaluate(() => { window.__island.settings.hour = 12; }); await settle(page);
  await page.evaluate(() => window.__island.emit({ type: 'islet_changed', built: ['plot_1', 'plot_2', 'islet_signal_station'], signalStationBuilt: true }));
  await settle(page);
  check(await page.evaluate(() => {
    const meshes = window.__island.world.current.group.children;
    const visible = id => meshes.some(mesh => mesh.userData.asset === id && mesh.visible);
    return visible('cabin') && visible('workshop') && visible('islet-signal-station') && !visible('islet-signal-station-lit') &&
      !visible('windmill') && !visible('greenhouse');
  }), 'Built plots appear, locked plots stay hidden, and only the unlit station sprite appears by day');
  await capture('built-day-1280'); report.measurements.day1280 = await measure(page);
  await page.evaluate(() => { window.__island.settings.hour = 0; }); await settle(page);
  check(await page.evaluate(() => {
    const meshes = window.__island.world.current.group.children;
    return meshes.some(mesh => mesh.userData.asset === 'islet-signal-station' && !mesh.visible) &&
      meshes.some(mesh => mesh.userData.asset === 'islet-signal-station-lit' && mesh.visible);
  }), 'Built station switches to its lit sprite at night');
  await capture('built-night-1280'); report.measurements.night1280 = await measure(page);
  await page.evaluate(()=>{const g=window.__island;g.player.position.set(3,1.03,-14);g.view.setPlace('home_islet',g.player.position);});await settle(page);
  await capture('station-night-1280');
  await page.setViewportSize({ width: 375, height: 667 }); await settle(page);
  await capture('built-night-375'); report.measurements.night375 = await measure(page, 45);
  await page.setViewportSize({ width: 1280, height: 800 }); await settle(page);
  await page.evaluate(() => window.__island.emit({ type: 'islet_changed', built: ['plot_1'], signalStationBuilt: false })); await settle(page);
  check(await page.evaluate(() => {
    const meshes = window.__island.world.current.group.children;
    return meshes.some(mesh => mesh.userData.asset === 'workshop' && !mesh.visible) &&
      meshes.some(mesh => mesh.userData.asset === 'islet-signal-station' && !mesh.visible) &&
      meshes.some(mesh => mesh.userData.asset === 'islet-empty-plot' && mesh.visible) &&
      meshes.some(mesh => mesh.userData.asset === 'islet-locked-sign' && mesh.visible);
  }), 'Empty and locked plot markers replace scenery after the event removes a build');
  await page.evaluate(() => window.__island.world.goTo('saltreach_harbor', { fast: true })); await settle(page);
  await page.evaluate(() => window.__island.emit({ type: 'islet_changed', built: ['plot_1', 'plot_2'], signalStationBuilt: false }));
  await page.evaluate(() => window.__island.world.goTo('home_islet', { fast: true })); await settle(page);
  check(await page.evaluate(() => window.__island.world.current.group.children.some(mesh => mesh.userData.asset === 'workshop' && mesh.visible)),
    'Latest islet state remains available after leaving and returning');
  check(env.errors.length === 0 && env.external.length === 0, 'No browser errors or external requests');
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  report.errors = env.errors; report.external = env.external;
  await writeFile('captures/20261106_G8-Islet-World-Checks.json', JSON.stringify(report, null, 2));
  await env.close();
}
