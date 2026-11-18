// Browser-local range intent for the wave controller's own captain. Never populated from teammate events.
// Impacts stay in the existing visual renderer.
const HOLD_MS = 1200, FADE_MS = 400;

export function createRangeFeedback() {
  let attempt = null;
  const reset = () => { attempt = null; };
  return {
    reset,
    attempt(info) { attempt = { ...info }; },
    update({ active, nowMs, stats, player, preview = false, held = false, blade = false, ready = false }) {
      if (!active || !player) { reset(); return null; }
      const age = nowMs - (attempt?.nowMs ?? -Infinity);
      if (!preview && !held && age >= HOLD_MS + FADE_MS) return null;
      const recent = age < HOLD_MS + FADE_MS, melee = blade || (recent && attempt.blade === true);
      return { x: player.x, z: player.z, radius: melee ? stats.sweepRadius : stats.range,
        alpha: preview || held ? 1 : Math.max(0, Math.min(1, (HOLD_MS + FADE_MS - age) / FADE_MS)),
        label: melee ? 'Cutlass reach' : `${stats.name}${stats.mode === 'area' ? ' throw range' : ' range'}`,
        status: recent ? attempt.message : melee ? 'Enemy within reach' : ready ? 'Target in range' : 'No enemy in range',
        point: recent ? attempt.point ?? null : null, melee, mode: stats.mode };
    },
  };
}
