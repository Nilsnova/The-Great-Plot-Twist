// Native production-component composition: an acute warning must stay readable beside narration.
import {expect, it} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from '../g20-browser.js';

const browser = browserHarness();

async function withPhone(width, height, run) {
  await browser.withPage(async (original, base) => {
    const context = await original.context().browser().newContext({viewport: {width, height}, isMobile: true, hasTouch: true});
    try {
      const page = await context.newPage();
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base || url.pathname.startsWith('/api/')) return route.abort();
        if (url.pathname === '/g20-harness') return route.fulfill({contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body>'});
        return route.continue();
      });
      await page.goto(base + '/g20-harness');
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.addScriptTag({type: 'module', content: 'window.g20Import = path => import(path);'});
      await page.waitForFunction(() => !!window.g20Import);
      expect(await page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(true);
      await run(page);
    } finally { await context.close(); }
  });
}

it.each([
  [375, 812, false, 1], [320, 568, false, 1], [320, 568, true, 1],
  [375, 812, true, 1], [320, 568, true, 15],
])('keeps the post-wave caption and Use reachable at %s×%s (large: %s, wave: %s)', async (width, height, large, waveNumber) => {
  await withPhone(width, height, async page => {
    const {line, milestone} = await page.evaluate(async ({large, waveNumber}) => {
      for (const sheet of ['/src/ui/base.css', '/src/ui/kit/kit.css', '/src/ui/shell.css', '/src/ui/devices.css']) await window.g20Import(sheet);
      const {createTouchControls} = await window.g20Import('/src/controls/touch.js');
      const {createWaveHud} = await window.g20Import('/src/pirates/hud.js');
      const {default: createCaptionsView} = await window.g20Import('/src/audio/captions-view.js');
      const {createToasts} = await window.g20Import('/src/ui/toasts.js');
      const {default: campaign} = await window.g20Import('/src/campaign/campaign.json');
      const {createNarratorCard} = await window.g20Import('/src/narrator/card.js');
      const {default: lines} = await window.g20Import('/src/narrator/lines.json');
      const game = document.createElement('main'); document.body.append(game);
      const canvas = document.createElement('canvas'); canvas.tabIndex = 0; game.append(canvas);
      window.inputs = []; window.skips = 0;
      window.touch = createTouchControls(game, {setVirtual() {}, press: code => inputs.push(code)}, {});
      window.narration = createNarratorCard(game, {large: () => large, onSkip: () => window.skips++});
      const wave = createWaveHud({container: game});
      wave.bar({wave: waveNumber, shipsLeft: 0, boardersLeft: 0, islandHp: 100, maxIslandHp: 100});
      wave.pause({title: `Wave ${waveNumber} won!`, line: '3 ships sunk · +15', ready: true, seconds: 8, hold: {label: 'Pause', enabled: true}});
      createCaptionsView(game).show('Victory: the island holds');
      const unlock = campaign.steps.find(step => step.wave === waveNumber);
      createToasts({parent: game}).show({text: unlock.title, next: unlock.line, tone: 'success',
        context: waveNumber === 1 ? 'first-wave-unlock' : 'campaign-unlock'});
      const line = lines.lines.find(line => line.id === (waveNumber === 1 ? 'unlock_captain' : 'unlock_gunboat'));
      window.nextLine = lines.lines.find(line => line.id === 'unlock_houses');
      touch.update(null, true);
      narration.show(line);
      return {line: line.text, milestone: unlock.line};
    }, {large, waveNumber});
    await page.evaluate(() => touch.update('wall_1', true, 'Build here', true));
    const use = page.getByRole('button', {name: 'Use: Build here'});
    const skip = page.getByRole('button', {name: 'Skip the narrator'});
    await expect.poll(() => use.evaluate(button => {
      const card = narration.element, skip = card.querySelector('button');
      const r = card.getBoundingClientRect(), b = button.getBoundingClientRect(), s = skip.getBoundingClientRect();
      const centerHits = (node, box) => node.contains(document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2));
      const separate = r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom;
      return {separate, useHit: centerHits(button, b), skipHit: centerHits(skip, s), skipSize: [s.width, s.height]};
    })).toEqual({separate: true, useHit: true, skipHit: true, skipSize: [44, 44]});
    expect(await use.evaluate(button => {
      const rect = node => node.getBoundingClientRect();
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const caption = rect(narration.element), cue = rect(document.querySelector('.sound-caption'));
      const result = rect(document.querySelector('.pirate-break'));
      const stick = rect(document.querySelector('.touch-stick-group'));
      const toast = rect(document.querySelector('.u-toast'));
      return {
        otherOverlaps: [intersects(caption, cue), intersects(caption, result), intersects(cue, rect(button)), intersects(cue, stick)],
        toastClear: [caption, cue, result, stick, rect(button)].every(box => !intersects(toast, box)),
        soundGap: cue.top - toast.bottom >= 4,
      };
    })).toEqual({otherOverlaps: [false, false, false, false], toastClear: true, soundGap: true});
    expect(await page.locator('.u-toasts').ariaSnapshot()).toContain(milestone);
    await capture(page, `${width}x${height}-post-wave-touch${large ? '-large' : ''}-wave-${waveNumber}`);
    await use.tap(); await skip.tap();
    expect(await page.evaluate(() => ({inputs, skips}))).toEqual({inputs: ['KeyE'], skips: 1});
    if (large) {
      const reader = page.getByRole('region', {name: 'Narrator subtitles'});
      expect(await reader.locator('[role=status]').textContent()).toBe(line);
      expect(await reader.locator('[role=status]').evaluate(node => getComputedStyle(node).fontSize)).toBe('22px');
      await page.locator('canvas').focus();
      await reader.focus();
      await page.keyboard.press('End');
      await expect.poll(() => reader.evaluate(node => node.scrollTop + node.clientHeight >= node.scrollHeight - 2)).toBe(true);
      await page.evaluate(() => { narration.hide({keepReading: true}); narration.show(nextLine); narration.hide({keepReading: true}); });
      expect(await reader.locator('.narrator-history').textContent()).toBe(line);
      expect(await reader.locator('[role=status]').textContent()).toBe(await page.evaluate(() => nextLine.text));
      if (width === 320 && waveNumber === 1) {
        // Chrome can blur a retained reader before the resize callback runs.
        await reader.evaluate(node => node.blur());
        expect(await page.evaluate(() => document.activeElement.tagName)).toBe('BODY');
        await page.setViewportSize({width: 568, height: 320});
        await expect.poll(() => reader.count()).toBe(0);
        expect(await page.evaluate(() => document.activeElement.tagName)).toBe('CANVAS');
        await page.setViewportSize({width, height});
        await reader.waitFor();
        expect(await reader.locator('.narrator-history').textContent()).toBe(line);
        expect(await reader.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
        await reader.focus();
      }
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).toBe('Close narrator subtitles');
      await page.keyboard.press('Enter');
      expect(await reader.count()).toBe(0);
      expect(await page.evaluate(() => document.activeElement.tagName)).toBe('CANVAS');
    }
  });
});

