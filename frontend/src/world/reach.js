// Walk up and press E (owner, 12 Nov): a card opens only when the player stands inside the building's zone.
// Plain rules, no DOM. The zones come from the place (island/spots.js), the nearest one is the one prompt.
import { inZone } from './zones.js';

export const WALK_CLOSER = 'Walk closer';
export const HINT_MS = 1800;

/**
 * A click or tap on the thing with this zone id. {open: true} when the player stands in its zone (or when
 * the position or the zone is unknown, which is not ours to refuse); else {open: false, hint, zone}.
 */
export function clickVerdict(player, zones, id) {
  const zone = (zones ?? []).find(item => item.id === id);
  if (!zone || !player) return { open: true, zone: zone ?? null };
  return inZone(player, zone) ? { open: true, zone } : { open: false, hint: WALK_CLOSER, zone };
}

/**
 * What a press of E does this frame. zone: the nearest zone in range (findZone) or null; waveAction: the
 * wave's own prompt (fire, repair, rebuild or revive); reviving: a revive hold is running. A fallen teammate
 * in range (and any other wave action) owns E, so a tap near a building never opens a card, starts or cancels
 * a revive. Returns 'open' (open the zone's card), 'wave' (the wave takes the key) or 'none'.
 */
export function eDecision({ zone, waveAction = null, reviving = false } = {}) {
  if (waveAction || reviving) return 'wave';
  return zone ? 'open' : 'none';
}

/** The prompt's words above a building: "E · Upgrade Cannon". */
export const promptLine = label => (label ? `E · ${label}` : '');
