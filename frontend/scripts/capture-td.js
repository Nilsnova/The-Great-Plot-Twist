// The tower defense in the integrated game with the fake server (?islands=fake), one size per run:
//   node scripts/capture-td.js <folder> 1280x720      (and again with 375x812)
// A new player's island (only walls and cannons on offer), building a cannon, wave 1 with the captain's
// musket, the break with Next wave, the mortar unlock toast, upgraded towers with level pips, hired crew,
// a boss warship wave, a friend's island with the co-op build card and a Pirate Point battle.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/td';
const [width, height] = (process.argv[3] ?? '1280x720').split('x').map(Number);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await page.waitForTimeout(300); await settle(page); await page.screenshot({path: `${out}/${name}-${width}.png`}); console.log(`${name}-${width}`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const wave = () => page.evaluate(() => { const w = window.__island.waves?.island.wave ?? window.__island.waves?.point?.controller.wave; return w ? {phase: w.state.phase, ships: w.state.ships.length, boss: w.info.boss === true, done: w.done, pause: !!w.pause, wave: w.info.wave} : null; });
async function until(test, timeout = 120000) { const end = Date.now() + timeout; while (Date.now() < end) { const state = await wave(); if (test(state)) return state; await page.waitForTimeout(250); } throw new Error(`timed out: ${JSON.stringify(await wave())}`); }
const closeCards = async () => { for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
const noon = () => page.evaluate(() => { window.__island.settings.hour = 12; });
async function ringAndFight({name, captain = false, boss = false}) {
  await island(async i => i.ringBell());
  await until(state => state && state.ships > 0, 60000);
  if (boss) await until(state => state && state.boss, 5000);
  if (captain) {
    // Walk to the shore in front of the first ship, then F: the musket pose, its tracer and flash.
    // Stand on the beach (radius 14) facing the nearest ship, and wait until it is within the musket's 14 units.
    await page.waitForFunction(() => { const s = window.__island.waves.island.wave?.state; return s?.ships?.length > 0; }, null, {timeout: 60000, polling: 200});
    await page.evaluate(() => { const g = window.__island, ship = g.waves.island.wave.state.ships.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b));
      const d = Math.hypot(ship.x, ship.z), x = ship.x * 14 / d, z = ship.z * 14 / d; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); });
    await page.waitForFunction(() => { const g = window.__island, p = g.player.position, s = g.waves.island.wave?.state;
      return s?.ships?.some(ship => Math.hypot(ship.x - p.x, ship.z - p.z) < 13); }, null, {timeout: 60000, polling: 100});
    await page.keyboard.press('KeyF'); await page.waitForTimeout(140);
    await page.screenshot({path: `${out}/${name}-${width}.png`}); console.log(`${name}-${width}`);
    return;
  }
  await page.waitForTimeout(1500);
  await shot(name);
}
try {
  await page.setViewportSize({width, height});
  await page.goto(`${env.url}/?islands=fake`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.locator('#play').click();
  for (let i = 0; i < 8; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.goal-card[open]') || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 40000, polling: 100});
    if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
    else break;
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.__island.waves && !document.querySelector('dialog[open]'), null, {timeout: 30000});
  await noon();
  // 1 A new player's island: only walls and cannons are on offer (the other markers wait for their wave).
  await stand(0, 2);
  const offered = await page.evaluate(() => window.__island.scene.getObjectByName('island').children.filter(node => node.name.startsWith('island-marker:') && node.visible).map(node => node.name.slice(14)));
  console.log('markers on a new island:', offered.join(' '));
  assert.ok(offered.every(id => /^(wall|cannon)_/.test(id)), 'a new island offers only walls and cannons');
  await shot('01-new-island');
  // 2 The build card of a cannon spot, then the cannon.
  await stand(-11, -12.5);
  await island(i => i.pick('cannon_1'));
  await page.locator('.island-card[open]').waitFor();
  await shot('02-build-card');
  await island(async i => i.build('cannon_1', 'cannon'));
  await closeCards();
  await page.waitForFunction(() => window.__island.island.island.spots.find(spot => spot.id === 'cannon_1')?.built);
  await shot('03-cannon-built');
  // 3 Wave 1 with the captain's musket (F fires at the nearest ship in range).
  await stand(-9, -11);
  await ringAndFight({name: '04-wave1-captain', captain: true});
  // 4 The break after the won wave: Next wave and the auto switch.
  await until(state => state && state.pause, 180000);
  await page.locator('.pirate-next').waitFor();
  await shot('05-break-next-wave');
  // 5 The mortar unlocks after wave 3: the island answer brings the toast.
  await island(async i => { i.dev.setWaveBest(3); await i.load(); });
  await page.waitForFunction(() => [...document.querySelectorAll('.u-toast')].some(node => /unlocked/i.test(node.textContent)), null, {timeout: 10000});
  console.log('unlock toasts:', await page.evaluate(() => [...document.querySelectorAll('.u-toast')].map(node => node.textContent).join(' | ')));
  await shot('06-unlock-mortar');
  // 6 Upgraded towers with level pips, a mortar, and hired crew (everything unlocked, enough coins).
  await island(async i => { i.dev.setWaveBest(8); i.dev.setCoins(3000); await i.load(); i.dev.setWaveBest(8); });
  await island(async i => {
    await i.build('cannon_2', 'mortar'); await i.upgrade('cannon_2'); await i.upgrade('cannon_2');
    await i.upgrade('cannon_1'); await i.upgrade('cannon_1');
    for (const id of ['wall_2', 'wall_6', 'cannon_5']) await i.build(id, id.startsWith('wall') ? 'wall' : 'cannon');
    await i.upgrade('wall_2'); await i.upgrade('cannon_5');
    for (const crew of ['gunner', 'gunner', 'carpenter', 'lookout']) await i.hire(crew);
  });
  await closeCards();
  console.log('island now:', JSON.stringify(await island(i => ({crew: i.island.crew, levels: i.island.spots.filter(spot => spot.built).map(spot => `${spot.id}:${spot.kind}:${spot.level}`)}))));
  await island(i => i.openCrew());
  await page.locator('dialog[open]').waitFor();
  await shot('07-crew-hired');
  await closeCards();
  await stand(0, -8);
  await ringAndFight({name: '08-upgraded-pips-crew'});
  await until(state => !state || state.pause || state.done, 240000);
  // 7 A boss wave: wave 5 brings a warship.
  await island(async i => { i.dev.setWaveBest(4); await i.load(); });
  await ringAndFight({name: '09-boss-warship', boss: true});
  await until(state => !state || state.pause || state.done, 240000);
  // 8 A friend's island: a co-op build card (built there with your own coins).
  await island(async i => { i.visit('ISLE-FR3ND'); await i.load(); });
  await page.waitForFunction(() => !!window.__island.island.visiting?.ownerName);
  await stand(-13, -5);
  await island(i => i.pick('cannon_5'));
  await page.locator('.island-card[open]').waitFor();
  await shot('10-friend-coop-build');
  await closeCards();
  await island(async i => i.sailHome());
  // 9 Pirate Point: its battle, rung from its bell.
  await page.evaluate(async () => { await window.__island.world.goTo('lighthouse_isle', {fast: true}); });
  await page.waitForFunction(() => window.__island.world.current?.id === 'lighthouse_isle' && !window.__island.world.busy, null, {timeout: 30000});
  await closeCards();
  await stand(5, -4);
  await page.evaluate(() => window.__island.waves.point.ringBell());
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(1500); if (await page.locator('dialog.cutscene[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click(); }
  await until(state => state && state.ships > 0, 60000);
  await page.waitForTimeout(2500);
  await shot('11-pirate-point-battle');
  const audio = env.errors.filter(text => /AudioContext encountered an error from the audio device/.test(text));
  if (audio.length) console.log(`environment: ${audio.length} AudioContext audio-device errors (headless Chrome without an audio device)`);
  assert.deepEqual(env.errors.filter(text => !/Failed to load resource/.test(text) && !audio.includes(text)), [], 'No browser errors');
} catch (error) {
  await page.screenshot({path: `${out}/failure-${width}.png`}).catch(() => {});
  console.log('wave:', await wave().catch(() => null), 'errors:', env.errors);
  throw error;
} finally { await env.close(); }
