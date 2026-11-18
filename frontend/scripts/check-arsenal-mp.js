// Release check for the flag `arsenal` (T40/T41, decision D042, specs/T40-T41-arsenal.md) with two captains on
// one island, before the flag goes on in production. Headless Chrome, one browser context, the fake server shared
// by both tabs (?islands=fake&fakeworld=…, fake-api.js and arsenal-fake.js, the rules of the arsenal migration) with
// the flag on (&fakeflags=arsenal) and the BroadcastChannel room, as check-placement-mp.js and
// check-wall-recovery-mp.js. The host (Nils) creates a game, the member (Ben) joins it with the code. The scenarios,
// each reported PASS or FAIL with what was measured:
//   1 building  both maps draw the arsenal; walking up to it and pressing E opens its card on both pages ("Stored:
//               0 of 20", the musket in hand)
//   2 buy       the host buys pistols with a double click and a retry with the same click id: one copy, coins drop
//               once by the price, into his empty hands; a second type goes onto the rack (he carries one)
//   3 take      the member takes the stored copy from his card; both cards show who carries what (the other page
//               follows within 2 s, check-multiplayer's bound for a crewmate's change)
//   4 swap      the host buys one more onto the rack; the member swaps to it: his old copy is back on the rack
//   5 race      both captains press Take on the same stored copy at once: one carries it, the other is refused
//               `taken` (the card keeps saying why, and the API), and nobody carries two
//   6 full      the host fills the rack to 20 by buying; the member's Return is off on his card and the server
//               refuses it `arsenal_full`, the copy stays in his hands; a buy into full hands is refused uncharged
//   7 old shop  the Captain card has no Weapons tab; the old POST /api/island/weapon/buy answers 409 use_arsenal
//   8 wave      in a running wave every buy, take, swap and return is refused `wave_running` (card buttons off with
//               the reason, nothing changes); both sims fire each captain's carried weapon (own page and the
//               other page, captain_fired), the controller's loadout is the carried copy
//   9 reload    after the wave both pages reload: each still carries the same copy (answer, card, loadout)
//   F flag off  a separate context without the flag: no arsenal mesh or zone, E there opens nothing, the Captain
//               card keeps its Weapons tab and the old shop sells and equips as before
// Exit code 1 when any scenario fails.
//   node scripts/check-arsenal-mp.js [folder]        (npm run test:arsenal; default: a fresh folder under the OS tmp)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorldBrowser, settle} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = process.argv[2] ?? join(tmpdir(), 'tgpt-arsenal', stamp);
await mkdir(out, {recursive: true});
const WORLD = `ars${Date.now().toString(36)}`;
const CODE = 'ISLE-K7Q2M';
const CARD = '.island-card-arsenal[open]';
// check-multiplayer.js: a change on one page reaches the other page within 2 s (200 ms for the reading).
const LIMIT_MS = 2000, SLACK_MS = 200;
const PRICES = {pistols: 60, blunderbuss: 120, long_rifle: 200, fire_bombs: 300};
const env = await openWorldBrowser({hmr: false}), context = env.page.context();
const pages = [];
const log = (...args) => console.log(...args);
const results = []; // {id, name, ok, lines}

