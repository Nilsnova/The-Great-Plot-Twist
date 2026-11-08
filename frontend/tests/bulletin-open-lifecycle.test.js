// Actual bridge/controller, native modal events, real module-request barriers, and local recorded views.
import {expect, it} from 'vitest';
import {browserHarness} from './g20-browser.js';

const native = browserHarness();
const modal = page => page.locator('.case-modal[open]');
const banner = page => page.locator('.case-loading');

async function holdFirstBulletin(page, path = '/src/screens/bulletin/index.js', {fail = false} = {}) {
  let release, requested;
  const gate = new Promise(resolve => {release = resolve;}), started = new Promise(resolve => {requested = resolve;});
  let first = true;
  await page.route(`**${path}*`, async route => {
    if (first) {first = false; requested(); await gate;}
    if (fail) await route.abort();
    else await route.continue();
  });
  return {started, release};
}
async function mount(page, {scenario = 'hook', crew = true} = {}) {
  await page.evaluate(async ({scenario, crew}) => {
    await window.g20Import('/src/ui/base.css'); await window.g20Import('/src/ui/kit/kit.css');
    const {createCaseBridge} = await window.g20Import('/src/adapter/bridge.js');
    const {createFakeCaseAdapter} = await window.g20Import('/src/adapter/fake/index.js');
    const {on} = await window.g20Import('/src/core/events.js');
    const fake = createFakeCaseAdapter(), canvas = document.createElement('canvas');
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Recorded game canvas'); document.body.append(canvas); canvas.focus();
    fake.dev.setBulletin(scenario);
    const proof = {fake, canvas, events: [], outerEscapes: 0, pending: null, tasks: []};
    proof.stopEvent = on('bulletin_opened', event => proof.events.push({...event}));
    proof.outerKey = event => {if (event.key === 'Escape') proof.outerEscapes += 1;};
    window.addEventListener('keydown', proof.outerKey);
    proof.bridge = createCaseBridge({container: document.body, adapter: fake, resetInput() {}, focus: () => canvas.focus()});
    // Observe completion only; every native navigation still runs the actual bridge method unchanged.
    const open = proof.bridge.open;
    proof.bridge.open = (...args) => {const task = open(...args); proof.tasks.push(task); return task;};
    window.bulletinOpenProof = proof;
    if (crew) await proof.bridge.open('crew');
  }, {scenario, crew});
}
async function begin(page) {
  await page.evaluate(() => {const p = window.bulletinOpenProof; p.pending = p.bridge.open('bulletin');});
}
async function settled(page) {await page.evaluate(() => window.bulletinOpenProof.pending);}
async function cleanup(page, held) {
  await page.evaluate(() => window.bulletinOpenProof?.bridge.dispose());
  held?.release();
  await page.evaluate(async () => {const p = window.bulletinOpenProof;
    if (!p) return; await Promise.allSettled(p.tasks); p.fake.dispose(); p.stopEvent();
    window.removeEventListener('keydown', p.outerKey); p.canvas.remove();
  });
}
const state = page => page.evaluate(() => {const p = window.bulletinOpenProof; return {
  active: p.bridge.active, events: p.events, outerEscapes: p.outerEscapes,
  canvasFocused: document.activeElement === p.canvas,
};});
async function escape(page) {
  await page.keyboard.press('Escape'); await modal(page).waitFor({state: 'hidden'});
  await page.waitForFunction(() => document.activeElement === window.bulletinOpenProof.canvas);
}

it('refuses known-off and disposed opens before requesting a controller or Bulletin module', async () => {
  await native.withPage(async page => {
    const imports = [];
    page.on('request', request => {const path = new URL(request.url()).pathname;
      if (['/src/screens/controller.js', '/src/screens/bulletin/index.js'].includes(path)) imports.push(path);
    });
    await mount(page, {scenario: 'off', crew: false});
    try {
      await page.evaluate(() => window.bulletinOpenProof.bridge.open('bulletin'));
      expect(await state(page)).toMatchObject({active: false, events: [], canvasFocused: true});
      expect(await modal(page).count()).toBe(0); expect(await banner(page).isHidden()).toBe(true);
      await page.evaluate(async () => {const p = window.bulletinOpenProof;
        p.bridge.dispose(); p.fake.dev.setBulletin('hook'); await p.bridge.open('bulletin');
      });
      expect(await state(page)).toMatchObject({active: false, events: []}); expect(imports).toEqual([]);
    } finally {await cleanup(page);}
  });
});

