// The downloaded WebP are bound to the proved masters, the authored terrain atlas and the shipping report.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {expect, it} from 'vitest';
import {QUALITY} from '../../src/config.js';
import * as baked from '../../src/art/village/baked.js';
import {shippedSheets, shippedTerrain} from '../../src/art/village/shipped.js';
import {sheetHeader} from '../../src/art/village-decode.js';
import {TERRAIN_MATERIALS, TERRAIN_SOURCE_SHEET} from '../../src/art/village/terrain-materials.js';
const read = path => readFile(new URL(path, import.meta.url));
const bake = JSON.parse(await read('../../../docs/evidence/VIS-30-world-art/bake-report.json'));
const ship = JSON.parse(await read('../../../docs/evidence/VIS-30-world-art/ship-report.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const header = bytes => sheetHeader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));

it('ships one same-size WebP per proved master, bound to its hash, bytes and lossy-error proof', async () => {
  expect(Object.keys(shippedSheets).sort()).toEqual(Object.values(baked.sheets).map(sheet => sheet.file).sort());
  expect(ship.sprites.files).toHaveLength(Object.keys(shippedSheets).length);
  for (const record of ship.sprites.files) {
    const master = bake.compiled.files.find(row => row.file === record.source);
    expect(master, record.source).toBeTruthy(); expect(record.sourceSha256).toBe(master.sha256);
    expect([record.width, record.height]).toEqual([master.width, master.height]);
    expect(shippedSheets[record.source]).toEqual({file: record.file, width: record.width, height: record.height});
    const bytes = await read(`../../public/${record.file}`);
    expect(hash(bytes)).toBe(record.sha256); expect(bytes.length).toBe(record.bytes);
    expect(header(bytes)).toEqual({type: 'webp', width: record.width, height: record.height});
    expect(record.proof.maxAlphaDelta).toBeLessThanOrEqual(ship.limits.maxAlphaDelta);
    expect(record.proof.alphaWeightedMeanRgbDelta).toBeLessThanOrEqual(ship.limits.alphaWeightedMeanRgbDelta);
    expect(record.proof.visiblePixels).toBeGreaterThan(0);
  }
  expect(ship.errors).toEqual([]); expect(ship.externalRequests).toEqual([]);
  expect(hash(await read('../../../docs/evidence/VIS-30-world-art/bake-report.json'))).toBe(ship.bakeReportSha256);
});

it('ships the terrain atlas from the authored crops at no less than the ground ever paints', async () => {
  const source = await read(`../../public/${TERRAIN_SOURCE_SHEET.file}`), bytes = await read(`../../public/${shippedTerrain.file}`);
  expect(hash(source)).toBe(ship.terrain.sourceSha256); expect(hash(bytes)).toBe(ship.terrain.sha256);
  expect(header(bytes)).toEqual({type: 'webp', width: shippedTerrain.width, height: shippedTerrain.height});
  expect(ship.terrain.sourceRects).toEqual(Object.fromEntries(Object.entries(TERRAIN_MATERIALS).map(([name, row]) => [name, row.rect])));
  expect(ship.terrain.maxGroundTexelsPerUnit).toBe(QUALITY.high.groundTexels);
  for (const [name, material] of Object.entries(TERRAIN_MATERIALS)) {
    const [, , w, h] = shippedTerrain.rects[name];
    expect(Math.min(w / material.period[0], h / material.period[1]), name).toBeGreaterThanOrEqual(ship.terrain.maxGroundTexelsPerUnit);
  }
  expect(ship.initialTransfer.shippedBytes).toBe([...ship.sprites.files, ship.terrain].reduce((sum, row) => sum + row.bytes, 0));
  expect(ship.initialTransfer.targetMet).toBe(true);
});
