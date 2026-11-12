// What the island's small cards say, as pure functions (no DOM): the build and upgrade card of a spot,
// the crew and captain panels, the harbor bell, Play with a friend and the loot toast. The server decides; these only describe its last answer.
import {BUILDINGS, CREW, CREW_IDS, CAPTAIN, CAPTAIN_MAX, SLOT_KINDS, maxLevel, priceFor, statLine, captainLine, lockedWave} from './td-rules.js';
import {displayIslandCode, visitUrl} from './codes.js';
import {formatCoinDelta, formatCoins} from '../lib/coins.js';
import {BRANCHES, ROLES, ROLE_BY_ID, ROLE_LEVEL, SKILLS, SKILL_BY_ID, WEAPONS, WEAPON_BY_ID, isRole, pointsEarned, pointsSpent, readSkills, readWeapon, respecPrice, skillNeeds} from '../pirates/captain-ids.js';
import {opensText, spotWave, waveOf, isOpen, tierItem, tierWave} from '../campaign/index.js';
import {BRANCH_BY_ID, SPECS, TOP_TIER, isCapstone, optionLine, optionName, optionsOf, readSpec, readTier} from '../campaign/tech.js';
import {ROLES as HOUSE_ROLES, ROLE_IDS, ROLE_LEVEL as HOUSE_ROLE_LEVEL, readRole} from '../campaign/houses.js';

// Coins always read "🪙 120" through formatCoins (BUILD-PLAN 3.2); an unknown amount reads "🪙 ?".
export const coinText = n => (Number.isSafeInteger(n) ? formatCoins(n) : '🪙 ?');

