// Shipping transport for world art: run after scripts/bake-village-art.mjs (and any lossless recompress).
// The proved 4x PNG masters and the authored terrain atlas stay in the repository but out of the build
// (scripts/unshipped-art.js); the game downloads a same-size lossy WebP of every master (alpha kept) and a
// terrain atlas resampled to what the ground ever paints. Frame metadata in baked.js is never touched.
//   node scripts/ship-village-art.mjs [--quality=0.9]
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, readdir, rename, unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import * as baked from '../src/art/village/baked.js';
import {sheetHeader} from '../src/art/village-decode.js';
import {TERRAIN_MATERIALS, TERRAIN_SOURCE_SHEET} from '../src/art/village/terrain-materials.js';
import {QUALITY} from '../src/config.js';
const root = fileURLToPath(new URL('..', import.meta.url)), publicRoot = resolve(root, 'public');
const evidence = resolve(root, '../docs/evidence/VIS-30-world-art'), bakePath = resolve(evidence, 'bake-report.json');
const quality = Number(process.argv.find(arg => arg.startsWith('--quality='))?.slice(10) ?? .9);
if (!(quality >= .5 && quality <= 1)) throw new Error('Quality must be between 0.5 and 1.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Visible-error bounds a lossy encode must stay within on every sheet (alpha-weighted mean RGB, 0-255).
export const LIMITS = Object.freeze({alphaWeightedMeanRgbDelta: 6, maxAlphaDelta: 0});
// Ground density is at most 39 texels per world unit (src/world/places/resources.js); halving the 625-texel
// crops keeps grass/sand at 39, rock 52 and paths 57 texels per unit.
const TERRAIN = Object.freeze({width: 628, height: 628, rects: {grass: [1, 1, 312, 312], path: [315, 1, 312, 312], rock: [1, 315, 312, 312], sand: [315, 315, 312, 312]}});
const reportBytes = await readFile(bakePath), report = JSON.parse(reportBytes);
if (report.errors.length || report.externalRequests.length) throw new Error('Use a successful bake before shipping.');
for (const sheet of Object.values(baked.sheets)) if (!report.compiled.files.some(row => row.file === sheet.file && row.width === sheet.width && row.height === sheet.height)) throw new Error(`baked.js differs from the proof: ${sheet.file}`);
const masters = [];
for (const row of Object.values(baked.sheets).map(sheet => report.compiled.files.find(file => file.file === sheet.file))) {
  if (hash(await readFile(resolve(publicRoot, row.file))) !== row.sha256) throw new Error(`Master differs from the proof: ${row.file}`);
  masters.push(row);
}
const terrainSource = await readFile(resolve(publicRoot, TERRAIN_SOURCE_SHEET.file));
// Loading WebP touches the validator/decoder files whose hashes the bake proof records. That is allowed only
// while the drawing code the proof ran (normalizeRasterFrame) stays byte-identical to the recorded revision.
const normalizerUpdates = [];
for (const [file, recorded] of Object.entries(report.normalizerHashes)) {
  const current = await readFile(resolve(root, file), 'utf8'); if (hash(current) === recorded) continue;
  const proved = execFileSync('git', ['log', '--format=%H', '-n', '200', '--', file], {cwd: root, encoding: 'utf8'}).split('\n').filter(Boolean)
      .map(commit => execFileSync('git', ['show', `${commit}:frontend/${file}`], {cwd: root, encoding: 'utf8'})).find(text => hash(text) === recorded);
  if (proved === undefined) throw new Error(`Cannot find the proved revision of ${file}.`);
  const drawing = text => text.slice(text.indexOf('export function normalizeRasterFrame'));
  if (file.endsWith('village-raster.js') && drawing(current) !== drawing(proved)) throw new Error('normalizeRasterFrame changed; use a full rebake.');
  normalizerUpdates.push([file, recorded, hash(current)]);
}
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
let server, browser;
try {
  server = await createServer({root, configFile: false, envDir: false, server: {host: '127.0.0.1', port: 0, hmr: false}, logLevel: 'error'}); await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`, errors = [], externalRequests = [];
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => existsSync(path)), headless: true});
  const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()); if (url.origin !== base) { externalRequests.push(url.href); return route.abort(); }
    if (url.pathname === '/__village-ship') return route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body></body></html>'});
    return route.continue();
  });
  await page.goto(`${base}/__village-ship`);
  const ship = data => page.evaluate(async input => (await import('/scripts/village-ship-browser.js')).shipSheet(input), data);
  const outputs = [], records = [];
  const publish = async (source, sourceSha256, name, sheet, regions = null) => {
    const result = await ship({url: `/${source}`, width: sheet.width, height: sheet.height, quality, regions});
    const bytes = Buffer.from(result.webp, 'base64'), header = sheetHeader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)), digest = hash(bytes);
    if (header?.type !== 'webp' || header.width !== sheet.width || header.height !== sheet.height || bytes.length > 8 * 2 ** 20) throw new Error(`Shipped WebP header differs: ${source}`);
    if (result.proof.alphaWeightedMeanRgbDelta > LIMITS.alphaWeightedMeanRgbDelta || result.proof.maxAlphaDelta > LIMITS.maxAlphaDelta) throw new Error(`Lossy error above bounds: ${source} ${JSON.stringify(result.proof)}`);
    const file = `village/shipped/${name}-${digest.slice(0, 12)}.webp`; outputs.push([file, bytes]);
    const record = {source, sourceSha256, file, bytes: bytes.length, sha256: digest, width: sheet.width, height: sheet.height, proof: result.proof};
    records.push(record); console.log(`${file}: ${bytes.length} bytes, mean RGB delta ${result.proof.alphaWeightedMeanRgbDelta.toFixed(2)}, max alpha delta ${result.proof.maxAlphaDelta}`);
    return record;
  };
  for (const row of masters) await publish(row.file, row.sha256, row.file.split('/').pop().replace(/-[a-f0-9]{12}\.png$/, ''), row);
  const names = Object.keys(TERRAIN.rects);
  if (JSON.stringify(names.sort()) !== JSON.stringify(Object.keys(TERRAIN_MATERIALS).sort())) throw new Error('Terrain materials changed; update the shipped layout.');
  const terrain = await publish(TERRAIN_SOURCE_SHEET.file, hash(terrainSource), 'terrain-materials', TERRAIN, names.map(name => [TERRAIN_MATERIALS[name].rect, TERRAIN.rects[name]]));
  if (errors.length || externalRequests.length) throw new Error(`Browser errors or external requests: ${JSON.stringify({errors, externalRequests})}`);
  // Publish the files, then the metadata, then the report; stale shipped files are removed last.
  await mkdir(resolve(publicRoot, 'village/shipped'), {recursive: true});
  for (const [file, bytes] of outputs) await writeFile(resolve(publicRoot, file), bytes);
  const sprites = records.filter(record => record !== terrain), emit = value => JSON.stringify(value);
  const module = ['// Generated by scripts/ship-village-art.mjs: the WebP each proved master downloads as. Do not edit.',
    'export const shippedSheets = {', ...sprites.map(row => `  ${emit(row.source)}: ${emit({file: row.file, width: row.width, height: row.height})},`), '};',
    `export const shippedTerrain = ${emit({file: terrain.file, width: terrain.width, height: terrain.height, rects: TERRAIN.rects})};`, ''].join('\n');
  const modulePath = resolve(root, 'src/art/village/shipped.js'); await writeFile(`${modulePath}.tmp`, module); await rename(`${modulePath}.tmp`, modulePath);
  const total = rows => rows.reduce((sum, row) => sum + row.bytes, 0), terrainBytes = terrainSource.length;
  const shipReport = {scope: 'lossy WebP shipping transport of the proved masters; frame metadata, masters and authored originals unchanged',
    sourceCommit, compilerDirtyPaths: execFileSync('git', ['status', '--short'], {cwd: root, encoding: 'utf8'}).trim(), bakeReportSha256: hash(reportBytes), browser: browser.version(), encoder: 'Chrome canvas toDataURL image/webp', quality, limits: LIMITS,
    sprites: {files: sprites, masterBytes: total(masters), shippedBytes: total(sprites)},
    terrain: {...terrain, sourceBytes: terrainBytes, sourceRects: Object.fromEntries(names.map(name => [name, TERRAIN_MATERIALS[name].rect])), rects: TERRAIN.rects, maxGroundTexelsPerUnit: QUALITY.high.groundTexels},
    initialTransfer: {masterPlusTerrainBytes: total(masters) + terrainBytes, shippedBytes: total(records), targetBytes: 4 * 10 ** 6, targetMet: total(records) <= 4 * 10 ** 6},
    errors, externalRequests};
  if (normalizerUpdates.length) {
    report.normalizerHistory = [...(report.normalizerHistory ?? []), {sourceCommit, reason: 'sheet validation and decoding accept the shipped WebP; normalizeRasterFrame byte-identical',
      previous: Object.fromEntries(normalizerUpdates.map(([file, before]) => [file, before])), current: Object.fromEntries(normalizerUpdates.map(([file, , after]) => [file, after]))}];
    for (const [file, , after] of normalizerUpdates) report.normalizerHashes[file] = after;
    await writeFile(bakePath, `${JSON.stringify(report, null, 2)}\n`);
  }
  shipReport.bakeReportSha256 = hash(await readFile(bakePath));
  await writeFile(resolve(evidence, 'ship-report.json'), `${JSON.stringify(shipReport, null, 2)}\n`);
  const keep = new Set(outputs.map(([file]) => file.split('/').pop()));
  for (const name of await readdir(resolve(publicRoot, 'village/shipped'))) if (!keep.has(name)) await unlink(resolve(publicRoot, 'village/shipped', name));
  console.log(JSON.stringify(shipReport.initialTransfer));
} finally { await browser?.close(); await server?.close(); }
