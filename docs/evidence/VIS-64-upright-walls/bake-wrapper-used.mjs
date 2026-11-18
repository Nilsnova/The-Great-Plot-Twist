// Coordinator-only wrapper: run the existing compiler, replacing the declared wall family only.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const repo = '/workspace/reference-village-work/clearance-volume', front = `${repo}/frontend`;
const evidence = `${repo}/docs/evidence/VIS-64-upright-walls`, historical = `${repo}/docs/evidence/VIS-30-world-art/bake-report.json`;
const modulePath = `${front}/src/art/village/baked.js`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const moduleAt = (path, label) => import(`${pathToFileURL(path).href}?${label}`);
const originalModuleBytes = await readFile(modulePath), originalReportBytes = await readFile(historical);
const originalModule = await moduleAt(modulePath, 'before-vis64'), originalReport = JSON.parse(originalReportBytes);
await mkdir(evidence, {recursive: true});
await writeFile(`${evidence}/baked-before.js`, originalModuleBytes, {flag: 'wx'});
await writeFile(`${evidence}/bake-report-before.json`, originalReportBytes, {flag: 'wx'});
const originalHashes = Object.fromEntries(await Promise.all(originalReport.original.files.map(async row =>
  [row.file, hash(await readFile(`${front}/public/${row.file}`))])));
