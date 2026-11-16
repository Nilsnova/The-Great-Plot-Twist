// The upgrade tree on a tower's card (decision D055), as a pure model (no DOM): skill-tree.js draws it like the
// captain's tree. Bottom to top: the trunk (the tower's level, 1 to 5, bought with the Upgrade it always had), then
// two paths of three tiers side by side (a: it fires faster, b: it hits harder). One tile is picked at a time; its
// detail says what it gives in numbers and has one big button. The server decides every price and refusal; this only
// describes its last answer (spot.level, spot.tree, prices.towerTrees, the island's best won wave).
//
//   towerTreeModel({kind, spot, coins, prices, wave, unlocks, busy, picked}) -> null (no tree for this kind) or
//   {kind, title, tiers: [{tier, fork, nodes: [{id, icon, name, cost, state, label}]}], picked, detail, message}
//   node ids: 'level' (the trunk), 'a1'..'a3', 'b1'..'b3'. state: learned | ready | locked | closed.
//   detail: {id, icon, state, name, sub, line, reason, button, disabled, busy, action} where action is
//   {type: 'upgrade'} or {type: 'tree', path, tier}, or null (nothing to buy).
import {BUILDINGS, maxLevel, priceFor, statLine, lockedWave} from './td-rules.js';
import {opensText, waveOf} from '../campaign/index.js';
import {formatCoins} from '../lib/coins.js';
import {TOWER_TREES, TREE_LEVEL, TREE_PATHS, TREE_STEPS, TREE_TIERS, treeStats, treeStep} from '../pirates/tower-trees.js';

const coinText = n => (Number.isSafeInteger(n) ? formatCoins(n) : '🪙 ?');
const NUMERAL = ['', 'I', 'II', 'III'];
// The tower's own glyph on the trunk tile.
export const KIND_ICONS = Object.freeze({cannon: '💣', mortar: '☄️', harpoon: '🏹', culverin: '🔭', swivel: '🔫'});
// A price badge that fits a small tile: 800, 1.2k, 4.8k.
export const shortCoins = n => (!Number.isSafeInteger(n) ? '?' : n < 1000 ? String(n) : `${Math.round(n / 100) / 10}k`);
const fixed = (value, digits = 2) => (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits);

// The island answer's tree of a kind (prices.towerTrees), else the browser's copy.
function treeInfo(kind, prices) {
  const own = TOWER_TREES[kind];
  if (!own) return null;
  const sent = prices?.towerTrees?.[kind];
  const list = (value, fallback) => (Array.isArray(value) && value.length === TREE_TIERS && value.every(Number.isSafeInteger) ? value : fallback);
  return {...own, prices: list(sent?.prices, own.prices), waves: list(sent?.waves, TREE_STEPS.map(id => waveOf(id) ?? 0)),
    level: Number.isSafeInteger(sent?.level) ? sent.level : TREE_LEVEL};
}
const readTiers = tree => ({a: Number.isSafeInteger(tree?.a) ? Math.max(0, Math.min(TREE_TIERS, tree.a)) : 0,
  b: Number.isSafeInteger(tree?.b) ? Math.max(0, Math.min(TREE_TIERS, tree.b)) : 0});

/** "Every 0.70 s → 0.64 s", "Damage 38 → 42 · Blast 4 → 4.4": what one step of a path changes, in numbers. */
export function stepLine(kind, path, from, to) {
  const info = TOWER_TREES[kind], level5 = BUILDINGS[kind]?.stats[TREE_LEVEL - 1] ?? {};
  const before = treeStats(kind, {[path]: from}), after = treeStats(kind, {[path]: to});
  if (path === 'a') return `Every ${fixed(info.shot * before.reload)} s → ${fixed(info.shot * after.reload)} s`;
  if (kind === 'harpoon') {
    const slow = level5.slow ?? 0;
    return `Slows ${Math.round(slow + before.slow * 100)}% → ${Math.round(slow + after.slow * 100)}%`
      + ` · ${fixed(4 + before.seconds, 1)} s → ${fixed(4 + after.seconds, 1)} s`;
  }
  if (kind === 'swivel') return `Pellets ${3 + before.pellets} → ${3 + after.pellets}`;
  const damage = level5.damage ?? 0, parts = [`Damage ${Math.round(damage * before.damage)} → ${Math.round(damage * after.damage)}`];
  if (kind === 'mortar') parts.push(`Blast ${fixed(4 * before.radius, 1)} → ${fixed(4 * after.radius, 1)}`);
  return parts.join(' · ');
}

