// The Tech hub and the tower skills (docs/GAME-V3.md section 5) as plain data: the four research branches
// (a tower kind each) and their three tiers, researched per island with coins by any member.
//   tier 1  unlocks the kind's skills: every tower of that kind may pick one (rapid, heavy, chain, ...)
//   tier 2  a choice of two bonuses for every tower of that kind; the island picks one, the other closes
//   tier 3  a choice of two capstone skills; the island picks one, then a tower of that kind may pick it
// A team may change a tier-2 or tier-3 choice for that tier's price again. The ids, names and prices repeat
// backend/content/islands.json (research.branches); tests/campaign/campaign.test.js keeps them equal. The
// numbers of each skill live in the sim (CONFIG.specs and CONFIG.research in src/pirates/sim.js), so every
// screen fights the same island. No DOM here.
const freeze = Object.freeze;
export const TOP_TIER = 3;
export const BRANCHES = freeze([
  freeze({branch: 'cannon', name: 'Cannon skills', price: 180, prices: freeze([180, 360, 630]), specs: freeze(['rapid', 'heavy', 'chain']),
    tier2: freeze(['rapid_2', 'long_guns']), tier3: freeze(['broadside', 'grapeshot'])}),
  freeze({branch: 'mortar', name: 'Mortar skills', price: 220, prices: freeze([220, 440, 770]), specs: freeze(['cluster', 'fire_pot', 'long_range']),
    tier2: freeze(['quick_fuse', 'heavy_shells']), tier3: freeze(['shockwave', 'inferno'])}),
  freeze({branch: 'wall', name: 'Wall skills', price: 120, prices: freeze([120, 240, 420]), specs: freeze(['stone', 'spiked', 'quick_mend']),
    tier2: freeze(['mason_drill', 'thick_walls']), tier3: freeze(['bastion', 'thorns'])}),
  freeze({branch: 'watchtower', name: 'Watchtower skills', price: 160, prices: freeze([160, 320, 560]), specs: freeze(['spotter', 'signal_fire']),
    tier2: freeze(['lookout_drill', 'high_tower']), tier3: freeze(['eagle_eye', 'war_drums'])}),
]);
export const BRANCH_BY_ID = freeze(Object.fromEntries(BRANCHES.map(item => [item.branch, item])));
// The skills a tower may pick: tier 1's three (or two), and the two capstones of tier 3 (only the one its island chose).
export const SPECS = freeze({
  rapid: freeze({branch: 'cannon', name: 'Rapid', line: 'Reloads 30% faster.'}),
  heavy: freeze({branch: 'cannon', name: 'Heavy shot', line: '60% more damage, a little slower.'}),
  chain: freeze({branch: 'cannon', name: 'Chain shot', line: 'A hit slows the ship by 40% for 3 s.'}),
  cluster: freeze({branch: 'mortar', name: 'Cluster', line: 'Each shell bursts into 3 smaller blasts.'}),
  fire_pot: freeze({branch: 'mortar', name: 'Fire pot', line: 'The ground burns for 4 s where it lands.'}),
  long_range: freeze({branch: 'mortar', name: 'Long range', line: '12 more range.'}),
  stone: freeze({branch: 'wall', name: 'Stone', line: 'Twice the strength.'}),
  spiked: freeze({branch: 'wall', name: 'Spiked', line: 'Boarders get hurt while they hack it.'}),
  quick_mend: freeze({branch: 'wall', name: 'Quick mend', line: 'Repairs go twice as fast.'}),
  spotter: freeze({branch: 'watchtower', name: 'Spotter', line: 'Towers near it do 15% more damage.'}),
  signal_fire: freeze({branch: 'watchtower', name: 'Signal fire', line: 'Ships show 5 s earlier.'}),
  // Tier 3, the capstones (one per island and kind).
  broadside: freeze({branch: 'cannon', name: 'Broadside', line: 'Hits 20% harder, and every 4th shot fires two balls.', capstone: true}),
  grapeshot: freeze({branch: 'cannon', name: 'Grapeshot', line: 'A shot at a boarder hits every boarder near it.', capstone: true}),
  shockwave: freeze({branch: 'mortar', name: 'Shockwave', line: 'Blasts throw boarders back towards the sea.', capstone: true}),
  inferno: freeze({branch: 'mortar', name: 'Inferno', line: 'Every shell sets a wide patch of ground on fire.', capstone: true}),
  bastion: freeze({branch: 'wall', name: 'Bastion', line: '50% more strength, and it mends itself slowly.', capstone: true}),
  thorns: freeze({branch: 'wall', name: 'Thorns', line: 'Boarders who hack it get badly hurt.', capstone: true}),
  eagle_eye: freeze({branch: 'watchtower', name: 'Eagle eye', line: 'Towers near it reach 20% further.', capstone: true}),
  war_drums: freeze({branch: 'watchtower', name: 'War drums', line: 'Towers near it reload 10% faster.', capstone: true}),
});
// Tier 2: a bonus for every tower of the kind (the island picks one of the two).
export const BONUSES = freeze({
  rapid_2: freeze({branch: 'cannon', name: 'Rapid II', line: 'Every cannon reloads 10% faster, a Rapid one about 37% in all.'}),
  long_guns: freeze({branch: 'cannon', name: 'Long guns', line: 'Every cannon reaches 15% further.'}),
  quick_fuse: freeze({branch: 'mortar', name: 'Quick fuse', line: 'Every mortar reloads 12% faster.'}),
  heavy_shells: freeze({branch: 'mortar', name: 'Heavy shells', line: 'Every mortar blast is 20% wider.'}),
  mason_drill: freeze({branch: 'wall', name: 'Mason drill', line: 'Repairs on every wall go 50% faster.'}),
  thick_walls: freeze({branch: 'wall', name: 'Thick walls', line: 'Every wall has 15% more strength.'}),
  lookout_drill: freeze({branch: 'watchtower', name: 'Lookout drill', line: 'Spotter gives 25% more damage, Signal fire warns 8 s early.'}),
  high_tower: freeze({branch: 'watchtower', name: 'High tower', line: 'The watchtower lends every tower 30% more range.'}),
});
export const SPEC_IDS = freeze(Object.keys(SPECS));
export const BONUS_IDS = freeze(Object.keys(BONUSES));
export const isCapstone = spec => SPECS[spec]?.capstone === true;
export const branchOf = spec => SPECS[spec]?.branch ?? null;
// A spec a building of `kind` may carry, else null (an unknown or another kind's spec is no spec).
export const readSpec = (kind, spec) => (typeof spec === 'string' && SPECS[spec]?.branch === kind ? spec : null);
// A tier-2 bonus of `kind`, else null.
export const readBonus = (kind, bonus) => (typeof bonus === 'string' && BONUSES[bonus]?.branch === kind ? bonus : null);
// The two options of a tier (2 or 3) of a branch, or [].
export const optionsOf = (branch, tier) => (tier === 2 ? BRANCH_BY_ID[branch]?.tier2 : tier === 3 ? BRANCH_BY_ID[branch]?.tier3 : null) ?? [];
export const optionName = id => SPECS[id]?.name ?? BONUSES[id]?.name ?? id;
export const optionLine = id => SPECS[id]?.line ?? BONUSES[id]?.line ?? '';
export const specKinds = freeze(BRANCHES.map(item => item.branch));
// One branch's research on an island, read from an answer's {tier, tier2, tier3} (anything else: tier 0).
export function readTier(branch, sent) {
  const tier = Number.isSafeInteger(sent?.tier) ? Math.max(0, Math.min(TOP_TIER, sent.tier)) : 0;
  const tier2 = tier >= 2 && optionsOf(branch, 2).includes(sent?.tier2) ? sent.tier2 : null;
  const tier3 = tier >= 3 && optionsOf(branch, 3).includes(sent?.tier3) ? sent.tier3 : null;
  return freeze({tier, tier2, tier3});
}
