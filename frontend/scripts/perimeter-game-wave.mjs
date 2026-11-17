// A real bell starts the fake server's frozen local demo. Only the browser clock is accelerated.
import assert from 'node:assert/strict';
import {capture, groundPoint, village} from './perimeter-game-ui.mjs';
export async function capturePerimeterWave(page, out, width, height) {
  await village(page).getByRole('button', {name: 'Exit village mode', exact: true}).click();
  await page.waitForFunction(() => !window.__island.island.managing && window.__island.camera.zoom > .98);
  const before = await page.evaluate(() => ({captain: window.__island.player.position.toArray(), zoom: window.__island.camera.zoom}));
  // Bring the ordinary bell into the working overview, then select its actual sprite and real card.
  await page.keyboard.press('Escape'); await page.getByRole('button', {name: 'Manage village', exact: true}).click();
  await page.waitForTimeout(1300);
  const point = await groundPoint(page, [8.5, 12], 1); await page.mouse.click(point.x, point.y);
  const bell = page.locator('.island-card-bell[open]'); await bell.waitFor();
  await bell.getByRole('button', {name: 'Ring the bell', exact: true}).click();
  await page.waitForFunction(() => window.__island.waves.wave?.renderer && !window.__island.island.managing);
  const initial = await inspect(page); assert.equal(initial.perimeterDemo.version, 1);
  assert.equal(initial.perimeterDemo.pathing, true); assert.equal(initial.perimeterDemo.perimeterWalls, true);
  assert.equal(initial.perimeterDemo.defenses.filter(w => w.kind === 'wall').length, 102);
  assert.equal(initial.recoveryVersion, 0, 'explicit legacy local demo, never production recovery proof');
  assert.equal(initial.actualLinks.length, initial.expectedLinks.length); assert.deepEqual(initial.actualLinks.sort(), initial.expectedLinks.sort());
  const start = await capture(page, out, `wave-standing-${width}x${height}.png`);
  let breached = null;
  for (let seconds = 0; seconds < 240; seconds++) {
    await page.clock.fastForward(1000);
    const state = await inspect(page);
    if (state.broken.length) { breached = {...state, acceleratedSeconds: seconds + 1}; break; }
    if (state.done) break;
  }
  assert.ok(breached, 'actual controller simulation breaches a paid perimeter wall');
  assert.deepEqual(breached.actualLinks.sort(), breached.expectedLinks.sort(), 'live accepted HP opens exactly the broken joins');
  assert.ok(breached.actualLinks.length < initial.actualLinks.length); assert.equal(breached.worldLinks, 0, 'no duplicate between-wave joins in combat');
  const breach = await capture(page, out, `wave-breach-${width}x${height}.png`);
  return {scope: 'normal bell/card; fake server frozen local-demo source; actual controller, simulation and renderer; browser clock accelerated',
    explorationRestoredBeforeBell: before, initial, start, breached, breach};
}
async function inspect(page) {
  return page.evaluate(async () => {
    const g = window.__island, w = g.waves.wave, {wallTopology} = await import('/src/island/wall-connections.js');
    const hp = new Map(w.state.walls.map(wall => [wall.id, wall.hp]));
    const standing = w.defenses.filter(p => p.kind === 'wall' && hp.get(p.id) > 0).map(p => ({...p, built: true}));
    const layer = w.renderer.root.getObjectByName('pirates:wall-connections')?.getObjectByName('island-wall-connections');
    return {waveId: w.info.waveId, wave: w.info.wave, seed: w.info.seed, startsAt: w.info.startsAt,
      recoveryVersion: w.info.recoveryVersion, perimeterDemo: w.info.perimeterDemo, ticks: w.ticks, done: w.done,
      broken: w.state.walls.filter(p => p.hp === 0).map(p => p.id),
      actualLinks: layer?.children.map(mesh => mesh.name) ?? [], expectedLinks: wallTopology(standing).links.map(l => `wall-join:${l.a}:${l.b}`),
      worldLinks: g.world.current.group.getObjectByName('island-wall-connections')?.children.length ?? 0};
  });
}
