// T28 real DOM: the existing cartoon stage is reused; practice samples stay private.
import {expect, it} from 'vitest';
import {browserHarness} from './g20-browser.js';
const browser = browserHarness();

it('two browser pages exchange personal readiness through the real local wave room', async () => {
  await browser.withPage(async (page, base) => {
    const peer = await page.context().newPage(); await peer.goto(base + '/g20-harness');
    await peer.addScriptTag({type: 'module', content: 'window.g20Import = path => import(path);'});
    const setup = async by => {
      const {createFinisher} = await window.g20Import('/src/pirates/finisher/rules.js');
      const {createLocalRoom} = await window.g20Import('/src/pirates/room.js');
      const {readMessage, toMessage} = await window.g20Import('/src/pirates/sync.js');
      const f = createFinisher({wave: 5, enabled: true, preparation: true});
      f.bind({party: new Map([['a', {id: 'a'}], ['b', {id: 'b'}]]), presentAt: () => true, now: () => 0});
      f.watch({id: 'boss_1', kind: 'warship', boss: true, hp: 1, maxHp: 100, x: 0, z: 0}); f.begin([]);
      const room = createLocalRoom('t28-browser-check');
      room.on('finisher_ready', data => {const message = readMessage('finisher_ready', data, 'wave-1'); if (message) f.input(message.input);});
      window.t28 = {f, room, ready() {
        const input = {type: 'finisher_ready', by, shipId: 'boss_1'};
        f.input(input); const message = toMessage(input, {by, seq: 1, tick: 4, waveId: 'wave-1'}); room.send(message.type, message.payload);
      }};
    };
    await page.evaluate(setup, 'a'); await peer.evaluate(setup, 'b');
    await page.evaluate(() => window.t28.ready());
    await peer.waitForFunction(() => window.t28.f.state().ready.includes('a'));
    expect(await peer.evaluate(() => {window.t28.f.tick([]); return window.t28.f.state().sample;})).toBe(0);
    await peer.evaluate(() => window.t28.ready());
    await page.waitForFunction(() => window.t28.f.state().ready.includes('b'));
    for (const client of [page, peer]) {
      expect(await client.evaluate(() => {window.t28.f.tick([]); return window.t28.f.state().phase;})).toBe('intro');
      await client.evaluate(() => window.t28.room.close());
    }
    await peer.close();
  });
});

it('offers practice and skip for every kind, resets held input, and cleans up the scene', async () => {
  const result = await browser(async () => {
    const {createFinisherIntroduction} = await window.g20Import('/src/pirates/finisher/introduction.js');
    const results = [];
    for (const kind of ['haul', 'cannon', 'duel']) {
      let ready = 0, sent = 0;
      const f = {active: true, kind, phase: 'prepare', shipId: 'boss', players: ['a', 'b'], sample: 0, salt: 0,
        task: 0, tasks: [{task: kind, from: 16, to: 116, score: 0, goal: 60, players: {}}], ready: [], prepareLeft: 60};
      const scene = createFinisherIntroduction({container: document.body, me: 'a', practiceIdentity: {player: 'a', island: kind},
        onReady: () => ready++, recorder: {press() {sent++;}, fill() {sent++;}}, reducedMotion: () => true});
      scene.update({finisher: f});
      const root = scene.element;
      const first = root.dataset.learning;
      root.querySelector('.finisher-introduction button').click();
      scene.update({finisher: f, dt: .1});
      const correctFocus = document.activeElement?.classList.contains(kind === 'haul' ? 'finisher-hold' : kind === 'cannon' ? 'finisher-fire' : 'finisher-arrow');
      if (kind === 'haul') root.querySelector('.finisher-hold').dispatchEvent(new PointerEvent('pointerdown', {pointerId: 1, pointerType: 'touch', bubbles: true}));
      window.dispatchEvent(new KeyboardEvent('keydown', {code: kind === 'duel' ? 'ArrowUp' : 'Space'}));
      scene.update({finisher: f, dt: .1});
      const privateSamples = sent === 0;
      root.querySelector('.finisher-introduction button').click();
      scene.update({finisher: {...f, phase: 'task', sample: 16}, dt: 0});
      results.push({first, privateSamples, correctFocus, ready, needle: scene.needle});
      scene.dispose();
      const again = createFinisherIntroduction({container: document.body, me: 'a', practiceIdentity: {player: 'a', island: kind}, onReady: () => ready++});
      again.update({finisher: f});
      results.at(-1).later = again.element.dataset.learning;
      again.dispose();
    }
    return {results, left: document.querySelectorAll('.finisher').length};
  });
  expect(result).toEqual({results: Array.from({length: 3}, () => ({first: 'explain', privateSamples: true, correctFocus: true, ready: 1, needle: 0, later: 'ready'})), left: 0});
});

it('does not mark an interrupted introduction seen and skips only this player on this island', async () => {
  const result = await browser(async () => {
    const {createFinisherIntroduction} = await window.g20Import('/src/pirates/finisher/introduction.js');
    const f = {kind: 'haul', phase: 'prepare', players: ['a', 'b'], sample: 0, salt: 0, task: 0,
      tasks: [{task: 'haul', from: 16, to: 116}], ready: [], prepareLeft: 60};
    const open = (player, island) => {const s = createFinisherIntroduction({container: document.body, me: player, practiceIdentity: {player, island}}); s.update({finisher: f}); return s;};
    open('a', 'one').dispose();
    const s = open('a', 'one'), interrupted = s.element.dataset.learning;
    s.element.querySelectorAll('.finisher-introduction button')[1].click(); s.dispose();
    const modes = [];
    for (const [player, island] of [['a', 'one'], ['b', 'one'], ['a', 'two']]) {const next = open(player, island); modes.push(next.element.dataset.learning); next.dispose();}
    return {interrupted, modes};
  });
  expect(result).toEqual({interrupted: 'explain', modes: ['ready', 'explain', 'explain']});
});
