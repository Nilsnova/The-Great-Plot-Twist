// Real-DOM fixtures prove treasury display/affordability only; no authenticated shared-economy backend is used.
import {expect, it} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('keeps the visited island treasury in the HUD and crew card despite a larger private wallet', async () => {
  await evaluate.withPage(async page => {
    await page.setViewportSize({width: 1280, height: 800});
    const result = await page.evaluate(async () => {
      for (const path of ['/src/ui/base.css', '/src/ui/kit/kit.css', '/src/ui/styles.css', '/src/ui/readability.css']) await window.g20Import(path);
      const {createHud} = await window.g20Import('/src/ui/hud.js');
      const {createIsland} = await window.g20Import('/src/island/index.js');
      const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
      const {sharedEconomy,sharedIsland} = await window.g20Import('/tests/island/economy-fixture.js');
      const {fundedFixture}=await window.g20Import('/tests/island/shared-core-fixture.js');
      const {on, emit} = await window.g20Import('/src/core/events.js');
      const container = document.createElement('main'); container.id = 'game'; document.body.append(container);
      window.fixtureHud = createHud(container, {start() {}, focus() {}, menu() {}, hasIsland: () => false}, {storage: null});
      window.fixtureHud.start();
      const base = createFakeIslandTransport(); base.dev.setCoins(9000);
      const transport = {post: (path, body) => base.post(path, body), get: async path => {
        const answer = await base.get(path);
        if (answer.ok && path.startsWith('/api/island/visit/')) {
          const snapshot=fundedFixture(sharedEconomy({treasury:{balanceCoins:'100',committedCoins:'75',availableCoins:'25'}}));
          snapshot.code=answer.data.code;snapshot.ownerName=answer.data.ownerName;snapshot.crew.gunner=1;
          return {...answer,data:snapshot};
        }
        return answer;
      }};
      let key = null;
      window.fixtureIsland = createIsland({container, mode: 'fake', transport, on, emit, storage: null, visitStorage: null,
        menu: () => () => {}, settings: () => () => {},
        onCoins: (value, options) => {
          if (options?.shared) { window.fixtureHud.setTreasury(options.economy, {replace: key !== options.fundingKey}); key = options.fundingKey; }
          else { if (key !== null) { key = null; window.fixtureHud.clearTreasury(); } window.fixtureHud.setCoinSource('island'); window.fixtureHud.setCoins(value); }
        }});
      window.fixtureIsland.visit('ISLE-FR3ND'); await window.fixtureIsland.load();
      window.fixtureIsland.openCrew(); await new Promise(resolve => setTimeout(resolve, 40));
      const card = document.querySelector('.island-card[open]');
      const purseRect = document.querySelector('.hud-coins').getBoundingClientRect(), visitRect = document.querySelector('.island-visit').getBoundingClientRect();
      return {hud: document.querySelector('.hud-coins').textContent, label: document.querySelector('.hud-coins').getAttribute('aria-label'),
        card: card.textContent, gunnerDisabled: card.querySelector('[data-focus="hire-gunner"]').disabled,
        lookoutDisabled: card.querySelector('[data-focus="hire-lookout"]').disabled, visitClear: visitRect.top >= purseRect.bottom};
    });
    expect(result.hud).toContain('Island treasury'); expect(result.hud).toContain('🪙 25');
    expect(result.label).toContain('🪙 75 committed'); expect(result.hud).not.toContain('9,000');
    expect(result.card).toContain('They help this island in every wave.');
    expect(result.card).toContain('🪙 25 available'); expect(result.card).not.toContain('9,000');
    expect(result.gunnerDisabled).toBe(true); expect(result.lookoutDisabled).toBe(false);
    expect(result.visitClear).toBe(true);
    if (process.env.MP_ECO_EVIDENCE_DIR) {
      await mkdir(process.env.MP_ECO_EVIDENCE_DIR, {recursive: true});
      await page.screenshot({path: join(process.env.MP_ECO_EVIDENCE_DIR, 'treasury-crew-desktop.png')});
    }
    await page.evaluate(() => { window.fixtureIsland.dispose(); window.fixtureHud.dispose(); });
  });
});

it('wraps exact large treasury amounts on a phone and ignores private or stale money updates', async () => {
  await evaluate.withPage(async page => {
    await page.setViewportSize({width: 375, height: 812});
    const result = await page.evaluate(async () => {
      for (const path of ['/src/ui/base.css', '/src/ui/kit/kit.css', '/src/ui/styles.css', '/src/ui/readability.css']) await window.g20Import(path);
      const {createHud} = await window.g20Import('/src/ui/hud.js');
      const {sharedEconomy} = await window.g20Import('/tests/island/economy-fixture.js');
      const container = document.createElement('main'); container.id = 'game'; document.body.append(container);
      const hud = createHud(container, {start() {}, focus() {}, menu() {}, hasIsland: () => false}, {storage: null});
      window.phoneTreasuryHud = hud; hud.start();
      hud.setTreasury(sharedEconomy({revision: '3', treasury: {balanceCoins: '9007199254740993', committedCoins: '1000', availableCoins: '9007199254739993'}}));
      hud.setCoins(99999); hud.setCaptain({account: {state: 'signed_in'}, captain: {coins: 77777}});
      hud.setTreasury(sharedEconomy({revision: '2'}));
      const purse = document.querySelector('.hud-coins'), menu = document.querySelector('.hud-menu');
      const a = purse.getBoundingClientRect(), b = menu.getBoundingClientRect();
      return {text: purse.textContent, label: purse.getAttribute('aria-label'),
        inViewport: a.left >= 0 && a.right <= innerWidth, separate: a.right <= b.left || a.bottom <= b.top};
    });
    expect(result.text).toContain('🪙 9,007,199,254,739,993'); expect(result.text).toContain('🪙 1,000 committed');
    expect(result.text).not.toContain('99,999'); expect(result.text).not.toContain('77,777');
    expect(result.inViewport).toBe(true); expect(result.separate).toBe(true);
    if (process.env.MP_ECO_EVIDENCE_DIR) {
      await mkdir(process.env.MP_ECO_EVIDENCE_DIR, {recursive: true});
      await page.screenshot({path: join(process.env.MP_ECO_EVIDENCE_DIR, 'treasury-phone.png')});
    }
    await page.evaluate(() => window.phoneTreasuryHud.dispose());
  });
});
