// Release check for the flag `defenses_v2` (T43, the culverin; decision D048, specs/T43-new-defenses.md "Integration
// as built") with two captains on one island, before the flag goes on in production. Headless Chrome, one browser
// context, the fake server shared by both tabs (?islands=fake&fakeworld=…, fake-api.js) with the flag on
// (&fakeflags=defenses_v2: the culverin's kinds, prices and unlocks, and rules ["defenses_v2"] on its waves) and the
// BroadcastChannel room, as check-arsenal-mp.js and check-placement-mp.js. The host (Nils) creates a game, the member
// (Ben) joins it with the code. The scenarios, each reported PASS or FAIL with what was measured:
//   1 card      an empty tower spot's build card offers the Culverin (its name, line and price), locked "Opens after
//               wave 15." while the island's best won wave is 14 (the server refuses it `locked`, nothing paid), open
//               at 15 on both pages; never on a wall, house or watchtower spot (422 wrong_kind) nor at Pirate Point
//               (the card offers a cannon or a mortar, the server answers 422 wrong_kind)
//   2 build     the host builds one from the card with a double click: one culverin, paid once (🪙 80); a second one
//               by the API with the same click id twice (a client's retry): paid once; the member's island answer and
//               map draw both (island-culverin:<spot>, level 1) within 2 s (check-multiplayer's bound)
//   3 upgrade   level 2 (host, 🪙 160) and level 3 (the member pays, 🪙 320) from the card; level 4 waits for wave 20
//               (the card says so, the server refuses `locked`); the other page's map draws each level within 2 s
//   4 wave      a wave 20 (gunboats, and the siege barge when the wave's event is one) with two culverins and a
//               cannon: both pages fight with the same culverins (the wave's rules say defensesV2), and both sims
//               agree tick for tick: the same culverin_fired and ship_hit events (time, tower, target, damage, hp) and
//               the same ships' hp at every tick both pages stepped; on each page every culverin shot is at a ship
//               (never a boarder) at least 12 (the minimum range) from the gun; both pages draw each culverin's
//               idle and firing frame of its level and its shot (the atlas frame of the drawn instance)
//   5 levels    after the wave: level 4 after wave 20 and level 5 after wave 30, then "Highest level reached."; the
//               other page's map follows (until the wave's result the wave renderer's post stands in for the tower)
//   6 demolish  Tear down the level-1 culverin from the card: half of 🪙 80 back to its payer, the spot empty on both
//               pages' answers and maps, and the card offers the four tower kinds again
//   H harness   the real sim and renderer in a page, without the game: culverins on all seven tower spots, waves 16,
//               20 (siege barge) and 30, six seeds each, with the rule tower_health as well: a same-seed replay is
//               identical, no shot at a boarder or a ship closer than 12 (while ships come that close), a culverin's
//               hp is 70% of a same-level cannon's (56 at level 1), and the renderer (atlas with towerStates and
//               culverins) draws idle, firing, damaged and broken frames from the sim's own states
//   T health    a separate context with &fakeflags=defenses_v2,tower_health: the wave carries both rules, the culverin
//               fights with 56 hp at level 1 (a cannon 80) and fires
//   F flag off  a separate context without the flag: no culverin on the card, in the island answer (spots, prices,
//               unlocks) or the wave's rules; a culverin build is refused 422 wrong_kind uncharged; a cannon and a
//               harpoon tower build, draw and fight as before (towers with their level's range, no culverin events)
//   E           no browser errors
// Timing-only failures (a 2 s bound) are reported with the time the change did arrive. Exit code 1 when any
// scenario fails.
//   node scripts/check-culverin-mp.js [folder]        (npm run test:culverin; default: a fresh folder under the OS tmp)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorldBrowser, settle} from './world-browser-tools.js';
import {stubOfflineApi} from './api-browser-fixture.js';
import {stubWeather} from './weather-browser-fixture.js';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = process.argv[2] ?? join(tmpdir(), 'tgpt-culverin', stamp);
await mkdir(out, {recursive: true});
const WORLD = `cul${Date.now().toString(36)}`;
const CODE = 'ISLE-K7Q2M';
const CARD = '.island-card[open]';
// check-multiplayer.js: a change on one page reaches the other page within 2 s (200 ms for the reading).
const LIMIT_MS = 2000, SLACK_MS = 200;
// specs/T43-new-defenses.md: prices, unlock waves, the card line, the minimum range.
const PRICE = [80, 160, 320, 640, 1280];
const LINE = 'A long gun: hits far ships hard but slowly. Hunts gunboats and siege barges first.';
const MIN_RANGE = 12;
const GUN = 'cannon_1', GUN2 = 'cannon_2', CANNON = 'cannon_3';
const env = await openWorldBrowser({hmr: false}), context = env.page.context();
const pages = [];
const log = (...args) => console.log(...args);
const results = []; // {id, name, ok, lines}

