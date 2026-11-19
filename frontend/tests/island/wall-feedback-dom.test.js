import {expect, it} from 'vitest';
import {Group} from 'three';
import {makeWallFeedback} from '../../src/island/wall-feedback.js';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

it('shows a confirmed wall upgrade inside its open details sheet and clears it for another wall', async () => {
  const result = await evaluate(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport({version: 2});
    transport.dev.setCoins(100); transport.dev.setWaveBest(15);
    const island = createIsland({container: document.body, transport, on, emit, mode: 'fake', reducedMotion: () => true});
    await island.load();
    const cleanups = [];
    island.decorate({group: new THREE.Group(), zones: [], colliders: [], update() {}}, {}, cleanups);
    await island.build('wall_1', 'wall');
    island.pick('wall_1');
    await island.upgrade('wall_1');
    const card = document.querySelector('.island-card-build[open]');
    const receipt = card.querySelector('.island-wall-purchase-receipt');
    const animation = card.querySelector('.kit-modal-header').getAnimations().find(item => item.id === 'island-wall-level-receipt');
    const pulse = {duration: animation.effect.getTiming().duration, role: receipt.getAttribute('role'),
      text: receipt.textContent, toast: island.ui.toastText};
    await island.load();
    const retained = receipt.isConnected && receipt.textContent === pulse.text;
    island.pick('wall_2');
    const cleared = !document.querySelector('.island-card-build[open] .island-wall-purchase-receipt')?.textContent;
    island.dispose(); cleanups.forEach(cleanup => cleanup());
    return {pulse, retained, cleared};
  });
  expect(result).toMatchObject({pulse: {duration: 520, role: 'status', text: 'Wall level 2 · 🪙 70'}, retained: true, cleared: true});
  expect(result.pulse.toast).not.toContain('Wall level 2');
});

it('shows anchored dust and rising glints for newly confirmed wall purchases and keeps reduced motion still', async () => {
  const result = await evaluate(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {projectGround} = await window.g20Import('/src/world/projection.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport({version: 2});
    transport.dev.setCoins(1000); transport.dev.setWaveBest(15);
    let reduced = false;
    const island = createIsland({container: document.body, transport, on, emit, mode: 'fake', reducedMotion: () => reduced});
    await island.load();
    const cleanups = [], place = {group: new THREE.Group(), zones: [], colliders: [], update() {}};
    island.decorate(place, {}, cleanups);
    const dust = () => place.group.getObjectByName('island-wall-feedback');
    const motes = () => place.group.getObjectByName('island-wall-feedback-motes');
    const step = (dt, paused = false) => place.update(dt, {paused});
    const pose = () => ({visible: dust().visible, alpha: dust().material.opacity, scale: dust().scale.x,
      glints: motes().visible, height: motes().geometry.getAttribute('position').getY(0),
      glintAlpha: motes().geometry.getAttribute('color').getW(0)});
    const idle = !dust() && !motes(), positions = JSON.stringify(place.zones), colliders = JSON.stringify(place.colliders);
    const start = island.island.coins;
    await island.build('wall_1', 'wall');
    const ground = dust(), sparks = motes(), active = pose(), foot = island.anchor('wall_1');
    const angle = projectGround(foot.x, foot.z), hits = [];
    ground.raycast(null, hits);
    sparks.raycast(null, hits);
    const anchorAndInteraction = ground.position.x === angle.x && ground.position.y === angle.y
      && sparks.position.equals(ground.position) && ground.renderOrder < sparks.renderOrder && hits.length === 0
      && JSON.stringify(place.zones) === positions && JSON.stringify(place.colliders) === colliders;
    step(.16);
    const moving = pose();
    step(2, true);
    const paused = pose();
    step(0);
    const resumed = pose();
    step(.6);
    const expired = !ground.visible && !sparks.visible;
    reduced = true;
    await island.upgrade('wall_1');
    const still = pose();
    step(.4);
    const stillLater = pose();
    step(.2);
    const stillExpired = !ground.visible && !sparks.visible, reused = dust() === ground && motes() === sparks;
    const after = island.island.spots.find(row => row.id === 'wall_1');
    const wallet = {spent: start - island.island.coins, level: after.level};
    await island.upgrade('wall_1');
    island.setBattle(true);
    const battleCleared = !ground.visible && !sparks.visible;
    island.setBattle(false);
    let geometryDisposals = 0, materialDisposals = 0;
    for (const mesh of [ground, sparks]) {
      mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
      mesh.material.addEventListener('dispose', () => materialDisposals++);
    }
    island.dispose(); cleanups.forEach(cleanup => cleanup());
    return {idle, active, moving, paused, resumed, expired, reused, still, stillLater, stillExpired, wallet, anchorAndInteraction,
      battleCleared, disposal: {geometryDisposals, materialDisposals, detached: !dust() && !motes()}};
  });
  expect(result).toMatchObject({idle: true, active: {visible: true, glints: true}, moving: {visible: true, glints: true},
    paused: {visible: false, glints: false}, expired: true, reused: true, still: {visible: true, glints: false},
    stillExpired: true, wallet: {spent: 30, level: 2}, anchorAndInteraction: true, battleCleared: true,
    disposal: {geometryDisposals: 2, materialDisposals: 2, detached: true}});
  expect(result.resumed).toEqual(result.moving);
  expect(result.moving.alpha).toBeLessThan(result.active.alpha);
  expect(result.moving.scale).toBeGreaterThan(result.active.scale);
  expect(result.moving.height).toBeGreaterThan(result.active.height);
  expect(result.moving.glintAlpha).toBeGreaterThan(0);
  expect(result.stillLater).toEqual(result.still);
});

