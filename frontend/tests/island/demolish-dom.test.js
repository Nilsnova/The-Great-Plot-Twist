// Tearing a building down (GAME-V3.md §4.2) in real Chromium with the fake server: the secondary Tear down
// button on the building card (never the focus it opens with, off while a wave runs), the confirmation with
// the server's quote (Keep it takes the focus, Escape keeps the building) and the empty spot after.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('Tear down: secondary, never the first focus, a confirmation with the refunds, Keep it, then the empty spot', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const changed = [];
    on('island_spots_changed', event => changed.push(event));
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
    await island.load();
    transport.dev.setWaveBest(3); transport.dev.setCoins(500); await island.load();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const card = () => document.querySelector('.island-card[open]');
    const focus = () => document.activeElement?.dataset?.focus ?? document.activeElement?.className ?? '';
    island.pick('cannon_1'); card().querySelector('.island-choice[data-kind="cannon"]').click(); await wait(30);
    island.pick('cannon_1'); card().querySelector('[data-focus="upgrade"]').click(); await wait(30);
    island.pick('cannon_1');
    const tear = card().querySelector('.island-teardown');
    const button = {text: tear.textContent, quiet: tear.classList.contains('kit-quiet'), disabled: tear.disabled, focus: focus(), type: tear.type};
    // While a wave runs on screen it is off and says why.
    island.setBattle(true);
    const off = card().querySelector('.island-teardown');
    const battle = {disabled: off.disabled, why: document.getElementById(off.getAttribute('aria-describedby'))?.textContent ?? ''};
    island.setBattle(false);
    card().querySelector('.island-teardown').click();
    await wait(60);
    const confirm = {kind: island.ui.open, title: card().querySelector('.kit-heading').textContent,
      question: card().querySelector('.island-demolish-question').textContent,
      lines: [...card().querySelectorAll('.island-refund')].map(item => item.textContent), focus: focus(),
      list: card().querySelector('.island-refunds').getAttribute('aria-label'),
      go: card().querySelector('[data-focus="confirm"]').textContent, goDisabled: card().querySelector('[data-focus="confirm"]').disabled};
    // Keep it: back to the building's card, nothing changed.
    card().querySelector('[data-focus="keep"]').click(); await wait(30);
    const kept = {kind: island.ui.open, built: island.island.spots.find(spot => spot.id === 'cannon_1').built};
    // Escape (the dialog's cancel) on the confirmation keeps the building too.
    card().querySelector('.island-teardown').click(); await wait(60);
    card().dispatchEvent(new Event('cancel', {cancelable: true}));
    await wait(30);
    const escaped = {open: island.ui.open, built: island.island.spots.find(spot => spot.id === 'cannon_1').built};
    island.ui.close();
    island.pick('cannon_1'); card().querySelector('.island-teardown').click(); await wait(60);
    card().querySelector('[data-focus="confirm"]').click(); await wait(60);
    const after = {open: island.ui.open, toast: island.ui.toastText, coins: island.island.coins,
      spot: island.island.spots.find(spot => spot.id === 'cannon_1'), changed: changed.map(event => ({spot: event.spot, demolished: event.demolished}))};
    island.pick('cannon_1');
    const empty = {title: card().querySelector('.kit-heading').textContent, choices: [...card().querySelectorAll('.island-choice')].map(item => item.dataset.kind),
      tear: !!card().querySelector('.island-teardown')};
    island.ui.close();
    island.dispose();
    return {button, battle, confirm, kept, escaped, after, empty};
  });
  expect(result.button).toMatchObject({text: 'Tear down', quiet: true, disabled: false, type: 'button'});
  expect(result.button.focus).not.toBe('demolish');
  expect(result.battle).toEqual({disabled: true, why: 'You can tear it down between waves.'});
  // Built for 🪙 30 and raised for 🪙 60, all paid by this captain: 🪙 45 back.
  expect(result.confirm).toMatchObject({kind: 'demolish', title: 'Tear down this Cannon?', question: 'Tear down this Cannon (level 2)?',
    lines: ['You get back 🪙 45.'], focus: 'keep', list: 'Coins back', go: 'Tear down', goDisabled: false});
  expect(result.kept).toEqual({kind: 'build', built: true});
  expect(result.escaped).toMatchObject({built: true});
  expect(result.escaped.open).not.toBe('demolish');
  expect(result.after.open).toBe(null);
  expect(result.after.toast).toBe('Cannon torn down. You got back 🪙 45. You have 🪙 455.');
  expect(result.after.spot).toMatchObject({built: false});
  expect(result.after.changed.at(-1)).toMatchObject({spot: 'cannon_1', demolished: {kind: 'cannon', level: 2}});
  expect(result.empty).toMatchObject({title: 'Tower spot', choices: ['cannon', 'mortar'], tear: false});
});
