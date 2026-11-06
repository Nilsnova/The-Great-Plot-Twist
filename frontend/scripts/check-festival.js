// Built-workshop review under strict CSP: art, sound, keyboard and phone layout.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { festivalDimensions } from '../src/pixel/festival-catalog.js';

const url = 'http://127.0.0.1:5177';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
  '--host', '127.0.0.1', '--port', '5177', '--strictPort'], { stdio: 'pipe' });
const output = process.env.CAPTURE_DIR || 'captures';
const report = { checks: [], checked: new Date().toISOString() };
const check = (condition, label) => { assert.ok(condition, label); report.checks.push(label); };
let browser;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Wait for preview. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], violations = [], writes = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (request.method() !== 'GET') writes.push(request.method());
    if (!request.url().startsWith(url)) external.push(request.url());
  });
  await page.exposeFunction('recordCspViolation', directive => violations.push(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => {
    window.recordCspViolation(event.effectiveDirective);
  }));
  await page.route('**/asset-library.html', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(),
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'" } });
  });
  await page.goto(`${url}/asset-library.html`);
  await page.locator('#search').fill('festival');
  const additions = page.locator('.sprite-card:not([data-id="festival-lantern-string"])');
  check(await additions.count() === 56, 'All 56 new festival drawings have searchable workshop entries');
  await page.locator('.sprite-card img').evaluateAll(images => Promise.all(images.map(image => {
    image.loading = 'eager'; return image.decode();
  })));
  for (const id of ['festival-lamp-01-unlit', 'festival-lamp-12-lit-night', 'festival-duel-ring-night']) {
    await page.locator(`[data-id="${id}"]`).click();
    check(await page.locator('#detail').isVisible(), `${id} opens at native integer magnification`);
    await page.keyboard.press('Escape');
  }
  const cards = await additions.evaluateAll(items => items.map(item => item.dataset.id));
  check(cards.every(id => Object.hasOwn(festivalDimensions, id)), 'Workshop entries match the complete festival catalog');
  await page.locator('.sprite-card').first().focus();
  await page.keyboard.press('Enter');
  check(await page.locator('#detail').isVisible(), 'Keyboard Enter opens art detail');
  await page.keyboard.press('Escape');
  const audio = page.locator('audio');
  check(await audio.count() === 4, 'Four original sound auditions are available');
  check(await audio.evaluateAll(players => players.every(player => player.paused && !player.autoplay && player.preload === 'none')),
    'All sound stays silent until an explicit audition');
  await audio.first().evaluate(player => player.play());
  await page.waitForFunction(() => document.querySelector('audio').currentTime > 0.1);
  await audio.first().evaluate(player => { player.currentTime = 7.8; });
  await page.waitForFunction(() => {
    const player = document.querySelector('audio');
    return !player.paused && player.currentTime > 0 && player.currentTime < 0.4;
  });
  check(await audio.first().evaluate(player => player.loop), 'The original festival loop plays and repeats');
  await audio.nth(1).evaluate(player => player.play());
  check(await audio.first().evaluate(player => player.paused), 'Starting a cue pauses the loop');
  for (let index = 1; index < 4; index++) {
    await audio.nth(index).evaluate(async player => { player.currentTime = 0; await player.play(); });
    await page.waitForFunction(index => document.querySelectorAll('audio')[index].ended, index);
  }
  check(true, 'Claim, bell and timer-end recordings decode and finish');
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}/G13-Festival-Workshop.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#search').fill('festival duel ring');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Phone workshop has no horizontal overflow');
  await page.screenshot({ path: `${output}/G13-Festival-Phone.png`, fullPage: true });
  check(errors.length === 0, `No browser errors: ${errors.join('; ')}`);
  check(violations.length === 0, 'Workshop works with self-only script/style CSP, no inline exceptions');
  check(writes.length === 0 && external.length === 0, 'Workshop makes no server writes or external requests');
  console.log(JSON.stringify(report, null, 2));
  await writeFile(`${output}/G13-Festival-Checks.json`, JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser?.close();
  server.kill();
}
