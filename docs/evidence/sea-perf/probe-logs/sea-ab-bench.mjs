// Sea outline evidence (perf/sea), run from frontend/: node ../docs/evidence/sea-perf/probe-logs/sea-ab-bench.mjs <out> <prefix>
// Same flow as scripts/capture-home-island-waves.mjs. At each phase it (1) renders one frozen frame with the old full
// 400 x 300 sea plane and with the sea outline and compares the pixels (control: the full plane nudged by 1/1000 unit),
// (2) times scene renders on that frozen frame (full plane / outline / detail off / sea hidden, alternating, 6 x 8 renders),
// (3) measures the live frame interval with the full plane, the outline and the sea hidden, alternating (6 rounds x 3 s).
import {mkdir, stat, writeFile} from 'node:fs/promises';
import {openWorldBrowser, settle} from '../../../../frontend/scripts/world-browser-tools.js';

const out = (process.argv[2] ?? 'captures/home-island-waves').replace(/\/?$/, '/'), prefix = process.argv[3] ?? 'shot';
const FLAGS = 'live_presence,market,arena,sign_in,demo,sports,islands,placement,wall_recovery,arsenal,rescue,defenses_v2,'
  + 'tower_health,pathing,more_tower_spots,ship_fire,tower_obstacles,structure_recovery';
// [spot, kind, [[path, tier], ...]]: level-5 towers, some with upgrade paths so the path marks show.
const TOWERS = [['cannon_1', 'cannon', [['a', 1], ['a', 2]]], ['cannon_2', 'mortar', [['b', 1]]], ['cannon_3', 'harpoon', []],
  ['cannon_4', 'swivel', [['a', 1]]], ['cannon_5', 'culverin', []]];
const WALLS = ['wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6'];
await mkdir(out, {recursive: true});
const env = await openWorldBrowser();
const errors = [], metrics = [];
// Mean frame interval over 3 s plus the renderer's draw calls and textures (software WebGL: compare runs, not devices).
const measure = page => page.evaluate(() => new Promise(resolve => {
  const info = window.__island.renderer.info, times = []; let last = performance.now();
  const step = now => { times.push(now - last); last = now; if (times.length < 90) requestAnimationFrame(step);
    else resolve({frameMs: +(times.slice(10).reduce((a, b) => a + b, 0) / (times.length - 10)).toFixed(1), calls: info.render.calls,
      triangles: info.render.triangles, textures: info.memory.textures, geometries: info.memory.geometries}); };
  requestAnimationFrame(step);
}));
// Every visible textured mesh: texels shown against the device pixels its quad covers at the current zoom.
const probeTextures = page => page.evaluate(() => {
  const {scene, camera, renderer} = window.__island, canvas = renderer.domElement, rows = new Map();
  const perUnit = canvas.height * camera.zoom / (camera.top - camera.bottom);
  scene.traverseVisible(object => {
    const map = object.material?.map, image = map?.image, uv = object.geometry?.attributes?.uv;
    if (!object.isMesh || !image?.width || !uv) return;
    object.geometry.computeBoundingBox(); const box = object.geometry.boundingBox, scale = object.getWorldScale(object.position.clone());
    let vMin = Infinity, vMax = -Infinity, uMin = Infinity, uMax = -Infinity;
    for (let i = 0; i < uv.count; i++) { vMin = Math.min(vMin, uv.getY(i)); vMax = Math.max(vMax, uv.getY(i)); uMin = Math.min(uMin, uv.getX(i)); uMax = Math.max(uMax, uv.getX(i)); }
    const pixels = Math.max((box.max.y - box.min.y) * Math.abs(scale.y), (box.max.x - box.min.x) * Math.abs(scale.x)) * perUnit;
    const texels = Math.max((vMax - vMin) * image.height, (uMax - uMin) * image.width);
    const art = map.userData.villageArt, name = Array.isArray(art) ? `atlas:${[...new Set(art.map(item => item.file.split('/').pop()))].length} sheets`
      : art?.file?.split('/').pop() ?? (object.userData.asset || map.name || 'other');
    const row = rows.get(map.uuid) ?? {name, width: image.width, height: image.height, meshes: 0, texelsPerPixel: 0};
    row.meshes++; row.texelsPerPixel = Math.max(row.texelsPerPixel, +(texels / Math.max(1, pixels)).toFixed(2)); rows.set(map.uuid, row);
  });
  const list = [...rows.values()], gpuBytes = list.reduce((sum, row) => sum + row.width * row.height * 4 * 4 / 3, 0);
  return {renderer: renderer.userData, devicePxPerLogicalPx: +(perUnit / 16).toFixed(2), zoom: +camera.zoom.toFixed(3), uniqueTextures: list.length,
    gpuMiB: +(gpuBytes / 2 ** 20).toFixed(1), largest: list.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 12)};
});

