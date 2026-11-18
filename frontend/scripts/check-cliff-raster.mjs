// Real Canvas raster bounds and actual simulation-anchor checks; supplementary, not gameplay screenshots.
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
const root = resolve(process.argv[2] || '.'), output = process.argv[3];
const server = await createServer({root, configFile: false, envDir: false, logLevel: 'error', cacheDir: await mkdtemp(join(tmpdir(), 'cliff-raster-')),
  plugins: [{name: 'cliff-raster-fixture', configureServer(s) {s.middlewares.use('/__cliff-raster', (_, response) => {response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Cliff raster fixture</title>');});}}],
  server: {host: '127.0.0.1', port: 0, hmr: false}});
let browser;
try {
  await server.listen(); browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__cliff-raster`);
  const result = await page.evaluate(async () => {
    const {paintGround} = await import('/src/art/ground.js'), {cliffProfile} = await import('/src/art/coast-cliffs.js');
    const {surfaces, surfaceClass} = await import('/src/world/places/surfaces.js');
    const {CONFIG, coastPoint, createWave} = await import('/src/pirates/sim.js');
    const image = paintGround('home_islet', 16), context = image.getContext('2d'), data = context.getImageData(0, 0, image.width, image.height).data;
    const profile = cliffProfile(surfaces.home_islet), xs = profile.map(p => p.x), ys = profile.flatMap(p => [p.y, p.baseY]);
    const allowed = {minX: Math.min(...xs) - .8, maxX: Math.max(...xs) + .8, minY: Math.min(...ys) - .8, maxY: Math.max(...ys) + .8};
    let outsideOpaque = 0, opaque = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (data[(y * image.width + x) * 4 + 3] >= 128) {
      opaque++; const wx = (x + .5) / 16 - 32, wy = (y + .5) / 16 - 24;
      if (wx < allowed.minX || wx > allowed.maxX || wy < allowed.minY || wy > allowed.maxY) outsideOpaque++;
    }
    const alpha = p => context.getImageData(Math.round((p.x + 32) * 16), Math.round((p.z * .72 + 24) * 16), 1, 1).data[3];
    const anchors = [];
    for (const seed of [7919, 15838]) {
      const sim = createWave({seed, wave: 8});
      for (let tick = 0; tick < 1200 && !sim.done; tick++) for (const event of sim.step(CONFIG.tick))
        if (event.type === 'ship_anchored') anchors.push({seed, x: event.x, z: event.z, alpha: alpha(event), water: surfaceClass('home_islet', event.x, event.z) === 0});
    }
    const closest = CONFIG.lanes.flatMap(lane => [-9, -6, -3, 0, 3, 6, 9].map(offset => {
      const p = coastPoint((lane.bearing + offset) * Math.PI / 180, CONFIG.stopRadius - CONFIG.stopJitter);
      return {...p, lane: lane.id, alpha: alpha(p), water: surfaceClass('home_islet', p.x, p.z) === 0};
    }));
    return {scope: 'actual Canvas2D terrain and real simulation/minimum-anchor coordinates; no full-hull visual claim', allowed, opaque, outsideOpaque,
      actualAnchors: anchors.length, closestAnchors: closest.length, hiddenAnchors: [...anchors, ...closest].filter(p => !p.water || p.alpha >= 128)};
  });
  if (output) await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  assert.equal(result.outsideOpaque, 0, 'opaque terrain stays within the declared decorative contour bounds');
  assert.ok(result.actualAnchors > 0); assert.deepEqual(result.hiddenAnchors, [], 'ship anchor centers stay in visual water, not the cliff face');
} finally {await browser?.close(); await server.close();}
