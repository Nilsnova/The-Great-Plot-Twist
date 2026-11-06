// Plain formatting for the Exchange panel: coins, prices, percent and times. No DOM, no game rules.
// Used by: words.js, result-words.js and view-models.js. Times show in the player's own time zone.
import { formatCoins } from '../../ui/kit/logic.js';

export const UNKNOWN = 'unknown';
const DEFAULT_DECIMALS = 2;
const MAX_DECIMALS = 8; // the most the server keeps for a price
const MAX_PRICE = 1e15; // beyond this a number no longer keeps its decimals

const caches = { number: new Map(), time: new Map(), day: new Map() };
function cached(cache, key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export const coinsText = value => (Number.isSafeInteger(value) ? formatCoins(value) : UNKNOWN);
export const coinsLabel = value => (Number.isSafeInteger(value) ? `${formatCoins(value)} ${Math.abs(value) === 1 ? 'coin' : 'coins'}` : UNKNOWN);
export function signedCoinsText(value) {
  if (!Number.isSafeInteger(value)) return UNKNOWN;
  return value > 0 ? `+${formatCoins(value)}` : formatCoins(value);
}

const validDecimals = value => (Number.isInteger(value) && value >= 0 && value <= MAX_DECIMALS ? value : DEFAULT_DECIMALS);
const isNumber = value => typeof value === 'number' && Number.isFinite(value);
function fixed(value, decimals) {
  const format = cached(caches.number, decimals, () => new Intl.NumberFormat('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  return format.format(value);
}

// "76,159.21 USDT": the decimals and currency belong to the company.
export function priceText(value, { priceDecimals, currency } = {}) {
  if (!isNumber(value)) return UNKNOWN;
  const number = fixed(value, validDecimals(priceDecimals));
  return currency ? `${number} ${currency}` : number;
}

export const percentText = value => (isNumber(value) ? `${fixed(value, 2)} %` : UNKNOWN);

function zoneFormat(cache, zone, options) {
  return cached(cache, zone ?? '', () => {
    try { return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: zone }); }
    catch { return new Intl.DateTimeFormat('en-GB', options); } // an unknown zone name: use the browser's own
  });
}
const toDate = iso => {
  const date = typeof iso === 'string' && iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

// "12:05" in the time zone of the player.
export function timeText(iso, { timeZone } = {}) {
  const date = toDate(iso);
  return date ? zoneFormat(caches.time, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date) : UNKNOWN;
}

function localDay(date, timeZone) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' };
  const parts = Object.fromEntries(zoneFormat(caches.day, timeZone, options).formatToParts(date).map(part => [part.type, part.value]));
  return { number: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000, weekday: parts.weekday };
}

// "14:30", "tomorrow 14:30", "yesterday 20:59" or "Monday 14:30". Days are counted where the player is.
// Without a usable `now`, or with `alwaysDay`, the weekday is always named.
export function momentText(iso, { timeZone, now, alwaysDay = false } = {}) {
  const date = toDate(iso);
  if (!date) return UNKNOWN;
  const time = timeText(iso, { timeZone });
  const when = localDay(date, timeZone);
  const nowDate = toDate(now);
  const apart = nowDate ? when.number - localDay(nowDate, timeZone).number : null;
  if (!alwaysDay && apart === 0) return time;
  if (!alwaysDay && apart === 1) return `tomorrow ${time}`;
  if (!alwaysDay && apart === -1) return `yesterday ${time}`;
  return `${when.weekday} ${time}`;
}

// A zero point shown for the player is rounded toward the entry price (spec 9.3): up for a rising
// position, down for a falling one. It works on the digits, so 76.15 never turns into 76.16.
export function roundTowardEntry(value, decimals, side) {
  if (!isNumber(value) || value < 0 || value >= MAX_PRICE) return null;
  const places = validDecimals(decimals);
  const [whole, fraction] = value.toFixed(9).split('.');
  let scaled = BigInt(whole + fraction.slice(0, places));
  if (side === 'rising' && /[1-9]/.test(fraction.slice(places))) scaled += 1n;
  const digits = scaled.toString().padStart(places + 1, '0');
  return Number(places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits);
}

export function zeroPointText(value, side, format = {}) {
  return priceText(roundTowardEntry(value, validDecimals(format.priceDecimals), side), format);
}
