// The narrator on the bus: once per game, welcome back, the unlock lines from the wave won, the queue,
// missing audio, settings; then the real caption card and its Skip button in Chromium.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createNarrator, narratorVoices} from '../../src/narrator/index.js';
import {browserHarness} from '../g20-browser.js';

const evaluate = browserHarness();
const LINES = [
  {id: 'opening_1', trigger: 'game_opening', text: 'The light is out.'},
  {id: 'opening_2', trigger: 'game_opening', text: 'Build and ring the bell.'},
  {id: 'welcome_back_1', trigger: 'game_welcome_back', text: 'Welcome back.'},
  {id: 'welcome_back_2', trigger: 'game_welcome_back', text: 'Back again.'},
  {id: 'wave_1', trigger: 'wave_start:1', text: 'Here they come.'},
  {id: 'wave_5', trigger: 'wave_start:5', covers: ['boss_first'], text: 'A warship.'},
  {id: 'unlock_captain', trigger: 'wave_unlock:1', text: 'Captain upgrades.'},
  {id: 'unlock_houses', trigger: 'wave_unlock:1', text: 'Houses.'},
  {id: 'wave_won_1', trigger: 'wave_won', text: 'Won one.'},
  {id: 'wave_won_2', trigger: 'wave_won', text: 'Won two.'},
  {id: 'wave_lost_1', trigger: 'wave_lost', text: 'Lost.'},
  {id: 'boarders_ashore', trigger: 'boarders_ashore', text: 'Boarders!'},
  {id: 'heart_low_1', trigger: 'heart_low', text: 'The heart!'},
];
const manifest = {version: 1, lines: {'narrator-opening_1': {file: 'narrator-opening_1.mp3', seconds: 2}, opening_1: {file: 'x.mp3'},
  'narrator-bad': {file: '../evil.mp3'}}};

function bus() {
  const listeners = new Map();
  return {
    on(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); return () => listeners.get(type).delete(listener); },
    emit(event) { for (const listener of listeners.get(event.type) ?? []) listener(event); },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}
function storage() { const map = new Map(); return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value))}; }
function fakeCard() {
  const card = {shown: [], line: null, visible: false, show(line) { card.line = line.id; card.visible = true; card.shown.push(line.id); },
    hide() { card.line = null; card.visible = false; }, dispose() { card.disposed = true; }};
  return card;
}

