// Verify the standalone review page with existing Playwright; no app state or images are edited.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile, appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire('/workspace/reference-village-work/final-preview/frontend/package.json');
const {chromium} = require('playwright-core');
const source = path.resolve(process.argv[2] ?? '/workspace/reference-village-work/visual-handover/docs/evidence/reference-village-latest-review/comparison.html');
const out = path.resolve(process.argv[3] ?? '/workspace/reference-village-work/comparison-browser-checks');
await mkdir(out, {recursive: true});
const bytes = await readFile(source);
const checkerPath = fileURLToPath(import.meta.url);
const checkerBytes = await readFile(checkerPath);
const report = {started: new Date().toISOString(), source, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), validationVersion: 'latest-review-v2',
  checkerSource: checkerPath, checkerSha256: createHash('sha256').update(checkerBytes).digest('hex'),
  expectedImages: 12, expectedTabCounts: [2, 3, 3], status: 'running', viewports: []};
const save = () => writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await save();
await writeFile(path.join(out, 'run.log'), '');
const log = async value => appendFile(path.join(out, 'run.log'), JSON.stringify(value) + '\n');
let browser, server;
let imageManifest;
const tabSets = {
  'Viewport': ['desktop-tab', 'phone-tab'],
  'Desktop scene': ['desktop-village-tab', 'desktop-combat-tab', 'desktop-selected-tab'],
  'Phone scene': ['phone-village-tab', 'phone-combat-tab', 'phone-selected-tab'],
};

