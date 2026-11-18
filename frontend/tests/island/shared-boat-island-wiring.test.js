// Actual island/boat adapter wiring with injected server projections and scene presentation.
// This component test does not install a production authority or prove authenticated gameplay.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
import {wreckModel} from '../../src/island/card-model.js';
import {campaignOf} from '../../src/campaign/index.js';

const browser = browserHarness();
const boat = {open: true, wave: 30, rewardScope: 'island', games: [
  {id: 'dash', best: 36, paid: false, claimedCoins: '12', remainingCoins: '24', maximumCoins: '36'},
  {id: 'broadside', best: 36, paid: true, claimedCoins: '36', remainingCoins: '0', maximumCoins: '36'},
]};

it('shows cumulative island improvements and the exhausted shared cap', () => {
  const campaign = campaignOf({waveBest: 30, campaign: {wave: 30, wreck: {paid: 500, goal: 500}}});
  const model = wreckModel({campaign, boat});
  expect(model.line).toContain('positive improvements');
  expect(model.sail.games.find(game => game.id === 'dash').pay).toBe('Island +12 / 36 · 24 left');
  expect(model.sail.games.find(game => game.id === 'broadside').pay).toContain('Island cap reached');
});

it('keeps live sailing unavailable until a reward scope is known', () => {
  const campaign = campaignOf({waveBest: 30, campaign: {wave: 30, wreck: {paid: 500, goal: 500}}});
  const model = wreckModel({campaign, requireRewardScope: true});
  expect(model.line).toContain('Refresh the ship');
  expect(model.line).not.toContain('first round');
  expect(model.sail.games.every(game => game.disabled)).toBe(true);
  expect(model.sail.games.every(game => !game.pay.includes('★★★'))).toBe(true);
});

async function mountSharedIsland(page, withContext, delayScene = false) {
    await page.evaluate(async ({withContext, delayScene}) => {
      const {createIsland} = await window.g20Import('/src/island/index.js');
      const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const {sharedProjection} = await window.g20Import('/tests/island/shared-core-fixture.js');
      const {on, emit} = await window.g20Import('/src/core/events.js');
      const actor = '12222222-2222-4222-8222-222222222222';
      window.sharedBoatActor = actor;
      const origin = {mode: 'island_shared', version: 1, islandOwner: actor,
        accountId: '23333333-3333-4333-8333-333333333333', runEpoch: '34444444-4444-4444-8444-444444444444'};
      const economy = {...origin, revision: '0', treasury: {balanceCoins: '100', committedCoins: '0', availableCoins: '100'}};
      const base = createFakeIslandTransport(); base.dev.setWaveBest(30);
      base.world.islands.get('K7Q2M').wreck = 500;
      const roundId = '45555555-5555-4555-8555-555555555555';
      window.sharedBoatRequests = [];
      const transport = {
        async get(path) {
          if (path === '/api/island/boat') {
            if (window.holdNextBoatStatus) await new Promise(resolve => {window.releaseSharedBoatStatus = resolve;});
            return {ok: true, status: 200, data: {
            open: true, wave: 30, rewardScope: 'island', economy, games: ['dash', 'broadside'].map(id =>
              ({id, best: 36, paid: false, claimedCoins: '0', remainingCoins: '36', maximumCoins: '36'})),
            }};
          }
          const answer = await base.get(path);
          if(path === '/api/island' && answer.ok) return {...answer,data:withContext
            ?sharedProjection(answer.data,{actorId:actor,economy})
            :{...answer.data,economy:{mode:'personal_legacy',version:0,islandOwner:actor,accountId:null,runEpoch:null,revision:null,treasury:null}}};
          return answer;
        },
        async post(path, body, options) {
          if (!path.startsWith('/api/island/boat')) return base.post(path, body);
          window.sharedBoatRequests.push({path, body, options});
          const start = path.endsWith('/start');
          if (start && window.holdSharedBoatStart) await new Promise(resolve => {window.releaseSharedBoatStart = resolve;});
          if (!start && !path.endsWith('/claim')) return {ok: false, status: 409, code: 'economy_context_required'};
          return {ok: true, status: 200, data: {status: start ? 'started' : 'done', repeat: false,
            receipt: {receiptId: crypto.randomUUID(), action: start ? 'boat:start' : 'boat:claim',
              actionUid: body.actionUid, actorId: actor, origin,
              result: start ? {round: {id: roundId, actorId: actor, ...origin,
                game: body.game, recordWave: 30, maximumCoins: '36'}} : {
                roundId, game: 'dash', recordWave: 30, stars: body.stars, coins: '12',
                cumulativeCoins: '12', maximumCoins: '36', treasuryReceiptId: crypto.randomUUID(),
              }}, currentEconomy: start ? null : {...economy, revision: '1'},
          }};
        },
      };
      window.sharedBoatIsland = createIsland({container: document.body, on, emit, mode: 'live', transport,
        getActorId: () => window.sharedBoatActor, storage: localStorage, menu: () => () => {}, settings: () => () => {},
        loadBoatScene: async () => {
          if (delayScene) {
            window.sharedBoatWaiting = true;
            await new Promise(resolve => {window.releaseSharedBoatScene = resolve;});
          }
          return {createBoatGame(options) {
          const element = document.createElement('section'); element.className = 'shared-boat-scene-fixture';
          document.body.append(element); window.sharedBoatFinish = options.onFinish;
          return {element, phase: 'playing', dispose() {element.remove();}, close: () => options.onClose()};
          }};
        },
      });
      await window.sharedBoatIsland.load(); window.sharedBoatIsland.openWreck();
    }, {withContext, delayScene});
    await page.locator('[data-focus="boat-dash"]').click();
}

