import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {expect, it} from 'vitest';
import * as baked from '../../src/art/village/baked.js';
import {collectRasterFrames} from '../../src/art/village-raster.js';
import {validateBakedPng} from '../../scripts/village-bake-plan.js';
const report = JSON.parse(await readFile(new URL('../../../docs/evidence/VIS-30-world-art/bake-report.json', import.meta.url)));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
it('binds every generated PNG and unchanged raw source/module to its measured hash and dimensions', async () => {
  for (const record of [...report.original.files, ...report.compiled.files]) {
    const bytes = await readFile(new URL(`../../public/${record.file}`, import.meta.url)); expect(hash(bytes)).toBe(record.sha256); expect(bytes.length).toBe(record.bytes);
    validateBakedPng(bytes, record);
  }
  for (const input of report.inputs) expect(hash(await readFile(new URL(`../../${input.module}`, import.meta.url)))).toBe(input.sha256);
  for (const sheet of Object.values(baked.sheets)) expect(report.compiled.files.find(row => row.file === sheet.file)).toMatchObject(sheet);
});
it('preserves every current raw ID/logical box/foot and proves all measured maximum-density frames are visible and exact', async () => {
  const families = await Promise.all(report.families.map(name => import(`../../src/art/village/${name}.js`))), raw = collectRasterFrames(families), normalized = collectRasterFrames([baked]);
  expect(Object.keys(normalized).sort()).toEqual(Object.keys(raw).sort());
  for (const [id, source] of Object.entries(raw)) {
    const frame = normalized[id], [w, h, anchor] = source.logical; expect(frame.logical).toEqual(source.logical);
    expect(frame.rect.slice(2)).toEqual([w * 4, h * 4]); expect(frame.sourceFoot).toEqual([w * 2, (h - anchor) * 4]);
    const proofs = report.verification.flatMap(row => row.results).filter(row => row.id === id); expect(proofs.map(row => row.density)).toEqual([4, 2, 1.5]);
    expect(proofs[0]).toMatchObject({differingPixels: 0, maxVisibleDelta: 0, maxAlphaDelta: 0}); expect(proofs[0].visiblePixels).toBeGreaterThan(0);
  }
  expect(report.errors).toEqual([]); expect(report.externalRequests).toEqual([]);
  for (const row of [...report.verification, ...report.compilerMemory]) expect(row.retainedDecodedAfterRelease).toBe(0);
});
