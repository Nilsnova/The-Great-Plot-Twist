// Actual HUD/toast geometry follows Goal wrapping, folding, visibility and its owner's lifetime.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

async function mount(page) {
  await page.evaluate(async () => {
    for (const path of ['/src/ui/base.css', '/src/ui/kit/kit.css', '/src/ui/styles.css', '/src/ui/readability.css', '/src/ui/devices.css', '/src/ui/shell.css']) await window.g20Import(path);
    localStorage.clear();
    const Original = window.ResizeObserver; window.clearanceObservers = [];
    window.ResizeObserver = class extends Original {
      constructor(callback) { super(callback); this.record = {callback, observer: this, targets: [], disconnected: false}; window.clearanceObservers.push(this.record); }
      observe(target, options) { this.record.targets.push(target); return super.observe(target, options); }
      disconnect() { this.record.disconnected = true; return super.disconnect(); }
    };
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {createToasts} = await window.g20Import('/src/ui/toasts.js');
    const game = document.createElement('main'); game.id = 'game'; document.body.append(game);
    window.clearanceToasts = createToasts({parent: game});
    window.clearanceHud = createHud(game, {start() {}, focus() {}, menu() {}, hasIsland: () => true}, {toast: input => window.clearanceToasts.show(input)});
    window.clearanceHud.setCoins(7180); window.clearanceHud.start();
    window.clearanceHud.update(null, {waveStatus: {bestWave: 40}});
    window.clearanceToasts.show({text: 'Cannon built.', ms: 15000});
    await document.fonts.ready;
  });
}

async function geometry(page) {
  await page.waitForTimeout(260); // Let the existing 220ms toast entrance finish.
  return page.evaluate(() => {
    const goal = document.querySelector('.quest-strip').getBoundingClientRect(), toast = document.querySelector('.u-toast').getBoundingClientRect();
    return {goalBottom: goal.bottom, goalHeight: goal.height, toastTop: toast.top,
      inside: toast.left >= 0 && toast.right <= innerWidth && toast.bottom <= innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth};
  });
}

it('keeps the real two-row purse Goals and island toast clear at the failing and review sizes', async () => {
  await browser.withPage(async page => {
    await mount(page);
    for (const [width, height] of [[390, 844], [844, 390], [375, 812], [1280, 720]]) {
      await page.setViewportSize({width, height});
      const value = await geometry(page);
      expect(value.inside, `${width}×${height}`).toBe(true); expect(value.overflow).toBe(false);
      if (width <= 900) expect(value.toastTop - value.goalBottom).toBeGreaterThanOrEqual(9.5);
      else expect(value.toastTop).toBe(16); // The wide-screen middle slot keeps its existing position.
    }
    await page.evaluate(() => { window.clearanceHud.dispose(); window.clearanceToasts.dispose(); });
  });
});

it('follows a wrapped Goal hint and folding without a window resize or hidden Goal substitution', async () => {
  await browser.withPage(async page => {
    await page.setViewportSize({width: 390, height: 844}); await mount(page);
    await page.evaluate(() => window.clearanceHud.setQuests({title: 'Goals', progress: '0 of 1', allDone: false,
      items: [{id: 'long', label: 'Build and upgrade a cannon on the other side of your island',
        hint: 'Walk to a building spot on your island. Build a cannon and upgrade it after the next wave.', step: 1, current: true, done: false}]}));
    const wrapped = await geometry(page);
    await page.locator('.quest-item[data-current=true]').click();
    const hint = await geometry(page);
    expect(hint.goalBottom).toBeGreaterThan(wrapped.goalBottom);
    expect(hint.toastTop - hint.goalBottom).toBeGreaterThanOrEqual(9.5);
    await page.locator('.quest-fold').click();
    const folded = await geometry(page);
    expect(folded.goalHeight).toBeLessThan(wrapped.goalHeight);
    expect(folded.toastTop - folded.goalBottom).toBeGreaterThanOrEqual(9.5);
    expect(await page.locator('.quest-strip').isVisible()).toBe(true);
    await page.evaluate(() => { window.clearanceHud.dispose(); window.clearanceToasts.dispose(); });
  });
});

it('reserves visibility-hidden geometry, resets removed Goals, and ignores a queued disposed observer', async () => {
  await browser.withPage(async page => {
    await page.setViewportSize({width: 390, height: 844}); await mount(page);
    const before = await geometry(page);
    await page.evaluate(() => {
      const card = document.createElement('dialog'); card.className = 'shell-screen'; document.body.append(card); card.showModal(); window.clearanceCard = card;
      window.dispatchEvent(new Event('resize')); // An existing docked card hides the HUD without removing its box.
    });
    expect(await page.locator('.hud-play').evaluate(element => getComputedStyle(element).visibility)).toBe('hidden');
    await page.evaluate(() => { window.clearanceCard.close(); window.clearanceCard.remove(); });
    const restored = await geometry(page);
    expect(restored.goalBottom).toBe(before.goalBottom);
    expect(restored.toastTop - restored.goalBottom).toBeGreaterThanOrEqual(9.5);
    for (const mode of ['managing', 'bare']) {
      await page.evaluate(mode => mode === 'managing' ? window.clearanceHud.setManaging(true) : window.clearanceHud.setBare(true), mode);
      const hidden = await geometry(page); expect(hidden.goalHeight).toBe(0); expect(hidden.toastTop).toBe(172);
      await page.evaluate(mode => mode === 'managing' ? window.clearanceHud.setManaging(false) : window.clearanceHud.setBare(false), mode);
      const shown = await geometry(page); expect(shown.toastTop - shown.goalBottom).toBeGreaterThanOrEqual(9.5);
    }
    const disposed = await page.evaluate(() => {
      const record = window.clearanceObservers.find(item => item.targets.some(target => target.classList.contains('hud-coins')));
      window.clearanceHud.dispose(); record.callback([], record.observer); window.dispatchEvent(new Event('resize'));
      return {disconnected: record.disconnected, spacing: document.documentElement.style.getPropertyValue('--hud-goals-toast-top')};
    });
    expect(disposed).toEqual({disconnected: true, spacing: ''});
    await page.evaluate(() => window.clearanceToasts.dispose());
  });
});