// The front door's cards until the player stands on the island (check-placement-mp.js enter).
async function enter(captain, {create = false, join = null} = {}) {
  const {page} = captain;
  await page.locator('#play').click();
  for (let i = 0; i < 30; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 60000, polling: 100});
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await page.waitForTimeout(400); // Continue (GET /api/games) fills in
      const resume = page.locator('.games-card[open] .games-pick');
      if (!create && !join && await resume.count()) await resume.first().click();
      else if (join) { await page.locator('.games-card[open] .games-code').fill(join); await page.locator('.games-card[open]').getByRole('button', {name: 'Join', exact: true}).click(); }
      else await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    }
    else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 5000}).catch(() => {});
    else if (await page.locator('.island-card-lobby[open]').count() || (await page.evaluate(() => window.__island?.world.current?.id === 'home_islet' && !!window.__island.island?.island && !document.querySelector('dialog[open]')))) break;
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(friend => window.__island.waves && (friend ? !!window.__island.island.visiting?.spots : !!window.__island.island.island?.spots), captain.playerId !== 'me', {timeout: 30000, polling: 100});
  await page.evaluate(() => {
    const g = window.__island; g.settings.hour = 12;
    window.__ars = {fired: []};
    g.on('captain_fired', event => window.__ars.fired.push({by: event.by, weapon: event.weapon, mode: event.mode}));
  });
  // A second fake transport in the page, on the same shared world and as the same player: raw calls with chosen
  // click ids (a client's retry) and the old shop's route, without the card in between.
  await page.addScriptTag({type: 'module', content: "import('/src/pirates/fake-api.js').then(m => { window.__raw = m.createFakeIslandTransport(); });"});
  await page.waitForFunction(() => !!window.__raw, null, {timeout: 15000});
}
async function openCaptain(name, playerId, options, {flags = 'arsenal', ctx = context, list = pages} = {}) {
  const fresh = !(ctx === context && !list.length);
  const page = fresh ? await ctx.newPage() : env.page;
  if (fresh) {
    await stubOfflineApi(page); await stubWeather(page);
    page.on('pageerror', error => env.errors.push(`${name}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') env.errors.push(`${name}: ${message.text()}`); });
  }
  await page.setViewportSize({width: 960, height: 600});
  const world = flags ? WORLD : `${WORLD}off`;
  await page.goto(`${env.url}/?islands=fake&fakeworld=${world}&fakeplayer=${playerId}&fakename=${encodeURIComponent(name)}${flags ? `&fakeflags=${flags}` : ''}`);
  if (!list.length) { await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await page.reload(); }
  const captain = {name, page, playerId};
  list.push(captain);
  await enter(captain, options);
  log(`${name} is on the island (${playerId})`);
  return captain;
}
const island = (captain, fn, arg) => captain.page.evaluate(([source, arg]) => (0, eval)(source)(window.__island.island, arg), [String(fn), arg]);
const codeOf = captain => (captain.playerId === 'me' ? null : CODE);
// Raw arsenal calls on the page's second transport (the answers of the fake server, with the server's codes).
const raw = (captain, method, path, body = null) => captain.page.evaluate(async ([method, path, body]) => {
  const answer = method === 'GET' ? await window.__raw.get(path) : await window.__raw.post(path, body);
  return answer.ok ? {ok: true, status: answer.status, data: answer.data} : {ok: false, status: answer.status, code: answer.code, message: answer.message};
}, [method, path, body]);
const state = async captain => {
  const answer = await raw(captain, 'GET', `/api/island/arsenal${codeOf(captain) ? `?code=${codeOf(captain)}` : ''}`);
  assert.ok(answer.ok, `${captain.name}'s arsenal answer: ${JSON.stringify(answer)}`);
  return answer.data;
};
const withCode = (captain, body) => (codeOf(captain) ? {...body, code: codeOf(captain)} : body);
const coinsOf = captain => island(captain, i => i.dev.read().coins);
const stand = (captain, at) => captain.page.evaluate(at => { const g = window.__island; g.player.position.set(at.x, g.world.current.groundHeight?.(at.x, at.z) ?? 1.03, at.z); g.view.setPlace?.(g.world.current.id, g.player.position); }, at);
const closeCards = async captain => { for (let i = 0; i < 4 && await captain.page.locator('dialog[open]').count(); i++) { await captain.page.keyboard.press('Escape'); await captain.page.waitForTimeout(200); } };
// What a page's open arsenal card shows.
const cardOf = captain => captain.page.evaluate(card => {
  const root = document.querySelector(card);
  if (!root) return null;
  return {stock: root.querySelector('.island-arsenal-rack h3')?.textContent ?? '', carry: root.querySelector('.island-arsenal-name')?.textContent ?? '',
    message: root.querySelector('.island-message')?.textContent ?? '', coins: root.querySelector('.island-coins')?.textContent ?? '',
    back: (() => { const b = root.querySelector('[data-focus="arsenal-return"]'); return b ? {label: b.textContent, disabled: b.disabled} : null; })(),
    reasons: [...root.querySelectorAll('.island-reason')].map(item => item.textContent),
    rack: [...root.querySelectorAll('.island-arsenal-copy')].map(row => ({label: row.querySelector('strong')?.textContent ?? '', holder: [...row.querySelectorAll('.island-crew-reason')].map(item => item.textContent).join(' | '),
      button: row.querySelector('.kit-button')?.textContent ?? null, disabled: row.querySelector('.kit-button')?.disabled ?? null})),
    buys: Object.fromEntries([...root.querySelectorAll('.island-arsenal-type')].map(row => [row.dataset.weapon, {disabled: row.querySelector('.kit-button').disabled,
      reason: row.querySelector('.island-crew-reason')?.textContent ?? ''}]))};
}, CARD);
const openCard = async captain => {
  if (!await captain.page.locator(CARD).count()) await island(captain, i => i.pick('island_arsenal'));
  await captain.page.locator(CARD).waitFor({timeout: 10000});
  await captain.page.waitForFunction(card => /Stored: \d+ of 20/.test(document.querySelector(card)?.textContent ?? ''), CARD, {timeout: 10000, polling: 100});
};
// Waits (at most 2 s) until `captain`'s open card passes `test`; answers the ms it took (measured on if late).
async function cardFollows(captain, test, what, began) {
  const ok = async () => { const card = await cardOf(captain); return !!card && test(card); };
  while (Date.now() - began < LIMIT_MS && !await ok()) await captain.page.waitForTimeout(50);
  const took = Date.now() - began, passed = await ok();
  let late = '';
  if (!passed) {
    while (Date.now() - began < 15000 && !await ok()) await captain.page.waitForTimeout(100);
    late = await ok() ? ` (it arrived after ${Date.now() - began} ms)` : ' (not even after 15 s)';
  }
  assert.ok(passed && took <= LIMIT_MS + SLACK_MS, `${captain.name}'s card shows ${what} within 2 s (${took} ms)${late}: ${JSON.stringify(await cardOf(captain))}`);
  return took;
}
const row = (card, label) => card.rack.find(item => item.label === label);
const copyBy = (data, weapon, no = null) => data.copies.find(copy => copy.weapon === weapon && (no === null || copy.no === no));
const holders = data => Object.fromEntries(data.copies.filter(copy => copy.holder).map(copy => [`${copy.weapon}#${copy.no}`, copy.holder]));
async function shot(name, list = pages) {
  for (const captain of list) { await settle(captain.page); await captain.page.screenshot({path: `${out}/${name}-${captain.playerId}.png`}); }
}
async function scenario(id, name, fn) {
  const lines = [];
  log(`\n[${id}] ${name}`);
  try { await fn(line => { lines.push(line); log(`  ${line}`); }); results.push({id, name, ok: true, lines}); }
  catch (error) {
    lines.push(`FAILED: ${error.message.split('\n')[0]}`); log(`  FAILED: ${error.message}`); results.push({id, name, ok: false, lines});
    for (const captain of pages) await captain.page.screenshot({path: `${out}/failure-${id}-${captain.playerId}.png`}).catch(() => {});
  }
}
const waveOf = captain => captain.page.evaluate(() => { const w = window.__island.waves?.island.wave;
  return w ? {waveId: w.info.waveId, wave: w.info.wave, ships: w.state.ships.length, done: w.done, ticks: w.ticks} : null; });
async function until(captain, test, what, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const now = await waveOf(captain); if (test(now)) return now; await captain.page.waitForTimeout(250); }
  throw new Error(`${captain.name}: timed out waiting for ${what}: ${JSON.stringify(await waveOf(captain))}`);
}
// Fire this page's gun at the nearest ship (check-multiplayer.js musket): stand on the shore line towards it.
async function fire(captain) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const fired = await captain.page.evaluate(() => {
      const g = window.__island, wave = g.waves.island.wave, ships = wave?.state?.ships ?? [];
      if (!ships.length || wave.done) return false;
      const ship = ships.reduce((a, b) => (Math.hypot(a.x, a.z) < Math.hypot(b.x, b.z) ? a : b)), d = Math.hypot(ship.x, ship.z);
      const x = ship.x * 14 / d, z = ship.z * 14 / d; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z);
      return g.waves.island.shoot();
    });
    if (fired) return true;
    await captain.page.waitForTimeout(500);
  }
  return false;
}
const ARSENAL_WALK_UP = {x: -4.8, z: -9.2}; // capture-arsenal.js: in reach of the building's zone

