// Real Canvas/source-decode guard. Captures are terrain components, not gameplay screenshots.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const root = resolve(process.argv[2] || '.'), out = resolve(process.argv[3] || 'terrain-proof');
await mkdir(out, {recursive: true});
const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const server = await createServer({root, configFile: false, envDir: false, logLevel: 'error',
  cacheDir: await mkdtemp(join(tmpdir(), 'terrain-materials-')),
  plugins: [{name: 'terrain-fixture', configureServer(s) {s.middlewares.use('/__terrain', (_, response) => {
    response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Terrain component fixture</title>');
  });}}], server: {host: '127.0.0.1', port: 0, hmr: false}});
let browser;
const reports = [], errors = [], external = [];
try {
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const {quality, deviceScaleFactor} of [{quality: 'low', deviceScaleFactor: 1}, {quality: 'high', deviceScaleFactor: 2}]) {
    const page = await browser.newPage({viewport: {width: 1280, height: 720}, deviceScaleFactor});
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : (external.push(route.request().url()), route.abort()));
    await page.goto(`${base}/__terrain`);
    const result = await page.evaluate(async quality => {
      const {QUALITY} = await import('/src/config.js');
      const density = QUALITY[quality].groundTexels;
      const {paintGround} = await import('/src/art/ground.js'), {cliffProfile} = await import('/src/art/coast-cliffs.js');
      const {loadBackdrop} = await import('/src/world/places/resources.js');
      const {createRasterCache} = await import('/src/art/village-raster.js');
      const {decodeRasterSheet} = await import('/src/art/village-decode.js');
      const {TERRAIN_SHEET} = await import('/src/art/village/terrain-materials.js');
      const {surfaces, surfaceClass} = await import('/src/world/places/surfaces.js');
      const {CONFIG, coastPoint, createWave} = await import('/src/pirates/sim.js');
      const texture = await loadBackdrop('places/home_islet.png', {quality});
      const after = texture.image, before = paintGround('home_islet', density);
      if (after.width !== 64 * density || after.height !== 48 * density) throw new Error('Unexpected actual backdrop density.');
      const data = after.getContext('2d').getImageData(0, 0, after.width, after.height).data;
      const old = before.getContext('2d').getImageData(0, 0, before.width, before.height).data;
      const profile = cliffProfile(surfaces.home_islet), xs = profile.map(p => p.x), ys = profile.flatMap(p => [p.y, p.baseY]);
      const allowed = {minX: Math.min(...xs) - .8, maxX: Math.max(...xs) + .8, minY: Math.min(...ys) - .8, maxY: Math.max(...ys) + .8};
      let outsideOpaque = 0, opaque = 0, changed = 0, maskDifferences = 0, testedTop = 0, hiddenTop = 0;
      for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) {
        const i = (y * after.width + x) * 4;
        if ((data[i + 3] >= 128) !== (old[i + 3] >= 128)) maskDifferences++;
        if (data[i + 3] < 128) continue;
        opaque++; const wx = (x + .5) / density - 32, wy = (y + .5) / density - 24;
        if (wx < allowed.minX || wx > allowed.maxX || wy < allowed.minY || wy > allowed.maxY) outsideOpaque++;
        if (Math.abs(data[i] - old[i]) + Math.abs(data[i + 1] - old[i + 1]) + Math.abs(data[i + 2] - old[i + 2]) > 30) changed++;
      }
      const alpha = p => after.getContext('2d').getImageData(Math.round((p.x + 32) * density), Math.round((p.z * .72 + 24) * density), 1, 1).data[3];
      for (let x = -24; x <= 24; x += .5) for (let z = -25; z <= 25; z += .5) if (surfaceClass('home_islet', x, z) > 0) {
        testedTop++; if (alpha({x, z}) < 128) hiddenTop++;
      }
      const anchors = [];
      for (const seed of [7919, 15838]) {
        const wave = createWave({seed, wave: 8});
        for (let tick = 0; tick < 1200 && !wave.done; tick++) for (const event of wave.step(CONFIG.tick))
          if (event.type === 'ship_anchored') anchors.push({x: event.x, z: event.z, alpha: alpha(event), water: surfaceClass('home_islet', event.x, event.z) === 0});
      }
      const closest = CONFIG.lanes.flatMap(lane => [-9, -6, -3, 0, 3, 6, 9].map(offset => {
        const p = coastPoint((lane.bearing + offset) * Math.PI / 180, CONFIG.stopRadius - CONFIG.stopJitter);
        return {...p, alpha: alpha(p), water: surfaceClass('home_islet', p.x, p.z) === 0};
      }));
      const cache = createRasterCache({decode: decodeRasterSheet}), lease = await cache.acquire(TERRAIN_SHEET);
      const leasedBytes = cache.stats().bytes; paintGround('home_islet', density, lease.image); lease.release(); lease.release();
      const released = cache.stats();
      const images = {before: before.toDataURL('image/png'), after: after.toDataURL('image/png')}; texture.dispose();
      return {density, quality, allowed, opaque, outsideOpaque, changed, maskDifferences, testedTop, hiddenTop,
        actualAnchors: anchors.length, closestAnchors: closest.length, hiddenAnchors: [...anchors, ...closest].filter(p => !p.water || p.alpha >= 128),
        leasedBytes, sheetWidth: TERRAIN_SHEET.width, sheetHeight: TERRAIN_SHEET.height, released, images};
    }, quality);
    for (const [phase, data] of Object.entries(result.images)) await writeFile(join(out, `component-${phase}-${result.density}.png`), Buffer.from(data.split(',')[1], 'base64'));
    delete result.images; reports.push(result); await page.close();
    assert.equal(result.outsideOpaque, 0); assert.equal(result.hiddenTop, 0);
    assert.equal(result.maskDifferences, 0);
    assert.ok(result.testedTop > 1000 && result.actualAnchors > 0 && result.closestAnchors === 21);
    assert.deepEqual(result.hiddenAnchors, []); assert.ok(result.changed > result.opaque * .2);
    assert.equal(result.leasedBytes, result.sheetWidth * result.sheetHeight * 4);
    assert.deepEqual(result.released, {bytes: 0, entries: 0, queued: 0, decodes: 0});
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({source,
    scope: 'Actual Canvas terrain components and source decode; no full-gameplay, hull or final-quality claim',
    comparison: 'Same candidate facade geometry: procedural fallback before versus decoded materials after; not an old-software comparison',
    reports, errors, external}, null, 2) + '\n');
  console.log('PASS: low/high terrain materials, clipping, analytic top, real naval anchors and decoded-source release; 0 page errors/external requests');
} finally {await browser?.close(); await server.close();}
