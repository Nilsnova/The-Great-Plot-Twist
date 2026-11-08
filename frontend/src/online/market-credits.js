// Only current public market answers supply these optional Settings credits; no request is made here.
import {findPanelServices} from './panel-services.js';

const held = new WeakMap();
const weakKey = value => value !== null && ['object', 'function'].includes(typeof value);
const text = value => typeof value === 'string' ? value : null;

function https(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? value : null;
  } catch { return null; }
}

export function cacheMarketCredits(lease, credits, current) {
  if (!weakKey(lease) || !Array.isArray(credits) || typeof current !== 'function' || current() !== true) return false;
  const rows = credits.filter(credit => credit !== null && typeof credit === 'object' && !Array.isArray(credit))
    .filter(credit => typeof credit.text === 'string')
    .map(credit => ({text: credit.text, href: https(credit.href),
      licenceText: text(credit.licenceText), licenceHref: https(credit.licenceHref)}));
  if (current() !== true) return false;
  held.set(lease, rows);
  return true;
}

export function readMarketCredits(session) {
  const lease = findPanelServices(session);
  return lease ? (held.get(lease) ?? []).map(row => ({...row})) : [];
}
