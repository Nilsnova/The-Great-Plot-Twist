// Lossless transport-only follow-up: original authoring PNGs and every frame coordinate stay fixed.
import {readFile, writeFile, rename, unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {recompressPng, verifyPngEquivalent} from './village-png-codec.js';
import {validateBakedPng} from './village-bake-plan.js';
const root = fileURLToPath(new URL('..', import.meta.url)), publicRoot = resolve(root, 'public'), evidence = resolve(root, '../docs/evidence/VIS-30-world-art');
const oldReport = await readFile(resolve(evidence, 'bake-report.json')), report = JSON.parse(oldReport), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (!report.normalizerHashes || report.errors.length || report.externalRequests.length) throw new Error('Use a successful current bake before transport optimization.');
for (const file of report.original.files) {
  if (!/^village\/[a-z0-9-]+\.png$/.test(file.file) || hash(await readFile(resolve(publicRoot, file.file))) !== file.sha256) throw new Error('Original source differs; rebake first.');
}
for (const [file, expected] of [...report.inputs.map(input => [input.module, input.sha256]), ...Object.entries(report.normalizerHashes)]) {
  if (!/^src\/art\/[a-z0-9./-]+\.js$/.test(file) || file.split('/').includes('..') || hash(await readFile(resolve(root, file))) !== expected) throw new Error('Source or normalizer differs; rebake first.');
}
const frameIdentity = JSON.stringify(report.plans.map(plan => plan.frames)), pending = new Map(), mapping = new Map(), records = [], compiled = [];
for (const file of report.compiled.files) {
  if (!/^village\/compiled\/[a-z0-9-]+-[a-f0-9]{12}\.png$/.test(file.file)) throw new Error('Expected a content-addressed compiled source.');
  const original = await readFile(resolve(publicRoot, file.file)); if (hash(original) !== file.sha256) throw new Error('Compiled source differs from proof.');
  const output = recompressPng(original), identity = verifyPngEquivalent(original, output), digest = hash(output); validateBakedPng(output, file);
  const next = file.file.replace(/-[a-f0-9]{12}\.png$/, `-${digest.slice(0, 12)}.png`); pending.set(next, output); mapping.set(file.file, next);
  compiled.push({...file, file: next, bytes: output.length, sha256: digest}); records.push({source: file.file, sourceSha256: file.sha256, file: next, sha256: digest, ...identity});
}
for (const plan of report.plans) { for (const sheet of Object.values(plan.sheets)) sheet.file = mapping.get(sheet.file); for (const page of plan.pages) page.file = mapping.get(page.file); }
if (frameIdentity !== JSON.stringify(report.plans.map(plan => plan.frames))) throw new Error('Transport optimization altered frame identity.');
let server, browser;
try {
  server = await createServer({root, configFile: false, envDir: false, server: {host: '127.0.0.1', port: 0, hmr: false}, logLevel: 'error'}); await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`, errors = [], externalRequests = [], proof = [];
  browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true});
  const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()); if (url.origin !== base) { externalRequests.push(url.href); return route.abort(); }
    if (pending.has(url.pathname.slice(1))) return route.fulfill({contentType: 'image/png', body: pending.get(url.pathname.slice(1))});
    if (url.pathname === '/__village-codec') return route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body></body></html>'});
    return route.continue();
  });
  await page.goto(`${base}/__village-codec`);
  for (const plan of report.plans) {
    const input = report.inputs.find(item => item.name === plan.name), frames = Object.fromEntries(plan.pages.map(page => [page.items[0].id, input.frames[page.items[0].id]]));
    proof.push({family: plan.name, ...await page.evaluate(async data => (await import('/scripts/village-bake-browser.js')).verifyFamily(data.plan, data.frames), {plan, frames})});
  }
  if (errors.length || externalRequests.length) throw new Error('Browser transport proof failed.');
  // No publication before source-byte equivalence, all logical IDs and representative browser decoding pass.
  for (const [file, bytes] of pending) await writeFile(resolve(publicRoot, file), bytes);
  const sheets = Object.assign({}, ...report.plans.map(plan => plan.sheets)), frames = Object.assign({}, ...report.plans.map(plan => plan.frames));
  const emit = object => Object.entries(object).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n'), modulePath = resolve(root, 'src/art/village/baked.js');
  await writeFile(`${modulePath}.tmp`, `// Generated from approved raw families; lossless PNG transport optimization changes no frame coordinates.\nexport const sheets = {\n${emit(sheets)}\n};\nexport const frames = {\n${emit(frames)}\n};\n`); await rename(`${modulePath}.tmp`, modulePath);
  const beforeBytes = report.compiled.encodedBytes, afterBytes = compiled.reduce((sum, file) => sum + file.bytes, 0);
  report.compiled.files = compiled; report.compiled.encodedBytes = afterBytes;
  report.initialTransfer.compiledPlusTerrainBytes = afterBytes + report.initialTransfer.unchangedTerrainBytes; report.initialTransfer.targetMet = report.initialTransfer.compiledPlusTerrainBytes <= report.initialTransfer.targetBytes;
  report.transportHistory = [...(report.transportHistory ?? []), {sourceCommit, priorReportSha256: hash(oldReport), method: 'Node zlib level9; exact filtered scanlines/non-IDAT chunks and validated CRCs', browser: browser.version(), beforeBytes, afterBytes, records, allLogicalFramesUnchanged: true, representativeBrowserProof: proof, errors, externalRequests}];
  await writeFile(resolve(evidence, 'bake-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const retained = new Set(compiled.map(file => file.file)); for (const file of mapping.keys()) if (!retained.has(file)) await unlink(resolve(publicRoot, file));
  console.log(JSON.stringify({sourceCommit,files: compiled.length,frames: Object.keys(frames).length,beforeBytes,afterBytes,savedBytes:beforeBytes-afterBytes,initialTransfer:report.initialTransfer,errors,externalRequests}));
} finally { await browser?.close(); await server?.close(); }
