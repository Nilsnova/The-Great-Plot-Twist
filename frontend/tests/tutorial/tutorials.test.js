// T52: the tutorials host with a fake game around it: the guide moves on real bus events and what the frame
// shows, can be skipped and never comes back on that island, every won wave brings its cards once, a friend who
// joins past wave 0 gets only the cards they have not seen, and nothing starts without an island.
import {describe, expect, it} from 'vitest';
import {createTutorials, OPENING_WAIT_MS} from '../../src/tutorial/tutorials.js';
import {TUTORIALS_KEY, NEWS_KEY} from '../../src/tutorial/memory.js';

const memoryStorage = (entries = []) => { const map = new Map(entries); return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map}; };
function bus() {
  const listeners = new Map();
  return {on: (type, run) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(run); return () => listeners.get(type).delete(run); },
    emit: event => { for (const run of listeners.get(event.type) ?? []) run(event); }};
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function make({storage = memoryStorage(), game = {}, preferences = {}, reduced = false} = {}) {
  const events = bus(), said = [], views = [], tours = [], cards = [], coach = {shown: null, pointed: null};
  let clock = 1000;
  const state = {place: 'home_islet', code: 'K7Q2M', wave: 0, card: null, waveRunning: false, blocked: false, cutscene: false, dialog: false,
    narrating: false, player: {x: 0, z: 0}, ...game};
  const tutorials = createTutorials({on: events.on, storage, now: () => clock, reducedMotion: () => reduced,
    preferences: () => ({tutorials: true, ...preferences}), onPreferences: () => () => {},
    probe: () => ({...state}), locate: id => ({x: 100, y: 100, size: 60, inside: true, id}), spotTarget: () => 'cannon_7',
    anchor: () => ({x: 4.5, z: 16.5}), tour: point => tours.push(point), say: trigger => said.push(trigger), setGuide: view => views.push(view),
    createCoachImpl: () => ({show(view) { coach.shown = view; }, hide() { coach.shown = null; }, point(where) { coach.pointed = where; }, dispose() {}}),
    loadCard: async () => ({openUnlockCard: ({text, total}) => {
      let settle; const done = new Promise(resolve => { settle = resolve; });
      const card = {title: text.title, total, done, close: reason => settle(reason), dispose() {}}; cards.push(card); return card;
    }})});
  const frame = (ms = 300) => { clock += ms; tutorials.update(ms / 1000); };
  return {tutorials, events, said, views, tours, cards, coach, state, frame, storage, tick: ms => { clock += ms; }};
}
const saved = storage => JSON.parse(storage.map.get(TUTORIALS_KEY));

