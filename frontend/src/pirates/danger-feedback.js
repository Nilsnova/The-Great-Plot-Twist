// Chooses one actionable battle warning from live simulation state and fresh damage events.
// Used by the wave controller; presentation only, with caller-supplied time and no combat mutations.
import { SHIP_FIRE } from './ship-fire.js';

const HIT_MS = 3000, INCOMING_SECONDS = 1.5, HEART_NEAR = 5, CRITICAL_SHARE = .3;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const critical = (hp, maxHp) => maxHp > 0 && hp / maxHp <= CRITICAL_SHARE;

function nearest(items, point) {
  let best = null, bestDistance = Infinity;
  for (const item of items) {
    const gap = distance(item, point);
    if (gap < bestDistance) { best = item; bestDistance = gap; }
  }
  return best;
}

function sourceOf(event, state, fallback) {
  return state.boarders?.find(item => item.id === event.boarderId)
    ?? state.ships?.find(item => item.id === event.shipId) ?? fallback;
}

function incomingShots(state) {
  return (state.shipShots ?? []).filter(shot => shot.impactAt >= state.time
    && shot.impactAt - state.time <= INCOMING_SECONDS);
}

function captainThreat(state, player, actorId, recent, shots) {
  const foes = (state.boarders ?? []).filter(item => item.hp > 0 && item.foe === actorId);
  const foe = nearest(foes, player);
  if (foe) return { title: 'Pirates attacking you', line: 'Slash nearby pirates or move away.', point: foe };
  const incoming = shots.find(shot => distance({ x: shot.toX, z: shot.toZ }, player) <= SHIP_FIRE.splash.radius);
  if (incoming) return { title: 'Incoming fire, move!', line: 'Move out of the impact area.', point: { x: incoming.toX, z: incoming.toZ } };
  if (recent) return { title: 'You are taking damage', line: 'Move away from enemy attacks.', point: sourceOf(recent.event, state, player) };
  return null;
}

function heartThreat(state, recent, shots) {
  const heart = state.heart;
  if (!heart) return null;
  if (recent) return { title: 'Heart taking damage', line: 'Defend the island heart!', point: heart, hit: true };
  if (shots.some(shot => shot.target === 'heart')) return { title: 'Heart under fire', line: 'Stop the ships firing at the heart.', point: heart };
  const near = (state.boarders ?? []).some(item => item.hp > 0 && !item.foe && !item.wallId && !item.towerId
    && item.state === 'walking' && distance(item, heart) <= HEART_NEAR);
  return near ? { title: 'Pirates near the heart', line: 'Stop them before they reach it.', point: heart } : null;
}

function warningFor(key, threat, isCritical = false) {
  let title = threat.title;
  if (isCritical) title = key === 'captain-critical' ? 'Captain in danger!' : 'Heart in danger!';
  return { key, title,
    line: threat.line, x: threat.point.x, z: threat.point.z, critical: isCritical };
}

function chooseWarning(state, own, captain, heart) {
  if (captain && critical(own?.hp, own?.maxHp)) return warningFor('captain-critical', captain, true);
  if (heart && critical(state.islandHp, state.maxIslandHp)) return warningFor('heart-critical', heart, true);
  if (heart?.hit) return warningFor('heart-hit', heart);
  if (captain) return warningFor('captain-threat', captain);
  return heart ? warningFor('heart-threat', heart) : null;
}

export function createDangerFeedback() {
  let captainHit = null, heartHit = null;
  const heard = new Set();
  const clearHits = () => { captainHit = null; heartHit = null; };
  return {
    // Only the controller's fresh events belong here; historical catch-up and predicted art are excluded.
    note(events, actorId, nowMs) {
      for (const event of events ?? []) {
        if (!(event.damage > 0)) continue;
        if (event.type === 'captain_hit' && event.captainId === actorId) captainHit = { event, actorId, until: nowMs + HIT_MS };
        else if (event.type === 'island_damaged') heartHit = { event, until: nowMs + HIT_MS };
      }
    },
    update({ state, player, actorId, nowMs, active = true }) {
      const own = state?.party?.find(item => item.id === actorId);
      if (!active || state?.phase !== 'running' || own?.down || own?.present === false) {
        clearHits();
        return { warning: null, sound: false };
      }
      if (captainHit && (captainHit.until <= nowMs || captainHit.actorId !== actorId)) captainHit = null;
      if (heartHit && heartHit.until <= nowMs) heartHit = null;
      const shots = incomingShots(state);
      const captain = player ? captainThreat(state, player, actorId, captainHit, shots) : null;
      const heart = heartThreat(state, heartHit, shots);
      // Hidden feedback does not end an episode. Only an active observation of a cleared threat does.
      if (!captain) heard.delete('captain');
      if (!heart) heard.delete('heart');
      const warning = chooseWarning(state, own, captain, heart);
      const family = warning?.key.startsWith('captain-') ? 'captain' : 'heart';
      const sound = !!warning && !heard.has(family);
      // Consume the episode even if audio is muted/locked or the anti-burst guard suppresses this cue.
      if (warning) heard.add(family);
      return { warning, sound };
    },
    reset() { clearHits(); heard.clear(); },
  };
}
