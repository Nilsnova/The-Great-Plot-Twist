// D054, Start fresh in real Chromium with the fake server: the Settings › Account button (shell/account-extras.js),
// its type-to-confirm dialog, a refusal that keeps the dialog, and a reset that gives a fresh island, closes the
// menu and shows a toast. A guest and a signed-out player see no button.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('the dialog: a big warning, one line, Start fresh only after typing RESET; Keep my island closes it', async () => {
  const result = await evaluate(async () => {
    const {createIslandReset} = await window.g20Import('/src/island/island-reset.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const calls = [];
    const fresh = createIslandReset({reset: async () => { calls.push('reset'); return {ok: false, message: 'A wave is under way. Start fresh between waves.'}; }});
    document.body.append(fresh.element);
    const button = {text: fresh.element.textContent, red: getComputedStyle(fresh.element).backgroundColor};
    fresh.element.click(); await wait(20);
    const dialog = document.querySelector('.island-reset-modal[open]');
    const go = () => dialog.querySelector('.island-reset-go'), input = dialog.querySelector('.island-reset-input');
    const shown = {title: dialog.querySelector('.kit-heading').textContent, warning: dialog.querySelector('.island-reset-warning').textContent,
      line: dialog.querySelector('.island-reset-line').textContent, focused: document.activeElement === input, disabled: go().disabled};
    input.value = 'RES'; input.dispatchEvent(new Event('input'));
    const partly = go().disabled;
    input.value = 'reset'; input.dispatchEvent(new Event('input'));
    const typed = go().disabled;
    go().click(); await wait(20);
    const refused = {open: dialog.open, error: dialog.querySelector('.island-reset-error').textContent,
      visible: !dialog.querySelector('.island-reset-error').hidden, again: go().disabled};
    dialog.querySelector('.island-reset-keep').click(); await wait(20);
    const closed = !document.querySelector('.island-reset-modal[open]');
    fresh.dispose();
    return {button, shown, partly, typed, calls, refused, closed};
  });
  expect(result.button.text).toBe('⚠Start fresh');
  expect(result.button.red).toBe('rgb(184, 60, 38)');
  expect(result.shown).toEqual({title: 'Start fresh?', warning: '⚠', line: 'Your island, coins and progress go back to the start.',
    focused: true, disabled: true});
  expect([result.partly, result.typed]).toEqual([true, false]);
  expect(result.calls).toEqual(['reset']);
  expect(result.refused).toEqual({open: true, error: 'A wave is under way. Start fresh between waves.', visible: true, again: false});
  expect(result.closed).toBe(true);
});

it('Settings › Account offers Start fresh with your island; a reset gives a fresh island, the game and a toast', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {accountExtras} = await window.g20Import('/src/shell/account-extras.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const transport = createFakeIslandTransport({coins: 1000});
    const coins = [];
    const live = createIsland({container: document.body, emit, on, mode: 'live', transport, storage: null, menu: () => () => {},
      onCoins: value => coins.push(value)});
    const signedIn = {account: {state: 'signed_in', guest: false}};
    const before = accountExtras({view: signedIn}).length; // nothing before the island is loaded
    await live.load();
    const offered = {
      signedIn: accountExtras({view: signedIn}).length,
      guest: accountExtras({view: {account: {state: 'signed_in', guest: true}}}).length,
      signedOut: accountExtras({view: {account: {state: 'signed_out'}}}).length,
    };
    live.dispose();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {},
      onCoins: value => coins.push(value)});
    await island.load();
    await transport.post('/api/island/build', {spot: 'wall_1', kind: 'wall', actionUid: 'build-0001'});
    await island.load();
    const built = island.island.spots.filter(spot => spot.built).length;
    let played = 0;
    const [button] = accountExtras({view: {}, play: () => { played++; }});
    const section = document.createElement('section'); section.append(button); document.body.append(section);
    button.click(); await wait(20);
    const dialog = document.querySelector('.island-reset-modal[open]'), input = dialog.querySelector('.island-reset-input');
    input.value = 'RESET'; input.dispatchEvent(new Event('input'));
    dialog.querySelector('.island-reset-go').click(); await wait(60);
    const own = island.island;
    const after = {open: !!document.querySelector('.island-reset-modal[open]'), built: own.spots.filter(spot => spot.built).length,
      coins: own.coins, waveBest: own.waveBest, played, toast: island.ui.toastText, hud: coins.at(-1)};
    island.dispose();
    return {before, offered, built, after};
  });
  expect(result.before).toBe(0);
  expect(result.offered).toEqual({signedIn: 1, guest: 0, signedOut: 0});
  expect(result.built).toBe(1);
  expect(result.after).toEqual({open: false, built: 0, coins: 100, waveBest: 0, played: 1, toast: 'Fresh start! Your island is new again.', hud: 100});
});
