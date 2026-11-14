// The wall card's Repair and Rebuild (tasks T29-T32 and T47, decision D039, proposed), as a pure
// function on top of buildCardModel (card-model.js). No DOM. Only used while the server's flag
// wall_recovery is on: without a wall answer the card stays exactly as before.
//
// wall: one row of GET /api/island/walls ({spot, level, health, recoversAt, repairCost}) or null.
// A damaged wall (health 1-99) gets "Repair · 🪙 n", a destroyed one (0) "Rebuild · 🪙 n" instead of
// the Upgrade button: an upgrade is refused until it is whole again (T47), so the card never offers
// one. The health and the time until it mends by itself stand in the `upgrade` box the card already
// draws. During a wave the button waits for the break (in the wave, E at the wall repairs it).
import {coinText} from './card-model.js';

const MINUTE_MS = 60000;

/** "Mends by itself in 6 min" (at least 1), or '' without a timer. */
export function mendsText(recoversAt, now) {
  const at = Date.parse(recoversAt ?? '');
  if (!Number.isFinite(at) || !Number.isFinite(now)) return '';
  return `Mends by itself in ${Math.max(1, Math.ceil((at - now) / MINUTE_MS))} min`;
}

/** The card of a damaged or destroyed wall; any other card comes back unchanged. */
export function withWallRecovery(model, {wall = null, coins = null, busy = false, battle = false, now = Date.now()} = {}) {
  if (!model?.built || model.kind !== 'wall' || !wall || !(wall.health < 100)) return model;
  const destroyed = wall.health <= 0, price = wall.repairCost;
  const out = {...model, mode: 'repair', repair: destroyed ? 'rebuild' : 'repair', disabled: true, reason: ''};
  out.upgrade = {label: destroyed ? 'Destroyed' : `Damaged · health ${wall.health}%`,
    stats: [destroyed ? 'Rebuild it at its level' : 'Repair it to full health', mendsText(wall.recoversAt, now)].filter(Boolean).join(' · ')};
  out.button = busy === 'repair' ? (destroyed ? 'Rebuilding…' : 'Repairing…') : `${destroyed ? 'Rebuild' : 'Repair'} · ${coinText(price)}`;
  out.soon = model.maxLevel > model.level ? 'Repair it before you upgrade it.' : model.soon;
  if (busy) return out;
  if (battle) out.reason = 'You can repair it between waves. During a wave, press E at the wall.';
  else if (coins === null) out.reason = 'Your coins are still loading.';
  else if (!Number.isSafeInteger(price) || coins < price) out.reason = `Not enough 🪙: you need ${coinText((price ?? 0) - coins)} more.`;
  else out.disabled = false;
  return out;
}
