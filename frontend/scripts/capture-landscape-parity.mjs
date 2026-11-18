// Native terrain painter proof only; the coordinator separately verifies the actual game journey.
// node scripts/capture-landscape-parity.mjs <before-frontend> <after-frontend> <output-directory>
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const [before, after, output] = process.argv.slice(2).map(value => resolve(value));
assert.ok(before && after && output, 'provide before, after and output directories');
await mkdir(output, {recursive: true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['src/art/ground.js', 'src/art/coast-cliffs.js', 'src/art/village/terrain-materials.js'];
const git = (root, ...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const sources = async root => Object.fromEntries(await Promise.all(files.map(async name => [name, hash(await readFile(join(root, name)))])));
const report = {scope: 'isolated native painter; not a full-game or gameplay check',
  helperSha256: hash(await readFile(new URL(import.meta.url))), density: 28, started: new Date().toISOString(), checks: []};
let browser;
const proofPage = {name: 'landscape-proof-page', configureServer(server) {
  server.middlewares.use((request, response, next) => {
    if (request.url !== '/__landscape-proof__') return next();
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><html><head><title>Native terrain proof</title><style>body{margin:0}canvas{display:block}</style></head><body></body></html>');
  });
}};

async function capture(root, label) {
  git(root, 'diff', '--exit-code', 'HEAD', '--', ...files);
  const source = git(root, 'rev-parse', 'HEAD'), sourceFiles = await sources(root);
  const assetSha256 = hash(await readFile(join(root, 'public/village/terrain-materials-v1.png')));
  const server = await createServer({root, configFile: false, envDir: false, logLevel: 'error', plugins: [proofPage],
    cacheDir: await mkdtemp(join(tmpdir(), 'landscape-parity-')), server: {host: '127.0.0.1', port: 0, hmr: false}});
  let context;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    context = await browser.newContext({viewport: {width: 1792, height: 1344}, deviceScaleFactor: 1});
    const page = await context.newPage(), pageErrors = [], externalRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue()
      : (externalRequests.push(route.request().url()), route.abort()));
    await page.goto(`${base}/__landscape-proof__`);
    const result = await page.evaluate(async () => {
      const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      const {paintGround} = await import('/src/art/ground.js');
      const {cliffProfile} = await import('/src/art/coast-cliffs.js');
      const {surfaces} = await import('/src/world/places/surfaces.js');
      const {TERRAIN_MATERIALS} = await import('/src/art/village/terrain-materials.js');
      const response = await fetch('/village/terrain-materials-v1.png');
      if (!response.ok) throw Error(`Terrain source did not load: ${response.status}`);
      const bytes = await response.arrayBuffer(), image = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
      try {
        const canvas = paintGround('home_islet', 28, image);
        const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const alpha = new Uint8Array(canvas.width * canvas.height), coast = new Uint8Array(alpha.length);
        for (let index = 0; index < alpha.length; index++) {
          alpha[index] = rgba[index * 4 + 3]; coast[index] = alpha[index] >= 128 ? 1 : 0;
        }
        const fallback = paintGround('home_islet', 28, null);
        const fallbackRgba = fallback.getContext('2d').getImageData(0, 0, fallback.width, fallback.height).data;
        document.body.append(canvas);
        return {width: canvas.width, height: canvas.height, alphaBytes: alpha.length,
          alphaSha256: await digest(alpha), coastSha256: await digest(coast), rgbaSha256: await digest(rgba),
          fallbackRgbaSha256: await digest(fallbackRgba), assetSha256: await digest(bytes),
          profile: cliffProfile(surfaces.home_islet), materials: TERRAIN_MATERIALS};
      } finally { image.close(); }
    });
    const png = `${label}-terrain-native.png`;
    await page.locator('canvas').screenshot({path: join(output, png), omitBackground: true});
    assert.deepEqual(pageErrors, []); assert.deepEqual(externalRequests, []);
    assert.equal(result.assetSha256, assetSha256, 'the browser used the exact committed source PNG');
    assert.equal(git(root, 'rev-parse', 'HEAD'), source, 'source HEAD remained frozen');
    assert.deepEqual(await sources(root), sourceFiles, 'all material source bytes remained frozen');
    return {label, root, source, sourceFiles, png, pageErrors, externalRequests, ...result};
  } finally { await context?.close(); await server.close(); }
}

try {
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  for (const [root, label] of [[before, 'before'], [after, 'after']]) report.checks.push(await capture(root, label));
  const [a, b] = report.checks;
  for (const field of ['width', 'height', 'alphaBytes', 'alphaSha256', 'coastSha256', 'assetSha256', 'fallbackRgbaSha256'])
    assert.equal(b[field], a[field], `${field} must remain identical`);
  assert.deepEqual(b.profile, a.profile, 'every decorative coast/profile coordinate remains identical');
  for (const name of ['grass', 'path', 'rock', 'sand'])
    assert.deepEqual(b.materials[name].rect, a.materials[name].rect, `${name} retains its exact authored crop`);
  assert.notEqual(b.rgbaSha256, a.rgbaSha256, 'the intended RGB material change must be visible');
  report.passed = true;
  console.log('PASS: native terrain RGB changed; all alpha bytes/coast mask/profile/source PNG and fallback retained');
} catch (error) {
  report.passed = false; report.failure = error.message; throw error;
} finally {
  report.finished = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
}