// The front door's cards until the player stands on the island (check-arsenal-mp.js enter).
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
  await page.evaluate(() => { window.__island.settings.hour = 12; });
  // A second fake transport in the page, on the same shared world and as the same player: raw calls with chosen
  // click ids (a client's retry), without the card in between (check-arsenal-mp.js).
  await page.addScriptTag({type: 'module', content: "import('/src/pirates/fake-api.js').then(m => { window.__raw = m.createFakeIslandTransport(); });"});
  await page.waitForFunction(() => !!window.__raw, null, {timeout: 15000});
}
async function openCaptain(name, playerId, options, {flags = 'defenses_v2', ctx = context, list = pages} = {}) {
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
const withCode = (captain, body) => (codeOf(captain) ? {...body, code: codeOf(captain)} : body);
const raw = (captain, method, path, body = null) => captain.page.evaluate(async ([method, path, body]) => {
  const answer = method === 'GET' ? await window.__raw.get(path) : await window.__raw.post(path, body);
  return answer.ok ? {ok: true, status: answer.status, data: answer.data} : {ok: false, status: answer.status, code: answer.code, message: answer.message};
}, [method, path, body]);
const coinsOf = captain => island(captain, i => i.dev.read().coins);
const closeCards = async captain => { for (let i = 0; i < 4 && await captain.page.locator('dialog[open]').count(); i++) { await captain.page.keyboard.press('Escape'); await captain.page.waitForTimeout(200); } };
// The island the page shows: the host's own answer, the member's visit.
const answerOf = captain => island(captain, i => { const t = i.visiting?.spots ? i.visiting : i.island; return JSON.parse(JSON.stringify(t)); });
const spotOf = async (captain, spot) => (await answerOf(captain)).spots.find(item => item.id === spot);
// The building the map draws on a spot (world.js: island-<kind>:<spot>, userData.level and .art), or null. Between a
// wave's end and its result the wave's renderer still stands in for the island's towers (controller.js setDefenses
// gives its posts the new levels): then its post on the spot, the frame read from the atlas (arm() below).
const drawnOf = (captain, spot) => captain.page.evaluate(spot => {
  let seen = null;
  window.__island.scene.traverse(o => {
    const m = /^island-(wall|cannon|mortar|harpoon|culverin|watchtower|house):(.+)$/.exec(o.name);
    if (m && m[2] === spot && o.visible && o.userData.level !== undefined) seen = {kind: m[1], level: o.userData.level, art: o.userData.art};
  });
  const w = window.__island.waves?.island.wave, root = w?.renderer?.root;
  if (!seen && w && !w.finished && root?.visible !== false && window.__culFrame) {
    const mesh = root.children.find(item => item.name === `pirates:defense:${spot}`);
    if (mesh?.visible && mesh.geometry.instanceCount > 0) {
      const art = window.__culFrame(mesh), m = /^island-([a-z]+)/.exec(art ?? '');
      seen = {kind: m?.[1] ?? null, level: w.renderer.levels()[spot], art, by: 'wave renderer'};
    }
  }
  return seen;
}, spot);
// The open build card: its title, choices, upgrade line, button, reasons.
const cardOf = captain => captain.page.evaluate(card => {
  const root = document.querySelector(card);
  if (!root) return null;
  return {title: root.querySelector('h2,.island-card-title,header')?.textContent?.trim() ?? '',
    choices: [...root.querySelectorAll('.island-choice')].map(item => ({kind: item.dataset.kind, name: item.querySelector('strong')?.textContent ?? '',
      price: item.querySelector('.island-choice-price')?.textContent ?? '', line: item.querySelector('.island-choice-line')?.textContent ?? '',
      reason: item.querySelector('.island-choice-reason')?.textContent ?? '', disabled: item.disabled})),
    next: root.querySelector('.island-next-label')?.textContent ?? null, upgrade: (() => { const b = root.querySelector('[data-focus="upgrade"]'); return b ? {label: b.textContent, disabled: b.disabled} : null; })(),
    teardown: (() => { const b = root.querySelector('[data-focus="demolish"]'); return b ? {label: b.textContent, disabled: b.disabled} : null; })(),
    text: root.textContent};
}, CARD);
const openCard = async (captain, spot) => {
  await closeCards(captain);
  await island(captain, (i, spot) => i.pick(spot), spot);
  await captain.page.locator(CARD).waitFor({timeout: 10000});
  await captain.page.waitForTimeout(150);
  return cardOf(captain);
};
// Waits (at most 2 s) until `captain`'s map and answer pass `test`; answers the ms it took (measured on if late).
async function follows(captain, spot, test, what, began) {
  const ok = async () => test(await drawnOf(captain, spot), await spotOf(captain, spot));
  while (Date.now() - began < LIMIT_MS && !await ok()) await captain.page.waitForTimeout(50);
  const took = Date.now() - began, passed = await ok();
  let late = '';
  if (!passed) {
    // What the page showed at the bound: its answer's level, the drawn building, whether the island is in battle.
    const atLimit = {drawn: await drawnOf(captain, spot), level: (await spotOf(captain, spot))?.level ?? null,
      wave: await captain.page.evaluate(() => { const w = window.__island.waves?.island.wave; return w ? {done: w.done, finished: w.finished, shown: w.shown} : null; })};
    while (Date.now() - began < 15000 && !await ok()) await captain.page.waitForTimeout(100);
    late = `${await ok() ? ` (it arrived after ${Date.now() - began} ms)` : ' (not even after 15 s)'}; at 2 s: ${JSON.stringify(atLimit)}`;
  }
  assert.ok(passed && took <= LIMIT_MS + SLACK_MS, `${captain.name}'s map shows ${what} within 2 s (${took} ms)${late}: ${JSON.stringify({drawn: await drawnOf(captain, spot), spot: await spotOf(captain, spot)})}`);
  return took;
}
const drawnIs = (kind, level, art) => (drawn, spot) => drawn?.kind === kind && drawn.level === level && drawn.art === art && spot?.kind === kind && spot.level === level && spot.built === true;
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
  return w ? {waveId: w.info.waveId, wave: w.info.wave, ships: w.state?.ships?.length ?? 0, done: w.done, ticks: w.ticks} : null; });
async function until(captain, test, what, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const now = await waveOf(captain); if (test(now)) return now; await captain.page.waitForTimeout(250); }
  throw new Error(`${captain.name}: timed out waiting for ${what}: ${JSON.stringify(await waveOf(captain))}`);
}
// Builds by the card: open the spot's card and click its Culverin choice (twice when `double`).
async function buildFromCard(captain, spot, {double = false} = {}) {
  await openCard(captain, spot);
  await captain.page.evaluate(([card, double]) => { const b = document.querySelector(`${card} [data-focus="choice-culverin"]`); b.click(); if (double) b.click(); }, [CARD, double]);
  await captain.page.waitForFunction(() => /^Culverin built/.test(window.__island.island.ui.toastText), null, {timeout: 10000, polling: 50});
  return Date.now();
}
async function upgradeFromCard(captain, spot, level) {
  const card = await openCard(captain, spot);
  assert.equal(card.next, `Level ${level} · 🪙 ${PRICE[level - 1].toLocaleString('en-US')}`, `${captain.name}'s card offers level ${level}: ${JSON.stringify(card)}`);
  assert.deepEqual(card.upgrade, {label: 'Upgrade', disabled: false});
  await captain.page.evaluate(card => { const b = document.querySelector(`${card} [data-focus="upgrade"]`); b.click(); b.click(); }, CARD);
  await captain.page.waitForFunction(level => new RegExp(`^Culverin is now level ${level}`).test(window.__island.island.ui.toastText), level, {timeout: 10000, polling: 50});
  return Date.now();
}