describe('the guided start', () => {
  it('starts after the intro on a new island at wave 0 and moves only on the real actions', async () => {
    const t = make({game: {narrating: true}});
    t.frame();
    expect(t.tutorials.guide).toBeNull(); // the narrator's opening is still speaking
    t.state.narrating = false; t.frame();
    expect(t.tutorials.guide.current).toBe('move');
    expect(t.views.at(-1)).toMatchObject({kind: 'guide', progress: '0 of 7'});
    expect(t.coach.shown).toMatchObject({step: 'Step 1 of 7', title: 'Walk around'});
    // Walking: the player's own steps on this screen.
    t.state.player = {x: 1, z: 0}; t.frame();
    expect(t.tutorials.guide.current).toBe('move');
    t.state.player = {x: 4, z: 0}; t.frame();
    expect(t.tutorials.guide.current).toBe('spot');
    expect(t.coach.pointed).toMatchObject({id: 'cannon_7'}); // the highlight on the nearest empty tower spot
    t.state.card = 'build'; t.frame();
    expect(t.tutorials.guide.current).toBe('cannon');
    t.events.emit({type: 'island_built', kind: 'cannon'});
    expect(t.tutorials.guide.current).toBe('menu');
    t.state.card = null; t.frame();
    expect(t.coach.pointed).toMatchObject({id: 'hud:menu'});
    t.events.emit({type: 'hud_opened', what: 'menu'});
    expect(t.tutorials.guide.current).toBe('bell');
    t.frame(); expect(t.coach.pointed).toMatchObject({id: 'island_bell'});
    t.events.emit({type: 'wave_controller_started', wave: 1});
    expect(t.tutorials.guide.current).toBe('shoot');
    expect(t.said).toEqual(['guide:shoot']);
    t.events.emit({type: 'captain_attack', weapon: 'gun'});
    expect(t.tutorials.guide.current).toBe('cutlass');
    t.events.emit({type: 'boarders_ashore', wave: 1});
    expect(t.said).toEqual(['guide:shoot', 'guide:cutlass']);
    t.events.emit({type: 'captain_attack', weapon: 'cutlass'});
    expect(t.tutorials.guide).toBeNull();
    expect(t.views.at(-1)).toBeNull(); // the goals are back in the strip
    expect(saved(t.storage).games['ISLE-K7Q2M'].guide.status).toBe('done');
    await flush();
  });
  it('waits at most a while for the narrator, and not during a cutscene or a card', () => {
    const t = make({game: {narrating: true, cutscene: true}});
    t.frame();
    t.frame(OPENING_WAIT_MS + 1);
    expect(t.tutorials.guide).toBeNull();
    t.state.cutscene = false; t.frame();
    expect(t.tutorials.guide.current).toBe('move');
  });
  it('can skip a step and the whole guide, and never shows it again on that island', () => {
    const storage = memoryStorage(), first = make({storage});
    first.frame();
    first.tutorials.skip(false);
    expect(first.tutorials.guide.current).toBe('spot');
    first.tutorials.skip(true);
    expect(first.tutorials.guide).toBeNull();
    expect(saved(storage).games['ISLE-K7Q2M'].guide.status).toBe('skipped');
    const again = make({storage});
    again.frame(); again.frame();
    expect(again.tutorials.guide).toBeNull();
    // Another new island on the same device gets it again.
    const other = make({storage, game: {code: 'B4C5D'}});
    other.frame();
    expect(other.tutorials.guide.current).toBe('move');
  });
  it('resumes at the step it stood at after a reload, and Settings replays it', () => {
    const storage = memoryStorage(), first = make({storage});
    first.frame(); first.events.emit({type: 'island_built', kind: 'cannon'});
    expect(first.tutorials.guide.current).toBe('menu');
    first.tutorials.dispose();
    const second = make({storage});
    second.frame();
    expect(second.tutorials.guide.current).toBe('menu');
    second.tutorials.skip(true);
    second.events.emit({type: 'tutorial_replay'});
    second.frame();
    expect(second.tutorials.guide.current).toBe('move');
  });
  it('jumps to the fight when a wave already runs (a friend rang the bell)', () => {
    const t = make({game: {waveRunning: true}});
    t.frame();
    expect(t.tutorials.guide.current).toBe('shoot');
  });
  it('is off with Settings › Tutorials off', () => {
    const t = make({preferences: {tutorials: false}});
    t.frame(); t.frame();
    expect(t.tutorials.guide).toBeNull();
    expect(t.views.filter(Boolean)).toEqual([]);
  });
});

