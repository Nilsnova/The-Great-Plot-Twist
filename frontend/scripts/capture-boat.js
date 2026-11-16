// D057 evidence: the own boat's two games (src/pirates/boat/scene.js) at 1280x720 and 390x844, driven frame by frame
// (no real clock) so every capture is the same: the picture card, a round in play and the result card.
// node scripts/capture-boat.js   (SHOTS_DIR: where the PNGs go, default captures/boat)
import {mkdir, writeFile} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';

const shotsDir = process.env.SHOTS_DIR ?? 'captures/boat';
await mkdir(shotsDir, {recursive: true});
const env = await openWorldBrowser(), {page} = env, report = {checked: new Date().toISOString(), shots: [], errors: env.errors};
const SIZES = [['desktop', 1280, 720], ['phone', 390, 844]];

// One round, driven in steps of 50 ms. plan(t, game) plays: the broadside fires when a ship is near the middle,
// the dash steers for the next coin. stopAt: seconds of the round (negative: the picture card).
async function round(game, stopAt, {play = true, finish = false} = {}) {
  return page.evaluate(async ([game, stopAt, play, finish]) => {
    document.querySelectorAll('.boat-game').forEach(node => node.remove());
    const scene = await import('/src/pirates/boat/scene.js'), rules = await import('/src/pirates/boat/rules.js');
    const wave = 34, code = 'ISLE-K7Q2M';
    const d = rules.boatDifficulty(game, wave), salt = rules.boatSalt(code, wave, game);
    const passes = rules.passesOf(salt, d), items = rules.itemsOf(salt, d);
    window.__boat?.dispose();
    const g = window.__boat = scene.createBoatGame({container: document.body, game, wave, code, autoplay: false,
      onFinish: async ({stars}) => ({line: stars ? `+🪙 ${rules.coinsFor(stars, wave)}!` : 'No stars this time.', coins: stars ? 1 : 0})});
    const end = finish ? 20.4 : stopAt;
    let t = -3, shots = 0, stopAfter = Infinity;
    while (t < Math.min(end, stopAfter)) {
      if (play && t >= 0) {
        const s = Math.floor(t * 10);
        if (game === 'broadside') {
          const pass = rules.passAt(passes, s);
          const before = g.samples.size;
          if (pass && Math.abs(rules.enemyX(pass, s + .5) - 50) < d.width * .3) g.shoot();
          // A still of the play: the second ship blowing up, 0.3 s after the shot.
          if (g.samples.size > before && ++shots === 2 && !finish && play && stopAt > 0) stopAfter = t + .3;
        } else {
          const next = items.find(item => item.kind === 'coin' && item.at >= s + 1);
          g.aim(next ? next.x : 50);
        }
      }
      g.update(.05); t += .05;
    }
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    return {phase: g.phase, samples: g.samples.size};
  }, [game, stopAt, play, finish]);
}

await page.goto(env.url + '/');
await page.waitForTimeout(1500);
// The page behind is the game's front door; the round covers it. Keep only the overlay's look.
await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(node => node.close()); for (const node of [...document.body.children]) node.remove(); });
for (const [name, width, height] of SIZES) {
  await page.setViewportSize({width, height});
  for (const game of ['broadside', 'dash']) {
    for (const [label, stopAt, options] of [['1-intro', -1.6, {play: false}], ['2-play', game === 'broadside' ? 19 : 8.6, {}], ['3-result', 0, {finish: true}]]) {
      const state = await round(game, stopAt, options);
      await page.waitForTimeout(250);
      const path = `${shotsDir}/boat-${game}-${label}-${name}-${width}x${height}.png`;
      await page.screenshot({path});
      report.shots.push({path, ...state});
    }
  }
}
// The wreck's card once she sails (wave 34, repaired; the broadside paid at this wave already).
for (const [name, width, height] of SIZES) {
  await page.setViewportSize({width, height});
  await page.evaluate(async () => {
    window.__boat?.dispose(); window.__card?.dispose();
    const {createIslandUi} = await import('/src/island/ui.js'), {wreckModel} = await import('/src/island/card-model.js');
    const {campaignOf} = await import('/src/campaign/index.js');
    const ui = window.__card = createIslandUi({container: document.body});
    ui.wreckCard(wreckModel({campaign: campaignOf({waveBest: 34, campaign: {wave: 34, wreck: {paid: 500, goal: 500, gifts: [25, 100]}}}), coins: 412,
      boat: {open: true, games: [{id: 'broadside', paid: true, best: 36}, {id: 'dash', paid: false, best: 36}]}}), {});
  });
  await page.waitForTimeout(400);
  const path = `${shotsDir}/boat-card-${name}-${width}x${height}.png`;
  await page.screenshot({path});
  report.shots.push({path});
}
await writeFile(`${shotsDir}/boat.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await env.close();
