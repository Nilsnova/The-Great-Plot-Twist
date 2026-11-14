// Captures T36 flexible placement with the fake server (?islands=fake): a built cannon's card with Move, Move
// mode on a free square (green) and on the heart (red, with the reason), and the cannon placed on its new
// square, at 1280x720 and 375x812. It also checks that a real click on the island picks a square.
//   node scripts/capture-placement.js [output folder]     (default captures/placement)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/placement';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const shot = async name => { await settle(page); await page.screenshot({path: `${out}/${name}.png`}); console.log(`${out}/${name}.png`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, 1.03, z); g.view.setPlace('home_islet', g.player.position); }, [x, z]);
const moving = () => page.evaluate(() => window.__island.island.moving);
try {
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    await page.setViewportSize({width, height});
    await page.goto(`${env.url}/?islands=fake`);
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
    await page.reload();
    await page.locator('.shell-screen[open]').waitFor();
    await page.locator('#play').click();
    // The Play card (Create a game), the lobby (Look around first), the intro cutscenes and the goal card, in whatever order they come.
    const ready = () => page.evaluate(() => window.__island?.world.current?.id === 'home_islet' && !!window.__island.island?.island && !document.querySelector('dialog[open]'));
    // Done when the island stays free of cards for a few checks in a row (the lobby can open late).
    for (let i = 0, calm = 0; i < 240 && calm < 4; i++) {
      if (await ready()) { calm++; await page.waitForTimeout(750); continue; }
      calm = 0;
      // The top-most open dialog is the last one in the page; a DOM click does not wait for animations.
      const open = page.locator('dialog[open]').last();
      for (const name of ['Create a game', 'Look around first', 'Skip', 'Got it']) {
        const found = open.getByRole('button', {name, exact: true});
        if (await found.count()) { await found.first().evaluate(node => node.click()).catch(() => {}); break; }
      }
      await page.waitForTimeout(750);
    }
    assert.ok(await ready(), 'The island is ready with no card open');
    await page.evaluate(() => { window.__island.settings.hour = 11; });
    // A cannon on cannon_1 (the fake's starting coins pay for it).
    await page.evaluate(() => window.__island.island.build('cannon_1', 'cannon'));
    await page.waitForFunction(() => window.__island.island.island?.spots.find(spot => spot.id === 'cannon_1').built);
    await stand(-11, -12.5);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card[open] .island-move').waitFor();
    await shot(`card-${width}`);
    await page.locator('.island-card[open] .island-move').click();
    await page.locator('.island-move-bar:not([hidden])').waitFor();
    // A real click on the island picks a square (world.js onGround while Move mode is on).
    const before = await moving();
    const box = await page.evaluate(() => { const rect = window.__island.renderer.domElement.getBoundingClientRect(); return {x: rect.left, y: rect.top, width: rect.width, height: rect.height}; });
    await page.mouse.click(box.x + box.width * .6, box.y + box.height * .45);
    const after = await moving();
    assert.ok(after && (after.x !== before.x || after.z !== before.z), 'A click on the island picks a square');
    await stand(-9, -7);
    await page.evaluate(() => window.__island.island.moveMode.tap(-8, -10));
    await shot(`move-ok-${width}`);
    await stand(-2, -1);
    await page.evaluate(() => window.__island.island.moveMode.tap(0, 2));
    await page.locator('.island-move-bar.is-refused').waitFor();
    await shot(`move-refused-${width}`);
    await stand(-9, -7);
    await page.evaluate(() => window.__island.island.moveMode.tap(-8, -10));
    await page.locator('.island-move-place').click();
    await page.waitForFunction(() => window.__island.island.island?.spots.find(spot => spot.id === 'cannon_1').x === -8);
    await page.locator('.island-move-bar').waitFor({state: 'hidden'});
    await stand(-4, -8); // a step aside, so the walk-up prompt does not cover the cannon
    await shot(`placed-${width}`);
    // The wave fights the cannon where it stands now.
    const defense = await page.evaluate(() => window.__island.island.defenses().find(item => item.id === 'cannon_1'));
    assert.deepEqual([defense.x, defense.z], [-8, -10]);
  }
  assert.deepEqual(env.errors.filter(text => !/Failed to load resource/.test(text)), [], 'No browser errors');
  console.log('external requests:', env.external.length);
} catch (error) {
  await page.screenshot({path: `${out}/failure.png`}).catch(() => {});
  throw error;
} finally { await env.close(); }
