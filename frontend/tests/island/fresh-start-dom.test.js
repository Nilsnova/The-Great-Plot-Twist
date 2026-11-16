// Reset my island (T53) in real Chromium with the fake server: the Settings section the island offers
// (shell/settings-extras.js), the red button off until the island code is typed, Enter resets, the island
// read again, the events for the narrator and the guided start, and the line a member of a friend's game sees.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('Reset my island: explain, type the code, the red button, Enter resets, the island starts again', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const events = [];
    for (const type of ['island_reset', 'game_started', 'island_spots_changed']) on(type, event => events.push({type, ...event}));
    let provider = null;
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {},
      settings: given => { provider = given; return () => { provider = null; }; }});
    await island.load();
    transport.dev.setWaveBest(3); transport.dev.setCoins(800); await island.load();
    await island.build('cannon_1', 'cannon');
    const code = island.island.code;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const section = provider();
    document.body.append(section);
    const input = section.querySelector('input'), button = section.querySelector('button');
    const label = section.querySelector(`label[for="${input.id}"]`);
    const described = input.getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id)?.textContent ?? '');
    const empty = {title: section.querySelector('h3').textContent, labelled: section.getAttribute('aria-labelledby') === section.querySelector('h3').id,
      label: label?.textContent ?? '', described, disabled: button.disabled, red: getComputedStyle(button).backgroundColor, text: button.textContent};
    input.focus(); input.value = 'ISLE-ZZZZZ'; input.dispatchEvent(new Event('input'));
    const wrong = {disabled: button.disabled, invalid: input.getAttribute('aria-invalid')};
    input.value = code.toLowerCase(); input.dispatchEvent(new Event('input'));
    const typed = {disabled: button.disabled, invalid: input.getAttribute('aria-invalid')};
    // Enter in the field submits the form (the button is the form's submit button).
    section.querySelector('form').requestSubmit();
    for (let i = 0; i < 50 && section.dataset.state !== 'done'; i++) await wait(20);
    const done = {state: section.dataset.state, status: section.querySelector('[role=status]').textContent, value: input.value,
      focus: document.activeElement === input, disabled: button.disabled};
    const after = {coins: island.island.coins, waveBest: island.island.waveBest, built: island.island.spots.filter(spot => spot.built).length,
      toast: island.ui.toastText, events: events.map(event => ({type: event.type, code: event.code ?? null, first: event.first, spot: event.spot}))};
    section.remove();
    // A member of a friend's game: only its host may reset it.
    island.visit('ISLE-FR3ND'); await island.load();
    const member = provider();
    const memberView = {state: member.dataset.state, text: member.textContent, button: !!member.querySelector('button')};
    island.dispose();
    return {code, empty, wrong, typed, done, after, memberView, gone: provider === null};
  });
  expect(result.empty).toMatchObject({title: 'Reset my island', labelled: true, disabled: true, text: 'Reset my island'});
  expect(result.empty.label).toContain('Your island code');
  expect(result.empty.described.join(' ')).toContain('Your friends stay in your game. This cannot be undone.');
  expect(result.empty.described.join(' ')).toContain(`Type ${result.code} to confirm.`);
  expect(result.empty.red).toBe('rgb(184, 57, 42)');
  expect(result.wrong).toEqual({disabled: true, invalid: 'true'});
  expect(result.typed).toEqual({disabled: false, invalid: 'false'});
  expect(result.done).toMatchObject({state: 'done', value: '', focus: true, disabled: true});
  expect(result.done.status).toContain('Your island starts fresh');
  expect(result.after).toMatchObject({coins: 100, waveBest: 0, built: 0});
  expect(result.after.toast).toContain('Your island starts fresh');
  expect(result.after.events).toEqual(expect.arrayContaining([
    {type: 'island_spots_changed', code: null, first: undefined, spot: 'cabin'},
    {type: 'island_reset', code: result.code, first: undefined, spot: undefined},
    {type: 'game_started', code: result.code, first: true, spot: undefined},
  ]));
  const order = result.after.events.map(event => event.type).filter(type => type !== 'island_spots_changed');
  expect(order.slice(-2)).toEqual(['island_reset', 'game_started']);
  expect(result.memberView).toEqual({state: 'member', text: "Reset my islandOnly the host can reset this game's island.", button: false});
  expect(result.gone).toBe(true);
});
