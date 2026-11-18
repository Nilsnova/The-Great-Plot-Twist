// A late bell response cannot close the card opened after leaving its island.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('preserves the current card after a stale successful bell response', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport: createFakeIslandTransport(),
      storage: null, visitStorage: null, menu: () => () => {}, settings: () => () => {}});
    try {
      await island.load();
      let resolveStart, pending;
      island.api.startWave = () => new Promise(resolve => { resolveStart = resolve; });
      const ring = island.flow.ring;
      island.flow.ring = (...args) => { pending = ring(...args); return pending; };
      island.pick('island_bell');
      document.querySelector('.island-card[open] [data-focus="bell"]').click();
      island.visit('ISLE-FR3ND');
      island.pick('cannon_2');
      const before = island.ui.open;
      resolveStart({ok: true, data: {waveId: 'old-wave', wave: 1, seed: 77,
        startsAt: new Date().toISOString(), weather: {kind: 'calm'}, flagship: false}});
      await pending;
      return {before, after: island.ui.open, current: island.flow.current};
    } finally { island.dispose(); }
  });
  expect(result).toEqual({before: 'build', after: 'build', current: null});
});

it('settles the old wallet receipt without releasing the next wave or showing its repair toast', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    const transport = createFakeIslandTransport(), coins = [], wins = [];
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, onCoins: value => coins.push(value),
      storage: null, visitStorage: null, menu: () => () => {}, settings: () => () => {}});
    const stop = on('wave_finished', event => { if (event.survived) wins.push(event.waveId); });
    try {
      await island.load(); await island.build('cannon_1', 'cannon');
      island.api.startWave = async () => ({ok: true, data: {waveId: 'next-wave', wave: 2, seed: 77,
        startsAt: new Date().toISOString(), weather: {kind: 'calm'}, flagship: false}});
      await island.ringBell(); island.setBattle(true); island.pick('cannon_1');
      const disabled = () => document.querySelector('.island-card[open] [data-focus="demolish"]')?.disabled;
      const before = disabled();
      emit({type: 'wave_finished', waveId: 'old-wave', survived: true, loot: 20, coins: 120});
      const afterOld = {disabled: disabled(), coins: coins.at(-1), wins: [...wins], toast: island.ui.toastText,
        waveId: island.flow.current?.wave.waveId};
      island.flow.ended('next-wave', {survived: true, loot: 25, coins: 145});
      const afterCurrent = {disabled: disabled(), toast: island.ui.toastText, current: island.flow.current};
      return {before, afterOld, afterCurrent};
    } finally { stop(); island.dispose(); }
  });
  expect(result.before).toBe(true);
  expect(result.afterOld).toMatchObject({disabled: true, coins: 120, wins: ['old-wave'], waveId: 'next-wave'});
  expect(result.afterOld.toast).not.toBe('All buildings repaired.');
  expect(result.afterCurrent).toEqual({disabled: false, toast: 'All buildings repaired.', current: null});
});
