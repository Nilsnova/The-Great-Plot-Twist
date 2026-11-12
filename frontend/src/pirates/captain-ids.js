// The captain's skill tree (docs/TOWER-DEFENSE.md §14) and weapon shop (§15) as plain data, with no
// imports: the room rules (src/net/live-rules.js) check a message with it, the island cards draw the tree
// and the shop from it, and captain-stats.js turns it into numbers. backend/content/islands.json and the
// check rules of supabase/migrations/20261112030000_captain_skills.sql list the same ids and prices (a
// test keeps them equal).

// §14 and docs/GAME-V3.md "Captain tree and roles": three branches, five tiers each. Tiers 2 and 4 are forks (pick
// ONE of two; the other closes), tier 5 is a capstone that needs the role of its branch. Tier n costs `cost` skill
// points and needs ANY skill of tier n − 1 of its branch.
export const BRANCHES = Object.freeze([
  Object.freeze({ id: 'marksman', name: 'Marksman', icon: '🎯' }),
  Object.freeze({ id: 'brawler', name: 'Brawler', icon: '⚔️' }),
  Object.freeze({ id: 'shipwright', name: 'Shipwright', icon: '🔨' }),
]);
// The roles: one per captain, picked once at captain level ROLE_LEVEL. A role opens the capstone of its branch.
export const ROLE_LEVEL = 3;
export const ROLES = Object.freeze([
  { id: 'medic', name: 'Medic', icon: '🩹', branch: 'brawler', line: 'You help fallen captains up in 1.2 s instead of 2, and they stand with 75% hp instead of 50%.' },
  { id: 'engineer', name: 'Engineer', icon: '🔧', branch: 'shipwright', line: 'Walls you repair or rebuild get 25% more hp, and buildings and upgrades cost you 10% less.' },
  { id: 'gunner', name: 'Gunner', icon: '🔫', branch: 'marksman', line: 'Your musket and weapon do 20% more damage and reload 15% faster.' },
].map(role => Object.freeze(role)));
export const ROLE_IDS = Object.freeze(ROLES.map(role => role.id));
export const ROLE_BY_ID = Object.freeze(Object.fromEntries(ROLES.map(role => [role.id, role])));
export const isRole = id => typeof id === 'string' && Object.hasOwn(ROLE_BY_ID, id);
/** A respec costs this many coins for every captain level (server-checked). */
export const RESPEC_PER_LEVEL = 100;
export const respecPrice = level => RESPEC_PER_LEVEL * (Number.isInteger(level) && level > 0 ? level : 1);
/** The engineer's discount on buildings and upgrades, in percent. */
export const ENGINEER_DISCOUNT = 10;

