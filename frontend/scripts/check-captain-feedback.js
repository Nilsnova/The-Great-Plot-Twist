// Actual local fake-game feedback captures and native keyboard/mouse checks. Used by CF1 reviewers.
// CF1_GAME_ROOT selects a baseline checkout; CF1_BASELINE=1 captures without expecting new feedback.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const baseline = process.env.CF1_BASELINE === '1';
const shots = resolve(process.env.CF1_SHOTS ?? '../docs/evidence/CF1-captain-combat-feedback');
if (process.env.CF1_GAME_ROOT) process.chdir(process.env.CF1_GAME_ROOT);
const { openWorldBrowser } = await import(pathToFileURL(join(process.cwd(), 'scripts/world-browser-tools.js')));
const env = await openWorldBrowser(), { page } = env;
const checks = [], captures = [];
const check = (ok, text) => { assert.ok(ok, text); checks.push(text); };
const game = (fn, value) => page.evaluate(([source, arg]) => (0, eval)(source)(window.__island, arg), [String(fn), value]);
const wait = milliseconds => page.waitForTimeout(milliseconds);
const stand = (x, z) => game((g, at) => {
  g.player.position.set(at.x, g.world.current.groundHeight?.(at.x, at.z) ?? 1.03, at.z);
  g.view.setPlace('home_islet', g.player.position);
}, { x, z });

async function enter() {
  console.log('Opening the local fake game.');
  await page.goto(`${env.url}/?islands=fake&fakeplayer=cf1&fakename=Ianno`);
  await page.locator('.shell-screen[open]').waitFor(); await page.locator('#play').click();
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => document.querySelector('dialog[open]')
      || window.__island?.world.current?.id === 'home_islet', null, { timeout: 60000 });
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open]').getByRole('button', { name: 'Create a game', exact: true }).click();
    } else if (await page.locator('.island-card-lobby[open]').count()) await page.keyboard.press('Escape');
    else if (await page.locator('.goal-card[open]').count()) {
      await page.locator('.goal-card[open]').getByRole('button', { name: 'Got it', exact: true }).click();
    } else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) {
      await page.getByRole('button', { name: 'Skip', exact: true }).click({ timeout: 5000, noWaitAfter: true }).catch(() => {});
    } else {
      await wait(2500);
      if (!await page.locator('dialog[open]').count()) break;
    }
  }
  await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet'
    && window.__island.island && !document.querySelector('dialog[open]'));
  await page.evaluate(async () => (await import('/src/settings/preferences.js')).setPreferences({ tutorials: false }));
  await game(g => { g.settings.hour = 11; g.settings.fastTime = false; g.waves.island.autoBlade = false;
    localStorage.setItem('tgpt:pirates:goal-hint', '1'); });
  await stand(0, 6);
  console.log('Ringing the normal fake-server bell.');
  const answer = await game(g => g.island.ringBell());
  check(answer?.ok, 'Normal fake-server bell starts wave 1');
  await page.waitForFunction(() => window.__island.waves.island.state?.phase === 'running');
}

async function capture(name, width, height, { fire = false } = {}) {
  await page.setViewportSize({ width, height }); await wait(300);
  if (fire) { await page.keyboard.press('f'); await page.locator('.pirate-musket').hover(); }
  await wait(100);
  const state = await game(g => ({ phase: g.waves.island.state?.phase, time: g.waves.island.state?.time,
    player: { x: g.player.position.x, z: g.player.position.z }, weapon: g.waves.island.captainStats,
    quality: g.settings.quality, dpr: devicePixelRatio }));
  const path = join(shots, `${baseline ? 'before' : 'after'}-${name}-${width}x${height}.png`);
  await page.screenshot({ path }); captures.push({ name, width, height, path, ...state });
  console.log(`Captured ${name} at ${width}x${height}.`);
}

try {
  await mkdir(shots, { recursive: true }); await page.setViewportSize({ width: 1280, height: 720 });
  await enter();
  for (const [width, height] of [[1280, 720], [375, 812]]) {
    await capture('range', width, height, { fire: true });
    if (!baseline) {
      check(await page.locator('.pirate-range-feedback').isVisible(), `Range appears after native F at ${width}x${height}`);
      check((await page.locator('.pirate-range-label').innerText()).includes('14'), 'Musket uses actual level-one range');
      const visible = await game(g => g.scene.getObjectByName('captain-combat-feedback')?.children.filter(mesh => mesh.visible).length);
      check(visible >= 2, 'World range geometry is visible in actual game');
      const layout = await page.locator('.pirate-musket').evaluate(button => {
        const rect = button.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && button.scrollWidth <= button.clientWidth;
      });
      check(layout, 'Fire feedback stays inside viewport without clipped text');
    }
  }
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.__island.waves.island.state?.ships.some(ship => ship.state === 'attacking'), null, { timeout: 60000 });
  const ship = await game(g => g.waves.island.state.ships.find(item => item.state === 'attacking'));
  await stand(ship.x * .55, ship.z * .55); await page.keyboard.press('f');
  if (!baseline) {
    const before = await game(g => { const state = g.waves.island.state;
      return { health: Object.fromEntries([...state.ships, ...state.boarders].map(item => [item.id, item.hp])),
        killed: state.boardersKilled, sunk: state.sunk }; });
    await page.keyboard.down('f');
    await page.waitForFunction(before => {
      const state = window.__island.waves.island.state;
      return state && ([...state.ships, ...state.boarders].some(item => item.hp < before.health[item.id])
        || state.boardersKilled > before.killed || state.sunk > before.sunk);
    }, before);
    await capture('impact', 1280, 720);
    await capture('impact', 375, 812);
    await page.keyboard.up('f');
    check(await page.locator('.pirate-hit-confirmation').count() === 0, 'Native F preserves damage and impact events without a written confirmation');
    check(!/\bHit\b|\bdamage\b/.test(await page.locator('.pirate-musket').textContent()), 'Fire control has no hit label or damage number');
  }
  // Stay near the heart with automatic slash disabled so actual incoming danger remains observable.
  await stand(0, 5);
  if (!baseline) await page.locator('.pirate-danger:not([hidden])').waitFor({ timeout: 60000 });
  else await page.waitForFunction(() => window.__island.waves.island.state?.boarders.length > 0, null, { timeout: 60000 });
  for (const [width, height] of [[1280, 720], [375, 812]]) await capture('danger', width, height);
  if (!baseline) {
    const marker = await game(g => g.scene.getObjectByName('captain-combat-feedback').children.at(-1).visible);
    check(marker, 'Acute danger has a visible world direction marker');
    // Opening the real menu blocks gameplay feedback.
    await page.locator('.hud-menu').click();
    await page.waitForFunction(() => document.querySelector('.pirate-danger')?.hidden
      && document.querySelector('.pirate-range-feedback')?.hidden);
    check(true, 'Real menu hides contextual combat feedback');
  }
  check(env.pageErrors.length === 0, 'No uncaught browser errors');
  await writeFile(join(shots, `${baseline ? 'before' : 'after'}-report.json`), JSON.stringify({
    source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    browser: await env.browser.version(), fixture: 'Local in-memory fake API; wave 1; no built defenses; level 1 Musket; scripted position setup; native F/mouse',
    checks, captures, pageErrors: env.pageErrors,
  }, null, 2));
  console.log(`Captain feedback: ${checks.length} checks passed; ${captures.length} actual-game captures (${baseline ? 'before' : 'after'}).`);
} finally { await env.close(); }
