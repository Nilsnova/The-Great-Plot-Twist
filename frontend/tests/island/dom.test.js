// The island's cards in real Chromium with the fake server: build and upgrade card states (TOWER-DEFENSE.md
// §2, §9), crew and captain panels, Pirate Point builds, the bell countdown, Play with a friend with its QR, a visit by code, and the sea chart's three destinations.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('builds from the card: cannon or mortar, upgrade, max level, short of coins, bell, Play with a friend', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const seen = [];
    for (const type of ['island_built', 'island_upgraded', 'crew_hired', 'island_invite_opened', 'wave_started_server']) on(type, event => seen.push(event.type));
    const transport = createFakeIslandTransport();
    const coins = [], captain = [], menu = [];
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      onCoins: value => coins.push(value), onCaptain: level => captain.push(level), menu: provider => { menu.push(provider); return () => {}; }});
    await island.load();
    const card = () => document.querySelector('.island-card[open]');
    const body = () => card()?.querySelector('.island-card-body');
    const read = () => ({title: card()?.querySelector('.kit-heading').textContent,
      choices: [...(body()?.querySelectorAll('.island-choice') ?? [])].map(item => `${item.dataset.kind}:${item.disabled}`),
      button: body()?.querySelector(':scope > .kit-button:not(.kit-quiet):not(.island-hire)')?.textContent ?? '',
      disabled: body()?.querySelector(':scope > .kit-button:not(.kit-quiet):not(.island-hire)')?.disabled ?? null,
      next: body()?.querySelector('.island-next-label')?.textContent ?? '', stats: body()?.querySelector('.island-next-stats')?.textContent ?? '',
      pips: body()?.querySelector('.island-pips')?.getAttribute('aria-label') ?? '',
      reason: body()?.querySelector('.island-reason')?.hidden ? '' : body()?.querySelector('.island-reason')?.textContent,
      soon: body()?.querySelector('.island-soon')?.hidden ? '' : body()?.querySelector('.island-soon')?.textContent,
      hire: !!body()?.querySelector('.island-hire')});
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    // A new player: the tower spot offers the cannon only; the mortar is "coming soon".
    island.pick('cannon_1');
    const fresh = read();
    body().querySelector('.island-choice[data-kind="cannon"]').click();
    await wait(30);
    const built = {closed: !card(), toast: island.ui.toastText, coins: island.island.coins, reported: [...coins]};
    island.pick('cannon_1');
    const lockedUpgrade = read();
    island.ui.close();
    // After wave 3: the mortar and level 2 are open.
    transport.dev.setWaveBest(3); transport.dev.setCoins(200); await island.load();
    island.pick('cannon_1');
    const upgrade = read();
    body().querySelector('[data-focus="upgrade"]').click();
    await wait(30);
    const upgraded = {...read(), toast: island.ui.toastText};
    island.ui.close();
    island.pick('tower_s5');
    const choice = read();
    body().querySelector('.island-choice[data-kind="mortar"]').click();
    await wait(30);
    const mortar = island.island.spots.find(spot => spot.id === 'tower_s5');
    transport.dev.setWaveBest(5); transport.dev.setCoins(1000); await island.load();
    island.pick('cannon_1'); body().querySelector('[data-focus="upgrade"]').click(); await wait(30);
    island.pick('cannon_1');
    const max = read();
    island.ui.close();
    transport.dev.setCoins(10); await island.load();
    island.pick('cannon_2');
    const short = read();
    island.pick('tower_s5');
    const shortUpgrade = read();
    island.ui.close();
    island.pick('island_bell');
    await wait(20);
    const bell = read();
    body().querySelector('.kit-button').click();
    await wait(30);
    const banner = document.querySelector('.island-banner .island-banner-text').textContent, closedAfterRing = !card();
    island.openInvite();
    const invite = {title: read().title, lead: card().querySelector('.island-lead').textContent, link: card().querySelector('.island-link').value,
      copy: card().querySelector('[data-focus="copy"]').textContent, line: [...card().querySelectorAll('.island-purpose')].map(item => item.textContent).join(),
      qr: card().querySelector('canvas.island-qr').width, images: card().querySelectorAll('img').length};
    island.ui.close();
    const label = {spot: island.label('cannon_3'), built: island.label('cannon_1'), wall: island.label('wall_1'), bell: island.label('island_bell'),
      cabin: island.label('island_cabin'), other: island.label('market_hall')};
    const room = island.presencePlace('home_islet');
    const entries = menu[0]().map(entry => entry.label);
    island.dispose();
    return {fresh, built, lockedUpgrade, upgrade, upgraded, choice, mortar, max, short, shortUpgrade, bell, banner, closedAfterRing, invite, label, room, seen, captain, entries};
  });
  expect(result.fresh).toMatchObject({title: 'Tower spot', choices: ['cannon:false'], soon: 'Coming soon: Mortar · after wave 3', button: ''});
  // The HUD hears the island's balance: 100 from GET /api/island, then 70 after the cannon.
  expect(result.built).toEqual({closed: true, toast: 'Cannon built! You have 🪙 70.', coins: 70, reported: [100, 70]});
  expect(result.lockedUpgrade).toMatchObject({title: 'Cannon', pips: 'Level 1 of 3', button: '', soon: 'Coming soon: Level 2 · after wave 2', hire: true});
  expect(result.upgrade).toMatchObject({title: 'Cannon', next: 'Level 2 · 🪙 60', stats: 'Damage 10 → 16 · Range 28 → 31', button: 'Upgrade', disabled: false, reason: ''});
  expect(result.upgraded).toMatchObject({pips: 'Level 2 of 3', toast: 'Cannon is now level 2! You have 🪙 140.', soon: 'Coming soon: Level 3 · after wave 5'});
  expect(result.choice).toMatchObject({title: 'Tower spot', choices: ['cannon:false', 'mortar:false'], soon: ''});
  expect(result.mortar).toMatchObject({kind: 'mortar', level: 1, built: true});
  expect(result.max).toMatchObject({pips: 'Level 3 of 3', button: '', reason: 'Highest level reached.'});
  expect(result.short).toMatchObject({choices: ['cannon:true', 'mortar:true']});
  expect(result.shortUpgrade).toMatchObject({title: 'Mortar', next: 'Level 2 · 🪙 120', disabled: true, reason: 'Not enough 🪙: you need 🪙 110 more.'});
  expect(result.bell).toMatchObject({title: 'Harbor bell', button: 'Ring the bell', disabled: false});
  expect(result.banner).toBe('Pirates in 10 s! Wave 6');
  expect(result.closedAfterRing).toBe(true);
  expect(result.invite).toMatchObject({title: 'Play with a friend', lead: 'Send this link to up to 3 friends', copy: 'Copy link',
    link: 'https://the-great-plot-twist.vercel.app/?visit=ISLE-K7Q2M', images: 0});
  expect(result.invite.line).toContain('They tap Join, and you defend your island together.');
  expect(result.invite.qr).toBeGreaterThan(100);
  expect(result.label).toEqual({spot: 'Build a tower', built: 'Cannon · level 3', wall: 'Build a wall · 🪙 10', bell: 'Ring the harbor bell', cabin: 'Play with a friend', other: undefined});
  expect(result.room).toBe('isle_k7q2m');
  expect(result.seen).toEqual(['island_built', 'island_upgraded', 'island_built', 'island_upgraded', 'wave_started_server', 'island_invite_opened']);
  expect(result.captain[0]).toBe(1);
  expect(result.entries).toEqual(['Play with a friend', 'Crew', 'Captain']);
});

