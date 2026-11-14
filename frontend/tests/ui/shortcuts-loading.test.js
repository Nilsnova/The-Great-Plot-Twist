// Native import failure and lifecycle checks for keyboard/touch shortcuts help.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('recovers a native failed module request from a phone-usable retry button', async () => {
  await browser.withPage(async page => {
    let requests = 0;
    await page.route('**/src/shell/hints/shortcuts.js', route => ++requests === 1 ? route.abort('failed') : route.continue());
    await page.evaluate(async () => {
      const {createShortcutsHost} = await window.g20Import('/src/shell/shortcuts-host.js');
      window.host = createShortcutsHost(document.body); await window.host.open();
    });
    expect(await page.locator('.shortcuts-load-feedback[open]').count()).toBe(1);
    expect(await page.locator('[role="alert"]').textContent()).toBe('Shortcuts could not load. Try again, or return to the game.');
    await page.getByRole('button', {name: 'Try again', exact: true}).click();
    await page.getByRole('dialog', {name: 'Keyboard and controller shortcuts', exact: true}).waitFor();
    expect(requests).toBe(2);
    expect(await page.locator('dialog[open]').count()).toBe(1);
    await page.evaluate(() => window.host.dispose());
  });
});

it('does not start duplicate pending loads and reuses its cached overlay', async () => {
  const result = await browser(async () => {
    const {createShortcutsHost} = await window.g20Import('/src/shell/shortcuts-host.js');
    const module = await window.g20Import('/src/shell/hints/shortcuts.js');
    let calls = 0, resolve;
    const host = createShortcutsHost(document.body, {load: () => {calls++; return new Promise(done => {resolve = done;});}});
    const first = host.open(), second = host.open();
    const loading = {calls, dialogs: document.querySelectorAll('dialog[open]').length};
    resolve(module); await Promise.all([first, second]); host.close(); await host.open();
    const opened = {calls, dialogs: document.querySelectorAll('dialog[open]').length};
    host.dispose(); return {loading, opened, left: document.querySelectorAll('dialog').length};
  });
  expect(result).toEqual({loading: {calls: 1, dialogs: 1}, opened: {calls: 1, dialogs: 1}, left: 0});
});

it.each([false, true])('cancel ignores late shortcut responses (failure=%s)', async failure => {
  const result = await browser(async failure => {
    const {createShortcutsHost} = await window.g20Import('/src/shell/shortcuts-host.js');
    const module = await window.g20Import('/src/shell/hints/shortcuts.js');
    let resolve, reject;
    const host = createShortcutsHost(document.body, {load: () => new Promise((yes, no) => {resolve = yes; reject = no;})});
    const pending = host.open(); host.close();
    if (failure) reject(Error('late')); else resolve(module);
    await pending;
    const answer = {active: host.active, dialogs: document.querySelectorAll('dialog[open]').length};
    host.dispose(); return answer;
  }, failure);
  expect(result).toEqual({active: false, dialogs: 0});
});

it('keyboard retries do not stack errors; Back and Escape restore focus at both sizes', async () => {
  await browser.withPage(async page => {
    await page.evaluate(async () => {
      await window.g20Import('/src/ui/kit/kit.css');
      const {createShortcutsHost} = await window.g20Import('/src/shell/shortcuts-host.js');
      const button = document.createElement('button'); button.id = 'opener'; document.body.append(button); button.focus();
      window.host = createShortcutsHost(document.body, {load: async () => {throw Error('private details');}});
      await window.host.open();
    });
    for (const [width,height] of [[1280,720],[375,812]]) {
      await page.setViewportSize({width,height});
      await page.keyboard.press('?');
      await page.waitForFunction(() => !!document.querySelector('.shortcuts-load-feedback [role="alert"]'));
      expect(await page.locator('.shortcuts-load-feedback').count()).toBe(1);
      expect(await page.locator('.shortcuts-load-feedback').evaluate(el => {
        const box = el.getBoundingClientRect();return box.left >= 0 && box.right <= innerWidth && el.scrollWidth <= el.clientWidth
          && [...el.querySelectorAll('button')].every(b => b.hidden || b.getBoundingClientRect().height >= 44);
      })).toBe(true);
    }
    await page.getByRole('button', {name: 'Back to game', exact: true}).click();
    expect(await page.evaluate(() => ({active: window.host.active, focus: document.activeElement.id}))).toEqual({active: false, focus: 'opener'});
    await page.keyboard.press('?');await page.locator('[role="alert"]').waitFor();await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.host.active)).toBe(false);
    await page.evaluate(() => window.host.dispose());
    await page.keyboard.press('?');expect(await page.locator('dialog').count()).toBe(0);
  });
});

it.each([false, true])('dispose ignores a pending module response (failure=%s)', async failure => {
  const result = await browser(async failure => {
    const {createShortcutsHost} = await window.g20Import('/src/shell/shortcuts-host.js');
    const module = await window.g20Import('/src/shell/hints/shortcuts.js');
    let resolve, reject;
    const host = createShortcutsHost(document.body, {load: () => new Promise((yes, no) => {resolve = yes; reject = no;})});
    const pending = host.open(); host.dispose();
    if (failure) reject(Error('late')); else resolve(module);
    await pending;
    return {active: host.active, dialogs: document.querySelectorAll('dialog').length};
  }, failure);
  expect(result).toEqual({active: false, dialogs: 0});
});