// In the page: records the wave's culverin and ship events from the bus, wraps the running sim's step to check each
// culverin shot against the state of the tick it was fired in and to keep the ships' hp per tick, and samples the
// frame each culverin post is drawn with (the atlas rect of its first instance) and whether the shot is drawn.
async function arm(captain) {
  await captain.page.evaluate(async () => {
    const g = window.__island;
    const {cartoonAtlas} = await import('/src/art/textures.js');
    const R = await import('/src/pirates/render.js');
    // The ids of loadAtlas({culverins: true}) without tower states (the fake's waves carry no tower_health), in its
    // order: the logical packing (and so every rect's uv) does not depend on quality or colour.
    const ids = [...new Set([...R.ATLAS_IDS.filter(id => !R.PIXEL_ONLY_IDS.includes(id)), ...R.CARTOON_EXTRA_IDS, ...R.TIER_IDS, ...R.FIRE_LEVEL_IDS,
      ...R.HARPOON_IDS, ...R.GUNBOAT_IDS, ...R.CULVERIN_IDS])];
    const atlas = await cartoonAtlas(ids, {quality: 'low', extra: [['white', 8, 8]]});
    const W = atlas.image.width / atlas.density, H = atlas.image.height / atlas.density;
    const uv = Object.entries(atlas.rects).map(([id, r]) => [id, (r.x + .01) / W, 1 - (r.y + r.h - .01) / H]);
    const rectAt = (u0, v0) => { let best = null, gap = Infinity;
      for (const [id, u, v] of uv) { const d = Math.abs(u - u0) + Math.abs(v - v0); if (d < gap) { gap = d; best = id; } }
      return gap < 1 / W ? best : `?${gap}`; };
    window.__culFrame = mesh => { const a = mesh.geometry.getAttribute('iUv').array; return rectAt(Math.min(a[0], a[2]), a[1]); };
    const rec = window.__cul = {events: [], hits: [], ticks: {}, checks: [], violations: [], patched: null, frames: {}, shotDrawn: 0, held: 0, boardersIgnored: 0, minD: Infinity};
    g.on('culverin_fired', e => rec.events.push(JSON.stringify([e.t, e.towerId, e.targetId, e.damage, e.level, e.toX, e.toZ, e.impactAt])));
    g.on('ship_hit', e => rec.hits.push(JSON.stringify([e.t, e.shipId, e.kind, e.by, e.damage, e.hp, e.culverin === true])));
    const MIN = 12;
    const patch = () => {
      const w = g.waves?.island.wave;
      if (w && !w.done && w.sim && !w.sim.__culverin) {
        const sim = w.sim, step = sim.step.bind(sim);
        sim.__culverin = true; rec.patched ??= {waveId: w.info.waveId, at: sim.state().time, rules: w.info.rules ?? null,
          defenses: w.defenses.map(item => `${item.id}:${item.kind}:${item.level}`)};
        sim.step = (dt, inputs) => {
          const events = step(dt, inputs), s = sim.state();
          rec.ticks[s.time] = s.ships.map(ship => `${ship.id}:${ship.hp}`).join(',');
          const fired = new Set();
          for (const e of events) {
            if (e.type !== 'culverin_fired') continue;
            fired.add(e.towerId);
            const ship = s.ships.find(item => item.id === e.targetId), boarder = s.boarders.find(item => item.id === e.targetId);
            const d = ship ? Math.hypot(ship.x - e.x, ship.z - e.z) : null;
            rec.checks.push({t: e.t, tower: e.towerId, target: e.targetId, kind: ship?.kind ?? (boarder ? 'boarder' : 'gone'), d});
            if (boarder) rec.violations.push(`t ${e.t}: ${e.towerId} shot boarder ${e.targetId}`);
            if (ship && d < MIN) rec.violations.push(`t ${e.t}: ${e.towerId} shot ${ship.kind} ${ship.id} at ${d.toFixed(2)} < ${MIN}`);
            if (d !== null) rec.minD = Math.min(rec.minD, d);
          }
          // A culverin ready to fire (reload 0) that kept quiet: with a ship inside its minimum range, or boarders ashore.
          for (const tower of s.towers.filter(item => item.kind === 'culverin' && item.reload === 0 && !fired.has(item.id) && !item.jammed)) {
            if (s.ships.some(ship => Math.hypot(ship.x - tower.x, ship.z - tower.z) < MIN)) rec.held++;
            if (s.boarders.length) rec.boardersIgnored++;
          }
          return events;
        };
      }
      // The frames drawn: the culverin posts' first instance and the air layer's shots.
      const root = w?.renderer?.root;
      if (root) {
        for (const mesh of root.children) {
          const m = /^pirates:defense:(.+)$/.exec(mesh.name);
          if (m && w.defenses.some(item => item.id === m[1] && item.kind === 'culverin') && mesh.geometry.instanceCount > 0) {
            const a = mesh.geometry.getAttribute('iUv').array, id = rectAt(Math.min(a[0], a[2]), a[1]);
            (rec.frames[m[1]] ??= {})[id] = (rec.frames[m[1]][id] ?? 0) + 1;
          }
          if (mesh.name === 'pirates:air') {
            const a = mesh.geometry.getAttribute('iUv').array;
            for (let k = 0; k < mesh.geometry.instanceCount; k++) if (rectAt(Math.min(a[k * 4], a[k * 4 + 2]), a[k * 4 + 1]) === 'fx-culverin-ball') { rec.shotDrawn++; break; }
          }
        }
      }
      if (!w?.done || !rec.patched) requestAnimationFrame(patch);
    };
    requestAnimationFrame(patch);
  });
}

