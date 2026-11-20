// The skill tree and the Tech hub as real trees (src/island/skill-tree.js) in real Chromium with the fake server, on a
// laptop (1280x720) and a phone (375x812): tiles in the three states joined by lines, one detail panel with one big
// button for the tapped tile, keyboard (Enter on a tile, Enter on Learn), the respec and Escape, big touch targets,
// and nothing wider than the screen (a phone shows one branch at a time).
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

const SIZES = [[1280, 720], [375, 812]];
// What the open card shows: the visible tiles' states, the one detail panel, overflow and the smallest tile.
const look = (page, tiles) => page.evaluate(tiles => {
  const card = document.querySelector('.island-card[open]');
  const shown = [...card.querySelectorAll(tiles)].filter(node => node.getClientRects().length);
  const box = card.getBoundingClientRect();
  return {states: [...new Set(shown.map(node => [...node.classList].find(name => /^is-(learned|ready|locked|closed)$/.test(name))))].sort(),
    shown: shown.length, lines: card.querySelectorAll('.island-branch-lines path').length,
    details: card.querySelectorAll('.island-skill-detail').length, primary: card.querySelectorAll('.island-skill-detail .island-primary').length,
    detailName: card.querySelector('.island-skill-detail strong')?.textContent, button: card.querySelector('.island-skill-detail .island-primary')?.textContent,
    disabled: card.querySelector('.island-skill-detail .island-primary')?.disabled, reason: card.querySelector('.island-skill-detail .island-reason')?.textContent,
    wide: card.classList.contains('island-card-wide'), width: Math.round(box.width),
    overflow: document.documentElement.scrollWidth > window.innerWidth || card.scrollWidth > card.clientWidth
      || shown.some(node => { const r = node.getBoundingClientRect(); return r.left < box.left || r.right > box.right; }),
    smallest: Math.min(...shown.map(node => Math.min(node.getBoundingClientRect().width, node.getBoundingClientRect().height))),
    branchTabs: [...card.querySelectorAll('.island-branch-tab')].filter(node => node.getClientRects().length).length};
}, tiles);

for (const [width, height] of SIZES) {
  it(`the captain's skill tree at ${width}x${height}: three states, one detail with one button, keyboard, respec, no overflow`, async () => {
    const result = await evaluate.withPage(async page => {
      await page.setViewportSize({width, height});
      await page.evaluate(async () => {
        const {createIsland} = await window.g20Import('/src/island/index.js');
        const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
        const {on, emit} = await window.g20Import('/src/core/events.js');
        const transport = createFakeIslandTransport();
        const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
        transport.dev.setWaveBest(20); transport.dev.setCoins(2000); transport.dev.setCaptain(3); await island.load();
        for (const skill of ['steady_aim', 'hot_shot']) await island.learnSkill(skill);
        island.ui.close();
        island.openCaptain('skills');
        window.testIsland = island;
      });
      await page.locator('.island-card[open] .island-tree').waitFor();
      const first = await look(page, '.island-skill');
      const firstFocus = await page.evaluate(() => document.activeElement?.dataset.skill ?? null);
      // A tap on a tile you can learn: one detail, one big Learn button.
      await page.locator('[data-skill="quick_hands"]').click();
      const ready = await look(page, '.island-skill');
      // The keyboard: Enter on a locked tile shows why; Enter on a ready tile then on Learn learns it.
      await page.locator('[data-skill="far_sight"]').focus(); await page.keyboard.press('Enter');
      const locked = await look(page, '.island-skill');
      await page.locator('[data-skill="quick_hands"]').focus(); await page.keyboard.press('Enter');
      const focusKept = await page.evaluate(() => document.activeElement?.dataset.skill ?? null);
      await page.locator('[data-focus="learn"]').focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-skill="quick_hands"]')?.classList.contains('is-learned'));
      const learned = await page.evaluate(() => ({points: document.querySelector('.island-points').textContent,
        far: [...document.querySelector('[data-skill="far_sight"]').classList].includes('is-ready')}));
      // The phone's branch buttons switch the branch on show.
      let switched = null;
      if (await page.locator('.island-branch-tab').first().isVisible()) {
        await page.locator('.island-branch-tab', {hasText: 'Shipwright'}).click();
        switched = await page.evaluate(() => [...document.querySelectorAll('.island-branch')].filter(node => node.getClientRects().length).map(node => node.dataset.branch));
      }
      // The respec: ask, then confirm; every skill is forgotten.
      await page.locator('[data-focus="respec"]').click();
      await page.locator('[data-focus="respec"]', {hasText: 'Yes, reset'}).click();
      await page.waitForFunction(() => !document.querySelector('.island-skill.is-learned'));
      const reset = await page.evaluate(() => document.querySelector('.island-points').textContent);
      await page.keyboard.press('Escape');
      const closed = await page.evaluate(() => !document.querySelector('.island-card[open]'));
      await page.evaluate(() => window.testIsland.dispose());
      return {first, firstFocus, ready, locked, focusKept, learned, switched, reset, closed};
    });
    const phone = width < 640;
    expect(result.first).toMatchObject({states: ['is-closed', 'is-learned', 'is-locked', 'is-ready'], details: 1, primary: 1, wide: true, overflow: false,
      shown: phone ? 7 : 21, branchTabs: phone ? 3 : 0});
    expect(result.first.width).toBeGreaterThan(phone ? 355 : 1000);
    expect(result.first.lines).toBeGreaterThan(0);
    expect(result.first.smallest).toBeGreaterThanOrEqual(44);
    expect([result.firstFocus, result.first.detailName]).toEqual(['hot_shot', 'Hot shot']); // opens on the picked tile (the one learned last)
    expect(result.ready).toMatchObject({details: 1, primary: 1, detailName: 'Quick hands', button: 'Learn', disabled: false, overflow: false});
    expect(result.locked).toMatchObject({details: 1, primary: 1, detailName: 'Far sight', disabled: true, reason: 'Learn Quick hands first.'});
    expect(result.focusKept).toBe('quick_hands');
    expect(result.learned).toEqual({points: 'Skill points: 4', far: true});
    expect(result.switched).toEqual(phone ? ['shipwright'] : null);
    expect(result.reset).toBe('Skill points: 10');
    expect(result.closed).toBe(true);
  });

  it(`the Tech hub tree at ${width}x${height}: three states, one detail with one Research button, no overflow`, async () => {
    const result = await evaluate.withPage(async page => {
      await page.setViewportSize({width, height});
      await page.evaluate(async () => {
        const {createIsland} = await window.g20Import('/src/island/index.js');
        const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
        const {on, emit} = await window.g20Import('/src/core/events.js');
        const transport = createFakeIslandTransport({flags: {more_tower_spots: true}});
        const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
        transport.dev.setWaveBest(16); transport.dev.setCoins(2000); await island.load();
        await island.build('cannon_1', 'cannon');
        await island.build('cannon_2', 'mortar');
        await island.build('cannon_8', 'cannon');
        await island.research({branch: 'cannon'});
        island.ui.close();
        island.openTechHub();
        window.testIsland = island;
      });
      await page.locator('.island-card[open] .island-tech-tree').waitFor();
      const first = await look(page, '.island-research-option');
      const truncatedBranches = await page.locator('.island-branch-tab span:last-child:visible').evaluateAll(labels =>
        labels.filter(label => label.scrollWidth > label.clientWidth).map(label => label.textContent));
      const buildings = page.locator('.island-tech-buildings');
      const acceptedIds = await buildings.getAttribute('data-spot-ids');
      const acceptedLabels = await buildings.textContent();
      const option = page.locator('.island-research-option[data-option="long_guns"]');
      await option.focus(); await page.keyboard.press('Enter');
      const picked = await look(page, '.island-research-option');
      const detail = await page.locator('.island-tech-scope').textContent();
      await page.evaluate(() => window.testIsland.setBattle(true));
      const reserved = await look(page, '.island-research-option');
      await page.keyboard.press('Escape');
      const closed = await page.evaluate(() => !document.querySelector('.island-card[open]'));
      await page.evaluate(() => window.testIsland.dispose());
      return {first, picked, closed, acceptedIds, acceptedLabels, detail, reserved, truncatedBranches};
    });
    const phone = width < 640;
    expect(result.first).toMatchObject({states: ['is-learned', 'is-locked', 'is-ready'], details: 1, primary: 1, detailName: 'Rapid II', wide: true, overflow: false,
      shown: phone ? 5 : 20, branchTabs: phone ? 4 : 0});
    expect(result.first.smallest).toBeGreaterThanOrEqual(44);
    expect(result.truncatedBranches).toEqual([]);
    expect(result.picked).toMatchObject({details: 1, primary: 1, detailName: 'Long guns', button: 'Pick · 🪙 360', disabled: false, overflow: false});
    expect([result.acceptedIds, result.acceptedLabels]).toEqual(['cannon_1 cannon_8', '2 built cannons · #1, #8']);
    expect(result.detail).toContain('Research adds this bonus automatically.');
    expect(result.detail).toContain('Tower upgrade paths are separate.');
    expect(result.reserved).toMatchObject({disabled: true, reason: 'Between waves only.'});
    expect(result.closed).toBe(true);
  });
}

