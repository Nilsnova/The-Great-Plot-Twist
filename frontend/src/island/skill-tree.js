// The captain's skill tree and the Tech hub's research, drawn as real trees (Nils's playtest, 15 Nov): big round
// tiles joined by lines that grow up from a root at the bottom, only a short name and a price on each tile, and
// ONE detail panel with ONE big button for the tile you tapped. It shows models from card-model.js and calls
// back; it decides nothing (the rules stay in the models and on the server).
//   drawSkills(model, on, kit)        -> the Skills tab      on: {pick, learn, pickRole, role, respec, respecCancel}
//   drawTech(body, model, view, kit)  -> the element to focus  view: {picked, select(id), research(action), locked(body)}
//   drawTowerTree(model, on, kit)     -> the tree part of a tower's card (D055)  on: {select(id), buy(action)}
//   kit: {button(label, onClick, quiet), line(className, text, role)} from ui.js
// On a phone (CSS, island.css) one branch shows at a time, chosen with the branch buttons above the tree.
import {node} from '../ui/kit/dom.js';
import {captainBranchesForPolicy, recoveryTechLine} from '../campaign/captain-repair-policy.js';

const SVG = 'http://www.w3.org/2000/svg';
// One glyph per tile. Only the look: names, lines and numbers stay in the data.
const ICONS = {
  steady_aim: '🎯', long_barrel: '🔭', hot_shot: '🔥', quick_hands: '⏱️', far_sight: '👁️', heavy_shot: '💥', dead_eye: '💀',
  cutlass: '🗡️', sweep: '🌀', heavy_blade: '⚔️', second_wind: '💨', snap_shot: '⏩', bruiser: '👊', field_surgeon: '⛑️',
  quick_fix: '🔧', long_reach: '📏', sturdy_planks: '🛠️', master_shipwright: '⚓', swift_hammer: '🔨', wide_arc: '↔️', grand_engineer: '🏗️',
  cannon: '💣', mortar: '☄️', wall: '🧱', watchtower: '🗼',
  rapid_2: '⏩', long_guns: '🔭', quick_fuse: '🧨', heavy_shells: '💥', mason_drill: '🧰', thick_walls: '🛡️', lookout_drill: '👀', high_tower: '📡',
  broadside: '⛵', grapeshot: '🍇', shockwave: '🌊', inferno: '🔥', bastion: '🏰', thorns: '🌵', eagle_eye: '🦅', war_drums: '🥁',
  // A tower's own skills and a house's roles (the building card's picks).
  rapid: '⏩', heavy: '🏋️', chain: '⛓️', cluster: '🎆', fire_pot: '🔥', long_range: '🔭', stone: '🛡️', spiked: '🌵', quick_mend: '🩹',
  spotter: '👀', signal_fire: '🔥', barracks: '⚔️', tavern: '🍺', workshop: '🔨',
};
// D055: a tree tile brings its own glyph (the tower's, or its path's), so a tile may name one directly.
const glyph = (id, icon) => icon ?? iconOf(id);
export const iconOf = id => ICONS[id] ?? '★';
// The mark in a tile's corner: learned ✓, locked 🔒, a closed fork twin ✕; none while it can be learned.
const MARK = {learned: '✓', locked: '🔒', closed: '✕', ready: ''};

// Three states, three little dots.
function legend(words) {
  const row = node('ul', 'island-legend'); row.setAttribute('aria-label', 'Legend');
  for (const state of ['learned', 'ready', 'locked']) {
    const item = node('li', `island-legend-item is-${state}`), dot = node('span', 'island-legend-dot');
    dot.setAttribute('aria-hidden', 'true'); item.append(dot, node('span', '', words[state])); row.append(item);
  }
  return row;
}

// One round tile: the glyph, its price badge and state mark, the short name under it.
function tile({id, icon, className, state, name, cost, label, picked, capstone, extra, focus, onClick}) {
  const button = node('button', `island-node ${className} is-${state}${capstone ? ' is-capstone' : ''}${picked ? ' is-picked' : ''}`); button.type = 'button';
  button.dataset.focus = focus; button.setAttribute('aria-pressed', String(picked)); button.setAttribute('aria-label', label);
  const disc = node('span', 'island-node-icon', glyph(id, icon)); disc.setAttribute('aria-hidden', 'true');
  const mark = node('span', 'island-node-mark', MARK[state] ?? ''); mark.hidden = !mark.textContent;
  const badge = node('span', 'island-node-cost', cost ?? ''); badge.hidden = !cost;
  disc.append(mark, badge);
  if (extra) { const corner = node('span', 'island-node-role', extra); disc.append(corner); }
  const title = node('span', 'island-node-name', name); title.setAttribute('aria-hidden', 'true');
  button.append(disc, title);
  button.addEventListener('click', onClick);
  return button;
}

