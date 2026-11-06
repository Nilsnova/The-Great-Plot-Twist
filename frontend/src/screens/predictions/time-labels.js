// Times for people: the local time with the zone name, and a countdown such as "in 41 days".
// Pure, so Vitest can test it. Every function takes the current time (and, in tests, a zone) as an argument.
//
// Used by: view-model.js, presenter-model.js and adapter-fake.js.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const UNKNOWN_CLOSING = 'The closing time is not known.';

function readDate(iso) {
  if (typeof iso !== 'string') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// Intl gives the parts; the layout "Thu 17 Dec, 12:00 CET" is put together here so every browser agrees.
function localParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
    timeZone,
  });
  return Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
}

export function formatLocalTime(iso, { timeZone } = {}) {
  const date = readDate(iso);
  if (!date) return '';
  const p = localParts(date, timeZone);
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${p.timeZoneName}`;
}

export function timeOfDay(iso, { timeZone } = {}) {
  const date = readDate(iso);
  if (!date) return '';
  const p = localParts(date, timeZone);
  return `${p.hour}:${p.minute}`;
}

// "in 41 days", "in 5 hours", "in 12 minutes". The biggest unit wins and the number is rounded down,
// so the label never promises more time than there is.
export function relativeText(milliseconds) {
  if (milliseconds >= DAY) return `in ${plural(Math.floor(milliseconds / DAY), 'day')}`;
  if (milliseconds >= HOUR) return `in ${plural(Math.floor(milliseconds / HOUR), 'hour')}`;
  if (milliseconds >= MINUTE) return `in ${plural(Math.floor(milliseconds / MINUTE), 'minute')}`;
  return 'in less than a minute';
}

export function closingLabel(closesAt, nowMs, options = {}) {
  const date = readDate(closesAt);
  if (!date) return UNKNOWN_CLOSING;
  const when = formatLocalTime(closesAt, options);
  const left = date.getTime() - Number(nowMs);
  if (left <= 0) return `Staking closed ${when}`;
  return `Staking closes ${when} (${relativeText(left)})`;
}