// The build card of one spot (docs/TOWER-DEFENSE.md §2, §5, §9). spot: the server's {id, kind, built,
// level, cost} or null while loading; slot: wall, tower, watchtower or house (spots.js); unlocks:
// readUnlocks(island) (td-rules.js) of the payer's own island, also on Pirate Point (the server checks your own unlocks there too).
//   mode 'choose'   an empty tower spot: choices [{kind, name, line, price, disabled, reason}]
//   mode 'build'    an empty spot of one kind: button "Build · 🪙 10"
//   mode 'upgrade'  a building that can go up a level: upgrade {label "Level 2 · 🪙 60", stats}
//   mode 'info'     nothing to do here (at the highest level, or the next level is locked)
// Locked things stay on the card, marked "Opens after wave N" (GAME-V3.md §4): a locked tower choice is a
// disabled choice with that reason, a locked spot (the inner wall ring) or level says it in `soon`.
// campaign: campaignOf(island) of the island on screen (src/campaign/); with it a built tower shows its
// skills (GAME-V3.md §5): `skills` {line, choices: [{id, name, line, active, disabled}]} or null.
// A visitor (§6, 11 Nov) builds and upgrades on the friend's island with their own coins: the same
// card, with "You pay · it stays on <owner>'s island" and no crew button.
// One primary button at most (the build or the upgrade); `soon` is the small "Coming soon" line.
// GAME-V3.md §4.2: a built building on an island (not Pirate Point) has a secondary "Tear down" in
// `demolish` {label, disabled, reason}; battle: a wave runs on screen, so it waits for the break.
export function buildCardModel({spotId, kind, slot = null, spot = null, coins = null, visitor = false, ownerName = '',
  busy = false, message = '', unlocks = null, prices = null, point = false, campaign = null, battle = false} = {}) {
  const place = slot ?? (kind === 'cannon' || kind === 'mortar' ? 'tower' : kind ?? 'wall');
  const built = spot?.built === true, standing = built ? spot.kind : null;
  const level = built ? (Number.isSafeInteger(spot.level) && spot.level > 0 ? spot.level : 1) : 0;
  const shown = standing ?? (place === 'tower' ? null : SLOT_KINDS[place]?.[0] ?? kind);
  const info = BUILDINGS[shown] ?? null;
  const allowed = k => (unlocks ? unlocks.levels[k] ?? 0 : maxLevel(k));
  const enough = price => coins !== null && Number.isSafeInteger(price) && coins >= price;
  const short = price => `Not enough 🪙: you need ${coinText(price - coins)} more.`;
  const model = {spotId, slot: place, title: info?.name ?? 'Tower spot', purpose: info?.line ?? 'Build a cannon or a mortar here.',
    mode: 'info', built, kind: shown, level, maxLevel: shown ? maxLevel(shown) : 0, pips: [], stats: '', choices: [], cost: '',
    button: '', disabled: true, reason: '', upgrade: null, soon: '', message, busy, skills: null, locked: false,
    coins: coins === null ? '' : `You have ${coinText(coins)}`,
    owner: point ? 'Paid by you · belongs to Pirate Point' : visitor ? `You pay · it stays on ${ownerName ? `${ownerName}'s` : 'this'} island` : '', hire: false,
    demolish: null};
  if (shown && level > 0) {
    model.pips = Array.from({length: model.maxLevel}, (_, index) => index < level);
    model.stats = statLine(shown, level);
  }
  if (!spot) { model.reason = message ? '' : visitor ? 'The island is still loading.' : 'Your island is still loading.'; return model; }
  model.hire = !point && !visitor && built && (place === 'tower' || place === 'wall');
  // A spot of a later campaign step (the inner wall ring after wave 5): shown, marked, not buildable yet.
  const spotNeeds = point ? 0 : spotWave(spotId), campaignWave = campaign?.wave ?? unlocks?.wonWave ?? 0;
  if (!built && spotNeeds > campaignWave) {
    model.locked = true; model.soon = `${opensText(spotNeeds)}.`;
    model.purpose = spotNeeds === waveOf('ring_walls') ? 'The inner ring of walls around the heart.' : model.purpose;
    return model;
  }
  if (!built && place === 'tower') {
    model.mode = 'choose'; model.title = 'Tower spot'; model.purpose = 'Choose what to build. You cannot change it later.';
    for (const choice of SLOT_KINDS.tower) {
      const price = priceFor(choice, 0, prices);
      if (allowed(choice) < 1) {
        model.choices.push({kind: choice, name: BUILDINGS[choice].name, line: BUILDINGS[choice].line, price: coinText(price),
          disabled: true, locked: true, reason: `${opensText(lockedWave(unlocks, {kind: choice}) ?? '?')}.`, busy: false});
        continue;
      }
      model.choices.push({kind: choice, name: BUILDINGS[choice].name, line: BUILDINGS[choice].line, price: coinText(price),
        disabled: busy || !enough(price), reason: coins === null ? 'Your coins are still loading.' : enough(price) ? '' : short(price),
        busy: busy === choice});
    }
    return model;
  }
  if (!built) {
    const price = priceFor(shown, 0, prices);
    model.mode = 'build'; model.cost = coinText(price);
    model.button = busy ? 'Building…' : `Build · ${coinText(price)}`;
    if (allowed(shown) < 1) { model.mode = 'info'; model.button = ''; model.locked = true; model.soon = `${opensText(lockedWave(unlocks, {kind: shown}) ?? '?')}.`; return model; }
    if (busy) return model;
    if (coins === null) model.reason = 'Your coins are still loading.';
    else if (!enough(price)) model.reason = short(price);
    else model.disabled = false;
    return model;
  }
  // Built: its tower skill (GAME-V3.md §5), then the next level, if any; and a way to tear it down (§4.2).
  if (!point && campaign && BRANCH_BY_ID[shown]) model.skills = skillsOf(shown, spot, campaign, busy);
  // GAME-V3.md "Houses": a house keeps its loot and, from level 2, picks a role (free, changeable between waves).
  if (!point && shown === 'house') model.skills = rolesOf(spot, level, busy);
  if (!point) model.demolish = {label: busy === 'demolish' ? 'Checking…' : 'Tear down', disabled: battle || !!busy,
    reason: battle ? 'You can tear it down between waves.' : ''};
  const next = level + 1;
  if (level >= model.maxLevel) { model.reason = shown === 'house' ? '' : 'Highest level reached.'; return model; }
  if (allowed(shown) < next) { model.soon = `Level ${next}: ${opensText(lockedWave(unlocks, {kind: shown, level: next}) ?? '?')}.`; return model; }
  const price = Number.isSafeInteger(spot.upgradeCost) ? spot.upgradeCost : priceFor(shown, level, prices);
  model.mode = 'upgrade';
  model.upgrade = {label: `Level ${next} · ${coinText(price)}`, stats: statLine(shown, level, next)};
  model.button = busy ? 'Upgrading…' : 'Upgrade';
  if (busy) return model;
  if (coins === null) model.reason = 'Your coins are still loading.';
  else if (!enough(price)) model.reason = short(price);
  else model.disabled = false;
  return model;
}

