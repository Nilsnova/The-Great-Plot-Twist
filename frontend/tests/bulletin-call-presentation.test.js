// Actual native modal and shared call-state DOM, with public bulletin views and injected callbacks only.
import {expect, it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate = browserHarness();
const call = page => page.locator('.bulletin-screen .server-call');
const retry = page => page.locator('.bulletin-screen [data-focus="retry-server-call"]');
const message = page => page.locator('.bulletin-retry-status');
async function activateRetry(page) { expect(await retry(page).isEnabled()).toBe(true); await retry(page).dispatchEvent('click'); }

async function freezeClock(page) {
  await page.clock.install(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 20));
}
async function mount(page, {status = 503, reason = 'not_connected', off = false, retryMs = 3000} = {}) {
  await page.evaluate(async options => {
    await window.g20Import('/src/ui/base.css'); await window.g20Import('/src/ui/kit/kit.css');
    const {createBulletinScreen} = await window.g20Import('/src/screens/bulletin/index.js');
    const {createModal} = await window.g20Import('/src/ui/kit/modal.js');
    const opener = document.createElement('button'); opener.textContent = 'Open recorded bulletin';
    document.body.append(opener); opener.focus();
    const deadline = Date.now() + options.retryMs;
    let view = {status: options.off ? 'off' : 'unavailable', day: null, lines: [], weather: null,
      exchange: null, chapterTwoHook: null, stale: false, message: 'Recorded bulletin unavailable.',
      request: {reason: options.reason, status: options.status, message: `Recorded public failure ${options.status}.`,
        ...(options.reason === 'rate_limited' ? {retryUntil: deadline} : {})}};
    const proof = window.bulletinCallProof = {calls: 0, pending: [], deadline, opener, closed: 0};
    const screen = createBulletinScreen({now: () => Date.now(), onClose: () => { proof.closed += 1; },
      onRetry: () => {
        proof.calls += 1;
        const promise = new Promise((resolve, reject) => proof.pending.push({resolve, reject}));
        proof.lastRetry = promise; return promise;
      }});
    const modal = createModal({title: 'Recorded harbor bulletin', body: screen.element,
      onClose: () => screen.setActive(false)});
    proof.screen = screen; proof.modal = modal;
    proof.publish = patch => { view = {...view, ...patch}; screen.update({bulletin: structuredClone(view)}); };
    proof.ready = text => proof.publish({status: 'ready', stale: false, message: 'Recorded current posting.', request: null,
      day: {id: '2026-11-07', bulletinDay: '2026-11-07', nextBulletinAt: '2026-11-08T08:00:00Z', resets: []},
      lines: [{kind: 'notice', text}]});
    proof.open = () => { screen.update({bulletin: structuredClone(view)}); modal.open(document.body); screen.setActive(true); };
    proof.close = () => { screen.close(); modal.close(); };
    proof.dispose = () => { screen.dispose(); modal.dispose(); };
    // A genuine response arrives while the drawer is active; reopening later reuses the retained model.
    const firstReply = structuredClone(view); view = {...view, status: 'loading', request: null};
    proof.open(); proof.publish(firstReply);
  }, {status, reason, off, retryMs});
}
async function dispose(page) { await page.evaluate(() => window.bulletinCallProof?.dispose()); }

it.each([
  {status: 0, reason: 'offline', phase: 'offline'},
  {status: 401, reason: 'internal_error', phase: 'error'},
  {status: 404, reason: 'feature_off', phase: 'off', off: true},
  {status: 409, reason: 'internal_error', phase: 'error'},
  {status: 429, reason: 'rate_limited', phase: 'rate_limited'},
  {status: 502, reason: 'internal_error', phase: 'error'},
  {status: 503, reason: 'not_connected', phase: 'error'},
])('keeps public HTTP$status reason $reason in its shared phase and native focus', async fault => {
  await evaluate.withPage(async page => {
    await freezeClock(page); await mount(page, fault); await page.clock.runFor(32);
    if (fault.off) {
      expect(await page.locator('.bulletin-screen').evaluate(el => el.hidden)).toBe(true);
      expect(await retry(page).isVisible()).toBe(false);
      await page.evaluate(() => window.bulletinCallProof.screen.element.querySelector('[data-focus="retry-server-call"]')?.onclick?.());
      expect(await page.evaluate(() => window.bulletinCallProof.calls)).toBe(0);
    } else {
      expect(await call(page).getAttribute('data-state')).toBe(fault.phase);
      expect(await retry(page).getAttribute('aria-label')).toBe('Retry bulletin');
      expect(await call(page).getByRole('link', {name: 'Report a problem', exact: true}).isVisible()).toBe(true);
      expect(await message(page).getAttribute('tabindex')).toBe('-1');
      expect(await call(page).locator('[data-focus="sign-in-server-call"]').isVisible()).toBe(false);
      if (fault.status === 429) {
        expect(await retry(page).isDisabled()).toBe(true); expect(await message(page).textContent()).toContain('3 s.');
        expect(await message(page).evaluate(el => document.activeElement === el)).toBe(true);
      } else {
        expect(await retry(page).isEnabled()).toBe(true);
        expect(await retry(page).evaluate(el => document.activeElement === el)).toBe(true);
        expect(await message(page).textContent()).toBe(`Recorded public failure ${fault.status}.`);
      }
      if (fault.status === 401) {
        expect(await message(page).textContent()).not.toMatch(/session expired|sign in again/i);
        expect(await page.locator('.account-modal').count()).toBe(0);
      }
    }
    expect(await page.evaluate(() => window.bulletinCallProof.calls)).toBe(0); await dispose(page);
  });
});

