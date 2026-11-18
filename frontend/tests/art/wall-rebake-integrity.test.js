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
const active = JSON.parse(readFileSync(new URL('../../../docs/evidence/VIS-30-world-art/bake-report.json',import.meta.url)));

describe('single-family wall compilation provenance', () => {
  it('changes exactly the declared wall metadata while preserving all unrelated family bindings', () => {
    expect(receipt.changedMetadataKeys).toHaveLength(33);
    const owned = new Set(receipt.changedMetadataKeys);
    for (const kind of ['sheets','frames']) {
      expect(Object.keys(current[kind])).toEqual(Object.keys(before[kind]));
      for (const [key,value] of Object.entries(before[kind])) {
        if (!owned.has(key)) expect(current[kind][key],key).toEqual(value);
        else expect(current[kind][key],key).toEqual(wall.plans[0][kind][key]);
      }
    }
    expect(owned).toEqual(new Set([...Object.keys(wall.plans[0].sheets),...Object.keys(wall.plans[0].frames)]));
  });

  it('retains historical bytes and every unrelated aggregate proof record', () => {
    expect(hash(bytes('baked-before.js'))).toBe(receipt.previousBakedSha256);
    expect(hash(bytes('bake-report-before.json'))).toBe(receipt.previousReportSha256);
    expect(hash(bytes('wall-bake-report.json'))).toBe(receipt.compilerReportSha256);
    expect(hash(bytes('bake-wrapper-used.mjs'))).toBe(receipt.wrapperSha256);
    for (const [key,tag] of [['inputs','name'],['plans','name'],['verification','family'],['compilerMemory','family']]) {
      expect(active[key].filter(row=>row[tag]!=='walls')).toEqual(prior[key].filter(row=>row[tag]!=='walls'));
      expect(active[key].filter(row=>row[tag]==='walls')).toEqual(wall[key]);
    }
    expect(active.original).toEqual(prior.original); expect(active.transportHistory).toEqual(prior.transportHistory);
    expect(active.replacementHistory.at(-1).compilerReportSha256).toBe(receipt.compilerReportSha256);
    expect(active.proofOrigins.walls).toBe(wall.sourceCommit);
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
    const compiled = active.compiled.files.reduce((sum,row)=>sum+row.bytes,0);
    expect(active.initialTransfer.compiledPlusTerrainBytes).toBe(compiled+active.initialTransfer.unchangedTerrainBytes);
    expect(active.initialTransfer.compiledPlusTerrainBytes).toBe(12950770);
    expect(active.initialTransfer.targetMet).toBe(false);
  });
});