async function mount(page, large = false) {
  await page.evaluate(async large => {
    for (const sheet of ['/src/ui/base.css', '/src/ui/kit/kit.css', '/src/ui/styles.css', '/src/ui/readability.css', '/src/ui/devices.css']) await window.g20Import(sheet);
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {createWaveHud} = await window.g20Import('/src/pirates/hud.js');
    const {createTouchControls} = await window.g20Import('/src/controls/touch.js');
    const {createNarratorCard} = await window.g20Import('/src/narrator/card.js');
    const {default: lines} = await window.g20Import('/src/narrator/lines.json');
    const game = document.createElement('main'); game.id = 'game'; document.body.append(game);
    window.play = createHud(game, {start() {}, focus() {}, menu() {}, hasIsland: () => true});
    play.setCoinSource('island'); play.setCoins(7180); play.start();
    play.update(null, {waveStatus: {bestWave: 40, currentWave: 41}});
    window.battle = createWaveHud({container: game, reducedMotion: () => true, inspectDefenses: {onSelect() {}, onClose() {}}});
    battle.bar({wave: 41, shipsLeft: 7, boardersLeft: 3, islandHp: 20, maxIslandHp: 100});
    battle.health({hp: 25, maxHp: 100, down: false});
    battle.event({id: 'fog_bank', icon: '🌫️', title: 'Fog bank', line: 'Thick fog rolls in. Cannons have shorter range until it lifts.', open: false});
    battle.musket({ready: true, share: 1, label: 'Fire bombs'});
    battle.rangeFeedback({label: 'Fire bombs throw range', radius: 18, status: 'Out of range · move closer', alpha: 1});
    window.touch = createTouchControls(game, {setVirtual() {}, press() {}}, {}); touch.update(null, true);
    window.skips = 0;
    window.narration = createNarratorCard(game, {large: () => large, onSkip: () => window.skips++});
    window.captionLine = lines.lines.find(line => line.id === 'wave_5');
    narration.show(captionLine);
    await document.fonts.ready;
  }, large);
  await page.waitForTimeout(80);
}

