import {describe, expect, it} from 'vitest';
import {checkWallBuffers} from '../../scripts/perimeter-game-ui.mjs';
const mesh = quads => ({name: 'actual-layer', positions: Array(quads * 12).fill(1),
  index: Array.from({length: quads}, (_, q) => [0,1,2,0,2,3].map(i => q * 4 + i)).flat(), uvs: Array(quads * 8).fill(.5)});
const link = {a: 'wall_1', b: 'wall_2'};
describe('capture geometry evidence', () => {
  it('counts actual span buffers independently of logical links or mesh children', () => {
    const got = checkWallBuffers({links: [link], posts: [], meshes: [mesh(4)]});
    expect(got).toMatchObject({expectedQuads: 4, vertices: 16, indices: 24});
    expect(got.meshes[0].bufferSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('includes shaded posts and each exposed end cap rather than treating a batch as one wall', () => {
    expect(checkWallBuffers({links: [link], posts: [{id: 'wall_1', look: 'intact'}, {id: 'wall_2', look: 'intact'}], meshes: [mesh(14)]}))
      .toMatchObject({expectedQuads: 14, vertices: 56, indices: 84});
  });
  it('refuses empty, missing, nonfinite, duplicate or out-of-range render evidence', () => {
    const base = {links: [link], posts: [], meshes: [mesh(4)]};
    for (const bad of [null, {...base, meshes: []}, {...base, links: [link,link]},
      {...base, meshes: [{...mesh(4), positions: [NaN, ...mesh(4).positions.slice(1)]}]},
      {...base, meshes: [{...mesh(4), index: [-1, ...mesh(4).index.slice(1)]}]},
      {...base, meshes: [{...mesh(4), index: [16, ...mesh(4).index.slice(1)]}]}]) expect(() => checkWallBuffers(bad)).toThrow();
  });
});
