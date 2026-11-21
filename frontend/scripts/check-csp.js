// Production CSP and demo check. Runs the built site under the preview headers.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openWorldBrowser } from './world-browser-tools.js';

import {previewSecurityHeaders} from '../vite.config.js';
const policyName=Object.hasOwn(previewSecurityHeaders,'Content-Security-Policy')?'Content-Security-Policy':'Content-Security-Policy-Report-Only';
const policy=previewSecurityHeaders[policyName];
const env = await openWorldBrowser({ preview: true });
const { page } = env;
const report = { checked: new Date().toISOString(), browser: env.browser.version(), pages: [], journey: [], errors: [], external: [] };
const javascriptErrors = [], consoleErrors = [];
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(15000);
page.on('pageerror', error => javascriptErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

function check(condition, label) {
  assert.ok(condition, label);
  report.journey.push(label);
}

async function verifyPage(path) {
  const response = await page.goto(`${env.url}${path}`, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, `${path} returns HTTP 200`);
  const headers = response.headers();
  assert.equal(headers[policyName.toLowerCase()], policy, `${path} sends the proposed preview CSP`);
  assert.equal(headers['x-frame-options'], 'DENY', `${path} denies framing`);
  assert.equal(headers['x-content-type-options'], 'nosniff', `${path} disables MIME sniffing`);
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin', `${path} sends the referrer policy`);

  if (path.startsWith('/asset-library')) await page.locator('#gallery').waitFor();
  else if (path.startsWith('/ui-kit')) await page.locator('#kit-gallery').waitFor();
  else if (path.startsWith('/auth-check')) await page.locator('main.panel').waitFor();
  else if (path.startsWith('/help') || path.startsWith('/privacy')) await page.locator('main').waitFor();
  else await page.locator('.shell-screen[open]').waitFor();

  await page.waitForFunction(() => document.styleSheets.length > 0);
  const style = await page.evaluate(() => {
    const target = document.querySelector('.panel, .shell-screen, #kit-gallery, #gallery, main') ?? document.body;
    return { fontFamily: getComputedStyle(target).fontFamily, fontSize:parseFloat(getComputedStyle(target).fontSize),sheetCount: document.styleSheets.length };
  });
  if(path.startsWith('/help')||path.startsWith('/privacy')){
    assert.match(style.fontFamily,/Courier|system-ui|sans-serif/i,`${path} applies a local readable font`);
    assert.ok(style.fontSize>=16,`${path} keeps supporting-page text readable`);
  // The interface font since the cartoon redesign (12 Nov, src/ui/base.css) is the system UI stack; the
  // auth-check page keeps its own monospace. Both are local: no web font is fetched.
  }else assert.match(style.fontFamily, /system-ui|sans-serif|Courier|monospace/i, `${path} applies a local interface font`);
  assert.ok(style.sheetCount > 0, `${path} loads same-origin stylesheets`);
  const violations = await page.evaluate(() => window.__cspViolations ?? []);
  assert.deepEqual(violations, [], `${path} produces no CSP violations`);
  report.pages.push({ path, status: response.status(), policy: headers[policyName.toLowerCase()], styles: style, violations });
}

async function verifyModalSelect() {
  const previousSize = page.viewportSize();
  await page.setViewportSize({width:390,height:844});
  try {
    await page.goto(`${env.url}/`, {waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    const settings = page.locator('.shell-screen[data-mode=settings][open] .preferences');
    // Settings loads the shared field stylesheet even when the island server is down.
    await settings.evaluate(root => {
      const select = document.createElement('select');
      select.setAttribute('aria-label','Dropdown fixture');
      select.append(new Option('All levels','all'), new Option('Within budget','ready'));
      root.prepend(select);
    });
    const select = page.getByRole('combobox',{name:'Dropdown fixture'});
    const arrow = await select.evaluate(async control => {
      const style = getComputedStyle(control);
      const url = /^url\("(.*)"\)$/.exec(style.backgroundImage)?.[1];
      const height = control.getBoundingClientRect().height;
      if (!url) return {appearance:style.appearance,height,url};
      const image = new Image();
      image.src = url;
      const loaded = await image.decode().then(() => image.naturalWidth > 0, () => false);
      return {appearance:style.appearance,height,url,loaded};
    });
    assert.equal(arrow.appearance,'none','The themed dropdown uses its custom arrow');
    assert.ok(arrow.loaded && new URL(arrow.url).origin === new URL(env.url).origin,'The dropdown arrow loads from the same origin');
    assert.ok(arrow.height >= 44,'The dropdown has a phone-size touch target');
    await page.keyboard.press('Tab');
    await select.focus();
    assert.ok(await select.evaluate(control => control.matches(':focus-visible') && getComputedStyle(control).outlineStyle !== 'none'),
      'The dropdown retains its keyboard focus outline');
    // Native typeahead works even when the platform opens a popup for ArrowDown.
    await select.press('w');
    assert.equal(await select.inputValue(),'ready','The themed dropdown remains a native select');
    await page.emulateMedia({forcedColors:'active'});
    const highContrast = await select.evaluate(control => {
      const style = getComputedStyle(control);
      return {appearance:style.appearance,image:style.backgroundImage};
    });
    assert.deepEqual(highContrast,{appearance:'auto',image:'none'},'Forced colors use the browser dropdown indicator');
    assert.deepEqual(await page.evaluate(() => window.__cspViolations),[],'Opening the dropdown produces no CSP violations');
    check(true,'The phone dropdown shows an allowed arrow and a native indicator in forced colors');
  } finally {
    await page.emulateMedia({forcedColors:'none'});
    await page.setViewportSize(previousSize);
  }
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

  await verifyModalSelect();
  await verifyPage('/');
  await verifyPage('/?demo=1');
  await verifyPage('/asset-library.html');
  await verifyPage('/ui-kit.html');
  await verifyPage('/auth-check.html');
  await verifyPage('/help.html');
  await verifyPage('/privacy.html');

  // The production front door under the CSP: Play, skip the lore, the goal card, the class harbor,
  // then a sail to your island (the old highlights tour left with the mystery on 10 Nov).
  await page.goto(`${env.url}/?demo=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#play').click();
  await page.locator('dialog.cutscene[open]').waitFor();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.locator('.tutorial-card[open]').getByRole('button', { name: 'Skip', exact: true }).click();
  await page.locator('.goal-card[open]').waitFor({ timeout: 30000 });
  check(true, 'Production front door shows the lore cutscene and the goal card');
  await page.getByRole('button', { name: 'Got it', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.chapter')?.textContent.toUpperCase().includes('SALTREACH HARBOR') && !document.querySelector('dialog[open]'));
  await page.locator('.quest-strip').waitFor();
  check(true, 'Production front door lands in Saltreach Harbor with the quest strip');
  await page.keyboard.press('KeyM');
  await page.locator('.sea-chart[open]').waitFor();
  await page.locator('.sea-chart .fast-travel').check();
  await page.locator('.sea-chart [data-place="home_islet"]').click();
  await page.waitForFunction(() => document.querySelector('.chapter')?.textContent.toUpperCase().includes('YOUR ISLAND'), null, { timeout: 30000 });
  check(true, 'Production sea chart sails to your island (home_islet, "Your island")');
  check(await page.locator('.case-reveal-line, .case-modal, .intro-modal').count() === 0, 'Production game shows no case or prologue screen');
  check(await page.evaluate(() => typeof window.__island) === 'undefined', 'Production game uses no development inspection hooks');
  const finalViolations = await page.evaluate(() => window.__cspViolations ?? []);
  assert.deepEqual(finalViolations, [], 'Production journey produces no CSP violations');
  check(apiResponses.length > 0 && apiResponses.every(response => response.status === 503), 'API requests occur only as expected 503 responses during the production journey');
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