it('the crew and captain panels: locked, hire, full, short of coins; a friend arriving gets a toast', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const hired = [];
    on('crew_hired', event => hired.push(event.crew));
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
    await island.load();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const card = () => document.querySelector('.island-card[open]');
    const rows = () => [...card().querySelectorAll('.island-crew-row')].map(row => ({id: row.dataset.crew,
      owned: row.querySelector('.island-crew-owned').textContent, button: row.querySelector('.kit-button').textContent,
      disabled: row.querySelector('.kit-button').disabled, reason: row.querySelector('.island-crew-reason')?.textContent ?? ''}));
    island.openCrew();
    const locked = {lead: card().querySelector('.island-purpose').textContent, rows: rows(), soon: card().querySelector('.island-soon').textContent};
    transport.dev.setWaveBest(5); transport.dev.setCoins(100); await island.load();
    island.openCrew();
    const open = rows();
    card().querySelector('[data-crew="gunner"] .kit-button').click(); await wait(30);
    card().querySelector('[data-crew="gunner"] .kit-button').click(); await wait(30);
    const full = rows();
    const toast = island.ui.toastText;
    island.openCaptain();
    const captain = {stats: card().querySelector('.island-stats').textContent, hint: card().querySelector('.island-hint').textContent,
      next: card().querySelector('.island-next-label').textContent, disabled: card().querySelector('[data-focus="upgrade"]').disabled,
      reason: card().querySelector('.island-reason').hidden ? '' : card().querySelector('.island-reason').textContent};
    island.ui.close();
    island.setPresence({status: 'live', place: 'isle_k7q2m', others: []});
    island.setPresence({status: 'live', place: 'isle_k7q2m', others: [{id: 'p1', name: 'Captain Brine'}]});
    const arrived = island.ui.toastText;
    island.openCaptains();
    const tags = [...card().querySelectorAll('.island-tag')].map(item => item.textContent);
    island.dispose();
    return {locked, open, full, toast, captain, arrived, tags, hired};
  });
  expect(result.locked.lead).toBe('Crew members join after you win wave 5.');
  expect(result.locked.rows).toEqual([]);
  expect(result.locked.soon).toBe('Coming soon: Gunner · after wave 5, Carpenter · after wave 5, Lookout · after wave 8');
  expect(result.open.map(row => `${row.id}:${row.owned}:${row.button}:${row.disabled}`)).toEqual(['gunner:0 of 2:Hire · 🪙 40:false', 'carpenter:0 of 2:Hire · 🪙 30:false']);
  expect(result.full[0]).toMatchObject({id: 'gunner', owned: '2 of 2', button: 'Full', disabled: true, reason: 'You have 2, the most you can hire.'});
  expect(result.full[1]).toMatchObject({id: 'carpenter', disabled: true, reason: 'Not enough 🪙: you need 🪙 10 more.'});
  expect(result.toast).toBe('Gunner hired! You have 🪙 20.');
  expect(result.captain).toEqual({stats: 'Musket · Damage 6 · Range 14', hint: 'Tap a ship to fire your musket (F).', next: 'Level 2 · 🪙 20', disabled: false, reason: ''});
  expect(result.arrived).toBe('Captain Brine joined your island');
  expect(result.tags).toEqual(['Captain Brine']);
  expect(result.hired).toEqual(['gunner', 'gunner']);
});

