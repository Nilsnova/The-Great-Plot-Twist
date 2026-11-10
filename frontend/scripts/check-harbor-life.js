// Checks ambient place life, semantic sound cues and place resource cleanup in Chrome.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { harborCueVolumes } from '../src/audio/logic.js';
import { startFromTitle } from './shell-browser-tools.js';
import { measure, openWorldBrowser, settle } from './world-browser-tools.js';

const env = await openWorldBrowser(), { page } = env;
const report = { checked: new Date().toISOString(), checks: [], captures: {}, trips: [], audioCues: [], errors: [], external: [], cueVolumes: harborCueVolumes };
const check = (ok, label) => { assert.ok(ok, label); report.checks.push(label); console.log(`✓ ${label}`); };
const capture = async name => {
  const path = `captures/20261106_G8-Harbor-Life-${name}.png`;
  await page.screenshot({ path, fullPage: true }); report.captures[name] = path;
};
const go = async place => {
  await page.evaluate(id => window.__island.world.goTo(id, { fast: true }), place);
  await page.waitForFunction(id => window.__island.world.current?.id === id, place);
  await settle(page);
};
const captionIs = async text => {
  await page.waitForFunction(value => document.querySelector('.sound-caption')?.textContent === value, text, { timeout: 5000 });
  report.audioCues.push(text);
};

try {
   await page.goto(env.url); await page.setViewportSize({ width: 1280, height: 800 });
  await startFromTitle(page);
  await page.evaluate(() => window.__island.settings.hour = 0);
  await page.evaluate(() => window.__island.isletState.previewBuilt(['plot_1', 'plot_4', 'islet_signal_station']));
  await go('home_islet');
  check(await page.evaluate(() => {
    const meshes = window.__island.world.current.group.children, byName = name => meshes.find(mesh => mesh.userData.ambientLife === name);
    return byName('cabin-smoke')?.visible && byName('greenhouse-birds')?.visible && byName('cabin-window')?.material.opacity > 0;
  }), 'Cabin smoke, built greenhouse birds and the night window appear on the home islet');
  await capture('home-islet-night');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const stillBefore = await page.evaluate(() => ['cabin-smoke', 'greenhouse-birds'].map(name => {
    const mesh = window.__island.world.current.group.children.find(item => item.userData.ambientLife === name);
    return mesh.position.toArray();
  }));
  await page.waitForTimeout(300);
  const stillAfter = await page.evaluate(() => ['cabin-smoke', 'greenhouse-birds'].map(name => {
    const mesh = window.__island.world.current.group.children.find(item => item.userData.ambientLife === name);
    return mesh.position.toArray();
  }));
  check(JSON.stringify(stillBefore) === JSON.stringify(stillAfter), 'Ambient motion becomes still under reduced motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.waitForFunction(() => window.__island.audio.state === 'running', null, { timeout: 10000 });
  for (const [event, expected] of [
    [{ type: 'bulletin_opened' }, 'Paper rustles on the harbor bulletin board'],
    [{ type: 'islet_build_raised', plot: 'islet_signal_station', preview: true }, 'A building settles into place'],
  ]) {
    await page.evaluate(value => window.__island.emit(value), event); await captionIs(expected);
  }
  await page.evaluate(() => window.__island.audio.update(0, { place: 'home_islet', active: false, night: 1,
    isletBuilt: ['plot_1', 'islet_signal_station'], bulletin: { status: 'ready', chapterTwoHook: { notice: { title: 'Test' } } } }));
  await captionIs('A faint tone carries from far out at sea');
  await page.evaluate(() => window.__island.audio.update(27, { place: 'saltreach_harbor', active: true, night: .8,
    weather: { fog: 1, wind: .4, rain: 0 }, weatherAnswer: { state: 'calm', tonight: { isFogNight: true } },
    bulletin: { status: 'ready', weather: { tonight: { state: 'fog', isFogNight: true } } } }));
  await captionIs('Lighthouse foghorn · a low call across the water');
  await page.evaluate(() => window.__island.audio.update(16, { place: 'saltreach_harbor', active: true, night: .8,
    weather: { fog: 0, wind: 1, rain: 0 }, weatherAnswer: { state: 'storm', tonight: { isFogNight: false } },
    bulletin: { status: 'ready', weather: { tonight: { state: 'storm', isFogNight: false } } } }));
  await captionIs('A flag snaps in the storm wind');
  check(Math.max(...Object.values(harborCueVolumes)) <= .035 && harborCueVolumes.stationHum < .01,
    'New one-shot sounds and continuous station hum use bounded low gains');

  await page.evaluate(() => window.__island.setWeather({ wind: 0, rain: 0, fog: 0 }));
  await go('saltreach_harbor');
  check(await page.evaluate(() => window.__island.world.current.group.children.find(mesh => mesh.userData.ambientLife === 'harbor-gulls')?.visible),
    'Extra harbor gulls appear on a clear day');
  await capture('harbor-clear-day');
  const harborBase = await measure(page, 45);
  for (let trip = 1; trip <= 3; trip++) {
    await go('home_islet'); const home = await measure(page, 45);
    await go('saltreach_harbor'); const harbor = await measure(page, 45);
    report.trips.push({ trip, home, harbor });
  }
  const harborEnd = await measure(page, 45);
  check(report.trips.every(item => item.home.roots === 1 && item.harbor.roots === 1) && harborBase.roots === 1 && harborEnd.roots === 1,
    'Three home-islet and harbor trips retain one active place root');
  check(report.trips.at(-1).harbor.geometries === harborBase.geometries && report.trips.at(-1).harbor.textures === harborBase.textures,
    'Three trips return to the same harbor geometry and texture counts');
  check(env.errors.length === 0 && env.external.length === 0, 'No browser errors or external requests');
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  report.errors = env.errors; report.external = env.external;
  await writeFile('captures/20261106_G8-Harbor-Life-Checks.json', JSON.stringify(report, null, 2));
  await env.close();
}
