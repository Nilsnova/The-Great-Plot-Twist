// The Tech hub and the tower skills (docs/GAME-V3.md section 5) as plain data: the four research branches
// (a tower kind each, researched once per island with coins by any member) and the skills a tower of that
// kind may pick once its branch is researched. The ids, names and prices repeat backend/content/islands.json
// (research.branches); tests/campaign/campaign.test.js keeps them equal. The numbers of each skill live in
// the sim (CONFIG.specs in src/pirates/sim.js), so every screen fights the same island. No DOM here.
export const BRANCHES = Object.freeze([
  Object.freeze({branch: 'cannon', name: 'Cannon skills', price: 180, specs: Object.freeze(['rapid', 'heavy', 'chain'])}),
  Object.freeze({branch: 'mortar', name: 'Mortar skills', price: 220, specs: Object.freeze(['cluster', 'fire_pot', 'long_range'])}),
  Object.freeze({branch: 'wall', name: 'Wall skills', price: 120, specs: Object.freeze(['stone', 'spiked', 'quick_mend'])}),
  Object.freeze({branch: 'watchtower', name: 'Watchtower skills', price: 160, specs: Object.freeze(['spotter', 'signal_fire'])}),
]);
export const BRANCH_BY_ID = Object.freeze(Object.fromEntries(BRANCHES.map(item => [item.branch, item])));
export const SPECS = Object.freeze({
  rapid: Object.freeze({branch: 'cannon', name: 'Rapid', line: 'Reloads 30% faster.'}),
  heavy: Object.freeze({branch: 'cannon', name: 'Heavy shot', line: '60% more damage, a little slower.'}),
  chain: Object.freeze({branch: 'cannon', name: 'Chain shot', line: 'A hit slows the ship by 40% for 3 s.'}),
  cluster: Object.freeze({branch: 'mortar', name: 'Cluster', line: 'Each shell bursts into 3 smaller blasts.'}),
  fire_pot: Object.freeze({branch: 'mortar', name: 'Fire pot', line: 'The ground burns for 4 s where it lands.'}),
  long_range: Object.freeze({branch: 'mortar', name: 'Long range', line: '12 more range.'}),
  stone: Object.freeze({branch: 'wall', name: 'Stone', line: 'Twice the strength.'}),
  spiked: Object.freeze({branch: 'wall', name: 'Spiked', line: 'Boarders get hurt while they hack it.'}),
  quick_mend: Object.freeze({branch: 'wall', name: 'Quick mend', line: 'Repairs go twice as fast.'}),
  spotter: Object.freeze({branch: 'watchtower', name: 'Spotter', line: 'Towers near it do 15% more damage.'}),
  signal_fire: Object.freeze({branch: 'watchtower', name: 'Signal fire', line: 'Ships show 5 s earlier.'}),
});
export const SPEC_IDS = Object.freeze(Object.keys(SPECS));
export const branchOf = spec => SPECS[spec]?.branch ?? null;
// A spec a building of `kind` may carry, else null (an unknown or another kind's spec is no spec).
export const readSpec = (kind, spec) => (typeof spec === 'string' && SPECS[spec]?.branch === kind ? spec : null);
export const specKinds = Object.freeze(BRANCHES.map(item => item.branch));
