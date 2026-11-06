// Production CSP and demo check. Runs the built site under the preview headers.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openWorldBrowser } from './world-browser-tools.js';

import {proposedCsp as policy} from './csp-policy.js';
const env = await openWorldBrowser({ preview: true });
const { page } = env;
const report = { checked: new Date().toISOString(), browser: env.browser.version(), pages: [], tour: [], errors: [], external: [] };
const javascriptErrors = [], consoleErrors = [];
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(15000);
page.on('pageerror', error => javascriptErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

function check(condition, label) {
  assert.ok(condition, label);
  report.tour.push(label);
}

async function verifyPage(path) {
  const response = await page.goto(`${env.url}${path}`, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, `${path} returns HTTP 200`);
  const headers = response.headers();
  assert.equal(headers['content-security-policy'], policy, `${path} sends the proposed preview CSP`);
  assert.equal(headers['x-frame-options'], 'DENY', `${path} denies framing`);
  assert.equal(headers['x-content-type-options'], 'nosniff', `${path} disables MIME sniffing`);
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin', `${path} sends the referrer policy`);

  if (path.startsWith('/asset-library')) await page.locator('#gallery').waitFor();
  else if (path.startsWith('/ui-kit')) await page.locator('#kit-gallery').waitFor();
  else if (path.startsWith('/auth-check')) await page.locator('main.panel').waitFor();
  else await page.locator('.shell-screen[open]').waitFor();

  await page.waitForFunction(() => document.styleSheets.length > 0);
  const style = await page.evaluate(() => {
    const target = document.querySelector('.panel, .shell-screen, #kit-gallery, #gallery') ?? document.body;
    return { fontFamily: getComputedStyle(target).fontFamily, sheetCount: document.styleSheets.length };
  });
  assert.match(style.fontFamily, /Courier/i, `${path} applies the local interface font`);
  assert.ok(style.sheetCount > 0, `${path} loads same-origin stylesheets`);
  const violations = await page.evaluate(() => window.__cspViolations ?? []);
  assert.deepEqual(violations, [], `${path} produces no CSP violations`);
  report.pages.push({ path, status: response.status(), policy: headers['content-security-policy'], styles: style, violations });
}

async function waitForStep(title) {
  await page.waitForFunction(expected => document.querySelector('.presenter-panel .kit-heading')?.textContent === expected, title);
}

async function confirmStep(title, id) {
  await waitForStep(title);
  if (id === 'intro') await page.locator('.intro-modal[open] .intro-view').waitFor();
  if (id === 'arrival') await page.waitForFunction(() => document.querySelector('.chapter')?.textContent.includes('LIGHTHOUSE ISLE'));
  if (id === 'islet') await page.waitForFunction(() => document.querySelector('.chapter')?.textContent.includes('HOME ISLET'));
  if (id === 'chart') await page.locator('.sea-chart[open]').waitFor();
  if (id === 'harbor') { await page.waitForFunction(() => document.querySelector('.chapter')?.textContent.includes('SALTREACH HARBOR')); await page.locator('.case-modal[open] .case-screen-content').waitFor(); }
  if (id === 'board' || id === 'finale') await page.locator('.case-modal[open] .case-screen-content').waitFor();
  if (id === 'weather') await page.waitForFunction(() => document.querySelector('.presenter-panel .tour-copy')?.textContent.includes('storm'));
  if (id === 'relighting') await page.waitForFunction(() => document.querySelector('.chapter')?.textContent.includes('GULL'));
  check(true, `Production tour reached ${title}`);
}

try {
  await mkdir('captures', { recursive: true });
  await page.unroute('**/api/weather');
  const apiResponses = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) apiResponses.push({ path: url.pathname, status: response.status() });
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(env.url).origin && url.protocol !== 'data:') report.external.push(request.url());
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline CSP rehearsal"}' }));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI, source: event.sourceFile });
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await verifyPage('/');
  await verifyPage('/?demo=1');
  await verifyPage('/asset-library.html');
  await verifyPage('/ui-kit.html');
  await verifyPage('/auth-check.html');

  await page.goto(`${env.url}/?demo=1`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Highlights tour', exact: true }).click();

  const steps = [
    ['A page from the intro', 'intro'],
    ['Arrival on Lighthouse Isle', 'arrival'],
    ['Build the signal station', 'islet'],
    ['Set a coastal course', 'chart'],
    ['Harbor bulletin and live captains', 'harbor'],
    ['At the Captain’s Table', 'board'],
    ['Weather · almanac fog and storm', 'weather'],
    ['The Night of Three Lights', 'finale'],
    ['The Relighting', 'relighting'],
  ];
  for (let index = 0; index < steps.length; index++) {
    const [title, id] = steps[index];
    await confirmStep(title, id);
    await page.keyboard.press('Space');
    if (index + 1 < steps.length) await waitForStep(steps[index + 1][0]);
  }
  await page.getByRole('button', { name: 'Start highlights tour', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Start highlights tour', exact: true }).click();
  await page.getByRole('button', { name: 'End rehearsal', exact: true }).click();
  await page.getByRole('button', { name: 'Start highlights tour', exact: true }).waitFor();
  check(await page.locator('.case-reveal-line').count() === 0, 'Production demo shows no reveal text');
  check(await page.evaluate(() => typeof window.__island) === 'undefined', 'Production tour uses no development inspection hooks');
  const finalViolations = await page.evaluate(() => window.__cspViolations ?? []);
  assert.deepEqual(finalViolations, [], 'Production tour produces no CSP violations');
  check(apiResponses.length > 0 && apiResponses.every(response => response.status === 503), 'API requests occur only as expected 503 responses during the production tour');
  check(report.external.length === 0, 'Production pages request no external assets');
  report.apiResponses = apiResponses;
  const expected503 = /Failed to load resource: the server responded with a status of 503/;
  report.errors = { javascript: javascriptErrors, console: consoleErrors.filter(error => !expected503.test(error)) };
  assert.deepEqual(report.errors, { javascript: [], console: [] }, 'No JavaScript errors or non-503 console errors occur');
  report.expected503Diagnostics = consoleErrors.filter(error => expected503.test(error));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error.message;
  try { await page.screenshot({ path: 'captures/20261106_G8-CSP-Failure.png' }); } catch { /* Keep the original failure. */ }
  throw error;
} finally {
  await writeFile('captures/20261106_G8-CSP-Checks.json', `${JSON.stringify(report, null, 2)}\n`);
  await env.close();
}