it('Pirate Point: the same build and upgrade card, paid by you, belongs to Pirate Point', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
    await island.loadPoint();
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const card = () => document.querySelector('.island-card[open]');
    island.pick('pp_tower_2');
    const choose = {title: card().querySelector('.kit-heading').textContent, owner: card().querySelector('.island-owner').textContent,
      choices: [...card().querySelectorAll('.island-choice')].map(item => item.dataset.kind)};
    card().querySelector('.island-choice[data-kind="mortar"]').click(); await wait(30);
    const toast = island.ui.toastText, coins = island.island.coins;
    island.pick('pp_tower_2');
    const upgrade = {next: card().querySelector('.island-next-label').textContent, hire: !!card().querySelector('.island-hire')};
    const spot = island.point.spots.find(item => item.id === 'pp_tower_2');
    island.dispose();
    return {choose, toast, coins, upgrade, spot};
  });
  expect(result.choose).toEqual({title: 'Tower spot', owner: 'Paid by you · belongs to Pirate Point', choices: ['cannon', 'mortar']});
  expect(result.toast).toBe('Mortar built for Pirate Point! You have 🪙 40.');
  expect(result.coins).toBe(40);
  expect(result.upgrade).toEqual({next: 'Level 2 · 🪙 120', hire: false});
  expect(result.spot).toMatchObject({kind: 'mortar', level: 1, built: true});
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
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null});
    island.visit('isle-fr3nd');
    await island.load();
    const visit = document.querySelector('.island-visit').textContent;
    island.pick('cannon_1');
    const card = document.querySelector('.island-card[open]');
    const built = {reason: card.querySelector('.island-reason').textContent, buttons: card.querySelectorAll('.island-card-body .kit-button, .island-choice').length};
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
  expect(result.built).toEqual({reason: 'Captain Gull built this cannon.', buttons: 0});
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