// One branch: its tiers from the root (bottom) up, the lines between the tiles in an SVG behind them, and the
// branch's name as the root plate under it. tiers: [{tier, fork, linked, nodes: [{id, visual, ...}]}];
// a line is gold once both ends are learned, dashed gold when it leads to a tile you can learn now.
function branchTree({id, className, name, icon, flag, tiers, needs, makeTile}) {
  const section = node('section', `island-branch ${className}`); section.dataset.branch = id; section.setAttribute('aria-label', name);
  const plot = node('div', 'island-branch-plot');
  const list = node('ol', `island-branch-nodes has-${tiers.length}`);
  const at = {}, state = {};
  for (const tier of tiers) {
    tier.nodes.forEach((item, index) => {
      at[item.id] = [tier.nodes.length > 1 ? (index ? 75 : 25) : 50, ((tiers.length - tier.tier + .5) / tiers.length) * 100];
      state[item.id] = item.visual;
    });
  }
  const edges = [];
  for (const tier of tiers) for (const item of tier.nodes) for (const from of needs(item, tier)) {
    const lit = state[from] === 'learned';
    edges.push({from, to: item.id, kind: lit && state[item.id] === 'learned' ? 'on' : lit && state[item.id] === 'ready' ? 'open' : 'off'});
  }
  const lines = document.createElementNS(SVG, 'svg');
  lines.setAttribute('class', 'island-branch-lines'); lines.setAttribute('viewBox', '0 0 100 100');
  lines.setAttribute('preserveAspectRatio', 'none'); lines.setAttribute('aria-hidden', 'true');
  const rank = {off: 0, open: 1, on: 2};
  for (const edge of edges.sort((a, b) => rank[a.kind] - rank[b.kind])) {
    const [x1, y1] = at[edge.from], [x2, y2] = at[edge.to], mid = (y1 + y2) / 2;
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', `M${x1} ${y1}V${mid}H${x2}V${y2}`); path.setAttribute('class', `is-${edge.kind}`);
    lines.append(path);
  }
  for (const tier of tiers) {
    const item = node('li', `island-tier${tier.fork ? ' is-fork' : ''}${tier.linked ? ' is-linked' : ''}`); item.dataset.tier = String(tier.tier);
    if (tier.group) { item.setAttribute('role', 'group'); item.setAttribute('aria-label', tier.group); }
    for (const option of tier.nodes) item.append(makeTile(option, tier));
    if (tier.fork) { const or = node('span', 'island-fork-or', 'or'); or.setAttribute('aria-hidden', 'true'); item.append(or); }
    list.append(item);
  }
  plot.append(lines, list);
  const head = node('h3', 'island-branch-head');
  const mark = node('span', 'island-branch-icon', icon); mark.setAttribute('aria-hidden', 'true');
  head.append(mark, node('span', 'island-branch-name', name));
  if (flag) head.append(node('span', 'island-branch-flag', flag));
  section.append(head, plot);
  return section;
}

