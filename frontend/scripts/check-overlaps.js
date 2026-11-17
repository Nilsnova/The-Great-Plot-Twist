// The overlap audit (owner, 15 Nov: "ensure there are no overlaps or weird overlaps"): plays the island game
// with the fake server (?islands=fake) through its main screens and, for each, measures every visible HUD and
// overlay box (coins, Menu, Goals, wave bar, first-wave hint, toasts, the F button, prompts, banners, cards).
// It fails when two of them intersect (a card over the HUD is meant; a toast over a card's title or × is not),
// when a label or button clips its text, or when the page scrolls sideways.
//   node scripts/check-overlaps.js [--all] [--shots folder]
//     default: the main HUD states at 1280x720, 390x844 and 844x390
//     --all:   every state at 1280x720, 1440x900, 390x844, 375x667 and 844x390
//     --shots: a screenshot per state and viewport in that folder
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openWorldBrowser} from './world-browser-tools.js';

const args = process.argv.slice(2), all = args.includes('--all');
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shots) await mkdir(shots, {recursive: true});
const VIEWPORTS = all ? [[1280, 720], [1440, 900], [390, 844], [375, 667], [844, 390]] : [[1280, 720], [390, 844], [844, 390]];

// The boxes the audit measures: [name, selector]. Every match counts (two toasts are two boxes).
const TARGETS = [
  ['coins', '.hud-play .hud-coins'], ['menu', '.hud-play .hud-menu'], ['goals', '.hud-play .quest-strip'],
  ['interact', '.hud-play .interact:not(.floating)'], ['arrival', '.hud-arrival'],
  ['toast', '.u-toast'], ['demo-toast', '.demo-toast'],
  ['wave-bar', '.pirate-bar'], ['goal-hint', '.pirate-goal-hint'], ['countdown', '.pirate-countdown'], ['boss', '.pirate-boss'],
  ['action', '.pirate-hud>.pirate-musket'], ['prompt', '.pirate-hud>.pirate-prompt'], ['banner', '.pirate-banner'],
  ['break', '.pirate-break'], ['next-mini', '.pirate-next-mini'], ['hold', '.pirate-hold'],
  ['island-banner', '.island-banner'], ['visit-chip', '.island-visit'], ['move-bar', '.move-bar,.island-move-bar'],
  ['village-bar', '.island-village-mode'],
  ['narrator', '.narrator-card'], ['caption', '.sound-caption'], ['connection', '.connection-banner'], ['touch', '.touch-controls>*,.touch-stick,.touch-button'],
  ['card', 'dialog[open]'],
];
// Pairs that are meant to touch: a card (a modal) sits over the HUD behind it; the toasts sit over a card
// (in the top layer) but must not cover its title or buttons, checked separately.
const MEANT = new Set(['card']);

