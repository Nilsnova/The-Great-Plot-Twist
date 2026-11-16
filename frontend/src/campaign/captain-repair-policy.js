// New recovery policy gates Captain repair skills and calculates the approved between-wave rate factor.
// Used by Captain stats, Tech UI and the recovery policy parity tests; it does not heal structures.

export const RETIRED_CAPTAIN_SKILL_IDS = Object.freeze([
  'quick_fix', 'long_reach', 'sturdy_planks', 'master_shipwright', 'swift_hammer', 'wide_arc', 'grand_engineer',
]);

const RETIRED_SKILLS = new Set(RETIRED_CAPTAIN_SKILL_IDS);
const STRUCTURE_KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
const WALL_SPEC_FACTORS = Object.freeze({stone: 1, spiked: 1, quick_mend: 2, bastion: 3, thorns: 1});
const WALL_RESEARCH_FACTORS = Object.freeze({mason_drill: 1.5, thick_walls: 1});
const RECOVERY_RESEARCH_LINES = Object.freeze({
  quick_mend: 'This wall mends twice as fast between waves.',
  mason_drill: 'Automatic wall repair for this island runs 50% faster.',
  bastion: 'Bastion adds 50% more HP and repairs it three times faster between waves when equipped.',
});
const MAX_CARPENTERS = 2;
const MAX_WORKSHOP_BONUS_PERCENT = 50;
const WORKSHOP_BONUS_PERCENT = 30;

/** A removed repair-only skill is disabled for recovery v1 and remains recognized by legacy waves. */
export function isRetiredCaptainSkill(id, recoveryVersion = 1) {
  return recoveryVersion === 1 && RETIRED_SKILLS.has(id);
}

/** Recovery-v1 research uses the new between-wave wording while legacy text stays accurate. */
export function recoveryTechLine(id, legacyLine, recoveryVersion = 0) {
  return recoveryVersion === 1 ? RECOVERY_RESEARCH_LINES[id] ?? legacyLine : legacyLine;
}

/** Captain tree data for a new-policy view keeps every available non-repair choice. */
export function captainBranchesForPolicy(branches, recoveryVersion = 0) {
  if (recoveryVersion !== 1) return branches;
  return branches.map(branch => {
    const nodes = branch.nodes.filter(item => !isRetiredCaptainSkill(item.id, recoveryVersion));
    const tiers = branch.tiers.map(tier => ({...tier, nodes: tier.nodes.filter(item => !isRetiredCaptainSkill(item.id, recoveryVersion))}))
      .filter(tier => tier.nodes.length);
    const start = nodes.some(item => item.id === branch.start) ? branch.start : nodes[0]?.id ?? null;
    return {...branch, nodes, tiers, start};
  }).filter(branch => branch.nodes.length);
}

/** Each wall equips one valid Wall skill; recovery choices affect the rate, other skills do not. */
export function isAllowedWallRecoveryChoice({wallSpec = null, wallResearch = null} = {}) {
  const validSpec = wallSpec === null || Object.hasOwn(WALL_SPEC_FACTORS, wallSpec);
  const validResearch = wallResearch === null || Object.hasOwn(WALL_RESEARCH_FACTORS, wallResearch);
  return validSpec && validResearch;
}

/** The approved rate factor applies between waves; Wall Tech only affects walls, never towers. */
export function recoveryRateFactor({ownerCarpenters = 0, nearbyWorkshops = 0, structureKind, wallSpec = null,
  wallResearch = null, isBetweenWaves = true} = {}) {
  if (!Number.isSafeInteger(ownerCarpenters) || !Number.isSafeInteger(nearbyWorkshops)
    || ownerCarpenters < 0 || nearbyWorkshops < 0) {
    throw new TypeError('Carpenter and Workshop counts must be nonnegative safe integers.');
  }
  if (typeof isBetweenWaves !== 'boolean') throw new TypeError('isBetweenWaves must be a boolean.');
  if (!STRUCTURE_KINDS.has(structureKind)) throw new RangeError('Structure kind cannot recover health.');
  if (!isAllowedWallRecoveryChoice({wallSpec, wallResearch})) throw new RangeError('Wall recovery choice is unsupported.');
  if (!isBetweenWaves) return 0;

  const carpenters = Math.max(0, Math.min(MAX_CARPENTERS, ownerCarpenters));
  const workshopBonus = Math.min(MAX_WORKSHOP_BONUS_PERCENT, Math.max(0, nearbyWorkshops) * WORKSHOP_BONUS_PERCENT);
  const carpenterFactor = 1 + carpenters;
  const workshopFactor = 1 + workshopBonus / 100;
  const isWall = structureKind === 'wall';
  const specFactor = isWall && wallSpec !== null ? WALL_SPEC_FACTORS[wallSpec] : 1;
  const researchFactor = isWall && wallResearch !== null ? WALL_RESEARCH_FACTORS[wallResearch] : 1;
  return carpenterFactor * workshopFactor * specFactor * researchFactor;
}
