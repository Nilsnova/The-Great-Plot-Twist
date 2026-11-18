// A real bell starts the fake server's frozen local demo. Only the browser clock is accelerated.
import assert from 'node:assert/strict';
import {capture, groundPoint, village} from './perimeter-game-ui.mjs';
export async function capturePerimeterWave(page, out, width, height, {wallCount = 102} = {}) {
  assert.ok(Number.isInteger(wallCount) && wallCount > 0 && wallCount <= 128, 'declared paid wall fixture is bounded');
  await village(page).getByRole('button', {name: 'Exit village mode', exact: true}).click();
  await page.waitForFunction(() => !window.__island.island.managing && window.__island.camera.zoom > .98);
  const before = await page.evaluate(() => ({captain: window.__island.player.position.toArray(), zoom: window.__island.camera.zoom}));
  // The declared initial fixture captain stands beside the bell; its ordinary reach rule still applies.
  const point = await groundPoint(page, [8.5, 12]); await page.mouse.click(point.x, point.y);
  const bell = page.locator('.island-card-bell[open]'); await bell.waitFor();
  await bell.getByRole('button', {name: 'Ring the bell', exact: true}).click();
  await page.waitForFunction(() => window.__island.waves.island?.wave?.renderer && !window.__island.island.managing);
  const initial = await inspect(page);
  assert.ok(initial.perimeterDemo, 'normal bell must forward the accepted frozen perimeter demo to the actual controller');
  assert.equal(initial.perimeterDemo.version, 1);
  assert.equal(initial.perimeterDemo.pathing, true); assert.equal(initial.perimeterDemo.perimeterWalls, true);
  assert.equal(initial.perimeterDemo.defenses.filter(w => w.kind === 'wall').length, wallCount);
  assert.equal(initial.recoveryVersion, 0, 'explicit legacy local demo, never production recovery proof');
  assert.equal(initial.actualLinks.length, initial.expectedLinks.length); assert.deepEqual(initial.actualLinks.sort(), initial.expectedLinks.sort());
  const start = await capture(page, out, `wave-standing-${width}x${height}.png`);
  let breached = null, firing = null;
  for (let seconds = 0; seconds < 240; seconds++) {
    await page.clock.fastForward(1000);
    const state = await inspect(page);
    if(!firing&&state.renderStats.balls+state.renderStats.shells+state.renderStats.tracers>0)firing={state,capture:await capture(page,out,`wave-projectiles-${width}x${height}.png`)};
    if (state.broken.length) { breached = {...state, acceleratedSeconds: seconds + 1}; break; }
    if (state.done) break;
  }
  assert.ok(breached, 'actual controller simulation breaches a paid perimeter wall');
  assert.deepEqual(breached.actualLinks.sort(), breached.expectedLinks.sort(), 'live accepted HP opens exactly the broken joins');
  assert.ok(breached.actualLinks.length < initial.actualLinks.length); assert.equal(breached.worldLinks, 0, 'no duplicate between-wave joins in combat');
  const breach = await capture(page, out, `wave-breach-${width}x${height}.png`);
  return {scope: 'normal bell/card; fake server frozen local-demo source; actual controller, simulation and renderer; browser clock accelerated',
    explorationRestoredBeforeBell: before, initial, start, firing, breached, breach};
}
async function inspect(page) {
  return page.evaluate(async () => {
    const g = window.__island, w = g.waves.island.wave, {wallTopology} = await import('/src/island/wall-connections.js');
    const hp = new Map(w.state.walls.map(wall => [wall.id, wall.hp]));
    const standing = w.defenses.filter(p => p.kind === 'wall' && hp.get(p.id) > 0).map(p => ({...p, built: true}));
    const layer = w.renderer.root.getObjectByName('pirates:wall-connections')?.getObjectByName('island-wall-connections');
    const atlasSources=new Map();w.renderer.root.traverse(mesh=>{const texture=mesh.material?.uniforms?.uMap?.value??mesh.material?.map;for(const row of Array.isArray(texture?.userData.villageArt)?texture.userData.villageArt:[])if(row.source==='png')atlasSources.set(row.id,row);});
    return {waveId: w.info.waveId, wave: w.info.wave, seed: w.info.seed, startsAtMs: w.info.startsAtMs,renderStats:w.renderer.stats(),atlasSources:[...atlasSources.values()],
      recoveryVersion: w.info.recoveryVersion, perimeterDemo: w.info.perimeterDemo, ticks: w.ticks, done: w.done,
      broken: w.state.walls.filter(p => p.hp === 0).map(p => p.id),
      actualLinks: layer?.wallLinks ? layer.wallLinks.map(l => `wall-join:${l.a}:${l.b}`) : layer?.children.map(mesh => mesh.name) ?? [],
      wallDrawMeshes: layer?.children.length ?? 0, expectedLinks: wallTopology(standing).links.map(l => `wall-join:${l.a}:${l.b}`),
      worldLinks: g.world.current.group.getObjectByName('island-wall-connections')?.wallLinks?.length ?? g.world.current.group.getObjectByName('island-wall-connections')?.children.length ?? 0};
  });
}
