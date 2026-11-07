import {stubOfflineApi} from './api-browser-fixture.js';
import {readHttp} from './http-read.js';
import {startFromTitle,closeSettings} from './shell-browser-tools.js';
// Live data is isolated by a deterministic fixture in these presentation checks.
import {stubWeather} from './weather-browser-fixture.js';
// Real-browser smoke checks using an installed Chrome. Saves review screenshots.
import { stubIntro,dismissIntro } from './intro-browser-fixture.js';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let executablePath;
for (const path of candidates) { try { await access(path); executablePath = path; break; } catch { /* Try the next browser. */ } }
if (!executablePath) throw new Error('Install Chrome or set CHROME_PATH to its executable. No browser is downloaded.');
const url = process.env.TEST_URL || 'http://127.0.0.1:5174';
const server = process.env.TEST_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { stdio: 'pipe' });
let browser;
const report = { checked: new Date().toISOString(), browser: '', viewport: '1440 × 900, DPR 1', modes: {}, checks: [] };
const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).replaceAll('-', '');
const prefix = process.env.CAPTURE_PREFIX || 'Illustrated';
const check = (condition, label) => { assert.ok(condition, label); report.checks.push(label); };
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await readHttp(url)).ok) break; } catch { /* Wait for Vite to start. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ executablePath, headless: true }); report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!request.url().startsWith(url) && !request.url().startsWith('data:')) external.push(request.url()); });
  await stubOfflineApi(page);await stubWeather(page); await stubIntro(page);
  await page.goto(url);await startFromTitle(page);await page.waitForFunction(() => window.__island?.renderer.info.render.frame > 5);
  await page.waitForTimeout(1500); // Let shaders and the first shadow map warm up.
  await mkdir('captures', { recursive: true });
  const capture = name => page.screenshot({ path: `captures/${stamp}_${prefix}-${name}.png` });
  await capture('Arrival');
  async function measure(name, targetPage = page) {
    await targetPage.waitForTimeout(300);
    const stats = await targetPage.evaluate(async () => {
      const game = window.__island, samples = [], start = performance.now();
      for (let i = 0; i < 90; i++) { await new Promise(requestAnimationFrame); samples.push({ ...game.renderer.info.render }); }
      return { fps: Math.round(90000 / (performance.now() - start)),
        calls: Math.max(...samples.map(sample => sample.calls)),
        triangles: Math.max(...samples.map(sample => sample.triangles)),
        points: Math.max(...samples.map(sample => sample.points)),
        nativeFramebuffer: [game.renderer.domElement.width, game.renderer.domElement.height],
        integerUpscale: game.renderer.userData.pixelScale,
        devicePixelRatio, pixelRatio: game.renderer.getPixelRatio(), shadows: game.renderer.shadowMap.enabled };
    });
    report.modes[name] = stats;
    check(stats.calls < 150 && stats.triangles < 150000 && stats.pixelRatio <= 1.5, `${name} stays within rendering budgets`);
  }
  await measure('arrival-high');
  await page.keyboard.press('Escape');
  check(await page.locator('.shell-screen[data-mode=pause]').isVisible(),'Escape opens the pause menu');
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  const initial = await page.evaluate(() => ({ ...window.__island.player.position }));
  await page.keyboard.down('KeyW');
  await page.waitForFunction(start => Math.hypot(window.__island.player.position.x - start.x,
    window.__island.player.position.z - start.z) > 0.5, initial, { timeout: 2500 });
  await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => ({ ...window.__island.player.position }));
  check(Math.hypot(moved.x - initial.x, moved.z - initial.z) > 0.5, 'W walks the explorer');
  const cameraBefore = await page.evaluate(() => ({ zoom: window.__island.camera.zoom, rotation: window.__island.camera.quaternion.toArray() }));
  await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(1050, 490, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, -250); await page.waitForTimeout(400);
  const cameraAfter = await page.evaluate(() => ({ zoom: window.__island.camera.zoom, rotation: window.__island.camera.quaternion.toArray() }));
  check(cameraAfter.zoom > cameraBefore.zoom && cameraAfter.rotation.every((value, i) => value === cameraBefore.rotation[i]), 'Wheel zoom works while the pixel camera keeps its fixed angle');
  const events = await page.evaluate(async () => {
    const { zones } = await import('/src/world/zones.js'); window.__received = [];
    window.__island.on('interact', event => window.__received.push(event));
    return zones;
  });
  for (const [index, zone] of events.entries()) {
    // The cottage doorway now enters its room automatically; its outside E zone is still available.
    await page.evaluate(zone => {const game=window.__island,z=zone.id==='cottage'?7:zone.z;
      game.player.position.set(zone.x,zone.id==='cottage'?game.world.current.groundHeight(zone.x,z):zone.y,z);}, zone);
    await page.waitForFunction(id => document.querySelector('.interact')?.dataset.zone === id, zone.id);
    await page.keyboard.down('KeyE');
    await page.waitForFunction(count => window.__received.length >= count, index + 1);
    await page.waitForTimeout(180); await page.keyboard.up('KeyE'); await dismissIntro(page);
  }
  const received = await page.evaluate(() => window.__received);
  check(received.length === 4 && received.every((event, index) => event.type === 'interact' && event.id === events[index].id), `All four hooks emit exactly once per held E press: ${JSON.stringify(received)}`);
  await page.evaluate(() => { const game = window.__island; game.player.position.set(-7, 4, 7); });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  await dismissIntro(page);
  await page.waitForFunction(() => document.querySelector('.toast').hidden);
  await capture('Exploration');
  await page.evaluate(() => { window.__island.player.position.set(-1, 0, 10);
    window.__island.view.overview(); window.__island.settings.hour = 0;
    window.__island.setWeather({ cloudCover: 0, rain: 0, fog: 0.1, wind: 0.2 }); });
  await measure('midnight-high'); await capture('Midnight');
  await page.keyboard.press('Digit3'); await measure('storm-high'); await capture('Storm');
  await page.keyboard.press('Digit4'); await measure('fog-high');
  await page.evaluate(() => { window.__island.settings.hour = 12;
    window.__island.setWeather({ cloudCover: 0.05, rain: 0, fog: 0.05, wind: 0.12 }); });
  await measure('noon-high'); await capture('Daylight');
  await page.evaluate(() => { window.__island.settings.hour = 18.4; });
  await measure('dusk-high'); await capture('Dusk');
  await page.getByRole('button', { name: 'Open visual settings' }).click();
  await page.evaluate(()=>window.__island.setWeather({fog:1,rain:0}));
  await page.locator('[data-preference=quality]').selectOption('low'); await measure('fog-low');
  await page.evaluate(()=>window.__island.setWeather({fog:0.38,rain:1,wind:1})); await measure('storm-low');
  check(!report.modes['fog-low'].shadows && report.modes['fog-low'].pixelRatio <= 1, 'Low quality preserves the native pixel grid and reduces effect density');
  await page.locator('[data-preference=quality]').selectOption('high'); await page.keyboard.press('Tab');
  await page.locator('[data-preference=quality]').focus();await closeSettings(page,{keyboard:true});
  check(await page.locator('.shell-screen').isHidden(), 'Escape closes settings while a form control has focus');
  check(external.length === 0, 'The game makes no external network requests');
  check(errors.length === 0, `No browser or WebGL errors (${errors.join('; ')})`);
  await page.close(); // Benchmark one WebGL page at a time on the same GPU.
  const retina = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await stubOfflineApi(retina);await stubWeather(retina);await stubIntro(retina);await retina.goto(url);await startFromTitle(retina);await retina.waitForTimeout(1200);
  await measure('retina-high', retina); await retina.screenshot({ path: `captures/${stamp}_${prefix}-Retina.png` });
  await retina.evaluate(() => window.__island.quality('low')); await measure('retina-low', retina);
  check(report.modes['retina-high'].pixelRatio === 1 && report.modes['retina-low'].pixelRatio === 1,
    'Pixel renderer uses a DPR-independent native buffer in both qualities');
  await writeFile(`captures/${stamp}_${prefix}-Retina-Checks.json`, JSON.stringify({
    checked: new Date().toISOString(), viewport: '1440 × 900, device DPR 2',
    high: report.modes['retina-high'], low: report.modes['retina-low'],
  }, null, 2) + '\n');
  await writeFile(`captures/${stamp}_${prefix}-Browser-Checks.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); server?.kill(); }