it('shows shared300ms/5s read thresholds and never retries a held public read automatically', async () => {
  await evaluate.withPage(async page => {
    await freezeClock(page); await mount(page, {status: 0, reason: 'offline'});
    await activateRetry(page);
    expect(await page.evaluate(() => window.bulletinCallProof.calls)).toBe(1);
    await page.clock.runFor(299); expect(await call(page).getAttribute('data-state')).toBe('pending');
    expect(await call(page).isVisible()).toBe(false);
    await page.clock.runFor(1); expect(await call(page).getAttribute('data-state')).toBe('loading');
    expect(await message(page).textContent()).toBe('Loading…');
    await page.clock.runFor(4699); expect(await call(page).getAttribute('data-state')).toBe('loading');
    await page.clock.runFor(1); expect(await call(page).getAttribute('data-state')).toBe('slow');
    expect(await message(page).textContent()).toContain('longer than expected');
    expect(await call(page).getByRole('link', {name: 'Report a problem', exact: true}).isVisible()).toBe(true);
    await page.evaluate(() => {
      const button = window.bulletinCallProof.screen.element.querySelector('[data-focus="retry-server-call"]');
      button.onclick?.(); button.onclick?.();
    });
    await page.clock.runFor(300000); expect(await page.evaluate(() => window.bulletinCallProof.calls)).toBe(1);
    await page.evaluate(async () => {
      const proof = window.bulletinCallProof;
      proof.ready('Only the published bulletin line.');
      proof.pending[0].resolve({ok: true, bulletin: {status: 'ready', lines: [{kind: 'notice', text: 'Returned data must not render.'}]}});
      await proof.lastRetry;
    });
    expect(await page.locator('.bulletin-lines li').allTextContents()).toEqual(['Only the published bulletin line.']);
    expect(await page.locator('.bulletin-screen').textContent()).not.toContain('Returned data must not render.');
    await dispose(page);
  });
});

it('keeps the absolute429 deadline across fractional close/reopen and guards forced original retry activation', async () => {
  await evaluate.withPage(async page => {
    await freezeClock(page); await mount(page, {status: 429, reason: 'rate_limited', retryMs: 3000});
    await page.clock.runFor(1500);
    await page.evaluate(() => { const proof = window.bulletinCallProof; proof.close(); proof.open(); });
    expect(await message(page).textContent()).toContain('2 s.'); expect(await retry(page).isDisabled()).toBe(true);
    await page.evaluate(() => window.bulletinCallProof.screen.element.querySelector('[data-focus="retry-server-call"]').onclick?.());
    expect(await page.evaluate(() => window.bulletinCallProof.calls)).toBe(0);
    await page.clock.runFor(1499); expect(await retry(page).isDisabled()).toBe(true);
    await page.clock.runFor(1); expect(await retry(page).isEnabled()).toBe(true);
    expect(await message(page).textContent()).toContain('You can try again now.');
    expect(await page.evaluate(() => Date.now() - window.bulletinCallProof.deadline)).toBe(0);
    expect(await page.evaluate(() => window.bulletinCallProof.calls)).toBe(0);
    await activateRetry(page); expect(await page.evaluate(() => window.bulletinCallProof.calls)).toBe(1);
    await dispose(page);
  });
});

it.each(['close', 'dispose'])('keeps late retry feedback and retained handlers quiet after $0', async boundary => {
  await evaluate.withPage(async page => {
    await freezeClock(page); await mount(page);
    await activateRetry(page);
    await page.evaluate(boundary => {
      const proof = window.bulletinCallProof;
      proof.heldRetry = proof.screen.element.querySelector('[data-focus="retry-server-call"]');
      proof.heldMessage = proof.screen.element.querySelector('.bulletin-retry-status');
      proof[boundary]();
    }, boundary);
    await page.locator('dialog[open]').waitFor({state: 'hidden'});
    const secret = `fixture-${Date.now()}`;
    await page.evaluate(async text => {
      const proof = window.bulletinCallProof;
      proof.pending[0].reject(new Error(text)); await proof.lastRetry.catch(() => {});
      proof.heldRetry.onclick?.();
    }, secret);
    await page.clock.runFor(6000);
    const result = await page.evaluate(() => {
      const proof = window.bulletinCallProof;
      return {calls: proof.calls, hidden: proof.heldMessage.hidden, text: proof.heldMessage.textContent,
        focusedOld: document.activeElement === proof.heldMessage || document.activeElement === proof.heldRetry};
    });
    expect(result.calls).toBe(1); expect(result.hidden).toBe(true); expect(result.text).not.toContain(secret); expect(result.focusedOld).toBe(false);
    if (boundary === 'close') {
      await page.evaluate(() => window.bulletinCallProof.open());
      expect(await retry(page).isEnabled()).toBe(true); expect(await page.evaluate(() => window.bulletinCallProof.calls)).toBe(1);
    } else expect(await page.locator('.bulletin-screen').count()).toBe(0);
    await dispose(page);
  });
});
