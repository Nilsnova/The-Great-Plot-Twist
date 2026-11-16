// Re-entering an island explains nothing again (owner, 16 Nov: "once re-entering the island, do not always
// re-explain things"). Headless Chrome with the fake server (?islands=fake): a fresh device plays, sees the
// intro (lore, arrival cutscene, goal card), the narrator's opening and the guided start, and skips them; then
//   1 travel   to the Harbor and back on the same page
//   2 reload   the page, Play again (Continue on your island)
//   3 other    another island at wave 0 (a second captain's new island on this browser)
//   4 reset    Settings › Reset my island (T53): the fresh start
// and records which explanations appear each time: no guide, no unlock card, no intro, no narrator opening or
// first-wave lines may come back. Settings › Replay the guided start still brings the guide.
//   node scripts/check-no-repeat-intro.js
import assert from 'node:assert/strict';
import {openWorldBrowser} from './world-browser-tools.js';

const env = await openWorldBrowser({hmr: false}), {page} = env;
const WORLD = `norepeat${Date.now().toString(36)}`;
const url = `${env.url}/?islands=fake&fakeworld=${WORLD}`;
await page.setViewportSize({width: 1100, height: 680});

// Every explanation this page shows, polled from the DOM (reset on each load).
const watch = () => page.evaluate(() => {
  if (window.__seen) return;
  const seen = window.__seen = {dialogs: [], narrator: [], coach: 0, hint: 0};
  setInterval(() => {
    for (const node of document.querySelectorAll('dialog[open]')) {
      const name = node.className.split(/\s+/).find(part => /cutscene|tutorial-card|goal-card|unlock|games-card|lobby/.test(part)) ?? node.className;
      if (seen.dialogs.at(-1) !== name) seen.dialogs.push(name);
    }
    const text = document.querySelector('.narrator-card:not([hidden]) .narrator-text')?.textContent?.trim();
    if (text && seen.narrator.at(-1) !== text) seen.narrator.push(text);
    const coach = document.querySelector('.coach-panel');
    if (coach && !coach.hidden) seen.coach++;
    const hint = document.querySelector('.pirate-goal-hint');
    if (hint && !hint.hidden) seen.hint++;
  }, 100);
});
const seen = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__seen)));
const onIsland = () => page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island?.gameCode && Number.isSafeInteger(window.__island.island?.campaign?.wave),
  null, {timeout: 30000, polling: 200});

// One step through whatever the front door shows: skip, Got it, Continue/Create, Start; false when nothing is open.
async function handle() {
  if (await page.locator('.island-card-lobby[open]').count()) {
    await page.locator('.island-card-lobby[open] .island-lobby-start').click({timeout: 5000}).catch(() => {});
    return true;
  }
  if (await page.locator('.games-card[open]').count()) {
    await page.locator('.games-card[open] .games-create-button').waitFor();
    await page.waitForTimeout(300);
    const card = page.locator('.games-card[open]');
    if (await card.getByRole('button', {name: /^Continue/}).count()) await card.getByRole('button', {name: /^Continue/}).first().click();
    else await card.getByRole('button', {name: 'Create a game', exact: true}).click();
    return true;
  }
  if (await page.locator('.goal-card[open]').count()) { await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click(); return true; }
  if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) { await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 3000}).catch(() => {}); return true; }
  return false;
}
async function play() {
  await page.locator('.shell-screen[open]').waitFor();
  await watch();
  await page.locator('#play').click();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(400);
    if (await handle()) continue;
    if (await page.evaluate(() => window.__island?.world.current?.id === 'home_islet' && !!window.__island.island?.gameCode)) break;
  }
  await onIsland();
}
// Let the island settle (intro, narrator opening, the guide's wait for it), skipping lines as they come.
async function linger(ms = 16000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await handle();
    await page.locator('.narrator-card:not([hidden]) .narrator-skip').click({timeout: 300}).catch(() => {});
    await page.waitForTimeout(400);
  }
}
const repeated = s => ({guide: s.coach > 0, intro: s.dialogs.filter(name => /cutscene|tutorial-card|goal-card/.test(name)),
  cards: s.dialogs.filter(name => /unlock/.test(name)), narrator: s.narrator, hint: s.hint > 0});
const report = {};
try {
  await page.goto(url);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await play();
  await linger();
  const first = repeated(await seen());
  report.first = first;
  assert.ok(first.guide, 'the first island of a fresh device shows the guided start');
  // Skip the guide, as a player would.
  await page.evaluate(() => window.__island.tutorials.skip(true));
  await linger(2000);

  // 1 travel to the Harbor and back.
  await page.evaluate(() => { window.__seen = null; });
  await watch();
  await page.evaluate(() => window.__island.world.goTo('saltreach_harbor', {fast: true}));
  await page.waitForFunction(() => window.__island.world.current?.id === 'saltreach_harbor', null, {timeout: 20000});
  await page.evaluate(() => window.__island.world.goTo('home_islet', {fast: true}));
  await onIsland(); await linger(8000);
  report.travel = repeated(await seen());

  // 2 reload, Play again.
  await page.reload(); await play(); await linger();
  report.reload = repeated(await seen());

  // 3 another island at wave 0 on this device (another captain's own new island, same browser).
  await page.goto(`${url}&fakeplayer=second&fakename=Mo`); await play(); await linger();
  report.other = repeated(await seen());
  await page.goto(url);

  // 4 Settings › Reset my island (T53): the fresh start.
  await page.reload(); await play(); await linger(3000);
  await page.evaluate(() => { window.__seen = null; });
  await watch();
  const code = await page.evaluate(() => window.__island.island.island?.code);
  const reset = await page.evaluate(typed => window.__island.island.resetIsland(typed), code);
  assert.ok(reset?.ok, `the reset went through: ${JSON.stringify(reset)}`);
  await linger();
  report.reset = repeated(await seen());

  // Settings › Replay the guided start still brings it back.
  await page.evaluate(() => window.__island.emit({type: 'tutorial_replay'}));
  await page.waitForFunction(() => !!window.__island.tutorials.guide, null, {timeout: 20000, polling: 200});
  report.replay = 'guide shown';

  console.log(JSON.stringify(report, null, 2));
  for (const [name, result] of Object.entries(report)) {
    if (name === 'first' || name === 'replay') continue;
    assert.equal(result.guide, false, `${name}: the guided start came back`);
    assert.deepEqual(result.intro, [], `${name}: the intro came back`);
    assert.deepEqual(result.cards, [], `${name}: an unlock card came back`);
    assert.equal(result.hint, false, `${name}: the first-wave goal hint came back`);
    for (const line of result.narrator) assert.ok(!/lighthouse of the Saltreach Isles has gone dark|This island is yours to hold|Here they come/.test(line), `${name}: the narrator explained again: ${line}`);
  }
  assert.deepEqual(env.errors.filter(text => !/Failed to load resource/.test(text)), [], 'No browser errors');
  console.log('PASS: no explanation repeats on re-entering an island');
} catch (error) {
  console.log(JSON.stringify(report, null, 2));
  console.log(await page.evaluate(() => ({place: window.__island?.world.current?.id, dialogs: [...document.querySelectorAll('dialog[open]')].map(node => node.className), seen: window.__seen})).catch(() => null));
  throw error;
} finally { await env.close(); }