let complete = false;
try {
  const output = execFileSync(process.execPath, ['scripts/bake-village-art.mjs', '--families=walls'],
    {cwd: front, encoding: 'utf8', maxBuffer: 64 * 2 ** 20});
  await writeFile(`${evidence}/bake.log`, output);
  const rawProofBytes = await readFile(historical), rawProof = JSON.parse(rawProofBytes);
  await writeFile(`${evidence}/wall-bake-report.json`, rawProofBytes);
  const generated = await moduleAt(modulePath, 'wall-only-vis64');
  assert.deepEqual(rawProof.families, ['walls']);
  assert.deepEqual(rawProof.errors, []); assert.deepEqual(rawProof.externalRequests, []);
  const wallKeys = new Set(Object.keys(generated.frames)), sheetKeys = new Set(Object.keys(generated.sheets));
  assert.equal(wallKeys.size, 32); assert.equal(sheetKeys.size, 1);
  assert.deepEqual(wallKeys, new Set(Object.keys(originalModule.frames).filter(key => originalModule.frames[key].sheet.startsWith('wallsBaked'))));
  assert.deepEqual(sheetKeys, new Set(Object.keys(originalModule.sheets).filter(key => key.startsWith('wallsBaked'))));
  const changedKeys = [];
  const mergedSource = originalModuleBytes.toString().split('\n').map(line => {
    const match = line.match(/^\s*("[^"]+"):.*,$/); if (!match) return line;
    const key = JSON.parse(match[1]);
    if (!wallKeys.has(key) && !sheetKeys.has(key)) return line;
    changedKeys.push(key);
    return `  ${JSON.stringify(key)}: ${JSON.stringify(generated.frames[key] ?? generated.sheets[key])},`;
  }).join('\n');
  assert.equal(changedKeys.length, wallKeys.size + sheetKeys.size);
  await writeFile(modulePath, mergedSource);
  const merged = await moduleAt(modulePath, 'merged-vis64');
  for (const kind of ['sheets', 'frames']) for (const [key, value] of Object.entries(originalModule[kind])) {
    const owned = kind === 'sheets' ? sheetKeys.has(key) : wallKeys.has(key);
    assert.deepEqual(merged[kind][key], owned ? generated[kind][key] : value, key);
  }
  assert.deepEqual(rawProof.plans[0].frames, generated.frames);
  for (const [file, expected] of Object.entries(originalHashes)) assert.equal(hash(await readFile(`${front}/public/${file}`)), expected, file);
  const old = originalReport, next = structuredClone(old), replaceNamed = (items, replacements, key) => items.map(item =>
    item[key] === 'walls' ? replacements.find(row => row[key] === 'walls') : item);
  next.inputs = replaceNamed(old.inputs, rawProof.inputs, 'name');
  next.plans = replaceNamed(old.plans, rawProof.plans, 'name');
  next.verification = replaceNamed(old.verification, rawProof.verification, 'family');
  next.compilerMemory = replaceNamed(old.compilerMemory, rawProof.compilerMemory, 'family');
  const replacedFiles = new Set([...sheetKeys].map(key => originalModule.sheets[key].file));
  assert.equal(rawProof.compiled.files.length, replacedFiles.size);
  let outputIndex = 0;
  next.compiled.files = old.compiled.files.map(row => replacedFiles.has(row.file) ? rawProof.compiled.files[outputIndex++] : row);
  assert.equal(outputIndex, rawProof.compiled.files.length);
  const sum = (rows, size) => rows.reduce((total, row) => total + size(row), 0);
  next.compiled.encodedBytes = sum(next.compiled.files, row => row.bytes);
  next.compiled.summedDecodedBytes = sum(next.compiled.files, row => row.width * row.height * 4);
  next.compiled.peakSingleDecodedBytes = Math.max(...next.compiled.files.map(row => row.width * row.height * 4));
  next.initialTransfer.compiledPlusTerrainBytes = next.compiled.encodedBytes + old.initialTransfer.unchangedTerrainBytes;
  next.initialTransfer.targetMet = next.initialTransfer.compiledPlusTerrainBytes <= next.initialTransfer.targetBytes;
  next.proofOrigins = {...Object.fromEntries(old.families.map(name => [name, old.proofOrigins?.[name] ?? old.sourceCommit])), walls: rawProof.sourceCommit};
  next.scope = 'Composite original-family proof plus the explicit VIS64 walls-only replacement; per-family proofOrigins and replacementHistory identify each measured source.';
  next.budgets.note = 'VIS64 wall posts use 48x48 logical boxes with existing atlas limits; unrelated family boxes are unchanged. No draw-pass or GPU-texture saving is claimed.';
  next.replacementHistory = [...(old.replacementHistory ?? []), {family: 'walls', sourceCommit: rawProof.sourceCommit,
    previousReport: '../VIS-64-upright-walls/bake-report-before.json', previousReportSha256: hash(originalReportBytes),
    compilerReport: '../VIS-64-upright-walls/wall-bake-report.json', compilerReportSha256: hash(rawProofBytes),
    oldSheets: [...replacedFiles], newSheets: rawProof.compiled.files.map(row => row.file),
    note: 'Historical transport records are retained unchanged; their old wall output remains present. New wall output has separate native raw-vs-baked pixel proof.'}];
  for (const key of ['inputs','plans','verification','compilerMemory']) {
    const tag = ['inputs','plans'].includes(key) ? 'name' : 'family';
    assert.deepEqual(next[key].filter(row => row[tag] !== 'walls'), old[key].filter(row => row[tag] !== 'walls'));
  }
  assert.deepEqual(next.compiled.files.filter(row => !rawProof.compiled.files.some(newRow => newRow.file === row.file)),
    old.compiled.files.filter(row => !replacedFiles.has(row.file)));
  assert.deepEqual(next.original, old.original); assert.deepEqual(next.transportHistory, old.transportHistory);
  await writeFile(historical, `${JSON.stringify(next, null, 2)}\n`);
  const receipt = {source: rawProof.sourceCommit, compilerCommand: 'node scripts/bake-village-art.mjs --families=walls',
    wrapperSha256: hash(await readFile(new URL(import.meta.url))), previousBakedSha256: hash(originalModuleBytes),
    previousReportSha256: hash(originalReportBytes), compilerReportSha256: hash(rawProofBytes),
    currentBakedSha256: hash(await readFile(modulePath)), currentAggregateReportSha256: hash(await readFile(historical)),
    changedMetadataKeys: changedKeys, unrelatedCompiledFamiliesUnchanged: true, originalImageHashes: originalHashes,
    originalReportPreservedByteExact: (await readFile(`${evidence}/bake-report-before.json`)).equals(originalReportBytes),
    originalBakedPreservedByteExact: (await readFile(`${evidence}/baked-before.js`)).equals(originalModuleBytes),
    compiled: rawProof.compiled, initialTransfer: next.initialTransfer, errors: rawProof.errors, externalRequests: rawProof.externalRequests};
  await writeFile(`${evidence}/rebake-integrity.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({source: receipt.source, ownedKeys: changedKeys.length,
    sheets: rawProof.compiled.files, initialTransfer: next.initialTransfer, originalImagesUnchanged: true}));
  complete = true;
} finally {
  if (!complete) {
    await writeFile(modulePath, originalModuleBytes); await writeFile(historical, originalReportBytes);
    console.error('VIS64 wrapper failed; active metadata and aggregate report restored byte-exact. Inspect owned generated outputs before retrying.');
  }
}
