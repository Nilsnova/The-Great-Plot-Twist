// A tower's upgrade tree on its card (D055) in real Chromium with the fake server, on a laptop (1280x720) and a phone
// (390x844): a level-5 cannon, mortar and swivel-gun nest open a big centred card with the tree (the trunk and two
// paths of three tiers joined by lines), one detail panel with one Buy button; buying walks up a path, the Bloons
// rule closes the other path above tier 1, nothing is wider than the screen and every tile is a big touch target.
// With TREE_SHOTS=<folder> it also saves a screenshot of each card there (the hand-over's pictures).
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

const SIZES = [[1280, 720], [390, 844]];
const SHOTS = process.env.TREE_SHOTS ?? '';

const look = page => page.evaluate(() => {
  const card = document.querySelector('.island-card[open]'), box = card.getBoundingClientRect();
  const tiles = [...card.querySelectorAll('.island-tree-step')].filter(node => node.getClientRects().length);
  const state = node => [...node.classList].find(name => /^is-(learned|ready|locked|closed)$/.test(name))?.slice(3);
  return {steps: tiles.map(node => `${node.dataset.step}:${state(node)}`), lines: card.querySelectorAll('.island-branch-lines path').length,
    primary: card.querySelectorAll('.island-tree-detail .island-primary').length, button: card.querySelector('.island-tree-detail .island-primary')?.textContent,
    line: card.querySelector('.island-tree-detail .island-skill-line')?.textContent, wide: card.classList.contains('island-card-wide'),
    docked: card.classList.contains('island-card-docked'), width: Math.round(box.width),
    overflow: document.documentElement.scrollWidth > window.innerWidth || tiles.some(node => { const r = node.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; }),
    smallest: Math.min(...tiles.map(node => Math.min(node.getBoundingClientRect().width, node.getBoundingClientRect().height)))};
});

for (const [width, height] of SIZES) {
  it(`the tree of a cannon, a mortar and a swivel nest at ${width}x${height}: tiles, lines, one Buy button, the Bloons rule`, async () => {
    const result = await evaluate.withPage(async page => {
      await page.setViewportSize({width, height});
      await page.evaluate(async () => {
        const {createIsland} = await window.g20Import('/src/island/index.js');
        const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
        const {on, emit} = await window.g20Import('/src/core/events.js');
        const transport = createFakeIslandTransport();
        const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
        transport.dev.setWaveBest(50); transport.dev.setCoins(60000); await island.load();
        for (const [spot, kind] of [['cannon_1', 'cannon'], ['cannon_2', 'mortar'], ['cannon_3', 'swivel']]) {
          await island.build(spot, kind);
          for (let level = 1; level < 5; level++) await island.upgrade(spot);
        }
        window.treeIsland = island;
      });
      const shots = {};
      const open = async spot => { await page.evaluate(id => { window.treeIsland.ui.close(); window.treeIsland.pick(id); }, spot); await page.waitForSelector('.island-card[open] .island-tree-step'); };
      const shot = async name => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${name}-${width}x${height}.png`}); };
      await open('cannon_1');
      shots.fresh = await look(page);
      for (const [path, tier] of [['a', 1], ['b', 1], ['a', 2]]) await page.evaluate(([p, t]) => window.treeIsland.buyTree('cannon_1', p, t), [path, tier]);
      await open('cannon_1');
      shots.grown = await look(page);
      await shot('cannon-tree');
      await page.click('.island-card[open] .island-tree-step[data-step="b2"]');
      shots.closed = await look(page);
      await page.evaluate(() => window.treeIsland.buyTree('cannon_2', 'b', 1));
      await open('cannon_2');
      shots.mortar = await look(page);
      await shot('mortar-tree');
      await open('cannon_3');
      shots.swivel = await look(page);
      await shot('swivel-tree');
      await page.keyboard.press('Escape');
      shots.closedOnEscape = await page.evaluate(() => !document.querySelector('.island-card[open]'));
      return shots;
    });
    expect(result.fresh.steps).toEqual(['level:learned', 'a1:ready', 'b1:ready', 'a2:locked', 'b2:locked', 'a3:locked', 'b3:locked']);
    expect(result.fresh).toMatchObject({lines: 6, primary: 1, button: 'Buy · 🪙 1,000', wide: true, docked: false, overflow: false});
    expect(result.fresh.smallest).toBeGreaterThanOrEqual(44);
    expect(result.grown.steps).toEqual(['level:learned', 'a1:learned', 'b1:learned', 'a2:learned', 'b2:closed', 'a3:ready', 'b3:closed']);
    expect(result.grown.button).toBe('Buy · 🪙 4,800');
    expect(result.closed.button).toBe('Closed');
    expect(result.mortar.steps).toContain('b1:learned');
    expect(result.mortar.line).toMatch(/Every/);
    expect(result.swivel.steps[0]).toBe('level:learned');
    expect(result.swivel.overflow).toBe(false);
    expect(result.closedOnEscape).toBe(true);
  });
}
