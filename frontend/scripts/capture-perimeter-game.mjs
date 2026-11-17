// QA code and game source are separate: node scripts/capture-perimeter-game.mjs <runtime-frontend> <out>.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubOfflineApi} from './api-browser-fixture.js';
import {boot, builder, capture, groundPoint, hitButtons, manage, openBuilder, settleCards, village, wallet} from './perimeter-game-ui.mjs';
import {capturePerimeterWave} from './perimeter-game-wave.mjs';
const root = resolve(process.argv[2]), out = resolve(process.argv[3]), qaRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await mkdir(out, {recursive: true});
const head = path => execFileSync('git', ['rev-parse', 'HEAD'], {cwd: path, encoding: 'utf8'}).trim();
const source = head(root), fixtureSource = head(qaRoot), fixture = JSON.parse(await readFile(join(root, 'tests/pirates/fixtures/perimeter-ring.json'), 'utf8'));
const cells = (fixture.cells ?? fixture.ring).map(([x, z]) => ({x, z})); assert.equal(cells.length, 102);
const server = await createServer({root, configFile: false, envDir: false, logLevel: 'error', cacheDir: await mkdtemp(join(tmpdir(), 'perimeter-game-')),
  define: {__BUILD_STAMP__: JSON.stringify({sha: source, builtAt: '2026-11-17T12:00:00Z'})}, server: {host: '127.0.0.1', port: 0, hmr: false}});
