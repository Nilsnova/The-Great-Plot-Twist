// The house roles of GAME-V3.md "Houses" in the integrated game with the fake server (?islands=fake), one size per run:
//   node scripts/capture-houses.js <folder> 1280x800      (and again with 390x844)
// A level-1 house's card ("Level 2: choose Barracks, Tavern or Workshop."), the role choice, the Barracks' card with
// its range ring, each role's look, a Barracks' militia fighting boarders, and a Tavern healing a hurt captain.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/houses';
const [width, height] = (process.argv[3] ?? '1280x800').split('x').map(Number);
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await page.waitForTimeout(400); await settle(page); await page.screenshot({path: `${out}/${name}-${width}x${height}.png`}); console.log(`${name}-${width}x${height}`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const island = (fn, arg) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const wave = () => page.evaluate(() => { const w = window.__island.waves?.island.wave; return w ? {wave: w.info.wave, ships: w.state.ships.length, done: w.done, pause: !!w.pause,
  boarders: (w.state.boarders ?? []).length, militia: (w.state.militia ?? []).map(m => m.state), hp: window.__island.waves.island.captain?.hp ?? null} : null; });
async function until(test, timeout = 120000) { const end = Date.now() + timeout; while (Date.now() < end) { const state = await wave(); if (test(state)) return state; await page.waitForTimeout(150); } throw new Error(`timed out: ${JSON.stringify(await wave())}`); }
const closeCards = async () => { for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
const quiet = () => page.evaluate(() => document.querySelector('.narrator-card:not([hidden]) .narrator-skip')?.click());
try {
  await page.setViewportSize({width, height});
  await page.goto(`${env.url}/?islands=fake`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.locator('#play').click();
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 40000, polling: 100});
    if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('.games-card[open]').count()) { await page.waitForTimeout(400); await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click(); }
    else if (await page.locator('.island-card-lobby[open]').count()) await page.locator('.island-card-lobby[open] .island-lobby-start').click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
    else break;
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.__island.waves && window.__island.island?.island, null, {timeout: 30000});
  await closeCards();
  await page.evaluate(() => { window.__island.settings.hour = 12; });
  // 1 A level-1 house: the loot line and what comes at level 2.
  await island(async i => { i.dev.setWaveBest(5); i.dev.setCoins(60000); await i.load(); await i.build('house_1', 'house'); });
  await closeCards(); await quiet();
  await stand(7, -1);
  await island(i => i.pick('house_1'));
  assert.equal(await page.locator('.island-card[open] .island-skills-line').textContent(), 'Level 2: choose Barracks, Tavern or Workshop.');
  await shot('01-house-card-level-1');
  await closeCards();
  // 2 Level 2: the three roles, none picked yet.
  await island(async i => { await i.upgrade('house_1'); });
  await closeCards();
  await island(i => i.pick('house_1'));
  assert.equal(await page.locator('.island-card[open] .island-spec').count(), 3);
  await shot('02-house-role-choice');
  // 3 The Barracks picked on the open card: marked, and its range ring on the ground.
  await page.locator('.island-card[open] .island-spec[data-spec="barracks"]').click();
  await page.waitForFunction(() => document.querySelector('.island-card[open] .island-spec.is-active')?.dataset.spec === 'barracks', null, {timeout: 5000});
  await page.waitForFunction(() => { let on = false; window.__island.scene.traverse(o => { if (o.name === 'island-range' && o.visible) on = true; }); return on; }, null, {timeout: 5000});
  await quiet();
  await shot('03-barracks-card-range-ring');
  await closeCards();
  // 4 Each role's look: the Barracks and a Tavern side by side, then the Workshop.
  await island(async i => { await i.build('house_2', 'house'); await i.upgrade('house_2'); await i.specialise('house_2', 'tavern'); });
  await closeCards(); await quiet();
  await stand(0, -2);
  await shot('04-barracks-and-tavern-look');
  await island(i => i.pick('house_2'));
  await page.locator('.island-card[open]').waitFor();
  await shot('05-tavern-card-range-ring');
  await closeCards();
  await island(async i => { await i.specialise('house_1', 'workshop'); });
  await closeCards();
  await island(i => i.pick('house_1'));
  await shot('06-workshop-card-range-ring');
  await closeCards();
  await shot('07-workshop-and-tavern-look');
  // 5 Wave 6 with a level-3 Barracks, the inner ring and one cannon: the militia fight boarders.
  await island(async i => { await i.specialise('house_1', 'barracks'); await i.upgrade('house_1');
    for (const spot of ['wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12']) await i.build(spot, 'wall');
    await i.build('cannon_1', 'cannon'); });
  await closeCards();
  await stand(-2, -12);
  await island(async i => i.ringBell());
  await until(state => state && state.militia.length > 0, 60000);
  const fight = await until(state => state?.militia.includes('fighting'), 150000);
  console.log('militia:', JSON.stringify(fight));
  const near = await page.evaluate(() => { const m = window.__island.waves.island.wave.state.militia.find(u => u.state === 'fighting'); return {x: m.x, z: m.z}; });
  await stand(near.x - 3, near.z - 4); await quiet();
  await page.waitForTimeout(300);
  await shot('08-militia-fighting');
  // 6 The captain gets hurt on a boarder, then rests by the Tavern (house_2) and heals.
  const end = Date.now() + 120000;
  let hp = 100;
  while (Date.now() < end) {
    const state = await page.evaluate(() => { const w = window.__island.waves.island, s = w.wave;
      if (!s || s.done) return {over: true};
      const b = (s.state.boarders ?? [])[0];
      if (b && !w.captainDown) { const g = window.__island; g.player.position.set(b.x + .4, g.world.current.groundHeight?.(b.x, b.z) ?? 1.03, b.z); }
      return {hp: w.captain?.hp ?? 100, down: w.captainDown};
    });
    if (state.over) throw new Error('the wave ended before the captain was hurt');
    hp = state.hp;
    if (hp <= 80 || state.down) break;
    await page.waitForTimeout(200);
  }
  assert.ok(hp < 100, 'the captain was hurt');
  await stand(-8, -3.5);
  const healed = await until(state => state && state.hp !== null && state.hp >= hp + 3, 30000);
  console.log(`tavern: ${hp} -> ${healed.hp}`);
  await quiet();
  await shot('09-tavern-healing');
  const errors = env.errors.filter(text => !/Failed to load resource|AudioContext|audio device/i.test(text));
  assert.deepEqual(errors, [], 'no browser errors');
} finally { await env.close(); }