async function serveExactHtml() {
  report.mode = 'owned-loopback-http'; report.ownedHttpRequests = [];
  server = createServer((request, response) => {
    const home = request.method === 'GET' && request.url === '/';
    const favicon = request.method === 'GET' && request.url === '/favicon.ico';
    const status = home ? 200 : favicon ? 204 : 404;
    report.ownedHttpRequests.push({method: request.method, path: request.url, status,
      bytes: home ? bytes.length : 0});
    response.writeHead(status, home ? {'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': bytes.length, 'Cache-Control': 'no-store'} : {'Cache-Control': 'no-store'});
    response.end(home ? bytes : undefined);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  report.origin = `http://127.0.0.1:${server.address().port}`;
  return report.origin;
}

async function inspect(page, label, expected) {
  const actual = await page.getByRole('tablist', {name: label, exact: true}).evaluate(list => {
    const tabs = [...list.querySelectorAll(':scope > [role=tab]')];
    return {focused: document.activeElement.id,
      tabs: tabs.map(tab => {
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        return {id: tab.id, selected: tab.getAttribute('aria-selected'), tabIndex: tab.tabIndex,
          controls: tab.getAttribute('aria-controls'), panelExists: !!panel, role: panel?.getAttribute('role'),
          labelledBy: panel?.getAttribute('aria-labelledby'), hidden: panel?.hidden,
          visible: !!panel?.getClientRects().length};
      }), width: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth};
  });
  assert.deepEqual(actual.tabs.map(tab => tab.id), tabSets[label], `${label}: exact tab identities and DOM order`);
  assert.equal(actual.focused, expected, `${label}: focus follows the actual action`);
  for (const tab of actual.tabs) {
    const active = tab.id === expected;
    assert.equal(tab.selected, String(active), `${label}: ${tab.id} aria-selected`);
    assert.equal(tab.tabIndex, active ? 0 : -1, `${label}: ${tab.id} roving tabindex`);
    assert.equal(tab.panelExists, true, `${label}: ${tab.id} has a controlled panel`);
    assert.equal(tab.role, 'tabpanel', `${label}: ${tab.id} panel role`);
    assert.equal(tab.labelledBy, tab.id, `${label}: ${tab.id} panel accessible label`);
    assert.equal(tab.hidden, !active, `${label}: ${tab.id} actual hidden state`);
    assert.equal(tab.visible, active, `${label}: ${tab.id} actual rendered visibility`);
  }
  assert.ok(actual.documentWidth <= actual.width + 1, `${label}: document has no horizontal overflow`);
  assert.ok(actual.bodyWidth <= actual.width + 1, `${label}: body has no horizontal overflow`);
  return actual;
}

async function exercise(page, label) {
  const ids = tabSets[label], first = ids[0], last = ids.at(-1);
  const list = page.getByRole('tablist', {name: label, exact: true});
  const a = list.locator(`#${first}`), steps = [];
  await a.click(); steps.push({action: `click ${first}`, state: await inspect(page, label, first)});
  for (const [key, expected] of [['End', last], ['ArrowRight', first], ['ArrowLeft', last],
    ['Home', first], ...ids.slice(1).map(id => ['ArrowRight', id]),
    ...ids.slice(0, -1).reverse().map(id => ['ArrowLeft', id])]) {
    await page.keyboard.press(key);
    steps.push({action: key, state: await inspect(page, label, expected)});
  }
  for (const id of ids.slice(1)) {
    await list.locator(`#${id}`).click(); steps.push({action: `click ${id}`, state: await inspect(page, label, id)});
  }
  await a.click(); steps.push({action: `click ${first}`, state: await inspect(page, label, first)});
  return {label, steps};
}

try {
  const manifest = JSON.parse(await readFile(path.join(path.dirname(source), 'sha256.json'), 'utf8'));
  assert.deepEqual(manifest.comparison.tabCounts, [2, 3, 3], 'manifest declares the exact viewport/scene tab counts');
  imageManifest = manifest.comparison.embeddedOriginals;
  const embedded = bytes.toString().matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g);
  const encoded = [...embedded].map(match => Buffer.from(match[1], 'base64'));
  assert.equal(encoded.length, 12, 'twelve embedded source streams exist');
  assert.equal(imageManifest.length, 12, 'twelve original manifest rows exist');
  for (const [index, image] of encoded.entries()) {
    assert.equal(createHash('sha256').update(image).digest('hex'), imageManifest[index].sha256,
      `embedded original ${index + 1} retains its exact source bytes`);
  }
  report.embeddedOriginalHashes = '12 exact matches';
  const origin = await serveExactHtml(); await save();
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  report.browserVersion = browser.version();
  for (const viewport of [{width: 1280, height: 720}, {width: 375, height: 812}]) {
    const context = await browser.newContext({viewport, deviceScaleFactor: 1});
    const page = await context.newPage(), errors = [], external = [], owned = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!/^https?:/i.test(request.url())) return;
      if (new URL(request.url()).origin === origin) owned.push({method: request.method(), url: request.url()});
      else external.push(request.url());
    });
    await page.route(/^https?:/i, route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    const item = {viewport, status: 'running', pageErrors: errors, externalRequests: external,
      ownedRequests: owned, checks: []};
    report.viewports.push(item); await save();
    const response = await page.goto(`${origin}/`);
    assert.equal(response.status(), 200, 'owned server supplied the HTML');
    const delivered = await response.body();
    assert.equal(Buffer.compare(bytes, delivered), 0, 'owned server delivered exact original HTML bytes');
    item.htmlResponse = {status: response.status(), bytes: delivered.length,
      sha256: createHash('sha256').update(delivered).digest('hex')};
    await page.evaluate(() => document.fonts.ready);
    item.images = await page.evaluate(async () => Promise.all([...document.images].map(async image => {
      await image.decode();
      return {alt: image.alt, embeddedPng: image.src.startsWith('data:image/png;base64,'),
        complete: image.complete, width: image.naturalWidth, height: image.naturalHeight,
        declaredWidth: Number(image.getAttribute('width')), declaredHeight: Number(image.getAttribute('height'))};
    })));
    assert.equal(item.images.length, 12, 'all twelve images exist');
    for (const [index, image] of item.images.entries()) {
      assert.equal(image.embeddedPng, true, 'image uses its embedded original PNG');
      assert.equal(image.complete, true, 'image decoded completely');
      assert.equal(image.width, imageManifest[index].width, `original width preserved: ${image.alt}`);
      assert.equal(image.height, imageManifest[index].height, `original height preserved: ${image.alt}`);
      assert.equal(image.width, image.declaredWidth, `declared width matches native: ${image.alt}`);
      assert.equal(image.height, image.declaredHeight, `declared height matches native: ${image.alt}`);
    }
    assert.equal(await page.getByRole('tablist', {includeHidden: true}).count(), 3, 'three independent tablists exist');
    item.checks.push(await exercise(page, 'Viewport'));
    item.checks.push(await exercise(page, 'Desktop scene'));
    await page.locator('#phone-tab').click(); await inspect(page, 'Viewport', 'phone-tab');
    item.checks.push(await exercise(page, 'Phone scene'));
    const finalTab = viewport.width === 375 ? 'phone-tab' : 'desktop-tab';
    await page.locator(`#${finalTab}`).click(); await inspect(page, 'Viewport', finalTab);
    item.finalSelectedViewportTab = finalTab;
    assert.deepEqual(errors, [], 'zero JavaScript page errors');
    assert.deepEqual(external, [], 'zero external HTTP requests');
    item.screenshot = `comparison-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({path: path.join(out, item.screenshot), fullPage: true});
    item.status = 'passed'; await save();
    await log({viewport, status: item.status, decodedImages: item.images.length,
      tablists: item.checks.length, actions: item.checks.reduce((n, check) => n + check.steps.length, 0),
      pageErrors: errors.length, externalRequests: external.length});
    await context.close();
  }
  assert.ok(report.ownedHttpRequests.every(request => request.status === 200 && request.path === '/'
    || request.status === 204 && request.path === '/favicon.ico'), 'only the owned document/favicon were requested');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = {name: error.name, message: error.message};
  await log({status: 'failed', error: report.error});
  process.exitCode = 1;
} finally {
  if (browser) {
    try { await browser.close(); }
    catch (error) {
      report.closeError = {name: error.name, message: error.message};
      report.status = 'failed'; process.exitCode = 1;
    }
  }
  if (server?.listening) {
    try {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
      });
      report.httpServerClosed = true;
    } catch (error) {
      report.serverCloseError = {name: error.name, message: error.message};
      report.status = 'failed'; process.exitCode = 1;
    }
  }
  report.finished = new Date().toISOString(); await save();
  console.log(JSON.stringify({status: report.status, source, report: path.join(out, 'report.json')}));
}