let browser, active; const checks = [];
async function receipts(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('tgpt:fake-world:'));
    const world = JSON.parse(localStorage.getItem(key), (_, item) => item?.$map ? new Map(item.$map) : item?.$set ? new Set(item.$set) : item);
    return [...world.players.get('me').actions].filter(([key]) => key.startsWith('wall-run:')).map(([, value]) => value.receipt);
  });
}
try {
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    const context = await browser.newContext({viewport: {width, height}}), page = active = await context.newPage();
    const errors = [], external = [], consoleErrors = [], record = {width, height};
    console.log(`${width}x${height}: actual game boot`);
    page.on('pageerror', error => errors.push(error.message)); page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : (external.push(route.request().url()), route.abort()));
    await stubOfflineApi(page); await page.addInitScript(() => {
      for (const key of ['plot_twist_front_door_v1', 'plot_twist_island_arrival_v1']) if (!localStorage.getItem(key)) localStorage.setItem(key, '1');
      if (!localStorage.getItem('tgpt:tutorials:v1')) localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
    });
    await page.clock.install();
    await boot(page, `${base}/?islands=fake&fakeworld=perimeter_${width}&fakeplayer=me&fakeflags=perimeter_walls,wall_recovery`);
    await page.evaluate(async () => {
      const g = window.__island, i = g.island; g.settings.hour = 11; g.settings.fastTime = false;
      await i.dev.setCoins(8000); await i.dev.setWaveBest(40); await i.load();
      for (const [id, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'mortar'], ['cannon_3', 'cannon'], ['cannon_4', 'harpoon'], ['tower_1', 'watchtower'], ['house_1', 'house'], ['house_2', 'house']]) await i.build(id, kind);
      g.player.position.set(-7, 1.03, -11); g.view.setPlace('home_islet', g.player.position);
    });
    await settleCards(page); await manage(page);
    const initial = await wallet(page); assert.equal(initial.walls.length, 0);
    record.before = await capture(page, out, `before-construction-${width}x${height}.png`);
    record.villageButtons = await hitButtons(village(page));
    await village(page).getByRole('button', {name: 'Zoom in', exact: true}).click();
    await page.waitForFunction(zoom => window.__island.camera.zoom > zoom * 1.3, record.before.zoom);
    record.beforeWorking = await capture(page, out, `before-working-zoom-${width}x${height}.png`);
    await village(page).getByRole('button', {name: 'Fit village', exact: true}).click(); await page.waitForTimeout(1200);
    await openBuilder(page);
    const point = await groundPoint(page, [cells[0].x, cells[0].z]); await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.__island.island.wallBuilder.state?.cells.length === 1);
    await page.keyboard.press('ArrowUp');
    const pointerCells = await page.evaluate(() => window.__island.island.wallBuilder.state.cells); assert.deepEqual(pointerCells, cells.slice(0, 2));
    await builder(page).getByText('Fine position', {exact: true}).click();
    await builder(page).getByRole('button', {name: 'Shift draft one square east', exact: true}).click();
    assert.deepEqual(await page.evaluate(() => window.__island.island.wallBuilder.state.cells), cells.slice(0, 2).map(p => ({...p, x: p.x + .5})));
    await builder(page).getByRole('button', {name: 'Shift draft one square west', exact: true}).click();
    record.builderButtons = await hitButtons(builder(page));
    record.preview = await page.evaluate(() => {
      const group = window.__island.world.current.group.getObjectByName('island-wall-draft');
      return {visible: group.visible, ghosts: group.children.filter(n => n.name.startsWith('wall-draft:') && n.visible).length,
        gridVertices: group.getObjectByName('wall-draft-grid').geometry.attributes.position.count,
        polite: document.querySelector('.island-wall-builder [role=status]').getAttribute('aria-live')};
    });
    assert.equal(record.preview.ghosts, 2); assert.equal(record.preview.gridVertices, 40); assert.equal(record.preview.polite, 'polite');
    record.ghost = await capture(page, out, `unpaid-ghost-${width}x${height}.png`);
    await builder(page).getByRole('button', {name: 'Cancel', exact: true}).click(); assert.deepEqual(await wallet(page), initial);
    const paid = []; record.runs = []; console.log(`${width}x${height}: pointer/keyboard/fine grid and unpaid cancel passed`);
    for (let offset = 0; offset < cells.length; offset += 32) {
      const run = cells.slice(offset, offset + 32); await openBuilder(page);
      await page.evaluate(run => { for (const p of run) if (!window.__island.island.wallBuilder.tap(p.x, p.z)) throw new Error('public draft extension refused'); }, run);
      assert.deepEqual(await page.evaluate(() => window.__island.island.wallBuilder.state.cells), run);
      await builder(page).getByRole('button', {name: 'Get price', exact: true}).click();
      await page.waitForFunction(() => window.__island.island.wallBuilder.state?.phase === 'ready');
      const quote = await page.evaluate(() => window.__island.island.wallBuilder.state.quote), before = await wallet(page);
      assert.equal(quote.placements.length, run.length); assert.deepEqual(quote.placements.map(({x, z}) => ({x, z})), run);
      await builder(page).getByRole('button', {name: `Build for ${quote.totalCost} coins`, exact: true}).click();
      await page.waitForFunction(() => !window.__island.island.wallBuilder.active);
      const after = await wallet(page); assert.equal(before.coins - after.coins, quote.totalCost);
      paid.push(...quote.placements.map(({spot, x, z}) => ({id: spot, x, z, level: 1}))); assert.deepEqual(after.walls, paid);
      record.runs.push({pieces: run.length, quote, coinsBefore: before.coins, coinsAfter: after.coins});
      console.log(`${width}x${height}: paid ${run.length} walls (${after.walls.length}/102), ${quote.totalCost} coins`);
    }
    const saved = await wallet(page), storedReceipts = await receipts(page); assert.equal(storedReceipts.length, 4);
    assert.equal(new Set(storedReceipts.map(r => r.actionUid)).size, 4); record.receipts = storedReceipts;
    await boot(page, null, true); assert.deepEqual(await wallet(page), saved, 'actual reload retains paid positions, levels and wallet');
    assert.deepEqual(await receipts(page), storedReceipts); await manage(page);
    console.log(`${width}x${height}: actual reload retained four receipts, exact positions and wallet`);
    const p = await groundPoint(page, [paid[0].x, paid[0].z], .6); await page.mouse.click(p.x, p.y);
    const card = page.locator('.island-card-build[open]'); await card.waitFor();
    record.upgradeCard = await card.innerText(); assert.match(record.upgradeCard, /Wall/);
    await card.getByRole('button', {name: 'Upgrade', exact: true}).click();
    await page.waitForFunction(() => window.__island.island.island.spots.find(s => s.id === 'wall_1').level === 2);
    record.afterUpgrade = await wallet(page); assert.equal(saved.coins - record.afterUpgrade.coins, 20); await page.keyboard.press('Escape');
    await village(page).getByRole('button', {name: 'Fit village', exact: true}).click(); await page.waitForTimeout(1200);
    record.after = await capture(page, out, `after-construction-${width}x${height}.png`);
    const fitZoom = record.after.zoom, captain = record.after.captain;
    await village(page).getByRole('button', {name: 'Zoom in', exact: true}).click();
    await page.waitForFunction(zoom => window.__island.camera.zoom > zoom * 1.3, fitZoom);
    record.working = await capture(page, out, `working-zoom-${width}x${height}.png`);
    await village(page).getByRole('button', {name: 'Zoom out', exact: true}).click();
    await village(page).getByRole('button', {name: 'Fit village', exact: true}).click(); await page.waitForTimeout(1200);
    record.lateRefusal = await lateRefusal(page);
    assert.deepEqual(await page.evaluate(() => window.__island.player.position.toArray()), captain, 'village controls preserve captain');
    console.log(`${width}x${height}: upgrade/camera/late refusal passed; starting real frozen-demo bell`);
    record.wave = await capturePerimeterWave(page, out, width, height);
    const cannon = await page.evaluate(async () => (await import('/scripts/cannon-style-fixture.js')).verifyCannonStyle());
    record.cannon = {scope: cannon.scope, frames: cannon.results}; assert.equal(cannon.results.length, 40);
    for (const sheet of cannon.sheets) await writeFile(join(out, `supplementary-cannon-${width}-${sheet.density}.png`), Buffer.from(sheet.dataUrl.split(',')[1], 'base64'));
    assert.deepEqual(errors, []); assert.deepEqual(external, []); record.pageErrors = errors; record.consoleErrors = consoleErrors; record.externalRequests = external;
    checks.push(record); await writeFile(join(out, 'report.json'), JSON.stringify({source, fixtureSource, root,
      fixture: 'Funded/progressed local shared fake transport; real pointer/keyboard cancel proof, public-controller long drafts, real quote/pay/upgrade/reload and frozen local-demo bell. Time acceleration is browser clock only. No production claim.', checks}, null, 2) + '\n');
    await context.close(); active = null;
  }
  console.log('PASS: 2 actual-game viewports; 4 paid runs each / 102 exact walls, cancel/reload/upgrade/camera/refusal, frozen wave and 40 cannon frames each; 0 page errors / 0 external requests');
} catch (error) { await active?.screenshot({path: join(out, 'failure.png')}).catch(() => {}); throw error; }
finally { await browser?.close(); await server.close(); }

