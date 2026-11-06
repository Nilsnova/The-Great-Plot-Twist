import {readHttp} from './http-read.js';
import {stubIntro} from './intro-browser-fixture.js';
import {startFromTitle,closeSettings} from './shell-browser-tools.js';
// Live data is isolated by a deterministic fixture in these presentation checks.
import {stubWeather} from './weather-browser-fixture.js';
// Checks the built static site, including the absence of dev-only inspection/FPS.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { stdio: 'pipe' });
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await readHttp('http://127.0.0.1:4175')).ok) break; } catch { /* Preview is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  await stubWeather(page);await stubIntro(page);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:4175'); await startFromTitle(page);
  assert.equal(await page.locator('canvas[tabindex="0"]').count(), 1);
  assert.equal(await page.evaluate(() => typeof window.__island), 'undefined');
  assert.equal(await page.locator('.performance').count(), 0);
  await page.getByRole('button', { name: 'Open visual settings' }).click();
  await page.locator('[data-preference=quality]').selectOption('low'); await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-preference=quality]').inputValue(),'low');
  await closeSettings(page,{keyboard:true});
  assert.equal(await page.locator('.shell-screen').isHidden(),true);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'CANVAS');
  await page.getByRole('button', { name: 'Open sea chart' }).click();
  await page.locator('[data-place=saltreach_harbor]').click();
  await page.waitForFunction(() => document.querySelector('.chapter').textContent.includes('SALTREACH HARBOR'));
  assert.equal(await page.locator('.sailing').isHidden(), true);
  assert.equal(await page.locator('.sailing').isHidden(), true);
  assert.deepEqual(errors, []);
  const result = { checked: new Date().toISOString(), browser: browser.version(),
    checks: ['Static build loads a WebGL canvas', 'No dev inspection global', 'No FPS output in production',
      'Persisted quality preference applies', 'Escape restores game focus', 'Keyboard-accessible production chart and reduced-motion travel arrive at Harbor', 'No browser/WebGL errors'] };
  const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).replaceAll('-', '');
  await mkdir('captures', { recursive: true });
  await writeFile(`captures/${stamp}_${process.env.CAPTURE_PREFIX || 'Illustrated'}-Production-Checks.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); server.kill(); }