// The tower skills of a built building (GAME-V3.md §5): the Tech hub opens after wave 8, its branch must be
// researched on this island, then one skill is picked (free, changeable between waves).
function skillsOf(kind, spot, campaign, busy) {
  const branch = BRANCH_BY_ID[kind], current = readSpec(kind, spot?.spec);
  const title = current ? `Skill: ${SPECS[current].name}` : 'Tower skill';
  if (!isOpen(campaign, 'tech_hub')) return {title, line: `Tower skills: ${opensText(waveOf('tech_hub'))}.`, choices: [], current};
  if (!campaign.research.done.has(kind)) return {title, line: `Research ${branch.name.toLowerCase()} at the Tech hub first.`, choices: [], current};
  // Tier 3 (GAME-V3.md §5.1): the capstone the island chose is one more pick.
  const capstone = campaign.research.tiers?.[kind]?.tier3 ?? null;
  return {title, line: current ? 'Pick another one for the next wave if you like.' : 'Pick one skill for this tower. It costs nothing.', current,
    choices: [...branch.specs, ...(capstone ? [capstone] : [])].map(id => ({id, name: SPECS[id].name, line: SPECS[id].line, active: id === current,
      capstone: isCapstone(id), disabled: id === current || busy === `spec:${id}`, busy: busy === `spec:${id}`}))};
}

// The roles of a built house (GAME-V3.md "Houses"): below level 2 one line says what comes; from level 2 the
// three roles with one plain line each, the active one marked. In the shape of skillsOf (the same card box).
function rolesOf(spot, level, busy) {
  const current = level >= HOUSE_ROLE_LEVEL ? readRole('house', spot?.spec) : null;
  const title = current ? `Role: ${HOUSE_ROLES[current].name}` : 'House role';
  if (level < HOUSE_ROLE_LEVEL) return {title, line: `Level ${HOUSE_ROLE_LEVEL}: choose ${ROLE_IDS.map(id => HOUSE_ROLES[id].name).join(', ').replace(/, (?=[^,]*$)/, ' or ')}.`, choices: [], current, role: true};
  return {title, line: current ? 'Pick another one for the next wave if you like.' : 'Pick one role for this house. It costs nothing.', current, role: true,
    choices: ROLE_IDS.map(id => ({id, name: HOUSE_ROLES[id].name, line: HOUSE_ROLES[id].line, active: id === current,
      disabled: id === current || busy === `spec:${id}`, busy: busy === `spec:${id}`}))};
}

// The crew panel (§3): one row per crew member that is unlocked; the locked ones in `soon`.
export function crewModel({crew = {}, coins = null, unlocks = null, busy = null, message = '', prices = null} = {}) {
  const rows = [], soon = [];
  for (const id of CREW_IDS) {
    const sent = prices?.crew?.[id], owned = Number.isSafeInteger(crew?.[id]) ? crew[id] : 0;
    const info = {...CREW[id], ...(Number.isSafeInteger(sent?.max) ? {max: sent.max} : {})};
    const price = Number.isSafeInteger(sent?.price) ? sent.price : info.price;
    if (unlocks && !unlocks.crew[id]) { soon.push(`${info.name}: ${opensText(lockedWave(unlocks, {crew: id}) ?? '?')}`); continue; }
    const full = owned >= info.max;
    const row = {id, name: info.name, line: info.line, price: coinText(price), owned: `${owned} of ${info.max}`,
      button: busy === id ? 'Hiring…' : full ? 'Full' : 'Hire', disabled: true, reason: ''};
    if (full) row.reason = info.max === 1 ? 'You have one.' : `You have ${info.max}, the most you can hire.`;
    else if (busy) row.reason = '';
    else if (coins === null) row.reason = 'Your coins are still loading.';
    else if (coins < price) row.reason = `Not enough 🪙: you need ${coinText(price - coins)} more.`;
    else row.disabled = false;
    rows.push(row);
  }
  return {title: 'Crew', lead: rows.length ? 'Crew members help on their own during every wave. You keep them.'
    : `Crew members join after you win wave ${lockedWave(unlocks, {crew: 'gunner'})}.`,
  rows, soon: soon.length ? soon.join(' · ') : '', message, coins: coins === null ? '' : `You have ${coinText(coins)}`};
}

// The captain panel (§10): the musket's level and the next one.
export function captainModel({captain = null, coins = null, unlocks = null, busy = false, message = ''} = {}) {
  const level = Number.isSafeInteger(captain?.level) && captain.level > 0 ? captain.level : 1, next = level + 1;
  const model = {title: 'Your captain', level, badge: `⚔️ ${level}`, pips: Array.from({length: CAPTAIN_MAX}, (_, index) => index < level),
    stats: captainLine(level), hint: 'Tap a ship to fire your musket (F).', upgrade: null, button: '', disabled: true, reason: '', soon: '', message,
    coins: coins === null ? '' : `You have ${coinText(coins)}`};
  if (level >= CAPTAIN_MAX) { model.reason = 'Highest level reached.'; return model; }
  if (unlocks && unlocks.captain < next) { model.soon = `Level ${next}: ${opensText(lockedWave(unlocks, {captain: next}) ?? '?')}.`; return model; }
  const price = Number.isSafeInteger(captain?.nextPrice) ? captain.nextPrice : CAPTAIN.price[level];
  model.upgrade = {label: `Level ${next} · ${coinText(price)}`, stats: captainLine(level, next)};
  model.button = busy ? 'Upgrading…' : 'Upgrade';
  if (busy) return model;
  if (coins === null) model.reason = 'Your coins are still loading.';
  else if (coins < price) model.reason = `Not enough 🪙: you need ${coinText(price - coins)} more.`;
  else model.disabled = false;
  return model;
}

