// Run explicitly in the coordinated browser lane. Raw originals and runtime activation stay untouched.
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {collectRasterFrames, DECODE_BUDGET} from '../src/art/village-raster.js';
import {planFamily, rawFamilyNames, validateBakedPng, PROOF_DENSITIES} from './village-bake-plan.js';
const root = fileURLToPath(new URL('..', import.meta.url)), publicRoot = resolve(root, 'public');
const names = rawFamilyNames(process.argv.find(arg => arg.startsWith('--families='))?.slice(11));
const hash = data => createHash('sha256').update(data).digest('hex');
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const inputs = [], originals = new Map(), plans = [], allIds = new Set(), pendingOutputs = new Map();
for (const name of names) {
  const url = new URL(`../src/art/village/${name}.js`, import.meta.url), family = await import(url), frames = collectRasterFrames([family]);
  for (const id of Object.keys(frames)) { if (allIds.has(id)) throw new Error(`Duplicate raw frame ID: ${id}`); allIds.add(id); }
  for (const frame of Object.values(frames)) {
    if (frame.sheet.file.startsWith('village/compiled/')) throw new Error('Generated images cannot be raw inputs.');
    if (originals.has(frame.sheet.file)) continue;
    const bytes = await readFile(resolve(publicRoot, frame.sheet.file));
    if (bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(16) !== frame.sheet.width || bytes.readUInt32BE(20) !== frame.sheet.height || frame.sheet.width * frame.sheet.height * 4 > DECODE_BUDGET) throw new Error('Invalid raw PNG header/dimensions/budget.');
    originals.set(frame.sheet.file, {file: frame.sheet.file, bytes: bytes.length, sha256: hash(bytes), width: frame.sheet.width, height: frame.sheet.height});
  }
  inputs.push({name, module: `src/art/village/${name}.js`, sha256: hash(await readFile(url)), frames}); plans.push(planFamily(name, frames));
}
const server = await createServer({root, configFile: false, envDir: false, server: {host: '127.0.0.1', port: 0, hmr: false}, logLevel: 'error'});
let browser;
try {
  await server.listen(); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  const page = await browser.newPage(), errors = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { externalRequests.push(url.href); return route.abort(); }
    if (pendingOutputs.has(url.pathname.slice(1))) return route.fulfill({contentType: 'image/png', body: pendingOutputs.get(url.pathname.slice(1))});
    if (url.pathname === '/__village-bake') return route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body></body></html>'});
    return route.continue();
  });
  await page.goto(`${base}/__village-bake`);
  const compiled = [], verification = [], compilerMemory = [];
  for (const [i, plan] of plans.entries()) {
    const result = await page.evaluate(async data => (await import('/scripts/village-bake-browser.js')).compileFamily(data.plan, data.frames), {plan, frames: inputs[i].frames});
    for (const output of result.outputs) {
      const bytes = Buffer.from(output.png, 'base64'), sheet = plan.pages.find(p => p.file === output.file), digest = hash(bytes);
      validateBakedPng(bytes, sheet);
      const file = output.file.replace('.png', `-${digest.slice(0, 12)}.png`);
      for (const record of Object.values(plan.sheets)) if (record.file === output.file) record.file = file;
      sheet.file = file; pendingOutputs.set(file, bytes); compiled.push({file, bytes: bytes.length, sha256: digest, width: sheet.width, height: sheet.height});
    }
    compilerMemory.push({family: plan.name, ...Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'outputs'))});
    verification.push({family: plan.name, ...await page.evaluate(async data => (await import('/scripts/village-bake-browser.js')).verifyFamily(data.plan, data.frames), {plan, frames: inputs[i].frames})});
    console.log(`${plan.name}: ${Object.keys(plan.frames).length} frames, ${result.outputs.length} bounded PNG sheet(s),4× pixel proof passed.`);
  }
  for (const record of originals.values()) if (hash(await readFile(resolve(publicRoot, record.file))) !== record.sha256) throw new Error('Original artwork changed during compilation.');
  const sheets = Object.assign({}, ...plans.map(plan => plan.sheets)), frames = Object.assign({}, ...plans.map(plan => plan.frames));
  if (Object.keys(frames).length !== inputs.reduce((sum, input) => sum + Object.keys(input.frames).length, 0)) throw new Error('Duplicate frame IDs across raw families.');
  const emit = object => Object.entries(object).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n');
  if (errors.length || externalRequests.length) throw new Error('Browser errors or external requests during compilation.');
  // Publish content-addressed PNGs only after every proof succeeds, then atomically replace metadata last.
  for (const [file, bytes] of pendingOutputs) { const path = resolve(publicRoot, file); await mkdir(dirname(path), {recursive: true}); await writeFile(path, bytes); }
  const modulePath = resolve(root, 'src/art/village/baked.js');
  await writeFile(`${modulePath}.tmp`, `// Generated by scripts/bake-village-art.mjs from explicit raw families; do not feed this file back as input.\nexport const sheets = {\n${emit(sheets)}\n};\nexport const frames = {\n${emit(frames)}\n};\n`); await rename(`${modulePath}.tmp`, modulePath);
  const terrainBytes = (await readFile(resolve(publicRoot, 'village/terrain-materials-v1.png'))).length;
  const total = records => records.reduce((sum, record) => sum + record.bytes, 0), decoded = records => records.reduce((sum, record) => sum + record.width * record.height * 4, 0);
  const report = {scope: 'offline normalized PNG source compilation; runtime activation/build exclusion and actual-game acceptance remain separate', sourceCommit: git(['rev-parse', 'HEAD']), compilerDirtyPaths: git(['status', '--short']), browser: browser.version(), families: names, proofDensities: PROOF_DENSITIES,
    original: {files: [...originals.values()], encodedBytes: total([...originals.values()]), summedDecodedBytes: decoded([...originals.values()])},
    compiled: {files: compiled, encodedBytes: total(compiled), summedDecodedBytes: decoded(compiled), peakSingleDecodedBytes: Math.max(...compiled.map(item => item.width * item.height * 4))},
    initialTransfer: {unchangedTerrainBytes: terrainBytes, rawPlusTerrainBytes: total([...originals.values()]) + terrainBytes, compiledPlusTerrainBytes: total(compiled) + terrainBytes, targetBytes: 8 * 2 ** 20, targetMet: total(compiled) + terrainBytes <= 8 * 2 ** 20},
    budgets: {decodedPoolBytes: DECODE_BUDGET, combatAtlasHighBytes: 40 * 2 ** 20, combatAtlasLowBytes: 12 * 2 ** 20, note: 'unchanged final logical frame/density means no renderer-pass or final GPU-texture saving is claimed'}, inputs, plans, compilerMemory, verification, errors, externalRequests};
  const evidence = resolve(root, '../docs/evidence/VIS-30-world-art'); await mkdir(evidence, {recursive: true}); await writeFile(resolve(evidence, 'bake-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({frames: Object.keys(frames).length, ...report.initialTransfer, originalDecoded: report.original.summedDecodedBytes, compiledDecoded: report.compiled.summedDecodedBytes, errors, externalRequests}));
} finally { await browser?.close(); await server.close(); }
