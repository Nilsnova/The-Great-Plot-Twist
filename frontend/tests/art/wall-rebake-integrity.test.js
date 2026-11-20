import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import * as current from '../../src/art/village/baked.js';
import * as before from '../../../docs/evidence/VIS-64-upright-walls/baked-before.js';

const folder = new URL('../../../docs/evidence/VIS-64-upright-walls/',import.meta.url);
const bytes = name => readFileSync(new URL(name,folder));
const read = name => JSON.parse(bytes(name));
const hash = data => createHash('sha256').update(data).digest('hex');
const receipt = read('rebake-integrity.json'), prior = read('bake-report-before.json'), wall = read('wall-bake-report.json');
const activeFolder = new URL('../../../docs/evidence/VIS-30-world-art/', import.meta.url);
const active = JSON.parse(readFileSync(new URL('bake-report.json', activeFolder)));
const replacementProofs = new Map(active.replacementHistory.map(row => {
  const compilerBytes = readFileSync(new URL(row.compilerReport, activeFolder));
  return [row.family, {row, compilerBytes, proof: JSON.parse(compilerBytes)}];
}));

describe('scoped world-art compilation provenance', () => {
  it('keeps the wall binding and applies only explicitly proved family replacements', () => {
    expect(receipt.changedMetadataKeys).toHaveLength(33);
    const owned = new Set(receipt.changedMetadataKeys);
    expect(owned).toEqual(new Set([...Object.keys(wall.plans[0].sheets), ...Object.keys(wall.plans[0].frames)]));
    expect(replacementProofs.get('walls').proof).toEqual(wall);
    for (const kind of ['sheets','frames']) {
      const expected = {...before[kind]};
      for (const [family, {row, proof, compilerBytes}] of replacementProofs) {
        expect(hash(compilerBytes), family).toBe(row.compilerReportSha256);
        expect(proof.errors, family).toEqual([]);
        expect(proof.externalRequests, family).toEqual([]);
        const plan = proof.plans.find(plan => plan.name === family);
        expect(plan, family).toBeDefined();
        Object.assign(expected, plan[kind]);
      }
      expect(current[kind]).toEqual(expected);
    }
  });

  it('retains historical bytes and every unrelated aggregate proof record', () => {
    expect(hash(bytes('baked-before.js'))).toBe(receipt.previousBakedSha256);
    expect(hash(bytes('bake-report-before.json'))).toBe(receipt.previousReportSha256);
    expect(hash(bytes('wall-bake-report.json'))).toBe(receipt.compilerReportSha256);
    expect(hash(bytes('bake-wrapper-used.mjs'))).toBe(receipt.wrapperSha256);
    for (const [key,tag] of [['inputs','name'],['plans','name'],['verification','family'],['compilerMemory','family']]) {
      expect(active[key].map(row => row[tag])).toEqual(prior[key].map(row => row[tag]));
      for (const family of active.families) {
        const source = replacementProofs.get(family)?.proof ?? prior;
        expect(active[key].filter(row => row[tag] === family), family).toEqual(source[key].filter(row => row[tag] === family));
      }
    }
    const projectAssets = new URL('../../public/', import.meta.url);
    for (const source of [prior, active]) {
      for (const {file, bytes, sha256} of source.original.files) {
        const image = readFileSync(new URL(file, projectAssets));
        expect(image.byteLength, file).toBe(bytes);
        expect(hash(image), file).toBe(sha256);
      }
    }
    expect(active.transportHistory).toEqual(prior.transportHistory);
    expect(replacementProofs.get('walls').row.compilerReportSha256).toBe(receipt.compilerReportSha256);
    for (const [family, {proof}] of replacementProofs) expect(active.proofOrigins[family], family).toBe(proof.sourceCommit);
  });

  it('retains all native per-density results and derives the full-world transfer total', () => {
    expect(wall.families).toEqual(['walls']); expect(wall.errors).toEqual([]); expect(wall.externalRequests).toEqual([]);
    expect(wall.verification).toHaveLength(1); expect(wall.verification[0].results).toHaveLength(128);
    for (const id of Object.keys(wall.plans[0].frames)) {
      const proof = wall.verification[0].results.filter(row=>row.id===id);
      expect(proof.map(row=>row.density)).toEqual([4,2.5,2,1.5]);
      expect(proof[0]).toMatchObject({differingPixels:0,maxVisibleDelta:0,maxAlphaDelta:0});
      expect(proof[0].visiblePixels).toBeGreaterThan(0);
    }
    expect(wall.verification[0].retainedDecodedAfterRelease).toBe(0);
    const retiredWallSheets = new Set(receipt.changedMetadataKeys.flatMap(key => before.sheets[key]?.file ?? []));
    const wallOnly = prior.compiled.files.filter(row => !retiredWallSheets.has(row.file)).concat(wall.compiled.files);
    expect(wallOnly.reduce((sum, row) => sum + row.bytes, prior.initialTransfer.unchangedTerrainBytes)).toBe(12950770);
    const compiled = active.compiled.files.reduce((sum,row)=>sum+row.bytes,0);
    expect(active.initialTransfer.compiledPlusTerrainBytes).toBe(compiled+active.initialTransfer.unchangedTerrainBytes);
    expect(active.initialTransfer.targetMet).toBe(active.initialTransfer.compiledPlusTerrainBytes <= active.initialTransfer.targetBytes);
  });
});