it('keeps the current island’s accepted defenses when a paid research answer from a visit arrives after sailing home', async () => {
  const result = await evaluate.withPage(page => page.evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport, FAKE_FRIEND} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const base = createFakeIslandTransport({friends: [{...FAKE_FRIEND, waveBest: 25}]}), messages = [];
    let finishReply, submitted;
    const paid = new Promise(resolve => { submitted = resolve; });
    const transport = {...base, async post(path, body) {
      const answer = await base.post(path, body);
      if (path !== '/api/island/research') return answer;
      return new Promise(resolve => { finishReply = () => resolve(answer); submitted(); });
    }};
    const island = createIsland({container: document.body, on, mode: 'fake', transport, storage: null,
      emit: event => { messages.push(event); emit(event); }, menu: () => () => {}});
    const read = () => ({code: island.gameCode, cannon: document.querySelector('.island-tech-buildings')?.dataset.spotIds,
      coins: island.island.coins, tier: island.campaign.research.tiers.cannon.tier});
    try {
      base.dev.setWaveBest(25); base.dev.setCoins(2000); await island.load();
      await island.build('cannon_2', 'cannon');
      island.visit(FAKE_FRIEND.code); await island.load(); island.openTechHub();
      const visitor = read();
      const pending = island.research({branch: 'cannon'}); await paid;
      await island.sailHome(); island.openTechHub();
      const home = read();
      finishReply(); await pending;
      return {visitor, home, after: read(), visitAccepted: base.world.islands.get(FAKE_FRIEND.code).research.includes('cannon'),
        confirmedToasts: messages.filter(event => event.type === 'tech_researched').length};
    } finally { island.dispose(); }
  }));
  expect(result.visitor).toMatchObject({code: 'FR3ND', cannon: 'cannon_1', tier: 0});
  expect(result.home).toMatchObject({code: 'K7Q2M', cannon: 'cannon_2', tier: 0});
  expect(result.after).toEqual(result.home);
  expect(result.visitor.coins - result.after.coins).toBe(180);
  expect(result.visitAccepted).toBe(true);
  expect(result.confirmedToasts).toBe(0);
});
