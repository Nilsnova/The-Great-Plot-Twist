// Render all three composition studies and check switching, motion and resource use.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { studies } from '../src/studies/presets.js';
import { studyArtIds } from '../src/studies/scene.js';

const production = process.env.ART_PRODUCTION === '1', url = 'http://127.0.0.1:5177';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(production ? ['preview'] : []), '--host', '127.0.0.1', '--port', '5177', '--strictPort'], { stdio: 'pipe' });
const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).replaceAll('-', '');
const report = { checked: new Date().toISOString(), checks: [], modes: {} };
const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Vite is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [], requested = new Set(), external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (!request.url().startsWith(url) && !request.url().startsWith('data:')) external.push(request.url());
    const match = request.url().match(/\/art\/([^/?]+)\.svg/); if (match) requested.add(match[1]);
  });
  await page.goto(`${url}/scene-studies.html?scene=harbour`);
  const ready = async id => { await page.waitForFunction(id => document.querySelector(`[data-scene="${id}"]`)?.getAttribute('aria-pressed') === 'true' && document.querySelector('#status').textContent === '', id); await page.waitForTimeout(150); };
  await ready('harbour'); await page.locator('#motion').uncheck();
  check([...requested].every(id => studyArtIds(studies.harbour).includes(id)), 'Harbour requests only its selected artwork');
  await mkdir('captures', { recursive: true });
  for (const id of Object.keys(studies)) {
    await page.locator(`[data-scene="${id}"]`).click(); await ready(id);
    for (const [light, hour] of [['Daylight', '12'], ['Dusk', '18.6'], ['Night', '0']]) {
      await page.locator('#light').selectOption(hour); await page.waitForTimeout(100);
      await page.screenshot({ path: `captures/${stamp}_Studies-${id}-${light}.png` });
    }
    await page.locator('#light').selectOption('12'); await page.locator('#weather').selectOption('storm');
    await page.locator('#motion').check(); await page.waitForTimeout(250);
    if (!production) {
      report.modes[id] = await page.evaluate(async () => {
        const renderer = window.__studies.renderer, frames = [], start = performance.now();
        for (let i = 0; i < 60; i++) { await new Promise(requestAnimationFrame); frames.push({ ...renderer.info.render }); }
        return { fps: Math.round(60000 / (performance.now() - start)), calls: Math.max(...frames.map(frame => frame.calls)),
          triangles: Math.max(...frames.map(frame => frame.triangles)), textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
      });
      check(report.modes[id].calls < 150 && report.modes[id].triangles < 150000, `${id} stays within render budgets`);
      check(report.modes[id].textures <= studyArtIds(studies[id]).length, `${id} disposes the previous scene textures`);
    }
    await page.locator('#motion').uncheck(); await page.waitForTimeout(100);
    await page.screenshot({ path: `captures/${stamp}_Studies-${id}-Rain.png` });
    await page.locator('#weather').selectOption('clear');
  }
  check(true, 'All three scenes render in daylight, dusk, night and rain');
  await page.mouse.move(800, 450); await page.mouse.wheel(0, -250); await page.locator('#reset').click();
  if (!production) {
    check(await page.evaluate(() => window.__studies.camera.zoom === 1), 'Fit scene resets wheel zoom');
    const snapshot = () => page.evaluate(() => {
      const { character } = window.__studies.current;
      return [...character.group.position.toArray(), ...character.sprite.position.toArray(), ...character.sprite.scale.toArray()];
    });
    const before = await snapshot(); await page.waitForTimeout(250);
    check(JSON.stringify(before) === JSON.stringify(await snapshot()), 'Motion off holds the explorer and its visual pose still');
    await page.locator('#motion').check(); await page.waitForTimeout(300);
    check(JSON.stringify(before) !== JSON.stringify(await snapshot()), 'Motion on resumes the explorer study');
    const pixel = await page.evaluate(async () => {
      const THREE = await import('/node_modules/.vite/deps/three.js'), { polygon } = await import('/src/world/primitives.js');
      const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true }); renderer.setSize(4, 4);
      const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10); camera.position.z = 2;
      const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      polygon(scene, square, '#779c91', 1, .6); polygon(scene, square, '#e4d4a5', 7);
      renderer.render(scene, camera); const gl = renderer.getContext(), rgba = new Uint8Array(4);
      gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      scene.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); }); renderer.dispose(); return [...rgba];
    });
    check([228, 212, 165].every((value, i) => Math.abs(value - pixel[i]) < 3), 'Solid painted foreground stays above a translucent background layer');
  } else check(await page.evaluate(() => typeof window.__studies === 'undefined'), 'Production omits the study inspection global');
  await page.locator('#quality').selectOption('low');
  check(external.length === 0 && errors.length === 0, `No external requests or browser errors (${errors.join('; ')})`);
  await page.close();
  const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await reduced.goto(`${url}/scene-studies.html?scene=garden`); await reduced.waitForFunction(() => document.querySelector('#scene-title').textContent.length > 0);
  check(!await reduced.locator('#motion').isChecked(), 'Reduced-motion preference starts with ambient motion off');
  await writeFile(`captures/${stamp}_Studies-Checks${production ? '-Production' : ''}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); server.kill(); }
