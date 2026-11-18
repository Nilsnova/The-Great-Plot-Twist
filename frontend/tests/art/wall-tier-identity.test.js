// Regression: canonical L1 damage IDs must not be overwritten by legacy L3 aliases.
import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {frames, wallFrame, WALL_ATLAS_IDS, WALL_POST_IDS} from '../../src/art/village/walls.js';
import {makeWallConnections} from '../../src/island/wall-connections.js';
import {makeCombatWallConnections} from '../../src/pirates/wall-connections.js';

const looks = ['intact', 'damaged', 'broken'];
const canonical = (level, look) => `island-wall${level === 1 && look === 'intact' ? '' : `-l${level}`}${look === 'intact' ? '' : `-${look}`}`;

describe('wall tier identity across canonical artwork and consumers', () => {
  it('keeps each of the fifteen canonical frames in its authored material column and damage row', () => {
    for (let level = 1; level <= 5; level++) for (const [row, look] of looks.entries()) {
      const id = canonical(level, look), frame = frames[id];
      expect(wallFrame(level, look)).toBe(id);
      expect(frame, id).toBeDefined();
      const [x, y, width, height] = frame.rect;
      expect(x + width / 2, id).toBeGreaterThan((level - 1) * 1536 / 5);
      expect(x + width / 2, id).toBeLessThan(level * 1536 / 5);
      expect(y, id).toBeGreaterThanOrEqual([0,370,790][row]);
      expect(y + height, id).toBeLessThanOrEqual([370,790,1024][row]);
      expect(frame.logical, id).toEqual([48, 48, 6]);
      expect(frame.sourceFoot, id).toEqual([[166, 461, 764, 1064, 1358][level - 1] - x, [350,734,982][row]-y]);
      expect(WALL_POST_IDS.filter(value => value === id), id).toHaveLength(1);
      expect(WALL_ATLAS_IDS.filter(value => value === id), id).toHaveLength(1);
    }
    for (const look of ['damaged', 'broken']) {
      expect(frames[`island-wall-${look}`]).toEqual(frames[canonical(3, look)]);
      expect(frames[`island-wall-${look}`].rect).not.toEqual(frames[canonical(1, look)].rect);
      expect(WALL_ATLAS_IDS).not.toContain(`island-wall-${look}`);
    }
    expect(new Set(WALL_POST_IDS).size).toBe(15);
  });

  it.each(['world', 'combat'])('%s buffers select the correct canonical atlas rectangle for all tiers and states', consumer => {
    const ids = Array.from({length: 5}, (_, index) => looks.map(look => canonical(index + 1, look))).flat();
    const rects = Object.fromEntries([...new Set([...ids, ...WALL_ATLAS_IDS])].map((id, i) =>
      [id, {x: i % 8 * 60, y: Math.floor(i / 8) * 40, w: 48, h: 32, anchor: 6}]));
    const art = {texture: new THREE.Texture(), width: 512, height: 512, rects, ownsTexture: false};
    for (let level = 1; level <= 5; level++) for (const look of looks) {
      const root = new THREE.Group(), row = {id: 'wall_1', kind: 'wall', built: true, x: 0, z: 0, level, look};
      const drawing = consumer === 'world' ? makeWallConnections(root) : makeCombatWallConnections(root, art);
      if (consumer === 'world') { drawing.setArt(art); drawing.show([row]); }
      else drawing.show([row], [{id: row.id, hp: {intact: 100, damaged: 40, broken: 0}[look], maxHp: 100}]);
      let uv;
      root.traverse(mesh => {
        if (mesh.name.startsWith('wall-art-layer:')) uv = Array.from(mesh.geometry.getAttribute('uv').array).slice(-8);
      });
      const frame = rects[canonical(level, look)];
      const u0 = (frame.x + .5) / 512, u1 = (frame.x + frame.w - .5) / 512;
      const v0 = 1 - (frame.y + frame.h - .5) / 512, v1 = 1 - (frame.y + .5) / 512;
      expect(uv, `${consumer} level ${level} ${look}`).toEqual([u0, v0, u1, v0, u1, v1, u0, v1]);
      drawing.dispose();
    }
    art.texture.dispose();
  });
});
