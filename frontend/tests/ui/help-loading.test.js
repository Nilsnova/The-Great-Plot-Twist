// Real browser checks for help-load feedback, retries and cancelled requests.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const browser = browserHarness();

it('shows one loading dialog and shares a pending open, then opens the real help', async () => {
  const result = await browser(async () => {
    const {createTutorialHost} = await window.g20Import('/src/tutorial/host.js');
    const module = await window.g20Import('/src/tutorial/card.js'), loads = [];
    const host = createTutorialHost(document.body, {load: () => new Promise(resolve => loads.push(resolve))});
    const first = host.open(), second = host.open();
    const pending = {calls: loads.length, dialogs: document.querySelectorAll('dialog[open]').length,
      message: document.querySelector('.tutorial-load-feedback [role="status"]')?.textContent};
    loads.forEach(resolve => resolve(module)); await Promise.all([first, second]);
    const opened = {cards: document.querySelectorAll('.tutorial-card[open]').length,
      feedback: document.querySelectorAll('.tutorial-load-feedback').length};
    host.dispose(); return {pending, opened};
  });
  expect(result).toEqual({pending: {calls: 1, dialogs: 1, message: 'Loading How to play…'}, opened: {cards: 1, feedback: 0}});
});

it('keeps the failed load visible and retries from its button without exposing the error', async () => {
  await browser.withPage(async page => {
    await page.evaluate(async () => {
      const {createTutorialHost} = await window.g20Import('/src/tutorial/host.js');
      let calls = 0;
      window.host = createTutorialHost(document.body, {load: () => ++calls === 1
        ? Promise.reject(Error('private diagnostic')) : window.g20Import('/src/tutorial/card.js')});
      await window.host.open();
    });
    expect(await page.locator('.tutorial-load-feedback[open]').count()).toBe(1);
    expect(await page.locator('[role="alert"]').textContent()).toBe('How to play could not load. Try again, or return to the game.');
    expect(await page.evaluate(() => window.host.active)).toBe(true);
    await page.getByRole('button', {name: 'Try again', exact: true}).click();
    await page.locator('.tutorial-card[open]').waitFor();
    expect(await page.locator('dialog[open]').count()).toBe(1);
    await page.evaluate(() => window.host.dispose());
  });
});

it.each([false, true])('cancelling prevents a late response from reopening help (failure=%s)', async failure => {
  const result = await browser(async failure => {
    const {createTutorialHost} = await window.g20Import('/src/tutorial/host.js');
    const module = await window.g20Import('/src/tutorial/card.js'), closed = [];
    let resolve, reject;
    const host = createTutorialHost(document.body, {onClose: reason => closed.push(reason),
      load: () => new Promise((yes, no) => {resolve = yes; reject = no;})});
    const pending = host.open(); host.close();
    if (failure) reject(Error('late')); else resolve(module);
    await pending;
    const answer = {active: host.active, dialogs: document.querySelectorAll('dialog[open]').length, closed};
    host.dispose(); return answer;
  }, failure);
  expect(result).toEqual({active: false, dialogs: 0, closed: ['closed']});
});

it('disposing a pending host ignores its late rejection and removes all feedback', async () => {
  const result = await browser(async () => {
    const {createTutorialHost} = await window.g20Import('/src/tutorial/host.js');
    let reject;
    const host = createTutorialHost(document.body, {load: () => new Promise((_, no) => {reject = no;})});
    const pending = host.open(); host.dispose(); reject(Error('late')); await pending;
    return {active: host.active, dialogs: document.querySelectorAll('dialog').length};
  });
  expect(result).toEqual({active: false, dialogs: 0});
});

it.each(['Escape', 'Back to game'])('closes failed help with %s and restores focus', async action => {
  await browser.withPage(async page => {
    await page.evaluate(async () => {
      await window.g20Import('/src/ui/kit/kit.css');
      const {createTutorialHost} = await window.g20Import('/src/tutorial/host.js');
      const opener = document.createElement('button'); opener.id = 'opener'; document.body.append(opener); opener.focus();
      window.b3Closed = [];
      window.host = createTutorialHost(document.body, {load: async () => {throw Error('unavailable');}, onClose: reason => window.b3Closed.push(reason)});
      await window.host.open();
    });
    for (const [width, height] of [[1280,720],[375,812]]) {
      await page.setViewportSize({width,height});
      expect(await page.locator('.tutorial-load-feedback').evaluate(el => {
        const box = el.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && el.scrollWidth <= el.clientWidth
          && [...el.querySelectorAll('button')].filter(b => !b.hidden).every(b => b.getBoundingClientRect().height >= 44);
      })).toBe(true);
    }
    if (action === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', {name: action, exact: true}).click();
    expect(await page.evaluate(() => ({active: window.host.active, closed: window.b3Closed, focus: document.activeElement.id})))
      .toEqual({active: false, closed: ['closed'], focus: 'opener'});
    expect(await page.locator('.tutorial-load-feedback').count()).toBe(0);
    await page.evaluate(() => window.host.dispose());
  });
});
