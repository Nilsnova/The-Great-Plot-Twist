// Invertibility, unchanged logical inputs and exact legacy-ground conversion form one display contract.
import {describe, expect, it} from 'vitest';
import {GROUND_PROJECTION, LEGACY_DEPTH, projectGround, unprojectGround, projectGroundVector,
  projectGroundPlane, projectLegacyGround, unprojectLegacyGround, projectedCoastBounds, displayedBounds} from '../../src/world/projection.js';
import {cliffProfile} from '../../src/art/coast-cliffs.js';
import {surfaces, surfaceClass} from '../../src/world/places/surfaces.js';

describe('reference-village ground projection', () => {
  it('roundtrips half-grid and distant naval positions without changing logical inputs', () => {
    for (const x of [-80, -20, -.5, 0, .5, 20, 80]) for (const z of [-60, -22, -.5, 0, .5, 22, 60]) {
      const point = Object.freeze({x, z}), displayed = projectGround(point.x, point.z), logical = unprojectGround(displayed.x, displayed.y);
      expect(logical.x).toBeCloseTo(x, 10); expect(logical.z).toBeCloseTo(z, 10);
    }
  });
  it('keeps directions linear and both ground axes visible without reversing local XY winding', () => {
    expect(GROUND_PROJECTION.xScale * GROUND_PROJECTION.depthScale).toBeGreaterThan(0);
    const a = projectGround(3, -8), b = projectGround(7, 4), direction = projectGroundVector(4, 12);
    expect(b.x - a.x).toBeCloseTo(direction.x); expect(b.y - a.y).toBeCloseTo(direction.y);
    expect(projectGroundVector(0, 2).x).toBeGreaterThan(0);
    const right = projectGroundPlane(1, 0), up = projectGroundPlane(0, 1);
    expect(right.x * up.y - right.y * up.x).toBeGreaterThan(0);
  });
  it('maps a legacy backdrop foot to exactly the same place as an upright sprite foot', () => {
    for (const [x, z] of [[0, 0], [-20, -22], [20, 22], [7.5, -.5], [30, 55]]) {
      const backdrop = projectLegacyGround(x, -z * LEGACY_DEPTH), sprite = projectGround(x, z);
      expect(backdrop.x).toBeCloseTo(sprite.x, 12); expect(backdrop.y).toBeCloseTo(sprite.y, 12);
      const raw = unprojectLegacyGround(backdrop.x, backdrop.y);
      expect(raw.x).toBeCloseTo(x, 12); expect(raw.y).toBeCloseTo(-z * LEGACY_DEPTH, 12);
    }
  });
  it('bounds the actual top and asymmetric3.2-unit decorative base without granting new land', () => {
    const profile = cliffProfile(surfaces.home_islet), before = structuredClone(profile), bounds = projectedCoastBounds(profile);
    for (const row of profile) {
      const top = projectGround(row.x, row.z), base = projectLegacyGround(row.x, -row.y - row.depth);
      for (const point of [top, base]) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.minX - 1e-10); expect(point.x).toBeLessThanOrEqual(bounds.maxX + 1e-10);
        expect(point.y).toBeGreaterThanOrEqual(bounds.minY - 1e-10); expect(point.y).toBeLessThanOrEqual(bounds.maxY + 1e-10);
      }
      const raw = unprojectGround(top.x, top.y);
      expect(surfaceClass('home_islet', raw.x * .999, raw.z * .999)).toBeGreaterThan(0);
    }
    expect(profile).toEqual(before); expect(bounds.maxX - bounds.minX).toBeGreaterThan(50);
    expect(bounds.maxY - bounds.minY).toBeGreaterThan(25); expect(bounds.maxY - bounds.minY).toBeLessThan(32);
    const drop = projectLegacyGround(0, -3.2); expect(drop.x).toBeGreaterThan(0); expect(drop.y).toBeCloseTo(-8/3);
    expect(displayedBounds([])).toBeNull(); expect(displayedBounds([{x: NaN, y: 0}])).toBeNull();
  });
});
