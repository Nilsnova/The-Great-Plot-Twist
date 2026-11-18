import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {projectGround, projectLegacyGround, unprojectGround, groundProjectionGlsl} from '../../src/world/projection.js';
import {createCombatProjection} from '../../src/pirates/index.js';
import {shipAt, boarderAt, nearestShip, tapInput} from '../../src/pirates/interact.js';
import {poseOf} from '../../src/pirates/poses.js';
import {createWaveRenderer, packAtlas} from '../../src/pirates/render.js';
import {createBattleGuide} from '../../src/pirates/battle-guide.js';
import {WALL_LANE_ROWS} from '../../src/island/wall-lanes.js';

const empty = () => ({ships: [], boarders: [], walls: [], towers: [], fog: 0, sight: 28});
const position = (mesh, i = 0) => [...mesh.geometry.getAttribute('iPos').array.slice(i * 4, i * 4 + 2)];
const closePoint = (actual, expected) => {expect(actual[0]).toBeCloseTo(expected.x); expect(actual[1]).toBeCloseTo(expected.y);};

describe('shared combat ground projection', () => {
  it('roundtrips logical pointer positions with camera pan/zoom, canvas offsets and upright lifts', () => {
    const camera = new THREE.OrthographicCamera(-40, 40, 25, -25, .1, 100);
    camera.position.set(4, -3, 10); camera.zoom = 1.7; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const canvas = {getBoundingClientRect: () => ({left: 30, top: 40, width: 1000, height: 625})};
    const container = {getBoundingClientRect: () => ({left: 10, top: 12})};
    const view = createCombatProjection({camera, canvas, container});
    for (const [x, z] of [[0, 0], [-12, 9], [17, -11]]) {
      const screen = view.project(x, z), logical = view.unproject(screen.x + 10, screen.y + 12);
      expect(logical.x).toBeCloseTo(x); expect(logical.z).toBeCloseTo(z);
      const head = view.project(x, z, .9), picked = view.unproject(head.x + 10, head.y + 12), at = projectGround(x, z);
      expect(picked.x).toBeCloseTo(unprojectGround(at.x, at.y + .9).x);
      expect(head.x).toBeCloseTo(screen.x); // a vertical sprite lift must not inherit ground shear
      expect(screen.y - head.y).toBeCloseTo(.9 * camera.zoom * 625 / 50);
    }
  });

  it('hits displayed hull/body centers and preserves logical cannon sight and input payloads', () => {
    const ship = {id: 's', kind: 'brig', x: 10, z: 8}, boarder = {id: 'b', x: -5, z: 6};
    const state = {ships: [ship], boarders: [boarder], sight: 2}, frozen = JSON.stringify(state);
    for (const [entity, lift, pick] of [[ship, 2.2, shipAt], [boarder, .9, boarderAt]]) {
      const at = projectGround(entity.x, entity.z), center = unprojectGround(at.x, at.y + lift);
      expect(pick(center, state)).toBe(entity);
      expect(pick(unprojectGround(at.x + 5, at.y + lift), state)).toBeNull();
    }
    const cannon = {x: 9, z: 8};
    expect(nearestShip(cannon, state)).toBe(ship);
    expect(tapInput({kind: 'fire', cannonId: 'c', ...cannon}, ship, state)).toEqual({type: 'fire', cannonId: 'c', targetId: 's'});
    expect(tapInput({kind: 'fire', cannonId: 'c', x: 0, z: 8}, ship, state)).toBeNull();
    expect(JSON.stringify(state)).toBe(frozen);
  });

  it('mirrors and aims correctly when ground shear reverses a small positive logical x direction', () => {
    const event = {type: 'captain_fired', by: 'me', x: 3, z: 4, toX: 3.1, toZ: 2};
    const pose = poseOf(event), from = projectGround(event.x, event.z), to = projectGround(event.toX, event.toZ);
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    expect(pose.flip).toBe(true);
    expect(-Math.cos(pose.angle)).toBeCloseTo(dx / length);
    expect(Math.sin(pose.angle)).toBeCloseTo(-dy / length);
    expect(poseOf({...event, type: 'captain_struck'})).toEqual({kind: 'cutlass', flip: true});
  });

  it('projects actual combat instance feet, projectile samples and beam endpoints without stretching sprites or mutating events', () => {
    const pack = packAtlas(), scene = new THREE.Scene(), defenses = [{id: 'c', kind: 'cannon', x: 4, z: 7}];
    const beamFrom = {x: -8, y: 6};
    const renderer = createWaveRenderer({scene, defenses, atlas: {texture: new THREE.Texture(), ...pack}, beamFrom, fx: () => null});
    const state = {...empty(), lampsLit: true, ships: [{id: 's', kind: 'flagship', x: 9, z: -5, hp: 100, maxHp: 100}]};
    const event = {type: 'cannon_fired', cannonId: 'c', x: 4, z: 7, toX: 9, toZ: -5, t: 0, impactAt: 1, hit: true};
    const before = JSON.stringify({event, state, defenses});
    renderer.events([event]); renderer.update({state, simTime: .5, dt: .1});
    const mesh = name => renderer.root.children.find(child => child.name === `pirates:${name}`);
    closePoint(position(mesh('far-sea')), projectGround(9, -5));
    closePoint(position(mesh('defense:c')), projectGround(4, 7));
    const size = mesh('defense:c').geometry.getAttribute('iSize').array;
    expect(size[0]).toBeCloseTo(pack.rects['island-cannon'].w / 16);
    expect(size[1]).toBeCloseTo(pack.rects['island-cannon'].h / 16);
    const air = mesh('air'), pos = air.geometry.getAttribute('iPos').array, count = air.geometry.instanceCount;
    const mid = projectGround(6.5, 1), distance = Math.hypot(5, -12), lift = 1.2 + distance * .07;
    const uv = air.geometry.getAttribute('iUv').array, ball = pack.rects['pirate-cannonball'];
    const ballIndex = Array.from({length: count}, (_, i) => i).find(i => Math.abs(Math.min(uv[i * 4], uv[i * 4 + 2]) - (ball.x + .01) / pack.width) < 1e-6);
    closePoint(position(air, ballIndex), {x: mid.x, y: mid.y + lift});
    closePoint(position(air, count - 1), beamFrom); // beam origin is already displayed
    const lengths = air.geometry.getAttribute('iSize').array, to = projectGround(9, -5);
    expect(lengths[(count - 1) * 4 + 1]).toBeCloseTo(Math.hypot(to.x - beamFrom.x, to.y + 3 - beamFrom.y));
    expect(mesh('fog').material.fragmentShader).toContain(groundProjectionGlsl);
    expect(pos[(count - 1) * 4 + 2]).toBeCloseTo(Math.atan2(to.y + 3 - beamFrom.y, to.x - beamFrom.x) - Math.PI / 2);
    expect(JSON.stringify({event, state, defenses})).toBe(before);
    const boarder = {id: 'b', x: 2, z: 4, hp: 10, maxHp: 10, state: 'walking', facing: 1};
    renderer.update({state: {...empty(), boarders: [boarder]}});
    const moved = {...empty(), boarders: [{...boarder, x: 2.1, z: 2}]};
    const band = () => renderer.root.children.find(child => child.name.startsWith('pirates:boarders:') && child.geometry.instanceCount);
    renderer.update({state: moved});
    closePoint(position(band()), projectGround(2, 4)); // Main's smoother starts at the previous drawn foot.
    renderer.update({state: moved, dt: .03});
    closePoint(position(band()), projectGround(2.05, 3));
    renderer.update({state: moved, dt: .03});
    closePoint(position(band()), projectGround(2.1, 2));
    const facingUv = band().geometry.getAttribute('iUv').array;
    expect(facingUv[0]).toBeGreaterThan(facingUv[2]); // displayed movement is left despite logical +x
    renderer.dispose();
  });

  it('projects smoothed ship feet and facing without mutating simulation coordinates, and prunes old wave positions', () => {
    const pack = packAtlas(), scene = new THREE.Scene();
    const renderer = createWaveRenderer({scene, atlas: {texture: new THREE.Texture(), ...pack}, reducedMotion: () => true, fx: () => null});
    const ship = Object.freeze({id: 'smooth-ship', kind: 'sloop', x: 0, z: 7, hp: 100, maxHp: 100, state: 'anchored'});
    const first = {...empty(), ships: [ship]}, next = {...empty(), ships: [Object.freeze({...ship, x: .5, z: 8})]};
    const original = JSON.stringify({first, next});
    const sea = renderer.root.children.find(child => child.name === 'pirates:near-sea');
    renderer.update({state: first, dt: .1});
    closePoint(position(sea), projectGround(0, 7));
    // The logical x is zero, but shear puts the hull right of center. Metadata needs z to face left.
    const facing = sea.geometry.getAttribute('iUv').array;
    expect(facing[0]).toBeGreaterThan(facing[2]);
    renderer.update({state: next});
    closePoint(position(sea), projectGround(0, 7));
    renderer.update({state: next, dt: .03});
    closePoint(position(sea), projectGround(.25, 7.5));
    renderer.update({state: next, dt: .03});
    closePoint(position(sea), projectGround(.5, 8));
    expect(JSON.stringify({first, next})).toBe(original);
    renderer.update({state: empty()});
    expect(sea.geometry.instanceCount).toBe(0);
    renderer.update({state: {...empty(), ships: [{...ship, x: -1, z: 6}]}});
    closePoint(position(sea), projectGround(-1, 6)); // Reused IDs must not glide from a previous lifetime.
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('transforms guide ground centers AND local lane corners while keeping air badges upright', () => {
    const scene = new THREE.Scene(), guide = createBattleGuide({scene, reducedMotion: () => true, sparse: () => false});
    const heart = {x: 2, z: 3}; guide.update({mode: 'preview', defenses: [], heart, wave: 1});
    const root = scene.getObjectByName('battle-guide'), ground = root.getObjectByName('battle-guide:ground'), air = root.getObjectByName('battle-guide:air');
    expect(ground.material.uniforms.uGround.value).toBe(true); expect(air.material.uniforms.uGround.value).toBe(false);
    expect(ground.material.uniforms.uIcons.value).toBe(air.material.uniforms.uIcons.value);
    expect(ground.material.vertexShader).toContain('if(uGround)at=projectGround');
    const [z, x0, x1] = WALL_LANE_ROWS[0], p = position(ground), size = ground.geometry.getAttribute('iSize').array;
    const corners = [[-.5, -.5], [.5, -.5], [.5, .5]].map(([u, v]) => projectLegacyGround(p[0] + u * size[0], p[1] + v * size[1]));
    closePoint([corners[0].x, corners[0].y], projectGround(x0 - .25, z + .25));
    closePoint([corners[2].x, corners[2].y], projectGround(x1 + .25, z - .25));
    expect((corners[1].x - corners[0].x) * (corners[2].y - corners[0].y) - (corners[1].y - corners[0].y) * (corners[2].x - corners[0].x)).toBeGreaterThan(0);
    const at = projectGround(heart.x, heart.z), last = air.geometry.instanceCount - 1;
    closePoint(position(air, last), {x: at.x, y: at.y + 2.4});
    expect([...air.geometry.getAttribute('iSize').array.slice(last * 2, last * 2 + 2)]).toEqual([2, 2]);
    guide.dispose();
  });
});
