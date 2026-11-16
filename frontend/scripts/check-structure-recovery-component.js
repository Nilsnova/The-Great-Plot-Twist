// Checks the standalone T59 recovery component in Chromium and captures desktop/phone examples.
// Used by the T59 implementation while API and island-card integration are pending.

import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, '..');
const captureDirectory = path.join(frontendDirectory, 'captures');
const server = await createServer({
  configFile: path.join(frontendDirectory, 'vite.config.js'),
  server: { host: '127.0.0.1', port: 0 },
});
let browser;

try {
  await mkdir(captureDirectory, { recursive: true });
  await server.listen();
  const address = server.httpServer.address();
  const baseUrl = 'http://127.0.0.1:' + address.port;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseUrl + '/tests/fixtures/structure-recovery-preview.html');
  await page.locator('.recovery-card').first().waitFor();
  await page.getByText('75 / 100 HP').waitFor();
  await page.getByRole('button', { name: 'Repair now: pay 10 coins' }).click();
  await page.getByText('Preview emitted an intent only; no API call was made.').waitFor();

  const counts = await page.locator('.recovery-card').count();
  if (counts !== 3) throw new Error('Expected three standalone recovery examples, got ' + counts);
  const bar = page.locator('#harpoon-recovery .health-fill');
  const barWidth = await bar.evaluate(element => element.getBoundingClientRect().width);
  if (barWidth < 1) throw new Error('Tiny positive HP did not render at least one visible pixel');
  const ariaValue = await page.locator('#harpoon-recovery [role="meter"]').getAttribute('aria-valuenow');
  if (ariaValue !== '1') throw new Error('The visual meter lost normalized HP precision');

  await page.screenshot({ path: path.join(captureDirectory, 't59-recovery-component-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(captureDirectory, 't59-recovery-component-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Repair now: pay 40 coins' }).waitFor();
  await page.locator('#cannon-recovery .recovery-marker').getByText('!').waitFor();
  console.log('T59 standalone component: 3 cards, exact HP, zero marker, tiny-positive visible width, intent-only button and desktop/phone screenshots passed.');
} finally {
  if (browser) await browser.close();
  await server.close();
}