// The phone's branch buttons: one branch of the tree at a time.
function branchTabs(branches, current, label, choose) {
  const row = node('div', 'island-branch-tabs'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', label);
  for (const branch of branches) {
    const go = node('button', `island-branch-tab${branch.id === current ? ' is-current' : ''}`); go.type = 'button';
    go.dataset.focus = `branch-${branch.id}`; go.setAttribute('aria-pressed', String(branch.id === current));
    const icon = node('span', 'island-branch-icon', branch.icon); icon.setAttribute('aria-hidden', 'true');
    go.append(icon, node('span', '', branch.name));
    go.addEventListener('click', () => choose(branch));
    row.append(go);
  }
  return row;
}

// The detail panel: the picked tile big, its one line in numbers, why not (if so), and ONE big button.
function detailPanel(className, {id, icon, state, name, sub, line: text, note, reason}, act, kit) {
  const detail = node('div', `island-skill-detail ${className} is-${state}`); detail.setAttribute('aria-live', 'polite');
  const head = node('div', 'island-skill-detail-head');
  const disc = node('span', 'island-node-icon', glyph(id, icon)); disc.setAttribute('aria-hidden', 'true');
  const title = node('div', 'island-skill-detail-title');
  title.append(node('strong', '', name), node('span', 'island-skill-detail-cost', sub));
  head.append(disc, title);
  const why = kit.line('island-reason', reason);
  if (reason) { why.id = `island-reason-${className}`; act.setAttribute('aria-describedby', why.id); }
  act.classList.add('island-primary');
  detail.append(head, kit.line('island-skill-line', text), kit.line('island-skill-note', note), why, act);
  return detail;
}

// --- the captain's skills (§14, docs/GAME-V3.md "Captain tree and roles") ---
export function drawSkills(model, on, kit) {
  const part = node('div', 'island-skills island-tree-card');
  const branches = captainBranchesForPolicy(model.branches, model.recoveryVersion);
  const visibleSkills = branches.flatMap(branch => branch.nodes);
  const selectedSkill = visibleSkills.find(item => item.id === model.detail.id)
    ?? visibleSkills.find(item => item.state === 'ready')
    ?? visibleSkills[0];
  const pick = selectedSkill?.id === model.detail.id ? model.detail : selectedSkill ? {
    ...selectedSkill,
    costText: `${selectedSkill.cost} ${selectedSkill.cost === 1 ? 'point' : 'points'}`,
    button: selectedSkill.state === 'learned' ? 'Learned' : selectedSkill.state === 'closed' ? 'Closed' : 'Learn',
    disabled: selectedSkill.state !== 'ready',
  } : model.detail;
  const current = branches.find(branch => branch.nodes.some(item => item.id === pick.id))?.id ?? branches[0]?.id;
  const top = node('div', 'island-tree-top');
  // How to earn points only while there are none (a locked tile says it too).
  top.append(node('p', `island-points${model.points > 0 ? ' has-points' : ''}`, model.pointsText), kit.line('island-skills-how', model.points > 0 ? '' : model.line),
    legend({learned: 'Learned', ready: 'Can learn', locked: 'Locked'}));
  const icons = Object.fromEntries(model.role.choices.map(choice => [choice.id, choice.icon]));
  const tree = node('div', 'island-tree'); tree.setAttribute('role', 'group'); tree.setAttribute('aria-label', 'Skill tree');
  for (const branch of branches) {
    const tiers = branch.tiers.map((tier, index) => ({...tier, linked: index > 0 && branch.tiers[index - 1].nodes.some(item => item.state === 'learned'),
      group: tier.fork ? `Tier ${tier.tier}: choose one of two` : '', nodes: tier.nodes.map(item => ({...item, visual: item.state}))}));
    tree.append(branchTree({id: branch.id, className: `island-branch-${branch.id}${branch.id === current ? ' is-current' : ''}`, name: branch.name, icon: branch.icon,
      tiers, needs: item => item.needs ?? [],
      makeTile: skill => {
        const button = tile({id: skill.id, className: 'island-skill', state: skill.state, name: skill.name, cost: `${skill.cost} ⭐`, label: skill.label,
          picked: skill.id === pick.id, capstone: skill.capstone, extra: skill.capstone ? icons[skill.role] : '', focus: `skill-${skill.id}`,
          onClick: () => on.pick?.(skill.id)});
        button.dataset.skill = skill.id;
        return button;
      }}));
  }
  const tabs = branchTabs(branches, current, 'Skill branches', branch => on.pick?.(branch.start));
  const learn = kit.button(pick.button, () => on.learn?.(pick.id)); learn.dataset.focus = 'learn'; learn.disabled = pick.disabled;
  const detail = detailPanel('island-skill-pick', {id: pick.id, state: pick.state, name: pick.name, sub: `Tier ${pick.tier} · ${pick.costText}`,
    line: pick.line, note: '', reason: pick.state === 'locked' || pick.state === 'closed' ? pick.reason : ''}, learn, kit);
  part.append(top, tabs, tree, detail, kit.line('island-message', model.message, 'alert'), rolePart(roleForPolicy(model.role, model.recoveryVersion), on, kit), respecPart(model.respec, on, kit));
  return part;
}

function roleForPolicy(model, recoveryVersion) {
  if (recoveryVersion !== 1) return model;
  const retainedLine = 'Buildings and upgrades cost you 10% less.';
  const choices = model.choices.map(choice => choice.id === 'engineer'
    ? {...choice, line: retainedLine, capstone: ''}
    : choice);
  const detail = model.detail.id === 'engineer'
    ? {...model.detail, line: retainedLine, capstone: ''}
    : model.detail;
  return {...model, choices, detail};
}

// The role: three role tiles side by side, the picked one's line and its button.
function rolePart(model, on, kit) {
  const card = node('section', `island-role${model.current ? ' has-role' : ''}`); card.setAttribute('aria-label', 'Captain role');
  const head = node('h3', 'island-role-title');
  if (model.icon) { const mark = node('span', 'island-role-icon', model.icon); mark.setAttribute('aria-hidden', 'true'); head.append(mark); }
  head.append(node('span', '', model.title));
  const row = node('div', 'island-role-choices'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Roles');
  for (const choice of model.choices) {
    const pickRole = node('button', `island-role-choice is-${choice.state}${choice.id === model.picked ? ' is-shown' : ''}`); pickRole.type = 'button';
    pickRole.dataset.role = choice.id; pickRole.dataset.focus = `role-${choice.id}`; pickRole.setAttribute('aria-pressed', String(choice.id === model.picked));
    pickRole.setAttribute('aria-label', choice.label);
    const icon = node('span', 'island-role-choice-icon', choice.icon); icon.setAttribute('aria-hidden', 'true');
    pickRole.append(icon, node('span', 'island-role-choice-name', choice.name));
    pickRole.addEventListener('click', () => on.pickRole?.(choice.id));
    row.append(pickRole);
  }
  const shown = model.detail, act = kit.button(shown.button, () => on.role?.(shown.id), true); act.dataset.focus = 'role'; act.disabled = shown.disabled;
  // Only the locked case needs words above the tiles; the rest is in the picked role's one line.
  card.append(head, kit.line('island-role-lead', model.locked ? model.lead : ''), row, kit.line('island-role-line', shown.line));
  if (shown.capstone) card.append(kit.line('island-role-capstone', `Unlocks ${shown.capstone} (top of ${shown.branchName}).`));
  card.append(act);
  return card;
}

function respecPart(respec, on, kit) {
  const again = node('div', 'island-respec');
  const reset = kit.button(respec.button, () => on.respec?.(), !respec.ask); reset.dataset.focus = 'respec'; reset.disabled = respec.disabled;
  const why = kit.line('island-reason', respec.reason);
  if (why.textContent) { why.id = 'island-reason-respec'; reset.setAttribute('aria-describedby', why.id); }
  again.append(kit.line('island-respec-line', respec.line), reset, why);
  if (respec.ask) { const cancel = kit.button('Keep my skills', () => on.respecCancel?.(), true); cancel.dataset.focus = 'respec-cancel'; again.append(cancel); }
  return again;
}

// --- the Tech hub (GAME-V3.md §5.1): one tree per tower kind, tier 1 at the root, tiers 2 and 3 a fork of two ---
const TECH_VISUAL = {done: 'learned', chosen: 'learned', open: 'ready', locked: 'locked', closed: 'closed'};
const TECH_WORD = {done: 'researched', chosen: 'chosen by your crew', open: 'can research', locked: 'locked', closed: 'closed'};

export function drawTech(body, model, view, kit) {
  const part = node('div', 'island-tech island-tree-card');
  const options = model.branches.flatMap(row => row.tiers.flatMap(tier => tier.nodes.map(option => ({row, tier, option}))));
  // The tile a branch opens on: the step the crew can take, else the last one done, else its root.
  const startOf = row => {
    const mine = options.filter(item => item.row === row);
    return (mine.find(item => item.option.state === 'open') ?? mine.filter(item => TECH_VISUAL[item.option.state] === 'learned').pop() ?? mine[0]).option.id;
  };
  const nextRow = model.branches.find(row => row.branch === model.next?.branch);
  const pickedId = options.some(item => item.option.id === view.picked) ? view.picked : nextRow ? startOf(nextRow) : options[0]?.option.id;
  const picked = options.find(item => item.option.id === pickedId);
  const top = node('div', 'island-tree-top');
  if (!model.open) view.locked(top);
  if (model.next) top.append(kit.line('island-tech-next', model.next.text));
  top.append(legend({learned: 'Researched', ready: 'Can research', locked: 'Locked'}));
  const tree = node('div', 'island-tree island-tech-tree'); tree.setAttribute('role', 'group'); tree.setAttribute('aria-label', 'Research tree');
  const branches = model.branches.map(row => ({id: row.branch, name: row.short ?? row.name, icon: iconOf(row.branch), start: startOf(row)}));
  for (const row of model.branches) {
    const tiers = row.tiers.map(tier => ({tier: tier.tier, fork: tier.fork, linked: false, group: tier.fork ? `${row.name}, tier ${tier.tier}: one of two` : '',
      nodes: tier.nodes.map(option => ({...option, visual: TECH_VISUAL[option.state] ?? 'locked'}))}));
    const ids = tier => row.tiers.find(item => item.tier === tier)?.nodes.map(option => option.id) ?? [];
    tree.append(branchTree({id: row.branch, className: `island-research-branch${row.branch === picked?.row.branch ? ' is-current' : ''}${row.next ? ' is-next' : ''}`,
      name: row.short ?? row.name, icon: iconOf(row.branch), flag: `${row.tier}/${row.tiers.length}`, tiers,
      needs: (option, tier) => (tier.tier > 1 ? ids(tier.tier - 1) : []),
      makeTile: (option, tier) => {
        const price = row.prices[tier.tier - 1], learned = option.visual === 'learned';
        const tech = tile({id: tier.tier === 1 ? row.branch : option.id, className: 'island-research-option', state: option.visual, name: option.name,
          cost: learned ? '' : price, label: `${option.name}, ${row.name} tier ${tier.tier}${tier.fork ? ', one of two' : ''}, ${TECH_WORD[option.state]}${learned ? '' : `, ${price}`}`,
          picked: option.id === pickedId, focus: `tech-${option.id}`, onClick: () => view.select(option.id)});
        tech.dataset.option = option.id; tech.dataset.state = option.state;
        return tech;
      }}));
  }
  const tabs = branchTabs(branches, picked?.row.branch, 'Tower kinds', branch => view.select(branch.start));
  part.append(top, tabs, tree);
  let focusable = null;
  if (picked) {
    const {row, tier, option} = picked, go = option.button;
    const act = go ? kit.button(go.label, () => view.research(go.action), go.action.change) : kit.button(TECH_VISUAL[option.state] === 'learned' ? 'Researched' : 'Locked', () => {});
    act.dataset.focus = go ? `research-${option.id}` : 'research-none';
    act.disabled = go ? go.disabled : true;
    if (go) act.setAttribute('aria-label', go.aria);
    const sub = `${row.short ?? row.name} · tier ${tier.tier}${tier.fork ? ' · pick one of two' : ''}`;
    part.append(detailPanel('island-tech-detail', {id: tier.tier === 1 ? row.branch : option.id, state: TECH_VISUAL[option.state] ?? 'locked', name: option.name, sub,
      line: recoveryTechLine(option.id, option.line, model.recoveryVersion), note: option.note,
      reason: go ? go.reason : option.state === 'locked' ? tier.reason : ''}, act, kit));
    focusable = !act.disabled && !go?.action.change ? act : null;
  }
  part.append(kit.line('island-message', model.message, 'alert'), kit.line('island-coins', model.coins));
  body.append(part);
  return focusable ?? part.querySelector('.island-node.is-picked');
}

// --- a tower's upgrade tree (D055, tree-model.js): the levels as the trunk, then two paths of three tiers ---
// The same tiles, lines, legend and detail panel as the captain's tree; one tree, so no branch buttons on a phone.
export function drawTowerTree(model, on, kit) {
  const part = node('div', 'island-tower-tree island-tree-card');
  const top = node('div', 'island-tree-top');
  top.append(legend({learned: 'Bought', ready: 'Can buy', locked: 'Locked'}));
  const tree = node('div', 'island-tree island-tower-tree-plot'); tree.setAttribute('role', 'group'); tree.setAttribute('aria-label', model.title);
  const tiers = model.tiers.map((tier, index) => ({...tier, linked: index > 0 && model.tiers[index - 1].nodes.some(item => item.state === 'learned'),
    group: tier.fork ? `Tier ${tier.tier - 1}: faster or harder` : '', nodes: tier.nodes.map(item => ({...item, visual: item.state}))}));
  // The paths grow from the trunk: a tier needs the one below it on its own path (tier 1 needs the trunk).
  const needs = item => (item.id === 'level' ? [] : item.tier === 1 ? ['level'] : [`${item.path}${item.tier - 1}`]);
  tree.append(branchTree({id: model.kind, className: `island-tower-branch is-current`, name: model.title, icon: model.tiers[0].nodes[0].icon,
    flag: model.flag, tiers, needs,
    makeTile: item => {
      const button = tile({id: item.id, icon: item.icon, className: 'island-tree-step', state: item.state, name: item.name, cost: item.cost ? `🪙 ${item.cost}` : '',
        label: item.label, picked: item.id === model.picked, focus: `tree-${item.id}`, onClick: () => on.select?.(item.id)});
      button.dataset.step = item.id;
      return button;
    }}));
  const pick = model.detail;
  const act = kit.button(pick.button, () => pick.action && on.buy?.(pick.action)); act.dataset.focus = 'tree-buy'; act.disabled = pick.disabled;
  part.append(top, tree, detailPanel('island-tree-detail', {id: pick.id, icon: pick.icon, state: pick.state, name: pick.name, sub: pick.sub,
    line: pick.line, note: '', reason: pick.reason}, act, kit), kit.line('island-message', model.message, 'alert'));
  return {part, act};
}