function measure(targets) {
  const seen = new Set(), boxes = [], clipped = [], modalOpen = !!document.querySelector('dialog:modal');
  const visible = element => {
    if (!element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || Number(style.opacity) < .05) return false;
    for (let node = element; node; node = node.parentElement) if (Number(getComputedStyle(node).opacity) < .05) return false;
    const r = element.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  for (const [name, selector] of targets) {
    for (const element of document.querySelectorAll(selector)) {
      if (seen.has(element) || !visible(element)) continue;
      // A box inside another measured box is part of it (the wave bar's chips, a card's buttons).
      if ([...seen].some(other => other.contains(element))) continue;
      // Behind an open card (a modal dialog in the top layer) the HUD is covered on purpose: only the card and
      // the toasts (a top-layer popover) are on top.
      if (modalOpen && !element.matches('dialog:modal, .u-toast') && !element.closest('dialog:modal')) continue;
      seen.add(element);
      const r = element.getBoundingClientRect();
      boxes.push({name, cls: String(element.className).slice(0, 60), left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom),
        modal: element.matches('dialog:modal')});
    }
  }
  // Clipped text: a label or button whose text is wider than its box (ellipsis or hidden overflow).
  for (const element of document.querySelectorAll('button, .kit-button, label, .u-toast-text, .pirate-bar *, .hud-play *, dialog[open] h2, dialog[open] strong, dialog[open] .kit-chip')) {
    if (!visible(element) || !element.textContent.trim() || element.closest('.kit-sr-only')) continue;
    const style = getComputedStyle(element);
    if (style.overflowX === 'visible' && style.textOverflow !== 'ellipsis') continue;
    if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0)
      clipped.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} "${element.textContent.trim().slice(0, 40)}" ${element.scrollWidth}>${element.clientWidth}`);
  }
  // The toasts against a card's header: its title and × (the toasts float over the card's body for a few seconds,
  // and taps go through them).
  const covers = [];
  const toasts = [...document.querySelectorAll('.u-toast')].filter(visible).map(element => element.getBoundingClientRect());
  for (const part of document.querySelectorAll('dialog[open] .kit-modal-header, dialog[open] h2')) {
    if (!visible(part)) continue;
    const r = part.getBoundingClientRect();
    for (const t of toasts) if (t.left < r.right && r.left < t.right && t.top < r.bottom && r.top < t.bottom)
      covers.push(`toast over ${part.tagName.toLowerCase()} "${part.textContent.trim().slice(0, 30)}"`);
  }
  const page = {scroll: document.documentElement.scrollWidth > innerWidth + 1, width: innerWidth, height: innerHeight};
  return {boxes, clipped, covers, page};
}

/** The pairs of boxes that intersect (by more than 2 px each way), leaving out a card over the HUD. */
function overlaps(boxes, meant = MEANT) {
  const found = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (meant.has(a.name) || meant.has(b.name)) continue;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 2 && h > 2) found.push(`${a.name} × ${b.name} (${w}×${h} px)`);
  }
  return found;
}

const env = await openWorldBrowser(), {page} = env, problems = [], report = [];
const wait = ms => page.waitForTimeout(ms);
const island = (fn, arg) => page.evaluate(([source, value]) => (0, eval)(source)(window.__island.island, value), [String(fn), arg]);
const waveOf = () => page.evaluate(() => { const w = window.__island.waves?.island.wave;
  return w ? {done: w.done, pause: !!w.pause, time: w.state.time, phase: w.state.phase, ashore: w.state.boarders?.length ?? 0, hacking: (w.state.boarders ?? []).filter(item => item.state === 'hacking').length} : null; });
async function until(test, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const state = await waveOf(); if (test(state)) return state; await wait(200); }
  return null;
}
const stand = (x, z) => page.evaluate(([x, z]) => { const g = window.__island; g.player.position.set(x, g.world.current.groundHeight?.(x, z) ?? 1.03, z); g.view.setPlace('home_islet', g.player.position); }, [x, z]);

async function audit(state, {keep = () => true, prepare = null} = {}) {
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({width, height});
    if (prepare) await prepare();
    await wait(450);
    if (!(await keep())) { report.push({state, width, height, skipped: true}); continue; }
    const seen = await page.evaluate(measure, TARGETS);
    const hits = overlaps(seen.boxes), label = `${state} @ ${width}x${height}`;
    for (const hit of hits) problems.push(`${label}: ${hit}`);
    for (const item of seen.clipped) problems.push(`${label}: clipped ${item}`);
    for (const item of seen.covers) problems.push(`${label}: ${item}`);
    if (seen.page.scroll) problems.push(`${label}: the page scrolls sideways`);
    report.push({state, width, height, boxes: seen.boxes.map(box => `${box.name} [${box.left},${box.top},${box.right},${box.bottom}]`), hits, clipped: seen.clipped, covers: seen.covers});
    if (shots) await page.screenshot({path: join(shots, `${state}-${width}x${height}.png`)});
  }
  await page.setViewportSize({width: 1280, height: 720});
}

try {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(`${env.url}/?islands=fake&fakeplayer=me&fakename=Nils`);
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* fresh device */ } });
  await page.reload();
  await page.locator('.shell-screen[open]').waitFor();
  await page.locator('#play').click();
  // The front door's cards until the player stands on the island (as scripts/capture-captain-tree.js).
  for (let i = 0; i < 12; i++) {
    await page.waitForFunction(() => document.querySelector('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open]')
      || (window.__island?.world.current?.id === 'home_islet' && window.__island.island?.island && !document.querySelector('dialog[open]')), null, {timeout: 60000, polling: 100});
    if (await page.locator('.games-card[open]').count()) {
      await page.locator('.games-card[open] .games-create-button').waitFor();
      await wait(400);
      await page.locator('.games-card[open]').getByRole('button', {name: 'Create a game', exact: true}).click();
    } else if (await page.locator('.island-card-lobby[open]').count()) {
      if (i < 11 && all) await audit('lobby');
      await page.keyboard.press('Escape');
    } else if (await page.locator('.goal-card[open]').count()) await page.locator('.goal-card[open]').getByRole('button', {name: 'Got it', exact: true}).click();
    else if (await page.locator('dialog.cutscene[open],.tutorial-card[open]').count()) await page.getByRole('button', {name: 'Skip', exact: true}).click({timeout: 5000}).catch(() => {});
    else {
      // T52: the intro, the goal card and the arrival wait for the island (tutorial/gate.js), so they can open a
      // moment after the player stands on it. Only a quiet island for a while ends the front door.
      await wait(2500);
      if (await page.locator('dialog.cutscene[open],.tutorial-card[open],.goal-card[open],.games-card[open],.island-card-lobby[open],dialog[open]').count()) continue;
      break;
    }
    await wait(300);
  }
  await page.waitForFunction(() => window.__island?.world.current?.id === 'home_islet' && window.__island.island && !document.querySelector('dialog[open]'), null, {timeout: 60000});
  await page.evaluate(() => { window.__island.settings.hour = 11; window.__island.settings.fastTime = false; });
  // T52: Settings › Tutorials off, so the unlock cards of the jump to wave 6 below do not cover the audited HUD.
  await page.evaluate(async () => (await import('/src/settings/preferences.js')).setPreferences({tutorials: false}));
  await island(async i => { i.dev.setCoins(2000); i.dev.setWaveBest(6); i.dev.setCaptain(3); await i.load(); });
  // Walls on the boarders' way, so the wave shows the guide's axes and wall bars.
  await island(async i => { for (const spot of ['wall_1', 'wall_3', 'wall_7', 'wall_8', 'wall_9', 'cannon_1']) await i.build(spot); await i.load(); });
  await stand(0, 6);
  await wait(1200);

  // Between waves: the guide's preview, the Goals panel open, then folded.
  await audit('island-idle');
  const fold = page.locator('.quest-strip .quest-fold');
  if (await fold.count()) { await fold.click(); await audit('island-goals-folded'); await fold.click(); }
  // A long toast (the one in the owner's screenshot).
  const toast = () => island(i => i.ui.toast('The match board is up at the Harbor. Pick a stake and sail over to play.', 'info', 'Walk to the Harbor sign.'));
  await audit('island-toast', {prepare: toast, keep: () => page.locator('.u-toast').count().then(n => n > 0)});

  // COC-49/COC-02: village mode's bar over the fitted base view (and with a toast).
  const managing = () => island(i => i.managing === true);
  await audit('village-mode', {prepare: async () => { if (!(await managing())) await island(i => i.toggleVillage()); }, keep: managing});
  await audit('village-mode-toast', {prepare: toast, keep: managing});
  await island(i => { if (i.managing) i.toggleVillage(); }); await wait(300);

  if (all) {
    for (const [state, open, selector] of [
      ['base-overview', i => i.openOverview(), '.island-card[open]'],
      ['building-card', i => i.pick('cannon_1'), '.island-card[open]'],
      ['captain-skills', i => i.openCaptain('skills'), '.island-card-captain[open]'],
      ['tech-hub', i => i.openTechHub(), '.island-card[open]'],
      ['harbor', i => i.openHarbor(), '.island-card[open]'],
      ['crew', i => i.openCrew(), '.island-card[open]'],
      ['lobby-card', i => i.openLobby(), '.island-card[open]'],
    ]) {
      await island(open);
      await page.locator(selector).first().waitFor({timeout: 10000}).catch(() => {});
      await wait(500);
      await audit(state);
      await audit(`${state}-toast`, {prepare: toast});
      await island(i => i.ui.close()); await wait(300);
    }
  }

  // A wave: the first-wave hint at its start, then boarders ashore with the guide, the wall bars and the HUD.
  const rung = await island(async i => { const answer = await i.ringBell(); return {ok: answer?.ok, code: answer?.code ?? null}; });
  assert.ok(rung.ok, `the bell rang (${JSON.stringify(rung)})`);
  await until(state => state && state.phase === 'running' && state.time > .3, 60000);
  await audit('wave-hint', {keep: () => page.locator('.pirate-goal-hint:not([hidden])').count().then(n => n > 0)});
  await until(state => state && (state.ashore > 0 || state.done), 90000);
  await until(state => !state || state.done || state.hacking > 0, 20000);
  await wait(1500);
  await audit('wave-boarders', {keep: () => waveOf().then(state => state && !state.done)});
  await audit('wave-toast', {prepare: toast, keep: () => waveOf().then(state => state && !state.done)});

  console.log(JSON.stringify(report, null, 1));
  if (shots) await writeFile(join(shots, 'report.json'), JSON.stringify({report, problems}, null, 1));
  assert.deepEqual(env.errors.filter(text => !/Failed to load resource/.test(text)), [], 'No browser errors');
  if (problems.length) { console.log(`\n${problems.length} overlap problems:\n${problems.join('\n')}`); process.exitCode = 1; }
  else console.log(`\nNo overlaps in ${report.filter(item => !item.skipped).length} state × viewport checks.`);
} catch (error) {
  await page.screenshot({path: join(shots ?? '/tmp', 'check-overlaps-failure.png')}).catch(() => {});
  throw error;
} finally { await env.close(); }