async function lateRefusal(page) {
  const old = await wallet(page);
  assert.equal(await page.evaluate(() => window.__island.island.startMove('house_1')), true);
  const bar = page.locator('.island-move-bar:not(.island-wall-builder):not([hidden])');
  await bar.getByRole('button', {name: 'One square east', exact: true}).click();
  await page.evaluate(() => {
    const api = window.__island.island.api; window.__perimeterSavedMove = api.move;
    api.move = () => new Promise(resolve => setTimeout(() => resolve({ok: false, status: 503, code: 'database_unavailable',
      message: 'Controlled local refusal: the island changed while this request was waiting. Keep this building where it stands, inspect the village and try again. '.repeat(3)}), 350));
  });
  const before = await bar.boundingBox(); await bar.getByRole('button', {name: 'Place here', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.island-move-bar:not(.island-wall-builder).is-refused')?.textContent.includes('Controlled local refusal'));
  await page.waitForTimeout(1300); const after = await bar.boundingBox(); assert.ok(after.y < before.y, 'late longer refusal updates the measured camera inset');
  const inset = await page.evaluate(async () => {
    const g = window.__island, {cliffProfile} = await import('/src/art/coast-cliffs.js'), {surfaces} = await import('/src/world/places/surfaces.js');
    const r = g.renderer.domElement.getBoundingClientRect(), barTop = document.querySelector('.island-move-bar:not(.island-wall-builder):not([hidden])').getBoundingClientRect().top;
    const topBottom = Math.max(...cliffProfile(surfaces.home_islet).map(p => {
      const v = g.player.position.clone().set(p.x, -p.y, 0).project(g.camera); return r.y + (1 - v.y) * r.height / 2;
    }));
    return {canonicalLandBottom: topBottom, barTop};
  });
  assert.ok(inset.canonicalLandBottom < inset.barTop - 4, 'actual Fit camera keeps the canonical shore above the late-refusal inset');
  assert.deepEqual(await wallet(page), old); const buttons = await hitButtons(bar);
  await page.evaluate(() => { window.__island.island.api.move = window.__perimeterSavedMove; delete window.__perimeterSavedMove; });
  await bar.getByRole('button', {name: 'Cancel', exact: true}).click();
  return {transport: 'explicit one-request local refusal wrapper; no persistence', before, after, inset, buttons, walletUnchanged: true};
}
