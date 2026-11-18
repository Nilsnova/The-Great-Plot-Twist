// Short-lived range intent and confirmed own damage. Used by the wave controller; no combat rules.
const HOLD_MS = 1200, FADE_MS = 400;

export function createRangeFeedback() {
  let attempt = null, hit = '', hitAt = -Infinity;
  const reset = () => { attempt = null; hit = ''; hitAt = -Infinity; };
  return {
    reset,
    attempt(info) { attempt = { ...info }; },
    // Feed the fresh authoritative stream before cosmetic-prediction suppression.
    note(events, actorId, nowMs) {
      const hits = events.filter(event => (event.type === 'ship_hit' || event.type === 'boarder_hit')
        && event.by === `captain:${actorId}` && !event.blocked && event.damage > 0);
      if (!hits.length) return;
      const damage = Math.round(hits.reduce((sum, event) => sum + event.damage, 0) * 10) / 10;
      const enemies = new Set(hits.map(event => event.shipId ?? event.boarderId)).size;
      hit = `Hit · ${damage} damage${enemies > 1 ? ` · ${enemies} enemies` : ''}`;
      hitAt = nowMs;
    },
    update({ active, nowMs, stats, player, preview = false, held = false, blade = false, ready = false }) {
      if (!active || !player) { reset(); return null; }
      const age = nowMs - (attempt?.nowMs ?? -Infinity), hitAge = nowMs - hitAt;
      if (!preview && !held && age >= HOLD_MS + FADE_MS && hitAge >= HOLD_MS + FADE_MS) return null;
      const recent = age < HOLD_MS + FADE_MS, melee = blade || (recent && attempt.blade === true);
      const lastAge = Math.min(age, hitAge);
      return { x: player.x, z: player.z, radius: melee ? stats.sweepRadius : stats.range,
        alpha: preview || held ? 1 : Math.max(0, Math.min(1, (HOLD_MS + FADE_MS - lastAge) / FADE_MS)),
        label: melee ? 'Cutlass reach' : `${stats.name}${stats.mode === 'area' ? ' throw range' : ' range'}`,
        status: recent ? attempt.message : melee ? 'Enemy within reach' : ready ? 'Target in range' : 'No enemy in range',
        hit: hitAge < HOLD_MS + FADE_MS ? hit : '',
        point: recent ? attempt.point ?? null : null, melee, mode: stats.mode };
    },
  };
}
