// The integrated first 3 minutes with the fake island server (?islands=fake), the local fortune desk
// (?desk=local) and the local market stall (?market=local): title, lore, goal card, your island, a cannon, the bell and its wave, the loot toast,
// the sea chart, the Harbor, a stake, back home and the invite card. Checks that the quest strip moves
// through all five goals in order, and captures each step at 1280x720 and 375x812.
//   node scripts/capture-integrated.js [output folder] [WIDTHxHEIGHT]   (default captures/integrated, both sizes)
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const out = process.argv[2] ?? 'captures/integrated';
await mkdir(out, {recursive: true});
const env = await openWorldBrowser(), {page} = env;
const requests = [];
page.on('request', request => requests.push(new URL(request.url()).pathname));
const shot = async name => { await page.waitForTimeout(350); await settle(page); await page.screenshot({path: `${out}/${name}.png`}); console.log(`${out}/${name}.png`); };
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, 1.03, z); g.view.setPlace(g.world.current.id, g.player.position); }, [x, z]);
const quests = () => page.evaluate(() => [...document.querySelectorAll('.quest-strip .quest-item')].map(item => `${item.dataset.quest}:${item.dataset.done}`).join(' '));
const doneCount = () => page.evaluate(() => JSON.parse(localStorage.getItem('plot_twist_first_quests_v1') ?? '{"done":0}').done);
// The Harbor cards use the kit's type: no Courier anywhere inside an open card.
const courier = async selector => { const found = await page.evaluate(selector => [...document.querySelectorAll(`${selector} *`)]
  .filter(node => /courier/i.test(getComputedStyle(node).fontFamily)).map(node => `${node.tagName}.${node.className}`), selector);
  assert.deepEqual(found, [], `no Courier inside ${selector}`); };
