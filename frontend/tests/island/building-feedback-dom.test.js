import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

it('plays one local Home building cue only for an exact accepted purchase and clears it with its scene', async () => {
  const result = await evaluate(async () => {
    const {Group} = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createIslandApi} = await window.g20Import('/src/island/api.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {projectGround} = await window.g20Import('/src/world/projection.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const fake = createFakeIslandTransport({version: 2});
    let release;
    const transport = {...fake, async post(path, body) {
      if (path === '/api/island/build' && body.spot === 'cannon_5') {
        return new Promise(resolve => { release = () => fake.post(path, body).then(resolve); });
      }
      if (path === '/api/island/build' && body.spot === 'cannon_4') {
        const answer = await fake.post(path, body);
        const row = answer.data.spots.find(item => item.id === body.spot);
        return {...answer, data: {...answer.data, spots: answer.data.spots.map(item =>
          item === row ? {...item, level: 2} : item)}};
      }
      return fake.post(path, body);
    }};
    let reduced = false;
    const island = createIsland({container: document.body, transport, on, emit, mode: 'fake', reducedMotion: () => reduced});
    fake.dev.setWaveBest(5);
    fake.dev.setCoins(0);
    await island.load();
    const cleanups = [], place = {group: new Group(), zones: [], colliders: [], update() {}};
    island.decorate(place, {}, cleanups);
    const dust = () => place.group.getObjectByName('island-building-feedback');
    const motes = () => place.group.getObjectByName('island-building-feedback-motes');
    const header = () => document.querySelector('.island-card-build[open] .kit-modal-header');
    const pulse = () => header()?.getAnimations().find(item => item.id === 'island-building-level-feedback');
    const step = dt => place.update(dt, {paused: false});
    const built = id => island.island.spots.find(spot => spot.id === id).built;

    await island.build('cannon_1', 'cannon');
    const refused = !dust() && !built('cannon_1') && island.island.coins === 0;
    fake.dev.setCoins(500);
    await island.load();
    fake.dev.failNext('timeout');
    await island.build('cannon_2', 'cannon');
    const ambiguous = !dust();
    await island.build('cannon_2', 'cannon');
    const reconciled = !dust() && built('cannon_2') && island.island.coins === 470;
    const other = createIslandApi({transport: fake});
    const remote = await other.build({spot: 'cannon_3', kind: 'cannon'});
    await island.load();
    const passive = remote.ok && !dust() && built('cannon_3');
    await island.build('cannon_4', 'cannon');
    const differentLevel = !dust();

    await island.build('cannon_1', 'cannon');
    const mesh = dust(), glints = motes(), anchor = island.anchor('cannon_1');
    const projected = projectGround(anchor.x, anchor.z);
    const anchored = mesh.visible && glints.visible && mesh.position.x === projected.x && mesh.position.y === projected.y;
    step(.8);
    const expired = !mesh.visible && !glints.visible;
    island.pick('cannon_1');
    reduced = true;
    await island.upgrade('cannon_1');
    const still = {duration: pulse()?.effect.getTiming().duration, glow: mesh.material.opacity, scale: mesh.scale.x};
    const balance = island.island.coins;
    step(.3);
    const staticCue = mesh.visible && !glints.visible && mesh.material.opacity === still.glow && mesh.scale.x === still.scale;
    const noNewReceipt = !header()?.querySelector('[role=status]');
    island.pick('cannon_2');
    const retargeted = !pulse();
    island.setBattle(true);
    const battle = !mesh.visible && !glints.visible;
    island.setBattle(false);

    const pending = island.build('cannon_5', 'cannon');
    island.visit('FR3ND');
    await island.load();
    await release();
    await pending;
    const stale = !mesh.visible && built('cannon_5') && island.visiting.code === 'FR3ND';
    await island.build('cannon_6', 'cannon');
    const visit = !mesh.visible && island.visiting.spots.find(row => row.id === 'cannon_6').built;
    let disposedGeometries = 0;
    for (const item of [mesh, glints]) item.geometry.addEventListener('dispose', () => disposedGeometries++);
    island.dispose(); cleanups.forEach(cleanup => cleanup());
    return {refused, ambiguous, reconciled, passive, differentLevel, anchored, expired, still, balance, staticCue,
      noNewReceipt, retargeted, battle, stale, visit, disposedGeometries, detached: !dust() && !motes()};
  });
  expect(result).toMatchObject({refused: true, ambiguous: true, reconciled: true, passive: true, differentLevel: true,
    anchored: true, expired: true, still: {duration: 520}, balance: 320, staticCue: true,
    noNewReceipt: true, retargeted: true, battle: true, stale: true, visit: true, disposedGeometries: 2, detached: true});
});
