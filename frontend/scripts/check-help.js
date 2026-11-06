// Checks the built guide in Chromium. --capture refreshes only the two local-fake crew images.
import assert from 'node:assert/strict';
import {mkdir, readFile, stat} from 'node:fs/promises';
import {preview} from 'vite';
import {chromium} from 'playwright-core';

await readFile('dist/help.html'); // Run npm run build first; never silently check a dev page.
const server = await preview({logLevel: 'error', preview: {host: '127.0.0.1', port: 0}});
const address = server.httpServer.address();
const origin = `http://127.0.0.1:${address.port}`;
let browser;
const checks = [];
function check(condition, label) { assert.ok(condition, label); checks.push(label); }

try {
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  const context = await browser.newContext({viewport: {width: 375, height: 820}, reducedMotion: 'reduce'});
  await context.addInitScript(() => {
    window.helpViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.helpViolations.push(event.effectiveDirective));
  });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`${origin}/help.html`);
  await page.waitForFunction(() => !document.querySelector('#help-search').hidden);
  check(await page.locator('.help-topic:visible').count() === 12, 'All twelve player topics are readable');

  for (const width of [320, 375, 960]) {
    await page.setViewportSize({width, height: 820});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({width: 375, height: 820});
  await page.keyboard.press('Tab');
  check(await page.getByRole('link', {name: 'Skip to the guide'}).evaluate(node => node === document.activeElement), 'Keyboard reaches the skip link first');
  await page.keyboard.press('Enter');
  check(await page.locator('#guide').evaluate(node => node === document.activeElement), 'Skip link moves focus to the guide');

  const input = page.getByLabel('Find a topic');
  await input.fill('gamepad');
  check(await page.locator('#controls').isVisible() && await page.locator('.help-topic:visible').count() < 12, 'Topic search keeps matching controls');
  await input.fill('no-such-topic-g23');
  check(await page.locator('#no-results').isVisible(), 'Empty results explain how to recover');
  await page.getByRole('button', {name: 'Clear', exact: true}).click();
  check(await page.locator('.help-topic:visible').count() === 12 && await input.evaluate(node => node === document.activeElement), 'Clear restores all topics and search focus');
  await input.fill('coins');
  await input.press('Escape');
  check(await input.inputValue() === '' && await page.locator('.help-topic:visible').count() === 12, 'Escape clears a filter');
  await input.fill('gamepad');
  await page.locator('.contents').getByRole('link', {name: 'Exchange risks'}).click();
  check(await page.locator('#exchange').isVisible() && await input.inputValue() === '', 'Contents links restore a filtered topic');
  await input.fill('gamepad');
  await page.evaluate(() => { location.hash = 'crews'; });
  await page.waitForFunction(() => !document.querySelector('#crews').hidden);
  check(await input.inputValue() === '', 'Hash navigation restores hidden destinations');
  await page.locator('.rehearsal-examples summary').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.rehearsal-examples img')].every(image => image.complete && image.naturalWidth > 0));
  check(await page.locator('.rehearsal-examples img:visible').count() === 2, 'Both labelled fake-mode images load from the production build');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Expanded screenshots fit the phone width');

  const report = page.getByRole('link', {name: 'Open a GitHub issue'});
  check(await report.getAttribute('href') === 'https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new', 'Report link opens the correct project without submitting data');
  check(requests.every(url => url.startsWith(`${origin}/`)) && !requests.some(url => url.includes('/api/')), 'Help loads only local assets and makes no API requests');
  check(errors.length === 0 && consoleErrors.length === 0 && (await page.evaluate(() => window.helpViolations)).length === 0, 'Normal reading and filtering have no browser or CSP errors');

  // Deliberate negative checks: normal operation above must remain violation-free.
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.helpInlineExecuted = true'; document.head.append(script);
    const style = document.createElement('style');
    style.textContent = 'body { border-top: 99px solid red; }'; document.head.append(style);
  });
  check(await page.evaluate(() => !window.helpInlineExecuted), 'CSP blocks inline script execution');
  check(await page.evaluate(() => getComputedStyle(document.body).borderTopWidth !== '99px'), 'CSP blocks inline styles');
  check(await page.evaluate(async () => { try { await fetch('/api/health'); return false; } catch { return true; } }), 'CSP blocks connections even to the local API');
  await page.waitForFunction(() => window.helpViolations.length >= 3);
  const violations = await page.evaluate(() => window.helpViolations);
  check(['script-src-elem', 'style-src-elem', 'connect-src'].every(rule => violations.includes(rule)), 'Browser reports all three expected CSP denials');
  check(errors.length === 0, 'CSP probes introduce no unhandled page errors');

  const noScript = await browser.newContext({javaScriptEnabled: false, viewport: {width: 320, height: 820}});
  const staticPage = await noScript.newPage();
  await staticPage.goto(`${origin}/help.html`);
  check(await staticPage.locator('.help-topic:visible').count() === 12 && await staticPage.locator('#help-search').isHidden(), 'All content and anchors remain available without JavaScript');
  check(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No-JavaScript phone layout fits at 320px');
  await noScript.close();

  if (process.argv.includes('--capture')) {
    const lab = await browser.newPage({viewport: {width: 960, height: 900}, reducedMotion: 'reduce'});
    const calls = []; lab.on('request', request => { if (request.url().includes('/api/')) calls.push(request.url()); });
    await lab.goto(`${origin}/case-lab.html?demo=1`);
    check(await lab.getByText('LOCAL FAKE · UNAPPROVED DRAFT DESIGN', {exact: true}).isVisible(), 'Capture source is visibly labelled local fake');
    await lab.getByRole('navigation', {name: 'Local rehearsal controls'}).getByRole('button', {name: 'Crew', exact: true}).click();
    const modal = lab.locator('dialog[open]');
    await modal.getByRole('button', {name: 'Start a crew', exact: true}).click();
    check(await modal.locator('.crew-seat[data-kind="player"]').count() === 1 && await modal.locator('.crew-seat[data-kind="open"]').count() === 3, 'First capture has one fake captain and three open seats');
    await mkdir('public/help', {recursive: true});
    await modal.screenshot({path: 'public/help/crew-rehearsal.png'});
    await modal.getByRole('button', {name: 'Muster with NPC partners', exact: true}).click();
    check(await modal.locator('.crew-seat').count() === 4, 'Muster capture shows four fake seats');
    check(await modal.locator('.crew-seat[data-kind="npc"]').count() === 3, 'Three NPC partners fill the fake crew');
    check(await modal.locator('.case-clue').count() === 0, 'Captures contain no clue cards or progressed case');
    await modal.screenshot({path: 'public/help/partners-rehearsal.png'});
    check(calls.length === 0, 'Fake captures make no API calls');
    await lab.close();
  }
  for (const name of ['crew-rehearsal.png', 'partners-rehearsal.png']) {
    const path = `public/help/${name}`, png = await readFile(path);
    check((await stat(path)).size < 150 * 1024 && png.readUInt32BE(16) <= 960, `${name} stays small and at most 960px wide`);
  }
  console.log(JSON.stringify({browser: browser.version(), checks, expectedCspDenials: violations}, null, 2));
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
