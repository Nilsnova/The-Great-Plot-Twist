import {stubOfflineApi} from './api-browser-fixture.js';
import {readHttp} from './http-read.js';
import {startFromTitle} from './shell-browser-tools.js';
import {stubIntro} from './intro-browser-fixture.js';
// Live data is isolated by a deterministic fixture in these presentation checks.
import {stubWeather} from './weather-browser-fixture.js';
// Inspect native PNGs, integer scaling, the live game and the built pixel workshop.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pixelArt, pixelArtIds } from '../src/pixel/catalog.js';

const visibleArt = pixelArt.filter(item => item.visibility !== 'finale');
const production = process.env.ART_PRODUCTION === '1', url = 'http://127.0.0.1:5176';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(production ? ['preview'] : []), '--host', '127.0.0.1', '--port', '5176', '--strictPort'], { stdio: 'pipe' });
const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).replaceAll('-', '');
const backgroundIds = ['saltreach_harbor','home_islet','smugglers_cove','wreck_point','the_teeth','gulls_rest','chart','chart-relit','title'];
const report = { checked: new Date().toISOString(), checks: [], files: pixelArt.length + 10 }, errors = [], external = [];
const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await readHttp(url)).ok) break; } catch { /* Vite is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await stubOfflineApi(page);await stubWeather(page);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (!request.url().startsWith(url) && !request.url().startsWith('data:')) external.push(request.url()); });
  await page.goto(`${url}/asset-library.html`); await page.locator('.sprite-card').last().waitFor();
  check(await page.locator('.sprite-card').count() === visibleArt.length, 'Workshop lists public art without finale variants');
  await page.goto(`${url}/asset-library.html?demo=1`);
  check(await page.locator('.sprite-card').count() === pixelArt.length, 'Explicit rehearsal gallery lists every registered drawing');
  await page.goto(`${url}/asset-library.html`);
  await page.evaluate(async items => {
    for (const item of items) {
      const image = new Image(); image.src = `./${item.folder || 'pixel'}/${item.file}`; await image.decode();
      if (image.naturalWidth !== item.width || image.naturalHeight !== item.height) throw new Error(`Wrong native dimensions: ${item.id}`);
      const canvas = document.createElement('canvas'); canvas.width = item.width; canvas.height = item.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, item.width, item.height).data;
      if (!pixels.some((value, i) => i % 4 === 3 && value > 0)) throw new Error(`Empty drawing: ${item.id}`);
      if (item.id === 'ground') {
        const centre = pixels[(384 * 1024 + 512) * 4 + 3];
        if (centre !== 255 || pixels[3] !== 0) throw new Error('Ground land/sea alpha mask is wrong');
      }
    }
  }, [...pixelArt, { id:'ground', file:'ground.png', width:1024, height:768 }, ...backgroundIds.map(id => ({ id, file:`${id}.png`, folder:'places', width:id==='title'?480:id.startsWith('chart')?448:1024,height:id==='title'?300:id.startsWith('chart')?256:768 }))]);
  check(true, `${pixelArt.length + 10} PNGs decode at their exact native sizes with visible pixels`);
  await page.locator('#search').fill('explorer side');
  check(await page.locator('.sprite-card').count() === 3, 'Search finds the side-facing animation family');
  await page.locator('.sprite-card').first().click();
  check(await page.locator('#detail').isVisible(), 'Native sprite detail opens');
  await page.keyboard.press('Escape'); check(await page.locator('#detail').isHidden(), 'Escape closes sprite detail');
  await page.locator('#search').fill(''); await page.locator('#category').selectOption('nature');
  await page.locator('#gallery img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
  await mkdir('captures', { recursive: true });
  await page.screenshot({ path: `captures/${stamp}_Pixel-Nature-Kit.png`, fullPage: true });
  await page.locator('#category').selectOption('all'); await page.locator('#usage').selectOption('library');
  check(await page.locator('.sprite-card').count() === visibleArt.filter(item => item.usage === 'library').length, 'Staged-art filter agrees with selective preload metadata');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator('#gallery img').evaluateAll(images => Promise.all(images.map(image => { image.loading = 'eager'; return image.decode(); })));
  await page.screenshot({ path: `captures/${stamp}_Pixel-Staged-Harbour-Kit.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const requested = new Set();
  page.on('request', request => { const match = request.url().match(/\/pixel\/([^/?]+\.png)(?:[?#]|$)/); if (match) requested.add(match[1]); });
  await stubIntro(page);await page.goto(url);await startFromTitle(page);
  await page.waitForTimeout(1100);
  check([...requested].every(file => file === 'ground.png' || pixelArtIds.includes(file.replace('.png', ''))), 'Game requests only active pixel artwork');
  const display = await page.evaluate(() => {
    const canvas = document.querySelector('canvas[tabindex="0"]'); return { imageRendering: getComputedStyle(canvas).imageRendering,
      width: canvas.width, height: canvas.height, cssWidth: parseInt(canvas.style.width), cssHeight: parseInt(canvas.style.height) };
  });
  check(display.imageRendering === 'pixelated' && Number.isInteger(display.cssWidth / display.width) && display.cssWidth / display.width === display.cssHeight / display.height, 'World uses one exact integer upscale factor');
  report.display = display;
  if (!production) {
    await page.evaluate(() => { window.__island.settings.hour = 12; window.__island.setWeather({ cloudCover: .05, rain: 0, fog: .02, wind: .18 }); });
    await page.waitForTimeout(4200); await page.screenshot({ path: `captures/${stamp}_Pixel-Forest-Daylight.png` });
    for (const [name, id] of [['Cottage', 'desk'], ['Shore', 'shore'], ['Lighthouse', 'tower_door']]) {
      await page.evaluate(async id => { const { zones } = await import('/src/world/zones.js'); const zone = zones.find(zone => zone.id === id); window.__island.player.position.set(zone.x, zone.y, zone.z); }, id);
      await page.waitForTimeout(1000); await page.screenshot({ path: `captures/${stamp}_Pixel-${name}-Daylight.png` });
      if (id === 'tower_door') { await page.evaluate(() => { window.__island.settings.hour = 0; }); await page.waitForTimeout(200); await page.screenshot({ path: `captures/${stamp}_Pixel-Lighthouse-Midnight.png` }); }
    }
    check(await page.evaluate(() => !window.__island.renderer.getContext().getContextAttributes().antialias), 'Renderer disables antialiasing');
    const drawing = await page.evaluate(() => {
      const game = window.__island, sprites = [];
      game.scene.traverse(object => { if (object.userData.asset === 'explorer') sprites.push(object); });
      return sprites.every(sprite => Number.isInteger(sprite.position.x * 16) && Number.isInteger(sprite.position.y * 16));
    });
    check(drawing, 'Explorer feet remain on the native pixel grid');
  } else check(await page.evaluate(() => typeof window.__island === 'undefined'), 'Production omits development inspection');
  check(errors.length === 0 && external.length === 0, `No browser errors or external requests (${errors.join('; ')})`);
  await writeFile(`captures/${stamp}_Pixel-Art-Checks${production ? '-Production' : ''}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); server.kill(); }
