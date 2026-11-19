// Local, bounded observations only: no replay history, payments or simulation writes.
const KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
export const REPORT_STRUCTURE_LIMIT = 64;
const amount = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
const plus = (a, b) => Math.round((a + b) * 100) / 100;

export function reportSite(structures = []) {
  const sites = structures.filter(row => row.taken > 0 && [row.x, row.z].every(Number.isFinite));
  const priority = row => row.breaks ? (row.kind === 'wall' ? 2 : 1) : 0;
  return sites.sort((a, b) => priority(b) - priority(a) || b.taken - a.taken)[0] ?? null;
}

export function createDefenseReport() {
  let current = null, last = null;
  function begin({waveId, wave, context, recovery = false, navigation = null} = {}, defenses = []) {
    if (typeof waveId !== 'string' || !waveId || current?.waveId === waveId) return;
    if (current && !current.ended) { current.ended = true; last = current; }
    current = {waveId, wave, context, recovery, navigation: navigation && {...navigation},
      ended: false, partial: true, reason: null, heartDamage: 0,
      payout: {status: 'pending', coins: null}, structures: new Map()};
    for (const item of defenses) {
      if (current.structures.size >= REPORT_STRUCTURE_LIMIT) break;
      if (!KINDS.has(item?.kind) || typeof item.id !== 'string') continue;
      current.structures.set(item.id, {id: item.id, kind: item.kind, x: item.x, z: item.z,
        instanceId: typeof item.instanceId === 'string' ? item.instanceId : null,
        taken: 0, dealt: 0, breaks: 0, broken: false});
    }
  }
  // Called once per ordered local simulation batch. Rebuild a replay with clear/begin,
  // never with content hashes: two identical hits can both be real.
  function events(batch = []) {
    if (!current || current.ended) return;
    for (const event of batch) {
      if (event?.type === 'island_damaged') current.heartDamage = plus(current.heartDamage, amount(event.damage));
      const target = current.structures.get(event?.wallId ?? event?.towerId);
      if (target && ['wall_damaged', 'tower_damaged'].includes(event.type)) {
        target.taken = plus(target.taken, amount(event.damage));
        if (event.hp === 0 && amount(event.damage) && !target.broken) target.breaks++;
        if (typeof event.hp === 'number' && event.hp >= 0) target.broken = event.hp === 0;
      }
      if (target && ['wall_rebuilt', 'wall_repaired', 'tower_rebuilt', 'tower_repaired'].includes(event.type) && event.hp > 0) target.broken = false;
      const attacker = current.structures.get(event?.by);
      if (attacker && ['ship_hit', 'boarder_hit'].includes(event.type)) attacker.dealt = plus(attacker.dealt, amount(event.damage));
      if (event?.type === 'wave_ended') {
        current.ended = true; current.reason = event.reason; last = current;
        break;
      }
    }
  }
  function payout(waveId, {status, coins = null, survived}) {
    const report = current?.waveId === waveId ? current : last?.waveId === waveId ? last : null;
    if (!report || report.payout.status === 'confirmed') return;
    if (status === 'confirmed' && (!Number.isSafeInteger(coins) || coins < 0)) return;
    if (status === 'confirmed' && typeof survived === 'boolean') {
      report.survived = survived;
      report.ended = true;
      if (report === current) last = report;
    }
    report.payout = {status, coins: status === 'confirmed' ? coins : null};
  }
  return {begin, events, payout,
    clear() { current = null; last = null; },
    read(context) {
      if (!last || last.context !== context) return null;
      return {...last, navigation: last.navigation && {...last.navigation}, payout: {...last.payout},
        structures: [...last.structures.values()].map(item => ({...item}))};
    },
  };
}
