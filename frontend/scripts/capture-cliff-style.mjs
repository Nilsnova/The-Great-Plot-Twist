// Actual local game only: node scripts/capture-cliff-style.mjs <frontend-root> <out> <before|after>.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {stubOfflineApi} from './api-browser-fixture.js';
const root = resolve(process.argv[2]), out = resolve(process.argv[3]), mode = process.argv[4];
assert.ok(['before', 'after'].includes(mode)); await mkdir(out, {recursive: true});
const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const server = await createServer({configFile: false, envDir: false, root, logLevel: 'error', cacheDir: await mkdtemp(join(tmpdir(), 'cliff-trial-')),
  define: {__BUILD_STAMP__: JSON.stringify({sha: source, builtAt: '2026-11-17T12:00:00Z'})}, server: {host: '127.0.0.1', port: 0, hmr: false}});
async function settleCards(page) {
  for (let i = 0, calm = 0; i < 100 && calm < 8; i++) {
    const skipAll = page.getByRole('button', {name: /^Skip all/}), got = page.getByRole('button', {name: 'Got it', exact: true});
    const narrator = page.getByRole('button', {name: 'Skip the narrator', exact: true});
    if (await skipAll.count()) { calm = 0; await skipAll.first().click(); }
    else if (await got.count()) { calm = 0; await got.first().click(); }
    else if (await page.locator('dialog[open]').count()) { calm = 0; await page.keyboard.press('Escape'); }
    else if (await narrator.isVisible()) {
      calm = 0;
      const point = await narrator.evaluate(node => {
        const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        return node.contains(document.elementFromPoint(x, y)) ? {x, y} : null;
      });
      // A normal pointer click at the currently hit-tested position tolerates the moving caption.
      if (point) await page.mouse.click(point.x, point.y);
    }
    else calm++;
    await page.waitForTimeout(100);
  }
  assert.equal(await page.locator('dialog[open]').count(), 0);
}
async function capture(page, width, height, view) {
  const qualityBefore = await page.evaluate(() => ({...window.__island.renderer.userData}));
  await page.evaluate(() => { window.__island.quality('low'); window.__island.quality('high'); });
  await page.waitForTimeout(80);
  const state = await page.evaluate(() => {
    const g = window.__island; return {camera: g.camera.position.toArray(), zoom: g.camera.zoom, captain: g.player.position.toArray(),
      contextLost: g.renderer.getContext().isContextLost(), drawCalls: g.renderer.info.render.calls, rendering: {...g.renderer.userData},
      memory: {...g.renderer.info.memory}};
  });
  assert.equal(state.contextLost, false); assert.ok(state.drawCalls > 0);
  const name = `${mode}-${view}-${width}x${height}.png`; await page.screenshot({path: join(out, name)});
  return {width, height, name, view, qualityBefore, ...state};
}
let browser; const checks = [];
try {
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    const context = await browser.newContext({viewport: {width, height}}), page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : (external.push(route.request().url()), route.abort()));
    await stubOfflineApi(page);
    await page.addInitScript(() => {
      localStorage.setItem('plot_twist_front_door_v1', '1'); localStorage.setItem('plot_twist_island_arrival_v1', '1');
      localStorage.setItem('tgpt:tutorials:v1', JSON.stringify({version: 1, guided: true, seen: [], games: {}}));
    });
    await page.goto(`${base}/?islands=fake&fakeplayer=cliff-preview`); await page.locator('#play').click();
    await page.getByRole('button', {name: 'Create a game', exact: true}).click(); await page.getByRole('button', {name: 'Start', exact: true}).click();
    await page.waitForFunction(() => window.__island?.waves && !document.querySelector('dialog[open]'));
    await page.evaluate(async () => {
      const g = window.__island, i = g.island; g.settings.hour = 11; g.settings.fastTime = false;
      i.dev.setCoins(8000); i.dev.setWaveBest(40); await i.load();
      for (const spot of i.island.spots) if (spot.id.startsWith('wall_')) await i.build(spot.id, 'wall');
      for (const [id, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'mortar'], ['cannon_3', 'cannon'], ['cannon_4', 'harpoon'], ['tower_1', 'watchtower'], ['house_1', 'house'], ['house_2', 'house']]) await i.build(id, kind);
      g.player.position.set(-7, 1.03, -11); g.view.setPlace('home_islet', g.player.position);
    });
    await settleCards(page); await page.waitForFunction(() => window.__island.world.current?.group.visible === true);
    await page.keyboard.press('Escape'); await page.getByRole('button', {name: 'Manage village', exact: true}).click();
    await page.locator('.island-village-mode:not([hidden])').waitFor(); await page.waitForTimeout(1800);
    const overview = await capture(page, width, height, 'overview');
    await page.getByRole('button', {name: 'Exit village mode', exact: true}).click();
    await page.evaluate(() => { const g = window.__island; g.player.position.set(-10, 1.03, 17); g.view.setPlace('home_islet', g.player.position); });
    await settleCards(page); await page.waitForTimeout(1000);
    const detail = await capture(page, width, height, 'shore');
    const terrain = await page.evaluate(async selected => {
      const g = window.__island, {surfaceClass, placeGround} = await import('/src/world/places/surfaces.js');
      let image; g.world.current.group.traverse(object => {
        if (!image && object.geometry?.parameters?.width === 64 && object.geometry?.parameters?.height === 48) image = object.material?.map?.image;
      });
      if (!image?.getContext) throw new Error('actual home backdrop is not the Canvas terrain');
      const alpha = (x, y) => image.getContext('2d').getImageData(Math.round((x + 32) / 64 * image.width), Math.round((y + 24) / 48 * image.height), 1, 1).data[3];
      const placed = (await import('/src/island/placement.js')).positionsOf(g.island.island.spots);
      const feet = g.island.island.spots.filter(spot => spot.built && spot.kind === 'wall').map(spot => ({id: spot.id, ...placed[spot.id]}));
      feet.push({id: 'captain', x: g.player.position.x, z: g.player.position.z});
      const supportedFeet = feet.map(p => ({...p, onTop: surfaceClass('home_islet', p.x, p.z) > 0, opaqueTop: alpha(p.x, p.z * .72) >= 250}));
      let decorativeOutside = [], foamAtBase = 0;
      if (selected) {
        const {cliffProfile} = await import('/src/art/coast-cliffs.js'), {seaUniforms} = await import('/src/world/water.js');
        for (const p of cliffProfile((await import('/src/world/places/surfaces.js')).surfaces.home_islet)) {
          const y = p.y + p.depth * .55, z = y / .72;
          if (surfaceClass('home_islet', p.x, z) !== 0 || alpha(p.x, y) < 200) continue;
          decorativeOutside.push({x: p.x, z, walkingHeight: placeGround('home_islet')(p.x, z)});
          const x = Math.floor((p.x + 32) / 64 * 256), row = Math.floor((24 - y) / 48 * 192);
          if (seaUniforms.uCoast.value.image.data[row * 256 + x] === 0) foamAtBase++;
        }
      }
      return {supportedFeet, decorativeOutsideCount: decorativeOutside.length, decorativeAllUnwalkable: decorativeOutside.every(p => p.walkingHeight === -1), foamAtDecorativeBaseCount: foamAtBase, image: [image.width, image.height]};
    }, mode === 'after');
    assert.ok(terrain.supportedFeet.every(p => p.onTop && p.opaqueTop), 'every built wall and captain foot remains on opaque canonical top');
    if (mode === 'after') { assert.ok(terrain.decorativeOutsideCount > 10); assert.equal(terrain.decorativeAllUnwalkable, true); assert.ok(terrain.foamAtDecorativeBaseCount > 10); }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    checks.push({width, height, overview, detail, terrain, pageErrors: errors, externalRequests: external.length});
    await context.close();
  }
  await writeFile(join(out, `${mode}-report.json`), JSON.stringify({mode, source, root, fixture: 'actual local Chromium game; fake API, declared progression/builds/captain view; high quality via existing preference', checks}, null, 2) + '\n');
  console.log(`${mode}: 2 viewports / 4 actual screenshots; foot/top, decorative alpha and foam checks; 0 page errors / 0 external requests`);
} finally { await browser?.close(); await server.close(); }
