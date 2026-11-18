// Real GPU component comparison against the unchanged9dc1 sea, with the same candidate terrain.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const root = resolve(process.argv[2] || '.'), out = resolve(process.argv[3] || 'sea-proof'); await mkdir(out, {recursive: true});
const source = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const oldSource = '9dc1bea505fe3b26bd56d6ad02c21a2db8bd8be9';
const old = execFileSync('git', ['show', `${oldSource}:frontend/src/world/water.js`], {cwd: root, encoding: 'utf8'});
const fragment = /const fragment = \/\* glsl \*\/`([\s\S]*?)`;/.exec(old)?.[1]; assert.ok(fragment);
const colours = Object.fromEntries([...old.matchAll(/(uDeep|uMid|uLight|uShallow2?|uFoam|uGlint|uStroke): '(#[a-f0-9]+)'/g)].map(match => [match[1], match[2]]));
assert.equal(Object.keys(colours).length, 8);
const server = await createServer({root, configFile: false, envDir: false, logLevel: 'error', cacheDir: await mkdtemp(join(tmpdir(), 'nautical-water-')),
  plugins: [{name: 'water-fixture', configureServer(s) {s.middlewares.use('/__water', (_, response) => {response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Actual sea component fixture</title>');});}}],
  server: {host: '127.0.0.1', port: 0, hmr: false}});
let browser; const reports = [], errors = [], external = [];
try {
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    const page = await browser.newPage({viewport: {width, height}});
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : (external.push(route.request().url()), route.abort()));
    await page.goto(`${base}/__water`);
    await page.evaluate(async dimensions => {window.waterFixture = await (await import('/scripts/nautical-water-fixture.js')).createWaterFixture(dimensions);}, {width, height});
    const frames = [];
    for (const [name, baseline, quality, reduced] of [['before', {fragment, colours}, 'high', false], ['after', null, 'high', false], ['low', null, 'low', false], ['reduced', null, 'high', true]]) {
      const result = await page.evaluate(async state => window.waterFixture.frame(state), {name, baseline, quality, reduced});
      assert.deepEqual(result.shaderErrors, []); assert.equal(result.drawCalls, 2);
      if (reduced) assert.equal(result.unchangedWhenReduced, true);
      await page.screenshot({path: join(out, `${name}-${width}x${height}.png`)}); frames.push(result);
    }
    assert.notEqual(frames[0].hash, frames[1].hash);
    assert.notEqual(frames[1].hash, frames[1].laterHash);
    const mask = await page.evaluate(() => window.waterFixture.mask());
    assert.deepEqual(mask.waterDrawnInsideOpaqueTerrain, []); assert.ok(mask.rockSamples >= 2);
    assert.equal(mask.transparentFallback, 0); assert.deepEqual(mask.shaderErrors, []);
    reports.push({width, height, frames, mask}); await page.evaluate(() => window.waterFixture.dispose()); await page.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(join(out, 'report.json'), JSON.stringify({source, oldSource, scope: 'Actual GPU water/terrain components; not full gameplay or physical-device FPS', reports, errors, external}, null, 2) + '\n');
  console.log('PASS: actual desktop/phone sea shaders, coast masking/fallback, low/reduced modes and unchanged2draw scene;0page errors/external requests');
} finally {await browser?.close(); await server.close();}
