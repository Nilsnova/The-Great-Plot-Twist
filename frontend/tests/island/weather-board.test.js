// T26: the island Harbor opens the existing weather card with recorded weather and the fake island API.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('unlocks weather with the Harbor and reads the latest weather on each open', async () => {
  const result = await evaluate(async () => {
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {createHarbor} = await window.g20Import('/src/harbor/host.js');
    const {weatherAnswer} = await window.g20Import('/tests/harbor/fixtures.js');
    const {emit, on} = await window.g20Import('/src/core/events.js');
    let answer = weatherAnswer('storm'), resets = 0, focused = 0;
    const harbor = createHarbor({container: document.body, getWeather: () => answer, menu: () => () => {},
      resetInput: () => resets++, focusGame: () => focused++});
    const pending = [];
    const transport = createFakeIslandTransport();
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null,
      menu: () => () => {}, openHarborStall: id => { if (id === 'weather') pending.push(harbor.openWeather()); }});
    await island.load();
    transport.dev.setWaveBest(3); await island.load(); island.pick('island_harbor');
    const locked = !document.querySelector('[data-stall="weather"]');
    transport.dev.setWaveBest(4); await island.load();
    const views = [];
    for (const next of [answer, {...weatherAnswer('fog'), source: 'stale'}, null]) {
      answer = next; island.pick('island_harbor');
      document.querySelector('[data-stall="weather"] button').click();
      await Promise.all(pending);
      const dialog = document.querySelector('.harbor-weather[open]');
      views.push({text: dialog.textContent, dialogs: document.querySelectorAll('dialog[open]').length,
        islandClosed: !island.ui.active, focusInside: dialog.contains(document.activeElement)});
      dialog.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    const closed = !harbor.active;
    island.dispose(); harbor.dispose();
    return {locked, views, closed, resets, focused, remaining: document.querySelectorAll('dialog').length};
  });
  expect(result.locked).toBe(true);
  expect(result.views.every(view => view.dialogs === 1 && view.islandClosed && view.focusInside)).toBe(true);
  expect(result.views[0].text).toContain('Storm: 50% more pirate ships');
  expect(result.views[0].text).toContain('Open-Meteo');
  expect(result.views[1].text).toContain('Fog: pirates are seen later');
  expect(result.views[1].text).toContain('This is the last weather we heard');
  expect(result.views[2].text).toContain('Until it is, the sea counts as calm');
  expect(result.closed).toBe(true);
  expect(result.resets).toBe(3);
  expect(result.focused).toBe(3);
  expect(result.remaining).toBe(0);
});
