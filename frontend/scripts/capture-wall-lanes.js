// Captures D056 (every wall stands on a pirate path) with the fake server (?islands=fake): build mode between waves
// (the battle guide's routes over the faint wall lanes), Move mode for a wall on a lane (green, the lanes glowing) and
// off every path (red, "Walls go on a pirate path."), and a wave with boarders hacking the walls, at 1280x720 and
// 390x844. It also checks that the walls of the default layout stand on lanes and that boarders hack them.
//   node scripts/capture-wall-lanes.js [output folder]     (default captures/wall-lanes)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/wall-lanes';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const wait = ms => page.waitForTimeout(ms);
const shot = async name => { await settle(page); await page.screenshot({path: join(out, `${name}.png`)}); console.log(join(out, `${name}.png`)); };
const island = (fn, arg) => page.evaluate(([source, value]) => (0, eval)(source)(window.__island.island, value), [String(fn), arg]);
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace('home_islet', g.player.position); }, [x, z]);
const waveOf = () => page.evaluate(() => { const w = window.__island.waves?.island.wave;
  return w ? {done: w.done, phase: w.state.phase, time: w.state.time, ashore: w.state.boarders?.length ?? 0, hacking: (w.state.boarders ?? []).filter(item => item.state === 'hacking').length} : null; });
async function until(test, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const state = await waveOf(); if (test(state)) return state; await wait(200); }
  return null;
}
const VIEWPORTS = [[1280, 720], [390, 844]];

try {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Nils`);
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
  await page.reload();
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 60000, polling: 100});
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await wait(400);
      await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    } else if (await page.locator('.island-card-lobby[open]').count()) await page.keyboard.press('Escape');
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 5000}).catch(() => {});
    else break;
    await wait(300);
  }
  await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island && !document.querySelector('dialog[open]'), null, {timeout: 60000});
  await page.evaluate(() => { window.__island.settings.hour = 11; window.__island.settings.fastTime = false; });
  await island(async i => { i.dev.setCoins(4000); i.dev.setWaveBest(6); i.dev.setCaptain(3); await i.load(); });
  const walls = ['wall_1', 'wall_6', 'wall_3', 'wall_2', 'wall_4', 'wall_5', 'wall_7', 'wall_12', 'wall_8', 'wall_9', 'wall_10', 'wall_11'];
  await island(async (i, ids) => { for (const spot of [...ids, 'cannon_1', 'cannon_3']) await i.build(spot); await i.load(); }, walls);
  await stand(0, 6);
  await wait(1200);

  // Build mode: the routes over the faint wall lanes.
  for (const [width, height] of VIEWPORTS) { await page.setViewportSize({width, height}); await wait(500); await shot(`build-${width}x${height}`); }
  await page.setViewportSize({width: 1280, height: 720});

  // Move mode for a wall: on a lane (green, lanes glowing), then off every path (red, the short reason).
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({width, height});
    await stand(-11, 1);
    await island(i => i.moveMode.start('wall_10'));
    await island(i => i.moveMode.tap(-12, .5));
    assert.equal(await page.evaluate(() => window.__island.island.moveMode.state.ok), true, 'a lane square is free');
    await shot(`move-wall-ok-${width}x${height}`);
    await island(i => i.moveMode.tap(-4, -5.5));
    await page.locator('.island-move-bar.is-refused').waitFor();
    const status = await page.locator('.island-move-status').textContent();
    assert.equal(status, 'Walls go on a pirate path.');
    await shot(`move-wall-refused-${width}x${height}`);
    await island(i => i.moveMode.cancel());
  }
  await page.setViewportSize({width: 1280, height: 720});
  await stand(0, 6);

  // A wave: boarders ashore hack the walls on their lanes.
  const rung = await island(async i => { const answer = await i.ringBell(); return {ok: answer?.ok, code: answer?.code ?? null}; });
  assert.ok(rung.ok, `the bell rang (${JSON.stringify(rung)})`);
  await until(state => state && state.phase === 'running' && state.time > .3, 60000);
  const hacked = await until(state => !state || state.done || state.hacking > 0, 120000);
  assert.ok(hacked && hacked.hacking > 0, 'boarders hack a wall');
  await wait(1500);
  for (const [width, height] of VIEWPORTS) { await page.setViewportSize({width, height}); await wait(600); await shot(`wave-${width}x${height}`); }
  assert.deepEqual(env.errors.filter(text => !/Failed to load resource/.test(text)), [], 'No browser errors');
} catch (error) {
  await page.screenshot({path: join(out, 'failure.png')}).catch(() => {});
  throw error;
} finally { await env.close(); }