// The skill tree (§14, docs/GAME-V3.md "Captain tree and roles"): skill points at the top, the role card, then
// three branches as vertical paths of five tiers. Tiers 2 and 4 are forks (two nodes side by side: pick ONE, the
// other closes), tier 5 is the capstone of one role. skills: the island answer's {points, spent, known, tree, role,
// respecPrice} (or null while loading: then derived from wonWave); picked: the skill whose detail shows.
//   node.state  'learned' | 'ready' (you can learn it now) | 'locked' (the tier above first, the role, or points)
//               | 'closed' (its fork twin was chosen; greyed until a respec); node.reason says which.
export const skillPointsText = points => `Skill points: ${Number.isSafeInteger(points) ? points : '?'}`;
export function skillsModel({skills = null, wonWave = 0, picked = null, busy = null, message = '', coins = null, captainLevel = 1,
  pickedRole = null, busyRole = null, respecAsk = false, busyRespec = false} = {}) {
  const role = isRole(skills?.role) ? skills.role : null;
  const known = readSkills(skills?.known ?? []).filter(id => SKILL_BY_ID[id]);
  const points = Number.isSafeInteger(skills?.points) ? skills.points : Math.max(0, pointsEarned(wonWave) - pointsSpent(known));
  const has = new Set(known), nameOf = id => SKILL_BY_ID[id].name;
  const nodeOf = skill => {
    const learned = has.has(skill.id), met = !skill.needs.length || skill.needs.some(id => has.has(id));
    let state = 'ready', reason = '';
    if (learned) { state = 'learned'; reason = 'Learned.'; }
    else if (skill.excludes && has.has(skill.excludes)) { state = 'closed'; reason = `You chose ${nameOf(skill.excludes)}, so this is closed. Respec to change.`; }
    else if (!met) { state = 'locked'; reason = `Learn ${skill.needs.map(nameOf).join(' or ')} first.`; }
    else if (skill.role && role !== skill.role) { state = 'locked'; reason = role ? `Only a ${ROLE_BY_ID[skill.role].name} can learn this.` : `Pick the ${ROLE_BY_ID[skill.role].name} role first.`; }
    else if (points < skill.cost) { state = 'locked'; reason = 'Win new waves to earn skill points.'; }
    const cost = `${skill.cost} ${skill.cost === 1 ? 'point' : 'points'}`;
    const word = {learned: 'learned', ready: 'can learn', locked: 'locked', closed: 'closed'}[state];
    return {id: skill.id, name: skill.name, tier: skill.tier, cost: skill.cost, costText: cost, line: skill.line, state, reason,
      fork: !!skill.excludes, capstone: !!skill.role, role: skill.role,
      label: `${skill.name}, tier ${skill.tier}${skill.excludes ? `, choose this or ${nameOf(skill.excludes)}` : ''}${skill.role ? `, ${ROLE_BY_ID[skill.role].name} only` : ''}, ${cost}, ${word}`};
  };
  const branches = BRANCHES.map(branch => {
    const nodes = SKILLS.filter(skill => skill.branch === branch.id).map(nodeOf);
    const tiers = [1, 2, 3, 4, 5].map(tier => ({tier, fork: nodes.filter(node => node.tier === tier).length > 1, nodes: nodes.filter(node => node.tier === tier)}));
    const owner = ROLES.find(item => item.branch === branch.id);
    return {...branch, tiers, nodes, role: owner.id, roleName: owner.name};
  });
  const nodes = branches.flatMap(branch => branch.nodes);
  const chosen = nodes.find(item => item.id === picked) ?? nodes.find(item => item.state === 'ready') ?? nodes.find(item => item.state === 'locked') ?? nodes[0];
  const detail = {...chosen, button: busy === chosen.id ? 'Learning…' : chosen.state === 'learned' ? 'Learned' : chosen.state === 'closed' ? 'Closed' : 'Learn',
    disabled: chosen.state !== 'ready' || busy !== null};
  // The role choice (once, from captain level 3).
  const roleLevel = Number.isSafeInteger(skills?.roleLevel) ? skills.roleLevel : ROLE_LEVEL;
  const level = Number.isSafeInteger(captainLevel) ? captainLevel : 1, locked = level < roleLevel;
  const choices = ROLES.map(item => ({id: item.id, name: item.name, icon: item.icon, line: item.line, branchName: BRANCHES.find(b => b.id === item.branch).name,
    capstone: SKILLS.find(skill => skill.role === item.id).name,
    state: role === item.id ? 'picked' : role ? 'closed' : locked ? 'locked' : 'ready',
    label: `${item.name}, ${role === item.id ? 'your role' : role ? 'closed, respec to change' : locked ? `opens at captain level ${roleLevel}` : 'can pick'}`}));
  const shownRole = ROLE_BY_ID[pickedRole] ? pickedRole : role ?? 'medic', pickedChoice = choices.find(item => item.id === shownRole);
  const roleCard = {title: role ? `Your role: ${ROLE_BY_ID[role].name}` : 'Choose your role', current: role, icon: role ? ROLE_BY_ID[role].icon : '',
    lead: role ? 'Your role is set. A respec lets you choose again.' : locked ? `Reach captain level ${roleLevel} to choose a role.` : 'Pick one role. It decides which capstone you can reach, and your crew sees it.',
    choices, picked: shownRole, detail: {...pickedChoice, button: busyRole ? 'Choosing…' : role === shownRole ? 'Your role' : `Become ${/^[aeiou]/i.test(pickedChoice.name) ? 'an' : 'a'} ${pickedChoice.name}`,
      disabled: true},
    locked, level: roleLevel};
  roleCard.detail.disabled = !!role || locked || !!busyRole;
  // The respec: expensive, scaled with the captain level, server-checked.
  const price = Number.isSafeInteger(skills?.respecPrice) && skills.respecPrice > 0 ? skills.respecPrice : respecPrice(level), nothing = !known.length && !role;
  const respec = {price, priceText: coinText(price), line: 'Forget every skill and your role, get your points back and choose again.',
    button: busyRespec ? 'Resetting…' : respecAsk ? `Yes, reset for ${coinText(price)}` : `Respec · ${coinText(price)}`, ask: respecAsk && !nothing, disabled: busyRespec, reason: ''};
  if (nothing) { respec.disabled = true; respec.reason = 'Nothing to reset yet.'; }
  else if (coins === null) respec.reason = 'Your coins are still loading.';
  else if (coins < price) { respec.disabled = true; respec.reason = `Not enough 🪙: you need ${coinText(price - coins)} more.`; }
  return {title: 'Skills', points, pointsText: skillPointsText(points), line: 'Win new waves to earn skill points: one for every two waves.',
    branches, picked: chosen.id, detail, message, learned: known.length, role: roleCard, respec};
}

