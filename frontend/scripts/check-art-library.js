// Decode every drawing in Chrome, exercise the workshop and verify selective game loading.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { catalog, categories, islandArtIds } from '../src/assets/catalog.js';
import { decorationPlacements } from '../src/world/decorations.js';

const url = process.env.TEST_URL || 'http://127.0.0.1:5176';
const production = process.env.ART_PRODUCTION === '1' || Boolean(process.env.TEST_URL);
const server = process.env.TEST_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', ...(production ? ['preview'] : []), '--host', '127.0.0.1', '--port', '5176', '--strictPort'], { stdio: 'pipe' });
const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).replaceAll('-', '');
const report = { checked: new Date().toISOString(), checks: [], drawings: [] };
const check = (condition, label) => { assert.ok(condition, label); report.checks.push(label); };
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Vite is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!request.url().startsWith(url) && !request.url().startsWith('data:')) external.push(request.url()); });
  await page.goto(`${url}/asset-library.html`); await page.locator('.asset-card').last().waitFor();
  check(await page.locator('.asset-card').count() === catalog.length, 'Workshop lists every registered drawing');
  report.drawings = await page.evaluate(async items => {
    const results = [];
    for (const item of items) {
      const source = await (await fetch(`./art/${item.file}`)).text();
      const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (xml.querySelector('parsererror')) throw new Error(`Invalid XML: ${item.id}`);
      const image = new Image(); image.src = `./art/${item.file}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width, top = canvas.height, right = -1, bottom = -1, ink = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 12) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); ink++;
        }
      }
      results.push({ id: item.id, width: canvas.width, height: canvas.height, ink, bounds: [left, top, right, bottom] });
    }
    return results;
  }, catalog);
  for (const [i, drawing] of report.drawings.entries()) {
    const item = catalog[i], [left, top, right, bottom] = drawing.bounds;
    assert.ok(drawing.ink > 10, `${drawing.id} has visible pixels`);
    assert.ok(Math.max(drawing.width, drawing.height) <= 1024, `${drawing.id} stays within texture budget`);
    assert.ok(Math.abs(drawing.width / drawing.height - item.size[0] / item.size[1]) < 0.02, `${drawing.id} has an undistorted map ratio`);
    if (item.usage !== 'css') assert.ok(left > 0 && top > 0 && right < drawing.width - 1 && bottom < drawing.height - 1,
      `${drawing.id} touches source edge: ${drawing.bounds}`);
  }
  check(true, `${catalog.length} SVGs parse, decode, contain ink and preserve aspect ratio without edge clipping`);
  await page.locator('#search').fill('brass key');
  check(await page.locator('.asset-card').count() === 1, 'Search finds the brass key');
  await page.locator('.asset-card').click();
  check(await page.locator('#detail').isVisible(), 'Drawing detail opens');
  check(await page.locator('#scale-study img').count() === 3, 'Detail shows 32, 64 and 96 pixel readability studies');
  check((await page.locator('#source-link').getAttribute('href')).endsWith('/art/brass-key.svg'), 'Detail links to editable source');
  await page.locator('#show-anchor').uncheck();
  check(await page.locator('.anchor').isHidden(), 'Placement anchor can be hidden');
  await page.keyboard.press('Escape');
  check(await page.locator('#detail').isHidden(), 'Escape closes the drawing detail');
  await page.locator('#search').fill('no matching artwork');
  check(await page.locator('#empty').isVisible(), 'Empty filter result is explained');
  await page.locator('#search').fill(''); await page.locator('#usage').selectOption('island');
  check(await page.locator('.asset-card').count() === islandArtIds.length, 'Usage filter matches the selective island kit');
  await page.locator('#usage').selectOption('all'); await page.locator('#feature').selectOption('sports');
  check(await page.locator('.asset-card').count() === catalog.filter(item => item.roadmap.includes('sports')).length, 'Roadmap filter matches source metadata');
  await page.locator('#feature').selectOption('all');
  for (const mode of ['sea', 'night', 'paper']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    check(await page.locator('body').getAttribute('data-mode') === mode, `${mode} contrast study works`);
  }
  await mkdir('captures', { recursive: true });
  for (const category of Object.keys(categories)) {
    await page.locator(`[data-category="${category}"]`).click();
    await page.locator('#gallery img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
    assert.equal(await page.locator('.asset-card').count(), catalog.filter(item => item.category === category).length);
    await page.screenshot({ path: `captures/${stamp}_Roadmap-${category}-Final.png`, fullPage: true });
  }
  check(true, 'All nine category counts and rendered review sheets match the catalogue');
  await page.locator('[data-category="all"]').click();
  await page.evaluate(() => {
    const ids = ['harbour-office', 'market-hall', 'workshop', 'player-cabin', 'windmill', 'raid-arch', 'sailboat', 'ferry', 'willow', 'palm', 'crab', 'logbook', 'brass-key', 'bottle-note', 'coin-stack', 'harbour-keeper', 'companion-gull', 'companion-wisp'];
    document.querySelectorAll('.asset-card').forEach(card => { card.hidden = !ids.includes(card.dataset.asset); });
    document.querySelector('.toolbar').hidden = true; document.querySelector('#categories').hidden = true;
    document.querySelector('#category-title').textContent = 'A few places, objects and islanders.';
    document.querySelector('#result-count').textContent = '18 selected new drawings';
  });
  await page.locator('#gallery img:visible').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
  await page.screenshot({ path: `captures/${stamp}_Roadmap-Collection-Preview.png`, fullPage: true });
  await page.close();
  const game = await browser.newPage({ viewport: { width: 1440, height: 900 } }), requested = new Set();
  game.on('request', request => { const match = request.url().match(/\/art\/([^/?]+)\.svg/); if (match) requested.add(match[1]); });
  game.on('pageerror', error => errors.push(error.message));
  await game.goto(url); await game.getByRole('button', { name: 'Step ashore' }).waitFor();
  await game.waitForTimeout(1000);
  const expected = [...islandArtIds, 'paper'].sort();
  check(JSON.stringify([...requested].sort()) === JSON.stringify(expected), `Game requests only the ${islandArtIds.length} island drawings and the CSS paper tile`);
  if (!production) {
    const placed = await game.evaluate(() => { const ids = []; window.__island.scene.traverse(object => { if (object.userData.asset) ids.push(object.userData.asset); }); return ids; });
    check(decorationPlacements.every(item => placed.includes(item.id)), 'All eight selected coastal props are present in the island');
  }
  check(external.length === 0, 'Workshop has no external network requests');
  check(errors.length === 0, `No browser errors (${errors.join('; ')})`);
  await writeFile(`captures/${stamp}_Roadmap-Art-Checks${production ? '-Production' : ''}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, drawings: `${report.drawings.length} decoded and checked` }, null, 2));
} finally { await browser?.close(); server?.kill(); }
