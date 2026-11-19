// Nominal attack stats shared by wave setup and the island's next-level comparison.
import { CONFIG } from './sim-config.js';
import { attackRanges, bonusOf, finite, isAttackTower, lookoutsOf, lookoutsWith, readDefenses, reach, round2, skillOf } from './sim-read.js';
import { treeStats } from './tower-trees.js';

export const clusterBlastDamage = (shellDamage, cluster) => round2(shellDamage * cluster.damage);

// Nominal stats for a complete accepted layout. Sight, targets in motion and other wave state are applied later.
export function effectiveAttackTowers(defenses, lookouts, gunnerCount) {
  const C = CONFIG, { towerBonus, rangeFor } = attackRanges(lookouts);
  const spotters = lookoutsWith(lookouts, 'spotter'), drummers = lookoutsWith(lookouts, 'war_drums');
  const boost = Math.max(1, ...lookouts.map(item => C.levels.watchtower[item.level - 1].boost ?? 1));
  const towers = defenses.filter(item => isAttackTower(item.kind)).map(item => {
    const stats = C.levels[item.kind][item.level - 1], spec = skillOf(item, C);
    const range = rangeFor(item, stats.range, spec.range ?? 0);
    const spotted = reach(spotters, item)?.skill.damage ?? 1, drums = reach(drummers, item)?.skill.reload ?? 1;
    // D055: a tower without a tree keeps the old sums exactly (no factor is applied at all).
    const tree = item.tree ? treeStats(item.kind, item.tree) : null, grown = (value, key) => (tree ? value * tree[key] : value);
    const radius = item.kind === 'mortar' ? round2(grown(C.mortar.radius * bonusOf(item, 'radius', C), 'radius')) : undefined;
    const damage = round2(grown(stats.damage * (spec.damage ?? 1) * spotted * boost, 'damage'));
    const baseReload = round2(grown(stats.reload * C.pace.reload * (spec.reload ?? 1) * bonusOf(item, 'reload', C) * drums, 'reload'));
    return { ...item, skill: spec, damage, baseReload, range, manned: false,
      ...(radius !== undefined ? { radius } : {}),
      ...(item.kind === 'harpoon' ? { slow: { slow: tree ? round2(stats.slow + tree.slow) : stats.slow, seconds: tree ? round2(stats.seconds + tree.seconds) : stats.seconds } } : {}),
      ...(item.kind === 'swivel' ? { pellets: stats.pellets + (tree?.pellets ?? 0) } : {}) };
  });
  const strength = tower => tower.damage / tower.baseReload * (tower.kind === 'mortar' ? 1.5 : 1);
  // The strongest cannon or mortar gets the Gunner, with level and then id breaking ties.
  towers.filter(item => item.kind === 'cannon' || item.kind === 'mortar')
    .sort((a, b) => strength(b) - strength(a) || b.level - a.level || (a.id < b.id ? -1 : 1))
    .slice(0, gunnerCount).forEach(tower => { tower.manned = true; tower.baseReload = round2(tower.baseReload * C.crew.gunner.reload); });
  return { towerBonus, towers };
}

/**
 * Compare one next level on the currently accepted island layout. The caller supplies the current
 * selection, crew and rules from the same island response. This projects nominal automatic fire
 * for a future wave, without estimating weather-dependent sight, total damage or a purchase.
 */
export function previewDefenseUpgrade({ defenses, selectedId, currentLevel, gunnerCount, defensesV2 } = {}) {
  if (!Array.isArray(defenses) || typeof selectedId !== 'string' || !selectedId
    || !Number.isInteger(currentLevel) || currentLevel < 1
    || !Number.isInteger(gunnerCount) || gunnerCount < 0 || gunnerCount > CONFIG.crew.gunner.max
    || typeof defensesV2 !== 'boolean') return null;
  const selected = defenses.find(item => item?.id === selectedId);
  if (!selected || !isAttackTower(selected.kind) || selected.level !== currentLevel
    || currentLevel >= CONFIG.levels[selected.kind].length || (selected.kind === 'culverin' && !defensesV2)
    || !finite(selected.x) || !finite(selected.z)) return null;

  const current = readDefenses(defenses, { culverin: defensesV2 });
  const next = readDefenses(defenses.map(item => item === selected ? { ...item, level: currentLevel + 1 } : item),
    { culverin: defensesV2 });
  const lookouts = lookoutsOf(current);
  const before = effectiveAttackTowers(current, lookouts, gunnerCount).towers;
  const after = effectiveAttackTowers(next, lookouts, gunnerCount).towers;
  const afterById = new Map(after.map(tower => [tower.id, tower]));
  const readStats = ({ level, range, damage, baseReload, manned, spec, skill }) =>
    ({ level, range, damage: spec === 'cluster' ? clusterBlastDamage(damage, skill) : damage, reloadSeconds: baseReload, manned });
  const attack = before.find(tower => tower.id === selectedId);
  const gunnerChanges = before.filter(tower => tower.id !== selectedId && tower.manned !== afterById.get(tower.id).manned)
    .map(tower => ({ id: tower.id, manned: afterById.get(tower.id).manned }));
  const kind = attack.kind;
  return { id: selectedId, kind, damageUnit: kind === 'swivel' ? 'pellet' : kind === 'mortar' ? 'blast' : 'projectile',
    before: readStats(attack), after: readStats(afterById.get(selectedId)), gunnerChanges };
}
