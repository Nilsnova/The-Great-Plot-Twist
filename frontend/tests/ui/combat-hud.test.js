// Real play-header and combat components: narrow layouts, true first-wave onboarding and weather access.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

async function mount(page, wave = 41) {
  await page.evaluate(async wave => {
    for (const sheet of ['/src/ui/base.css', '/src/ui/kit/kit.css', '/src/ui/styles.css', '/src/ui/readability.css', '/src/ui/devices.css']) await window.g20Import(sheet);
    localStorage.clear();
    const {createHud} = await window.g20Import('/src/ui/hud.js'), {createWaveHud} = await window.g20Import('/src/pirates/hud.js');
    const game = document.createElement('main'); game.id = 'game'; document.body.append(game);
    window.playHud = createHud(game, {start() {}, focus() {}, menu() {}, hasIsland: () => true});
    playHud.setCoinSource('island'); playHud.setCoins(7180); playHud.start();
    playHud.update(null, {waveStatus: {bestWave: 40, currentWave: wave}});
    window.battle = createWaveHud({container: game, reducedMotion: () => true});
    window.battleState = {wave, shipsLeft: 7, boardersLeft: 3, islandHp: 0, maxIslandHp: 100};
    battle.goalHint(true); battle.bar(battleState); battle.health({hp: 0, maxHp: 100, down: true});
    battle.down({seconds: 12, alone: false}); battle.loot(950); battle.boss('Warship approaching!');
    battle.event({id: 'fog_bank', icon: '🌫️', title: 'Fog bank', line: 'Thick fog rolls in. Cannons have shorter range until it lifts.', open: true});
    await document.fonts.ready;
  }, wave);
  await page.waitForTimeout(60);
}

async function bounds(page) {
  return page.evaluate(() => {
    const q = selector => document.querySelector(selector), rect = selector => q(selector).getBoundingClientRect();
    const bar = rect('.pirate-bar'), headers = ['.hud-coins', '.hud-menu'].map(rect);
    const overlaps = box => box.left < bar.right && box.right > bar.left && box.top < bar.bottom && box.bottom > bar.top;
    const controls = [...q('.pirate-bar').querySelectorAll('button, summary')].filter(el => el.getClientRects().length && !el.hidden);
    const visibleText = [...q('.pirate-bar').querySelectorAll('strong, .pirate-health-text, .pirate-bar-loot, .pirate-down-line, .pirate-down-clock, .pirate-event-line, .pirate-goal-hint-word')]
      .filter(el => el.getClientRects().length && !el.closest('[hidden]') && (!el.closest('details') || el.closest('details').open || el.closest('summary')));
    return {overlaps: headers.some(overlaps), within: bar.left >= 8 && bar.right <= innerWidth - 8,
      targets: controls.every(el => {const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44;}),
      fonts: visibleText.every(el => parseFloat(getComputedStyle(el).fontSize) >= 17),
      textFits: visibleText.every(el => el.scrollWidth <= el.clientWidth + 1),
      label: q('.pirate-bar').getAttribute('aria-label'), health: q('.pirate-health').getAttribute('aria-label'),
      hint: !q('.pirate-goal-hint').hidden, eventOpen: q('.pirate-event').open,
      down: q('.pirate-down').textContent, loot: q('.pirate-bar-loot').textContent,
      barBottom: bar.bottom, bossTop: rect('.pirate-boss').top};
  });
}

it('fits the actual purse/Menu at desktop, phone and 320 px, including live large-purse resize and zero health', async () => {
  await evaluate.withPage(async page => {
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({width, height: width === 1280 ? 720 : 812}); await mount(page);
      for (const large of [false, true]) {
        if (large) { await page.evaluate(() => playHud.setCoins(Number.MAX_SAFE_INTEGER)); await page.waitForTimeout(60); }
        const result = await bounds(page);
        expect(result, `${width} large=${large} ${JSON.stringify(result)}`).toMatchObject({overlaps: false, within: true, targets: true, fonts: true, textFits: true,
          hint: false, eventOpen: true, health: 'Captain down'});
        expect(result.label).toContain('0'); expect(result.label).toContain('41'); expect(result.label).toContain('3 ashore'); expect(result.down).toContain('0:12'); expect(result.loot).toContain('950');
        expect(result.bossTop).toBeGreaterThan(result.barBottom);
      }
      await page.evaluate(() => {battle.dispose(); playHud.dispose(); document.querySelector('#game').remove();});
    }
  });
});

it('keeps weather accessible after its genuine intro, preserves manual expansion, and latches first-wave tap dismissal', async () => {
  await evaluate.withPage(async page => {
    await page.setViewportSize({width: 375, height: 812}); await mount(page, 1);
    expect((await bounds(page)).hint).toBe(true);
    await page.locator('.pirate-goal-hint').click();
    await page.evaluate(() => {battle.goalHint(true); battle.bar(battleState);});
    expect((await bounds(page)).hint).toBe(false);
    await page.evaluate(() => battle.event({id: 'fog_bank', icon: '🌫️', title: 'Fog bank', line: 'Full weather detail remains available.', open: false}));
    expect((await bounds(page)).eventOpen).toBe(false);
    await page.locator('.pirate-event-summary').focus(); await page.keyboard.press('Enter');
    await page.evaluate(() => battle.event({id: 'fog_bank', icon: '🌫️', title: 'Fog bank', line: 'Updated full weather detail remains available.', open: false}));
    expect((await bounds(page)).eventOpen).toBe(true);
    expect(await page.locator('.pirate-event-line').textContent()).toBe('Updated full weather detail remains available.');
    await page.evaluate(() => {battle.goalHint(false); battle.bar(battleState);});
    expect((await bounds(page)).hint).toBe(false);
    const cleanup = await page.evaluate(() => {
      battle.dispose(); playHud.dispose(); dispatchEvent(new Event('resize'));
      return {hud: !!document.querySelector('.pirate-hud'), space: document.documentElement.style.getPropertyValue('--pirate-bar-bottom')};
    });
    expect(cleanup).toEqual({hud: false, space: ''});
  });
});
