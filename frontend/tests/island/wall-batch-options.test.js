import {describe, expect, it} from 'vitest';
import {texturedWallBatches, wallVisualRows} from '../../src/island/wall-batches.js';
import {wallTopology} from '../../src/island/wall-connections.js';
import {frames, WALL_ATLAS_IDS, wallFrame} from '../../src/art/village/walls.js';

const rows = ['a', 'b', 'c', 'd'].map((id, i) => ({id, x: i * 2, z: 0,
  level: 3, kind: 'wall', built: true}));
const art = {width: 512, height: 512, rects: Object.fromEntries(WALL_ATLAS_IDS.map((id, i) =>
  [id, {x: i % 8 * 60, y: Math.floor(i / 8) * 60, w: frames[id].logical[0],
    h: frames[id].logical[1], anchor: frames[id].logical[2]}]))};
const quads = batches => [...batches.values()].flatMap(batch =>
  Array.from({length: batch.positions.length / 12}, (_, i) => ({
    points: batch.positions.slice(i * 12, i * 12 + 12), uv: batch.uvs.slice(i * 8, i * 8 + 8)})));
const draw = options => texturedWallBatches(wallTopology(rows).links, wallVisualRows(rows), art, options);
const centre = ({points}) => (points[0] + points[3] + points[6] + points[9]) / 4;

describe('ordinary selected wall batching', () => {
  it('retains all normal geometry and one real selected post in its existing depth layer', () => {
    const before = structuredClone(rows), normal = draw(), selected = draw({selectedId: 'b'});
    expect(quads(selected)).toHaveLength(quads(normal).length);
    expect([...selected.keys()]).toEqual([...normal.keys()]);
    const {x, y, w, h} = art.rects[wallFrame(3)];
    const uv = [(x+.5)/512,1-(y+h-.5)/512,(x+w-.5)/512,1-(y+h-.5)/512,
      (x+w-.5)/512,1-(y+.5)/512,(x+.5)/512,1-(y+.5)/512];
    const actual = quads(selected).filter(q => JSON.stringify(q.uv) === JSON.stringify(uv));
    expect(actual.filter(q => Math.abs(centre(q) - 2.6) < 1e-10)).toHaveLength(1);
    // The farther endpoint and its connector remain present when another wall is selected.
    expect(actual.some(q => Math.abs(centre(q) - 7.8) < 1e-10)).toBe(true);
    expect(quads(selected).some(q => centre(q) > 5.2 && q.points.length === 12)).toBe(true);
    expect(rows).toEqual(before);
  });

  it('filters only when a caller explicitly requests diagnostic selection-only geometry', () => {
    const subset = draw({selectedId: 'b', selectionOnly: true});
    expect(quads(subset)).toHaveLength(9);
    expect(quads(subset).every(q => centre(q) < 6)).toBe(true);
    expect(quads(draw({selectedId: 'missing', selectionOnly: true}))).toEqual([]);
  });

  it('keeps an unknown normal selection equivalent to no selection', () => {
    expect(draw({selectedId: 'missing'})).toEqual(draw());
    expect(draw({selectedId: null, selectionOnly: true})).toEqual(draw());
  });
});
