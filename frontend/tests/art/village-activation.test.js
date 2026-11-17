// The integrated family bindings must select the actual approved PNG and shared visual metrics.
import {describe, expect, it} from 'vitest';
import {getRasterFrame, rasterFrameSizes} from '../../src/art/village-raster.js';
import {artSizes} from '../../src/world/art.js';

describe('approved village family activation', () => {
  it('binds the hero, all house roles and nature to their original local sources', () => {
    expect(getRasterFrame('cabin').sheet.file).toBe('village/buildings-hero-v1.png');
    for (const id of ['island-house', 'island-house-l2', 'island-house-l3',
      'island-house-barracks', 'island-house-barracks-l3', 'island-house-tavern',
      'island-house-tavern-l3', 'island-house-workshop', 'island-house-workshop-l3']) {
      expect(getRasterFrame(id)?.sheet.file, id).toBe('village/houses-v1.png');
    }
    for (const id of ['oak', 'pine', 'birch', 'birch-tall', 'rock', 'shrub', 'flowers', 'grass-tuft']) {
      expect(getRasterFrame(id)?.sheet.file, id).toBe('village/nature-v1.png');
    }
  });

  it('uses the approved bell visual override and preserves the hero ground anchor', () => {
    expect(getRasterFrame('island-bell').logical).toEqual([56, 72, 8]);
    expect(artSizes['island-bell']).toEqual([3.5, 4.5, 8 / 72]);
    expect(artSizes.cabin).toEqual([6, 6, 12 / 96]);
    for (const [id, dimensions] of Object.entries(rasterFrameSizes())) expect(artSizes[id], id).toEqual(dimensions);
  });

  it('retains unregistered actor and effect families as the existing fallback', () => {
    expect(getRasterFrame('captain-1')).toBeNull();
    expect(getRasterFrame('fx-explosion')).toBeNull();
    expect(artSizes['captain-1']).toBeDefined();
  });
});
