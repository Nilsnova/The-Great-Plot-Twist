// Walk up and press E (owner, 12 Nov): the nearest thing in reach is the one prompt, E opens it, a click from
// afar only says "Walk closer", and a fallen teammate in reach owns E during a wave.
import {describe, expect, it} from 'vitest';
import {BELL, CABIN, REACH, SPOTS, islandZones} from '../../src/island/spots.js';
import {HINT_MS, WALK_CLOSER, clickVerdict, eDecision, promptLine} from '../../src/world/reach.js';
import {findZone} from '../../src/world/zones.js';

const zones = islandZones();
const zoneOf = id => zones.find(zone => zone.id === id);
const at = (zone, dx = 0, dz = 0) => ({x: zone.x + dx, y: 1.03, z: zone.z + dz});

describe('the walk-up range', () => {
  it('is about 3.5 units from a building (the zone point sits one step in front of it)', () => {
    expect(REACH).toBeGreaterThanOrEqual(2.4);
    expect(REACH + 1).toBeLessThanOrEqual(4);
    for (const spot of SPOTS) expect(zoneOf(spot.id).radius, spot.id).toBe(REACH);
  });
  it('picks the nearest thing in range, only one at a time', () => {
    // house_1 (7, -6) and wall_12 (4, -5.5) are close together: standing next to one picks that one.
    const house = zoneOf('house_1'), wall = zoneOf('wall_12');
    expect(findZone(at(house, .3, .2), zones)).toBe('house_1');
    expect(findZone(at(wall, -.3, 0), zones)).toBe('wall_12');
    const between = {x: (house.x + wall.x) / 2 + .6, y: 1.03, z: (house.z + wall.z) / 2};
    expect(findZone(between, zones)).toBe(Math.hypot(between.x - house.x, between.z - house.z) / house.radius < Math.hypot(between.x - wall.x, between.z - wall.z) / wall.radius ? 'house_1' : 'wall_12');
  });
  it('finds nothing out of range', () => {
    expect(findZone({x: 0, y: 1.03, z: 0}, zones)).toBe(null);
    expect(findZone(at(zoneOf('cannon_1'), REACH + .5, 0), zones)).not.toBe('cannon_1');
  });
});

describe('clicks', () => {
  it('open the card in range', () => {
    expect(clickVerdict(at(zoneOf('cannon_1'), 1, 0), zones, 'cannon_1')).toMatchObject({open: true});
    expect(clickVerdict(at(zoneOf(BELL.id), 0, 1), zones, BELL.id)).toMatchObject({open: true});
  });
  it('from afar do not open, they say "Walk closer"', () => {
    const verdict = clickVerdict({x: 0, y: 1.03, z: 0}, zones, 'cannon_1');
    expect(verdict).toMatchObject({open: false, hint: WALK_CLOSER});
    expect(verdict.zone.id).toBe('cannon_1');
    expect(WALK_CLOSER).toBe('Walk closer');
    expect(HINT_MS).toBeLessThan(3000);
    expect(clickVerdict(at(zoneOf('cannon_1'), REACH + 1, 0), zones, 'cannon_1').open).toBe(false);
  });
  it('are not refused when the place cannot tell (no position, no such zone)', () => {
    expect(clickVerdict(null, zones, 'cannon_1').open).toBe(true);
    expect(clickVerdict({x: 99, y: 1, z: 99}, zones, 'unknown').open).toBe(true);
  });
  it('have a reach for every kind of thing: spot, bell, campaign building, cabin', () => {
    for (const id of ['wall_1', BELL.id, 'island_harbor', 'island_techhub', 'island_wreck', CABIN.id]) {
      expect(clickVerdict(at(zoneOf(id)), zones, id).open, id).toBe(true);
      expect(clickVerdict(at(zoneOf(id), 12, 12), zones, id).open, id).toBe(false);
    }
  });
});

describe('E', () => {
  const zone = 'cannon_1';
  it('opens the card of the nearest thing in range', () => {
    expect(eDecision({zone})).toBe('open');
    expect(eDecision({zone: null})).toBe('none');
  });
  it('belongs to a fallen teammate in range before any building (and to any wave action)', () => {
    expect(eDecision({zone, waveAction: {kind: 'revive', targetId: 'p-ben'}})).toBe('wave');
    expect(eDecision({zone, waveAction: {kind: 'fire'}})).toBe('wave');
    expect(eDecision({zone: null, waveAction: {kind: 'revive'}})).toBe('wave');
  });
  it('never opens a card while a revive hold runs, even if the wave action blinks off for a frame', () => {
    expect(eDecision({zone, waveAction: null, reviving: true})).toBe('wave');
  });
  it('words the prompt', () => {
    expect(promptLine('Upgrade Cannon')).toBe('E · Upgrade Cannon');
    expect(promptLine('')).toBe('');
  });
});