export function towerTreeModel({kind, spot = null, coins = null, prices = null, wave = 0, unlocks = null, busy = false, picked = null, message = ''} = {}) {
  const info = treeInfo(kind, prices);
  if (!info || !spot?.built) return null;
  const top = maxLevel(kind), level = Number.isSafeInteger(spot.level) && spot.level > 0 ? Math.min(spot.level, top) : 1;
  const tiers = readTiers(spot.tree), allowed = unlocks ? unlocks.levels?.[kind] ?? 0 : top;
  const short = price => (coins === null ? 'Your coins are still loading.' : coins < price ? `Need ${coinText(price - coins)} more.` : '');
  const name = BUILDINGS[kind]?.name ?? kind;

  // The trunk: the tower's levels.
  const next = level + 1, upgrade = Number.isSafeInteger(spot.upgradeCost) ? spot.upgradeCost : priceFor(kind, level, prices);
  const trunkLocked = level < top && allowed < next;
  const trunk = {id: 'level', icon: KIND_ICONS[kind] ?? '★', name: `Level ${level}`, cost: level < top && !trunkLocked ? shortCoins(upgrade) : '',
    state: level >= top ? 'learned' : trunkLocked ? 'locked' : 'ready'};
  trunk.label = `${name}, level ${level} of ${top}${level < top ? `, next level ${coinText(upgrade)}` : ''}`;
  const trunkDetail = () => {
    if (level >= top) return {id: 'level', icon: trunk.icon, state: 'learned', name: `Level ${top}`, sub: 'Top level', line: statLine(kind, level),
      reason: '', button: 'Pick a path above', disabled: true, busy: false, action: null};
    const reason = trunkLocked ? `${opensText(lockedWave(unlocks, {kind, level: next}) ?? '?')}.` : busy ? '' : short(upgrade);
    return {id: 'level', icon: trunk.icon, state: trunk.state, name: `Level ${next}`, sub: `Level ${level} → ${next}`,
      line: statLine(kind, level, next), reason, button: busy === true || busy === 'upgrade' ? 'Upgrading…' : `Upgrade · ${coinText(upgrade)}`,
      disabled: !!busy || reason !== '', busy: busy === true || busy === 'upgrade', action: {type: 'upgrade'}};
  };

  // The two paths.
  const node = (path, tier) => {
    const part = info[path], id = `${path}${tier}`, price = info.prices[tier - 1], opens = info.waves[tier - 1];
    const step = treeStep(tiers, path, tier);
    let state = 'ready', reason = '';
    if (step === 'known') state = 'learned';
    else if (step === 'closed' || (tier > 1 && tiers[path === 'a' ? 'b' : 'a'] > 1)) { state = 'closed'; reason = `Closed: ${info[path === 'a' ? 'b' : 'a'].name} is past tier 1.`; }
    else if (level < info.level) { state = 'locked'; reason = `Reach level ${info.level} first.`; }
    else if (step === 'needs_tier') { state = 'locked'; reason = `Buy ${part.name} ${NUMERAL[tier - 1]} first.`; }
    else if (wave < opens) { state = 'locked'; reason = `${opensText(opens)}.`; }
    const title = `${part.name} ${NUMERAL[tier]}`;
    const label = `${title}, ${path === 'a' ? 'faster' : 'harder'} path tier ${tier}, ${state === 'learned' ? 'bought' : state === 'ready' ? `can buy, ${coinText(price)}` : state}`;
    return {id, path, tier, icon: part.icon, name: title, cost: state === 'learned' ? '' : shortCoins(price), state, reason, price, label};
  };
  const paths = Object.fromEntries(TREE_PATHS.map(path => [path, [1, 2, 3].map(tier => node(path, tier))]));
  const layers = [{tier: 1, fork: false, nodes: [trunk]},
    ...[1, 2, 3].map(tier => ({tier: tier + 1, fork: true, nodes: [paths.a[tier - 1], paths.b[tier - 1]]}))];
  const all = [trunk, ...paths.a, ...paths.b];

  // The picked tile: the player's, else the next step to take (the trunk below level 5, then the first tile that can
  // be bought, else the highest one bought).
  const ready = all.find(item => item.state === 'ready');
  const bought = [...paths.a, ...paths.b].filter(item => item.state === 'learned').sort((p, q) => q.tier - p.tier)[0];
  const pick = all.find(item => item.id === picked) ?? (level < top ? trunk : ready ?? bought ?? paths.a[0]);
  let detail;
  if (pick.id === 'level') detail = trunkDetail();
  else {
    const why = pick.state === 'ready' ? (busy ? '' : short(pick.price)) : pick.state === 'learned' ? '' : pick.reason;
    const busyHere = busy === `tree:${pick.id}`;
    detail = {id: pick.id, icon: pick.icon, state: pick.state, name: pick.name,
      sub: `${pick.path === 'a' ? 'Faster' : 'Harder'} · tier ${pick.tier} · ${coinText(pick.price)}`,
      line: stepLine(kind, pick.path, pick.tier - 1, pick.tier), reason: why,
      button: {learned: 'Bought', closed: 'Closed', locked: 'Locked'}[pick.state] ?? (busyHere ? 'Buying…' : `Buy · ${coinText(pick.price)}`),
      disabled: pick.state !== 'ready' || !!busy || why !== '', busy: busyHere,
      action: pick.state === 'learned' ? null : {type: 'tree', path: pick.path, tier: pick.tier}};
  }
  return {kind, title: `${name} tree`, tiers: layers, picked: pick.id, detail, message,
    flag: `${tiers.a + tiers.b}/${TREE_TIERS + 1}`};
}