it('refuses a shared launch without canonical context and sends no personal award', async () => {
  await browser.withPage(async page => {
      await mountSharedIsland(page, false);
      await page.waitForFunction(() => document.querySelector('.u-toast-text')?.textContent.includes('treasury before sailing'));
      expect(await page.evaluate(() => window.sharedBoatRequests)).toEqual([]);
      expect(await page.locator('.shared-boat-scene-fixture').count()).toBe(0);
      await page.evaluate(() => {window.sharedBoatIsland.dispose(); localStorage.clear();});
  });
});

it('holds input during shared round creation and Escape cancels the pending scene', async () => {
  await browser.withPage(async page => {
    await page.evaluate(() => {window.holdSharedBoatStart = true;});
    await mountSharedIsland(page, true);
    await page.waitForFunction(() => typeof window.releaseSharedBoatStart === 'function');
    expect(await page.evaluate(() => window.sharedBoatIsland.active)).toBe(true);
    expect(await page.evaluate(() => window.sharedBoatIsland.handleEscape())).toBe(true);
    await page.evaluate(() => window.releaseSharedBoatStart());
    await page.waitForFunction(() => !window.sharedBoatIsland.active);
    expect(await page.locator('.shared-boat-scene-fixture').count()).toBe(0);
    expect((await page.evaluate(() => window.sharedBoatRequests)).map(request => request.path))
      .toEqual(['/api/island/boat/start']);
    await page.evaluate(() => {window.sharedBoatIsland.dispose(); localStorage.clear();});
  });
});

it('starts and claims the viewed shared round without selecting a personal award', async () => {
  await browser.withPage(async page => {
    await mountSharedIsland(page, true);
    await page.waitForSelector('.shared-boat-scene-fixture', {state: 'attached'});
    await page.evaluate(() => window.sharedBoatFinish({stars: 1}));
    const requests = await page.evaluate(() => window.sharedBoatRequests);
    expect(requests.map(request => request.path)).toEqual(['/api/island/boat/start', '/api/island/boat/claim']);
    expect(requests[0].body.economy.mode).toBe('island_shared');
    expect(requests[1].body.roundId).toBe('45555555-5555-4555-8555-555555555555');
    expect(requests[1].options.headers['X-Island-Economy-Version']).toBe('1');
    await page.evaluate(() => {window.sharedBoatIsland.dispose(); localStorage.clear();});
  });
});

it('does not start a delayed shared scene for a replacement sign-in', async () => {
  await browser.withPage(async page => {
    await mountSharedIsland(page, true, true);
    await page.waitForFunction(() => window.sharedBoatWaiting);
    await page.evaluate(() => {
      window.sharedBoatActor = '56666666-6666-4666-8666-666666666666';
      window.releaseSharedBoatScene();
    });
    await page.waitForFunction(() => document.querySelector('.u-toast-text')?.textContent.includes('sign-in changed'));
    expect(await page.evaluate(() => window.sharedBoatRequests)).toEqual([]);
    expect(await page.locator('.shared-boat-scene-fixture').count()).toBe(0);
    await page.evaluate(() => {window.sharedBoatIsland.dispose(); localStorage.clear();});
  });
});

it('keeps its verified shared reward scope while another status read is pending', async () => {
  await browser.withPage(async page => {
    await mountSharedIsland(page, true, true);
    await page.waitForFunction(() => window.sharedBoatWaiting);
    await page.evaluate(() => {
      window.holdNextBoatStatus = true;
      window.sharedBoatIsland.openWreck();
      window.releaseSharedBoatScene();
    });
    await page.waitForSelector('.shared-boat-scene-fixture', {state: 'attached'});
    expect(await page.evaluate(() => window.sharedBoatRequests.map(request => request.path)))
      .toEqual(['/api/island/boat/start']);
    await page.evaluate(() => {
      window.sharedBoatIsland.dispose();
      window.releaseSharedBoatStatus();
      localStorage.clear();
    });
  });
});