let host = null, ben = null, off = null;
try {
  host = await openCaptain('Nils', 'me', {create: true});
  ben = await openCaptain('Ben', 'ben', {join: 'k7q2m'});
  assert.equal(await island(ben, i => i.visiting.ownerName), 'Nils');
  for (const captain of pages) {
    await captain.page.waitForFunction(() => document.querySelectorAll('.island-card-lobby[open] .island-lobby-player.is-online').length === 2, null, {timeout: 30000, polling: 250});
  }
  await host.page.locator('.island-card-lobby[open] .island-lobby-start').click();
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.island.ui.open !== 'lobby', null, {timeout: 15000, polling: 100});
  for (const captain of pages) await captain.page.waitForFunction(() => window.__island.island.roomPlace() === 'isle_k7q2m', null, {timeout: 5000});
  // Every type open for both (the unlock is the buyer's own best wave) and coins enough for 20+ copies.
  for (const captain of pages) await island(captain, async i => { i.dev.setWaveBest(10); i.dev.setCoins(5000); await i.load(); });
  await island(host, async i => { await i.build('cannon_1', 'cannon'); });
  for (const captain of pages) await closeCards(captain);

  await scenario('1', 'the arsenal building is on both maps and opens by walking up and pressing E', async note => {
    for (const captain of pages) {
      await captain.page.waitForFunction(() => { let seen = false; window.__island.scene.traverse(o => { if (o.name === 'island-arsenal' && o.visible) seen = true; }); return seen; }, null, {timeout: 30000, polling: 200});
      await stand(captain, {x: 6, z: 6});
      await captain.page.waitForTimeout(300);
      const far = await island(captain, i => i.label?.('island_arsenal') ?? null);
      await stand(captain, ARSENAL_WALK_UP);
      await captain.page.waitForTimeout(600);
      await captain.page.locator('canvas').first().focus().catch(() => {});
      const began = Date.now();
      await captain.page.keyboard.press('e');
      await captain.page.locator(CARD).waitFor({timeout: 10000});
      await openCard(captain);
      const card = await cardOf(captain);
      assert.equal(card.stock, 'Stored: 0 of 20', `${captain.name}'s card stock`);
      assert.equal(card.carry, 'Musket (standard issue)', `${captain.name} carries the musket`);
      assert.equal(await island(captain, i => i.captainLoadout().weapon), 'musket');
      note(`${captain.name}: mesh island-arsenal visible; label "${far}"; E at ${ARSENAL_WALK_UP.x},${ARSENAL_WALK_UP.z} opened the card in ${Date.now() - began} ms: "${card.stock}", carries "${card.carry}"`);
    }
    await shot('01-card-open');
  });

  await scenario('2', 'the host buys: paid once on a double click and a retry; into empty hands, then onto the rack', async note => {
    const before = await coinsOf(host);
    await openCard(host);
    await host.page.evaluate(card => { const b = document.querySelector(`${card} [data-focus="buy-pistols"]`); b.click(); b.click(); }, CARD);
    await host.page.waitForFunction(() => /^Pistols #\d+ bought/.test(window.__island.island.ui.toastText), null, {timeout: 10000, polling: 100});
    await host.page.waitForTimeout(500);
    let data = await state(host);
    assert.equal(data.copies.filter(copy => copy.weapon === 'pistols').length, 1, 'the double click made one copy');
    assert.equal(before - await coinsOf(host), PRICES.pistols, 'the double click paid once');
    const pistols = copyBy(data, 'pistols');
    assert.equal(pistols.holder, 'me', 'the first copy went into the host\'s empty hands');
    const card = await cardOf(host);
    assert.equal(card.carry, `Pistols #${pistols.no}`);
    note(`double click on Buy pistols: one copy #${pistols.no} in the host's hands, coins ${before} → ${await coinsOf(host)} (price ${PRICES.pistols}), toast "${await island(host, i => i.ui.toastText)}"`);
    // A client's retry: the same click id twice (the answer of the first was lost), then a fresh one would buy again.
    const mid = await coinsOf(host), uid = `retry${Date.now().toString(36)}`;
    const first = await raw(host, 'POST', '/api/island/arsenal/buy', {weapon: 'long_rifle', actionUid: uid});
    const again = await raw(host, 'POST', '/api/island/arsenal/buy', {weapon: 'long_rifle', actionUid: uid});
    assert.ok(first.ok && again.ok, `both answers ok: ${JSON.stringify([first.code, again.code])}`);
    data = await state(host);
    assert.equal(data.copies.filter(copy => copy.weapon === 'long_rifle').length, 1, 'the retry made one copy');
    assert.equal(mid - await coinsOf(host), PRICES.long_rifle, 'the retry paid once');
    const rifle = copyBy(data, 'long_rifle');
    assert.equal(rifle.holder, null, 'the second copy is stored (the host carries one)');
    assert.equal(data.stored, 1);
    await island(host, i => i.arsenal.refresh());
    await host.page.waitForFunction(card => /Stored: 1 of 20/.test(document.querySelector(card)?.textContent ?? ''), CARD, {timeout: 5000});
    note(`retry with click id ${uid} twice: one Long rifle #${rifle.no} on the rack, coins ${mid} → ${await coinsOf(host)}; "${(await cardOf(host)).stock}"`);
    await shot('02-bought');
  });

  await scenario('3', 'the member takes the stored copy; both cards show who carries what', async note => {
    await openCard(ben);
    await island(ben, i => i.arsenal.refresh());
    await ben.page.waitForFunction(card => /Stored: 1 of 20/.test(document.querySelector(card)?.textContent ?? ''), CARD, {timeout: 5000});
    const before = await state(ben), rifle = copyBy(before, 'long_rifle'), pistols = copyBy(before, 'pistols');
    const label = `Long rifle #${rifle.no}`, benCoins = await coinsOf(ben);
    const ready = await cardOf(ben);
    assert.equal(row(ready, label).button, 'Take', `the member's card offers Take: ${JSON.stringify(row(ready, label))}`);
    await ben.page.locator(`${CARD} .island-arsenal-copy[data-copy="${rifle.id}"] .kit-button`).click();
    await ben.page.waitForFunction(() => /^You carry Long rifle/.test(window.__island.island.ui.toastText), null, {timeout: 10000, polling: 100});
    const took = Date.now();
    const benCard = await cardOf(ben);
    assert.equal(benCard.carry, label, 'the member carries it');
    assert.equal(row(benCard, label).holder, 'You carry it');
    assert.equal(row(benCard, `Pistols #${pistols.no}`).holder, 'Carried by Nils');
    assert.equal(await coinsOf(ben), benCoins, 'taking costs nothing');
    const ms = await cardFollows(host, card => row(card, label)?.holder === 'Carried by Ben' && card.stock === 'Stored: 0 of 20', `${label} carried by Ben`, took);
    const hostCard = await cardOf(host);
    assert.equal(row(hostCard, `Pistols #${pistols.no}`).holder, 'You carry it');
    assert.deepEqual(holders(await state(host)), {[`pistols#${pistols.no}`]: 'me', [`long_rifle#${rifle.no}`]: 'ben'});
    assert.equal(await island(ben, i => i.captainLoadout().weapon), 'long_rifle');
    note(`Ben took ${label}: his card "${benCard.carry}" / rack ${JSON.stringify(benCard.rack.map(item => `${item.label}: ${item.holder}`))}`);
    note(`the host's card followed after ${ms} ms: ${JSON.stringify(hostCard.rack.map(item => `${item.label}: ${item.holder}`))}, "${hostCard.stock}"`);
    await shot('03-taken');
  });

  await scenario('4', 'swap: the member trades his copy for a stored one in one step', async note => {
    const mid = await coinsOf(host);
    await host.page.locator(`${CARD} [data-focus="buy-fire_bombs"]`).click();
    await host.page.waitForFunction(() => /^Fire bombs #\d+ bought and stored/.test(window.__island.island.ui.toastText), null, {timeout: 10000, polling: 100});
    assert.equal(mid - await coinsOf(host), PRICES.fire_bombs);
    const data = await state(ben), bombs = copyBy(data, 'fire_bombs'), rifle = copyBy(data, 'long_rifle');
    await ben.page.waitForFunction(([card, id]) => !!document.querySelector(`${card} .island-arsenal-copy[data-copy="${id}"] .kit-button`), [CARD, bombs.id], {timeout: 5000, polling: 100});
    const offer = row(await cardOf(ben), `Fire bombs #${bombs.no}`);
    assert.equal(offer.button, 'Swap', `the member is offered Swap: ${JSON.stringify(offer)}`);
    await ben.page.locator(`${CARD} .island-arsenal-copy[data-copy="${bombs.id}"] .kit-button`).click();
    await ben.page.waitForFunction(() => /^Swapped: you carry Fire bombs/.test(window.__island.island.ui.toastText), null, {timeout: 10000, polling: 100});
    const after = await state(ben);
    assert.equal(after.mine, bombs.id, 'he carries the fire bombs');
    assert.equal(copyBy(after, 'long_rifle').holder, null, 'his long rifle is back on the rack');
    assert.equal(after.stored, 1);
    assert.equal(await island(ben, i => i.captainLoadout().weapon), 'fire_bombs');
    note(`host bought Fire bombs #${bombs.no} onto the rack (coins ${mid} → ${await coinsOf(host)}); Ben swapped: carries #${bombs.no}, Long rifle #${rifle.no} stored; toast "${await island(ben, i => i.ui.toastText)}"`);
  });

  await scenario('5', 'one copy, two captains at once: one gets it, the other is refused taken', async note => {
    const data = await state(host), rifle = copyBy(data, 'long_rifle');
    for (const captain of pages) {
      await island(captain, i => i.arsenal.refresh());
      await captain.page.waitForFunction(([card, id]) => { const b = document.querySelector(`${card} .island-arsenal-copy[data-copy="${id}"] .kit-button`); return b && !b.disabled; }, [CARD, rifle.id], {timeout: 5000, polling: 100});
    }
    await Promise.all(pages.map(captain => captain.page.evaluate(([card, id]) => document.querySelector(`${card} .island-arsenal-copy[data-copy="${id}"] .kit-button`).click(), [CARD, rifle.id])));
    await Promise.all(pages.map(captain => captain.page.waitForFunction(card => { const root = document.querySelector(card);
      return root && !root.textContent.includes('Taking…') && (/Swapped: you carry Long rifle/.test(window.__island.island.ui.toastText) || /Another captain took that weapon/.test(root.querySelector('.island-message')?.textContent ?? '')); }, CARD, {timeout: 10000, polling: 100})));
    for (const captain of pages) await captain.page.waitForTimeout(600); // the loser's refresh after the refusal has answered
    const after = await state(host), winner = after.copies.find(copy => copy.id === rifle.id).holder;
    assert.ok(winner === 'me' || winner === 'ben', `one captain carries the rifle (${winner})`);
    const loser = winner === 'me' ? ben : host, won = winner === 'me' ? host : ben;
    const loserCard = await cardOf(loser);
    assert.equal(loserCard.message, 'Another captain took that weapon just now.', `${loser.name}'s card says why`);
    const counts = {};
    for (const copy of after.copies) if (copy.holder) counts[copy.holder] = (counts[copy.holder] ?? 0) + 1;
    assert.deepEqual(counts, {me: 1, ben: 1}, 'each captain carries exactly one copy');
    const retry = await raw(loser, 'POST', '/api/island/arsenal/take', withCode(loser, {copy: rifle.id, actionUid: `race${Date.now().toString(36)}`}));
    assert.deepEqual({ok: retry.ok, status: retry.status, code: retry.code}, {ok: false, status: 409, code: 'taken'}, 'the server refuses the loser taken');
    note(`both pressed Swap on Long rifle #${rifle.no} at once: ${won.name} carries it; ${loser.name}'s card "${loserCard.message}"; his API take → ${retry.status} ${retry.code}`);
    note(`holders now ${JSON.stringify(holders(after))}`);
    // Back to the plan for the wave: the host carries the long rifle, the member the fire bombs.
    if (winner === 'ben') {
      const bombs = copyBy(after, 'fire_bombs');
      const a = await raw(ben, 'POST', '/api/island/arsenal/take', withCode(ben, {copy: bombs.id, actionUid: `back${Date.now().toString(36)}`}));
      const b = await raw(host, 'POST', '/api/island/arsenal/take', {copy: rifle.id, actionUid: `back2${Date.now().toString(36)}`});
      assert.ok(a.ok && b.ok, `set back: ${JSON.stringify([a.code, b.code])}`);
    }
    const plan = await state(host);
    assert.equal(plan.copies.find(copy => copy.holder === 'me').weapon, 'long_rifle');
    assert.equal(plan.copies.find(copy => copy.holder === 'ben').weapon, 'fire_bombs');
    for (const captain of pages) await island(captain, i => i.arsenal.refresh());
    await shot('05-race');
  });

  await scenario('6', 'a full rack: the return is refused and the copy stays in hand; buying into full hands is refused uncharged', async note => {
    let data = await state(host);
    let bought = 0;
    while (data.stored < 20) {
      const answer = await raw(host, 'POST', '/api/island/arsenal/buy', {weapon: 'pistols', actionUid: `fill${bought}${Date.now().toString(36)}`});
      assert.ok(answer.ok, `fill buy ${bought}: ${JSON.stringify(answer)}`);
      bought++; data = answer.data;
    }
    assert.equal(data.stored, 20);
    note(`the host bought ${bought} more pistols: "Stored: ${data.stored} of ${data.capacity}"`);
    await island(ben, i => i.arsenal.refresh());
    await ben.page.waitForFunction(card => /Stored: 20 of 20 · Full/.test(document.querySelector(card)?.textContent ?? ''), CARD, {timeout: 5000, polling: 100});
    const card = await cardOf(ben);
    assert.equal(card.back?.disabled, true, `the member's Return is off: ${JSON.stringify(card.back)}`);
    assert.ok(card.reasons.includes('The rack is full (20 of 20): swap instead, or wait for a free slot.'), `the reason: ${JSON.stringify(card.reasons)}`);
    const before = await state(ben);
    const answer = await raw(ben, 'POST', '/api/island/arsenal/return', withCode(ben, {actionUid: `full${Date.now().toString(36)}`}));
    assert.deepEqual({ok: answer.ok, status: answer.status, code: answer.code}, {ok: false, status: 409, code: 'arsenal_full'}, 'the server refuses the return');
    const after = await state(ben);
    assert.equal(after.mine, before.mine, 'the copy stays in his hands');
    assert.equal(after.stored, 20);
    assert.equal(await island(ben, i => i.captainLoadout().weapon), 'fire_bombs');
    // Through the card's handler too (a stale card that still showed Return on).
    await ben.page.evaluate(() => window.__island.island.arsenal.handlers.giveBack());
    await ben.page.waitForFunction(card => /The arsenal is full/.test(document.querySelector(card)?.querySelector('.island-message')?.textContent ?? ''), CARD, {timeout: 5000, polling: 100});
    await ben.page.waitForTimeout(600); // the refusal's own refresh of the arsenal has answered
    assert.equal((await cardOf(ben)).message, 'The arsenal is full: 20 weapons are stored already.', 'the card keeps saying why the return was refused');
    assert.equal((await state(ben)).mine, before.mine);
    const coins = await coinsOf(host);
    const full = await raw(host, 'POST', '/api/island/arsenal/buy', {weapon: 'pistols', actionUid: `over${Date.now().toString(36)}`});
    assert.deepEqual({ok: full.ok, code: full.code}, {ok: false, code: 'arsenal_full'}, 'a buy into full hands on a full rack');
    assert.equal(await coinsOf(host), coins, 'the refused buy cost nothing');
    await island(host, i => i.arsenal.refresh());
    const hostCard = await cardOf(host);
    assert.equal(hostCard.buys.pistols.disabled, true, 'the host\'s Buy is off on a full rack with full hands');
    assert.equal(hostCard.buys.pistols.reason, 'The arsenal is full: return or swap a weapon first.');
    note(`Ben: Return off ("${card.reasons.find(text => /rack is full/.test(text))}"), API return → ${answer.status} ${answer.code} "${answer.message}", still carries ${copyBy(after, 'fire_bombs').weapon} #${copyBy(after, 'fire_bombs').no}; card handler → "${(await cardOf(ben)).message}"`);
    note(`host buy on a full rack with full hands → ${full.code}, coins ${coins} → ${await coinsOf(host)}; host's Buy pistols reason "${hostCard?.buys?.pistols?.reason ?? ''}"`);
    await shot('06-full');
  });

  await scenario('7', 'the old Captain Weapons tab is gone and the old weapon buy answers 409 use_arsenal', async note => {
    for (const captain of pages) {
      await closeCards(captain);
      const tabs = await island(captain, async i => { i.openCaptain(); await new Promise(resolve => setTimeout(resolve, 80));
        return [...document.querySelectorAll('.island-card[open] .kit-tab')].map(item => item.textContent); });
      assert.ok(!tabs.some(tab => /Weapons/.test(tab)), `${captain.name}'s Captain card has no Weapons tab: ${JSON.stringify(tabs)}`);
      note(`${captain.name}'s Captain card tabs: ${JSON.stringify(tabs)}`);
      await closeCards(captain);
    }
    const coins = await coinsOf(host);
    const answer = await raw(host, 'POST', '/api/island/weapon/buy', {weapon: 'blunderbuss', actionUid: `old${Date.now().toString(36)}`});
    assert.deepEqual({ok: answer.ok, status: answer.status, code: answer.code}, {ok: false, status: 409, code: 'use_arsenal'}, 'the old buy');
    // The client has no weapon-shop call any more (D042); the server's old route still refuses.
    assert.equal(await coinsOf(host), coins, 'nothing paid');
    assert.equal(await island(host, i => i.captainLoadout().weapon), 'long_rifle', 'the loadout is still the carried copy');
    note(`POST /api/island/weapon/buy → ${answer.status} ${answer.code} "${answer.message}"; coins ${coins} → ${await coinsOf(host)}; loadout still long_rifle`);
  });

  await scenario('8', 'in a wave every move is refused wave_running; both sims fire each captain\'s carried weapon', async note => {
    for (const captain of pages) await closeCards(captain);
    await island(host, async i => { i.dev.setWaveBest(2); await i.load(); }); // wave 3: ships come soon
    const before = await state(host), coins = await coinsOf(host);
    const rung = await island(host, async i => { const a = await i.ringBell(); return {ok: a.ok, code: a.code ?? null}; });
    assert.ok(rung.ok, `the host rang the bell: ${JSON.stringify(rung)}`);
    const first = await until(host, now => now?.ships > 0, 'the first ships', 90000);
    await until(ben, now => now?.waveId === first.waveId && now.ticks > 0, 'the member in the same wave', 30000);
    // The loadout each controller fights with.
    const loadout = {};
    for (const captain of pages) loadout[captain.name] = await captain.page.evaluate(() => ({id: window.__island.waves.island.playerId, weapon: window.__island.waves.island.captainStats.weapon}));
    assert.deepEqual([loadout.Nils.weapon, loadout.Ben.weapon], ['long_rifle', 'fire_bombs'], `the controllers' loadout: ${JSON.stringify(loadout)}`);
    // Moves in the wave: the cards are off with the reason, and the server refuses each.
    const rifle = before.copies.find(copy => copy.holder === 'me'), stored = before.copies.find(copy => copy.holder === null);
    const tries = {
      buy: await raw(host, 'POST', '/api/island/arsenal/buy', {weapon: 'pistols', actionUid: `w1${Date.now().toString(36)}`}),
      take: await raw(ben, 'POST', '/api/island/arsenal/take', withCode(ben, {copy: stored.id, actionUid: `w2${Date.now().toString(36)}`})),
      swap: await raw(host, 'POST', '/api/island/arsenal/take', {copy: stored.id, actionUid: `w3${Date.now().toString(36)}`}),
      return: await raw(ben, 'POST', '/api/island/arsenal/return', withCode(ben, {actionUid: `w4${Date.now().toString(36)}`})),
    };
    for (const [move, answer] of Object.entries(tries)) {
      assert.deepEqual({ok: answer.ok, status: answer.status, code: answer.code}, {ok: false, status: 409, code: 'wave_running'}, `${move} in the wave`);
    }
    note(`wave ${first.wave} (${first.waveId}): buy/take/swap/return → ${Object.entries(tries).map(([k, v]) => `${k} ${v.status} ${v.code}`).join(', ')} "${tries.buy.message}"`);
    await openCard(host);
    const inWave = await cardOf(host);
    const enabled = [...Object.entries(inWave.buys).filter(([, item]) => !item.disabled).map(([id]) => `buy-${id}`), ...inWave.rack.filter(item => item.button && !item.disabled).map(item => item.label), ...(inWave.back && !inWave.back.disabled ? ['return'] : [])];
    assert.deepEqual(enabled, [], 'no move is on in the wave');
    assert.ok(Object.values(inWave.buys).every(item => item.reason === 'A wave is under way. Use the arsenal between waves.' || /^Opens after/.test(item.reason)), `the buy reasons: ${JSON.stringify(inWave.buys)}`);
    note(`host's card in the wave: every button off; reason "${inWave.buys.pistols.reason}"`);
    await closeCards(host);
    const after = await state(host);
    assert.deepEqual(holders(after), holders(before), 'nothing moved');
    assert.equal(await coinsOf(host), coins, 'nothing paid');
    // Both captains fire; each page's sim fires each captain's carried weapon.
    const hostFired = await fire(host), benFired = await fire(ben);
    assert.ok(hostFired && benFired, `both captains could fire (${hostFired}, ${benFired})`);
    const ids = {[loadout.Nils.id]: 'long_rifle', [loadout.Ben.id]: 'fire_bombs'};
    const seen = {};
    for (const captain of pages) {
      await captain.page.waitForFunction(ids => Object.keys(ids).every(id => window.__ars.fired.some(item => item.by === id)), ids, {timeout: 15000, polling: 200})
        .catch(() => {});
      const fired = await captain.page.evaluate(() => window.__ars.fired);
      seen[captain.name] = Object.fromEntries(Object.keys(ids).map(id => [id, [...new Set(fired.filter(item => item.by === id).map(item => item.weapon))]]));
    }
    note(`captain_fired weapons seen by each page's sim: ${JSON.stringify(seen)} (expected ${JSON.stringify(ids)})`);
    for (const captain of pages) {
      for (const [id, weapon] of Object.entries(ids)) assert.deepEqual(seen[captain.name][id], [weapon], `${captain.name}'s sim: ${id} fires the ${weapon}`);
    }
    await shot('08-wave');
    for (const captain of pages) await until(captain, now => !now || now.done, 'the end of the wave', 400000);
    note(`the wave ended on both pages`);
  });

  await scenario('9', 'a reload keeps the carried copy', async note => {
    const before = await state(host);
    for (const captain of pages) {
      await captain.page.reload();
      await enter(captain);
      await closeCards(captain);
      await captain.page.waitForFunction(() => { let seen = false; window.__island.scene.traverse(o => { if (o.name === 'island-arsenal' && o.visible) seen = true; }); return seen; }, null, {timeout: 30000, polling: 200});
      await island(captain, i => i.arsenal.refresh());
      await openCard(captain);
      const card = await cardOf(captain), weapon = await island(captain, i => i.captainLoadout().weapon);
      const expected = captain.playerId === 'me' ? 'long_rifle' : 'fire_bombs', copy = before.copies.find(item => item.holder === captain.playerId);
      assert.equal(weapon, expected, `${captain.name}'s loadout after a reload`);
      assert.match(card.carry, new RegExp(`#${copy.no}$`), `${captain.name}'s card after a reload`);
      note(`${captain.name} after a reload: carries "${card.carry}", loadout ${weapon}, "${card.stock}"`);
    }
    assert.deepEqual(holders(await state(host)), holders(before), 'the reloads moved nothing');
    await shot('09-reload');
  });

  await scenario('F', 'flag off: no arsenal building, the old weapon shop works as before', async note => {
    const offContext = await env.page.context().browser().newContext({viewport: {width: 960, height: 600}});
    const list = [];
    off = await openCaptain('Ola', 'me', {create: true}, {flags: '', ctx: offContext, list});
    await off.page.waitForFunction(() => !!document.querySelector('.island-card-lobby[open]') || window.__island.island.ui.open !== 'lobby', null, {timeout: 15000});
    if (await off.page.locator('.island-card-lobby[open] .island-lobby-start').count()) await off.page.locator('.island-card-lobby[open] .island-lobby-start').click();
    await closeCards(off);
    await island(off, async i => { i.dev.setWaveBest(10); i.dev.setCoins(1000); await i.load(); });
    await off.page.waitForTimeout(1500);
    const mesh = await off.page.evaluate(() => { let n = 0; window.__island.scene.traverse(o => { if (o.name === 'island-arsenal') n++; }); return n; });
    assert.equal(mesh, 0, 'no arsenal mesh on the map');
    await stand(off, ARSENAL_WALK_UP); await off.page.waitForTimeout(600);
    await off.page.keyboard.press('e'); await off.page.waitForTimeout(800);
    await island(off, i => i.pick('island_arsenal')); await off.page.waitForTimeout(300);
    assert.equal(await off.page.locator('.island-card-arsenal').count(), 0, 'E and a tap open no arsenal card');
    await closeCards(off);
    const tabs = await island(off, async i => { i.openCaptain('weapons'); await new Promise(resolve => setTimeout(resolve, 80));
      return [...document.querySelectorAll('.island-card[open] .kit-tab')].map(item => item.textContent); });
    assert.ok(tabs.includes('Weapons'), `the Weapons tab is there: ${JSON.stringify(tabs)}`);
    const coins = await coinsOf(off);
    await off.page.locator('.island-card[open] [data-focus="weapon-pistols"]').click();
    await off.page.waitForFunction(() => /^Pistols bought and equipped/.test(window.__island.island.ui.toastText), null, {timeout: 10000, polling: 100});
    assert.equal(coins - await coinsOf(off), PRICES.pistols, 'the old shop charged the price once');
    assert.equal(await island(off, i => i.captainLoadout().weapon), 'pistols', 'the bought weapon is equipped');
    assert.equal(await island(off, i => i.arsenal.weapon()), null, 'the arsenal controller says nothing while the flag is off');
    note(`flag off: ${mesh} arsenal meshes, E/tap opened no card, tabs ${JSON.stringify(tabs)}, old buy pistols: coins ${coins} → ${await coinsOf(off)}, loadout ${await island(off, i => i.captainLoadout().weapon)}, toast "${await island(off, i => i.ui.toastText)}"`);
    await shot('F-flag-off', list);
    await offContext.close();
  });

  const audio = env.errors.filter(text => /AudioContext|audio device/i.test(text));
  const errors = env.errors.filter(text => !/Failed to load resource/.test(text) && !audio.includes(text));
  results.push({id: 'E', name: 'no browser errors', ok: errors.length === 0, lines: errors.slice(0, 5)});
} catch (error) {
  log('\nSTOPPED:', error.message);
  for (const captain of pages) await captain.page.screenshot({path: `${out}/failure-${captain.playerId}.png`}).catch(() => {});
  log('errors:', env.errors);
  results.push({id: 'X', name: 'set-up', ok: false, lines: [error.message.split('\n')[0]]});
} finally { await env.close(); }

log('\nRESULTS');
for (const item of results) { log(`  ${item.ok ? 'PASS' : 'FAIL'}  [${item.id}] ${item.name}`); for (const line of item.lines) log(`          ${line}`); }
const failed = results.filter(entry => !entry.ok);
log(`\ncheck-arsenal-mp: ${failed.length ? `FAILED (${failed.map(item => item.id).join(', ')})` : 'OK'}, screenshots in ${out}`);
process.exitCode = failed.length ? 1 : 0;
