// The Harbor cards on a real DOM (headless Chrome): stake buttons send exactly 5, 10 or 25, the server's
// accepted stake raises harbor_stake_placed, and the open, closed, unavailable, signed-out, refused and
// empty states show plain words. The market stall follows the calls routes ("Up or down in 5 minutes?"). Fakes from fixtures.js stand in for the server.
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
  it('sends exactly 5, 10 or 25 coins on up or down with an actionUid and announces the accepted call', async () => {
    const result = await run(async () => {
      const {fx, events, tick, press} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      const sent = [], labels = [], names = [];
      let n = 0;
      for (const [stake, side] of [[5, 'up'], [10, 'down'], [25, 'up']]) {
        const adapter = fx.fakeCalls();
        const market = createMarketEntry({adapter, now: () => fx.NOW, makeUid: () => `uid-${++n}-abcdefgh`});
        await market.open(); await tick();
        const bitcoin = document.querySelector('[data-asset="harbor-trust"]');
        names.push(bitcoin.querySelector('.harbor-question').textContent, bitcoin.querySelector(`[data-side="${side}"]`).getAttribute('aria-label'));
        await press(bitcoin, `[data-side="${side}"]`);
        await press(bitcoin, `[data-stake="${stake}"]`);
        labels.push(bitcoin.querySelector('.harbor-confirm').getAttribute('aria-label'));
        await press(bitcoin, '.harbor-confirm'); await tick();
        sent.push(...adapter.requests.filter(call => call[0] === 'place').map(call => [call[1], call[2]]));
        names.push(document.querySelector('[data-asset="harbor-trust"] [data-open="true"]')?.textContent);
        market.dispose();
      }
      return {sent, labels, names, events};
    });
    expect(result.sent).toEqual([[{asset: 'harbor-trust', direction: 'up', stake: 5}, 'uid-1-abcdefgh'],
      [{asset: 'harbor-trust', direction: 'down', stake: 10}, 'uid-2-abcdefgh'], [{asset: 'harbor-trust', direction: 'up', stake: 25}, 'uid-3-abcdefgh']]);
    expect(result.labels).toEqual(['Place 🪙 5 on Up, Bitcoin', 'Place 🪙 10 on Down, Bitcoin', 'Place 🪙 25 on Up, Bitcoin']);
    expect(result.names.slice(0, 3)).toEqual(['Up or down in 5 minutes?', 'Up, Bitcoin', 'You said Up with 🪙 5.Decided in 5 min']);
    expect(result.events).toEqual([{kind: 'market', stake: 5}, {kind: 'market', stake: 10}, {kind: 'market', stake: 25}]);
  });

  it('shows prices, closed reasons, open calls counting down and decided results, with nothing preselected', async () => {
    const result = await run(async () => {
      const {fx, tick, text} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      const calls = [fx.marketCall({asset: 'tidewright-works', settleAt: '2026-11-11T12:42:00Z'}),
        fx.marketCall({id: 'won', status: 'won', settlePrice: 75000, payout: 20, settleAt: '2026-11-11T11:00:00Z'}),
        fx.marketCall({id: 'back', asset: 'greyfathom-salvage', status: 'refunded', payout: 10, settleAt: '2026-11-11T11:10:00Z'}),
        fx.marketCall({id: 'lost', asset: 'greyfathom-salvage', direction: 'down', stake: 5, status: 'lost', payout: 0, settleAt: '2026-11-11T11:00:00Z'})];
      const market = createMarketEntry({adapter: fx.fakeCalls({calls}), now: () => fx.NOW});
      await market.open(); await tick();
      const piece = id => document.querySelector(`[data-asset="${id}"]`).textContent;
      const state = {names: [...document.querySelectorAll('[data-asset] h3')].map(node => node.textContent),
        stakes: [...document.querySelectorAll('[data-asset="harbor-trust"] [data-stake]')].map(node => node.dataset.stake),
        pressed: document.querySelectorAll('[aria-pressed="true"]').length, text: text(),
        bitcoin: piece('harbor-trust'), ether: piece('tidewright-works'), gold: piece('greyfathom-salvage'),
        apple: piece('apple'), nvidia: piece('nvidia'),
        closedPickers: document.querySelectorAll('[data-asset="apple"] .harbor-picker, [data-asset="nvidia"] .harbor-picker').length,
        confirmDisabled: [...document.querySelectorAll('.harbor-confirm')].every(node => node.disabled),
        closeButtons: [...document.querySelectorAll('dialog[open] .harbor-card-main button')].filter(node => /close/i.test(node.textContent + (node.getAttribute('aria-label') ?? ''))).length,
        dialog: document.querySelector('dialog[open]').matches('.harbor-card.market-modal')};
      market.dispose();
      const broken = createMarketEntry({adapter: {...fx.fakeCalls(), read: async () => ({ok: false, code: 'network_error', status: 0})}});
      await broken.open(); await tick();
      state.broken = text(); broken.dispose();
      return state;
    });
    expect(result.names).toEqual(['Bitcoin', 'Ether', 'Gold', 'Apple', 'NVIDIA']);
    expect(result.stakes).toEqual(['5', '10', '25']);
    expect(result.pressed).toBe(0);
    expect(result.confirmDisabled).toBe(true);
    expect(result.text).toContain('Bitcoin$74,339');
    expect(result.text).toContain('You have 🪙 100');
    expect(result.ether).toContain('You said Up with 🪙 10.Decided in 42 min');
    expect(result.bitcoin).toContain('You won 🪙 +20');
    expect(result.gold).toContain('Refunded 🪙 10');
    expect(result.gold).toContain('You said Down with 🪙 5.Lost');
    expect(result.apple).toContain('Closed outside market hours');
    expect(result.nvidia).toContain('No price yet');
    expect(result.nvidia).toContain('Prices unavailable right now');
    expect(result.closedPickers).toBe(0);
    expect(result.text).not.toMatch(/leverage|USDT|zero point|fee|position|outside_hours|source_off/i);
    expect(result.closeButtons).toBe(0); // a call is never closed early: it is decided after its five minutes
    expect(result.dialog).toBe(true);
    expect(result.broken).toContain('Prices unavailable right now');
    expect(result.broken).toContain('Try again');
  });

  it('asks a signed-out player to sign in, and says the stall is closed while the flag is off', async () => {
    const result = await run(async () => {
      const {fx, tick, text} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      let asked = 0;
      const market = createMarketEntry({adapter: fx.fakeCalls({signedIn: false}), onSignIn: () => asked++, now: () => fx.NOW});
      await market.open(); await tick();
      const state = {text: text(), stakeButtons: document.querySelectorAll('[data-stake]').length};
      document.querySelector('.harbor-sign-in button').click();
      market.dispose();
      const adapter = fx.fakeCalls({off: true});
      const off = createMarketEntry({adapter, now: () => fx.NOW});
      await off.open(); await tick();
      state.off = text(); state.offStakes = document.querySelectorAll('[data-stake]').length;
      state.offPlaced = adapter.requests.filter(call => call[0] === 'place').length;
      off.dispose();
      return {...state, asked};
    });
    expect(result.text).toContain('Sign in or join with a class code to place a stake');
    expect(result.text).not.toMatch(/expired/i);
    expect(result.stakeButtons).toBe(0);
    expect(result.asked).toBe(1);
    expect(result.off).toContain('This stall is closed for now.');
    expect(result.off).not.toContain('Server words');
    expect(result.offStakes).toBe(0);
    expect(result.offPlaced).toBe(0);
  });

  it('words refusals in plain words and announces nothing', async () => {
    const result = await run(async () => {
      const {fx, events, tick, text, press} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      const out = {};
      for (const code of ['insufficient_funds', 'market_closed', 'too_many_calls']) {
        const refused = createMarketEntry({adapter: fx.fakeCalls({refuse: code}), now: () => fx.NOW});
        await refused.open(); await tick();
        const ether = document.querySelector('[data-asset="tidewright-works"]');
        await press(ether, '[data-side="up"]'); await press(ether, '[data-stake="25"]'); await press(ether, '.harbor-confirm'); await tick();
        out[code] = text(); refused.dispose();
      }
      return {out, events};
    });
    expect(result.out.insufficient_funds).toContain('You do not have enough coins for this stake.');
    expect(result.out.market_closed).toContain('The market just closed. Try again when it opens.');
    expect(result.out.too_many_calls).toContain('You have 3 calls waiting. Place a new one once one is decided.');
    for (const words of Object.values(result.out)) expect(words).not.toContain('Server words');
    expect(result.events).toEqual([]);
  });

  // Replaces the browser chaos journey of the old Exchange panel (check-online-market.js --chaos).
  it('says it did not hear back and sends the very same call again, with the same actionUid', async () => {
    const result = await run(async () => {
      const {fx, events, tick, text, press} = await window.harborKit();
      const {createMarketEntry} = await window.g20Import('/src/harbor/market-card.js');
      const adapter = fx.fakeCalls();
      const place = adapter.place.bind(adapter);
      let first = true;
      adapter.place = async (body, options) => { if (first) { first = false; adapter.requests.push(['place', body, options.uid]); return {ok: false, status: 0, code: 'outcome_unknown', message: ''}; } return place(body, options); };
      const market = createMarketEntry({adapter, now: () => fx.NOW, makeUid: (() => { let n = 0; return () => `uid-${++n}-abcdefgh`; })()});
      await market.open(); await tick();
      const ether = document.querySelector('[data-asset="tidewright-works"]');
      await press(ether, '[data-side="down"]'); await press(ether, '[data-stake="10"]'); await press(ether, '.harbor-confirm'); await tick();
      const unknown = text(), again = [...document.querySelectorAll('dialog[open] .harbor-status button')].map(button => button.textContent);
      document.querySelector('dialog[open] .harbor-status button').click(); await tick(60);
      const places = adapter.requests.filter(call => call[0] === 'place').map(call => [call[1], call[2]]);
      const after = document.querySelector('[data-asset="tidewright-works"]').textContent;
      market.dispose();
      return {unknown, again, places, after, events};
    });
    expect(result.unknown).toContain('We did not hear back.');
    expect(result.again).toEqual(['Send again']);
    expect(result.places).toHaveLength(2);
    expect(result.places[1]).toEqual(result.places[0]);
    expect(result.places[0]).toEqual([{asset: 'tidewright-works', direction: 'down', stake: 10}, 'uid-1-abcdefgh']);
    expect(result.after).toContain('Your 🪙 10 is on Down.');
    expect(result.after).toContain('You said Down with 🪙 10.Decided in 5 min');
    expect(result.events).toEqual([{kind: 'market', stake: 10}]);
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

describe('harbor overview and weather board', () => {
  it('lists the three stalls and the duel ring with one sentence each, and opens a stall (no fortune teller, D035)', async () => {
    const result = await run(async () => {
      const {fx, tick, text} = await window.harborKit();
      const {createHarbor} = await window.g20Import('/src/harbor/host.js');
      const opened = [], menus = [];
      let answer = fx.weatherAnswer('storm', {tonight: {date: '2026-11-11', startsAt: '2026-11-11T18:00:00Z',
        endsAt: '2026-11-12T06:00:00Z', isNow: false, state: 'fog', isFogNight: true, fogNightKind: 'real'}});
      const harbor = createHarbor({container: document.body, getWeather: () => answer, openStall: id => opened.push(id), menu: provider => { menus.push(provider); return () => {}; }});
      // The overview module loads on first use: wait for the card itself, not a fixed time (a busy
      // machine took longer than 80 ms, so the stalls were not there yet and the match button was null).
      menus[0]()[0].onSelect();
      for (let waited = 0; !document.querySelector('dialog[open] [data-stall]') && waited < 5000; waited += 20) await tick(20);
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
    expect(result.stalls.map(stall => stall.title)).toEqual(['Market stall', 'Match board', 'Weather board', 'Duel ring']);
    expect(result.stalls.at(-1).button).toBeNull();
    expect(result.opened).toEqual(['match']);
    expect(result.storm).toContain('Right now at Carcavelos, Portugal: Thunderstorm, windy');
    expect(result.storm).toContain('Storm: 50% more pirate ships');
    expect(result.storm).toContain('Open-Meteo');
    expect(result.offline).toContain('Calm: a quiet sea');
    // T46: tonight's forecast (words only, D045) and where a wave takes its weather from.
    expect(result.storm).toContain("Forecast for tonight here: fog. Only to read: no coins are at stake.");
    expect(result.storm).toContain('A wave uses the weather where its bell is rung');
    expect(result.offline).not.toContain('Forecast for tonight');
    expect(result.offline).toContain('A wave uses the weather where its bell is rung');
  });
});
