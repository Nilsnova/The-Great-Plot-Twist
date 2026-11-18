// Actual local-game paid progression evidence. The declared fake starting funds are not a live save.
// Run: node scripts/capture-paid-wall-tiers.mjs <runtime-frontend> <output> <expected-tree-baseline>
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubOfflineApi} from './api-browser-fixture.js';
import {boot, groundPoint, manage, settleCards, village, wallet, wallRenderEvidence} from './perimeter-game-ui.mjs';

const runtime = resolve(process.argv[2]), out = resolve(process.argv[3]);
const treeBaseline = Number(process.argv[4]);
assert.ok([.7, 1].includes(treeBaseline), 'declare the expected pre/post visual tree baseline');
const git = value => execFileSync('git', ['rev-parse', value], {cwd: runtime, encoding: 'utf8'}).trim();
const assertClean = () => assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'public', 'tests/fixtures'],
  {cwd: runtime, encoding: 'utf8'}).trim(), '', 'runtime source, artwork and fixtures match their committed snapshot');
assertClean();
const source = git('HEAD'), sourceTree = git('HEAD:frontend/src');
const treesBefore = [[-15, 6], [-16, 0], [-13, -12], [-9, -17], [9, -17], [15, -8], [16, 2], [14, 11], [-12, 13]];
const ring = JSON.parse(await readFile(join(runtime, 'tests/fixtures/perimeter-ring.json'), 'utf8')).cells;
const court = JSON.parse(await readFile(join(runtime, 'tests/fixtures/reference-court.json'), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const helperHash = sha(await readFile(new URL(import.meta.url)));
const fixtureHashes = {};
for (const file of ['perimeter-ring.json', 'reference-court.json']) fixtureHashes[file] = sha(await readFile(join(runtime, 'tests/fixtures', file)));
const helperSources = {};
for (const file of ['api-browser-fixture.js', 'perimeter-game-ui.mjs']) {
  const actual = sha(await readFile(new URL(file, import.meta.url)));
  assert.equal(actual, sha(await readFile(join(runtime, 'scripts', file))), 'imported helper matches the runtime snapshot');
  helperSources[file] = actual;
}
await mkdir(out, {recursive: true});
const server = await createServer({root: runtime, configFile: false, envDir: false, logLevel: 'error',
  cacheDir: await mkdtemp(join(tmpdir(), 'paid-wall-tiers-')),
  define: {__BUILD_STAMP__: JSON.stringify({sha: source, builtAt: new Date().toISOString()})},
  server: {host: '127.0.0.1', port: 0, hmr: false}});
const checks = []; let browser, page;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    const context = await browser.newContext({viewport: {width, height}});
    page = await context.newPage();
    const errors = [], external = [], consoleErrors = [], responseErrors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', entry => { if (entry.type() === 'error') consoleErrors.push({text: entry.text(), location: entry.location()}); });
    page.on('response', response => { if (response.status() >= 400) responseErrors.push({status: response.status(), url: response.url()}); });
    await page.route('**/*', route => route.request().url().startsWith(base)
      ? route.continue() : (external.push(route.request().url()), route.abort()));
    await stubOfflineApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('plot_twist_front_door_v1', '1');
      localStorage.setItem('plot_twist_island_arrival_v1', '1');
      localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
    });
    await page.clock.install();
    await boot(page, `${base}/?islands=fake&fakeworld=paid_tiers&fakeplayer=me&fakeflags=perimeter_walls,wall_recovery`);
    await page.evaluate(async () => {
      const g = window.__island, island = g.island;
      await island.dev.setCoins(50000); await island.dev.setWaveBest(40); await island.load();
      g.settings.hour = 11; g.settings.fastTime = false; g.quality('high');
      g.player.position.set(8.5, 1.03, 12.8); g.view.setPlace('home_islet', g.player.position);
    });
    await settleCards(page); await manage(page);
    const trees = [];
    for (let houses = 0; houses <= 2; houses++) {
      if (houses > 0) {
        const answer = await page.evaluate(async spot => {
          const island = window.__island.island, result = await island.api.build({spot, kind: 'house'});
          if (result.ok) await island.load(); return result;
        }, `house_${houses}`);
        assert.equal(answer.ok, true, 'real house purchase succeeds');
      }
      await settleCards(page);
      const expected = treeBaseline * [1, 1.1, 1.2][houses];
      await page.waitForFunction(scale => {
        const rows = [];
        window.__island.world.current.group.traverse(mesh => {
          if (['oak', 'pine', 'birch'].includes(mesh.userData.asset)) rows.push(mesh);
        });
        return rows.length === 9 && rows.every(mesh => Math.abs(mesh.scale.x - scale) < 1e-9);
      }, expected);
      const state = await treeState(page);
      assert.equal(state.houses, houses); assert.equal(state.trees.length, 9);
      assert.equal(state.colliders.length, 9);
      assert.deepEqual(state.trees.map(row => [row.ground.x, row.ground.z]), treesBefore);
      for (const [index, tree] of state.trees.entries()) {
        assert.equal(tree.asset, ['oak', 'pine', 'birch'][index % 3]);
        assert.ok(tree.scale.every(value => Math.abs(value - expected) < 1e-9));
        assert.equal(tree.order, 100 + tree.ground.z);
        assert.ok(Math.abs(tree.position[0] - (1.3 * tree.ground.x + .2 * tree.ground.z)) < 1e-9);
        assert.ok(Math.abs(tree.position[1] - -.6 * tree.ground.z) < 1e-9);
        assert.equal(tree.position[2], 0);
        assert.ok(state.colliders.some(row => row.x === tree.ground.x && row.z === tree.ground.z && row.radius === .48));
      }
      if (houses > 0) {
        assert.deepEqual(state.colliders, trees[0].colliders, 'house growth never moves a blocker');
        const anchors = rows => rows.map(({asset, ground, position, order}) => ({asset, ground, position, order}));
        assert.deepEqual(anchors(state.trees), anchors(trees[0].trees), 'house growth retains the original mesh foot and order');
      }
      trees.push({...state, capture: await screenshot(page, `houses-${houses}-${width}x${height}.png`)});
    }
    await page.evaluate(async () => {
      const island = window.__island.island;
      for (const [spot, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'mortar'], ['cannon_3', 'cannon'], ['cannon_4', 'harpoon'], ['tower_1', 'watchtower']]) {
        const result = await island.api.build({spot, kind});
        if (!result.ok) throw Error(`Real paid building refused: ${spot}`);
      }
      await island.load();
    });
    await settleCards(page);
    const buildings = await wallet(page); assert.equal(buildings.coins, 49700);
    const outer = await buildWalls(page, ring);
    const moves = await page.evaluate(async rows => {
      const island = window.__island.island, receipts = [];
      for (const [spot, x, z] of rows) {
        if (!island.startMove(spot)) throw Error(`Actual Move did not open: ${spot}`);
        island.moveMode.tap(x, z);
        if (!island.moveMode.state.ok) throw Error(`Actual Move refused: ${spot}`);
        const answer = await island.moveMode.confirm();
        if (!answer?.ok) throw Error(`Actual Move did not commit: ${spot}`);
        receipts.push({spot, x, z, status: answer.status, coins: answer.data.coins});
      }
      return receipts;
    }, court.moves);
    const inner = await buildWalls(page, court.cells);
    await settleCards(page);
    const paid = await wallet(page); assert.equal(paid.coins, 48470); assert.equal(paid.walls.length, 123);
    const positions = paid.walls.map(({id, x, z}) => ({id, x, z}));
    const levels = [];
    for (let level = 1; level <= 5; level++) {
      const receipts = level === 1 ? [] : await upgradeWalls(page, level, [0, 0, 20, 40, 80, 160][level]);
      await settleCards(page);
      await village(page).getByRole('button', {name: 'Working village view', exact: true}).click();
      await page.waitForTimeout(1000);
      const current = await wallet(page), render = await wallRenderEvidence(page);
      assert.deepEqual(current.walls.map(({id, x, z}) => ({id, x, z})), positions);
      assert.ok(current.walls.every(row => row.level === level));
      assert.equal(render.world.posts.length, 123);
      assert.ok(render.world.posts.every(row => row.level === level), 'actual rendered posts show the paid tier');
      assert.ok(render.world.links.length > 0 && render.world.links.every(row => row.level === level), 'actual rendered links show the paid tier');
      const bufferHash = sha(JSON.stringify(render.world.meshes.map(row => ({order: row.order, sha256: row.bufferSha256}))));
      if (level > 1) assert.notEqual(bufferHash, levels.at(-1).bufferHash, 'a paid tier changes actual geometry/UV buffers');
      if (level > 1) assert.equal(levels.at(-1).paid.coins - current.coins, 123 * [0, 0, 20, 40, 80, 160][level]);
      levels.push({level, receipts, paid: current, render, bufferHash, capture: await screenshot(page, `paid-level-${level}-${width}x${height}.png`)});
    }
    assert.equal(levels.at(-1).paid.coins, 11570);
    const max = await page.evaluate(() => window.__island.island.api.upgrade({spot: 'wall_1'}));
    assert.equal(max.ok, false, 'level five retains the existing upgrade limit');
    assert.equal(max.status, 409); assert.equal(max.code, 'max_level');
    await page.evaluate(() => window.__island.island.load());
    assert.deepEqual(await wallet(page), levels.at(-1).paid, 'refused extra upgrade never charges or moves a wall');
    const point = await groundPoint(page, [paid.walls[0].x, paid.walls[0].z], .4);
    if (width === 375) await page.evaluate(row => window.__island.view.focusVillage({...row, lift: 1}), paid.walls[0]);
    await page.waitForTimeout(1000);
    const selectedPoint = width === 375 ? await groundPoint(page, [paid.walls[0].x, paid.walls[0].z], .4) : point;
    await page.mouse.click(selectedPoint.x, selectedPoint.y);
    await page.locator('.island-selection-dock').waitFor();
    assert.match(await page.locator('.island-selection-dock').innerText(), /Level 5/);
    assert.equal(await page.evaluate(() => window.__island.island.selection.spotId), paid.walls[0].id, 'pointer selects the exact intended wall');
    const selected = await screenshot(page, `paid-selected-level-5-${width}x${height}.png`);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    for (const response of responseErrors) assert.ok(response.status === 503 && response.url.startsWith(`${base}/api/`), 'only the declared offline API can fail');
    for (const entry of consoleErrors) assert.ok(entry.text.includes('Failed to load resource:') && entry.text.includes('503')
      && responseErrors.some(row => row.status === 503 && row.url === entry.location.url), 'only a proven offline API 503 console error is expected');
    checks.push({width, height, trees, outer, moves, inner, levels, maxRefusal: {status: max.status, code: max.code}, selected,
      pageErrors: errors, externalRequests: external, consoleErrors, responseErrors});
    await context.close(); page = null;
  }
  assert.equal(git('HEAD'), source, 'runtime remained frozen');
  assertClean();
  await writeFile(join(out, 'report.json'), JSON.stringify({source, sourceTree, helperHash, helperSources, fixtureHashes, treeBaseline,
    publicTree: git('HEAD:frontend/public'), backendTree: git('HEAD:backend'), migrationsTree: git('HEAD:supabase/migrations'),
    scope: 'actual local fake API progression, not production persistence or an art-only fixture',
    declaredSetup: '50000 coins and best wave40; all buildings/walls/upgrades/moves use existing actual actions; 123 level5 walls leave11570', checks}, null, 2));
  console.log('PASS: both viewports; nine tree anchors at zero/one/two houses; 123 paid walls through all five tiers; 492 upgrade receipts per viewport; level limit preserves coins/positions');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({path: join(out, 'failure.png')}).catch(() => {});
  await writeFile(join(out, 'failure.json'), JSON.stringify({source, sourceTree, helperHash, message: error.message}, null, 2));
  throw error;
} finally { await browser?.close(); await server.close(); }