// The weapon shop (§15): buy once with coins, then equip one. weapons: the island answer's {owned,
// equipped, shop} (or null while loading: only the musket); wonWave: the best wave you won (unlocks).
//   row.action  'equip' | 'buy' | null (equipped already, or locked, or short of coins: row.reason says)
export function weaponsModel({weapons = null, coins = null, wonWave = 0, busy = null, message = ''} = {}) {
  const owned = new Set(['musket', ...(Array.isArray(weapons?.owned) ? weapons.owned.filter(id => WEAPON_BY_ID[id]) : [])]);
  const equipped = readWeapon(weapons?.equipped);
  const shop = new Map((Array.isArray(weapons?.shop) ? weapons.shop : []).filter(item => WEAPON_BY_ID[item?.id]).map(item => [item.id, item]));
  const rows = WEAPONS.map(weapon => {
    const sent = shop.get(weapon.id);
    const price = Number.isSafeInteger(sent?.price) ? sent.price : weapon.price, unlockWave = Number.isSafeInteger(sent?.unlockWave) ? sent.unlockWave : weapon.unlockWave;
    const row = {id: weapon.id, name: weapon.name, line: weapon.line, price, priceText: price ? coinText(price) : 'Free',
      owned: owned.has(weapon.id), equipped: weapon.id === equipped, action: null, button: '', disabled: true, reason: ''};
    if (row.equipped) { row.button = 'Equipped'; return row; }
    if (row.owned) { row.action = 'equip'; row.button = busy === weapon.id ? 'Equipping…' : 'Equip'; row.disabled = busy !== null; return row; }
    row.action = 'buy'; row.button = busy === weapon.id ? 'Buying…' : `Buy · ${coinText(price)}`;
    if (wonWave < unlockWave) { row.action = null; row.button = 'Locked'; row.reason = `${opensText(unlockWave)}.`; return row; }
    if (coins === null) row.reason = 'Your coins are still loading.';
    else if (coins < price) row.reason = `Not enough 🪙: you need ${coinText(price - coins)} more.`;
    else row.disabled = busy !== null;
    return row;
  });
  return {title: 'Weapons', lead: 'Buy a weapon once, then equip it. It changes how your captain shoots.', rows,
    equipped: WEAPON_BY_ID[equipped].name, message, coins: coins === null ? '' : `You have ${coinText(coins)}`};
}

