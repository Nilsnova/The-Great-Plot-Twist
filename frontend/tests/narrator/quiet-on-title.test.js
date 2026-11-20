// Playtest 20 Nov: after Menu > Return to title during a wave, the narrator kept talking over the title screen.
// While quiet() is true nothing is said and nothing is marked as told; hush() stops the line that is running.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createNarrator} from '../../src/narrator/index.js';

const LINES = [
  {id: 'opening_1', trigger: 'game_opening', text: 'The light is out.'},
  {id: 'wave_1', trigger: 'wave_start:1', text: 'Here they come.'},
  {id: 'boarders_ashore', trigger: 'boarders_ashore', text: 'Boarders!'},
];
function fakeCard() {
  const card = {shown: [], visible: false, show(line) { card.visible = true; card.shown.push(line.id); }, hide() { card.visible = false; }, dispose() {}};
  return card;
}
const storage = () => { const map = new Map(); return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value))}; };

describe('the narrator while the title screen is up', () => {
  let card, quiet;
  beforeEach(() => { vi.useFakeTimers(); quiet = false; });
  afterEach(() => vi.useRealTimers());
  const make = () => createNarrator({on: () => () => {}, lines: LINES, storage: storage(), getGame: () => ({code: 'ISLE-K7Q2M', waveBest: 0}),
    preferences: () => ({narrator: true, captions: true}), onPreferences: () => () => {}, fetchImpl: async () => ({ok: false}),
    held: () => false, createCard: () => (card = fakeCard()), quiet: () => quiet});

  it('says nothing while quiet, and the same line still comes afterwards', async () => {
    const narrator = make();
    quiet = true;
    expect(narrator.say('boarders_ashore')).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(card.shown).toEqual([]);
    expect(narrator.speaking).toBeNull();
    quiet = false;
    expect(narrator.say('boarders_ashore').length).toBe(1); // not used up while it could not be heard
    await vi.advanceTimersByTimeAsync(0);
    expect(card.shown).toEqual(['boarders_ashore']);
    narrator.dispose();
  });

  it('hush() stops the running line, hides the caption and empties the queue', async () => {
    const narrator = make();
    narrator.say('wave_start:1'); narrator.say('boarders_ashore');
    await vi.advanceTimersByTimeAsync(0);
    expect(narrator.speaking).not.toBeNull();
    expect(card.visible).toBe(true);
    narrator.hush();
    expect(narrator.speaking).toBeNull();
    expect(narrator.queued).toEqual([]);
    expect(card.visible).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(card.visible).toBe(false);
    narrator.dispose();
  });
});
