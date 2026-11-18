// Saved personal wins and fresh wallet recovery reach the actual HUD without ending the current battle.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('retains saved wins for later win goals while preserving the ordinary goal order', async () => {
  const result = await evaluate(async () => {
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const key = 'plot_twist_first_quests_v1', values = new Map(), finishes = [];
    const storage = {getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value)};
    const hud = createHud(document.body, {hasIsland: () => true, travel: () => false}, {storage, toast: () => {}});
    const stop = on('wave_finished', event => finishes.push(event));
    const done = () => JSON.parse(values.get(key) ?? '{"done":0}').done;
    try {
      emit({type: 'wave_rewards_recovered', wonWaveBest: 5, recovered: []}); const before = done();
      emit({type: 'island_built', kind: 'cannon'}); const cannon = done();
      emit({type: 'island_built', kind: 'wall'}); const wall = done();
      emit({type: 'island_invite_opened'});
      emit({type: 'island_upgraded', kind: 'cannon'});
      emit({type: 'island_built', kind: 'mortar'}); const mortar = done();
      emit({type: 'crew_hired', crew: 'gunner'}); const gunner = done();
      emit({type: 'wave_rewards_recovered', wonWaveBest: 10, recovered: []});
      return {before, cannon, wall, mortar, gunner, final: done(), finishes};
    } finally { stop(); hud.dispose(); }
  });
  expect(result).toEqual({before: 0, cannon: 2, wall: 4, mortar: 8, gunner: 9, final: 10, finishes: []});
});

it('clears retained wins when the private account changes', async () => {
  const result = await evaluate(async () => {
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {emit} = await window.g20Import('/src/core/events.js');
    const values = new Map(), storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
    const hud = createHud(document.body, {hasIsland: () => true, travel: () => false}, {storage, toast: () => {}});
    try {
      emit({type: 'wave_rewards_recovered', wonWaveBest: 5, recovered: []}); hud.resetRecoveredWins();
      emit({type: 'island_built', kind: 'cannon'});
      return JSON.parse(values.get('plot_twist_first_quests_v1')).done;
    } finally { hud.dispose(); }
  });
  expect(result).toBe(1);
});

it.each([false, true])('a pending island read cannot replace the reconciled wallet balance (first load=%s)', async firstLoad => {
  const result = await evaluate(async firstLoad => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport,
      storage: null, visitStorage: null, menu: () => () => {}, settings: () => () => {}});
    try {
      const answer = await island.api.getIsland();
      if (!firstLoad) await island.load();
      let resolveRead, asked;
      const reading = new Promise(resolve => { asked = resolve; });
      island.api.getIsland = () => { asked(); return new Promise(resolve => { resolveRead = resolve; }); };
      const pending = island.load(); await reading;
      transport.dev.setCoins(120); island.setWalletCoins(120);
      resolveRead({...answer, data: {...answer.data, coins: 100}}); await pending;
      return island.island?.coins;
    } finally { island.dispose(); }
  }, firstLoad);
  expect(result).toBe(120);
});

it('a first island read started after wallet recovery keeps its newer balance', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport,
      storage: null, visitStorage: null, menu: () => () => {}, settings: () => () => {}});
    try {
      const answer = await island.api.getIsland(); island.setWalletCoins(120);
      transport.dev.setCoins(80); island.api.getIsland = async () => ({...answer, data: {...answer.data, coins: 80}});
      await island.load(); return island.island.coins;
    } finally { island.dispose(); }
  });
  expect(result).toBe(80);
});

it('keeps the fresh balance before the lazy island exists and accepts a later authoritative island read', async () => {
  const result = await evaluate(async () => {
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const hud = createHud(document.body, {hasIsland: () => true, travel: () => false}, {storage: null, toast: () => {}});
    hud.setCoins(120); const before = hud.coins;
    const transport = createFakeIslandTransport(); transport.dev.setCoins(120);
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport,
      storage: null, visitStorage: null, menu: () => () => {}, settings: () => () => {},
      onCoins(value) { hud.setCoinSource('island'); hud.setCoins(value); }});
    try {
      await island.load(); const loaded = hud.coins;
      transport.dev.setCoins(80); await island.load();
      return {before, loaded, later: hud.coins};
    } finally { island.dispose(); hud.dispose(); }
  });
  expect(result).toEqual({before: 120, loaded: 120, later: 80});
});

it.each([false, true])('updates the island-source HUD from fresh ME without changing active battle or narrating (empty=%s)', async empty => {
  const result = await evaluate(async empty => {
    const {createHud} = await window.g20Import('/src/ui/hud.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {createWaveRewardRecovery} = await window.g20Import('/src/online/wave-reward-recovery.js');
    const {createSession} = await window.g20Import('/src/online/session.js');
    const {registerPanelServices} = await window.g20Import('/src/online/panel-services.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const values = new Map([['plot_twist_first_quests_v1', '{"version":1,"done":1}']]);
    const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
    const hud = createHud(document.body, {hasIsland: () => true, travel: () => false}, {storage, toast: () => {}});
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport: createFakeIslandTransport(),
      storage: null, visitStorage: null, menu: () => () => {}, settings: () => () => {},
      onCoins(value) { hud.setCoinSource('island'); hud.setCoins(value); }});
    let recovery, lease;
    const events = [], stops = [];
    try {
      await island.load(); await island.build('cannon_1', 'cannon');
      island.api.startWave = async () => ({ok: true, data: {waveId: 'current-wave', wave: 6, seed: 77,
        startsAt: new Date().toISOString(), weather: {kind: 'calm'}, flagship: false}});
      await island.ringBell(); island.setBattle(true); island.pick('cannon_1');
      for (const type of ['wave_finished', 'wave_controller_stopped', 'wave_started_server']) stops.push(on(type, event => events.push(event)));
      const session = createSession(); session.setToken('fixture-token');
      lease = registerPanelServices(session, {isReady: () => true, getFlags: () => ({islands: false}),
        api: {post: async () => ({ok: true, data: {coins: 999, wonWaveBest: 5, hasMore: false,
          recovered: empty ? [] : [{waveId: '12345678-1234-4234-8234-123456789abc', wave: 5, survived: true, loot: 20}]}})},
        getWallet: async () => ({coins: 120, current: () => true})});
      let done;
      const applied = new Promise(resolve => { done = resolve; });
      recovery = createWaveRewardRecovery({session, emit, onReset: () => hud.resetRecoveredWins(),
        onWallet(value) { island.setWalletCoins(value); done(); }});
      await applied;
      return {coins: hud.coins, islandCoins: island.island.coins, done: JSON.parse(values.get('plot_twist_first_quests_v1')).done,
        waveId: island.flow.current?.wave.waveId, teardownDisabled: document.querySelector('[data-focus="demolish"]')?.disabled,
        repairToast: island.ui.toastText === 'All buildings repaired.', events};
    } finally { recovery?.dispose(); lease?.dispose(); for (const stop of stops) stop(); island.dispose(); hud.dispose(); }
  }, empty);
  expect(result).toEqual({coins: 120, islandCoins: 120, done: 2, waveId: 'current-wave',
    teardownDisabled: true, repairToast: false, events: []});
});