const closeDialogs = async () => { for (let i = 0; i < 4 && await page.locator('dialog[open]').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
try {
  // One size per run keeps each run in a fresh browser: node scripts/capture-integrated.js <folder> 375x812
  const sizes = process.argv[3] ? [process.argv[3].split('x').map(Number)] : [[1280, 720], [375, 812]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({width, height});
    await page.goto(`${env.url}/?islands=fake&desk=local&market=local`);
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* fresh device */ } });
    await page.reload();
    await page.locator('.shell-screen[open]').waitFor();
    await shot(`01-title-${width}`);
    await page.locator('#play').click();
    // Play -> lore intro -> goal card -> your island, with the island arrival cutscene once.
    const seen = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.goal-card[open]')
        || (window.__island?.world.current?.id === 'home_islet' && !document.querySelector('dialog[open]')), null, {timeout: 30000});
      if (await page.locator('.goal-card[open]').count()) {
        seen.push('goal');
        await shot(`02-goal-card-${width}`);
        // The arrival has not played yet while the goal card is up; it plays (and is remembered) right after.
        const arrivalKey = () => page.evaluate(() => localStorage.getItem('plot_twist_island_arrival_v1'));
        assert.equal(await arrivalKey(), null, 'the island arrival waits for the goal card');
        await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
        await page.waitForFunction(() => document.querySelector('dialog.cutscene[open]') || localStorage.getItem('plot_twist_island_arrival_v1') === '1',
          null, {timeout: 30000, polling: 100}).catch(() => {});
        // The arrival plays (and stores its flag) right after the card; skip it if it is still on screen.
        if (await arrivalKey() === '1') {
          seen.push('island_arrival');
          await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 2000}).catch(() => {});
        }
      } else if (await page.locator('dialog.cutscene[open]').count()) {
        seen.push(await page.evaluate(() => document.querySelector('dialog.cutscene[open]')?.dataset.cutscene ?? 'cutscene'));
        await page.getByRole('button', {name: 'Skip', exact: true}).click();
      } else break;
      await page.waitForTimeout(300);
    }
    console.log('start order:', seen.join(' -> '));
    assert.deepEqual(seen, ['lore_intro', 'goal', 'island_arrival'], 'Play -> lore -> goal card -> island arrival');
    await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]'));
    await page.evaluate(() => { window.__island.settings.hour = 11; });
    await page.waitForFunction(() => !/…/.test(document.querySelector('.hud-coins')?.textContent ?? '…'), null, {timeout: 5000});
    const hud = await page.evaluate(() => ({coins: document.querySelector('.hud-coins')?.textContent, strip: document.querySelector('.quest-strip .quest-title')?.textContent,
      arrival: document.querySelector('.hud-arrival strong')?.textContent}));
    console.log('hud on arrival:', JSON.stringify(hud));
    assert.equal(hud.coins, '🪙 100');
    assert.match(hud.strip, /^Goals/);
    await stand(0, 0);
    await shot(`03-island-hud-${width}`);
    // 1 Build a cannon.
    await stand(-11, -12.5);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card[open]').waitFor();
    await shot(`04-build-card-${width}`);
    await page.locator('.island-card[open] .island-card-body .kit-button').click();
    await page.waitForFunction(() => window.__island.island.island?.spots.find(spot => spot.id === 'cannon_1').built);
    await page.waitForTimeout(300);
    await shot(`05-built-cannon-${width}`);
    assert.equal(await doneCount(), 1, 'goal 1 done');
    assert.equal(await page.locator('.hud-coins').textContent(), '🪙 70');
    // 2 Ring the bell and win a wave (the fake's placeholder wave ends 20 s after the countdown).
    await stand(8, 11.4);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card-bell[open]').waitFor();
    await shot(`06-bell-card-${width}`);
    await page.locator('.island-card[open] .island-card-body .kit-button').click();
    // The wave on screen (src/pirates/): its countdown, the ships, the cannon firing, then the loot.
    await page.locator('.pirate-countdown:not([hidden])').waitFor();
    await page.waitForTimeout(2200);
    await shot(`07-bell-countdown-${width}`);
    await page.waitForFunction(() => window.__island.waves?.island.state?.ships?.length > 0, null, {timeout: 30000, polling: 250});
    await page.waitForTimeout(3000);
    await shot(`07b-wave-battle-${width}`);
    await page.waitForFunction(() => [...document.querySelectorAll('.u-toast')].some(node => /loot/.test(node.textContent)), null, {timeout: 240000, polling: 500});
    await shot(`08-loot-toast-${width}`);
    assert.equal(await doneCount(), 2, 'goal 2 done');
    console.log('coins after the wave:', await page.locator('.hud-coins').textContent());
    // 3 Sail to the Harbor from the sea chart (Menu > Sea chart, or M).
    await page.keyboard.press('KeyM');
    await page.locator('.sea-chart[open]').waitFor();
    await shot(`09-sea-chart-${width}`);
    await page.locator('.sea-chart[open]').getByRole('button', {name: /The Harbor/}).first().click();
    await page.waitForFunction(() => window.__island.world.current?.id === 'saltreach_harbor' && !window.__island.world.busy && !document.querySelector('dialog[open]'), null, {timeout: 30000});
    await page.waitForTimeout(400);
    assert.equal(await doneCount(), 3, 'goal 3 done');
    // The Harbor overview from the Menu, then the market stall card.
    await page.getByRole('button', {name: 'Menu', exact: true}).click();
    await page.locator('.shell-screen[open][data-mode="pause"]').waitFor();
    await page.getByRole('button', {name: 'Harbor', exact: true}).click();
    await page.locator('.harbor-overview[open]').waitFor();
    await shot(`10-harbor-overview-${width}`);
    await courier('.harbor-overview[open]');
    await page.locator('.harbor-overview[open] [data-key="stall:market"]').click();
    await page.locator('.harbor-market[open]').waitFor();
    await page.waitForTimeout(800);
    await shot(`11-market-card-${width}`);
    await courier('.harbor-market[open]');
    await closeDialogs();
    await page.getByRole('button', {name: 'Menu', exact: true}).click();
    await page.getByRole('button', {name: 'Harbor', exact: true}).click();
    await page.locator('[data-key="stall:match"]').click();
    await page.locator('.harbor-match[open]').waitFor();
    await page.waitForTimeout(800);
    await shot(`11b-match-card-${width}`);
    await courier('.harbor-match[open]');
    await closeDialogs();
    // 4 Place a stake at the fortune teller (the local practice desk).
    await page.getByRole('button', {name: 'Menu', exact: true}).click();
    await page.getByRole('button', {name: 'Harbor', exact: true}).click();
    await page.locator('[data-key="stall:fortune"]').click();
    await page.locator('.harbor-fortune[open] .harbor-choice[data-side]').first().waitFor({timeout: 15000});
    await page.locator('.harbor-fortune[open] .harbor-choice[data-side]').first().click();
    await page.locator('.harbor-fortune[open] .harbor-choice[data-stake="10"]').first().click();
    await shot(`12-fortune-card-${width}`);
    await courier('.harbor-fortune[open]');
    await page.locator('.harbor-fortune[open] .harbor-confirm').first().click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('plot_twist_first_quests_v1') ?? '{}').done === 4, null, {timeout: 10000});
    await closeDialogs();
    // 5 Invite a friend: sail home and open the cabin.
    await page.keyboard.press('KeyM');
    await page.locator('.sea-chart[open]').getByRole('button', {name: /Your island/}).first().click();
    await page.waitForFunction(() => window.__island.world.current?.id === 'home_islet' && !window.__island.world.busy && !document.querySelector('dialog[open]'), null, {timeout: 30000});
    await stand(-5.6, 7.2);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card-invite[open]').waitFor();
    await shot(`13-invite-card-${width}`);
    assert.equal(await doneCount(), 5, 'goal 5 done');
    await closeDialogs();
    console.log('quests at the end:', await quests());
    // A friend's visit: ISLE-FR3ND (Captain Gull), ring the friend's bell and win that wave together.
    await page.evaluate(async () => { const island = window.__island.island; island.visit('ISLE-FR3ND'); await island.load(); });
    await page.waitForFunction(() => !!window.__island.island.visiting?.ownerName);
    await stand(6.5, 11.4);
    await shot(`14-friend-visit-${width}`);
    await stand(8, 11.4);
    await page.keyboard.press('KeyE');
    await page.locator('.island-card-bell[open]').waitFor();
    await page.locator('.island-card[open] .island-card-body .kit-button').click();
    await page.waitForFunction(() => window.__island.waves?.island.state?.ships?.length > 0, null, {timeout: 30000, polling: 250});
    await page.waitForTimeout(2500);
    await shot(`15-friend-wave-${width}`);
    // Captain Gull's island has one cannon for wave 3: it may hold or fall; either way the toast says so.
    await page.waitForFunction(() => [...document.querySelectorAll('.u-toast')].some(node => /loot|broke through/.test(node.textContent)), null, {timeout: 240000, polling: 500});
    console.log('friend wave:', await page.evaluate(() => [...document.querySelectorAll('.u-toast')].map(node => node.textContent).join(' | ')));
    await shot(`16-friend-wave-end-${width}`);
    await page.evaluate(() => window.__island.island.sailHome());
    // Pirate Point in the class rehearsal (?demo=1&captains=40: the in-memory fake, simulated captains).
    await page.goto(`${env.url}/?demo=1&captains=40`);
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* fresh device */ } });
    await page.reload();
    await page.locator('#play').click();
    for (let i = 0; i < 6; i++) {
      await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.goal-card[open]')
        || (window.__island?.world.current?.id === 'saltreach_harbor' && window.__island.classDemo && !document.querySelector('dialog[open]')), null, {timeout: 30000});
      if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
      else if (await page.locator('dialog.cutscene[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click();
      else break;
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('KeyJ');
    await page.locator('.projector:not([hidden])').getByRole('button', {name: 'Ring the Pirate Point bell', exact: true}).click();
    await page.waitForFunction(() => !!window.__island.waves?.point?.controller.wave, null, {timeout: 15000});
    await shot(`17-projector-bell-${width}`);
    await page.keyboard.press('KeyJ');
    await page.evaluate(async () => { await window.__island.world.goTo('lighthouse_isle', {fast: true}); });
    for (let i = 0; i < 4; i++) {
      await page.waitForFunction(() => document.querySelector('dialog.cutscene[open]') || (window.__island.world.current?.id === 'lighthouse_isle' && !document.querySelector('dialog[open]')), null, {timeout: 30000});
      if (!await page.locator('dialog.cutscene[open]').count()) break;
      await page.getByRole('button', {name: 'Skip', exact: true}).click(); await page.waitForTimeout(400);
    }
    await page.waitForFunction(() => window.__island.waves.point.controller.state?.ships?.length > 0 && window.__island.experience.stats.drawn >= 10, null, {timeout: 30000, polling: 250});
    await page.waitForTimeout(1500);
    await shot(`18-pirate-point-battle-${width}`);
    await page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight(x, z), z); }, [4.5, -8]);
    await page.locator('.pirate-point-prompt .lamp-hold').waitFor({timeout: 15000});
    await page.keyboard.down('KeyE'); await page.waitForTimeout(2300); await page.keyboard.up('KeyE');
    await page.waitForFunction(() => window.__island.waves.point.finale?.state.relitAt != null, null, {timeout: 20000});
    await page.waitForTimeout(700);
    await shot(`19-pirate-point-lamps-${width}`);
    const captions = await page.evaluate(() => [...document.querySelectorAll('.lamp-status,.pirate-point-prompt,.sound-caption,.u-toast')]
      .filter(node => !node.hidden && node.getClientRects().length && node.textContent.trim()).map(node => node.textContent.trim()));
    console.log('captions at the lamps moment:', JSON.stringify(captions));
    await page.waitForFunction(() => window.__island.waves.point.controller.wave?.flagshipSunk === true || !window.__island.waves.point.controller.wave, null, {timeout: 30000});
    await page.waitForTimeout(1200);
    await shot(`20-pirate-point-flagship-${width}`);
  }
  assert.ok(!requests.some(path => path === '/api/islet'), 'no GET /api/islet with the islands on');
  // Headless Chrome on some Macs has no audio device; that error is printed, never hidden or counted as a pass.
  const audio = env.errors.filter(text => /AudioContext encountered an error from the audio device/.test(text));
  if (audio.length) console.log(`environment: ${audio.length} AudioContext audio-device errors (headless Chrome without an audio device)`);
  assert.deepEqual(env.errors.filter(text => !/Failed to load resource/.test(text) && !audio.includes(text)), [], 'No browser errors');
  console.log('external requests:', env.external.length);
} catch (error) {
  await page.screenshot({path: `${out}/failure.png`}).catch(() => {});
  console.log(await page.evaluate(() => ({place: window.__island?.world.current?.id, dialogs: [...document.querySelectorAll('dialog[open]')].map(node => node.className),
    quests: localStorage.getItem('plot_twist_first_quests_v1'), coins: document.querySelector('.hud-coins')?.textContent,
    toasts: [...document.querySelectorAll('.u-toast,.island-toast:not([hidden])')].map(node => node.textContent)})).catch(() => null));
  console.log('errors:', env.errors);
  throw error;
} finally { await env.close(); }
