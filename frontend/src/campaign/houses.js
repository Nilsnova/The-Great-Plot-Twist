// The house roles (docs/GAME-V3.md, "Houses") as plain data: a house keeps its loot bonus and, from level 2,
// picks one role on its card, free, changeable between waves, like a tower skill (src/campaign/tech.js) but
// without research. The role rides on the house's spot (`spot.spec`), so every screen reads it from the island
// answer. The ids repeat backend/server/island/catalogue.py (HOUSE_ROLES) and the check rule of
// supabase/migrations/20261112090000_house_roles.sql; tests keep them equal. The numbers of each role live in
// the sim (CONFIG.houses in src/pirates/sim.js). No DOM here.
export const ROLE_LEVEL = 2;
export const ROLES = Object.freeze({
  barracks: Object.freeze({name: 'Barracks', line: 'A militia fighter walks out each wave and fights boarders near the house.'}),
  tavern: Object.freeze({name: 'Tavern', line: 'Captains near it heal 2 hp a second. Helping a captain up costs 25% less.'}),
  workshop: Object.freeze({name: 'Workshop', line: 'Walls near it repair 30% faster, and a broken one mends by itself.'}),
});
export const ROLE_IDS = Object.freeze(Object.keys(ROLES));
// How far each role reaches from its house, in world units: the Barracks' guard, the Tavern's healing, the
// Workshop's walls. The sim reads these (CONFIG.houses); the card's range ring shows them.
export const ROLE_RADIUS = Object.freeze({barracks: 8, tavern: 6, workshop: 10});
export const roleRadius = role => ROLE_RADIUS[role] ?? 0;
export const isRole = id => typeof id === 'string' && Object.hasOwn(ROLES, id);
// The role a building may carry: only a house's, else null.
export const readRole = (kind, spec) => (kind === 'house' && isRole(spec) ? spec : null);
// The role a house acts with: from level 2 only (a level-1 house cannot have one, the server keeps it so).
export const activeRole = item => (item?.kind === 'house' && (item.level ?? 1) >= ROLE_LEVEL ? readRole('house', item.spec) : null);
