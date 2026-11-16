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
    t.state.menu = true; t.frame(); t.state.menu = false; // the pause menu opened (Menu or Escape)
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
  it('counts the Menu button or a goal tapped (hud_opened from the HUD) for the Menu step', () => {
    const t = make();
    t.frame(); t.tutorials.skip(false); t.tutorials.skip(false); t.tutorials.skip(false);
    expect(t.tutorials.guide.current).toBe('menu');
    t.events.emit({type: 'hud_opened', what: 'goals'});
    expect(t.tutorials.guide.current).toBe('bell');
  });
  it('waits at most a while for the narrator, and not during a cutscene or a card', () => {
    const t = make({game: {narrating: true, cutscene: true}});
    t.frame();
    t.frame(OPENING_WAIT_MS + 1);
    expect(t.tutorials.guide).toBeNull();
    t.state.cutscene = false; t.frame();
    expect(t.tutorials.guide.current).toBe('move');
  });
  it('can skip a step and the whole guide, and never shows it again on this device', () => {
    const storage = memoryStorage(), first = make({storage});
    first.frame();
    first.tutorials.skip(false);
    expect(first.tutorials.guide.current).toBe('spot');
    first.tutorials.skip(true);
    expect(first.tutorials.guide).toBeNull();
    expect(saved(storage).games['ISLE-K7Q2M'].guide.status).toBe('skipped');
    expect(saved(storage).guided).toBe(true);
    const again = make({storage});
    again.frame(); again.frame();
    expect(again.tutorials.guide).toBeNull();
    // Another new island on the same device (a friend's at wave 0, or a second game) does not get it again.
    const other = make({storage, game: {code: 'B4C5D'}});
    other.frame(); other.frame();
    expect(other.tutorials.guide).toBeNull();
    expect(other.views.filter(Boolean)).toEqual([]);
  });
  it('waits on the island during a trip to the Harbor, is over after a reload, and Settings replays it', () => {
    const storage = memoryStorage(), first = make({storage});
    first.frame(); first.events.emit({type: 'island_built', kind: 'cannon'});
    expect(first.tutorials.guide.current).toBe('menu');
    // Off to the Harbor and back on this page: it goes on where it stood.
    first.state.place = 'saltreach_harbor'; first.frame();
    expect(first.tutorials.guide).toBeNull();
    first.state.place = 'home_islet'; first.frame();
    expect(first.tutorials.guide.current).toBe('menu');
    first.tutorials.dispose();
    // A reload: re-entering the island does not explain it again.
    const second = make({storage});
    second.frame(); second.frame();
    expect(second.tutorials.guide).toBeNull();
    expect(saved(storage).games['ISLE-K7Q2M'].guide.status).toBe('done');
    second.events.emit({type: 'tutorial_replay'});
    second.frame();
    expect(second.tutorials.guide.current).toBe('move');
  });
  it('gives a veteran on a new device (own island past wave 0) no guide', () => {
    const storage = memoryStorage(), t = make({storage, game: {code: 'F1F2F', wave: 0, best: 4}});
    t.frame(); t.frame();
    expect(t.tutorials.guide).toBeNull();
    expect(saved(storage).guided).toBe(true);
  });
  it('counts a guide finished before the device-wide flag (an older memory) as shown', () => {
    const storage = memoryStorage([[TUTORIALS_KEY, JSON.stringify({version: 1, seen: [], games: {'ISLE-AAAAA': {guide: {status: 'done', step: 7}, wave: 1, cards: [], queued: []}}})]]);
    const t = make({storage, game: {code: 'B4C5D', wave: 0}});
    t.frame(); t.frame();
    expect(t.tutorials.guide).toBeNull();
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
  it('a card open when a wave begins gives way and comes back unread in the next break', async () => {
    const t = make({game: {wave: 3}});
    t.frame(); await flush();
    expect(t.cards).toHaveLength(1);
    t.state.waveRunning = true; t.frame(); await flush(); // a friend rang the bell
    expect(t.tutorials.queue[0]).toBe('captain_upgrades');
    expect(t.cards).toHaveLength(1);
    t.state.waveRunning = false; t.frame(); await flush();
    expect(t.cards).toHaveLength(2);
    expect(t.cards.at(-1)).toMatchObject({title: 'Captain upgrades', total: 9});
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

describe('once per device (owner, 16 Nov: re-entering an island)', () => {
  it('a card shown on one island never shows on another, after a reload, or after a reset (T53)', async () => {
    const storage = memoryStorage(), t = make({storage, game: {wave: 0}});
    t.tutorials.skip(true); t.frame(); t.tutorials.skip(true);
    t.state.wave = 1; t.frame(); await flush();
    const firstCards = [];
    while (t.cards.length > firstCards.length) { const card = t.cards.at(-1); firstCards.push(card.title); card.close('ok'); await flush(); t.frame(); await flush(); }
    expect(firstCards.length).toBeGreaterThan(0);
    // T53: the island is reset to wave 0 and wins wave 1 again: no card again.
    t.state.wave = 0; t.frame(); t.state.wave = 1; t.frame(); await flush();
    expect(t.cards.length).toBe(firstCards.length);
    t.tutorials.dispose();
    // A second island on this device wins its wave 1 after a reload: the cards were seen, so none.
    const other = make({storage, game: {code: 'B4C5D', wave: 0}});
    other.frame(); other.state.wave = 1; other.frame(); await flush(); other.frame(); await flush();
    expect(other.cards).toEqual([]);
    expect(other.tutorials.guide).toBeNull();
    // A friend's island past wave 0 brings only the cards of later waves, never seen ones.
    const friend = make({storage, game: {code: 'F1F2F', wave: 1}});
    friend.frame(); await flush();
    expect(friend.cards).toEqual([]);
    expect(friend.tutorials.queue).toEqual([]);
  });
  it('a signed-in veteran on a new device gets no catch-up cards for what their own island opened', async () => {
    const t = make({game: {code: 'F1F2F', wave: 3, best: 3}});
    t.frame(); await flush();
    expect(t.tutorials.queue).toEqual([]);
    expect(t.cards).toEqual([]);
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
