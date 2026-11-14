// The arsenal building in real Chromium with the fake server (T41, D042): walking up and pressing E (the
// `interact` event) opens its card; buy, return, take and swap; the weapon the wave uses follows the copy you
// carry; the Captain card loses its Weapons tab. With the flag off nothing of it exists and the old shop stays.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('the arsenal card: buy into your hands, return, take, swap, and the wave loadout follows', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const changed = [];
    on('island_spots_changed', event => changed.push(event.spot));
    const transport = createFakeIslandTransport({coins: 1000});
    transport.dev.setWaveBest(6);
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {},
      arsenalOn: () => true});
    await island.load();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const card = () => document.querySelector('.island-card[open]');
    const label = island.label('island_arsenal');
    emit({type: 'interact', place: 'home_islet', id: 'island_arsenal'}); await wait(40);
    const title = card().querySelector('.kit-heading').textContent, docked = card().classList.contains('island-card-docked');
    const empty = {stock: card().querySelector('.island-arsenal-rack h3').textContent, carry: card().querySelector('.island-arsenal-name').textContent};
    card().querySelector('[data-focus="buy-pistols"]').click(); await wait(40);
    const bought = {toast: island.ui.toastText, weapon: island.captainLoadout().weapon, carry: card().querySelector('.island-arsenal-name').textContent};
    card().querySelector('[data-focus="buy-long_rifle"]').click(); await wait(40);
    const stored = {toast: island.ui.toastText, stock: card().querySelector('.island-arsenal-rack h3').textContent,
      button: card().querySelector('.island-arsenal-copy[data-weapon="long_rifle"] .kit-button').textContent};
    card().querySelector('.island-arsenal-copy[data-weapon="long_rifle"] .kit-button').click(); await wait(40);
    const swapped = {toast: island.ui.toastText, weapon: island.captainLoadout().weapon};
    card().querySelector('[data-focus="arsenal-return"]').click(); await wait(40);
    const back = {toast: island.ui.toastText, weapon: island.captainLoadout().weapon, stock: card().querySelector('.island-arsenal-rack h3').textContent};
    island.ui.close();
    island.openCaptain();
    const tabs = [...card().querySelectorAll('.kit-tab')].map(item => item.textContent);
    island.dispose();
    return {label, title, docked, empty, bought, stored, swapped, back, tabs, changed};
  });
  expect(result.label).toBe('Open the arsenal');
  expect(result.title).toBe('Arsenal');
  expect(result.docked).toBe(true);
  expect(result.empty).toEqual({stock: 'Stored: 0 of 20', carry: 'Musket (standard issue)'});
  expect(result.bought).toEqual({toast: 'Pistols #1 bought: you carry it now.', weapon: 'pistols', carry: 'Pistols #1'});
  expect(result.stored).toEqual({toast: 'Long rifle #2 bought and stored on the rack.', stock: 'Stored: 1 of 20', button: 'Swap'});
  expect(result.swapped).toEqual({toast: 'Swapped: you carry Long rifle #2 now.', weapon: 'long_rifle'});
  expect(result.back).toEqual({toast: 'Long rifle #2 is back on the rack. You carry the musket.', weapon: 'musket', stock: 'Stored: 2 of 20'});
  expect(result.tabs).toEqual(['Captain', 'Skills (3)']); // no Weapons tab: weapons live in the arsenal
  expect(result.changed).toEqual(['island_arsenal', 'island_arsenal', 'island_arsenal', 'island_arsenal']);
});

it('with the flag off there is no arsenal: E does nothing there and the old weapon shop stays', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport: createFakeIslandTransport(), storage: null, menu: () => () => {}});
    await island.load();
    emit({type: 'interact', place: 'home_islet', id: 'island_arsenal'});
    await new Promise(resolve => setTimeout(resolve, 40));
    const opened = !!document.querySelector('.island-card[open]');
    island.openCaptain();
    const tabs = [...document.querySelectorAll('.island-card[open] .kit-tab')].map(item => item.textContent);
    const weapon = island.captainLoadout().weapon;
    island.dispose();
    return {opened, tabs, weapon};
  });
  expect(result).toEqual({opened: false, tabs: ['Captain', 'Skills', 'Weapons'], weapon: 'musket'});
});

it('draws nothing of the arsenal while the flag is off, and paints it once when it turns on', async () => {
  const result = await evaluate(async () => {
    const THREE = await window.g20Import('/node_modules/three/build/three.module.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    let flag = false;
    const island = createIsland({container: document.body, mode: 'fake', transport: createFakeIslandTransport(), on, emit, storage: null,
      menu: () => () => {}, arsenalOn: () => flag});
    const cleanups = [], place = {group: new THREE.Group(), colliders: [], zones: [], update() {}};
    await island.load(); island.decorate(place, {}, cleanups);
    const count = () => { let n = 0; place.group.traverse(item => { if (item.name === 'island-arsenal') n++; }); return n; };
    const zone = () => place.zones.some(item => item.id === 'island_arsenal');
    try {
      await island.refreshDefended();
      const off = {meshes: count(), zone: zone()};
      flag = true; await island.refreshDefended();
      const first = {meshes: count(), zone: zone(), visible: place.group.getObjectByName('island-arsenal').visible};
      await island.refreshDefended(); await island.refreshDefended();
      const again = count();
      flag = false; await island.refreshDefended();
      const hidden = {meshes: count(), zone: zone(), visible: place.group.getObjectByName('island-arsenal').visible};
      return {off, first, again, hidden};
    } finally { cleanups.forEach(stop => stop()); island.dispose(); }
  });
  expect(result).toEqual({off: {meshes: 0, zone: false}, first: {meshes: 1, zone: true, visible: true}, again: 1,
    hidden: {meshes: 1, zone: false, visible: false}});
});
