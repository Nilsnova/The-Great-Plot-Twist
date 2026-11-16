// T52 and the signed-out bug (Nicolas Radomski): with the island game on, no intro, goal card, island arrival or
// first-run goal starts while the player has no island (signed out, or the front door only). Real Chromium.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
const evaluate = browserHarness();

it('the front door plays no intro and no goal card, and the HUD shows no goals, without an island', async () => {
  await evaluate.withPage(async page => {
    const result = await page.evaluate(async () => {
      const {createFrontDoor} = await window.g20Import('/src/front-door/index.js');
      const {createHud} = await window.g20Import('/src/ui/hud.js');
      const log = [], values = new Map(), storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
      const tab = new Map(), session = {getItem: key => tab.get(key) ?? null, setItem: (key, value) => tab.set(key, value), removeItem: key => tab.delete(key)};
      let island = false;
      // The island game is on (a lane), but the player has no island: no code, no campaign answer.
      const lane = {api: null};
      const game = {gameLane: async () => lane, begin: async (...args) => log.push(['begin', ...args]), playArrival: async () => log.push(['arrival']),
        islandReady: async () => island, openLobby: () => log.push(['lobby'])};
      const door = createFrontDoor({container: document.body, storage, session, focus: () => log.push(['focus']),
        loadGames: async () => ({chooseGame: () => ({done: Promise.resolve(null), close() {}, dispose() {}})}),
        loadPlayer: async () => ({playCutscene: ({id}) => { log.push(['cutscene', id]); return {done: Promise.resolve({status: 'skipped'}), skip() {}, dispose() {}}; }})});
      await door.run({loadGame: async () => game});
      const first = {log: log.map(([name]) => name), card: !!document.querySelector('.goal-card[open]'), tutorial: !!document.querySelector('.tutorial-card'),
        seen: values.has('plot_twist_front_door_v1') || [...values.keys()].some(key => /front_door/.test(key))};
      // The HUD: no goals without an island; they appear once the island answers.
      const main = document.createElement('main'); document.body.append(main);
      const hud = createHud(main, {focus() {}, start() {}, chart() {}, quality() {}, hasIsland: () => island});
      hud.start();
      const hidden = main.querySelector('.quest-strip').hidden;
      // Now the player has an island: the intro, the goal card and the arrival come on the next Play.
      island = true; log.length = 0;
      hud.update(null, {speed: 0});
      const shown = !main.querySelector('.quest-strip').hidden;
      const run = door.run({loadGame: async () => game});
      for (let i = 0; i < 50 && !document.querySelector('.goal-card[open]'); i++) await new Promise(resolve => setTimeout(resolve, 20));
      const card = !!document.querySelector('.goal-card[open]');
      door.handleEscape(); await run;
      return {first, hidden, shown, second: log.map(([name]) => name), card};
    });
    expect(result.first).toEqual({log: ['begin', 'focus'], card: false, tutorial: false, seen: false});
    expect(result.hidden).toBe(true);
    expect(result.shown).toBe(true);
    expect(result.card).toBe(true);
    expect(result.second).toEqual(['begin', 'cutscene', 'arrival', 'focus']);
  });
});