it('provides a bounded light cue and clears it on pause and disposal', () => {
  const effect = makeWallFeedback(new Group());
  effect.show('wall_2', 2, {x: 3, z: 4}, false);
  expect(effect.light).toBe(1);
  effect.update(.16, false, false);
  const falling = effect.light;
  expect(falling).toBeGreaterThan(0);
  expect(falling).toBeLessThan(1);
  effect.update(1, true, false);
  expect(effect.light).toBe(0);
  effect.update(0, false, false);
  expect(effect.light).toBe(falling);
  effect.show('wall_2', 3, {x: 3, z: 4}, true);
  const still = effect.light;
  expect(still).toBeGreaterThan(0);
  expect(still).toBeLessThan(1);
  effect.update(.45, false, true);
  expect(effect.light).toBe(still);
  effect.dispose();
  expect(effect.light).toBe(0);
  expect(effect.current).toBeNull();
});

it('spreads from the foot while grit settles before the last brass glint', () => {
  const root = new Group(), effect = makeWallFeedback(root);
  effect.show('wall_2', 2, {x: 3, z: 4}, false);
  const dust = root.getObjectByName('island-wall-feedback');
  const motes = root.getObjectByName('island-wall-feedback-motes');
  const positions = motes.geometry.getAttribute('position');
  const alphas = motes.geometry.getAttribute('color');
  const stone = 5, brass = 15; // Particle centers, after the first instant glint.
  const startingHeight = positions.getY(stone);
  const startingWidth = dust.scale.x;
  const foot = dust.position.clone();

  effect.update(.16, false, false);
  expect(positions.getY(stone)).toBeGreaterThan(startingHeight);
  expect(alphas.getW(stone)).toBeGreaterThan(0);
  expect(dust.scale.x).toBeGreaterThan(startingWidth);
  expect(dust.position.equals(foot)).toBe(true);

  effect.update(.21, false, false);
  expect(positions.getY(stone)).toBeCloseTo(startingHeight);
  expect(alphas.getW(stone)).toBe(0);
  expect(alphas.getW(brass)).toBeGreaterThan(0);
  effect.dispose();
});

it('does not play for a refusal, reconciled receipt, passive snapshot, or answer for the previous island', async () => {
  const result = await evaluate(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createIslandApi} = await window.g20Import('/src/island/api.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const fake = createFakeIslandTransport({version: 2});
    let release;
    const transport = {...fake, post(path, body) {
      if (path === '/api/island/build' && body.spot === 'wall_5') {
        return new Promise(resolve => { release = () => fake.post(path, body).then(resolve); });
      }
      return fake.post(path, body);
    }};
    const island = createIsland({container: document.body, transport, on, emit, mode: 'fake'});
    fake.dev.setCoins(0);
    await island.load();
    const cleanups = [], place = {group: new THREE.Group(), zones: [], colliders: [], update() {}};
    island.decorate(place, {}, cleanups);
    const ring = () => place.group.getObjectByName('island-wall-feedback');
    await island.build('wall_1', 'wall');
    const refused = !ring() && !island.island.spots.find(row => row.id === 'wall_1').built;
    fake.dev.setCoins(100);
    await island.load();
    fake.dev.failNext('timeout');
    await island.build('wall_1', 'wall');
    const ambiguous = !ring();
    await island.build('wall_1', 'wall');
    const reconciled = !ring() && island.island.coins === 90 && island.island.spots.find(row => row.id === 'wall_1').built;
    const otherClient = createIslandApi({transport: fake});
    const build = await otherClient.build({spot: 'wall_2', kind: 'wall'});
    await island.load();
    const refreshed = build.ok && !ring() && island.island.spots.find(row => row.id === 'wall_2').built;
    const pending = island.build('wall_5', 'wall');
    island.visit('FR3ND');
    await island.load();
    await release(); await pending;
    const stale = !ring() && island.visiting.code === 'FR3ND' && island.island.spots.find(row => row.id === 'wall_5').built;
    await island.build('wall_3', 'wall');
    const visitor = ring()?.visible === true;
    await island.sailHome();
    const cleared = ring()?.visible === false;
    island.dispose(); cleanups.forEach(cleanup => cleanup());
    return {refused, ambiguous, reconciled, refreshed, stale, visitor, cleared};
  });
  expect(result).toEqual({refused: true, ambiguous: true, reconciled: true, refreshed: true, stale: true, visitor: true, cleared: true});
});
