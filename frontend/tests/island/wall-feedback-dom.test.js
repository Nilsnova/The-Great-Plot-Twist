import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

it('shows one grounded highlight for newly confirmed wall purchases and keeps reduced motion still', async () => {
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
    const mesh = () => place.group.getObjectByName('island-wall-feedback');
    const step = (dt, paused = false) => place.update(dt, {paused});
    const pose = () => ({visible: mesh().visible, alpha: mesh().material.opacity, scale: mesh().scale.x});
    const idle = !mesh(), positions = JSON.stringify(place.zones), colliders = JSON.stringify(place.colliders);
    const start = island.island.coins;
    await island.build('wall_1', 'wall');
    const ring = mesh(), active = pose(), foot = island.anchor('wall_1');
    const angle = projectGround(foot.x, foot.z), hits = [];
    ring.raycast(null, hits);
    const anchorAndInteraction = ring.position.x === angle.x && ring.position.y === angle.y && hits.length === 0
      && JSON.stringify(place.zones) === positions && JSON.stringify(place.colliders) === colliders;
    step(.16);
    const moving = pose();
    step(2, true);
    const paused = pose();
    step(0);
    const resumed = pose();
    step(.6);
    const expired = !ring.visible;
    reduced = true;
    await island.upgrade('wall_1');
    const still = pose();
    step(.4);
    const stillLater = pose();
    step(.2);
    const stillExpired = !ring.visible, reused = mesh() === ring;
    const after = island.island.spots.find(row => row.id === 'wall_1');
    const wallet = {spent: start - island.island.coins, level: after.level};
    await island.upgrade('wall_1');
    island.setBattle(true);
    const battleCleared = !ring.visible;
    island.setBattle(false);
    let geometryDisposals = 0, materialDisposals = 0;
    ring.geometry.addEventListener('dispose', () => geometryDisposals++);
    ring.material.addEventListener('dispose', () => materialDisposals++);
    island.dispose(); cleanups.forEach(cleanup => cleanup());
    return {idle, active, moving, paused, resumed, expired, reused, still, stillLater, stillExpired, wallet, anchorAndInteraction,
      battleCleared, disposal: {geometryDisposals, materialDisposals, detached: !mesh()}};
  });
  expect(result).toMatchObject({idle: true, active: {visible: true}, moving: {visible: true}, paused: {visible: false}, expired: true,
    reused: true, still: {visible: true}, stillExpired: true, wallet: {spent: 30, level: 2}, anchorAndInteraction: true, battleCleared: true,
    disposal: {geometryDisposals: 1, materialDisposals: 1, detached: true}});
  expect(result.resumed).toEqual(result.moving);
  expect(result.moving.alpha).toBeLessThan(result.active.alpha);
  expect(result.moving.scale).toBeGreaterThan(result.active.scale);
  expect(result.stillLater).toEqual(result.still);
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