let host = null, ben = null, off = null;
const paid = {};
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
  for (const captain of pages) await island(captain, async i => { i.dev.setCoins(10000); await i.load(); });
  await island(host, async i => { i.dev.setWaveBest(14); await i.load(); });
  await island(ben, i => i.refreshDefended());
  for (const captain of pages) await closeCards(captain);

  await scenario('1', 'the build card offers the Culverin on a tower spot from wave 15 only, never elsewhere or at Pirate Point', async note => {
    // Best won wave 14: the choice is there but locked, and the server refuses it.
    for (const captain of pages) {
      const card = await openCard(captain, GUN);
      assert.deepEqual(card.choices.map(item => item.kind), ['cannon', 'mortar', 'harpoon', 'culverin'], `${captain.name}'s choices`);
      const choice = card.choices.find(item => item.kind === 'culverin');
      assert.deepEqual({name: choice.name, line: choice.line, price: choice.price, disabled: choice.disabled, reason: choice.reason},
        {name: 'Culverin', line: LINE, price: '🪙 80', disabled: true, reason: 'Opens after wave 15.'}, `${captain.name}'s locked culverin choice`);
      note(`wave best 14, ${captain.name}: choices ${JSON.stringify(card.choices.map(item => item.name))}; Culverin "${choice.price}" disabled, "${choice.reason}"`);
      await closeCards(captain);
    }
    const coins = await coinsOf(host);
    const early = await raw(host, 'POST', '/api/island/build', {spot: GUN, kind: 'culverin', actionUid: `early${Date.now().toString(36)}`});
    assert.deepEqual({ok: early.ok, status: early.status, code: early.code}, {ok: false, status: 409, code: 'locked'}, 'a culverin before wave 15');
    assert.equal(await coinsOf(host), coins, 'the refused build cost nothing');
    note(`API build at wave best 14 → ${early.status} ${early.code} "${early.message}", coins ${coins} → ${await coinsOf(host)}`);
    // Best won wave 15: open on both pages.
    await island(host, async i => { i.dev.setWaveBest(15); await i.load(); });
    await island(ben, i => i.refreshDefended());
    for (const captain of pages) {
      const card = await openCard(captain, GUN), choice = card.choices.find(item => item.kind === 'culverin');
      assert.deepEqual({disabled: choice.disabled, reason: choice.reason, price: choice.price}, {disabled: false, reason: '', price: '🪙 80'}, `${captain.name}'s open culverin choice`);
      note(`wave best 15, ${captain.name}: Culverin open "${choice.name} ${choice.price}: ${choice.line}"`);
      await closeCards(captain);
    }
    // The answer: tower spots take it, other spots do not; its prices and unlocks.
    const answer = await answerOf(host);
    const takers = answer.spots.filter(spot => spot.kinds.includes('culverin')).map(spot => spot.id);
    assert.deepEqual(takers, ['cannon_1', 'cannon_2', 'cannon_3', 'cannon_4', 'cannon_5', 'cannon_6', 'cannon_7'], 'the seven tower spots take a culverin');
    assert.deepEqual(answer.prices.kinds.culverin, PRICE, 'the culverin prices');
    assert.deepEqual(['culverin:1', 'culverin:2', 'culverin:3'].map(id => answer.unlocks.unlocked.includes(id)), [true, true, true]);
    assert.deepEqual({4: answer.unlocks.locked['culverin:4'], 5: answer.unlocks.locked['culverin:5']}, {4: 20, 5: 30});
    note(`island answer: culverin on ${takers.join(', ')}; prices ${JSON.stringify(answer.prices.kinds.culverin)}; locked ${JSON.stringify({4: answer.unlocks.locked['culverin:4'], 5: answer.unlocks.locked['culverin:5']})}`);
    for (const spot of ['wall_1', 'house_1', 'tower_1']) {
      const refused = await raw(host, 'POST', '/api/island/build', {spot, kind: 'culverin', actionUid: `wrong${spot}${Date.now().toString(36)}`});
      assert.deepEqual({ok: refused.ok, status: refused.status, code: refused.code}, {ok: false, status: 422, code: 'wrong_kind'}, `a culverin on ${spot}`);
      note(`API build on ${spot} → ${refused.status} ${refused.code} "${refused.message}"`);
    }
    assert.equal(await coinsOf(host), coins, 'nothing paid for the refused builds');
    // Pirate Point: its tower spots offer a cannon or a mortar, and the server refuses a culverin there.
    await island(host, i => i.loadPoint());
    const point = await openCard(host, 'pp_tower_1');
    assert.deepEqual(point.choices.map(item => item.kind), ['cannon', 'mortar'], `Pirate Point's choices: ${JSON.stringify(point.choices)}`);
    await closeCards(host);
    const there = await raw(host, 'POST', '/api/pirate-point/build', {spot: 'pp_tower_1', kind: 'culverin', actionUid: `pp${Date.now().toString(36)}`});
    assert.deepEqual({ok: there.ok, status: there.status, code: there.code}, {ok: false, status: 422, code: 'wrong_kind'}, 'a culverin at Pirate Point');
    assert.equal(await coinsOf(host), coins, 'nothing paid at Pirate Point');
    note(`Pirate Point: card choices ${JSON.stringify(point.choices.map(item => item.name))}; API build → ${there.status} ${there.code} "${there.message}"`);
    await shot('01-card');
  });

  await scenario('2', 'the host builds culverins: paid once on a double click and on a retry; the member\'s map shows them', async note => {
    const before = await coinsOf(host);
    const built = await buildFromCard(host, GUN, {double: true});
    await host.page.waitForTimeout(600);
    assert.equal(before - await coinsOf(host), PRICE[0], 'the double click paid once');
    const spot = await spotOf(host, GUN);
    assert.deepEqual({kind: spot.kind, level: spot.level, built: spot.built}, {kind: 'culverin', level: 1, built: true});
    paid[GUN] = PRICE[0];
    const ms = await follows(ben, GUN, drawnIs('culverin', 1, 'island-culverin'), 'the culverin', built);
    note(`double click on Culverin at ${GUN}: coins ${before} → ${await coinsOf(host)} (price ${PRICE[0]}), toast "${await island(host, i => i.ui.toastText)}"; Ben's answer and map (island-culverin, level 1) after ${ms} ms`);
    const hostDrawn = await follows(host, GUN, drawnIs('culverin', 1, 'island-culverin'), 'its own culverin', Date.now());
    note(`the host's own map draws it (${hostDrawn} ms)`);
    // A client's retry: the same click id twice (the answer of the first was lost).
    const mid = await coinsOf(host), uid = `retry${Date.now().toString(36)}`;
    const first = await raw(host, 'POST', '/api/island/build', {spot: GUN2, kind: 'culverin', actionUid: uid});
    const again = await raw(host, 'POST', '/api/island/build', {spot: GUN2, kind: 'culverin', actionUid: uid});
    assert.ok(first.ok && again.ok, `both answers ok: ${JSON.stringify([first.code, again.code])}`);
    assert.equal(mid - await coinsOf(host), PRICE[0], 'the retry paid once');
    paid[GUN2] = PRICE[0];
    const fresh = await raw(host, 'POST', '/api/island/build', {spot: GUN2, kind: 'culverin', actionUid: `${uid}b`});
    assert.deepEqual({ok: fresh.ok, code: fresh.code}, {ok: false, code: 'spot_taken'}, 'a fresh click on the built spot');
    assert.equal(mid - await coinsOf(host), PRICE[0], 'the refused build cost nothing');
    note(`API retry with click id ${uid} twice on ${GUN2}: both ok, coins ${mid} → ${await coinsOf(host)}; a fresh id → ${fresh.code}`);
    // A cannon beside them for the wave (an ordinary tower).
    await island(host, async (i, spot) => { await i.build(spot, 'cannon'); }, CANNON);
    // API calls are not room messages: both pages read the island again (as after a room message).
    const began = Date.now();
    await Promise.all(pages.map(captain => island(captain, i => i.refreshDefended())));
    for (const captain of pages) await follows(captain, GUN2, drawnIs('culverin', 1, 'island-culverin'), 'the second culverin', began);
    for (const captain of pages) await follows(captain, CANNON, (drawn, spot) => drawn?.kind === 'cannon' && spot?.kind === 'cannon', 'the cannon', began);
    note(`after a read both maps draw ${GUN2} as island-culverin and ${CANNON} as a cannon`);
    for (const captain of pages) await closeCards(captain);
    await shot('02-built');
  });

  await scenario('3', 'upgrade: level 2 by the host, level 3 by the member; level 4 waits for wave 20', async note => {
    let coins = await coinsOf(host);
    let clicked = await upgradeFromCard(host, GUN, 2);
    await host.page.waitForTimeout(400);
    assert.equal(coins - await coinsOf(host), PRICE[1], 'the host paid level 2 once (double click)');
    paid[GUN] += PRICE[1];
    let ms = await follows(ben, GUN, drawnIs('culverin', 2, 'island-culverin-l2'), 'level 2', clicked);
    note(`host: level 2 for 🪙 ${PRICE[1]} (coins ${coins} → ${await coinsOf(host)}); Ben's map island-culverin-l2 after ${ms} ms`);
    coins = await coinsOf(ben);
    clicked = await upgradeFromCard(ben, GUN, 3);
    await ben.page.waitForTimeout(400);
    assert.equal(coins - await coinsOf(ben), PRICE[2], 'the member paid level 3 once (double click)');
    ms = await follows(host, GUN, drawnIs('culverin', 3, 'island-culverin-l3'), 'level 3', clicked);
    note(`Ben: level 3 for 🪙 ${PRICE[2]} (his coins ${coins} → ${await coinsOf(ben)}); the host's map island-culverin-l3 after ${ms} ms`);
    for (const captain of pages) {
      const card = await openCard(captain, GUN);
      assert.equal(card.upgrade, null, `${captain.name}: no Upgrade at level 3 before wave 20`);
      assert.ok(card.text.includes('Level 4: Opens after wave 20.'), `${captain.name}'s card says when level 4 opens: ${card.text}`);
      note(`${captain.name}'s card at level 3: "Level 4: Opens after wave 20."`);
      await closeCards(captain);
    }
    const before = await coinsOf(host);
    const early = await raw(host, 'POST', '/api/island/upgrade', {spot: GUN, actionUid: `l4${Date.now().toString(36)}`});
    assert.deepEqual({ok: early.ok, status: early.status, code: early.code}, {ok: false, status: 409, code: 'locked'}, 'level 4 before wave 20');
    assert.equal(await coinsOf(host), before);
    note(`API upgrade to level 4 → ${early.status} ${early.code} "${early.message}", nothing paid`);
    await shot('03-level3');
  });

  await scenario('4', 'a wave with gunboats: both sims agree tick for tick on culverin shots and ship hits; never a boarder or a close ship; frames drawn', async note => {
    for (const captain of pages) await closeCards(captain);
    await island(host, async i => { i.dev.setWaveBest(19); await i.load(); }); // wave 20: gunboats, and a siege barge as the event
    await island(ben, i => i.refreshDefended());
    for (const captain of pages) await arm(captain);
    const rung = await island(host, async i => { const a = await i.ringBell(); return {ok: a.ok, code: a.code ?? null}; });
    assert.ok(rung.ok, `the host rang the bell: ${JSON.stringify(rung)}`);
    const first = await until(host, now => now?.ships > 0, 'the first ships', 90000);
    await until(ben, now => now?.waveId === first.waveId && now.ticks > 0, 'the member in the same wave', 30000);
    const fights = {};
    for (const captain of pages) {
      fights[captain.name] = await captain.page.evaluate(() => { const w = window.__island.waves.island.wave;
        return {rules: w.info.rules ?? null, defenses: w.defenses.map(item => `${item.id}:${item.kind}:${item.level}`).sort(),
          towers: w.sim.state().towers.map(item => `${item.id}:${item.kind}:${item.level}:${item.range}`)}; });
    }
    assert.deepEqual(fights.Nils, fights.Ben, 'both pages fight the same island');
    assert.equal(fights.Nils.rules?.defensesV2, true, `the wave's rules say defensesV2: ${JSON.stringify(fights.Nils.rules)}`);
    assert.deepEqual(fights.Nils.defenses, [`${GUN}:culverin:3`, `${GUN2}:culverin:1`, `${CANNON}:cannon:1`]);
    assert.deepEqual(fights.Nils.towers.filter(item => item.includes('culverin')), [`${GUN}:culverin:3:48`, `${GUN2}:culverin:1:44`], 'the culverins fight with their level\'s range');
    note(`wave ${first.wave} (${first.waveId}): both sims fight ${JSON.stringify(fights.Nils.towers)} with rules ${JSON.stringify(fights.Nils.rules)}`);
    await shot('04-wave');
    for (const captain of pages) await until(captain, now => !now || now.done, 'the end of the wave', 400000);
    await host.page.waitForTimeout(500);
    const rec = {};
    for (const captain of pages) rec[captain.name] = await captain.page.evaluate(() => { const r = window.__cul; const w = window.__island.waves.island.wave;
      return {...r, minD: Number.isFinite(r.minD) ? r.minD : null, end: w?.sim?.endReason ?? null, event: w?.sim?.state().event?.id ?? null}; });
    const a = rec.Nils, b = rec.Ben;
    for (const [name, r] of Object.entries(rec)) {
      note(`${name}: sim wrapped at t ${r.patched?.at} of ${r.patched?.waveId}; ${r.events.length} culverin_fired, ${r.hits.length} ship_hit (${r.hits.filter(item => item.endsWith('true]')).length} by culverins), ${Object.keys(r.ticks).length} ticks stepped, end ${r.end}, event ${r.event}`);
    }
    assert.ok(a.events.length > 0, 'the culverins fired');
    assert.deepEqual(b.events, a.events, 'both pages saw the same culverin shots (time, tower, target, damage, aim, impact)');
    assert.deepEqual(b.hits, a.hits, 'both pages saw the same ship hits (time, ship, by, damage, hp)');
    const common = Object.keys(a.ticks).filter(t => t in b.ticks);
    const differ = common.filter(t => a.ticks[t] !== b.ticks[t]);
    assert.ok(common.length > 100, `both pages stepped the same ticks (${common.length} in common)`);
    assert.deepEqual(differ, [], 'the ships\' hp agree at every tick both pages stepped');
    note(`tick for tick: ${a.events.length} culverin shots and ${a.hits.length} ship hits identical on both pages; ships' hp equal at ${common.length} common ticks`);
    for (const [name, r] of Object.entries(rec)) {
      assert.equal(r.checks.length, r.events.length, `${name}: every culverin shot was checked against its tick`);
      assert.deepEqual(r.violations, [], `${name}: culverin shots at boarders or inside the minimum range`);
      const kinds = {};
      for (const item of r.checks) kinds[item.kind] = (kinds[item.kind] ?? 0) + 1;
      assert.ok(!kinds.boarder, `${name}: no boarder targets`);
      note(`${name}: targets ${JSON.stringify(kinds)}, closest shot ${r.minD?.toFixed(2)} (min ${MIN_RANGE}); ready culverin held fire ${r.held} ticks with a ship inside ${MIN_RANGE}, ${r.boardersIgnored} ticks with boarders ashore`);
    }
    const kinds = new Set(a.checks.map(item => item.kind));
    assert.ok(kinds.has('gunboat') || kinds.has('barge'), `the culverins shot a gunboat or a siege barge: ${[...kinds]}`);
    const hitPriority = a.hits.map(item => JSON.parse(item)).filter(item => item[6] && (item[2] === 'gunboat' || item[2] === 'barge'));
    note(`culverin hits on gunboats/barges: ${hitPriority.length} (${[...new Set(hitPriority.map(item => item[2]))].join(', ')})`);
    // Frames: each culverin's idle and firing frame of its level, and its shot, on both pages.
    const want = {[GUN]: ['island-culverin-l3', 'island-culverin-fire-l3'], [GUN2]: ['island-culverin', 'island-culverin-fire']};
    for (const [name, r] of Object.entries(rec)) {
      for (const [spot, ids] of Object.entries(want)) {
        const seen = Object.keys(r.frames[spot] ?? {});
        assert.deepEqual(seen.filter(id => !ids.includes(id)), [], `${name}: ${spot} drawn only with its own frames: ${JSON.stringify(r.frames[spot])}`);
        for (const id of ids) assert.ok(seen.includes(id), `${name}: ${spot} drawn with ${id}: ${JSON.stringify(r.frames[spot])}`);
      }
      assert.ok(r.shotDrawn > 0, `${name}: the culverin's shot (fx-culverin-ball) was drawn`);
      note(`${name}: frames ${JSON.stringify(r.frames)}; fx-culverin-ball drawn in ${r.shotDrawn} frames`);
    }
  });

  await scenario('5', 'after the wave: level 4 after wave 20, level 5 after wave 30, then the highest level', async note => {
    for (const captain of pages) await closeCards(captain);
    await island(host, async i => { i.dev.setWaveBest(20); await i.load(); });
    await island(ben, i => i.refreshDefended());
    let coins = await coinsOf(host);
    let clicked = await upgradeFromCard(host, GUN, 4);
    await host.page.waitForTimeout(400);
    assert.equal(coins - await coinsOf(host), PRICE[3]);
    paid[GUN] += PRICE[3];
    let ms = await follows(ben, GUN, drawnIs('culverin', 4, 'island-culverin-l4'), 'level 4', clicked);
    note(`wave best 20: host level 4 for 🪙 ${PRICE[3]}; Ben's map island-culverin-l4 after ${ms} ms`);
    let card = await openCard(host, GUN);
    assert.ok(card.text.includes('Level 5: Opens after wave 30.'), `the card says when level 5 opens: ${card.text}`);
    await island(host, async i => { i.dev.setWaveBest(30); await i.load(); });
    await island(ben, i => i.refreshDefended());
    coins = await coinsOf(ben);
    clicked = await upgradeFromCard(ben, GUN, 5);
    await ben.page.waitForTimeout(400);
    assert.equal(coins - await coinsOf(ben), PRICE[4]);
    ms = await follows(host, GUN, drawnIs('culverin', 5, 'island-culverin-l5'), 'level 5', clicked);
    note(`wave best 30: Ben level 5 for 🪙 ${PRICE[4]}; the host's map island-culverin-l5 after ${ms} ms`);
    card = await openCard(host, GUN);
    assert.equal(card.upgrade, null);
    assert.ok(card.text.includes('Highest level reached.'), `the card at level 5: ${card.text}`);
    const over = await raw(host, 'POST', '/api/island/upgrade', {spot: GUN, actionUid: `l6${Date.now().toString(36)}`});
    assert.deepEqual({ok: over.ok, code: over.code}, {ok: false, code: 'max_level'});
    note(`level 5: "Highest level reached."; API upgrade → ${over.status} ${over.code}`);
    await closeCards(host);
    await shot('05-level5');
  });

  await scenario('6', 'Tear down a culverin: half back to its payer, gone on both maps, the spot offers the four kinds again', async note => {
    for (const captain of pages) await closeCards(captain);
    const card = await openCard(host, GUN2);
    assert.deepEqual(card.teardown, {label: 'Tear down', disabled: false}, `the culverin's card offers Tear down: ${JSON.stringify(card)}`);
    const coins = await coinsOf(host);
    await host.page.locator(`${CARD} [data-focus="demolish"]`).click();
    await host.page.locator('.island-card[open] [data-focus="confirm"]:not([disabled])').waitFor({timeout: 10000});
    const question = await host.page.evaluate(() => document.querySelector('.island-card[open]').textContent);
    await host.page.locator('.island-card[open] [data-focus="confirm"]').click();
    await host.page.waitForFunction(() => /^Culverin torn down/.test(window.__island.island.ui.toastText), null, {timeout: 10000, polling: 50});
    const done = Date.now();
    assert.equal(await coinsOf(host) - coins, paid[GUN2] / 2, 'half of the price back');
    for (const captain of pages) {
      const ms = await follows(captain, GUN2, (drawn, spot) => drawn === null && spot?.built === false, 'the empty spot', done);
      note(`${captain.name}'s answer and map: ${GUN2} empty after ${ms} ms`);
    }
    const again = await openCard(host, GUN2);
    assert.deepEqual(again.choices.map(item => item.kind), ['cannon', 'mortar', 'harpoon', 'culverin'], 'the spot offers the four kinds again');
    await closeCards(host);
    note(`confirm card "${question.replace(/\s+/g, ' ').slice(0, 140)}"; coins ${coins} → ${await coinsOf(host)} (+${paid[GUN2] / 2}); toast "${await island(host, i => i.ui.toastText)}"`);
  });

  await scenario('H', 'harness: the real sim and renderer, seven culverins, tower health on: replay, targets, hp, all four frames', async note => {
    const harness = await context.newPage();
    await stubOfflineApi(harness);
    harness.on('pageerror', error => env.errors.push(`harness: ${error.message}`));
    harness.on('console', message => { if (message.type() === 'error') env.errors.push(`harness: ${message.text()}`); });
    await harness.route('**/culverin-harness', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body></body></html>'}));
    await harness.goto(`${env.url}/culverin-harness`);
    const found = await harness.evaluate(async () => {
      const {createWave} = await import('/src/pirates/sim.js');
      const {eventFor} = await import('/src/pirates/wave-events.js');
      const {towerMaxHp} = await import('/src/pirates/tower-health.js');
      const R = await import('/src/pirates/render.js');
      const SPOTS = {cannon_1: [-12.5, -14.5], cannon_2: [13, -15], cannon_3: [15.5, 14], cannon_4: [-15.5, 14.5], cannon_5: [-15, -6], cannon_6: [14.5, -3], cannon_7: [4.5, 16.5]};
      const defenses = Object.entries(SPOTS).map(([id, [x, z]], n) => ({id, kind: 'culverin', level: 1 + (n % 5), x, z}));
      const runs = [], violations = [], snapshots = {damaged: null, broken: null, fired: null};
      const play = options => {
        const sim = createWave(options), log = [];
        let shots = 0, close = 0, minD = Infinity, kinds = {};
        for (let i = 0; i < 20 * 600 && !sim.done; i++) {
          const events = sim.step(.05), s = sim.state();
          log.push(s.ships.map(ship => `${ship.id}:${ship.hp}:${ship.x}:${ship.z}`).join(',') + '|' + s.towers.map(t => `${t.reload}:${t.hp}`).join(','));
          for (const ship of s.ships) for (const [x, z] of Object.values(SPOTS)) if (Math.hypot(ship.x - x, ship.z - z) < 12) close++;
          for (const e of events) {
            log.push(JSON.stringify(e));
            if (e.type !== 'culverin_fired') continue;
            shots++;
            const ship = s.ships.find(item => item.id === e.targetId), boarder = s.boarders.find(item => item.id === e.targetId);
            if (boarder) violations.push(`${options.wave}/${options.seed} t ${e.t}: boarder ${e.targetId}`);
            if (ship) { const d = Math.hypot(ship.x - e.x, ship.z - e.z); minD = Math.min(minD, d); kinds[ship.kind] = (kinds[ship.kind] ?? 0) + 1;
              if (d < 12) violations.push(`${options.wave}/${options.seed} t ${e.t}: ${ship.kind} at ${d.toFixed(2)}`); }
            snapshots.fired ??= {state: s, event: e};
          }
          for (const t of s.towers) {
            if (!(t.maxHp > 0)) continue;
            if (t.hp <= 0) snapshots.broken ??= {state: s, id: t.id, level: t.level};
            else if (t.hp / t.maxHp <= .5) snapshots.damaged ??= {state: s, id: t.id, level: t.level};
          }
        }
        return {log, shots, close, minD, kinds, end: sim.endReason, hp: sim.state().towers.map(t => [t.level, t.maxHp])};
      };
      for (const wave of [16, 20, 30]) for (const seed of [1, 2, 3, 4, 5, 6]) {
        const event = wave === 20 ? 'siege_barge' : eventFor(wave, seed);
        const options = {seed, wave, defenses, defensesV2: true, towerHealth: true, countdown: 0, event, finishers: true};
        const one = play(options), two = play(options);
        runs.push({wave, seed, event, same: one.log.length === two.log.length && one.log.every((line, k) => line === two.log[k]),
          shots: one.shots, close: one.close, minD: one.minD, kinds: one.kinds, end: one.end, hp: one.hp});
      }
      const hpTable = [1, 2, 3, 4, 5].map(level => [towerMaxHp('culverin', level), towerMaxHp('cannon', level)]);
      // The renderer, with the atlas of a wave with tower health and culverins: the frame of the first instance of a post.
      const atlas = await R.loadAtlas({quality: 'low', towerStates: true, culverins: true});
      const byUv = Object.entries(atlas.rects).map(([id, r]) => [id, (r.x + .01) / atlas.width, 1 - (r.y + r.h - .01) / atlas.height]);
      const frameOf = (renderer, id) => {
        const mesh = renderer.root.children.find(item => item.name === `pirates:defense:${id}`), a = mesh.geometry.getAttribute('iUv').array;
        const u = Math.min(a[0], a[2]), v = a[1];
        return byUv.reduce((best, [name, bu, bv]) => { const d = Math.abs(bu - u) + Math.abs(bv - v); return d < best[1] ? [name, d] : best; }, [null, Infinity])[0];
      };
      const frames = {};
      const scene = {add() {}, userData: {}};
      for (const [look, snap] of Object.entries(snapshots)) {
        if (!snap) { frames[look] = null; continue; }
        const renderer = R.createWaveRenderer({scene, atlas, defenses, reducedMotion: () => true, quality: () => 'low'});
        renderer.setVisible(true);
        const id = look === 'fired' ? snap.event.towerId : snap.id, level = defenses.find(item => item.id === id).level;
        // An intact copy of the same tick first (the idle frame), then the sim's own state.
        const whole = {...snap.state, towers: snap.state.towers.map(t => ({...t, hp: t.maxHp, broken: false}))};
        renderer.update({state: whole, simTime: snap.state.time, dt: .016});
        const idle = frameOf(renderer, id);
        if (look === 'fired') renderer.events([snap.event]);
        renderer.update({state: snap.state, simTime: snap.state.time, dt: .016});
        frames[look] = {id, level, idle, drawn: frameOf(renderer, id), hp: snap.state.towers.find(t => t.id === id)?.hp ?? null};
        renderer.dispose();
      }
      return {runs, violations, hpTable, frames, missing: [...R.CULVERIN_IDS, ...R.CULVERIN_STATE_IDS].filter(id => !atlas.rects[id])};
    });
    await harness.close();
    for (const run of found.runs) note(`wave ${run.wave} seed ${run.seed} (${run.event ?? 'no event'}): replay ${run.same ? 'identical' : 'DIFFERENT'}, ${run.shots} shots ${JSON.stringify(run.kinds)}, closest ${run.minD.toFixed(2)}, ${run.close} ship-ticks inside 12 of a culverin, end ${run.end}`);
    assert.deepEqual(found.runs.filter(run => !run.same).map(run => `${run.wave}/${run.seed}`), [], 'same-seed replays are identical');
    assert.deepEqual(found.violations, [], 'no shot at a boarder or a ship closer than 12');
    assert.ok(found.runs.every(run => run.shots > 0), 'every run had culverin shots');
    assert.ok(found.runs.some(run => run.close > 0), 'ships did come inside the minimum range of a culverin (the rule was tested)');
    assert.ok(found.runs.filter(run => run.wave === 20).every(run => run.kinds.barge > 0), `the culverins shot the siege barge at wave 20: ${JSON.stringify(found.runs.filter(run => run.wave === 20).map(run => run.kinds))}`);
    assert.deepEqual(found.hpTable.map(([c]) => c), [56, 91, 140, 203, 280], 'culverin hp by level');
    assert.deepEqual(found.hpTable.map(([c, cannon]) => c === Math.round(cannon * .7)), [true, true, true, true, true], '70% of a cannon');
    note(`hp: culverin ${JSON.stringify(found.hpTable.map(([c]) => c))} vs cannon ${JSON.stringify(found.hpTable.map(([, cannon]) => cannon))}`);
    assert.deepEqual(found.missing, [], 'the atlas holds every culverin frame');
    const sfx = level => (level > 1 ? `-l${level}` : '');
    const {fired, damaged, broken} = found.frames;
    assert.ok(fired && damaged && broken, `the sim produced a shot, a damaged and a broken culverin: ${JSON.stringify(found.frames)}`);
    assert.deepEqual([fired.idle, fired.drawn], [`island-culverin${sfx(fired.level)}`, `island-culverin-fire${sfx(fired.level)}`], `idle and firing frames: ${JSON.stringify(fired)}`);
    assert.equal(damaged.drawn, `island-culverin${sfx(damaged.level)}-damaged`, `damaged frame: ${JSON.stringify(damaged)}`);
    assert.equal(broken.drawn, `island-culverin${sfx(broken.level)}-broken`, `broken frame: ${JSON.stringify(broken)}`);
    note(`frames from the sim's states: ${JSON.stringify(found.frames)}`);
  });

  await scenario('T', 'with tower_health on as well: the wave carries both rules and the culverin fights with 70% of a cannon\'s hp', async note => {
    const ctx = await env.page.context().browser().newContext({viewport: {width: 960, height: 600}});
    const list = [];
    const ida = await openCaptain('Ida', 'me', {create: true}, {flags: 'defenses_v2,tower_health', ctx, list});
    await ida.page.waitForFunction(() => !!document.querySelector('.island-card-lobby[open]') || window.__island.island.ui.open !== 'lobby', null, {timeout: 15000});
    if (await ida.page.locator('.island-card-lobby[open] .island-lobby-start').count()) await ida.page.locator('.island-card-lobby[open] .island-lobby-start').click();
    await closeCards(ida);
    await island(ida, async i => { i.dev.setWaveBest(19); i.dev.setCoins(2000); await i.load(); await i.build('cannon_1', 'culverin'); await i.build('cannon_3', 'cannon'); });
    await ida.page.evaluate(() => { window.__cul = {fired: 0}; window.__island.on('culverin_fired', () => { window.__cul.fired++; }); });
    const rung = await island(ida, async i => { const a = await i.ringBell(); return {ok: a.ok, code: a.code ?? null}; });
    assert.ok(rung.ok, `Ida rang the bell: ${JSON.stringify(rung)}`);
    await until(ida, now => now?.ships > 0, 'the first ships', 90000);
    const fight = await ida.page.evaluate(() => { const w = window.__island.waves.island.wave;
      return {rules: w.info.rules ?? null, towers: w.sim.state().towers.map(t => ({id: t.id, kind: t.kind, level: t.level, hp: t.hp, maxHp: t.maxHp}))}; });
    assert.deepEqual({h: fight.rules?.towerHealth, d: fight.rules?.defensesV2}, {h: true, d: true}, `both rules: ${JSON.stringify(fight.rules)}`);
    assert.deepEqual(fight.towers.map(t => [t.id, t.kind, t.maxHp]), [['cannon_1', 'culverin', 56], ['cannon_3', 'cannon', 80]], `the towers' hp: ${JSON.stringify(fight.towers)}`);
    await until(ida, now => !now || now.done, 'the end of the wave', 400000);
    const fired = await ida.page.evaluate(() => window.__cul.fired);
    assert.ok(fired > 0, 'the culverin fired with tower health on');
    note(`rules ${JSON.stringify(fight.rules)}; towers ${JSON.stringify(fight.towers)}; ${fired} culverin shots`);
    await ctx.close();
  });

  await scenario('F', 'flag off: no culverin on the card, in the answer or the wave; existing towers as before', async note => {
    const offContext = await env.page.context().browser().newContext({viewport: {width: 960, height: 600}});
    const list = [];
    off = await openCaptain('Ola', 'me', {create: true}, {flags: '', ctx: offContext, list});
    await off.page.waitForFunction(() => !!document.querySelector('.island-card-lobby[open]') || window.__island.island.ui.open !== 'lobby', null, {timeout: 15000});
    if (await off.page.locator('.island-card-lobby[open] .island-lobby-start').count()) await off.page.locator('.island-card-lobby[open] .island-lobby-start').click();
    await closeCards(off);
    await island(off, async i => { i.dev.setWaveBest(19); i.dev.setCoins(2000); await i.load(); });
    const card = await openCard(off, GUN);
    assert.deepEqual(card.choices.map(item => item.kind), ['cannon', 'mortar', 'harpoon'], `the flag-off choices: ${JSON.stringify(card.choices)}`);
    await closeCards(off);
    const answer = await answerOf(off);
    const mentions = JSON.stringify({spots: answer.spots, prices: answer.prices, unlocks: answer.unlocks}).includes('culverin');
    assert.equal(mentions, false, 'the island answer never mentions a culverin');
    const coins = await coinsOf(off);
    const refused = await raw(off, 'POST', '/api/island/build', {spot: GUN, kind: 'culverin', actionUid: `off${Date.now().toString(36)}`});
    assert.deepEqual({ok: refused.ok, status: refused.status, code: refused.code}, {ok: false, status: 422, code: 'wrong_kind'}, 'a culverin with the flag off');
    assert.equal(await coinsOf(off), coins, 'nothing paid');
    note(`flag off: choices ${JSON.stringify(card.choices.map(item => item.name))}; answer mentions culverin: ${mentions}; API build → ${refused.status} ${refused.code} "${refused.message}"`);
    await island(off, async i => { await i.build('cannon_1', 'cannon'); await i.build('cannon_2', 'harpoon'); });
    for (const [spot, kind, art] of [['cannon_1', 'cannon', 'island-cannon'], ['cannon_2', 'harpoon', 'island-harpoon']]) {
      await follows(off, spot, (drawn, item) => drawn?.kind === kind && drawn.art === art && item?.kind === kind, `the ${kind}`, Date.now());
    }
    await off.page.evaluate(() => { window.__cul = {fired: 0}; window.__island.on('culverin_fired', () => { window.__cul.fired++; }); });
    const rung = await island(off, async i => { const a = await i.ringBell(); return {ok: a.ok, code: a.code ?? null}; });
    assert.ok(rung.ok, `Ola rang the bell: ${JSON.stringify(rung)}`);
    await until(off, now => now?.ships > 0, 'the first ships', 90000);
    const fight = await off.page.evaluate(() => { const w = window.__island.waves.island.wave;
      return {rules: w.info.rules ?? null, towers: w.sim.state().towers.map(t => `${t.id}:${t.kind}:${t.level}:${t.range}`)}; });
    const {CONFIG} = await off.page.evaluate(async () => { const m = await import('/src/pirates/sim.js'); return {CONFIG: {cannon: m.CONFIG.levels.cannon[0].range, harpoon: m.CONFIG.levels.harpoon[0].range}}; });
    assert.equal(fight.rules?.defensesV2 ?? false, false, `no defenses_v2 rule: ${JSON.stringify(fight.rules)}`);
    assert.deepEqual(fight.towers, [`cannon_1:cannon:1:${CONFIG.cannon}`, `cannon_2:harpoon:1:${CONFIG.harpoon}`], 'the towers fight as before');
    await until(off, now => !now || now.done, 'the end of the wave', 400000);
    assert.equal(await off.page.evaluate(() => window.__cul.fired), 0, 'no culverin_fired');
    note(`flag-off wave: rules ${JSON.stringify(fight.rules)}, towers ${JSON.stringify(fight.towers)}, culverin_fired 0`);
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
log(`\ncheck-culverin-mp: ${failed.length ? `FAILED (${failed.map(item => item.id).join(', ')})` : 'OK'}, screenshots in ${out}`);
process.exitCode = failed.length ? 1 : 0;