// wave: the running wave there or null. countdown: whole seconds left before it starts, or null.
export function bellModel({wave = null, joined = false, countdown = null, busy = false, visitor = false,
  ownerName = '', waveBest = 0, message = ''} = {}) {
  const next = Math.max(1, (Number.isSafeInteger(waveBest) ? waveBest : 0) + 1);
  const model = {title: 'Harbor bell', line: '', button: 'Ring the bell', disabled: busy, message, action: 'ring'};
  if (wave && !joined) {
    model.line = `Wave ${wave.wave} is under way${visitor ? ` on ${ownerName ? `${ownerName}'s island` : 'this island'}` : ''}.`;
    model.button = busy ? 'Joining…' : 'Join the defense'; model.action = 'join';
  } else if (wave) {
    model.line = countdown > 0 ? `Wave ${wave.wave} arrives in ${countdown} s.` : `Wave ${wave.wave} is under way.`;
    model.button = 'Under way'; model.disabled = true; model.action = 'none';
  } else {
    model.line = `Ring it and wave ${next} sails in after a 10 second countdown.`;
    if (busy) model.button = 'Ringing…';
  }
  return model;
}

// Play with a friend (§6, GAME-V3.md §2: up to 10 players): the link, its QR and one line on what happens.
// problem: null while loading, 'signin' when the player is not signed in (no island yet), or a
// plain message when the island could not be read.
export function inviteModel(code, base, problem = null) {
  const shown = displayIslandCode(code);
  const model = {title: 'Play with a friend', lead: 'Send this link to up to 9 friends', code: shown || 'Loading…', url: shown ? visitUrl(code, base) : '',
    line: shown ? 'They tap Join, and you defend your island together.' : 'Your island code is still loading.', copy: 'Copy link'};
  if (shown || !problem) return model;
  if (problem === 'signin') return {...model, code: 'Not signed in',
    line: 'Sign in first, so your island gets its own code: Menu › Settings › Account › Sign in with GitHub. Then open this card again.'};
  return {...model, code: 'Island not loaded', line: `${problem} Close this card and open it again to try once more.`};
}
// The captains on your island (§11), from the presence room: name tags for the menu card.
export function captainsModel(names = []) {
  const list = [...new Set(names.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()))].slice(0, 9);
  return {title: 'Captains on your island', names: list,
    line: list.length ? `${list.length} of 9 friends here.` : 'Nobody else is here yet. Open Players and invite and send the link.'};
}

export const lootText = ({loot, coins}) => `${formatCoinDelta(loot)} loot · you have ${coinText(coins)}`;
export const countdownText = (seconds, wave) => (seconds > 0 ? `Pirates in ${seconds} s! Wave ${wave}` : `Wave ${wave}: the pirates are here!`);
// Whole seconds until startsAt. A clock far off the server's falls back to the full countdown.
export function secondsUntil(startsAt, now = Date.now(), {fresh = false, countdown = 10} = {}) {
  const left = (Date.parse(startsAt) - now) / 1000;
  if (!Number.isFinite(left)) return fresh ? countdown : 0;
  if (fresh && (left < 0 || left > countdown + 2)) return countdown;
  return Math.max(0, Math.ceil(left));
}

// --- the island's campaign buildings (GAME-V3.md §4 and §5): the Harbor, the Tech hub, the wreck ---------
// campaign: campaignOf(island) of the island on screen. A building that is not open yet shows its card with
// "Opens after wave N" (so players see what is coming), and no button.
const lockedLine = id => `${opensText(waveOf(id))}.`;

// The Harbor (after wave 4): the market stall now, the football match board after wave 7.
export function harborModel({campaign = null} = {}) {
  const open = isOpen(campaign, 'harbor');
  const stall = (id, item, name, line) => ({id, name, line, open: isOpen(campaign, item),
    button: `Open the ${name.toLowerCase()}`, reason: isOpen(campaign, item) ? '' : lockedLine(item)});
  return {title: 'The Harbor', open, line: open ? 'The market stall and the match board stand here.' : lockedLine('harbor'),
    stalls: open ? [stall('market', 'market_calls', 'Market stall', 'Up or down in 5 minutes? Put a few coins on a real price.'),
      stall('match', 'football_board', 'Match board', 'Pick who wins a real football match.')] : []};
}

