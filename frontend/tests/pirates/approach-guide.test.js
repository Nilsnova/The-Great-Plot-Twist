import * as THREE from 'three';
import {expect, it} from 'vitest';
import {CONFIG} from '../../src/pirates/sim.js';
import {createBattleGuide, sampleBoarderApproaches} from '../../src/pirates/battle-guide.js';
import {sampleSeaApproaches} from '../../src/island/coverage-model.js';
import {LEGACY_DEPTH} from '../../src/world/projection.js';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

it('bounds per-lane samples and keeps one real heart and one unresolved stopping point', () => {
  const heart = {x: .125, z: .25};
  const east = {id: 'east', reachable: true, points: [{x: 80, z: .25}, heart]};
  const south = {id: 'south', reachable: true, points: [{x: .125, z: 80}, heart]};
  const west = {id: 'west', reachable: false, points: [{x: -80, z: 4}, {x: -20, z: 4}]};
  const matches = sampleBoarderApproaches([east, south, west], heart);
  expect(matches).toHaveLength(73);
  expect(matches.filter(point => point.x === heart.x && point.z === heart.z)).toEqual([{...heart, target: 'boarders'}]);
  expect(matches.filter(point => point.unresolved)).toEqual([{x: -20, z: 4, target: 'boarders', routeId: 'west', unresolved: true}]);
  expect(sampleBoarderApproaches([west], heart)).toHaveLength(24);
  expect(sampleBoarderApproaches([{id: 'stopped', reachable: false, points: [{x: 4, z: 3}]}], heart))
    .toEqual([{x: 4, z: 3, target: 'boarders', routeId: 'stopped', unresolved: true}]);
});

it('draws only conditional and uncovered sailing samples in one stable ground buffer', () => {
  const scene = new THREE.Scene(), guide = createBattleGuide({scene});
  const ground = guide.root.getObjectByName('battle-guide:ground');
  const positions = ground.geometry.getAttribute('iPos');
  const sea = sampleSeaApproaches(), first = sea[0], second = sea[1];
  const tower = (id, point, status) => ({id, ...point, status, range: 1, minRange: 0, targets: ['sailing-ships']});
  const coverage = {target: 'ships', towers: [tower('ready', first, 'ready'), tower('jammed', second, 'jammed')], complete: true, version: 1};
  const view = {mode: 'preview', managing: true, coverage, wave: 4};
  const marks = () => Array.from({length: ground.geometry.instanceCount}, (_, i) => ({x: positions.getX(i), z: -positions.getY(i) / LEGACY_DEPTH, shape: positions.getW(i)}));
  try {
    guide.update(view);
    expect(guide.stats()).toMatchObject({ground: sea.length - 1, air: 0, lanes: 0});
    expect(new Set(marks().map(point => point.shape))).toEqual(new Set([6, 7]));
    expect(marks().find(point => point.shape === 7)?.x).toBeCloseTo(second.x);
    expect(marks().some(point => Math.hypot(point.x - first.x, point.z - first.z) < .1)).toBe(false);
    const version = positions.version;
    for (let i = 0; i < 25; i++) guide.update({...view, coverage: {...coverage, towers: [...coverage.towers]}, dt: .016});
    expect(positions.version).toBe(version);
    guide.update({...view, coverage: {...coverage, towers: [], complete: false, version: 2}});
    expect(new Set(marks().map(point => point.shape))).toEqual(new Set([8]));
    expect(positions.version).toBe(version + 1);
    guide.update({...view, coverage: null});
    expect(guide.stats()).toMatchObject({ground: 0, air: 0, lanes: 0});
    guide.update({...view, mode: 'wave'});
    expect(guide.stats().air).toBeGreaterThan(0);
    expect(marks().some(point => point.shape >= 6)).toBe(false);
  } finally { guide.dispose(); }
});

