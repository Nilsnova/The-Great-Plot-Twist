// The arsenal card (T41, D042) as plain data: what the card shows for one answer of GET /api/island/arsenal.
// No DOM, no clock: arsenal-ui.js draws it, arsenal.js feeds it. The server decides every move; this only
// says which buttons are on and why one is off.
//   arsenalModel({answer, level, busy, message, loading}) -> {title, lead, stock, full, carry, back, rack, shop, message, coins}
//   weaponStats(id, level)  -> "Damage 6 · Range 14 · Reload 1.2 s" for that type at that captain level
//   readArsenal(data)       -> true when an answer has the contract's shape
import {WEAPONS, WEAPON_BY_ID, captainStats, readWeapon} from '../pirates/captain-stats.js';
import {coinText} from './card-model.js';
import {opensText} from '../campaign/index.js';

export const CAPACITY = 20;
const MODE_LINES = Object.freeze({single: 'One ship per shot.', cone: 'A spray: up to 3 ships in front of you.',
  pierce: 'Goes through to a second ship behind the first.', area: 'Thrown: bursts and hits every ship near the impact.'});

const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isCopy = item => !!item && typeof item.id === 'string' && isCount(item.no) && !!WEAPON_BY_ID[item.weapon]
  && (item.holder === null || typeof item.holder === 'string') && typeof item.away === 'boolean' && typeof item.you === 'boolean';
export const readArsenal = data => !!data && typeof data.code === 'string' && isCount(data.capacity) && isCount(data.stored)
  && Array.isArray(data.copies) && data.copies.every(isCopy) && typeof data.waveRunning === 'boolean' && isCount(data.coins);

/** The type's numbers for your captain level (the same numbers the wave uses: captain-stats.js). */
export function weaponStats(id, level = 1) {
  const stats = captainStats(level, [], readWeapon(id));
  return `Damage ${stats.damage} · Range ${stats.range} · Reload ${stats.reload} s`;
}

function copyRow(copy, {carries, closed, busy, level}) {
  const type = WEAPON_BY_ID[copy.weapon];
  const row = {id: copy.id, label: `${type.name} #${copy.no}`, weapon: copy.weapon, stats: weaponStats(copy.weapon, level),
    holder: '', button: null};
  if (copy.you) { row.holder = 'You carry it'; return row; }
  if (copy.holder) { row.holder = `Carried by ${copy.holderName ?? 'a captain'}${copy.away ? ' (left the game)' : ''}`; return row; }
  const label = busy === copy.id ? 'Taking…' : carries ? 'Swap' : 'Take';
  row.button = {label, disabled: !!closed || busy !== null, reason: closed || ''};
  return row;
}

function shopRow(type, {answer, carries, full, closed, busy, level}) {
  const sent = answer?.types?.find(item => item?.id === type.id);
  const price = isCount(sent?.price) ? sent.price : type.price, unlockWave = isCount(sent?.unlockWave) ? sent.unlockWave : type.unlockWave;
  const unlocked = typeof sent?.unlocked === 'boolean' ? sent.unlocked : (answer?.unlockWave ?? 0) >= unlockWave;
  const row = {id: type.id, name: type.name, line: type.line, mode: MODE_LINES[type.mode], price, priceText: coinText(price),
    stats: weaponStats(type.id, level), locked: !unlocked, button: {label: busy === `buy:${type.id}` ? 'Buying…' : `Buy · ${coinText(price)}`, disabled: true, reason: ''}};
  const coins = answer?.coins;
  if (!unlocked) { row.button.label = 'Locked'; row.button.reason = `${opensText(unlockWave)}.`; }
  else if (closed) row.button.reason = closed;
  else if (carries && full) row.button.reason = 'The arsenal is full: return or swap a weapon first.';
  else if (!isCount(coins) || coins < price) row.button.reason = `Not enough 🪙: you need ${coinText(price - (coins ?? 0))} more.`;
  else row.button.disabled = busy !== null;
  return row;
}

/**
 * answer: GET /api/island/arsenal (or null while loading); level: your captain level (the stats shown);
 * busy: 'buy:<type>', a copy id, 'return' or null; loading: true before the first answer.
 */
export function arsenalModel({answer = null, level = 1, busy = null, message = '', loading = false} = {}) {
  const title = 'Arsenal';
  if (!readArsenal(answer)) {
    return {title, lead: loading ? 'Opening the arsenal…' : 'The arsenal could not be opened.', stock: '', full: false,
      carry: null, back: null, rack: [], shop: [], message, coins: '',
      retry: {label: loading ? 'Opening…' : 'Try again', disabled: loading}};
  }
  const capacity = answer.capacity || CAPACITY, mine = answer.copies.find(copy => copy.you) ?? null;
  const full = answer.stored >= capacity, carries = !!mine;
  const closed = answer.waveRunning ? 'A wave is under way. Use the arsenal between waves.' : '';
  const carried = mine ? mine.weapon : 'musket', type = WEAPON_BY_ID[carried];
  const carry = {name: mine ? `${type.name} #${mine.no}` : 'Musket (standard issue)', stats: weaponStats(carried, level), line: type.line};
  const back = mine ? {label: busy === 'return' ? 'Returning…' : 'Return to the rack', disabled: !!closed || full || busy !== null,
    reason: closed || (full ? `The rack is full (${capacity} of ${capacity}): swap instead, or wait for a free slot.` : '')} : null;
  const context = {answer, carries, full, closed, busy, level};
  return {title, lead: 'The crew shares these weapons. Take one to carry it; return it for a crewmate. Every captain always has a musket.',
    stock: `Stored: ${answer.stored} of ${capacity}${full ? ' · Full' : ''}`, full, carry, back,
    rack: answer.copies.map(copy => copyRow(copy, context)),
    shop: WEAPONS.filter(item => item.price > 0).map(item => shopRow(item, context)),
    message, coins: `You have ${coinText(answer.coins)}`};
}
