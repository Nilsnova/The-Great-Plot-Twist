// Pure world rules: lighting, shore safety, story locations and weather API.
import { describe, it, expect } from 'vitest';
import { sunPosition } from '../src/core/math.js';
import { terrainHeight } from '../src/world/terrain.js';
import { setWeather, getWeather, clampWeather } from '../src/world/weather.js';
import { zones, findZone } from '../src/world/zones.js';
import { canStand, groundHeight, moveWithCollisions, overlapsCollider } from '../src/player/collision.js';
import { on, emit } from '../src/core/events.js';
import { anchors } from '../src/world/lighthouse.js';
import { createBuildings } from '../src/world/buildings.js';

describe('time and terrain', () => {
  it('puts the sun below the horizon at midnight and highest at noon', () => {
    expect(sunPosition(0).y).toBeLessThan(0);
    expect(sunPosition(12).y).toBeCloseTo(1);
    expect(sunPosition(12).y).toBeGreaterThan(sunPosition(10).y);
    expect(sunPosition(12).y).toBeGreaterThan(sunPosition(14).y);
    expect(sunPosition(36)).toEqual(sunPosition(12));
    expect(sunPosition(6).y).toBeCloseTo(0);
  });
  it('makes dry land in the centre and seabed outside the island', () => {
    expect(terrainHeight(0, 0)).toBeGreaterThan(0);
    expect(terrainHeight(30, 0)).toBeLessThan(0);
    expect(terrainHeight(0, 27)).toBeLessThan(0);
    expect(canStand(0, 0)).toBe(true);
    expect(canStand(30, 0)).toBe(false);
  });
  it('keeps a walkable pier over water without making the surrounding sea walkable', () => {
    expect(terrainHeight(-2, 24)).toBeLessThan(0);
    expect(groundHeight(-2, 24)).toBeCloseTo(1.03);
    expect(canStand(-2, 24)).toBe(true);
    expect(canStand(0, 24)).toBe(false);
  });
});
describe('weather contract', () => {
  it('clamps supplied values and keeps missing values', () => {
    setWeather({ cloudCover: 0.4, rain: 0.2, fog: 0.3, wind: 0.7 });
    expect(setWeather({ rain: 12, wind: -2 })).toEqual({ cloudCover: 0.4, rain: 1, fog: 0.3, wind: 0 });
    expect(setWeather({ fog: NaN, rain: Infinity })).toEqual({ cloudCover: 0.4, rain: 1, fog: 0.3, wind: 0 });
    const copy = getWeather(); copy.rain = 0;
    expect(getWeather().rain).toBe(1);
  });
  it('never mutates input and ignores unrecognised keys and invalid data', () => {
    const previous = { cloudCover: 0, rain: 0, fog: 0, wind: 0 };
    expect(clampWeather(previous, { rain: 0.6, wind: '1', token: 'unused' })).toEqual({ ...previous, rain: 0.6 });
    expect(previous.rain).toBe(0);
    expect(clampWeather(previous, null)).toEqual(previous);
  });
});
describe('story integration', () => {
  it('returns the exact four story ids at reachable stand points, or none', () => {
    expect(zones.map(zone => zone.id).sort()).toEqual(['cottage', 'desk', 'shore', 'tower_door']);
    for (const zone of zones) {
      const point = { x: zone.x, y: groundHeight(zone.x, zone.z), z: zone.z };
      expect(canStand(point.x, point.z)).toBe(true);
      expect(findZone(point)).toBe(zone.id);
      expect(findZone({ ...point, y: point.y + 10 })).toBe(null);
    }
    expect(findZone({ x: 100, y: 0, z: 100 })).toBe(null);
  });
  it('selects a small nearby desk zone over a broad overlapping zone', () => {
    const list = [{ id: 'cottage', x: 0, y: 0, z: 0, radius: 5 }, { id: 'desk', x: 1, y: 0, z: 0, radius: 1 }];
    expect(findZone({ x: 1, y: 0, z: 0 }, list)).toBe('desk');
  });
  it('emits the story payload and supports unsubscribing', () => {
    const received = [], unsubscribe = on('interact', event => received.push(event));
    emit({ type: 'interact', id: 'desk' }); unsubscribe(); emit({ type: 'interact', id: 'shore' });
    expect(received).toEqual([{ type: 'interact', id: 'desk' }]);
  });
  it('exports finite named cutscene anchors at different tower heights', () => {
    expect(anchors.stairwell.x).toBe(anchors.lamp_room.x);
    expect(anchors.lamp_room.y).toBeGreaterThan(anchors.stairwell.y + 10);
  });
});
describe('movement safety', () => {
  const wall = { x: 0, z: 0, width: 0.2, depth: 4 };
  it('blocks wall tunnelling even across a large movement step', () => {
    const result = moveWithCollisions({ x: -1, z: 0 }, 3, 0, [wall]);
    expect(result.x).toBeLessThan(-0.4);
  });
  it('slides along a wall and detects round obstacles', () => {
    const result = moveWithCollisions({ x: -0.5, z: -0.5 }, 0.7, 1, [wall]);
    expect(result.x).toBeLessThan(-0.4); expect(result.z).toBeGreaterThan(0.4);
    expect(overlapsCollider(1, 0, { x: 0, z: 0, radius: 0.8 })).toBe(true);
    expect(overlapsCollider(2, 0, { x: 0, z: 0, radius: 0.8 })).toBe(false);
  });
  it('never lets a long run reach the open sea', () => {
    const result = moveWithCollisions({ x: 0, z: 0 }, 35, 35, []);
    expect(canStand(result.x, result.z)).toBe(true);
    expect(Math.hypot(result.x, result.z)).toBeLessThan(30);
  });
  it('lets a player enter the real cottage doorway and reach the desk without crossing furniture', () => {
    const { colliders } = createBuildings();
    const inside = moveWithCollisions({ x: -7, z: 7 }, 0, -3.3, colliders);
    expect(inside.z).toBeCloseTo(3.7);
    const atDesk = moveWithCollisions(inside, 0.8, 0, colliders);
    expect(findZone(atDesk)).toBe('desk');
    const blocked = moveWithCollisions(atDesk, 3, 0, colliders);
    expect(blocked.x).toBeLessThan(-6);
  });
});