it('keeps the actual boarder routes and the heart dead zone in coverage mode', () => {
  const scene = new THREE.Scene(), guide = createBattleGuide({scene}), heart = CONFIG.boarding.heart;
  const ground = guide.root.getObjectByName('battle-guide:ground');
  const positions = ground.geometry.getAttribute('iPos');
  const defenses = [
    {id: 'wall_1', kind: 'wall', level: 2, x: 16, z: 0},
    {id: 'mortar_1', kind: 'mortar', level: 1, x: heart.x, z: heart.z},
  ];
  const mortar = {...defenses[1], status: 'ready', range: 36, minRange: 5, targets: ['boarders']};
  const base = {mode: 'preview', defenses, wave: 12, heart};
  try {
    guide.update(base);
    const standard = guide.stats().routes;
    guide.update({...base, managing: true, coverage: {target: 'boarders', towers: [mortar], complete: true, version: 1}});
    expect(guide.stats()).toMatchObject({routes: standard, air: 0, lanes: 0});
    expect(ground.geometry.instanceCount).toBeGreaterThan(0);
    const heartMarks = Array.from({length: ground.geometry.instanceCount}, (_, i) => i)
      .filter(i => Math.hypot(positions.getX(i) - heart.x, positions.getY(i) + heart.z * LEGACY_DEPTH) < .001);
    expect(heartMarks).toHaveLength(1);
    expect(positions.getW(heartMarks[0])).toBe(6);
  } finally { guide.dispose(); }
});

it('renders a filled gap and two distinguishable hollow shapes in native WebGL', async () => {
  const pixels = await browser(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createBattleGuide} = await window.g20Import('/src/pirates/battle-guide.js');
    const {sampleSeaApproaches} = await window.g20Import('/src/island/coverage-model.js');
    const {projectGround} = await window.g20Import('/src/world/projection.js');
    const scene = new THREE.Scene(), guide = createBattleGuide({scene});
    const [a, b, c] = sampleSeaApproaches();
    const left = projectGround(c.x, c.z).x - 1.2, right = projectGround(a.x, a.z).x + 1.2;
    const camera = new THREE.OrthographicCamera(left, right, 1.4, -1.4, .1, 20); camera.position.z = 3;
    const renderer = new THREE.WebGLRenderer({preserveDrawingBuffer: true});
    renderer.setSize(320, 112);
    renderer.setClearColor(0x376557);
    const towers = [
      {id: 'conditional', x: b.x, z: b.z, range: 1, minRange: 0, status: 'jammed', targets: ['ships']},
      {id: 'uncertain', x: c.x, z: c.z, range: 1, minRange: 0, status: 'unknown', targets: ['ships']},
    ];
    const gl = renderer.getContext();
    const read = (point, dx = 0, dy = 0) => {
      const xy = projectGround(point.x, point.z), pixel = new Uint8Array(4);
      gl.readPixels(Math.floor((xy.x + dx - left) * 320 / (right - left)), Math.floor((xy.y + dy + 1.4) * 40),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    };
    try {
      guide.update({mode: 'preview', coverage: {target: 'ships', complete: true, version: 1, towers}});
      renderer.render(scene, camera);
      const offset = [.35, .26];
      return {base: read(a, 0, .8), gap: read(a), diamondCenter: read(b), squareCenter: read(c),
        diamondTip: read(b, .36), squareSide: read(c, .36), diamondCorner: read(b, ...offset), squareCorner: read(c, ...offset)};
    } finally { guide.dispose(); renderer.dispose(); }
  });
  expect(pixels.gap).not.toEqual(pixels.base);
  expect(pixels.diamondCenter).toEqual(pixels.base);
  expect(pixels.squareCenter).toEqual(pixels.base);
  expect(pixels.diamondTip).not.toEqual(pixels.base);
  expect(pixels.squareSide).not.toEqual(pixels.base);
  expect(pixels.diamondCorner).toEqual(pixels.base);
  expect(pixels.squareCorner).not.toEqual(pixels.base);
});