async function measure(page) {
  return page.evaluate(() => {
    const card = narration.element, danger = document.querySelector('.pirate-danger');
    const caption = card.getBoundingClientRect(), warning = danger.getBoundingClientRect();
    const bar = document.querySelector('.pirate-bar').getBoundingClientRect(), fire = document.querySelector('.pirate-musket').getBoundingClientRect();
    const stick = document.querySelector('.touch-stick').getBoundingClientRect();
    const intersects = caption.left < warning.right && caption.right > warning.left && caption.top < warning.bottom && caption.bottom > warning.top;
    const drawn = getComputedStyle(card).visibility !== 'hidden' && !card.hidden;
    const q = selector => {const r = document.querySelector(selector).getBoundingClientRect(); return {top: r.top, bottom: r.bottom, left: r.left, right: r.right};};
    return {obscured: intersects && drawn, drawn, inert: card.inert, ariaHidden: card.getAttribute('aria-hidden'), activeLine: narration.visible,
      sameLine: card.dataset.line === captionLine.id && card.querySelector('.narrator-text').textContent === captionLine.text,
      fireClear: fire.top >= bar.bottom + 8 || fire.bottom <= bar.top - 8 || fire.left >= bar.right + 8 || fire.right <= bar.left - 8,
      stickClear: fire.left >= stick.right || fire.right <= stick.left || fire.top >= stick.bottom || fire.bottom <= stick.top,
      rangeFits: [...document.querySelectorAll('.pirate-musket,.pirate-range-feedback,.pirate-range-label,.pirate-range-status')].every(node => node.scrollWidth <= node.clientWidth + 1),
      fireWithin: fire.left >= 0 && fire.top >= 0 && fire.right <= innerWidth && fire.bottom <= innerHeight,
      skipPresent: !!card.querySelector('button[aria-label="Skip the narrator"]'), warning: danger.textContent,
      font: parseFloat(getComputedStyle(card.querySelector('.narrator-text')).fontSize),
      caption: q('.narrator-card'), danger: q('.pirate-danger'), fire: q('.pirate-musket'), stick: q('.touch-stick')};
  });
}

async function capture(page, name) {
  if (!process.env.CF1_NARRATOR_SHOTS) return;
  await mkdir(process.env.CF1_NARRATOR_SHOTS, {recursive: true});
  await page.screenshot({path: join(process.env.CF1_NARRATOR_SHOTS, name + '.png')});
}

it.each([false, true])('gives the actual acute instruction priority over overlapping narration (large=%s)', async large => {
  await withPhone(320, 568, async page => {
    await mount(page, large);
    await page.evaluate(() => battle.danger({key: 'captain-critical', title: 'Captain in danger!', line: 'Slash nearby pirates or move away.', critical: true}));
    await page.waitForTimeout(80);
    await capture(page, `320x568-${large ? 'large' : 'normal'}-collapsed-controls`);
    const collapsed = await measure(page);
    expect(collapsed, JSON.stringify(collapsed)).toMatchObject({fireClear: true, fireWithin: true, stickClear: true, rangeFits: true});
    await page.locator('.pirate-event-summary').click();
    await page.waitForTimeout(80);
    await capture(page, `320x568-${large ? 'large' : 'normal'}-warning`);
    const current = await measure(page);
    expect(current, JSON.stringify(current)).toMatchObject({obscured: false, activeLine: true, sameLine: true, skipPresent: true});
    expect(current).toMatchObject({drawn: true, inert: false, ariaHidden: null});
    expect(current.caption.top).toBeGreaterThan(current.danger.bottom);
    expect(current.warning).toContain('Slash nearby pirates or move away.');
    expect(current.font).toBeGreaterThanOrEqual(large ? 22 : 14);
    expect(current, JSON.stringify(current)).toMatchObject({fireClear: true, fireWithin: true, stickClear: true, rangeFits: true});
    expect(await page.locator('.pirate-musket').isEnabled()).toBe(true);
    expect(await page.locator('.touch-stick').isEnabled()).toBe(true);
    await page.getByRole('region', {name: 'Narrator subtitles'}).focus();
    const placement = await page.addStyleTag({content: '.pirate-bar{transform:none!important}.pirate-bar>.pirate-danger{position:fixed;inset:auto 6px 8px}'});
    await page.evaluate(() => dispatchEvent(new Event('resize')));
    await expect.poll(async () => (await measure(page)).drawn).toBe(false);
    expect(await measure(page)).toMatchObject({obscured: false, inert: true, ariaHidden: 'true', sameLine: true});
    await placement.evaluate(node => node.remove());
    await page.evaluate(() => battle.danger(null));
    await page.waitForTimeout(80);
    expect(await measure(page)).toMatchObject({drawn: true, inert: false, ariaHidden: null, sameLine: true, skipPresent: true});
    expect((await measure(page)).caption.top).toBeGreaterThanOrEqual(0);
    await page.locator('.narrator-skip').click();
    expect(await page.evaluate(() => skips)).toBe(1);
  });
});