describe('the unlock cards', () => {
  it('shows the cards of a won wave once each, one at a time, at a quiet moment', async () => {
    const t = make({game: {wave: 3}});
    // An island first seen at wave 3 on a device that met nothing yet: the cards of 1 to 3 (a catch-up).
    t.frame(); await flush();
    expect(t.tutorials.guide).toBeNull();
    const catchUp = t.tutorials.queue;
    expect(catchUp).toEqual(['captain_upgrades', 'houses', 'tear_down', 'level_2', 'mortar', 'house_roles', 'weapon_shop', 'watchtower', 'gunner']);
    expect(t.cards[0]).toMatchObject({title: 'Captain upgrades', total: 9});
    t.cards[0].close('skip_all'); await flush();
    expect(t.tutorials.queue).toEqual([]);
    // Wave 4 is won: the Harbor and the finishers, but not while the wave still runs or a card is open.
    t.state.wave = 4; t.state.waveRunning = true; t.frame(); await flush();
    expect(t.tutorials.queue).toEqual(['harbor', 'finishers']);
    expect(t.cards).toHaveLength(1);
    t.state.waveRunning = false; t.state.dialog = true; t.frame(); await flush();
    expect(t.cards).toHaveLength(1);
    t.state.dialog = false; t.frame(); await flush();
    expect(t.cards.at(-1)).toMatchObject({title: 'The Harbor', total: 2});
    t.cards.at(-1).close('show'); await flush();
    expect(t.tours).toEqual([{x: 4.5, z: 16.5}]); // Show me walks the camera there
    t.frame(1000); await flush();
    expect(t.coach.pointed).toMatchObject({id: 'island_harbor'});
    expect(t.cards).toHaveLength(2); // the next card waits for the look to end
    t.frame(5000); await flush();
    expect(t.tours.at(-1)).toBeNull();
    expect(t.cards.at(-1)).toMatchObject({title: 'Boss finishers'});
    t.cards.at(-1).close('ok'); await flush();
    // Seen on this island: a reload brings none of them again.
    const again = make({storage: t.storage, game: {wave: 4}});
    again.frame(); await flush();
    expect(again.tutorials.queue).toEqual([]);
    expect(again.cards).toEqual([]);
  });
  it('Show me does not move the camera with reduced motion; the ring still says where', async () => {
    const t = make({game: {wave: 3}, reduced: true});
    t.frame(); await flush();
    t.cards[0].close('skip_all'); await flush();
    t.state.wave = 4; t.frame(); await flush();
    t.cards.at(-1).close('show'); await flush();
    t.frame(); await flush();
    expect(t.tours).toEqual([]);
    expect(t.coach.pointed).toMatchObject({id: 'island_harbor'});
  });
  it('keeps the cards a reload interrupted', async () => {
    const storage = memoryStorage(), t = make({storage, game: {wave: 3, dialog: true}});
    t.frame(); await flush();
    expect(t.cards).toEqual([]);
    t.tutorials.dispose();
    const again = make({storage, game: {wave: 3}});
    again.frame(); await flush();
    expect(again.cards[0]).toMatchObject({title: 'Captain upgrades'});
  });
});

describe('multiplayer: a friend who joins', () => {
  it('a friend on an island past wave 0 gets no guide, only the cards this device never saw', async () => {
    // This device met the Harbor (an earlier island) and was told the wave-1 and wave-2 news there (with
    // their extra cards: tearing down, the guns).
    const storage = memoryStorage([[TUTORIALS_KEY, JSON.stringify({version: 1, seen: ['harbor'], games: {}})], [NEWS_KEY, JSON.stringify(['campaign_1', 'campaign_2'])]]);
    const t = make({storage, game: {code: 'F1F2F', wave: 5}});
    t.frame(); await flush();
    expect(t.tutorials.guide).toBeNull();
    expect(t.views.filter(Boolean)).toEqual([]);
    expect(t.tutorials.queue).toEqual(['watchtower', 'gunner', 'finishers', 'ring_walls', 'carpenter', 'level_3']);
    expect(saved(storage).games['ISLE-F1F2F'].guide.status).toBe('none');
    // Even after a reload and a lost wave the guide never comes on that island.
    t.tutorials.dispose();
    const again = make({storage, game: {code: 'F1F2F', wave: 5}});
    again.frame(); await flush();
    expect(again.tutorials.guide).toBeNull();
  });
  it('a friend who joins at wave 0 gets the guide on their own screen', () => {
    const t = make({game: {code: 'F1F2F', wave: 0}});
    t.frame();
    expect(t.tutorials.guide.current).toBe('move');
  });
});

describe('no island, no tutorial (the signed-out bug)', () => {
  for (const [name, game] of [['signed out: no code', {code: null}], ['no answer yet: no campaign', {wave: null}],
    ['the front door', {place: 'saltreach_harbor'}], ['a code that is not one', {code: 'not a code'}]]) {
    it(`starts nothing with ${name}`, async () => {
      const t = make({game});
      for (let i = 0; i < 5; i++) t.frame(OPENING_WAIT_MS);
      await flush();
      t.events.emit({type: 'island_built', kind: 'cannon'});
      t.events.emit({type: 'campaign_unlocked', wave: 4, ids: ['harbor']});
      t.frame(); await flush();
      expect(t.tutorials.guide).toBeNull();
      expect(t.views.filter(Boolean)).toEqual([]);
      expect(t.cards).toEqual([]);
      expect(t.coach.shown).toBeNull();
      expect(t.said).toEqual([]);
      expect(t.storage.map.has(TUTORIALS_KEY)).toBe(false);
    });
  }
});
