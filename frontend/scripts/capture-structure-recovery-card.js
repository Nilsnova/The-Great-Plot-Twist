// Captures production structure-card UI with offline fixture data; no game API or payment call is made.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, '..');
const captureDirectory = path.join(frontendDirectory, 'captures');
const server = await createServer({configFile: path.join(frontendDirectory, 'vite.config.js'),
  server: {host: '127.0.0.1', port: 0}});
let browser;

try {
  await mkdir(captureDirectory, {recursive: true});
  await server.listen();
  const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});

  await show(page, baseUrl, 'wall', {width: 1440, height: 900});
  await page.getByText('Level 2 · 🪙 20').waitFor();
  await page.getByText('45 / 60 HP').waitFor();
  await page.getByRole('button', {name: 'Repair now: pay 10 coins'}).waitFor();
  await page.getByText('All buildings are fully repaired when a wave ends.').waitFor();
  assert.equal(await page.locator('.recovery-free').count(), 0);
  await page.screenshot({path: path.join(captureDirectory, 't59-wave-end-20261118-between-desktop.png'), fullPage: true});
  await page.getByRole('button', {name: 'Repair now: pay 10 coins'}).click();
  assert.equal((await page.evaluate(() => window.previewIntent)).expectedRepairSeq, 0);
  await page.getByText('Fixture emitted a repair intent; no API call was made.').waitFor();

  await show(page, baseUrl, 'cannon', {width: 390, height: 844});
  await page.getByRole('button', {name: 'Upgrade · 🪙 60'}).waitFor();
  await scrollCardToRecovery(page);
  await page.getByText('0 / 80 HP').waitFor();
  await page.getByText('2 shared Repair now uses left this wave').waitFor();
  assert.equal(await page.locator('.recovery-free').count(), 0);
  assert.equal(await page.locator('.recovery-marker').textContent(), '!');
  await assertButtonFits(page, 390);
  await page.screenshot({path: path.join(captureDirectory, 't59-wave-end-20261118-preparation-phone.png'), fullPage: true});

  await show(page, baseUrl, 'harpoon', {width: 375, height: 812});
  await page.getByRole('button', {name: 'Upgrade · 🪙 80'}).waitFor();
  await scrollCardToRecovery(page);
  await page.getByText('0.00006 / 60 HP').waitFor();
  assert.ok(await page.locator('.health-fill').evaluate(element => element.getBoundingClientRect().width >= 1));
  await assertButtonFits(page, 375);
  await page.screenshot({path: path.join(captureDirectory, 't59-wave-end-20261118-tiny-phone.png'), fullPage: true});

  await show(page, baseUrl, 'loading', {width: 390, height: 844});
  const upgrade = page.getByRole('button', {name: 'Upgrade'});
  await upgrade.waitFor();
  assert.equal(await upgrade.isDisabled(), true);
  await page.getByText('Wait until building health has loaded.').waitFor();
  await page.screenshot({path: path.join(captureDirectory, 't59-wave-end-20261118-upgrade-health-loading-phone.png'), fullPage: true});

  await show(page, baseUrl, 'house', {width: 1280, height: 800});
  await page.getByText('This saved Workshop role stays recorded but is inactive').waitFor();
  assert.equal(await page.locator('[data-focus="spec-workshop"]').count(), 0);
  await page.screenshot({path: path.join(captureDirectory, 't59-wave-end-20261118-house-roles-desktop.png'), fullPage: true});

  await show(page, baseUrl, 'walltech', {width: 390, height: 844});
  await page.getByText('This saved choice remains recorded but no longer affects repair.').waitFor();
  assert.equal(await page.locator('[data-focus="spec-quick_mend"]').count(), 0);
  await page.screenshot({path: path.join(captureDirectory, 't59-wave-end-20261118-stored-wall-skill-phone.png'), fullPage: true});

  await show(page, baseUrl, 'crew', {width: 390, height: 844});
  assert.equal(await page.locator('[data-crew="carpenter"]').count(), 0);
  await page.screenshot({path: path.join(captureDirectory, 't59-wave-end-20261118-crew-phone.png'), fullPage: true});

  await show(page, baseUrl, 'tech', {width: 1280, height: 800});
  assert.equal(await page.locator('[data-option="mason_drill"]').count(), 0);
  await page.screenshot({path: path.join(captureDirectory, 't59-wave-end-20261118-tech-desktop.png'), fullPage: true});
  console.log('Production island card preview passed: wave-end repair, reserved-wave quota, loading upgrade guard and retired v1 choices. Fixtures did not call an API.');
} finally {
  if (browser) await browser.close();
  await server.close();
}

async function show(page, baseUrl, scenario, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/tests/fixtures/structure-recovery-card-preview.html?case=${scenario}`);
  await page.locator('dialog[open]').waitFor();
}

async function assertButtonFits(page, width) {
  const box = await page.locator('.recovery-repair').boundingBox();
  assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width,
    `Repair button does not fit within ${width}px viewport.`);
  assert.ok(box.y >= 0 && box.y + box.height <= page.viewportSize().height,
    'Repair button must be fully visible in the phone screenshot.');
}

async function scrollCardToRecovery(page) {
  await page.locator('.island-card-build').evaluate(card => { card.scrollTop = card.scrollHeight; });
}
