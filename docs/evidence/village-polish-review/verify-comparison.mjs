// Verify this offline review document through real loopback HTTP and native browser input.
// Requires the checkout's locked frontend dependencies. Run: node verify-comparison.mjs <output>
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve, join} from 'node:path';

assert.ok(process.argv[2], 'usage: node verify-comparison.mjs <output>');
const root = fileURLToPath(new URL('.', import.meta.url)), out = resolve(process.argv[2]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(join(root, 'manifest.json'));
const manifest = JSON.parse(manifestBytes), html = await readFile(join(root, 'comparison.html'));
assert.equal(sha(html), manifest.files['comparison.html'].sha256, 'HTML matches its recorded bytes');
const paths = [...html.toString().matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
assert.equal(paths.length, 12); assert.equal(new Set(paths).size, 12);
const files = new Map([['/comparison.html', html]]);
for (const path of paths) {
  assert.ok(!path.startsWith('/') && !path.includes('..') && path.endsWith('.png'));
  const bytes = await readFile(join(root, path)), expected = manifest.files[path];
  assert.ok(expected, `image is in the manifest: ${path}`);
  assert.equal(sha(bytes), expected.sha256); assert.equal(bytes.length, expected.bytes);
  assert.equal(bytes.readUInt32BE(16), expected.width); assert.equal(bytes.readUInt32BE(20), expected.height);
  files.set(`/${path}`, bytes);
}
const require = createRequire(resolve(root, '../../../frontend/package.json'));
const {chromium} = require('playwright-core');
const unexpectedRequests = [], report = {htmlSha256: sha(html), manifestSha256: sha(manifestBytes),
  helperSha256: sha(await readFile(new URL(import.meta.url))), started: new Date().toISOString(), checks: []};
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const bytes = files.get(path);
  if (!bytes || request.method !== 'GET') {
    unexpectedRequests.push({path, method: request.method}); response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, {'Content-Type': path.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8',
    'Content-Length': bytes.length, 'Cache-Control': 'no-store'}); response.end(bytes);
});
let browser;
await mkdir(out, {recursive: true});
await writeFile(join(out, 'manifest-used.json'), manifestBytes);
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    const context = await browser.newContext({viewport: {width, height}}), page = await context.newPage();
    const errors = [], consoles = [], external = [], responses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', entry => { if (entry.type() === 'error') consoles.push(entry.text()); });
    await page.route('**/*', route => route.request().url().startsWith(`${base}/`)
      ? route.continue() : (external.push(route.request().url()), route.abort()));
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (!files.has(path)) return;
      responses.push(response.body().then(bytes => ({path, status: response.status(), sha256: sha(bytes)}),
        error => ({path, error: error.message})));
    });
    const document = await page.goto(`${base}/comparison.html`, {waitUntil: 'load'});
    assert.equal(document.status(), 200); assert.equal(sha(await document.body()), sha(html));
    const images = await page.locator('img').evaluateAll(async images => {
      await Promise.all(images.map(image => image.decode()));
      return images.map(image => ({path: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight,
        declaredWidth: Number(image.getAttribute('width')), declaredHeight: Number(image.getAttribute('height'))}));
    });
    assert.equal(images.length, 12);
    for (const image of images) {
      const expected = manifest.files[image.path];
      assert.deepEqual([image.width, image.height], [expected.width, expected.height]);
      assert.deepEqual([image.declaredWidth, image.declaredHeight], [expected.width, expected.height]);
    }
    const lists = page.locator('[role=tablist]'); assert.equal(await lists.count(), 3); let actions = 0;
    for (let group = 0; group < 3; group++) {
      if (group > 0) { await lists.nth(0).getByRole('tab').nth(group - 1).click(); actions++; }
      const tabs = lists.nth(group).getByRole('tab'), count = await tabs.count();
      assert.equal(count, group === 0 ? 2 : 3);
      for (let index = 0; index < count; index++) {
        await tabs.nth(index).click(); actions++; await checkSelection(page, tabs, index);
      }
      let selected = count - 1;
      for (const key of ['Home', 'ArrowLeft', 'ArrowRight', 'End', 'ArrowRight', 'Home', 'End']) {
        await page.keyboard.press(key); actions++;
        selected = key === 'Home' ? 0 : key === 'End' ? count - 1
          : (selected + (key === 'ArrowRight' ? 1 : count - 1)) % count;
        await checkSelection(page, tabs, selected);
      }
    }
    await lists.nth(0).getByRole('tab').nth(0).click(); actions++;
    await page.keyboard.press('Home'); actions++; await checkSelection(page, lists.nth(0).getByRole('tab'), 0);
    assert.equal(actions, 33);
    const received = await Promise.all(responses); assert.equal(received.length, 13);
    assert.equal(new Set(received.map(row => row.path)).size, 13);
    for (const row of received) { assert.ok(!row.error, row.error); assert.equal(row.status, 200); assert.equal(row.sha256, sha(files.get(row.path))); }
    assert.deepEqual(errors, []); assert.deepEqual(consoles, []); assert.deepEqual(external, []);
    report.checks.push({width, height, decodedImages: images.length, tablists: 3, actions, responses: received,
      pageErrors: errors, consoleErrors: consoles, externalRequests: external}); await context.close();
  }
  assert.deepEqual(unexpectedRequests, []); assert.equal(sha(await readFile(join(root, 'manifest.json'))), sha(manifestBytes));
  for (const [path, bytes] of files) assert.equal(sha(await readFile(join(root, path.slice(1)))), sha(bytes));
  report.exitCode = 0;
  console.log('PASS: exact HTML and 12 original images; 3 tablists / 33 real actions per viewport; no page, console or external errors');
} catch (error) { report.exitCode = 1; report.error = error.message; throw error; }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  report.finished = new Date().toISOString(); await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}

async function checkSelection(page, tabs, selected) {
  for (let index = 0; index < await tabs.count(); index++) {
    const tab = tabs.nth(index), active = index === selected, panel = await tab.getAttribute('aria-controls');
    assert.equal(await tab.getAttribute('aria-selected'), String(active));
    assert.equal(await tab.getAttribute('tabindex'), active ? '0' : '-1');
    assert.equal(await page.locator(`#${panel}`).isVisible(), active);
    if (active) assert.equal(await page.evaluate(() => document.activeElement.id), await tab.getAttribute('id'));
  }
}