it.each([false, true])('cancels its first Bulletin import on off with prior Crew %s, then opens unavailable normally', async crew => {
  await native.withPage(async page => {
    const held = await holdFirstBulletin(page); await mount(page, {crew});
    try {
      if (crew) expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      await begin(page); await held.started;
      expect(await banner(page).isVisible()).toBe(true);
      await page.evaluate(() => window.bulletinOpenProof.fake.dev.setBulletin('off'));
      // Assert before releasing the module: cancellation must not depend on its eventual completion.
      expect(await state(page)).toMatchObject({active: crew, events: []});
      expect(await modal(page).count()).toBe(crew ? 1 : 0); expect(await banner(page).isHidden()).toBe(true);
      held.release(); await settled(page);
      expect(await page.locator('.bulletin-screen').count()).toBe(0);
      expect(await state(page)).toMatchObject({active: crew, events: []});
      expect(await modal(page).count()).toBe(crew ? 1 : 0); expect(await banner(page).isHidden()).toBe(true);
      if (crew) expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      await page.evaluate(async () => {const p = window.bulletinOpenProof;
        p.fake.dev.setBulletin('unavailable'); await p.bridge.open('bulletin');
      });
      expect(await modal(page).locator('.bulletin-status').textContent()).toBe('The harbor bulletin is unavailable right now.');
      expect(await modal(page).locator('.bulletin-lines').isHidden()).toBe(true);
      expect(await banner(page).isHidden()).toBe(true);
      expect(await state(page)).toMatchObject({active: true, events: [{type: 'bulletin_opened'}]});
      await escape(page);
      expect(await state(page)).toEqual({active: false, events: [{type: 'bulletin_opened'}], outerEscapes: 0, canvasFocused: true});
    } finally {await cleanup(page, held);}
  });
});

it('does not let an off publication or the late old import close a newer Crew page', async () => {
  await native.withPage(async page => {
    const held = await holdFirstBulletin(page); await mount(page);
    try {
      await begin(page); await held.started;
      await page.evaluate(() => window.bulletinOpenProof.bridge.open('crew'));
      expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      await page.evaluate(() => window.bulletinOpenProof.fake.dev.setBulletin('off'));
      expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      held.release(); await settled(page);
      expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      expect(await banner(page).isHidden()).toBe(true);
      expect(await state(page)).toMatchObject({active: true, events: []});
      await escape(page);
      expect(await state(page)).toEqual({active: false, events: [], outerEscapes: 0, canvasFocused: true});
    } finally {await cleanup(page, held);}
  });
});

it('retains native pending Escape cancellation and focus when the cancelled module completes late', async () => {
  await native.withPage(async page => {
    const held = await holdFirstBulletin(page); await mount(page);
    try {
      await begin(page); await held.started;
      await escape(page);
      expect(await banner(page).isHidden()).toBe(true);
      expect(await state(page)).toEqual({active: false, events: [], outerEscapes: 0, canvasFocused: true});
      held.release(); await settled(page);
      expect(await modal(page).count()).toBe(0); expect(await banner(page).isHidden()).toBe(true);
      expect(await state(page)).toEqual({active: false, events: [], outerEscapes: 0, canvasFocused: true});
    } finally {await cleanup(page, held);}
  });
});

it('keeps a genuine module failure notice for its existing timeout and permits later Crew navigation', async () => {
  await native.withPage(async page => {
    await page.clock.install({time: new Date('2026-11-07T12:00:00Z')});
    await page.route('**/src/screens/bulletin/index.js*', route => route.abort()); await mount(page);
    try {
      await begin(page); await settled(page);
      expect(await state(page)).toMatchObject({active: true, events: []});
      expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      expect(await banner(page).isVisible()).toBe(true);
      expect(await banner(page).textContent()).toBe('The case screen could not load. Try opening it again.');
      await page.clock.runFor(4001); expect(await banner(page).isHidden()).toBe(true);
      await page.evaluate(() => window.bulletinOpenProof.bridge.open('crew'));
      expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      expect(await banner(page).isHidden()).toBe(true);
      await escape(page);
      expect(await state(page)).toMatchObject({active: false, outerEscapes: 0, canvasFocused: true});
    } finally {await cleanup(page);}
  });
});

it('keeps the native Crew modal owning Escape during a picker import and prevents the cancelled late page opening', async () => {
  await native.withPage(async page => {
    const held = await holdFirstBulletin(page, '/src/screens/board.js'); await mount(page);
    try {
      await page.getByLabel('Case page', {exact: true}).evaluate(picker => {
        const original = picker.onchange; picker.onchange = function(event) {
          const task = original.call(this, event); window.bulletinOpenProof.tasks.push(task); return task;
        };
      });
      await page.getByLabel('Case page', {exact: true}).selectOption('board'); await held.started;
      expect(await state(page)).toMatchObject({active: true}); expect(await banner(page).isHidden()).toBe(true);
      expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      await escape(page);
      expect(await state(page)).toEqual({active: false, events: [], outerEscapes: 0, canvasFocused: true});
      expect(await banner(page).isHidden()).toBe(true);
      held.release(); await page.evaluate(() => Promise.allSettled(window.bulletinOpenProof.tasks));
      expect(await modal(page).count()).toBe(0); expect(await banner(page).isHidden()).toBe(true);
      expect(await state(page)).toEqual({active: false, events: [], outerEscapes: 0, canvasFocused: true});
    } finally {await cleanup(page, held);}
  });
});