const seaDiff = page => page.evaluate(() => {
  const {scene, camera, renderer} = window.__island, sea = scene.getObjectByName('sea'), outline = sea.geometry;
  const full = new outline.constructor(), P = outline.attributes.position.constructor;
  full.setAttribute('position', new P(new Float32Array([-200,-150,0, 200,-150,0, 200,150,0, -200,-150,0, 200,150,0, -200,150,0]), 3));
  const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const read = () => { renderer.render(scene, camera); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  // Per pixel: the largest channel difference, bucketed.
  const count = (x, y) => { const r = {pixels: w * h, differing: 0, over2: 0, over8: 0, over32: 0, max: 0};
    for (let i = 0; i < x.length; i += 4) { const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
      if (d) r.differing++; if (d > 2) r.over2++; if (d > 8) r.over8++; if (d > 32) r.over32++; r.max = Math.max(r.max, d); } return r; };
  // Control: the old full plane against the same plane with its corners moved by 1/1000 unit (only float rounding changes).
  const nudged = new outline.constructor();
  nudged.setAttribute('position', new P(new Float32Array([-200.001,-150.001,0, 200.001,-150.001,0, 200.001,150.001,0, -200.001,-150.001,0, 200.001,150.001,0, -200.001,150.001,0]), 3));
  const a = read(); sea.geometry = full; const b = read(); sea.geometry = nudged; const n = read(); sea.geometry = outline; const c = read();
  const png = px => { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const context = canvas.getContext('2d');
    const image = context.createImageData(w, h);
    for (let y = 0; y < h; y++) image.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
    context.putImageData(image, 0, 0); return canvas.toDataURL('image/png').split(',')[1]; };
  window.__seaPng = {outline: png(a), full: png(b)};
  return {w, h, outlineVsFullPlane: count(a, b), fullPlaneVsNudgedPlane: count(b, n), repeat: count(a, c), outlineTriangles: outline.attributes.position.count / 3};
});

const experiment = async (page, label, phase) => {
  await page.evaluate(() => { const sea = window.__island.scene.getObjectByName('sea'), outline = sea.geometry, P = outline.attributes.position.constructor;
    const full = new outline.constructor(); full.setAttribute('position', new P(new Float32Array([-200,-150,0, 200,-150,0, 200,150,0, -200,-150,0, 200,150,0, -200,150,0]), 3));
    window.__seaGeometry = {outline, full}; });
  // Render-only timing on one frozen frame: the same scene drawn 8 times per variant, alternating, synced with a 1-pixel read.
  const bench = await page.evaluate(() => {
    const {scene, camera, renderer} = window.__island, sea = scene.getObjectByName('sea'), gl = renderer.getContext(), px = new Uint8Array(4), out = {};
    const set = v => { sea.visible = v !== 'sea-hidden'; sea.material.uniforms.uDetail.value = v === 'detail-0' ? 0 : 1; sea.geometry = v === 'full-plane' ? window.__seaGeometry.full : window.__seaGeometry.outline; };
    for (let round = 0; round < 6; round++) for (const v of ['full-plane', 'outline', 'detail-0', 'sea-hidden']) {
      set(v); renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t = performance.now(); for (let i = 0; i < 8; i++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      (out[v] ??= []).push(+((performance.now() - t) / 8).toFixed(1));
    }
    set('outline'); return out;
  });
  console.log('BENCH', label, phase, JSON.stringify(bench));
  for (let round = 0; round < 6; round++) for (const variant of (round % 2 ? ['full-plane', 'outline', 'sea-hidden'] : ['outline', 'full-plane', 'sea-hidden'])) {
    await page.evaluate(v => { const sea = window.__island.scene.getObjectByName('sea');
      sea.visible = v !== 'sea-hidden'; sea.geometry = v === 'full-plane' ? window.__seaGeometry.full : window.__seaGeometry.outline; }, variant);
    await page.waitForTimeout(300);
    const m = await measure(page); console.log('EXP', label, phase, round, variant, m.frameMs, m.calls, (await page.evaluate(() => window.__island.renderer.userData)).densityScale);
  }
  await page.evaluate(() => { const sea = window.__island.scene.getObjectByName('sea'); sea.visible = true; sea.geometry = window.__seaGeometry.outline; });
};
const PHONE_DPR = Number(process.env.CAPTURE_PHONE_DPR ?? 3);
try {
  for (const [width, height, label, scale] of [[1280, 800, 'desktop-1280x800', 2], [375, 812, 'phone-375x812', PHONE_DPR]]) {
    const context = await env.browser.newContext({viewport: {width, height}, deviceScaleFactor: scale});
    const page = await context.newPage(), art = {files: new Set(), bytes: 0};
    page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    page.on('response', async response => {
      const path = new URL(response.url()).pathname;
      if (!/\/village\/.*\.(png|webp)$/.test(path) || art.files.has(path)) return;
      art.files.add(path); art.bytes += await stat(new URL(`../public${path}`, import.meta.url)).then(file => file.size, () => 0);
    });
    await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Nils&fakeflags=${FLAGS}`);
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
    await page.reload();
    await page.locator('.shell-screen[open]').waitFor();
    await page.locator('#play').click();
    for (let i = 0; i < 14; i++) {
      await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
        || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 60000, polling: 100});
      if (await page.locator('.games-card[open]').count()) {
        await page.locator('.games-card[open] .games-create-button').waitFor();
        await page.waitForTimeout(400);
        await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
      } else if (await page.locator('.island-card-lobby[open]').count()) await page.keyboard.press('Escape');
      else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
      else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
      else break;
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island && window.__island.waves && !document.querySelector('dialog[open]'));
    await page.evaluate(() => { window.__island.settings.hour = 11; });
    await page.addStyleTag({content: '.connection-banner,.u-toast,.demo-toast{display:none!important}'});
    await page.evaluate(async ([towers, walls]) => {
      const island = window.__island.island;
      island.dev.setWaveBest(30); island.dev.setCoins(400000); await island.load();
      for (const [spot, kind, steps] of towers) {
        await island.build(spot, kind);
        for (let level = 1; level < 5; level++) await island.upgrade(spot);
        for (const [path, tier] of steps) await island.buyTree(spot, path, tier);
      }
      for (const [i, spot] of walls.entries()) { await island.build(spot, 'wall'); for (let level = 1; level <= i % 5; level++) await island.upgrade(spot); }
      island.ui.close(); await island.load();
    }, [TOWERS, WALLS]);
    const clearDialogs = async () => {
      for (let i = 0; i < 30; i++) {
        if (!await page.locator('dialog[open]').count()) { await page.waitForTimeout(1500); if (!await page.locator('dialog[open]').count()) return; }
        const buttons = ['Skip all', 'Skip', 'Got it'].map(name => page.locator('dialog[open]').getByRole('button', {name: new RegExp(`^${name}`)}));
        let clicked = false;
        for (const item of buttons) if (!clicked && await item.count()) { await item.first().click().catch(() => {}); clicked = true; }
        if (!clicked) await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
    };
    await clearDialogs();
    await page.evaluate(() => { const g = window.__island; g.player.position.set(-4, g.world.current.groundHeight?.(-4, 0) ?? 1.03, 0); g.view.setPlace(g.world.current.id, g.player.position); });
    await page.waitForTimeout(1500); await clearDialogs(); await settle(page);
     console.log('SEADIFF', label, 'between', JSON.stringify(await seaDiff(page))); { const p = await page.evaluate(() => window.__seaPng); await writeFile(`${out}${label}-between-full-plane.png`, Buffer.from(p.full, 'base64')); await writeFile(`${out}${label}-between-outline.png`, Buffer.from(p.outline, 'base64')); } await experiment(page, label, 'between');
    
    await page.screenshot({path: `${out}${prefix}-between-waves-${label}.png`}); console.log(`${out}${prefix}-between-waves-${label}.png`);
    await page.evaluate(() => window.__island.island.ringBell());
    await page.waitForFunction(() => (window.__island.waves.island.wave?.state?.ships?.length ?? 0) > 0, null, {timeout: 60000, polling: 200});
    await page.waitForFunction(() => (window.__island.waves.island.wave?.state?.boarders?.length ?? 0) > 0, null, {timeout: 60000, polling: 200}).catch(() => {});
    await page.waitForTimeout(1500); await clearDialogs(); await settle(page);
    const marks = await page.evaluate(() => window.__island.waves.island.wave?.renderer?.marks?.() ?? null);
    console.log(label, 'wave marks:', JSON.stringify(marks));
     console.log('SEADIFF', label, 'wave', JSON.stringify(await seaDiff(page))); { const p = await page.evaluate(() => window.__seaPng); await writeFile(`${out}${label}-wave-full-plane.png`, Buffer.from(p.full, 'base64')); await writeFile(`${out}${label}-wave-outline.png`, Buffer.from(p.outline, 'base64')); } await experiment(page, label, 'wave');
    
    await page.screenshot({path: `${out}${prefix}-during-wave-${label}.png`}); console.log(`${out}${prefix}-during-wave-${label}.png`);
    await context.close();
  }
  console.log('metrics', JSON.stringify(metrics));
  if (errors.length) console.log('page errors:', errors); else console.log('no page errors');
} finally {
  await env.close();
}
