// The outage audit ("the game must not break when something fails"): for each island action it makes the
// fake server fail the next request in three ways (no connection, a timeout, the database away), presses the
// real button in the real card, and checks what the player then sees:
//   - the card shows the plain reason (role="alert"), never a blank card, a code or a stack trace;
//   - the browser reports no error (no uncaught exception, no rejected promise, no console.error);
//   - the same button works on the next press (the card is not stuck in "busy").
// A timeout is the hard case: the request reached the server and was applied, only the answer was lost.
// The retry then sends the same action id, so nothing is paid twice (checked for the cannon by coins).
//   node scripts/check-outage-feedback.js [--shots folder]
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {openWorldBrowser} from './world-browser-tools.js';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) await mkdir(shots, {recursive: true});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const env = await openWorldBrowser({hmr: false}), page = env.page;
const island = (fn, arg) => page.evaluate(([source, value]) => (0, eval)(source)(window.__island.island, value), [String(fn), arg]);

// What the fake server answers for each kind (src/pirates/fake-api.js FAILURES): the text the card must show.
const FAILURES = {
  network: 'No connection to the server. Check your internet and try again.',
  timeout: 'The server took too long to answer. Try again.',
  server: 'The database could not be reached. Try again in a moment.',
};
// [name, how to open the card, the button's accessible name]
const ACTIONS = [
  ['build a cannon', i => i.pick('cannon_1'), /^Cannon\b/],
  ['build a wall', i => i.pick('wall_1'), /^Build/],
  ['upgrade a cannon', i => i.pick('cannon_2'), /^Upgrade/],
  ['hire a gunner', i => i.openCrew(), /^Hire/],
  ['upgrade the captain', i => i.openCaptain(), /^Upgrade/],
  ['research', i => i.openTechHub(), /^Research/],
  ['give to the wreck', i => i.openWreck(), /^Give/],
];
// The bell comes last and is never pressed twice: a second press (or a timeout, which reaches the server)
// starts a wave, and a running wave rightly locks research and other between-waves actions.
const BELL = ['ring the bell', i => i.pick('island_bell'), /^Ring the bell/];
const closeCards = async () => {
  for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) { await island(i => i.ui.close()); await page.keyboard.press('Escape'); await wait(120); }
};
// A fresh island for every case: plenty of coins, everything open, one cannon and one wall standing.
const fresh = () => island(async i => {
  i.dev.reset(); i.dev.setCoins(500000); i.dev.setWaveBest(40); i.dev.setCaptain(2); await i.load();
  await i.build('cannon_2', 'cannon'); await i.build('wall_2'); await i.load();
});
const alerts = () => page.locator('dialog[open] [role=alert]').evaluateAll(nodes => nodes.filter(node => !node.hidden && node.getClientRects().length).map(node => node.textContent.trim()).filter(Boolean));

