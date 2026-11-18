import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {collectRasterFrames, normalizeRasterFrame} from '../../src/art/village-raster.js';
import * as raw from '../../src/art/village/walls.js';
import {texturedWallBatches, wallVisualRows} from '../../src/island/wall-batches.js';
import {wallTopology} from '../../src/island/wall-connections.js';

// Reviewed native rectangles: retain four authored pixels around alpha>=16 artwork,
// include the unchanged source foot, then fit all three states to one level box.
const expected = [
  {fit: [121,309,112,4], rects: [[78,54,176,300],[51,425,223,313],[45,869,233,117]], solidTop: 59},
  {fit: [110,272,106,4], rects: [[364,93,196,261],[354,462,213,276],[351,875,216,111]], solidTop: 98},
  {fit: [124,327,115,4], rects: [[670,39,189,315],[646,407,232,331],[640,854,239,132]], solidTop: 44},
  {fit: [120,315,116,4], rects: [[973,50,182,304],[948,419,224,319],[944,860,236,126]], solidTop: 55},
  {fit: [125,337,120,4], rects: [[1258,27,200,327],[1237,397,241,341],[1233,841,242,145]], solidTop: 32},
];
const nativeFeet = [166,461,764,1064,1358], rowFeet = [350,734,982];
const looks = ['intact','damaged','broken'];
const wall = (id,x,z,level) => ({id,x,z,level,kind:'wall',built:true});
const art = {width:1024,height:1024,rects:Object.fromEntries(raw.WALL_ATLAS_IDS.map((id,i) =>
  [id,{x:i%8*70,y:Math.floor(i/8)*70,w:raw.frames[id].logical[0],h:raw.frames[id].logical[1],anchor:raw.frames[id].logical[2]}]))};

describe('upright original wall posts', () => {
  it('retains the exact original raw artwork bytes', () => {
    for (const [name,hash] of [['walls-posts-v1.png','38347e0c44d75b59a3fc07748e90bc6d2df769e10de34d2a1376ded6187dc18a'],
      ['walls-surfaces-v1.png','459a08817a8f9c1a29603dde25655b36287e71e723111739dea6a465e6081ca8']]) {
      expect(createHash('sha256').update(readFileSync(new URL(`../../public/village/${name}`,import.meta.url))).digest('hex')).toBe(hash);
    }
  });

  it.each([1,2,3,4,5])('fits level %i states without changing their source ground foot or relative scale', level => {
    const frames = collectRasterFrames([raw]), fixture = expected[level-1], scales = [];
    for (const [state,look] of looks.entries()) {
      const frame = frames[raw.wallFrame(level,look)], [x,y,w,h] = fixture.rects[state];
      expect(frame.logical).toEqual([48,48,6]); expect(frame.rect).toEqual([x,y,w,h]);
      expect(frame.sourceFoot).toEqual([nativeFeet[level-1]-x,rowFeet[state]-y]);
      expect(frame.fitBounds).toEqual(fixture.fit);
      let call;
      vi.stubGlobal('document',{createElement:()=>({getContext:()=>({setTransform(){},drawImage(...args){call=args;}})})});
      try {normalizeRasterFrame({},frame,2);} finally {vi.unstubAllGlobals();}
      const [,sx,sy,sw,sh,dx,dy,dw,dh] = call;
      expect([sx,sy,sw,sh]).toEqual(frame.rect);
      const scale = dw/sw; scales.push(scale);
      expect(dh/sh).toBeCloseTo(scale,12);
      expect(dx+frame.sourceFoot[0]*scale).toBeCloseTo(24,12);
      expect(dy+frame.sourceFoot[1]*scale).toBeCloseTo(42,12);
    }
    expect(scales[1]).toBeCloseTo(scales[0],12); expect(scales[2]).toBeCloseTo(scales[0],12);
  });

  it.each([[1,.85],[2,.95],[3,1.10],[4,1.20],[5,1.30]])(
    'keeps level %i village-scale faces inside the real footprint and below visible authored post tops', (level,height) => {
      const fixture = expected[level-1], scale = Math.min(24/fixture.fit[0],42/fixture.fit[1],24/fixture.fit[2],6/fixture.fit[3]);
      const visibleTop = (350-fixture.solidTop)*scale/16*.65;
      // Includes the rear projected rise, not merely the transparent logical image box.
      expect(height+.6*.28+.02).toBeLessThan(visibleTop);
      const horizontal = {a:'a',b:'b',x0:0,z0:0,x1:2,z1:0,level};
      const batch = [...texturedWallBatches([horizontal],[],art).values()][0];
      const values = batch.positions;
      expect(values).toHaveLength(48); expect(batch.indices).toHaveLength(24);
      expect(Math.max(...values.filter((_,i)=>i%3===1))).toBeCloseTo(height+.168,12);
      const groundY = values.slice(12,18).filter((_,i)=>i%3===1);
      expect(groundY).toEqual([-.168,-.168]);
      expect(values.slice(0,12).filter((_,i)=>i%3===0)).toEqual([-.056,2.544,2.656,.056].map(x=>expect.closeTo(x,12)));
      const rows = [wall('a',0,0,level),wall('b',2,0,level),wall('c',4,0,level)], before = structuredClone(rows);
      const topology = wallTopology(rows); texturedWallBatches(topology.links,wallVisualRows(rows),art);
      expect(rows).toEqual(before); expect(topology.links).toHaveLength(2);
      expect(wallTopology(rows.map(row=>row.id==='b'?{...row,hp:0}:row)).links).toEqual([]);
    });
});