async function treeState(page) {
  return page.evaluate(() => {
    const place = window.__island.world.current, trees = [];
    place.group.traverse(mesh => {
      if (['oak', 'pine', 'birch'].includes(mesh.userData.asset)) trees.push({asset: mesh.userData.asset,
        ground: {...mesh.userData.ground}, position: mesh.position.toArray(), scale: mesh.scale.toArray(), order: mesh.renderOrder});
    });
    return {houses: window.__island.island.island.spots.filter(row => row.built && row.kind === 'house').length,
      trees, colliders: place.colliders.filter(row => row.radius === .48).map(row => ({...row}))};
  });
}
async function buildWalls(page, cells) {
  return page.evaluate(async cells => {
    const island = window.__island.island, receipts = [];
    for (let start = 0; start < cells.length; start += 32) {
      if (!await island.startWalls()) throw Error('Actual wall builder did not open');
      for (const [x, z] of cells.slice(start, start + 32)) if (!island.wallBuilder.tap(x, z)) throw Error('Actual wall draft refused');
      const quote = await island.wallBuilder.quote(); if (!quote?.ok) throw Error('Actual paid quote refused');
      const built = await island.wallBuilder.confirm(); if (!built?.ok) throw Error('Actual wall payment refused');
      receipts.push({quote: quote.data, response: built.data});
    }
    return receipts;
  }, cells);
}
async function upgradeWalls(page, level, cost) {
  return page.evaluate(async ({level, cost}) => {
    const island = window.__island.island, receipts = [];
    let coins = island.island.coins;
    for (const wall of island.island.spots.filter(row => row.built && row.kind === 'wall')) {
      const answer = await island.api.upgrade({spot: wall.id});
      if (!answer.ok) throw Error(`Actual tier upgrade refused: ${wall.id}`);
      const next = answer.data.spots.find(row => row.id === wall.id);
      if (next.level !== level || coins - answer.data.coins !== cost) throw Error('Actual tier/price differs');
      coins = answer.data.coins;
      receipts.push({spot: wall.id, level, paid: cost, coins});
    }
    await island.refreshDefended(); return receipts;
  }, {level, cost});
}
async function screenshot(page, name) {
  await page.waitForTimeout(250);
  const frame = await page.evaluate(() => {
    const g = window.__island;
    return {camera: g.camera.position.toArray(), zoom: g.camera.zoom, captain: g.player.position.toArray(),
      drawCalls: g.renderer.info.render.calls, contextLost: g.renderer.getContext().isContextLost(),
      quality: g.renderer.userData.quality, pixelRatio: g.renderer.getPixelRatio()};
  });
  assert.equal(frame.contextLost, false); assert.ok(frame.drawCalls > 0);
  assert.equal(frame.quality, 'high', 'proof retains high graphics quality');
  await page.screenshot({path: join(out, name)});
  return {name, sha256: sha(await readFile(join(out, name))), ...frame};
}
