// The Harbor stakes: 5, 10 or 25 coins and nothing else (BUILD-PLAN 3.2). Pure: no DOM, no fetch.
// offeredStakes keeps only the sizes the server accepts, so a button never sends a stake the server
// refuses as too small or too big. poolGain is a display estimate only: the server pays.
import {HARBOR_STAKE_PLACED} from '../ui/quest-events.js';

export const STAKES = Object.freeze([5, 10, 25]);
// The bus event after the server accepted a stake: {type, kind: 'market' | 'match' | 'fortune', stake}.
// The quest strip (lane U) listens for it; the name comes from src/ui/quest-events.js.
export const STAKE_EVENT = HARBOR_STAKE_PLACED;

const whole = value => (Number.isSafeInteger(value) ? value : null);

export function offeredStakes(rules) {
  const min = whole(rules?.minStake) ?? 1, max = whole(rules?.maxStake) ?? Infinity;
  return STAKES.filter(stake => stake >= min && stake <= max);
}

// What a winning stake gains from a shared pool, before the server rounds: your share of the coins
// on the other sides, after the cut. 0 when nobody is on the other side yet (then the stake comes back).
export function poolGain({stake, mine = 0, total = 0, cutPercent = 0}) {
  if (!Number.isSafeInteger(stake) || stake <= 0) return 0;
  const own = Math.max(0, Number(mine) || 0), others = Math.max(0, (Number(total) || 0) - own);
  if (others === 0) return 0;
  const keep = 1 - Math.min(100, Math.max(0, Number(cutPercent) || 0)) / 100;
  return Math.floor((stake / (own + stake)) * others * keep);
}