const skill = (id, branch, tier, name, line, cost, needs, extra = {}) => Object.freeze({ id, branch, tier, name, line, cost, needs: Object.freeze(needs), excludes: null, role: null, ...extra });
export const SKILLS = Object.freeze([
  skill('steady_aim', 'marksman', 1, 'Steady aim', 'Your gun does 25% more damage.', 1, []),
  skill('long_barrel', 'marksman', 2, 'Long barrel', 'Your gun reaches 3 units farther.', 2, ['steady_aim'], { excludes: 'hot_shot' }),
  skill('hot_shot', 'marksman', 2, 'Hot shot', 'Your gun does 15% more damage.', 2, ['steady_aim'], { excludes: 'long_barrel' }),
  skill('quick_hands', 'marksman', 3, 'Quick hands', 'Your gun reloads 25% faster.', 3, ['long_barrel', 'hot_shot']),
  skill('far_sight', 'marksman', 4, 'Far sight', 'Your gun reaches 4 units farther.', 3, ['quick_hands'], { excludes: 'heavy_shot' }),
  skill('heavy_shot', 'marksman', 4, 'Heavy shot', 'Your gun does 20% more damage.', 3, ['quick_hands'], { excludes: 'far_sight' }),
  skill('dead_eye', 'marksman', 5, 'Dead eye', 'Gunner only: your gun does 30% more damage and reaches 2 units farther.', 4, ['far_sight', 'heavy_shot'], { role: 'gunner' }),
  skill('cutlass', 'brawler', 1, 'Cutlass', 'Your close-quarters strike does 50% more damage.', 1, []),
  skill('sweep', 'brawler', 2, 'Sweep', 'A strike also hits every other boarder within 2 units for half damage.', 2, ['cutlass'], { excludes: 'heavy_blade' }),
  skill('heavy_blade', 'brawler', 2, 'Heavy blade', 'Your strike does 25% more damage.', 2, ['cutlass'], { excludes: 'sweep' }),
  skill('second_wind', 'brawler', 3, 'Second wind', 'Your strike reloads 30% faster.', 3, ['sweep', 'heavy_blade']),
  skill('snap_shot', 'brawler', 4, 'Snap shot', 'Your gun reloads 15% faster.', 3, ['second_wind'], { excludes: 'bruiser' }),
  skill('bruiser', 'brawler', 4, 'Bruiser', 'Your strike does 30% more damage.', 3, ['second_wind'], { excludes: 'snap_shot' }),
  skill('field_surgeon', 'brawler', 5, 'Field surgeon', 'Medic only: the captains you help up stand with all their hp.', 4, ['snap_shot', 'bruiser'], { role: 'medic' }),
  skill('quick_fix', 'shipwright', 1, 'Quick fix', 'Your wall repairs are 50% stronger.', 1, []),
  skill('long_reach', 'shipwright', 2, 'Long reach', 'You can repair walls from 2 units farther.', 2, ['quick_fix'], { excludes: 'sturdy_planks' }),
  skill('sturdy_planks', 'shipwright', 2, 'Sturdy planks', 'A rebuilt wall comes back with 55% of its strength.', 2, ['quick_fix'], { excludes: 'long_reach' }),
  skill('master_shipwright', 'shipwright', 3, 'Master shipwright', 'Your repairs are twice as strong, and a rebuilt wall comes back with 60% of its strength.', 3, ['long_reach', 'sturdy_planks']),
  skill('swift_hammer', 'shipwright', 4, 'Swift hammer', 'Your repairs are 25% stronger.', 3, ['master_shipwright'], { excludes: 'wide_arc' }),
  skill('wide_arc', 'shipwright', 4, 'Wide arc', 'You can repair walls from 2 units farther.', 3, ['master_shipwright'], { excludes: 'swift_hammer' }),
  skill('grand_engineer', 'shipwright', 5, 'Grand engineer', 'Engineer only: a rebuilt wall comes back with 80% of its strength.', 4, ['swift_hammer', 'wide_arc'], { role: 'engineer' }),
]);
export const SKILL_IDS = Object.freeze(SKILLS.map(skill => skill.id));
export const SKILL_BY_ID = Object.freeze(Object.fromEntries(SKILLS.map(skill => [skill.id, skill])));
export const MAX_SKILLS = SKILLS.length + 1; // every skill and one role (a room message carries the role with the skills)
/** The skills of the tier above a skill (any one opens it); empty for a tier 1. */
export const skillNeeds = id => SKILL_BY_ID[id]?.needs ?? [];
/** Skill points: one per two won waves (the best wave you won anywhere), minus what you spent. */
export const WAVES_PER_POINT = 2;
export const pointsEarned = wonWave => (Number.isSafeInteger(wonWave) && wonWave > 0 ? Math.floor(wonWave / WAVES_PER_POINT) : 0);
export const pointsSpent = skills => readSkills(skills).reduce((sum, id) => sum + (SKILL_BY_ID[id]?.cost ?? 0), 0);

// A room message carries the sender's skills AND role in one list (the role is one more id), so repairs, shots,
// strikes and revives all show every screen the same numbers.
const isLoadoutId = id => typeof id === 'string' && (Object.hasOwn(SKILL_BY_ID, id) || Object.hasOwn(ROLE_BY_ID, id));
/** True when a list is a short list of known, distinct skill ids with at most one role. */
export const isSkillList = list => Array.isArray(list) && list.length <= MAX_SKILLS
  && list.every(isLoadoutId) && new Set(list).size === list.length && list.filter(isRole).length <= 1;
/** The known skill ids (and at most one role) of a list, once each, in tree order. Anything else is dropped. */
export function readSkills(list) {
  if (!Array.isArray(list)) return [];
  const wanted = new Set(list.filter(id => typeof id === 'string'));
  const role = ROLE_IDS.find(id => wanted.has(id));
  return [...SKILL_IDS.filter(id => wanted.has(id)), ...(role ? [role] : [])];
}
/** The role in a skills list, or null. */
export const roleOf = list => (Array.isArray(list) ? ROLE_IDS.find(id => list.includes(id)) ?? null : null);

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
