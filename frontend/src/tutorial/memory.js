// What this device showed of the tutorials (T52), per island game, in localStorage like the narrator's memory
// (src/narrator/logic.js): the guided start's state on that island, the best won wave whose cards were handed
// out there, the cards shown or skipped there and the ones still waiting; plus, for the whole device, every card
// seen on any island and whether the guided start was ever shown (owner, 16 Nov: "once re-entering the island, do
// not always re-explain things": each explanation once per player on this device, across islands, visits and resets).
//   {version: 1, guided: true, seen: ["harbor", ...], games: {"ISLE-K7Q2M": {guide: {status, step, ready, skipped}, wave, cards, queued, at}}}
// guide.status: 'active' (running or not begun), 'done', 'skipped' or 'none' (never offered: the island was
// past wave 0 when this device first saw it). The newest MAX_GAMES games are kept; no storage keeps it per visit.
import {STEPS} from '../campaign/index.js';
import {CARDS} from './unlock-cards.js';

export const TUTORIALS_KEY = 'tgpt:tutorials:v1';
// The island lane's once-per-device news (src/island/index.js NEWS_KEY): campaign_<wave> was told on this device
// before the cards existed, so a player who already met those things is not shown them again on a new island.
export const NEWS_KEY = 'plot_twist_td_news_v1';
export const MAX_GAMES = 30;
const ids = value => (Array.isArray(value) ? value.filter(id => typeof id === 'string' && /^[a-z0-9_]{1,40}$/.test(id)) : []);
const GUIDE_STATUS = new Set(['active', 'done', 'skipped', 'none']);

function readGuide(value) {
  if (!value || !GUIDE_STATUS.has(value.status)) return null;
  const step = Number.isSafeInteger(value.step) && value.step >= 0 ? value.step : 0;
  return {status: value.status, step, ready: value.ready === true, skipped: ids(value.skipped)};
}

export function createTutorialMemory(storage, {now = () => Date.now()} = {}) {
  let data = {version: 1, guided: false, seen: [], games: {}};
  try {
    const saved = JSON.parse(storage?.getItem(TUTORIALS_KEY) ?? 'null');
    if (saved?.version === 1 && saved.games && typeof saved.games === 'object') {
      // A memory from before the device-wide flag: a guide finished, skipped or begun on any island counts.
      const guided = saved.guided === true || Object.values(saved.games).some(entry => {
        const guide = readGuide(entry?.guide);
        return guide && (guide.status === 'done' || guide.status === 'skipped' || (guide.status === 'active' && guide.step > 0));
      });
      data = {version: 1, guided, seen: ids(saved.seen), games: saved.games};
    }
  } catch { /* A fresh memory. */ }
  // Cards of the campaign steps the island lane already told on this device.
  const told = new Set();
  try {
    for (const item of JSON.parse(storage?.getItem(NEWS_KEY) ?? '[]')) {
      const wave = /^campaign_(\d+)$/.exec(String(item))?.[1];
      const step = wave !== undefined ? STEPS.find(entry => entry.wave === Number(wave)) : null;
      if (step) for (const card of CARDS) if (card.covers.some(id => step.opens.includes(id)) || (!card.covers.length && card.wave === step.wave)) told.add(card.id);
    }
  } catch { /* Nothing told before. */ }
  const read = code => {
    const entry = data.games[code];
    if (!entry || typeof entry !== 'object') return null;
    return {guide: readGuide(entry.guide), wave: Number.isSafeInteger(entry.wave) && entry.wave >= 0 ? entry.wave : null,
      cards: ids(entry.cards), queued: ids(entry.queued)};
  };
  const write = (code, patch) => {
    const entry = {...(read(code) ?? {guide: null, wave: null, cards: [], queued: []}), ...patch, at: now()};
    data.games[code] = entry; save();
    return read(code);
  };
  function save() {
    const keys = Object.keys(data.games).sort((a, b) => (data.games[b]?.at ?? 0) - (data.games[a]?.at ?? 0));
    for (const key of keys.slice(MAX_GAMES)) delete data.games[key];
    data.seen = data.seen.slice(-200);
    try { storage?.setItem(TUTORIALS_KEY, JSON.stringify(data)); } catch { /* Kept for this visit. */ }
  }
  return {
    game: read,
    known: code => read(code) !== null,
    setGuide(code, guide) { return write(code, {guide: readGuide(guide)}); },
    setWave(code, wave) { return write(code, {wave}); },
    queue(code, cardIds) {
      const entry = read(code) ?? {cards: [], queued: []};
      return write(code, {queued: [...new Set([...entry.queued, ...ids(cardIds)])].filter(id => !entry.cards.includes(id))});
    },
    // A card shown, skipped or passed by Skip all: done on this island and seen on this device.
    mark(code, cardIds) {
      const entry = read(code) ?? {cards: [], queued: []}, list = ids(cardIds);
      data.seen = [...new Set([...data.seen, ...list])];
      return write(code, {cards: [...new Set([...entry.cards, ...list])], queued: entry.queued.filter(id => !list.includes(id))});
    },
    seenAnywhere: id => data.seen.includes(id) || told.has(id),
    // The guided start was shown on this device (on any island): it is never offered again, except by Replay.
    guided: () => data.guided === true,
    setGuided() { if (!data.guided) { data.guided = true; save(); } },
  };
}
