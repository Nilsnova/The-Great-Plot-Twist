// Real harbor hotspot/overlay smoke in local Chromium (the match board card); all sports HTTP is intercepted, read-only.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openWorldBrowser } from './world-browser-tools.js';
import { startFromTitle } from './shell-browser-tools.js';
import { BOARD } from '../tests/sports/sample-answers.js';
const env = await openWorldBrowser(), { page } = env, report = { checks: [] };
const check = (ok, label) => { assert.ok(ok, label); report.checks.push(label); };
let reads = 0;
await page.route('**/api/sports', route => {
  reads++;
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(BOARD) });
});
try {
   await page.goto(`${env.url}?adapter=local`); await startFromTitle(page);
  await page.evaluate(async () => {
    const game = window.__island;
    await game.world.goTo('saltreach_harbor', { fast: true });
    const zone = game.world.current.zones.find(zone => zone.id === 'sports_pavilion');
    game.player.position.set(zone.x, zone.y, zone.z);
  });
  await page.waitForFunction(() => document.querySelector('.interact')?.dataset.zone === 'sports_pavilion');
  await page.keyboard.press('KeyE');
  // Since lane H the pavilion opens the Harbor's match board card (src/harbor/match-card.js); the data
  // credit lives under Settings, Credits, so the card is checked by the recorded fixture it lists.
  await page.locator('.harbor-match[open]').waitFor();
  await page.locator('.harbor-match[open] .harbor-item').filter({ hasText: 'Harbor Athletic' }).first().waitFor();
  check(await page.locator('.harbor-match[open]').count() === 1 && reads === 1, 'Harbor sports pavilion opens one lazy match board card');
  const before = await page.evaluate(() => window.__island.player.position.toArray());
  await page.keyboard.down('KeyW'); await page.waitForTimeout(250); await page.keyboard.up('KeyW');
  check(JSON.stringify(await page.evaluate(() => window.__island.player.position.toArray())) === JSON.stringify(before), 'Typing in the panel cannot walk the explorer');
  check(await page.evaluate(() => window.__island.world.goTo('home_islet', { fast: true })) === false, 'Sports overlay blocks world travel');
  await page.keyboard.press('Escape'); await page.locator('.harbor-match').waitFor({ state: 'hidden' });
  check(await page.locator('canvas[tabindex="0"]').evaluate(element => element === document.activeElement), 'Pavilion Escape returns focus to the game');
  check(!await page.evaluate(() => window.__island.sportsUi.active), 'Pavilion closes its overlay gate');
  check(await page.evaluate(() => window.__island.world.goTo('home_islet', { fast: true })) === true, 'Travel resumes after the pavilion closes');
  check(env.external.length === 0, 'No external or provider requests');
  check(env.errors.length === 0, 'No browser errors');
  console.log(JSON.stringify(report, null, 2));
} finally { await writeFile('captures/G15-Sports-Hotspot-Checks.json', JSON.stringify(report, null, 2)); await env.close(); }
