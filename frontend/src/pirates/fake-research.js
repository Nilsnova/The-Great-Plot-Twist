// The fake server's crew, captain and research routes (fake-server.js): hiring, the captain's level, skills, roles and
// respec, the Tech hub's research, tower specialisations and upgrade trees. A closure over `srv`, the fake server's setup.
import { CREW, unlockWave, CAPTAIN } from '../island/td-rules.js';
import { SKILL_BY_ID, ROLE_BY_ID, readSkills, isRole, ROLE_LEVEL, respecPrice } from './captain-ids.js';
import { BRANCH_BY_ID, TOP_TIER, optionsOf, optionName, SPECS, isCapstone, skillPrice } from '../campaign/tech.js';
import { waveOf } from '../campaign/index.js';
import { ROLES as HOUSE_ROLES, ROLE_LEVEL as HOUSE_ROLE_LEVEL } from '../campaign/houses.js';
import { TOWER_TREES, TREE_LEVEL, treeStep, TREE_STEPS } from './tower-trees.js';
import { invalid, refuse, lockedMessage, researchOf, canonicalSpot, kindOfSpot, ISLAND_RULES } from './fake-rules.js';

export function createResearchRoutes(srv, api) {
  const { uid, me, world, view, allowed, learnt, skillsOf, waveGuard, BETWEEN_WAVES, visited, visitedView, unlocking,
    islandSpots } = srv;
  return {
    async hire({ crew, actionUid } = {}) {
      if (!Object.hasOwn(CREW, crew ?? '') || !uid(actionUid)) invalid('Send gunner, carpenter, lookout or guard and an action id.');
      const player = me(), island = world.islands.get(player.code), info = CREW[crew];
      if (player.actions.has(`hire:${actionUid}`)) return view();
      if (!allowed(island).crew[crew]) refuse(409, 'locked', lockedMessage(unlockWave({ crew })));
      if (island.crew[crew] >= info.max) refuse(409, 'crew_full', `You already have ${info.max === 1 ? 'a' : info.max} ${info.name.toLowerCase()}${info.max === 1 ? '' : 's'}.`);
      if (player.coins < info.price) refuse(409, 'insufficient_funds', `A ${info.name.toLowerCase()} costs ${info.price} coins. You need more coins.`);
      player.coins -= info.price; island.crew[crew]++; player.actions.set(`hire:${actionUid}`, true);
      return view();
    },
    async captain({ actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send an action id.');
      const player = me(), island = world.islands.get(player.code), level = island.captain ?? 1;
      if (player.actions.has(`captain:${actionUid}`)) return view();
      if (level >= CAPTAIN.price.length) refuse(409, 'max_level', 'Your captain is at the highest level.');
      if (allowed(island).captain < level + 1) refuse(409, 'locked', lockedMessage(unlockWave({ captain: level + 1 })));
      if (player.coins < CAPTAIN.price[level]) refuse(409, 'insufficient_funds', `Level ${level + 1} costs ${CAPTAIN.price[level]} coins. You need more coins.`);
      player.coins -= CAPTAIN.price[level]; island.captain = level + 1; player.actions.set(`captain:${actionUid}`, true);
      return view();
    },
    async learnSkill({ skill, actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send the skill and an action id.');
      if (!Object.hasOwn(SKILL_BY_ID, skill ?? '')) refuse(400, 'bad_skill', 'There is no such skill.');
      const player = me(), island = world.islands.get(player.code), known = learnt(island), entry = SKILL_BY_ID[skill];
      if (player.actions.has(`skill:${actionUid}`)) return view();
      if (known.includes(skill)) refuse(409, 'known', `You know ${entry.name} already.`);
      if (entry.excludes && known.includes(entry.excludes)) refuse(409, 'closed', `You chose ${SKILL_BY_ID[entry.excludes].name}, so ${entry.name} is closed. Respec to change.`);
      if (entry.needs.length && !entry.needs.some(id => known.includes(id))) refuse(409, 'locked', `Learn ${entry.needs.map(id => SKILL_BY_ID[id].name).join(' or ')} first.`);
      if (entry.role && island.role !== entry.role) refuse(409, 'wrong_role', island.role ? `Only a ${ROLE_BY_ID[entry.role].name} can learn ${entry.name}.` : `Pick the ${ROLE_BY_ID[entry.role].name} role first.`);
      if (skillsOf(player, island).points < entry.cost) refuse(409, 'no_points', 'Win new waves to earn skill points.');
      island.skills = readSkills([...known, skill]); player.actions.set(`skill:${actionUid}`, true);
      return view();
    },
    async pickRole({ role } = {}) {
      if (!isRole(role)) refuse(400, 'bad_role', 'There is no such role.');
      const island = world.islands.get(me().code);
      if (island.role === role) return view();
      if (island.role) refuse(409, 'role_known', 'You have a role already. Respec to change it.');
      if ((island.captain ?? 1) < ROLE_LEVEL) refuse(409, 'locked', `Reach captain level ${ROLE_LEVEL} first.`);
      island.role = role;
      return view();
    },
    async respec({ actionUid } = {}) {
      if (!uid(actionUid)) invalid('Send an action id.');
      const player = me(), island = world.islands.get(player.code), price = respecPrice(island.captain ?? 1);
      if (player.actions.has(`respec:${actionUid}`)) return view();
      if (!learnt(island).length && !island.role) refuse(409, 'nothing_to_reset', 'You have no skills or role to reset.');
      waveGuard(island, BETWEEN_WAVES);
      if (player.coins < price) refuse(409, 'insufficient_funds', `A respec costs ${price} coins. You need more coins.`);
      player.coins -= price; island.skills = []; island.role = null; player.actions.set(`respec:${actionUid}`, true);
      return view();
    },
    // GAME-V3.md §5, §5.1: one research step for the island (yours, or the game of `code`), with coins: tier 1 of
    // a branch, or one of the two options of tier 2 or 3 (change: true switches from the other one, at the tier's
    // price again; switching tier 3 takes the old capstone off every tower that picked it).
    async research({ branch, actionUid, code, tier = 1, choice = null, change = false } = {}) {
      if (typeof branch !== 'string' || !uid(actionUid)) invalid('Send the research and an action id.');
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code), player = me();
      const entry = BRANCH_BY_ID[branch];
      if (!entry) refuse(400, 'bad_research', 'There is no such research.');
      if (!Number.isSafeInteger(tier) || tier < 1) refuse(400, 'bad_research', 'There is no such research.');
      if (tier > TOP_TIER) refuse(409, 'top_tier', `${entry.name} have ${TOP_TIER} tiers.`);
      if (tier === 1 ? choice !== null : !optionsOf(branch, tier).includes(choice)) refuse(400, 'bad_research', 'Pick one of the two options.');
      if (player.actions.has(`research:${actionUid}`)) return island === mine ? view() : visitedView(island);
      waveGuard(island, BETWEEN_WAVES);
      const item = tier === 1 ? 'tech_hub' : `research_${tier}`;
      if (unlocking && island.waveBest < waveOf(item)) refuse(409, 'locked', lockedMessage(waveOf(item)));
      island.research = island.research ?? [];
      const now = researchOf(island, branch), key = `tier${tier}`, price = entry.prices[tier - 1];
      if (tier === 1 && now.tier >= 1) refuse(409, 'known', `${entry.name} are researched on this island already.`);
      if (tier > 1 && now.tier < tier - 1) refuse(409, 'needs_tier', `Research tier ${tier - 1} of ${entry.name.toLowerCase()} first.`);
      if (tier > 1 && now[key] === choice) refuse(409, 'known', `Your crew chose ${optionName(choice)} already.`);
      if (tier > 1 && now[key] && !change) refuse(409, 'closed', `Closed: your crew chose ${optionName(now[key])}.`);
      if (player.coins < price) refuse(409, 'insufficient_funds', `This costs ${price} coins. You need more coins.`);
      player.coins -= price; player.actions.set(`research:${actionUid}`, true);
      if (tier === 1) island.research.push(branch);
      else {
        island.tiers = { ...(island.tiers ?? {}), [branch]: { ...now, tier: Math.max(now.tier, tier), [key]: choice } };
        if (tier === 3 && now.tier3 && island.specs instanceof Map) for (const [spot, spec] of island.specs) if (spec === now.tier3) island.specs.delete(spot);
      }
      return island === mine ? view() : visitedView(island);
    },
    // A tower picks one skill of its researched kind, paid once with the clicker's coins (D051: skillPrice; a
    // repeated actionUid pays nothing, the skill it has already is free). A house of level 2 or more picks a role
    // the same way (GAME-V3.md "Houses"), free and with no research.
    async specialise({ spot, spec, code, actionUid } = {}) {
      if (typeof spot !== 'string' || typeof spec !== 'string' || (actionUid !== undefined && !uid(actionUid))) invalid('Send the spot and the skill.');
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code), player = me();
      spot = canonicalSpot(spot);
      if (!islandSpots.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
      if (!island.built.has(spot)) refuse(409, 'not_built', 'Build something on this spot first.');
      const info = SPECS[spec], kind = island.kinds?.get(spot) ?? kindOfSpot(spot);
      if (Object.hasOwn(HOUSE_ROLES, spec)) {
        if (kind !== 'house') refuse(422, 'wrong_kind', `A ${ISLAND_RULES.kinds[kind][0].toLowerCase()} cannot take a house role.`);
        if ((island.levels?.get(spot) ?? 1) < HOUSE_ROLE_LEVEL) refuse(409, 'house_level', 'Raise this house to level 2 first.');
        if (!(island.specs instanceof Map)) island.specs = new Map();
        island.specs.set(spot, spec);
        return island === mine ? view() : visitedView(island);
      }
      if (!info) refuse(400, 'bad_spec', 'There is no such tower skill.');
      if (info.branch !== kind) refuse(422, 'wrong_kind', `A ${ISLAND_RULES.kinds[kind][0].toLowerCase()} cannot learn that skill.`);
      if (!(island.research ?? []).includes(kind)) refuse(409, 'not_researched', `Research ${BRANCH_BY_ID[kind].name.toLowerCase()} at the Tech hub first.`);
      if (isCapstone(spec) && researchOf(island, kind).tier3 !== spec) refuse(409, 'not_researched', `Pick ${SPECS[spec].name} at tier 3 of the Tech hub first.`);
      if (!(island.specs instanceof Map)) island.specs = new Map();
      const done = () => (island === mine ? view() : visitedView(island));
      if (island.specs.get(spot) === spec) return done(); // the skill it has already: free
      if (actionUid === undefined) refuse(409, 'reload', 'Tower skills cost coins now. Reload the page to see the prices.');
      if (player.actions.has(`towerskill:${actionUid}`)) return done();
      const price = skillPrice(kind, spec);
      if (player.coins < price) refuse(409, 'insufficient_funds', `${info.name} costs ${price} coins. You need more coins.`);
      player.coins -= price; player.actions.set(`towerskill:${actionUid}`, true);
      island.specs.set(spot, spec);
      return done();
    },
    // D055: one tier of a level-5 tower's upgrade tree, paid once with the clicker's coins (a repeated actionUid pays
    // nothing). The same refusals as the server (rules.check_tree), in its order.
    async towerTree({ spot, path, tier, actionUid, code } = {}) {
      if (typeof spot !== 'string' || !uid(actionUid)) invalid('Send the spot, the path, the tier and an action id.');
      if (!['a', 'b'].includes(path) || ![1, 2, 3].includes(tier)) refuse(400, 'bad_tree', 'There is no such step in a tower\'s tree.');
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code), player = me();
      const done = () => (island === mine ? view() : visitedView(island));
      if (player.actions.has(`towertree:${actionUid}`)) return done();
      spot = canonicalSpot(spot);
      if (!islandSpots.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot.');
      if (!island.built.has(spot)) refuse(409, 'not_built', 'Build something on this spot first.');
      const kind = island.kinds?.get(spot) ?? kindOfSpot(spot), tree = TOWER_TREES[kind];
      if (!tree) refuse(422, 'no_tree', `A ${ISLAND_RULES.kinds[kind][0].toLowerCase()} has no upgrade tree.`);
      if ((island.levels?.get(spot) ?? 1) < TREE_LEVEL) refuse(409, 'needs_level', `Raise it to level ${TREE_LEVEL} first.`);
      if (!(island.trees instanceof Map)) island.trees = new Map();
      const now = { a: 0, b: 0, ...(island.trees.get(spot) ?? {}) }, step = treeStep(now, path, tier), name = `${tree[path].name} ${'I'.repeat(tier)}`;
      if (step === 'known') refuse(409, 'known', `${name} is bought already.`);
      if (step === 'needs_tier') refuse(409, 'needs_tier', `Buy ${tree[path].name} ${'I'.repeat(tier - 1)} first.`);
      if (step === 'closed') refuse(409, 'closed', `Closed: ${tree[path === 'a' ? 'b' : 'a'].name} is past tier 1.`);
      const opens = waveOf(TREE_STEPS[tier - 1]);
      if (unlocking && island.waveBest < opens) refuse(409, 'locked', lockedMessage(opens));
      const price = tree.prices[tier - 1];
      if (player.coins < price) refuse(409, 'insufficient_funds', `${name} costs ${price} coins. You need more coins.`);
      player.coins -= price; player.actions.set(`towertree:${actionUid}`, true);
      island.trees.set(spot, { ...now, [path]: tier });
      return done();
    },
  };
}