// The Tech hub (GAME-V3.md §5, §5.1): one branch per tower kind, three tiers each, paid by any member for the
// whole island. Tier 1 unlocks the kind's skills; tiers 2 and 3 are forks of two options (the island picks one,
// the other is closed; a change costs the tier's price again). Tier 2 opens after wave 15, tier 3 after 25.
// A branch with research done is folded into one row ("Cannon skills · tier 2 of 3 ✓"); `next` names the
// first step the crew can take now, so it stands out.
//   branches: [{branch, name, tier, summary, folded, tiers: [{tier, state, fork, reason, nodes: [{id, name,
//     line, state, note, button: {label, aria, disabled, reason, action: {branch, tier, choice, change}} | null}]}]}]
//   tier state: done · next · locked;  node state: done · chosen · closed · open · locked
export function techModel({campaign = null, coins = null, busy = null, message = ''} = {}) {
  const open = isOpen(campaign, 'tech_hub');
  const sent = new Map((campaign?.research?.branches ?? []).map(item => [item?.branch, item]));
  const busyKey = action => `${action.branch}:${action.tier}:${action.choice ?? ''}`;
  let next = null;
  const branches = Object.values(BRANCH_BY_ID).map(branch => {
    const prices = branch.prices.map((price, index) => (Number.isSafeInteger(sent.get(branch.branch)?.prices?.[index]) ? sent.get(branch.branch).prices[index]
      : index === 0 && Number.isSafeInteger(sent.get(branch.branch)?.price) ? sent.get(branch.branch).price : price));
    const state = campaign?.research?.tiers?.[branch.branch] ?? readTier(branch.branch, campaign?.research?.done?.has(branch.branch) ? {tier: 1} : null);
    const kind = BUILDINGS[branch.branch].name.toLowerCase();
    // Why a step cannot be taken now ('' when it can), and the button that takes it.
    const why = (tier, price) => {
      if (!open) return lockedLine('tech_hub');
      if (!isOpen(campaign, tierItem(tier))) return `${opensText(tierWave(tier))}.`;
      if (state.tier < tier - 1) return `Research tier ${tier - 1} first.`;
      if (busy) return '';
      if (coins === null) return 'Your coins are still loading.';
      if (coins < price) return `Not enough 🪙: you need ${coinText(price - coins)} more.`;
      return '';
    };
    const act = (action, label, aria) => {
      const price = prices[action.tier - 1], reason = why(action.tier, price), mine = busy === busyKey(action);
      return {label: mine ? 'Researching…' : `${label} · ${coinText(price)}`, aria: `${label} ${aria}, ${coinText(price)}`,
        disabled: !!reason || !!busy, reason, action};
    };
    const tierState = tier => (state.tier >= tier ? 'done' : state.tier === tier - 1 && open && isOpen(campaign, tierItem(tier)) ? 'next' : 'locked');
    const lockText = tier => (!open ? lockedLine('tech_hub') : !isOpen(campaign, tierItem(tier)) ? `${opensText(tierWave(tier))}.` : `Research tier ${tier - 1} first.`);
    const tiers = [];
    // Tier 1: the kind's skills.
    const first = tierState(1);
    tiers.push({tier: 1, state: first, fork: false, reason: first === 'locked' ? lockText(1) : '',
      nodes: [{id: `${branch.branch}-1`, name: 'Tower skills', line: branch.specs.map(id => SPECS[id].name).join(' · '),
        state: first === 'done' ? 'done' : first === 'next' ? 'open' : 'locked',
        note: first === 'done' ? `Every ${kind} here can pick one of them.` : '',
        button: first === 'next' ? act({branch: branch.branch, tier: 1, choice: null, change: false}, 'Research', branch.name) : null}]});
    // Tiers 2 and 3: a fork of two options.
    for (const tier of [2, 3]) {
      const picked = tier === 2 ? state.tier2 : state.tier3, status = tierState(tier);
      tiers.push({tier, state: status, fork: true, reason: status === 'locked' ? lockText(tier) : '',
        nodes: optionsOf(branch.branch, tier).map(id => {
          const name = optionName(id), base = {id, name, line: optionLine(id)};
          if (picked === id) return {...base, state: 'chosen', note: tier === 3 ? `Every ${kind} here can pick ${name}.` : 'Your crew chose this.', button: null};
          if (picked) return {...base, state: 'closed', note: `Closed: your crew chose ${optionName(picked)}.`,
            button: act({branch: branch.branch, tier, choice: id, change: true}, 'Change to it', name)};
          if (status === 'next') return {...base, state: 'open', note: '', button: act({branch: branch.branch, tier, choice: id, change: false}, 'Pick', name)};
          return {...base, state: 'locked', note: '', button: null};
        })});
    }
    const step = tiers.find(item => item.state === 'next');
    if (step && !next) next = {branch: branch.branch, tier: step.tier,
      text: step.tier === 1 ? `Next: research ${branch.name.toLowerCase()} for ${coinText(prices[0])}.`
        : `Next: ${branch.name.toLowerCase()}, tier ${step.tier}. Pick one of two for ${coinText(prices[step.tier - 1])}.`};
    return {branch: branch.branch, name: branch.name, tier: state.tier, folded: state.tier >= 1,
      summary: state.tier >= 1 ? `${branch.name} · tier ${state.tier} of ${TOP_TIER} ✓` : branch.name,
      prices: prices.map(coinText), tiers, next: !!step};
  });
  return {title: 'Tech hub', open, next, line: open ? 'Research a tower kind for the whole island. Tiers 2 and 3 are a choice: decide together.'
    : lockedLine('tech_hub'), branches, message, coins: coins === null ? '' : `You have ${coinText(coins)}`};
}