describe('the narrator on the bus', () => {
  let game, card, prefs, audioCalls, store;
  beforeEach(() => { vi.useFakeTimers(); game = {code: 'ISLE-K7Q2M', waveBest: 0}; prefs = {narrator: true, captions: true, master: .7, voice: .8}; audioCalls = []; store = storage(); });
  afterEach(() => vi.useRealTimers());
  function make({audio = null, fetchManifest = manifest, held = () => false} = {}) {
    const events = bus();
    let watcher = null;
    const narrator = createNarrator({on: events.on, lines: LINES, storage: store, getGame: () => game, preferences: () => prefs,
      onPreferences: listener => { watcher = listener; return () => { watcher = null; }; },
      fetchImpl: async url => (fetchManifest ? {ok: true, json: async () => fetchManifest, url} : {ok: false}), audio, held,
      createCard: () => (card = fakeCard())});
    return {narrator, events, setPrefs(next) { prefs = {...prefs, ...next}; watcher?.(prefs); }};
  }
  const flush = ms => vi.advanceTimersByTimeAsync(ms);

  it('reads only the narrator entries of the voice manifest', () => {
    expect(narratorVoices(manifest)).toEqual({opening_1: {file: 'narrator-opening_1.mp3', seconds: 2}});
    expect(narratorVoices({version: 2, lines: {}})).toEqual({});
  });

  it('opens a new game once, line after line, and says welcome back to a returning crew', async () => {
    let {narrator} = make();
    await narrator.begin();
    await flush(0);
    expect(narrator.speaking).toBe('opening_1');
    expect(narrator.queued).toEqual(['opening_2']);
    await flush(20000);
    expect(card.shown).toEqual(['opening_1', 'opening_2']);
    narrator.dispose();
    // The same island again (a reload): no opening, the welcome back line instead.
    ({narrator} = make());
    await narrator.begin();
    await flush(10000);
    expect(card.shown).toEqual(['welcome_back_1']);
    narrator.dispose();
    // Another island: its own opening.
    game = {code: 'isle-aaaaa', waveBest: 0};
    ({narrator} = make());
    await narrator.begin();
    await flush(0);
    expect(narrator.speaking).toBe('opening_1');
    expect(narrator.game).toBe('ISLE-AAAAA');
    narrator.dispose();
  });

  it('waits for the island code, and treats a saved island with waves as a returning crew', async () => {
    game = null;
    const {narrator} = make();
    const started = narrator.begin();
    await flush(500);
    game = {code: 'K7Q2M', waveBest: 12};
    await flush(500);
    await started;
    await flush(0);
    expect(narrator.speaking).toBe('welcome_back_2');
    narrator.dispose();
  });

  it('teaches waves once, unlocks from the wave won, and deduplicates the two wave_finished events', async () => {
    const {narrator, events} = make();
    events.emit({type: 'wave_started_server', waveId: 'w1', wave: 1, where: 'own'});
    events.emit({type: 'wave_controller_started', waveId: 'w1', wave: 1});
    await flush(0);
    expect(narrator.speaking).toBe('wave_1');
    await flush(10000);
    events.emit({type: 'wave_finished', waveId: 'w1', survived: true, shipsSunk: 3}); // pirates lane, no number
    events.emit({type: 'wave_finished', waveId: 'w1', survived: true, wave: 1});      // island lane
    await flush(0);
    expect(narrator.speaking).toBe('unlock_captain');
    expect(narrator.queued).toEqual(['unlock_houses']); // the unlock is news: no generic "wave won" line
    await flush(30000);
    // Wave 1 again on the same island (a lost run restarted): nothing new to tell, the won line plays.
    events.emit({type: 'wave_started_server', waveId: 'w1b', wave: 1});
    events.emit({type: 'wave_finished', waveId: 'w1b', survived: true});
    await flush(0);
    expect(narrator.speaking).toBe('wave_won_2');
    narrator.dispose();
  });

  it('plays the lane events once and queues instead of talking over a line, dropping stale ones', async () => {
    const {narrator, events} = make();
    events.emit({type: 'boarders_ashore'});
    events.emit({type: 'heart_changed', hp: 20, max: 100});
    events.emit({type: 'heart_changed', hp: 10, max: 100}); // once per wave
    events.emit({type: 'boarders_ashore'});
    await flush(0);
    expect(narrator.speaking).toBe('boarders_ashore');
    expect(narrator.queued).toEqual(['heart_low_1']);
    await flush(30000);
    expect(card.shown).toEqual(['boarders_ashore', 'heart_low_1']);
    // A lost-wave line waits behind a long line and is dropped when it went stale.
    narrator.say('game_opening');
    events.emit({type: 'wave_finished', waveId: 'w9', survived: false, wave: 9});
    await flush(0);
    expect(narrator.queued).toEqual(['opening_2', 'wave_lost_1']);
    await flush(30000);
    expect(card.shown.slice(2)).toEqual(['opening_1', 'opening_2']);
    narrator.dispose();
  });

  it('shows the caption for a reading time when the recording is missing or the sound is locked', async () => {
    const audio = {playVoice: url => { audioCalls.push(url); return null; }};
    const {narrator, events} = make({audio});
    events.emit({type: 'wave_started_server', waveId: 'w1', wave: 1});
    await flush(0);
    expect(card.line).toBe('wave_1');
    expect(audioCalls).toEqual([]); // no file for wave_1 in the manifest: caption only
    await flush(2900);
    expect(card.line).toBe('wave_1');
    await flush(400);
    expect(card.line).toBe(null);
    narrator.say('game_opening');
    await flush(1000);
    expect(audioCalls).toEqual([expect.stringMatching(/audio\/voice\/narrator-opening_1\.mp3$/)]);
    narrator.dispose();
  });

  it('plays a recording to its end, skips it, and follows the Narrator and Captions settings', async () => {
    let finish;
    const stop = vi.fn();
    const audio = {playVoice: url => { audioCalls.push(url); return {done: new Promise(resolve => { finish = resolve; }), stop}; }};
    const {narrator, setPrefs} = make({audio});
    narrator.say('game_opening');
    await flush(0);
    expect(narrator.speaking).toBe('opening_1');
    await flush(15000);
    expect(narrator.speaking).toBe('opening_1'); // the voice decides the length
    finish(true);
    await flush(600);
    expect(narrator.speaking).toBe('opening_2');
    narrator.skip();
    expect(card.line).toBe(null);
    setPrefs({captions: false});
    narrator.say('wave_start:1');
    await flush(600);
    expect(narrator.speaking).toBe('wave_1');
    expect(card.visible).toBe(false); // captions off: no card, the line still runs
    setPrefs({narrator: false});
    expect(narrator.speaking).toBe(null);
    expect(narrator.say('boarders_ashore')).toEqual([]);
    narrator.dispose();
  });

  it('holds its queue while a cutscene plays and steps aside when one opens', async () => {
    let cutscene = true;
    const {narrator} = make({held: () => cutscene});
    narrator.say('boarders_ashore');
    await flush(2000);
    expect(narrator.speaking).toBe(null);
    cutscene = false;
    await flush(500);
    expect(narrator.speaking).toBe('boarders_ashore');
    cutscene = true;
    await flush(500);
    expect(narrator.speaking).toBe(null);
    narrator.dispose();
  });

  it('stops listening on dispose', () => {
    const {narrator, events} = make();
    expect(events.count()).toBeGreaterThan(5);
    narrator.dispose();
    expect(events.count()).toBe(0);
    expect(card.disposed).toBe(true);
  });
});

