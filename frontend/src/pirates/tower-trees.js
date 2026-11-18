// Tower upgrade trees (decision D055): after level 5 a cannon, mortar, harpoon tower, culverin or swivel-gun nest
// grows on in a small tree of TWO paths with THREE tiers each, like Bloons TD but simpler:
//   path a  always makes the tower fire faster (reload ×);
//   path b  makes it hit harder in its own way (damage, blast radius, a stronger slow, more pellets).
// One path may go to tier 3; once a path passes tier 1 the other stays at tier 1 at most ("the Bloons rule").
// A tier needs level 5, the tier before it on its path, the island's best won wave of the campaign step tree_1,
// tree_2 or tree_3 (src/campaign/campaign.json: 20, 35, 45) and coins, paid once by the player who clicks.
// Pure data and two small functions, no DOM: the sim (sim.js) reads the numbers, the cards (src/island/tree-model.js)
// the names, glyphs and prices. Prices and waves repeat backend/content/tower_trees.json (a test keeps them equal).
//
// Numbers: `reload`, `damage` and `radius` multiply the level-5 numbers (and every skill or research on top); `slow`
// and `seconds` add to a harpoon's slow, `pellets` to a swivel nest's shot. The value of the tier REACHED counts
// (tier 2 replaces tier 1, they do not stack). A tower with no tree (a: 0, b: 0) fights exactly as before.

const f = Object.freeze;
const FASTER = f([f({reload: .92}), f({reload: .85}), f({reload: .78})]); // −8%, −15%, −22%
const HARDER = f([f({damage: 1.1}), f({damage: 1.2}), f({damage: 1.3})]);

export const TREE_KINDS = f(['cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
export const TREE_TIERS = 3;      // tiers per path
export const TREE_OTHER_MAX = 1;  // the other path's highest tier once one path is past tier 1
export const TREE_LEVEL = 5;      // the level a tower needs before its tree opens
export const TREE_STEPS = f(['tree_1', 'tree_2', 'tree_3']); // the campaign ids that open tier 1, 2 and 3
export const TREE_PATHS = f(['a', 'b']);

// Per kind: the two paths (name, glyph, the numbers of tiers 1 to 3), the price of tiers 1 to 3 (the same for
// both paths of a kind) and, for the card's "every 0.70 s → 0.64 s", `shot`: a level-5 tower's seconds between
// shots (CONFIG.levels[kind][4].reload × CONFIG.pace.reload of sim.js; a test keeps them equal).
// A cannon tree in full (3 + 1) costs 🪙 1,000 + 2,200 + 4,800 + 1,000 = 9,000.
export const TOWER_TREES = f({
  cannon: f({prices: f([1000, 2200, 4800]), shot: .7,
    a: f({id: 'drill', name: 'Drill', icon: '⏩', tiers: FASTER}),
    b: f({id: 'powder', name: 'Powder', icon: '💥', tiers: HARDER})}),
  mortar: f({prices: f([1200, 2600, 5600]), shot: 1.54,
    a: f({id: 'loaders', name: 'Loaders', icon: '⏱️', tiers: FASTER}),
    b: f({id: 'big_shells', name: 'Big shells', icon: '🎇', tiers: f([f({damage: 1.08, radius: 1.1}), f({damage: 1.15, radius: 1.2}), f({damage: 1.22, radius: 1.3})])})}),
  harpoon: f({prices: f([700, 1500, 3200]), shot: 1.26,
    a: f({id: 'winch', name: 'Winch', icon: '⚙️', tiers: FASTER}),
    b: f({id: 'barbs', name: 'Barbs', icon: '🪝', tiers: f([f({slow: .05, seconds: .5}), f({slow: .1, seconds: 1}), f({slow: .15, seconds: 1.5})])})}),
  culverin: f({prices: f([1400, 2800, 6000]), shot: 1.96,
    a: f({id: 'rammers', name: 'Rammers', icon: '🧹', tiers: FASTER}),
    b: f({id: 'long_bore', name: 'Long bore', icon: '🎯', tiers: HARDER})}),
  swivel: f({prices: f([900, 2000, 4400]), shot: .49,
    a: f({id: 'oiled', name: 'Oiled', icon: '🛢️', tiers: FASTER}),
    b: f({id: 'scatter', name: 'Scatter', icon: '✴️', tiers: f([f({pellets: 1}), f({pellets: 2}), f({pellets: 3})])})}),
});

const whole = value => (Number.isInteger(value) && value >= 0 && value <= TREE_TIERS ? value : 0);

/** A tower's tree as {a, b} (0 to 3 each), or null for none: a kind without a tree, a missing or broken value,
 *  or one that breaks the Bloons rule (both paths past tier 1) is no tree. */
export function readTree(kind, tree) {
  // Recovery snapshots stored before fix/playtest-1117 carry the tree as [a, b]: read it the same.
  if (Array.isArray(tree)) tree = tree.length === 2 ? {a: tree[0], b: tree[1]} : null;
  if (!TOWER_TREES[kind] || !tree || typeof tree !== 'object') return null;
  const a = whole(tree.a), b = whole(tree.b);
  if (Math.min(a, b) > TREE_OTHER_MAX || (a === 0 && b === 0)) return null;
  return {a, b};
}

/** The numbers a tree gives a tower of `kind`: {reload, damage, radius (multipliers), slow, seconds, pellets (added)}. */
export function treeStats(kind, tree) {
  const out = {reload: 1, damage: 1, radius: 1, slow: 0, seconds: 0, pellets: 0};
  const read = readTree(kind, tree);
  if (!read) return out;
  for (const path of TREE_PATHS) {
    const reached = read[path];
    if (!reached) continue;
    for (const [key, value] of Object.entries(TOWER_TREES[kind][path].tiers[reached - 1])) {
      if (key === 'reload' || key === 'damage' || key === 'radius') out[key] *= value;
      else out[key] += value;
    }
  }
  return out;
}

/** Whether `path` may go to `tier` from `tree` by the shape of the tree alone (level, waves and coins aside):
 *  'ok' | 'known' (bought) | 'needs_tier' (the tier before first) | 'closed' (the other path is past tier 1, or
 *  this one would pass tier 1 while the other already has). */
export function treeStep(tree, path, tier) {
  const now = {a: whole(tree?.a), b: whole(tree?.b)}, other = path === 'a' ? now.b : now.a;
  if (now[path] >= tier) return 'known';
  if (now[path] < tier - 1) return 'needs_tier';
  if (tier > TREE_OTHER_MAX && other > TREE_OTHER_MAX) return 'closed';
  return 'ok';
}
