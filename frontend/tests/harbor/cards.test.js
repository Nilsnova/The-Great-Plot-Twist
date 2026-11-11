// The Harbor cards on a real DOM (headless Chrome): stake buttons send exactly 5, 10 or 25, the server's
// accepted stake raises harbor_stake_placed, and the open, closed, unavailable, signed-out, refused and
// empty states show plain words. Fakes from fixtures.js stand in for the server.
import {describe, expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();

// Runs inside Chromium: helpers every test below uses.
const PRELUDE = `
  window.harborKit = async () => {
    const fx = await window.g20Import('/tests/harbor/fixtures.js');
    const bus = await window.g20Import('/src/core/events.js');
    const events = []; bus.on('harbor_stake_placed', event => events.push({kind: event.kind, stake: event.stake}));
    const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
    const text = () => document.querySelector('dialog[open]')?.textContent ?? '';
    const item = key => document.querySelector('dialog[open] [data-' + key + ']');
    const press = async (scope, selector) => { const target = scope.querySelector(selector); target.click(); await tick(); return target; };
    return {fx, events, tick, text, item, press};
  };`;
const run = (action, argument) => evaluate.withPage(async page => {
  await page.addScriptTag({content: PRELUDE});
  return page.evaluate(action, argument);
});

describe('market stall card', () => {
  it('sends exactly 5, 10 or 25 coins on up or down and announces the accepted stake', async () => {
    const result = await run(async () => {
      const {fx, events, tick, press} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      const sent = [], labels = [];
      for (const [stake, side] of [[5, 'rising'], [10, 'falling'], [25, 'rising']]) {
        const adapter = fx.fakeMarket();
        const market = createMarketEntry({adapter, now: () => fx.NOW});
        await market.open(); await tick();
        const bitcoin = document.querySelector('[data-asset="harbor-trust"]');
        await press(bitcoin, `[data-side="${side}"]`);
        await press(bitcoin, `[data-stake="${stake}"]`);
        labels.push(bitcoin.querySelector('.harbor-confirm').textContent);
        await press(bitcoin, '.harbor-confirm'); await tick();
        sent.push(...adapter.calls.filter(call => call[0] === 'open').map(call => call[1]));
        market.dispose();
      }
      return {sent, labels, events};
    });
    expect(result.sent).toEqual([{companyId: 'harbor-trust', side: 'rising', stake: 5}, {companyId: 'harbor-trust', side: 'falling', stake: 10},
      {companyId: 'harbor-trust', side: 'rising', stake: 25}]);
    expect(result.labels).toEqual(['Place 🪙 5 on Up', 'Place 🪙 10 on Down', 'Place 🪙 25 on Up']);
    expect(result.events).toEqual([{kind: 'market', stake: 5}, {kind: 'market', stake: 10}, {kind: 'market', stake: 25}]);
  });

  it('shows open, closed and unavailable assets, and only the stakes the server accepts', async () => {
    const result = await run(async () => {
      const {fx, tick, text} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      const market = createMarketEntry({adapter: fx.fakeMarket({board: fx.marketBoard({minStake: 10})}), now: () => fx.NOW});
      await market.open(); await tick();
      const names = [...document.querySelectorAll('[data-asset] h3')].map(node => node.textContent);
      const stakes = [...document.querySelectorAll('[data-asset="harbor-trust"] [data-stake]')].map(node => node.dataset.stake);
      const state = {names, stakes, text: text(), confirmDisabled: document.querySelector('.harbor-confirm').disabled,
        dialog: document.querySelector('dialog[open]').matches('.harbor-card.market-modal')};
      market.dispose();
      const broken = createMarketEntry({adapter: {...fx.fakeMarket(), board: async () => ({ok: false, code: 'network_error', status: 0})}});
      await broken.open(); await tick();
      state.broken = text(); broken.dispose();
      return state;
    });
    expect(result.names).toEqual(['Bitcoin', 'Ether', 'Gold', 'Apple', 'NVIDIA']);
    expect(result.stakes).toEqual(['10', '25']);
    expect(result.text).toContain('Bitcoin$74,339');
    expect(result.text).toContain('Market closed, back at 14:30 Lisbon');
    expect(result.text).toContain('Prices unavailable right now');
    expect(result.text).not.toMatch(/leverage|USDT|zero point|fee/i);
    expect(result.confirmDisabled).toBe(true);
    expect(result.dialog).toBe(true);
    expect(result.broken).toContain('Prices unavailable right now');
    expect(result.broken).toContain('Try again');
  });

  it('asks a signed-out player to sign in instead of saying the session expired', async () => {
    const result = await run(async () => {
      const {fx, tick, text} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      let asked = 0;
      const market = createMarketEntry({adapter: fx.fakeMarket({signedIn: false}), onSignIn: () => asked++, now: () => fx.NOW});
      await market.open(); await tick();
      const state = {text: text(), stakeButtons: document.querySelectorAll('[data-stake]').length};
      document.querySelector('.harbor-sign-in button').click();
      market.dispose();
      return {...state, asked};
    });
    expect(result.text).toContain('Sign in or join with a class code to place a stake');
    expect(result.text).not.toMatch(/expired/i);
    expect(result.stakeButtons).toBe(0);
    expect(result.asked).toBe(1);
  });

  it('words a refusal, and shows the result in coins when a stake is closed', async () => {
    const result = await run(async () => {
      const {fx, tick, text, press} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      const refused = createMarketEntry({adapter: fx.fakeMarket({refuse: 'insufficient_funds'}), now: () => fx.NOW});
      await refused.open(); await tick();
      const ether = document.querySelector('[data-asset="tidewright-works"]');
      await press(ether, '[data-side="rising"]'); await press(ether, '[data-stake="25"]'); await press(ether, '.harbor-confirm'); await tick();
      const refusal = text(); refused.dispose();
      const holding = createMarketEntry({adapter: fx.fakeMarket({portfolio: fx.emptyPortfolio({positions: [fx.openPosition()]})}), now: () => fx.NOW});
      await holding.open(); await tick();
      const before = document.querySelector('[data-asset="harbor-trust"]').textContent;
      const close = document.querySelector('[data-key="close:pos-1"]');
      const label = close.getAttribute('aria-label');
      close.click(); await tick(60);
      const after = document.querySelector('[data-asset="harbor-trust"]').textContent;
      holding.dispose();
      return {refusal, before, label, after};
    });
    expect(result.refusal).toContain('You do not have enough coins for this stake.');
    expect(result.refusal).not.toContain('Server words');
    expect(result.before).toContain('You said Up with 🪙 10.');
    expect(result.before).toContain('Now 🪙 +3');
    expect(result.label).toBe('Close your Up stake on Bitcoin');
    expect(result.after).toContain('You won 🪙 +10');
  });
});

describe('match board card', () => {
  it('sends exactly 5, 10 or 25 coins on the picked side and lists my stakes', async () => {
    const result = await run(async () => {
      const {fx, events, tick, press, text} = await window.harborKit();
      const {createSportsPanel} = await window.g20Import('/src/harbor/match-card.js');
      const sent = [], hints = [];
      let last = '';
      for (const [stake, pick] of [[5, 'home'], [10, 'draw'], [25, 'away']]) {
        const adapter = fx.fakeSports();
        const panel = createSportsPanel({adapter, getToken: () => 'token', clock: () => fx.NOW, timeZone: 'UTC'});
        await panel.open(); await tick();
        const match = document.querySelector('[data-fixture="fd-101"]');
        await press(match, `[data-side="${pick}"]`); await press(match, `[data-stake="${stake}"]`);
        hints.push(match.querySelector('.harbor-hint').textContent);
        await press(match, '.harbor-confirm'); await tick();
        sent.push(...adapter.calls.filter(call => call[0] === 'stake').map(call => ({pick: call[1].pick, amount: call[1].amount})));
        last = text();
        panel.dispose();
      }
      return {sent, hints, events, last};
    });
    expect(result.sent).toEqual([{pick: 'home', amount: 5}, {pick: 'draw', amount: 10}, {pick: 'away', amount: 25}]);
    expect(result.hints[0]).toMatch(/^If you are right you win about 🪙 \d+$/);
    expect(result.events).toEqual([{kind: 'match', stake: 5}, {kind: 'match', stake: 10}, {kind: 'match', stake: 25}]);
    expect(result.last).toContain('My stakes');
    expect(result.last).toContain('🪙 25 on Island United (Harbor Athletic v Island United): waiting for the result');
  });

  it('has friendly empty, closed and signed-out states', async () => {
    const result = await run(async () => {
      const {fx, tick, text} = await window.harborKit();
      const {createSportsPanel} = await window.g20Import('/src/harbor/match-card.js');
      const states = {};
      for (const [name, options, token] of [['empty', {board: fx.sportsBoard([])}, 'token'],
        ['closed', {boardFailure: {ok: false, status: 404, code: 'feature_off'}}, 'token'], ['signedOut', {}, null]]) {
        const panel = createSportsPanel({adapter: fx.fakeSports(options), getToken: () => token, clock: () => fx.NOW});
        await panel.open(); await tick();
        states[name] = {text: text(), stakes: document.querySelectorAll('dialog[open] [data-stake]').length};
        panel.dispose();
      }
      return states;
    });
    expect(result.empty.text).toContain('No matches this week. Leagues pause for internationals.');
    expect(result.closed.text).toContain('The match board is closed for now.');
    expect(result.signedOut.text).toContain('Sign in or join with a class code to place a stake');
    expect(result.signedOut.stakes).toBe(0);
  });
});

describe('fortune teller card', () => {
  it('sends exactly 5, 10 or 25 coins on yes or no and handles empty, closed and signed-out', async () => {
    const result = await run(async () => {
      const {fx, events, tick, press, text} = await window.harborKit();
      const {createDesk} = await window.g20Import('/src/harbor/fortune-card.js');
      const sent = [];
      for (const [stake, side] of [[5, 'yes'], [10, 'no'], [25, 'yes']]) {
        const adapter = fx.fakeDesk();
        const desk = createDesk({adapter});
        await desk.open(); await tick();
        const item = document.querySelector('[data-question="snow-lisbon"]');
        await press(item, `[data-side="${side}"]`); await press(item, `[data-stake="${stake}"]`); await press(item, '.harbor-confirm'); await tick();
        sent.push(...adapter.calls.filter(call => call[0] === 'stake').map(call => ({side: call[1].side, amount: call[1].amount})));
        desk.dispose();
      }
      const states = {};
      for (const [name, options] of [['empty', {questions: []}], ['closed', {closed: true}], ['signedOut', {signedIn: false}], ['refused', {refuse: 'already_staked'}]]) {
        const desk = createDesk({adapter: fx.fakeDesk(options)});
        await desk.open(); await tick();
        if (name === 'refused') {
          const item = document.querySelector('[data-question="snow-lisbon"]');
          await press(item, '[data-side="no"]'); await press(item, '[data-stake="5"]'); await press(item, '.harbor-confirm'); await tick();
        }
        states[name] = {text: text(), stakes: document.querySelectorAll('dialog[open] [data-stake]').length};
        desk.dispose();
      }
      return {sent, events, states};
    });
    expect(result.sent).toEqual([{side: 'yes', amount: 5}, {side: 'no', amount: 10}, {side: 'yes', amount: 25}]);
    expect(result.events).toEqual([{kind: 'fortune', stake: 5}, {kind: 'fortune', stake: 10}, {kind: 'fortune', stake: 25}]);
    expect(result.states.empty.text).toContain('No open questions right now');
    expect(result.states.closed.text).toContain('The fortune teller is closed for now.');
    expect(result.states.signedOut.text).toContain('Sign in or join with a class code to place a stake');
    expect(result.states.signedOut.stakes).toBe(0);
    expect(result.states.refused.text).toContain('You already have a stake on this one.');
  });
});

describe('harbor overview and weather board', () => {
  it('lists the four stalls and the duel ring with one sentence each, and opens a stall', async () => {
    const result = await run(async () => {
      const {fx, tick, text} = await window.harborKit();
      const {createHarbor} = await window.g20Import('/src/harbor/host.js');
      const opened = [], menus = [];
      let answer = fx.weatherAnswer('storm');
      const harbor = createHarbor({container: document.body, getWeather: () => answer, openStall: id => opened.push(id), menu: provider => { menus.push(provider); return () => {}; }});
      menus[0]()[0].onSelect(); await tick(80);
      const stalls = [...document.querySelectorAll('[data-stall]')].map(node => ({id: node.dataset.stall, title: node.querySelector('h3').textContent,
        button: node.querySelector('button')?.textContent ?? null}));
      document.querySelector('[data-stall="match"] button').click(); await tick();
      await harbor.openOverview(); await tick();
      document.querySelector('dialog[open] [data-stall="weather"] button').click(); await tick(60);
      const storm = text();
      harbor.close(); answer = null; await harbor.openWeather(); await tick();
      const offline = text();
      harbor.dispose();
      return {menu: menus[0]()[0].label, stalls, opened, storm, offline};
    });
    expect(result.menu).toBe('Harbor');
    expect(result.stalls.map(stall => stall.title)).toEqual(['Market stall', 'Match board', 'Fortune teller', 'Weather board', 'Duel ring']);
    expect(result.stalls.at(-1).button).toBeNull();
    expect(result.opened).toEqual(['match']);
    expect(result.storm).toContain('Right now at Carcavelos, Portugal: Thunderstorm, windy');
    expect(result.storm).toContain('Storm: 50% more pirate ships');
    expect(result.storm).toContain('Open-Meteo');
    expect(result.offline).toContain('Calm: a quiet sea');
  });
});
