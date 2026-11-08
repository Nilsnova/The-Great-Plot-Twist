// Pure route and walker checks cover collision detours, bounded work and player cancellation.
import {describe, expect, it, vi} from 'vitest';
import {planTapPath, createTapWalker} from '../src/controls/tap-path.js';

const start = {x: 0, y: 0};
const target = {x: 4, y: 0};
const wall = (x, y) => !(x >= 1.5 && x <= 2.5 && Math.abs(y) < 1.5);

describe('tap route planning', () => {
  it('walks around a wall without crossing its blocked area', () => {
    const path = planTapPath(start, target, {canStand: wall, step: 1, margin: 2});
    expect(path).not.toBeNull();expect(path.at(-1)).toEqual(target);
    expect(path.some(point => Math.abs(point.y) >= 2)).toBe(true);
    let previous = start;
    for (const point of path) {
      expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThanOrEqual(Math.SQRT2 + 1e-10);
      for (let part = 1; part <= 16; part++) {
        expect(wall(previous.x + (point.x - previous.x) * part / 16,
          previous.y + (point.y - previous.y) * part / 16)).toBe(true);
      }
      previous = point;
    }
  });

  it('does not cut diagonally between two blocked cardinal neighbours', () => {
    const canStand = (x, y) => !((x === 1 && y === 0) || (x === 0 && y === 1));
    expect(planTapPath(start, {x: 1, y: 1}, {canStand, step: 1, margin: 0})).toBeNull();
    const path = planTapPath(start, {x: 1, y: 1}, {canStand, step: 1, margin: 2});
    expect(path).not.toBeNull();expect(path[0]).not.toEqual({x: 1, y: 1});
    let previous = start;
    for (const point of path) {
      if (point.x !== previous.x && point.y !== previous.y) {
        expect(canStand(point.x, previous.y)).toBe(true);
        expect(canStand(previous.x, point.y)).toBe(true);
      }
      previous = point;
    }
  });

  it.each([null, {}, {x: NaN, y: 0}, {x: 0, y: Infinity}])('refuses invalid destination %s before collision work', destination => {
    const canStand = vi.fn(() => true);
    expect(planTapPath(start, destination, {canStand})).toBeNull();
    expect(canStand).not.toHaveBeenCalled();
  });

  it('refuses an invalid origin, missing collision predicate and blocked destination', () => {
    expect(planTapPath({x: Infinity, y: 0}, target, {canStand: () => true})).toBeNull();
    expect(planTapPath(start, target)).toBeNull();
    const canStand = vi.fn(() => false);
    expect(planTapPath(start, target, {canStand})).toBeNull();
    expect(canStand).toHaveBeenCalledOnce();
  });

  it('refuses a standable destination enclosed by blocked neighbours', () => {
    const enclosed = {x: 3, y: 0};
    const canStand = (x, y) => Math.max(Math.abs(x - enclosed.x), Math.abs(y)) > 1
      || (x === enclosed.x && y === enclosed.y);
    expect(planTapPath(start, enclosed, {canStand, step: 1, margin: 2, maxNodes: 100})).toBeNull();
  });

  it('keeps detours inside the requested margin and stops at the node budget', () => {
    expect(planTapPath(start, target, {canStand: wall, step: 1, margin: 0})).toBeNull();
    const canStand = vi.fn(() => true);
    expect(planTapPath(start, {x: 20, y: 0}, {canStand, step: 1, maxNodes: 1})).toBeNull();
    expect(canStand.mock.calls.length).toBeLessThanOrEqual(9);
  });

  it('refuses a destination beyond the local distance limit before searching', () => {
    const canStand = vi.fn(() => true);
    expect(planTapPath(start, {x: 64.1, y: 0}, {canStand})).toBeNull();
    expect(canStand).not.toHaveBeenCalled();
  });

  it('keeps a planned destination independent from later caller changes', () => {
    const origin = {...start}, destination = {...target};
    const path = planTapPath(origin, destination, {canStand: () => true});
    expect(origin).toEqual(start);expect(destination).toEqual(target);
    destination.x = 99;origin.x = -99;
    expect(path.at(-1)).toEqual(target);
  });
});

describe('tap walker', () => {
  it('advances through waypoints and stops on arrival', () => {
    const walker = createTapWalker();walker.follow([{x: 1, y: 0}, {x: 2, y: 0}]);
    expect(walker.direction(start, 1 / 60)).toEqual({x: 1, y: 0});
    expect(walker.direction({x: 1, y: 0}, 1 / 60)).toEqual({x: 1, y: 0});
    expect(walker.direction({x: 2, y: 0}, 1 / 60)).toEqual({x: 0, y: 0});
    expect(walker.active).toBe(false);expect(walker.target).toBeNull();
  });

  it('owns its route and returns an independent destination copy', () => {
    const path = [{x: 1, y: 0}, {x: 2, y: 0}], walker = createTapWalker();
    walker.follow(path);path[0].x = -10;path[1].x = -20;path.length = 0;
    const exposed = walker.target;exposed.x = 99;
    expect(walker.target).toEqual({x: 2, y: 0});
    expect(walker.direction(start, 1 / 60)).toEqual({x: 1, y: 0});
  });

  it('consumes a frozen caller route without mutating it', () => {
    const path = Object.freeze([Object.freeze({x: 1, y: 0})]), walker = createTapWalker();
    walker.follow(path);walker.direction({x: 1, y: 0}, 1 / 60);
    expect(path).toEqual([{x: 1, y: 0}]);expect(walker.active).toBe(false);
  });

  it('cancels a stalled route while capping a single stalled frame contribution', () => {
    const walker = createTapWalker({stallSeconds: .25});walker.follow([target]);
    walker.direction(start, .1);walker.direction(start, 5);
    expect(walker.active).toBe(true);
    walker.direction(start, .1);expect(walker.active).toBe(true);
    expect(walker.direction(start, .1)).toEqual({x: 0, y: 0});expect(walker.active).toBe(false);
  });

  it('resets the stall clock when the same position object makes progress', () => {
    const walker = createTapWalker({stallSeconds: .25}), position = {...start};walker.follow([target]);
    for (let frame = 0; frame < 10; frame++) {walker.direction(position, .1);position.x += .01;}
    expect(walker.active).toBe(true);
  });

  it('stops immediately when cancelled for manual controls', () => {
    const walker = createTapWalker();walker.follow([target]);walker.cancel();
    expect(walker.direction(start, .1)).toEqual({x: 0, y: 0});expect(walker.active).toBe(false);
    expect(walker.target).toBeNull();walker.follow([target]);expect(walker.active).toBe(true);
  });

  it.each([['inactive', start, .1, {active: false}], ['invalid position', {x: NaN, y: 0}, .1, {}],
    ['invalid duration', start, NaN, {}]])('cancels on %s input', (_label, position, delta, options) => {
    const walker = createTapWalker();walker.follow([target]);
    expect(walker.direction(position, delta, options)).toEqual({x: 0, y: 0});expect(walker.active).toBe(false);
  });
});
