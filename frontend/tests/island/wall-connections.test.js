import {describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {makeWallConnections, wallTopology} from '../../src/island/wall-connections.js';

const wall = (id, x, z, level = 1) => ({id, x, z, level, kind: 'wall', built: true});
const pairs = spots => wallTopology(spots).links.map(link => [link.a, link.b]);

describe('full-side wall connections', () => {
  it('joins a line and a corner without depending on array order or changing positions', () => {
    const spots = [wall('a', 0, 0), wall('b', 2, 0), wall('c', 2, 2)];
    const before = structuredClone(spots);
    expect(pairs(spots)).toEqual([['a', 'b'], ['b', 'c']]);
    expect(pairs([...spots].reverse())).toEqual(pairs(spots));
    expect(spots).toEqual(before);
  });
  it('forms a T from three real contacts and keeps the surrounding gaps open', () => {
    const spots = [wall('centre', 0, 0), wall('east', 2, 0), wall('west', -2, 0), wall('north', 0, -2)];
    expect(pairs(spots)).toEqual([['centre', 'east'], ['centre', 'north'], ['centre', 'west']]);
  });
  it.each([[2.5, 0, 'gap'], [2, .5, 'partial side'], [2, 2, 'diagonal point'], [1.5, 0, 'overlap']])(
    'does not turn a %s,%s %s into a full connection', (x, z) => {
      expect(pairs([wall('a', 0, 0), wall('b', x, z)])).toEqual([]);
    });
  it('does not bridge an unbuilt, explicitly broken, invalid or non-wall neighbour', () => {
    const base = wall('a', 0, 0);
    for (const bad of [{built: false}, {hp: 0}, {health: 0}, {broken: true}, {x: NaN}, {kind: 'cannon'}]) {
      expect(pairs([base, {...wall('b', 2, 0), ...bad}])).toEqual([]);
    }
  });
  it('uses the lower level for the shared span while leaving both original levels intact', () => {
    const spots = [wall('a', 0, 0, 5), wall('b', 2, 0, 2)];
    expect(wallTopology(spots).links[0].level).toBe(2);
    expect(spots.map(item => item.level)).toEqual([5, 2]);
  });
});

describe('join drawing lifetime', () => {
  it('reuses unchanged geometry and clears old spans when a move opens a gap', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root);
    const spots = [wall('a', 0, 0), wall('b', 2, 0)];
    drawing.show(spots);
    const group = root.getObjectByName('island-wall-connections'), mesh = group.children[0];
    // Join spans must share the transparent painter-order queue with the island ground and sprites.
    expect(mesh.material.transparent).toBe(true);
    const disposed = vi.spyOn(mesh.geometry, 'dispose');
    drawing.show([...spots].reverse());
    expect(group.children[0]).toBe(mesh);
    drawing.show([spots[0], {...spots[1], x: 2.5}]);
    expect(group.children).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
    expect(drawing.links).toEqual([]);
    drawing.dispose();
  });
  it('removes every span for a battle handoff and disposes owned resources only once', () => {
    const root = new THREE.Group(), drawing = makeWallConnections(root);
    drawing.show([wall('a', 0, 0), wall('b', 0, 2, 4)]);
    const group = root.children[0], material = group.children[0].material;
    const disposed = vi.spyOn(material, 'dispose');
    drawing.show([]);
    expect(group.children).toHaveLength(0);
    drawing.dispose(); drawing.dispose();
    expect(root.children).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
  });
});
