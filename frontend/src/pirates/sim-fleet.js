// The fleet of a wave before the dice (sim.js): crews, warships, the campaign's tiers, the size and the hp /
// speed / damage curve of a wave, how hard it is (threatOf) and what a revive costs. Pure, no state, no dice
// (shuffle takes the wave's own random stream).

import { CONFIG } from './sim-config.js';
import { clamp, round2, readDefenses } from './sim-read.js';

/** How many boarders one ship of `kind` carries on `wave`. */
export function crewFor(kind, wave) {
  const B = CONFIG.boarding, base = CONFIG.ships[kind]?.crew ?? 0;
  const early = Math.floor(Math.max(0, Math.min(wave, B.crewLateFrom - 1) - 1) / B.crewEvery);
  const late = wave >= B.crewLateFrom ? 1 + Math.floor((wave - B.crewLateFrom) / B.crewLateEvery) : 0;
  return base ? Math.min(B.crewMax, base + early + late) : 0;
}
/** The warships of a wave: 1 on every 5th wave, 2 on every 10th, plus regular ones late in the game. */
export function warshipsFor(wave, boss = wave % CONFIG.boss.every === 0) {
  const B = CONFIG.boss, K = CONFIG.curve;
  const bosses = boss ? (wave % B.doubleEvery === 0 ? 2 : 1) : 0;
  const regular = wave >= K.warshipsFrom ? 1 + Math.floor((wave - K.warshipsFrom) / K.warshipsEvery) : 0;
  return { bosses, regular };
}
/** The coins a revive costs on `wave` (paid by the reviver, checked by the server): 20 + 5 × wave, 25% less
 * (rounded down, as wave_revive() does) on an island with a Tavern. */
export function revivePrice(wave, { tavern = false } = {}) {
  const R = CONFIG.health.revive, n = Number.isInteger(wave) && wave > 0 ? Math.min(wave, CONFIG.maxWave) : 1;
  const price = R.base + R.perWave * n;
  return tavern ? Math.floor(price * (100 - CONFIG.houses.tavern.revive) / 100) : price;
}
/** The houses of an island's defenses that act with a role (level 2 and up): [{id, role, level, x, z}] in id order. */
export function houseRoles(defenses) {
  return readDefenses(defenses).filter(item => item.kind === 'house' && item.level >= CONFIG.houses.level && item.spec)
    .map(item => ({ id: item.id, role: item.spec, level: item.level, x: item.x, z: item.z }));
}
/** True when the island has a Tavern (the revive discount of wave_revive()). */
export const hasTavern = defenses => houseRoles(defenses).some(item => item.role === 'tavern');

/** The share of a tier at `wave` (0 before it begins). */
export function tierShare(tier, wave) {
  return wave < tier.from ? 0 : Math.min(tier.max, tier.share + tier.grow * (wave - tier.from));
}
/** The pirate types of a wave, without the dice (docs/GAME-V3.md §4): {raiders, ironclads, brutes} shares and the
 * boss kind and hp multiplier. */
export function tierFor(wave) {
  const T = CONFIG.tiers;
  const bossHp = T.bossHp.reduce((value, [from, k]) => (wave >= from ? k : value), 1);
  return { raiders: tierShare(T.raiders, wave), ironclads: tierShare(T.ironclads, wave), brutes: tierShare(T.brutes, wave),
    gunboats: tierShare(T.gunboats, wave), boss: wave >= T.dreadnoughtsFrom ? 'dreadnought' : 'warship', bossHp, final: wave >= T.final };
}
/**
 * The ships of a wave before the dice (the plan of createWave shuffles them): {count, kinds (the escorts and
 * regular warships), bosses, tier}. The campaign's tiers: some sloops sail as raiders (12+), some brigs as
 * ironclads (30+), with the same list length, so the dice of the waves before a tier are untouched. Gunboats (16+) are
 * added to the list, so the boarders of a wave do not change.
 */
export function fleetOf(wave, { shipFactor = 1, boss = wave % CONFIG.boss.every === 0 } = {}) {
  const C = CONFIG, count = clamp(Math.round(fleetSize(wave) * shipFactor), 1, C.fleet.max);
  const brigs = wave >= C.fleet.brigFromWave
    ? Math.round(count * Math.min(C.fleet.brigMaxShare, (wave - C.fleet.brigFromWave + 1) * C.fleet.brigShare)) : 0;
  const { bosses, regular } = warshipsFor(wave, boss);
  const escorts = Math.max(0, count - regular), tier = tierFor(wave);
  const sloops = escorts - Math.min(brigs, escorts), brigsIn = Math.min(brigs, escorts);
  const raiders = Math.round(sloops * tier.raiders), ironclads = Math.round(brigsIn * tier.ironclads);
  const kinds = [...Array(sloops - raiders).fill('sloop'), ...Array(raiders).fill('raider'),
    ...Array(brigsIn - ironclads).fill('brig'), ...Array(ironclads).fill('ironclad'), ...Array(Math.min(regular, count)).fill('warship')];
  // Gunboats (16+) sail on top of the fleet, so the boarders of a wave stay what they were (a gunboat has no crew):
  // a small share of the escorts, at least one.
  if (tier.gunboats > 0) kinds.push(...Array(Math.max(1, Math.round(escorts * tier.gunboats))).fill('gunboat'));
  return { count, kinds, bosses, tier };
}
/**
 * How hard a wave is, as one number (docs/GAME-V3.md §4, the scaling test): every ship's hull and every
 * boarder's hp, weighted by how fast they come and how hard they hit. Pure, no dice.
 */
export function threatOf(wave, { boss = wave % CONFIG.boss.every === 0 } = {}) {
  const C = CONFIG, curve = curveFor(wave), { kinds, bosses, tier } = fleetOf(wave, { boss });
  const brute = tier.brutes, boarderHp = C.boarding.hp * curve.hp * (1 + brute * (C.tiers.brutes.hp - 1));
  const one = (kind, bossy) => {
    const stats = C.ships[kind], hp = stats.hp * curve.hp * (bossy && kind === 'warship' ? tier.bossHp : 1);
    return (hp * (stats.speed * curve.speed) ** .5 + crewFor(kind, wave) * boarderHp) * curve.damage;
  };
  let total = kinds.reduce((sum, kind) => sum + one(kind, false), 0);
  for (let i = 0; i < bosses; i++) total += one(tier.boss, true);
  if (tier.final) total += one('redtide', true);
  return Math.round(total);
}
/** The fleet's size before the weather: steep for the first waves, then slower. */
export function fleetSize(wave) {
  const F = CONFIG.fleet;
  return F.base + F.perWave * (Math.min(wave, F.steepUntil) - 1) + F.latePerWave * Math.max(0, wave - F.steepUntil);
}
/** Ship hp, speed and damage multipliers for a wave number. */
export function curveFor(wave) {
  const K = CONFIG.curve;
  return {
    hp: round2(1 + K.hpSteps.reduce((sum, [from, perWave], i) =>
      sum + perWave * Math.max(0, Math.min(wave, K.hpSteps[i + 1]?.[0] ?? Infinity) - from), 0)),
    speed: round2(Math.min(K.speedMax, 1 + K.speedPerWave * (wave - 1))),
    damage: round2(1 + K.damagePerWave * Math.max(0, Math.min(wave, K.damageLateFrom) - K.damageFrom)
      + K.damageLatePerWave * Math.max(0, wave - K.damageLateFrom)),
  };
}

export function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
