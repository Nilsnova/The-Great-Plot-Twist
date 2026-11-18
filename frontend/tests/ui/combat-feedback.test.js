// Native Chromium checks for accessible feedback, preview intent and compact desktop/phone layout.
import { expect, it } from 'vitest';
import { browserHarness } from '../g20-browser.js';
const browser = browserHarness();

it('exposes contextual range to keyboard users and announces changing danger only once', async () => {
  await browser.withPage(async page => {
    await page.evaluate(async () => {
      for (const css of ['/src/ui/base.css', '/src/ui/kit/kit.css']) await window.g20Import(css);
      const { createWaveHud } = await window.g20Import('/src/pirates/hud.js');
      window.previews = [];
      window.feedbackHud = createWaveHud({ container: document.body, onRangePreview: value => window.previews.push(value) });
      window.feedbackHud.musket({ ready: false, share: 1 });
      window.feedbackHud.rangeFeedback({ label: 'Musket range', radius: 14, status: 'Out of range · move closer', alpha: 1 });
    });
    await page.locator('.pirate-musket').hover();
    await page.mouse.move(0, 0);
    await page.keyboard.press('Tab');
    expect(await page.locator('.pirate-musket').evaluate(node => document.activeElement === node)).toBe(true);
    expect(await page.evaluate(() => window.previews.at(-1))).toBe(true);
    expect(await page.locator('.pirate-musket').getAttribute('aria-description')).toContain('Out of range');
    expect(await page.locator('.pirate-hit-confirmation').count()).toBe(0);
    expect(await page.locator('.pirate-musket').textContent()).not.toMatch(/\bHit\b|\bdamage\b/);
    expect(await page.locator('.pirate-quiet[role=status]').textContent()).toContain('Musket range');
    const changes = await page.evaluate(async () => {
      let changes = 0;
      const observer = new MutationObserver(records => { changes += records.length; });
      observer.observe(document.querySelector('.pirate-danger'), { subtree: true, childList: true });
      const warning = { key: 'heart-hit', title: 'Heart taking damage', line: 'Defend the island heart!', critical: false };
      window.feedbackHud.danger(warning); await Promise.resolve();
      const initial = changes;
      window.feedbackHud.danger({ ...warning, x: 2, z: 5 }); await Promise.resolve();
      observer.disconnect(); return { initial, later: changes };
    });
    expect(changes.initial).toBeGreaterThan(0);
    expect(changes.later).toBe(changes.initial);
  });
});

it('keeps long weapon and danger text within the fire control and wave bar', async () => {
  await browser.withPage(async page => {
    await page.evaluate(async () => {
      for (const css of ['/src/ui/base.css', '/src/ui/kit/kit.css']) await window.g20Import(css);
      const { createWaveHud } = await window.g20Import('/src/pirates/hud.js');
      const hud = createWaveHud({ container: document.body, reducedMotion: () => true });
      hud.bar({ wave: 1, islandHp: 90, maxIslandHp: 100, shipsLeft: 2 });
      hud.musket({ ready: true, share: 1, label: 'Fire bombs' });
      hud.rangeFeedback({ label: 'Fire bombs throw range', radius: 18, status: 'Throw limited to ring', alpha: .2 });
      hud.danger({ key: 'captain-critical', title: 'Captain in danger!', line: 'Slash nearby pirates or move away.', critical: true });
    });
    for (const [width, height] of [[1280, 720], [375, 812]]) {
      await page.setViewportSize({ width, height });
      const clipped = await page.evaluate(() => [...document.querySelectorAll('.pirate-musket,.pirate-range-feedback,.pirate-danger')].some(node => {
        const box = node.getBoundingClientRect();
        return box.left < 0 || box.right > innerWidth || box.bottom > innerHeight || node.scrollWidth > node.clientWidth;
      }));
      expect(clipped).toBe(false);
      expect(await page.locator('.pirate-range-feedback').evaluate(node => node.style.opacity)).toBe('1');
    }
  });
});