// The wreck (after wave 6): members pay coins into her repair; at the goal she waits for sailing (later).
export function wreckModel({campaign = null, coins = null, busy = null, message = ''} = {}) {
  const open = isOpen(campaign, 'wreck'), wreck = campaign?.wreck ?? {paid: 0, goal: 500, gifts: [25, 100]};
  const paid = Math.min(wreck.goal, wreck.paid), left = wreck.goal - paid, done = left <= 0;
  const percent = Math.floor(paid / wreck.goal * 100);
  const model = {title: 'The wreck', open, done, paid, goal: wreck.goal, percent, progress: `${coinText(paid)} of ${coinText(wreck.goal)}`,
    line: !open ? lockedLine('wreck') : done ? 'Her hull is whole again, thanks to the whole crew.' : 'Pay a few coins into her repair after every wave. Anyone in the game can help.',
    gifts: [], message, coins: coins === null ? '' : `You have ${coinText(coins)}`};
  if (!open || done) return model;
  model.gifts = wreck.gifts.map(amount => {
    const pay = Math.min(amount, left);
    const gift = {amount, label: busy === amount ? 'Paying…' : `Give ${coinText(pay)}`, disabled: true, reason: ''};
    if (busy) return gift;
    if (coins === null) gift.reason = 'Your coins are still loading.';
    else if (coins < pay) gift.reason = `Not enough 🪙: you need ${coinText(pay - coins)} more.`;
    else gift.disabled = false;
    return gift;
  });
  return model;
}

// GAME-V3.md §4.2: the confirmation before a tear-down. quote: the server's {kind, name, level, refunds:
// [{id, name, coins, you}]} (null while it loads); busy: the tear-down is on its way. The safe button
// ("Keep it") is the one that takes the focus.
export function demolishModel({quote = null, busy = false, message = ''} = {}) {
  const name = quote?.name ?? BUILDINGS[quote?.kind]?.name ?? 'building';
  const title = quote ? `Tear down this ${name}?` : 'Tear down?';
  const model = {title, question: '', lines: [], refunds: [], button: busy ? 'Tearing down…' : 'Tear down', disabled: !quote || busy,
    keep: 'Keep it', message, after: 'The spot is empty again. You can build anything there that is open now.'};
  if (!quote) { model.question = message ? '' : 'Working out who gets coins back…'; return model; }
  const mine = quote.refunds.find(item => item.you), others = quote.refunds.filter(item => !item.you && item.coins > 0);
  model.question = `Tear down this ${name} (level ${quote.level})?`;
  model.refunds = quote.refunds.map(item => ({id: item.id, name: item.you ? 'You' : item.name, coins: coinText(item.coins), you: item.you}));
  model.lines = [mine && mine.coins > 0 ? `You get back ${coinText(mine.coins)}.` : 'You paid nothing for it, so you get nothing back.',
    ...others.map(item => `${item.name} gets back ${coinText(item.coins)}.`)];
  model.note = 'Everyone gets back half of what they paid for it.';
  return model;
}
// The toast for a payer whose refund arrived because a teammate tore the building down (the room's
// island_changed carries {who, kind, level, refunds: [{id, coins}]}); null when there is nothing for `me`.
export function refundToast({demolished, me, whoName = ''} = {}) {
  const mine = demolished?.refunds?.find(item => item?.id === me);
  if (!mine || !Number.isSafeInteger(mine.coins) || mine.coins <= 0 || demolished.who === me) return null;
  const name = BUILDINGS[demolished.kind]?.name ?? 'building';
  return `${whoName || 'A teammate'} tore down the ${name}. You got back ${coinText(mine.coins)}.`;
}
