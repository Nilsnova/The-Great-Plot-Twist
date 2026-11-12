// A shot or a cutlass blow poses the captain's own body (owner, 12 Nov): your character and a teammate's
// presence figure switch to the pose in their own colour, then walk on; no second captain is drawn.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { POSES, POSE_IDS, createPoses, figurePoses, poseFrame, poseOf } from '../../src/pirates/poses.js';
import { matchFigures } from '../../src/pirates/figures.js';
import { createCharacter } from '../../src/player/character.js';
import { islandFrame } from '../../src/art/registry.js';
import { projectPoint } from '../../src/world/art.js';

const shot = (by, x = 0, toX = 8) => ({ type: 'captain_fired', t: 1, by, x, z: 0, toX, toZ: -2 });

describe('the pose of a shot or a blow', () => {
  it('has a musket and cutlass drawing in every lobby colour', () => {
    expect(POSE_IDS).toHaveLength(30);
    for (const id of POSE_IDS) expect(islandFrame(id), id).not.toBeNull();
  });
  it('fires (frame 2) for the flash time, aims (frame 1) until the pose ends, in the captain\'s colour', () => {
    expect(poseFrame({ kind: 'musket', age: 0 }, 2)).toBe('captain-3-musket-2');
    expect(poseFrame({ kind: 'musket', age: POSES.musket.fire + .01 }, 2)).toBe('captain-3-musket-1');
    expect(poseFrame({ kind: 'musket', age: POSES.musket.seconds }, 2)).toBeNull();
    expect(poseFrame({ kind: 'cutlass', age: .1 }, 9)).toBe('captain-10-cutlass');
    expect(poseFrame({ kind: 'cutlass', age: .1 }, null)).toBe('captain-1-cutlass');
    expect(poseFrame(null, 0)).toBeNull();
  });
  it('faces the shot, and only shots and blows pose', () => {
    expect(poseOf(shot('me', 0, 8))).toEqual({ kind: 'musket', flip: false });
    expect(poseOf(shot('me', 0, -8))).toEqual({ kind: 'musket', flip: true });
    expect(poseOf({ type: 'captain_struck', by: 'me', x: 2, z: 0, toX: 1, toZ: 0 })).toEqual({ kind: 'cutlass', flip: true });
    expect(poseOf({ type: 'cannon_fired', x: 0, toX: 1 })).toBeNull();
    expect(poseOf({ type: 'captain_fired', x: 0, toX: 1 })).toBeNull(); // no shooter
  });
  it('keeps one pose per captain while it lasts', () => {
    let clock = 10;
    const poses = createPoses({ now: () => clock });
    poses.note([shot('me'), { type: 'ship_sunk' }]);
    expect(poses.get('me')).toEqual({ kind: 'musket', flip: false, age: 0 });
    clock += .3; expect(poses.get('me').age).toBeCloseTo(.3);
    clock += .3; expect(poses.get('me')).toBeNull();
    poses.note([shot('ben')]); poses.clear(); expect(poses.get('ben')).toBeNull();
  });
});

describe("a teammate's shot poses their presence figure", () => {
  it('maps the shooter to the figure in their lobby colour within reach, and never poses a body without one', () => {
    let clock = 0;
    const poses = createPoses({ now: () => clock });
    poses.note([shot('sim-ben', 4, -4), shot('sim-ada', 0, 8), shot('sim-far', 0, 8), shot('me', 0, 8)]);
    const party = [
      { id: 'me', present: true, colour: 0, x: 0, z: 0 },
      { id: 'sim-ben', present: true, colour: 3, x: 4, z: 0 },
      { id: 'sim-ada', present: true, colour: 5, x: -6, z: 2 },
      { id: 'sim-far', present: true, colour: 7, x: 20, z: 0 },
    ];
    const figures = [
      { id: 'peer-ben', x: 5, z: 1, colour: 3 },
      { id: 'peer-ada', x: -5, z: 2, colour: 5 },
      { id: 'peer-other', x: 4, z: 0, colour: 1 }, // right where Ben is, but another colour
      { id: 'peer-far', x: 0, z: 0, colour: 7 },   // Far's colour, but 20 units from Far
    ];
    const matches = matchFigures({ party, figures, mine: 'me' });
    const posed = figurePoses(poses, matches);
    expect([...posed.keys()].sort()).toEqual(['peer-ada', 'peer-ben']);
    expect(posed.get('peer-ben')).toMatchObject({ kind: 'musket', flip: true });
    expect(posed.get('peer-ada')).toMatchObject({ kind: 'musket', flip: false });
    // Your own captain has no figure; Far has none in reach: neither gets a body here.
    expect(posed.has('peer-far')).toBe(false); expect(posed.has('peer-other')).toBe(false);
    clock = 1; expect(figurePoses(poses, matches).size).toBe(0);
  });
});

describe('your own character fires', () => {
  const art = () => Object.fromEntries(['explorer', 'explorer-side', 'explorer-back', 'captain-3', 'captain-3-side', 'captain-3-back', ...POSE_IDS]
    .map(id => [id, new THREE.MeshBasicMaterial({ name: id })]));
  it('switches to the musket frame in your colour, facing the shot, then back to walking', () => {
    const materials = art(), scene = new THREE.Scene(), character = createCharacter(materials);
    scene.add(character.sprite); character.setColour(2); character.setScale(1.4);
    character.group.position.set(3, 0, 4); character.face(1, 0); character.animate(.016, 0);
    expect(character.poseMesh).toBeNull(); expect(character.sprite.visible).toBe(true);
    character.pose({ kind: 'musket', flip: true, age: .05 }); character.animate(.016, 0);
    const pose = character.poseMesh;
    expect(pose.visible).toBe(true); expect(character.sprite.visible).toBe(false);
    expect(pose.material).toBe(materials['captain-3-musket-2']); expect(pose.parent).toBe(scene);
    expect(pose.scale.x).toBeCloseTo(-1.4); expect(pose.scale.y).toBeCloseTo(1.4);
    const at = projectPoint(3, 4); expect(pose.position.x).toBeCloseTo(at.x); expect(pose.position.y).toBeCloseTo(at.y);
    character.pose({ kind: 'musket', flip: true, age: .4 }); character.animate(.016, 0);
    expect(pose.material).toBe(materials['captain-3-musket-1']);
    // The pose follows you while you walk on.
    character.group.position.set(5, 0, 4); character.animate(.016, 0);
    expect(pose.position.x).toBeCloseTo(projectPoint(5, 4).x);
    // Over: the walking body again, and no second captain anywhere.
    character.pose(null); character.animate(.016, 0);
    expect(pose.visible).toBe(false); expect(character.sprite.visible).toBe(true);
    expect(scene.children.filter(item => item.visible && item.isMesh)).toHaveLength(1);
    character.pose({ kind: 'cutlass', flip: false, age: .1 }); character.animate(.016, 0);
    expect(pose.material).toBe(materials['captain-3-cutlass']); expect(pose.scale.x).toBeCloseTo(1.4);
    character.pose({ kind: 'cutlass', flip: false, age: 1 }); character.animate(.016, 0); // expired
    expect(pose.visible).toBe(false); expect(character.sprite.visible).toBe(true);
  });
});
