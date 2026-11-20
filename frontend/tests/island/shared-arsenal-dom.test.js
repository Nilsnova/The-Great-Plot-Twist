// Real Chromium card controls on declared shared fixtures; no authenticated/runtime claim.
import {expect, it} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from '../g20-browser.js';
import {data, id} from './shared-arsenal-fixture.js';

const browser = browserHarness();

it('wires the viewed canonical treasury and verified actor through the actual island controller', async () => {
  await browser.withPage(async page => {
    const view = data(); view.economy.islandOwner = view.copies[0].holder;
    await page.evaluate(async fixture => {
      const {createIsland} = await window.g20Import('/src/island/index.js');
      const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const {sharedProjection} = await window.g20Import('/tests/island/shared-core-fixture.js');
      const {on, emit} = await window.g20Import('/src/core/events.js');
      const base = createFakeIslandTransport(); base.dev.setWaveBest(4);
      window.wiredArsenalRequests = [];
      const transport = {
        async get(path) {
          if (path === '/api/island/arsenal') return {ok: true, data: fixture};
          const answer = await base.get(path);
          return path === '/api/island' ? {...answer, data: sharedProjection(answer.data, {actorId:fixture.copies[0].holder,economy:fixture.economy,
            capabilities:Object.fromEntries(['arsenal','session','move','repair','reset','market','match'].map(key=>[key,{available:key==='arsenal',reason:key==='arsenal'?null:'economy_path_unavailable'}]))})} : answer;
        },
        async post(path, body, options) {
          if (path !== '/api/island/arsenal/buy') return base.post(path, body);
          window.wiredArsenalRequests.push({path, body, options});
          return {ok: false, status: 503, code: 'database_unavailable', message: 'Retry the same request.'};
        },
      };
      window.wiredArsenalIsland = createIsland({container: document.body, transport, on, emit, mode: 'live',
        getActorId: () => fixture.copies[0].holder, storage: null, visitStorage: null,
        menu: () => () => {}, settings: () => () => {}});
      await window.wiredArsenalIsland.load(); window.wiredArsenalIsland.arsenal.open();
    }, view);
    await page.locator('[data-focus="buy-pistols"]').click();
    await page.waitForFunction(() => window.wiredArsenalRequests.length === 1);
    const [request] = await page.evaluate(() => window.wiredArsenalRequests);
    expect(request.body.economy).toEqual({mode: 'island_shared', version: 1,
      islandOwner: view.economy.islandOwner, runEpoch: view.economy.runEpoch});
    expect(request.body).not.toHaveProperty('actorId');
    expect(request.body).not.toHaveProperty('accountId');
    expect(request.body).not.toHaveProperty('code');
    expect(request.options.headers['X-Island-Economy-Version']).toBe('1');
    await page.evaluate(() => {window.wiredArsenalIsland.dispose(); sessionStorage.clear();});
  });
});

it.each([{width: 1280, height: 720}, {width: 375, height: 812}])('shared full-inventory return stays usable at $width x $height', async size => {
  await browser.withPage(async page => {
    await page.setViewportSize(size);
    const view = data();
    for (let n = 1; n < 20; n++) view.copies.push({...view.copies[0], id: id(100 + n), no: n + 1,
      holder: null, holderName: null, you: false, holderGeneration: '0'});
    view.total = 20; view.stored = 19;
    await page.evaluate(async fixture => {
      for (const sheet of ['base', 'kit/kit', 'shell', 'styles', 'travel', 'readability', 'kit/components', 'devices', 'open-panels']) {
        await window.g20Import(`/src/ui/${sheet}.css`);
      }
      const {createIslandUi} = await window.g20Import('/src/island/ui.js');
      const {arsenalModel} = await window.g20Import('/src/island/arsenal-model.js');
      window.sharedReturns = 0;
      window.sharedArsenalUi = createIslandUi({container: document.body});
      window.sharedArsenalUi.arsenalCard(arsenalModel({answer: fixture, filter: 'carried'}), {
        giveBack() { window.sharedReturns++; },
      });
    }, view);
    const back = page.getByRole('button', {name: 'Return to the rack', exact: true});
    expect(await back.isEnabled()).toBe(true);
    await back.focus(); await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.sharedReturns)).toBe(1);
    expect(await page.getByRole('heading', {name: 'Buy for the crew (island treasury)', exact: true}).count()).toBe(1);
    expect(await page.locator('[data-focus="buy-pistols"]').isDisabled()).toBe(true);
    const bounds = await back.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width);
    const captureDir = process.env.ARSENAL_CAPTURE_DIR;
    if (captureDir) {
      await mkdir(captureDir, {recursive: true});
      await page.screenshot({path: join(captureDir, `shared-arsenal-${size.width}.png`)});
    }
  });
});