it('shows a readable caption card above the prompts with a working Skip button', async () => {
  const result = await evaluate(async () => {
    await window.g20Import('/src/ui/kit/kit.css');
    const {createNarrator} = await window.g20Import('/src/narrator/index.js');
    const listeners = new Map();
    const on = (type, listener) => { listeners.set(type, listener); return () => listeners.delete(type); };
    const prompt = document.createElement('div'); prompt.className = 'interact';
    prompt.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:80px';
    document.body.append(prompt);
    const narrator = createNarrator({on, getGame: () => ({code: 'ISLE-K7Q2M'}), storage: null, preferences: () => ({narrator: true, captions: true}),
      onPreferences: () => () => {}, fetchImpl: async () => ({ok: false})});
    narrator.say('wave_start:1');
    await new Promise(resolve => setTimeout(resolve, 50));
    const card = document.querySelector('.narrator-card'), skip = card.querySelector('.narrator-skip');
    const box = card.getBoundingClientRect(), button = skip.getBoundingClientRect();
    const shown = {visible: !card.hidden, text: card.querySelector('.narrator-text').textContent,
      live: card.querySelector('.narrator-text').getAttribute('aria-live'), label: skip.getAttribute('aria-label'),
      centered: Math.abs((box.left + box.right) / 2 - innerWidth / 2) < 2, abovePrompt: box.bottom <= innerHeight - 80,
      fontSize: parseFloat(getComputedStyle(card.querySelector('.narrator-text')).fontSize), button: [button.width, button.height]};
    skip.click();
    const after = {hidden: card.hidden, speaking: narrator.speaking};
    narrator.dispose();
    return {shown, after, removed: !document.querySelector('.narrator-card')};
  });
  expect(result.shown).toMatchObject({visible: true, live: 'polite', label: 'Skip the narrator', centered: true, abovePrompt: true});
  expect(result.shown.text).toMatch(/Here they come/);
  expect(result.shown.fontSize).toBeGreaterThanOrEqual(16);
  expect(result.shown.button[0]).toBeGreaterThanOrEqual(44);
  expect(result.shown.button[1]).toBeGreaterThanOrEqual(44);
  expect(result.after).toEqual({hidden: true, speaking: null});
  expect(result.removed).toBe(true);
});
