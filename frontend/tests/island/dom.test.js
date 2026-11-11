// The island's cards in real Chromium with the fake server: build card states, the bell countdown, the
// invite card with its QR, a visit by code, and the sea chart's three destinations.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('builds from the card, refuses with the reason, rings the bell and invites with a QR', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/island/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const seen = [];
    for (const type of ['island_built', 'island_invite_opened', 'wave_started_server']) on(type, event => seen.push(event.type));
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null});
    await island.load();
    const card = () => document.querySelector('.island-card[open]');
    const read = () => ({title: card()?.querySelector('.kit-heading').textContent, cost: card()?.querySelector('.island-cost')?.textContent,
      button: card()?.querySelector('.island-card-body .kit-button')?.textContent, disabled: card()?.querySelector('.island-card-body .kit-button')?.disabled,
      reason: card()?.querySelector('.island-reason')?.hidden ? '' : card()?.querySelector('.island-reason')?.textContent,
      purpose: card()?.querySelector('.island-purpose')?.textContent});
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    island.pick('cannon_1');
    const open = read();
    card().querySelector('.island-card-body .kit-button').click();
    await wait(30);
    const built = {closed: !card(), toast: island.ui.toastText, coins: island.island.coins};
    island.pick('cannon_1');
    const again = read();
    island.ui.close();
    transport.dev.setCoins(10); await island.load();
    island.pick('cannon_2');
    const short = read();
    island.ui.close();
    island.pick('island_bell');
    await wait(20);
    const bell = read();
    card().querySelector('.island-card-body .kit-button').click();
    await wait(30);
    const banner = document.querySelector('.island-banner .island-banner-text').textContent, closedAfterRing = !card();
    island.pick('island_cabin');
    const invite = {title: read().title, code: card().querySelector('.island-code').textContent,
      url: card().querySelector('.island-url').textContent, qr: card().querySelector('canvas.island-qr').width,
      images: card().querySelectorAll('img').length};
    island.ui.close();
    const label = {spot: island.label('cannon_3'), bell: island.label('island_bell'), cabin: island.label('island_cabin'), other: island.label('market_hall')};
    const room = island.presencePlace('home_islet');
    island.dispose();
    return {open, built, again, short, bell, banner, closedAfterRing, invite, label, room, seen};
  });
  expect(result.open).toMatchObject({title: 'Cannon', cost: '🪙 30', button: 'Build', disabled: false, reason: '', purpose: 'Fires at pirate ships on its own.'});
  expect(result.built).toEqual({closed: true, toast: 'Cannon built! You have 🪙 70.', coins: 70});
  expect(result.again).toMatchObject({title: 'Cannon', reason: 'Your cannon stands here.'});
  expect(result.short).toMatchObject({title: 'Cannon', button: 'Build', disabled: true, reason: 'You need 🪙 20 more.'});
  expect(result.bell).toMatchObject({title: 'Harbor bell', button: 'Ring the bell', disabled: false});
  expect(result.banner).toBe('Pirates in 10 s! Wave 1');
  expect(result.closedAfterRing).toBe(true);
  expect(result.invite).toMatchObject({title: 'Invite a friend', code: 'ISLE-K7Q2M', url: 'https://the-great-plot-twist.vercel.app/?visit=ISLE-K7Q2M', images: 0});
  expect(result.invite.qr).toBeGreaterThan(100);
  expect(result.label).toEqual({spot: 'Build a cannon · 🪙 30', bell: 'Ring the harbor bell', cabin: 'Invite a friend', other: undefined});
  expect(result.room).toBe('isle_k7q2m');
  expect(result.seen).toEqual(['island_built', 'wave_started_server', 'island_invite_opened']);
});

it('a server refusal shows its plain message on the card', async () => {
  const message = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const island = {current: null};
    const transport = {
      get: async () => ({ok: true, status: 200, data: {code: 'ISLE-K7Q2M', coins: 100, waveBest: 0, flags: 0,
        spots: [{id: 'wall_1', kind: 'wall', built: false, cost: 10}]}}),
      post: async () => ({ok: false, status: 409, data: {error: {code: 'spot_taken', message: 'Wall already stands on this spot.'}}}),
    };
    island.current = createIsland({container: document.body, emit, on, mode: 'live', transport, storage: null});
    await island.current.load();
    island.current.pick('wall_1');
    document.querySelector('.island-card[open] .island-card-body .kit-button').click();
    await new Promise(resolve => setTimeout(resolve, 30));
    const text = document.querySelector('.island-card[open] .island-message').textContent;
    island.current.dispose();
    return text;
  });
  expect(message).toBe('Wall already stands on this spot.');
});

it("visits a friend's island by code: their buildings, no building, the friend's room", async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/island/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null});
    island.visit('isle-fr3nd');
    await island.load();
    const visit = document.querySelector('.island-visit').textContent;
    island.pick('cannon_1');
    const card = document.querySelector('.island-card[open]');
    const built = {reason: card.querySelector('.island-reason').textContent, hidden: card.querySelector('.island-card-body .kit-button').hidden};
    island.ui.close();
    const room = island.presencePlace('home_islet'), cabin = island.label('island_cabin');
    island.pick('island_cabin');
    const noInvite = !document.querySelector('.island-card[open]');
    await island.sailHome();
    const home = {room: island.presencePlace('home_islet'), visitHidden: document.querySelector('.island-visit').hidden, code: island.island.code};
    island.dispose();
    return {visit, built, room, cabin, noInvite, home};
  });
  expect(result.visit).toContain("Visiting Captain Gull's island · ISLE-FR3ND");
  expect(result.built).toEqual({reason: 'Captain Gull built this cannon.', hidden: true});
  expect(result.room).toBe('isle_fr3nd');
  expect(result.noInvite).toBe(true);
  expect(result.home).toEqual({room: 'isle_k7q2m', visitHidden: true, code: 'ISLE-K7Q2M'});
});

it('the sea chart shows only Your island, The Harbor and Pirate Point', async () => {
  const result = await evaluate(async () => {
    const {createChart} = await window.g20Import('/src/ui/chart.js');
    const {CHART_NAMES} = await window.g20Import('/src/island/index.js');
    const world = {current: {id: 'home_islet'}, busy: false, canTravel: () => true};
    const chart = createChart(document.body, world, async () => {}, () => {},
      {visible: id => Object.hasOwn(CHART_NAMES, id), label: id => CHART_NAMES[id]});
    chart.show();
    const shown = [...document.querySelectorAll('.sea-chart [data-place]')].filter(button => !button.hidden).map(button => button.textContent.trim());
    const hidden = [...document.querySelectorAll('.sea-chart [data-place]')].filter(button => button.hidden).map(button => button.dataset.place);
    chart.dispose();
    const plain = createChart(document.body, world, async () => {}, () => {});
    plain.show();
    const all = [...document.querySelectorAll('.sea-chart [data-place]')].filter(button => !button.hidden).length;
    plain.dispose();
    return {shown, hidden, all};
  });
  expect(result.shown).toEqual(['Pirate Point', 'The Harbor', 'Your island']);
  expect(result.hidden.sort()).toEqual(['smugglers_cove', 'the_teeth', 'wreck_point']);
  expect(result.all).toBe(6);
});
