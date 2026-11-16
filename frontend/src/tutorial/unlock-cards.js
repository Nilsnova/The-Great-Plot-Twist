// The unlock cards (T52) as plain rules, no DOM: one short card for every new thing, from the table next to the
// campaign table (src/campaign/tutorials.json). A card covers campaign ids (its wave is theirs) or names its own
// wave (a thing outside the table: the arsenal, the culverin, gunboats, finishers, tearing down).
//
//   CARDS                          every card, in table order, with its wave
//   cardById(id) / cardOfItem(id)  a card by its id, or the card that covers a campaign id
//   coverage(cards?, steps?)       {missing: campaign ids without a card, twice: ids covered twice, unknown: rows naming ids the table lacks}
//   cardsBetween(from, to, flags)  the cards a win from `from` to `to` brings, in wave and table order
//   cardsOpenAt(wave, flags)       every card open on an island whose best won wave is `wave`
//   flagAllows(card, flags)        a card with a flag shows only while that flag is on ('!name': only while off)
import table from '../campaign/tutorials.json';
import {STEPS, waveOf} from '../campaign/index.js';

const waveOfCard = row => (Number.isSafeInteger(row.wave) ? row.wave
  : Math.min(...(row.covers ?? []).map(id => waveOf(id) ?? Infinity)));
export const CARDS = Object.freeze(table.cards.map(row => Object.freeze({...row, covers: Object.freeze([...(row.covers ?? [])]),
  wave: waveOfCard(row), where: typeof row.where === 'string' && row.where ? row.where : null})));
const BY_ID = new Map(CARDS.map(card => [card.id, card]));
const BY_ITEM = new Map(CARDS.flatMap(card => card.covers.map(id => [id, card])));
export const cardById = id => BY_ID.get(id) ?? null;
export const cardOfItem = id => BY_ITEM.get(id) ?? null;

export function coverage(cards = CARDS, steps = STEPS) {
  const items = new Set(steps.flatMap(step => step.opens)), counts = new Map();
  for (const card of cards) for (const id of card.covers ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  return {missing: [...items].filter(id => !counts.has(id)), twice: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
    unknown: [...counts.keys()].filter(id => !items.has(id))};
}

export function flagAllows(card, flags = {}) {
  if (!card?.flag) return true;
  const off = card.flag.startsWith('!'), name = off ? card.flag.slice(1) : card.flag;
  let on = false;
  try { on = (typeof flags[name] === 'function' ? flags[name]() : flags[name]) === true; } catch { on = false; }
  return off ? !on : on;
}
const isWave = value => Number.isSafeInteger(value) && value >= 0;
const ordered = cards => [...cards].sort((a, b) => a.wave - b.wave || CARDS.indexOf(a) - CARDS.indexOf(b));
export function cardsBetween(from, to, flags = {}) {
  if (!isWave(from) || !isWave(to) || to <= from) return [];
  return ordered(CARDS.filter(card => card.wave > from && card.wave <= to && flagAllows(card, flags)));
}
export function cardsOpenAt(wave, flags = {}) {
  if (!isWave(wave)) return [];
  return ordered(CARDS.filter(card => card.wave <= wave && flagAllows(card, flags)));
}
// The words a card shows, as one plain object (the card's DOM only lays them out).
export function cardText(card) {
  if (!card) return null;
  const wave = card.wave > 0 ? `New after wave ${card.wave}` : 'From the start';
  return {eyebrow: wave, title: card.title, what: card.what, how: card.how,
    menu: card.menu ? `In the Menu: ${card.menu}` : '', practice: card.practice === true
      ? 'Practice first: when the finisher starts, choose Practice to try it. Practice never counts.' : '',
    showMe: card.where !== null};
}
