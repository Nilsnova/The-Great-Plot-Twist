import {describe, expect, it} from 'vitest';
import {APPROACH_DEPTH, CLIFF_DEPTH, cliffProfile} from '../../src/art/coast-cliffs.js';
import {surfaceClass, surfaces} from '../../src/world/places/surfaces.js';
import {projectPoint} from '../../src/world/art.js';

const coast = surfaces.home_islet;
describe('decorative cliffs and the unchanged walkable top', () => {
  it('keeps every original top point on the same analytic boundary and projection', () => {
    const before = structuredClone(coast), profile = cliffProfile(coast);
    expect(profile).toHaveLength(181);
    for (const point of profile) {
      expect(surfaceClass('home_islet', point.x * .999, point.z * .999)).toBeGreaterThan(0);
      expect(surfaceClass('home_islet', point.x * 1.001, point.z * 1.001)).toBe(0);
      expect(point.y).toBe(-projectPoint(point.x, point.z).y);
      expect(point.baseY).toBeGreaterThan(point.y);
    }
    expect(coast).toEqual(before);
  });
  it('bounds every decorative face within the existing backdrop without increasing its screen-X extent', () => {
    const profile = cliffProfile(coast);
    for (const point of profile) {
      expect(Math.abs(point.x)).toBeLessThan(30);
      expect(Math.abs(point.y)).toBeLessThan(22);
      expect(Math.abs(point.baseY)).toBeLessThan(22);
      expect(point.depth).toBeGreaterThanOrEqual(APPROACH_DEPTH);
      expect(point.depth).toBeLessThanOrEqual(CLIFF_DEPTH);
    }
    expect(profile[0].x).toBeCloseTo(profile.at(-1).x, 12);
    expect(profile[0].baseY).toBeCloseTo(profile.at(-1).baseY, 12);
  });
  it('keeps the southern naval/beach window shallow and eases into the taller side faces', () => {
    const profile = cliffProfile(coast);
    for (let i = 36; i <= 54; i++) expect(profile[i].depth).toBeCloseTo(APPROACH_DEPTH, 12);
    expect(profile[30].depth).toBeCloseTo(CLIFF_DEPTH, 12);
    expect(profile[60].depth).toBeCloseTo(CLIFF_DEPTH, 12);
    expect(profile[34].depth).toBeGreaterThan(APPROACH_DEPTH);
    expect(profile[34].depth).toBeLessThan(CLIFF_DEPTH);
  });
  it('is deterministic and leaves other analytic surfaces unchanged', () => {
    const before = structuredClone(surfaces);
    expect(cliffProfile(coast)).toEqual(cliffProfile(coast));
    expect(surfaces).toEqual(before);
  });
});