it.each([[320, 568, true], [375, 812, false]])('keeps live Fog Bank controls and Standard subtitles apart at %s×%s', async (width, height, usesReader) => {
  await withPhone(width, height, async page => {
    await mount(page);
    await page.evaluate(async () => {
      const {default: lines} = await window.g20Import('/src/narrator/lines.json');
      battle.bar({wave: 31, shipsLeft: 30, boardersLeft: 0, islandHp: 100, maxIslandHp: 100});
      battle.event({id: 'fog_bank', icon: '🌫️', title: 'Fog Bank',
        line: 'Ships show up late and towers see 30% less. A nearby watchtower clears the fog.', open: true});
      window.captionLine = lines.lines.find(line => line.id === 'unlock_gunboat');
      narration.show(captionLine);
    });
    const captionFits = () => page.evaluate(() => {
      const card = narration.element, box = card.getBoundingClientRect();
      const obstacles = ['.pirate-bar', '.pirate-musket', '.touch-stick-group'];
      const clear = obstacles.every(sel => {
        const other = document.querySelector(sel).getBoundingClientRect();
        return box.left >= other.right || box.right <= other.left || box.bottom <= other.top || box.top >= other.bottom;
      });
      return {clear, drawn: getComputedStyle(card).visibility === 'visible',
        reader: card.classList.contains('is-large-touch-reader'), unchanged: card.querySelector('.narrator-text').textContent === captionLine.text};
    });
    const expectCaption = () => expect.poll(captionFits).toEqual({clear: true, drawn: true, reader: usesReader, unchanged: true});
    await expectCaption();
    const summary = page.locator('.pirate-event-summary');
    await summary.tap();
    await expectCaption();
    await summary.tap();
    await expectCaption();
    if (usesReader) {
      const reader = page.getByRole('region', {name: 'Narrator subtitles'});
      await reader.focus();
      await page.keyboard.press('End');
      await expect.poll(() => reader.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    }
    await page.getByRole('button', {name: 'Skip the narrator'}).tap();
    expect(await page.evaluate(() => skips)).toBe(1);
  });
});

it('rechecks measured weather expansion and restores the same caption after the warning clears', async () => {
  await withPhone(375, 812, async page => {
    await mount(page);
    await page.evaluate(() => battle.danger({key: 'heart-critical', title: 'Heart in danger!', line: 'Defend the island heart!', critical: true}));
    await page.locator('.pirate-event-summary').click();
    await page.waitForTimeout(80);
    await capture(page, '375x812-weather-warning');
    expect(await page.locator('.pirate-event').getAttribute('open')).not.toBeNull();
    expect(await measure(page)).toMatchObject({obscured: false, sameLine: true, skipPresent: true});
    await page.evaluate(() => battle.danger(null));
    await page.waitForTimeout(80);
    expect(await measure(page)).toMatchObject({drawn: true, sameLine: true});
    await page.locator('.narrator-skip').click();
    expect(await page.evaluate(() => skips)).toBe(1);
    const disposed = await page.evaluate(() => {
      narration.dispose(); battle.dispose(); touch.dispose(); play.dispose();
      dispatchEvent(new Event('resize'));
      return !document.querySelector('.narrator-card');
    });
    expect(disposed).toBe(true);
  });
});

it('keeps the live defense selector legible during a large caption on a short phone', async () => {
  await withPhone(320, 568, async page => {
    await mount(page, true);
    await page.evaluate(() => {
      battle.event({id: 'fog_bank', icon: '🌫️', title: 'Fog bank', line: 'Thick fog rolls in. Cannons have shorter range until it lifts.', open: true});
      const mortar = {id: 'cannon_1', kind: 'mortar', level: 2};
      battle.inspectDefense({options: [mortar], coverage: {...mortar, range: 21, minRange: 8, litRange: 34, targets: ['ships', 'boarders'], status: 'ready'}});
    });
    expect(await page.locator('.pirate-event').getAttribute('open')).toBeNull();
    const picker = page.getByRole('combobox', {name: 'Inspect a defense'});
    expect(await picker.evaluate(node => {
      const box = node.getBoundingClientRect();
      return document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2) === node;
    })).toBe(true);
    const clearance = await page.evaluate(() => {
      const panel = document.querySelector('.pirate-defense-inspector').getBoundingClientRect();
      const stick = document.querySelector('.touch-stick').getBoundingClientRect();
      return stick.top - panel.bottom;
    });
    expect(clearance).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => battle.inspectDefense(null));
    await expect.poll(async () => (await measure(page)).drawn).toBe(true);
    expect(await measure(page)).toMatchObject({sameLine: true, skipPresent: true});
  });
});
