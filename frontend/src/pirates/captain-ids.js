// The captain's skill tree (docs/TOWER-DEFENSE.md §14) and weapon shop (§15) as plain data, with no
// imports: the room rules (src/net/live-rules.js) check a message with it, the island cards draw the tree
// and the shop from it, and captain-stats.js turns it into numbers. backend/content/islands.json and the
// check rules of supabase/migrations/20261112030000_captain_skills.sql list the same ids and prices (a
// test keeps them equal).

// §14: three branches, three tiers each. Tier n costs n skill points and needs tier n − 1 of its branch.
export const BRANCHES = Object.freeze([
  Object.freeze({ id: 'marksman', name: 'Marksman', icon: '🎯' }),
  Object.freeze({ id: 'brawler', name: 'Brawler', icon: '⚔️' }),
  Object.freeze({ id: 'shipwright', name: 'Shipwright', icon: '🔨' }),
]);
export const SKILLS = Object.freeze([
  { id: 'steady_aim', branch: 'marksman', tier: 1, name: 'Steady aim', line: 'Your gun does 25% more damage.' },
  { id: 'long_barrel', branch: 'marksman', tier: 2, name: 'Long barrel', line: 'Your gun reaches 3 units farther.' },
  { id: 'quick_hands', branch: 'marksman', tier: 3, name: 'Quick hands', line: 'Your gun reloads 25% faster.' },
  { id: 'cutlass', branch: 'brawler', tier: 1, name: 'Cutlass', line: 'Your close-quarters strike does 50% more damage.' },
  { id: 'sweep', branch: 'brawler', tier: 2, name: 'Sweep', line: 'A strike also hits every other boarder within 2 units for half damage.' },
  { id: 'second_wind', branch: 'brawler', tier: 3, name: 'Second wind', line: 'Your strike reloads 30% faster.' },
  { id: 'quick_fix', branch: 'shipwright', tier: 1, name: 'Quick fix', line: 'Your wall repairs are 50% stronger.' },
  { id: 'long_reach', branch: 'shipwright', tier: 2, name: 'Long reach', line: 'You can repair walls from 2 units farther.' },
  { id: 'master_shipwright', branch: 'shipwright', tier: 3, name: 'Master shipwright', line: 'Your repairs are twice as strong, and a rebuilt wall comes back with 60% of its strength.' },
].map(skill => Object.freeze({ ...skill, cost: skill.tier })));
export const SKILL_IDS = Object.freeze(SKILLS.map(skill => skill.id));
export const SKILL_BY_ID = Object.freeze(Object.fromEntries(SKILLS.map(skill => [skill.id, skill])));
export const MAX_SKILLS = SKILLS.length;
/** The skill a skill needs first (tier − 1 of its branch), or null for a tier 1. */
export const skillNeeds = id => {
  const skill = SKILL_BY_ID[id];
  return skill && skill.tier > 1 ? SKILLS.find(item => item.branch === skill.branch && item.tier === skill.tier - 1).id : null;
};
/** Skill points: one per two won waves (the best wave you won anywhere), minus what you spent. */
export const WAVES_PER_POINT = 2;
export const pointsEarned = wonWave => (Number.isSafeInteger(wonWave) && wonWave > 0 ? Math.floor(wonWave / WAVES_PER_POINT) : 0);
export const pointsSpent = skills => readSkills(skills).reduce((sum, id) => sum + SKILL_BY_ID[id].cost, 0);

/** True when a list is a short list of known, distinct skill ids (what a room message may carry). */
export const isSkillList = list => Array.isArray(list) && list.length <= MAX_SKILLS
  && list.every(id => typeof id === 'string' && Object.hasOwn(SKILL_BY_ID, id)) && new Set(list).size === list.length;
/** The known skill ids of a list, once each, in tree order. Anything else (or a non-list) is dropped. */
export function readSkills(list) {
  if (!Array.isArray(list)) return [];
  const wanted = new Set(list.filter(id => typeof id === 'string'));
  return SKILL_IDS.filter(id => wanted.has(id));
}

// §15: the weapon shop. Bought once with coins, one equipped at a time; the equipped one sets HOW the
// captain shoots. The numbers scale the musket's level table: damage ×, range +, reload ×.
//   single  one ship (a tap, F for the nearest, or the ship nearest the aim point)
//   cone    up to `targets` ships inside a cone of `cone` degrees towards the aim point
//   pierce  the ship and the next one behind it on the same line (within pierceDepth, pierceWidth wide)
//   area    a thrown bomb that bursts at the aim point after its flight: every ship within `radius`
export const WEAPONS = Object.freeze([
  { id: 'musket', name: 'Musket', price: 0, unlockWave: 0, mode: 'single', damage: 1, range: 0, reload: 1,
    line: 'One ship at a time. Steady and true.' },
  { id: 'pistols', name: 'Pistols', price: 60, unlockWave: 2, mode: 'single', damage: .5, range: -4, reload: .4,
    line: 'Two pistols: short range, very fast, light shots.' },
  { id: 'blunderbuss', name: 'Blunderbuss', price: 120, unlockWave: 4, mode: 'cone', damage: .8, range: -5, reload: 1.6,
    targets: 3, cone: 50, line: 'A spray of shot: hits up to 3 ships in front of you. Short range, slow.' },
  { id: 'long_rifle', name: 'Long rifle', price: 200, unlockWave: 6, mode: 'pierce', damage: 1.8, range: 8, reload: 1.8,
    pierceDepth: 8, pierceWidth: 1.5, line: 'Reaches 8 units farther, hits hard and goes through to a second ship. Slow.' },
  { id: 'fire_bombs', name: 'Fire bombs', price: 300, unlockWave: 10, mode: 'area', damage: 1.5, range: 0, reload: 2.4,
    radius: 3, flight: .9, flightPerUnit: .02, line: 'Thrown on an arc: bursts where you aim and burns every ship within 3 units. Slow.' },
].map(weapon => Object.freeze(weapon)));
export const WEAPON_IDS = Object.freeze(WEAPONS.map(weapon => weapon.id));
export const WEAPON_BY_ID = Object.freeze(Object.fromEntries(WEAPONS.map(weapon => [weapon.id, weapon])));
export const DEFAULT_WEAPON = 'musket';
export const isWeapon = id => typeof id === 'string' && Object.hasOwn(WEAPON_BY_ID, id);
export const readWeapon = id => (isWeapon(id) ? id : DEFAULT_WEAPON);
