// The pirate-wave sprites (lane P2): registered, on the 16 px grid, distinct frames, never preloaded.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pirateArtIds, pirateDimensions, pirateFrames, pirateLevels } from '../../src/pixel/pirate-catalog.js';
import { pixelArtIds, pixelById } from '../../src/pixel/catalog.js';

describe('pirate art', () => {
  it('registers every sprite as a library asset with matching PNG headers on the 16 px grid', () => {
    expect(pirateArtIds).toHaveLength(57);
    for (const id of pirateArtIds) {
      const [width, height, anchor] = pirateDimensions[id];
      expect(pixelById[id]).toMatchObject({ width, height, usage: 'library' });
      expect(pixelArtIds).not.toContain(id);
      expect(width % 16).toBe(0); expect(height % 16).toBe(0);
      expect(anchor).toBeGreaterThan(0); expect(anchor).toBeLessThan(height);
      const bytes = readFileSync(`public/pixel/${id}.png`);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([width, height]);
    }
  });

  it('draws a different picture for every animation frame and state', () => {
    for (const ids of Object.values(pirateFrames)) {
      const images = ids.map(id => readFileSync(`public/pixel/${id}.png`).toString('base64'));
      expect(new Set(images).size).toBe(ids.length);
      for (const id of ids) expect(pirateArtIds).toContain(id);
    }
  });

  it('draws every building level as its own picture', () => {
    for (const ids of Object.values(pirateLevels)) {
      expect(ids).toHaveLength(3);
      expect(new Set(ids.map(id => readFileSync(`public/pixel/${id}.png`).toString('base64'))).size).toBe(3);
    }
  });
});