try {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Nils`);
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
  await page.reload();
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  // The front door's cards until the player stands on the island (as scripts/check-overlaps.js).
  for (let i = 0; i < 14; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 60000, polling: 100});
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await wait(400);
      await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    } else if (await page.locator('.island-card-lobby[open]').count()) await page.keyboard.press('Escape');
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 5000}).catch(() => {});
    else { await wait(2500); if (await page.locator('dialog[open]').count()) continue; break; }
    await wait(300);
  }
  await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island, null, {timeout: 60000});
  await page.evaluate(async () => { window.__island.settings.hour = 11; (await import('/src/settings/preferences.js')).setPreferences({tutorials: false}); });

  const report = [];
  async function check([name, open, label], kind, {retry = true} = {}) {
      const text = FAILURES[kind], tag = `${name}, ${kind}`;
      await closeCards(); await fresh(); await wait(150);
      await island(open);
      const button = () => page.locator('dialog[open]').last().getByRole('button', {name: label}).first();
      await button().waitFor({timeout: 10000});
      if (!(await button().isEnabled())) {
        const why = await page.locator('dialog[open]').last().evaluate(card => card.innerText.slice(0, 600));
        assert.fail(`${tag}: the button is disabled before the failure. Card says: ${why}`);
      }
      // failNext() fails the NEXT request of any kind: let the card's own reads (prices, walls, the boat) finish first.
      await wait(600);
      const before = env.errors.length;
      await island((i, kind) => i.dev.failNext(kind), kind);
      await button().click();
      // The plain reason shows in the card.
      await page.waitForFunction(text => [...document.querySelectorAll('dialog[open] [role=alert]')].some(node => !node.hidden && node.textContent.includes(text)), text, {timeout: 10000})
        .catch(async () => assert.fail(`${tag}: the card never showed "${text}" (it shows ${JSON.stringify(await alerts())})`));
      const shown = await alerts();
      assert.ok(shown.every(line => !/undefined|null|\[object|Error:|TypeError|\bat \w+ \(/.test(line)), `${tag}: no raw error text (${JSON.stringify(shown)})`);
      if (shots) await page.screenshot({path: join(shots, `${kind}-${name.replaceAll(' ', '-')}.png`)});
      assert.deepEqual(env.errors.slice(before).filter(line => !/Failed to load resource|ResizeObserver/.test(line)), [], `${tag}: no browser error`);
      // Not stuck: the same button answers the next press, and the reason goes away.
      const again = button();
      if (!retry) assert.ok(kind === 'timeout' || (await again.count() && await again.isEnabled()), `${tag}: the button is still there and enabled`);
      else if (await again.count() && await again.isEnabled()) {
        await again.click();
        await page.waitForFunction(text => ![...document.querySelectorAll('dialog[open] [role=alert]')].some(node => !node.hidden && node.textContent.includes(text)), text, {timeout: 10000})
          .catch(() => assert.fail(`${tag}: the reason stayed after a working retry`));
      } else if (kind !== 'timeout') assert.fail(`${tag}: the button is gone or disabled after the failure`);
      // (After a timeout the action was applied, so its button may rightly be gone: the cannon stands.)
      report.push({action: name, failure: kind, shown: shown.join(' | ')});
  }
  for (const kind of Object.keys(FAILURES)) for (const action of ACTIONS) await check(action, kind);

  // A lost answer never charges twice: the retry sends the same action id.
  await closeCards(); await fresh();
  const coins = () => island(i => i.island.coins);
  const start = await coins();
  await island(i => i.pick('cannon_1'));
  const cannon = page.locator('dialog[open]').last().getByRole('button', {name: /^Cannon\b/}).first();
  await cannon.waitFor();
  await island(i => i.dev.failNext('timeout'));
  await cannon.click();
  await page.waitForFunction(text => [...document.querySelectorAll('dialog[open] [role=alert]')].some(node => node.textContent.includes(text)), FAILURES.timeout, {timeout: 10000});
  const retry = page.locator('dialog[open]').last().getByRole('button', {name: /^Cannon\b/}).first();
  if (await retry.count() && await retry.isEnabled()) { await retry.click(); await wait(800); }
  await island(i => i.load());
  assert.equal(await coins(), start - 30, 'a cannon whose first answer was lost is paid once (30 coins), not twice');
  assert.ok(await island(i => i.island.spots.find(spot => spot.id === 'cannon_1').built), 'and the cannon stands');

  // The bell: not connected and database away leave no wave; the timeout reached the server, so it goes last.
  for (const kind of ['network', 'server', 'timeout']) await check(BELL, kind, {retry: false});

  console.table(report);
  assert.deepEqual(env.errors.filter(line => !/Failed to load resource|ResizeObserver/.test(line)), [], 'No browser errors in the whole run');
  console.log(`\nOutage audit: ${report.length} action × failure cases show a plain reason, recover on retry and raise no browser error; a lost answer is paid once.`);
} catch (error) {
  await page.screenshot({path: join(shots ?? '/tmp', 'check-outage-feedback-failure.png')}).catch(() => {});
  throw error;
} finally { await env.close(); }