it('does not cancel a newer native picker import when off cancels the old bridge-owned Bulletin loader', async () => {
  await native.withPage(async page => {
    const bulletin = await holdFirstBulletin(page), board = await holdFirstBulletin(page, '/src/screens/board.js');
    const held = {release() {bulletin.release(); board.release();}}; await mount(page);
    try {
      await begin(page); await bulletin.started;
      await page.getByLabel('Case page', {exact: true}).evaluate(picker => {
        const original = picker.onchange; picker.onchange = function(event) {
          const task = original.call(this, event); window.bulletinOpenProof.tasks.push(task); return task;
        };
      });
      await page.getByLabel('Case page', {exact: true}).selectOption('board'); await board.started;
      await page.evaluate(() => window.bulletinOpenProof.fake.dev.setBulletin('off'));
      expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      expect(await banner(page).isHidden()).toBe(true);
      board.release(); await page.evaluate(() => window.bulletinOpenProof.tasks.at(-1));
      expect(await modal(page).locator('.case-board').isVisible()).toBe(true);
      bulletin.release(); await settled(page);
      expect(await modal(page).locator('.case-board').isVisible()).toBe(true);
      expect(await banner(page).isHidden()).toBe(true);
      expect(await state(page)).toMatchObject({active: true, events: []});
      await escape(page);
      expect(await state(page)).toEqual({active: false, events: [], outerEscapes: 0, canvasFocused: true});
    } finally {await cleanup(page, held);}
  });
});



it.each([false, true])('keeps a newer native page owned when the visible Bulletin turns off: cancel %s', async cancel => {
  await native.withPage(async page => {
    await page.setViewportSize(cancel ? {width: 375, height: 400} : {width: 320, height: 667});
    const held = await holdFirstBulletin(page, '/src/screens/board.js'); await mount(page, {crew: false});
    try {
      await page.evaluate(() => window.bulletinOpenProof.bridge.open('bulletin'));
      expect(await modal(page).locator('.bulletin-screen').isVisible()).toBe(true);
      await page.getByLabel('Case page', {exact: true}).evaluate(picker => {
        const original = picker.onchange; picker.onchange = function(event) {
          const task = original.call(this, event); window.bulletinOpenProof.tasks.push(task); return task;
        };
      });
      await page.getByLabel('Case page', {exact: true}).selectOption('board'); await held.started;
      await page.evaluate(() => window.bulletinOpenProof.fake.dev.setBulletin('off'));
      expect(await state(page)).toMatchObject({active: true, events: [{type: 'bulletin_opened'}]});
      expect(await modal(page).locator('.case-pending[role="status"]').textContent())
        .toBe('Opening the case · Escape to cancel');
      expect(await modal(page).locator('.bulletin-screen').count()).toBe(0);
      expect(await modal(page).locator('.case-pending').evaluate(element =>
        Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(18);
      expect(await modal(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      if (cancel) await escape(page);
      held.release(); await page.evaluate(() => Promise.allSettled(window.bulletinOpenProof.tasks));
      expect(await banner(page).isHidden()).toBe(true);
      if (cancel) {
        expect(await modal(page).count()).toBe(0);
        expect(await state(page)).toEqual({active: false, events: [{type: 'bulletin_opened'}],
          outerEscapes: 0, canvasFocused: true});
      } else {
        expect(await modal(page).locator('.case-board').isVisible()).toBe(true);
        expect(await modal(page).locator('.case-pending').count()).toBe(0);
        await escape(page);
      }
    } finally {await cleanup(page, held);}
  });
});

it('cleans up a failed replacement after Bulletin off while preserving the bridge error notice', async () => {
  await native.withPage(async page => {
    await page.clock.install({time: new Date('2026-11-07T12:00:00Z')});
    const held = await holdFirstBulletin(page, '/src/screens/board.js', {fail: true});
    await mount(page, {crew: false});
    try {
      await page.evaluate(() => window.bulletinOpenProof.bridge.open('bulletin'));
      await page.evaluate(() => {const p = window.bulletinOpenProof; p.pending = p.bridge.open('board');});
      await held.started;
      await page.evaluate(() => window.bulletinOpenProof.fake.dev.setBulletin('off'));
      expect(await modal(page).locator('.case-pending').isVisible()).toBe(true);
      held.release(); await settled(page);
      expect(await modal(page).count()).toBe(0);
      expect(await state(page)).toMatchObject({active: false, events: [{type: 'bulletin_opened'}]});
      expect(await banner(page).textContent()).toBe('The case screen could not load. Try opening it again.');
      expect(await banner(page).isVisible()).toBe(true);
      await page.clock.runFor(4001); expect(await banner(page).isHidden()).toBe(true);
      await page.evaluate(() => window.bulletinOpenProof.bridge.open('crew'));
      expect(await modal(page).locator('.case-crew').isVisible()).toBe(true);
      await escape(page);
    } finally {await cleanup(page, held);}
  });
});
