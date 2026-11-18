// Production Harbor timer, native focus and muted-limit contrast; exported for the browser regression.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {openWorldBrowser} from './world-browser-tools.js';

export async function probeMarketRefresh(page, {url, output, before = false}) {
  await page.route('**/base52-probe', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><div id="game"></div>'}));
  await page.goto(url + '/base52-probe');
  await page.clock.install();
  await page.addScriptTag({type: 'module', content: 'window.base52Import = path => import(path);'});
  await page.waitForFunction(() => typeof window.base52Import === 'function');
  await page.evaluate(async () => {
    await window.base52Import('/src/ui/base.css'); await window.base52Import('/src/ui/kit/kit.css');
    await window.base52Import('/src/ui/kit/components.css');
    const fx = await window.base52Import('/tests/harbor/fixtures.js');
    const {createMarketEntry} = await window.base52Import('/src/harbor/market-card.js');
    const h = await window.base52Import('/scripts/a11y-helpers.js'), adapter = fx.fakeCalls({stocks: 'open'});
    const entry = createMarketEntry({container: document.querySelector('#game'), adapter, now: () => fx.NOW});
    window.base52 = {h, adapter, entry}; await entry.open();
  });
  const panel = page.locator('.harbor-market[open]');
  const asset = panel.locator('[data-asset="tidewright-works"]');
  await asset.getByRole('button', {name: 'Up, Ether', exact: true}).click();
  await asset.getByRole('button', {name: '10 %, Ether', exact: true}).click();
  await asset.getByRole('button', {name: 'Place 🪙 10 on Up, Ether', exact: true}).click();
  await asset.locator('.harbor-notice').filter({hasText: 'Your 🪙 10 is on Up.'}).waitFor();
  const key = 'tidewright-works:less';
  const initial = await panel.evaluate((root, {key, before}) => {
    const s = window.base52, controls = s.h.tabbableForAudit(root);
    const held = controls.find(el => el.dataset.key === key);
    const snapshot = before ? null : s.h.snapshotFocusForAudit(root);
    if (before) controls.forEach((el, index) => { el.dataset.a11yOrder = String(index); });
    held.focus(); Object.assign(s, {root, held, snapshot, index: controls.indexOf(held)});
    return {key: held.dataset.key, name: held.getAttribute('aria-label'), index: s.index,
      reads: s.adapter.requests.filter(request => request[0] === 'read').length};
  }, {key, before});
  // Run the production setInterval callback, including its asynchronous read/render, at 15 seconds.
  await page.clock.runFor(15001);
  const refresh = await page.evaluate(() => {
    const s = window.base52;
    return {replaced: !s.held.isConnected, key: document.activeElement.dataset.key,
      oldMarker: document.activeElement.dataset.a11yOrder ?? null,
      reads: s.adapter.requests.filter(request => request[0] === 'read').length};
  });
  assert.equal(refresh.replaced, true); assert.equal(refresh.key, initial.key);
  assert.equal(refresh.oldMarker, null); assert.equal(refresh.reads, initial.reads + 1);
  await page.keyboard.press('Tab');
  const tab = await panel.evaluate((root, before) => {
    const s = window.base52, controls = s.h.tabbableForAudit(root), active = document.activeElement;
    return before ? {domOrder: active === controls[s.index + 1], key: active.dataset.key,
      oldAuditWouldPass: active.dataset.a11yOrder === String(s.index + 1)}
      : s.h.focusStepForAudit(root, s.snapshot, s.index + 1);
  }, before);
  assert.equal(tab.domOrder, true);
  assert.equal(before ? tab.key : tab.actual.key, 'tidewright-works:more');
  if (before) assert.equal(tab.oldAuditWouldPass, false);
  else { assert.equal(tab.inside, true); assert.equal(tab.visible, true); }

  const limit = asset.locator('[data-step="less"]');
  const amountBefore = await asset.locator('.harbor-amount-value').textContent();
  await limit.focus(); await page.keyboard.press('Enter');
  assert.equal(await asset.locator('.harbor-amount-value').textContent(), amountBefore);
  assert.equal(await limit.getAttribute('aria-disabled'), 'true'); assert.equal(await limit.isDisabled(), true);
  assert.equal(await limit.evaluate(el => el.disabled), false);
  assert.equal(await page.evaluate(() => window.base52.adapter.requests.filter(row => row[0] === 'place').length), 1);
  const contrast = [];
  for (const [width, height] of [[1280, 720], [375, 812], [320, 900]]) {
    await page.setViewportSize({width, height}); await limit.scrollIntoViewIfNeeded();
    contrast.push(await limit.evaluate((el, width) => {
      const h = window.base52.h, style = getComputedStyle(el), ancestors = [];
      for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
      let background = {r: 255, g: 255, b: 255, a: 1};
      for (const node of ancestors) background = h.compositeColour(h.parseColour(getComputedStyle(node).backgroundColor), background);
      const foreground = h.parseColour(style.color);
      for (const node of ancestors) foreground.a *= Number(getComputedStyle(node).opacity);
      return {width, key: el.dataset.key, name: el.getAttribute('aria-label'), ariaDisabled: el.getAttribute('aria-disabled'),
        opacity: style.opacity, colour: style.color, background, ratio: h.contrastRatio(foreground, background)};
    }, width));
    if (output && width !== 320) await page.screenshot({path: join(output, `market-${width}x${height}.png`)});
  }
  assert.ok(contrast.every(row => before ? row.ratio < 4.5 : row.ratio >= 4.5), JSON.stringify(contrast));
  await panel.evaluate(root => window.base52.h.tabbableForAudit(root).at(-1).focus());
  await page.keyboard.press('Tab');
  assert.equal(await panel.evaluate(root => root.contains(document.activeElement)), true);
  await page.evaluate(() => window.base52.entry.dispose());
  return {fixture: 'Production market entry with declared 100-coin calls fixture; actual 10-coin call; real 15-second refresh under browser clock.',
    initial, refresh, tab, minimumAmountUnchanged: amountBefore, placeRequests: 1, contrast};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [frontend, destination, mode = 'after'] = process.argv.slice(2);
  assert.ok(frontend && destination && ['before', 'after'].includes(mode));
  const output = resolve(destination); await mkdir(output, {recursive: true}); process.chdir(resolve(frontend));
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const env = await openWorldBrowser({hmr: false});
  try {
    const result = await probeMarketRefresh(env.page, {url: env.url, output, before: mode === 'before'});
    assert.deepEqual(env.pageErrors, []); assert.deepEqual(env.external, []);
    await writeFile(join(output, 'report.json'), JSON.stringify({source, mode, ...result, pageErrors: env.pageErrors, external: env.external}, null, 2) + '\n');
    console.log(`PASS: ${mode} market refresh, semantic Tab, limit action and 3 contrast viewports.`);
  } finally { await env.close(); }
}
