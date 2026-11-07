// Native component DOM with injected L2 requests only; the harness blocks every service endpoint.
import {expect, it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const evaluate = browserHarness();
async function mount(page) {
  await page.evaluate(async () => {
    await window.g20Import('/src/ui/base.css'); await window.g20Import('/src/ui/kit/kit.css');
    const {createIsletAdapter} = await window.g20Import('/src/screens/islet/adapter.js');
    const {createIsletPanel} = await window.g20Import('/src/screens/islet/panel.js');
    const {createFakeIsletTransport} = await window.g20Import('/src/screens/islet/fake-transport.js');
    const fake = createFakeIsletTransport(); window.isletPosts = 0;
    window.isletEngine = createIsletAdapter({mode: 'live', transport: {
      get: path => fake.get(path), post: async () => {
        window.isletPosts += 1; return {ok: false, status: 429, code: 'too_many_requests', retryAfterSeconds: 30};
      },
    }});
    await window.isletEngine.refresh();
    window.isletPanel = createIsletPanel({container: document.body, adapter: window.isletEngine});
    window.isletPanel.open('islet_signal_station');
  });
  await page.waitForFunction(() => !document.querySelector('[data-focus="islet-build-islet_signal_station"]').disabled);
}

it('uses the genuine request/report/countdown UI, guards forced clicks and fits 320px with readable targets', async () => {
  await evaluate.withPage(async page => {
    await page.setViewportSize({width: 320, height: 568}); await mount(page);
    const build = page.locator('[data-focus="islet-build-islet_signal_station"]');
    await build.click();
    const call = page.locator('.islet-modal[open] .server-call');
    await page.waitForFunction(() => document.querySelector('.islet-modal[open] .server-call')?.dataset.state === 'rate_limited');
    expect(await call.getByRole('link', {name: 'Report a problem', exact: true}).isVisible()).toBe(true);
    expect(await call.getByRole('button', {name: /^Retry/}).isDisabled()).toBe(true);
    expect(await build.isDisabled()).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.dataset.focus)).toBe('islet-plot-islet_signal_station');
    await build.dispatchEvent('click');
    await page.getByRole('button', {name: 'Refresh', exact: true}).dispatchEvent('click');
    expect(await page.evaluate(() => window.isletPosts)).toBe(1);
    const layout = await page.evaluate(() => ({overflow: document.documentElement.scrollWidth > innerWidth,
      sizes: [...document.querySelectorAll('.islet-note,.islet-wallet,.islet-line,.islet-status,.islet-badge')]
        .map(element => parseFloat(getComputedStyle(element).fontSize)),
      targets: [...document.querySelectorAll('.islet-modal .kit-button')].filter(element => element.getClientRects().length)
        .map(element => { const box = element.getBoundingClientRect(); return {font: parseFloat(getComputedStyle(element).fontSize), width: box.width, height: box.height}; })}));
    expect(layout.overflow).toBe(false); expect(layout.sizes.every(size => size >= 18)).toBe(true);
    expect(layout.targets.every(target => target.font >= 16 && target.width >= 44 && target.height >= 44)).toBe(true);
    await page.keyboard.press('Escape'); await page.locator('.islet-modal').waitFor({state: 'hidden'});
    await page.evaluate(() => { window.isletPanel.dispose(); window.isletEngine.dispose(); });
  });
});

it('clears a closed cached panel and cancels its request state when the shared engine resets privately', async () => {
  await evaluate.withPage(async page => {
    await mount(page); await page.keyboard.press('Escape');
    const before = await page.locator('.islet-wallet').textContent(); expect(before).toContain('1,000');
    await page.evaluate(() => window.isletEngine.resetPrivate());
    expect(await page.locator('.islet-wallet').textContent()).toBe('');
    expect(await page.locator('.islet-spot').count()).toBe(0);
    expect(await page.locator('.server-call').getAttribute('data-state')).toBe('idle');
    expect(await page.locator('.server-call').isHidden()).toBe(true);
    await page.evaluate(() => { window.isletPanel.dispose(); window.isletEngine.dispose(); });
  });
});
