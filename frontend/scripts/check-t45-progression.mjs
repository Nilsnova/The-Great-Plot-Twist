// T45 local evidence: the four statue stages on the island and the Leaderboard card, with sample data only.
// Never reads live player records. Run from frontend: node scripts/check-t45-progression.mjs
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser, settle} from './world-browser-tools.js';

const DIR = '../docs/evidence/t45';
const SIZES = [[1280, 720], [375, 812]];
const WEEK = {scope: 'week', weekStart: '2026-11-09T00:00:00Z', weekEnd: '2026-11-16T00:00:00Z', entries: [
  {rank: 1, name: 'Captain Gull', wave: 45, crew: 3}, {rank: 1, name: 'Captain with a very long name', wave: 45, crew: 1},
  {rank: 3, name: 'Captain Brine', wave: 30, crew: 2}, {rank: 4, name: 'Captain Reed', wave: 12, crew: 1}]};
const EVER = {scope: 'all', weekStart: null, weekEnd: null, entries: [
  {rank: 1, name: 'Captain Gull', wave: 81, crew: 4}, {rank: 2, name: 'Captain Reed', wave: 64, crew: 1}]};

// Clicks the first visible button with one of these labels (a DOM click: cutscene buttons move while animating).
const press = (page, labels) => page.evaluate(labels => {
  for (const label of labels) {
    const b = [...document.querySelectorAll('button')].find(x => x.offsetParent && x.textContent === label);
    if (b) { b.click(); return; }
  }
}, labels);

async function enterIsland(page, url) {
  await page.goto(url + '/?islands=fake'); await page.locator('#play').click();
  for (let n = 0; n < 40; n++) {
    await page.waitForTimeout(700);
    if (await page.evaluate(() => window.__island?.island?.island && !document.querySelector('dialog[open]'))) break;
    await press(page, ['Skip', 'Got it', 'Create a game', 'Start']);
  }
  await page.waitForFunction(() => window.__island?.island?.island);
}

// Sets the fake island's best wave, closes any campaign popups, and reads the statue mesh.
async function showWave(page, wave) {
  await page.evaluate(async wave => { const i = window.__island.island; i.dev.setWaveBest(wave); await i.load(); i.ui.close(); }, wave);
  for (let n = 0; n < 12; n++) { await page.waitForTimeout(250); await press(page, ['Skip', 'Got it', 'Start']); }
  await page.evaluate(() => window.__island.island.ui.close()); await settle(page);
  return page.evaluate(() => { const m = window.__island.world.current.group.getObjectByName('island-wave-25'); return {visible: m.visible, stage: m.userData.stage ?? 0}; });
}

const env = await openWorldBrowser({hmr: false});
try {
  const {page} = env; await mkdir(DIR, {recursive: true});
  await enterIsland(page, env.url);
  for (const [wave, stage] of [[24, 0], [25, 1], [50, 2], [75, 3], [100, 4]]) {
    const state = await showWave(page, wave);
    assert.equal(state.visible, stage > 0, `statue visible at wave ${wave}`);
    if (stage) assert.equal(state.stage, stage, `statue stage at wave ${wave}`);
    if (stage) for (const [width, height] of SIZES) {
      await page.setViewportSize({width, height}); await settle(page);
      await page.screenshot({path: `${DIR}/island-wave-${wave}-${width}.png`});
    }
  }
  console.log('T45 statue: hidden at 24, stages 1-4 at waves 25/50/75/100; island captured at 1280×720 and 375×812.');
  await showWave(page, 27);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({width, height});
    for (const [name, data] of [['week', WEEK], ['all', EVER]]) {
      await page.evaluate(({data}) => {
        const i = window.__island.island;
        i.ui.leaderboardCard({data, scope: data.scope, progress: {wave: 27, shield: 'silver', statue: 'bronze',
          nextShield: {wave: 30, name: 'gold'}, nextStatue: {wave: 50, name: 'silver'}}}, {retry() {}, choose() {}});
      }, {data});
      const card = page.locator('.island-card-leaderboard[open]'); await card.waitFor();
      assert.ok(await card.evaluate(el => el.scrollWidth <= el.clientWidth), 'no sideways scroll');
      const sizes = await card.locator('button').evaluateAll(list => list.map(b => b.getBoundingClientRect()));
      assert.ok(sizes.every(b => b.width >= 44 && b.height >= 44), '44 px controls');
      const contrast = await card.evaluate(async root => {
        const h = await import('/scripts/a11y-helpers.js');
        return [...root.querySelectorAll('.island-leaderboard-crew, .island-progress *, .island-leaderboard-tabs button, .island-purpose')].filter(el => el.textContent).map(el => {
          let bg = null;
          for (let n = el; n && !bg; n = n.parentElement) { const c = h.parseColour(getComputedStyle(n).backgroundColor); if (c?.a === 1) bg = c; }
          return h.contrastRatio(h.parseColour(getComputedStyle(el).color), bg);
        });
      });
      assert.ok(contrast.every(value => value >= 4.5), `text contrast ${contrast.map(v => v.toFixed(1))}`);
      await page.screenshot({path: `${DIR}/card-${name}-${width}.png`});
    }
    await page.keyboard.press('Escape');
  }
  console.log('T45 card: week and all-time boards at 1280×720 and 375×812; no sideways scroll, 44 px controls, contrast ≥ 4.5.');
  await page.route('**/t45-statue-preview', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><body></body>'}));
  await page.goto(env.url + '/t45-statue-preview');
  await page.evaluate(async () => {
    const {paint} = await import('/src/art/paint.js');
    const {drawWaveStatue, STATUE_STAGES} = await import('/src/art/milestones.js');
    document.body.style.cssText = 'margin:0;padding:24px;display:flex;gap:16px;background:#173d45;color:#fff2ce;font:18px sans-serif';
    STATUE_STAGES.forEach((stage, n) => {
      const card = document.createElement('div'); card.style.cssText = 'display:grid;justify-items:center;padding:12px;background:#24525a;border:2px solid #b89752;border-radius:12px';
      const canvas = paint(c => drawWaveStatue(c, n + 1), [48, 64], 3); canvas.style.width = '144px'; canvas.style.height = '192px';
      const label = document.createElement('span'); label.textContent = `${stage.name} · wave ${stage.wave}`;
      card.append(canvas, label); document.body.append(card);
    });
  });
  await page.setViewportSize({width: 760, height: 300});
  await page.screenshot({path: `${DIR}/statue-stages.png`});
  console.log('T45 statue stage sheet captured.');
} finally { await env.close(); }
