// What the island's small cards say, as pure functions (no DOM): the build and upgrade card of a spot,
// the crew and captain panels, the harbor bell, Play with a friend and the loot toast. The server decides; these only describe its last answer.
import {BUILDINGS, CREW, CREW_IDS, CAPTAIN, CAPTAIN_MAX, SLOT_KINDS, maxLevel, priceFor, statLine, captainLine, lockedWave} from './td-rules.js';
import {towerKinds} from './defenses-v2.js';
import {displayIslandCode, visitUrl} from './codes.js';
import {formatCoinDelta, formatCoins} from '../lib/coins.js';
import {BRANCHES, ROLES, ROLE_BY_ID, ROLE_LEVEL, SKILLS, SKILL_BY_ID, isRole, pointsEarned, pointsSpent, readSkills, respecPrice} from '../pirates/captain-ids.js';
import {isExtraSpot} from './extra-spots.js';
import {opensText, spotWave, waveOf, isOpen, tierItem, tierWave} from '../campaign/index.js';
import {BRANCH_BY_ID, SPECS, TOP_TIER, isCapstone, optionLine, optionName, optionsOf, readSpec, readTier, skillPrice} from '../campaign/tech.js';
import {BOAT, GAME_TEXT as BOAT_TEXT, coinsFor} from '../pirates/boat/rules.js';
import {sharedBoatPay} from './shared-boat-card.js';
import {ROLES as HOUSE_ROLES, ROLE_IDS, ROLE_LEVEL as HOUSE_ROLE_LEVEL, readRole, roleLine} from '../campaign/houses.js';
import {towerTreeModel} from './tree-model.js';
import {nextWaveNumber} from './preparation-model.js';
import {buildStructureRecoveryView} from './structure-recovery-model.js';
import {isRetiredCaptainSkill, recoveryTechLine} from '../campaign/captain-repair-policy.js';
import {defenses, spotById} from './spots.js';
import {TOWER_TREES} from '../pirates/tower-trees.js';
import {cardFunds, canAffordCoins, exactCoinText, missingCoins} from './economy-view.js';
import {declaresPersonalCaptain, engineerCommitmentLine, personalRespecReason, readPersonalCaptain} from './economy-captain.js';
import {sharedBuildCard, sharedCrewCard, sharedTechCard, sharedWreckCard, sharedDemolitionCard} from './shared-cards.js';

// Coins always read "🪙 120" through formatCoins (BUILD-PLAN 3.2); an unknown amount reads "🪙 ?".
export const coinText = n => (Number.isSafeInteger(n) ? formatCoins(n) : exactCoinText(n));
const RECOVERY_HEALTH_KINDS = new Set(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);

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
// skills (GAME-V3.md §5): `skills` {line, choices: [{id, name, line, active, price, reason, disabled}]} or null (D051:
// `price` "🪙 150" on every skill but the active one, `reason` when the player cannot pay it).
// A visitor (§6, 11 Nov) builds and upgrades on the friend's island with their own coins: the same
// card, with "You pay · it stays on <owner>'s island" and no crew button.
// One primary button at most (the build or the upgrade); `soon` is the small "Coming soon" line.
// GAME-V3.md §4.2: a built building on an island (not Pirate Point) has a secondary "Tear down" in
// `demolish` {label, disabled, reason}; battle: a wave runs on screen, so it waits for the break.
// An empty tower spot offers towerKinds({point}): on the island the culverin (T43) too.
// D055: a built tower of a kind with an upgrade tree (cannon, mortar, harpoon, culverin, swivel nest) on an island
// also gets `tree` (tree-model.js): its levels as the trunk and two paths of three tiers above; `treePicked` is the
// tile the player tapped. The card then draws the tree in place of the plain Upgrade (the trunk tile upgrades).
export function buildCardModel({spotId, kind, slot = null, spot = null, coins = null, visitor = false, ownerName = '',
  busy = false, message = '', unlocks = null, prices = null, point = false, campaign = null, battle = false, movable = false,
  treePicked = null, recoveryState = null, recoveryStatus = 'disabled', recoveryError = null, recoveryPending = false,
  recoveryVersion = 0, economy = undefined, sharedSnapshot = null} = {}) {
  if (!point && economy !== undefined) {
    const model = sharedBuildCard({spotId,kind,slot,spot,busy,message,battle,economy,sharedSnapshot,treePicked});
    if (spot?.built && RECOVERY_HEALTH_KINDS.has(spot.kind) && recoveryStatus !== 'disabled') {
      const row = recoveryState?.structures?.find(item => item.spot === spotId) ?? null;
      model.recoveryLevel = row?.level ?? null;
      model.recovery = buildStructureRecoveryView(recoveryState,row,{status:recoveryPending?'submitting':recoveryStatus,errorCode:recoveryError,coins,economy});
    }
    return model;
  }
  const funds = cardFunds(economy, coins); coins = funds.coins;
  const reserved = funds.shared && battle;
  const loading = funds.shared ? 'Island treasury unavailable. Reload the island.' : 'Your coins are still loading.';
  const place = slot ?? (kind === 'cannon' || kind === 'mortar' || kind === 'harpoon' || kind === 'culverin' || kind === 'swivel' ? 'tower' : kind ?? 'wall');
  const built = spot?.built === true, standing = built ? spot.kind : null;
  const level = built ? (Number.isSafeInteger(spot.level) && spot.level > 0 ? spot.level : 1) : 0;
  const shown = standing ?? (place === 'tower' ? null : SLOT_KINDS[place]?.[0] ?? kind);
  const info = BUILDINGS[shown] ?? null;
  const allowed = k => (unlocks ? unlocks.levels[k] ?? 0 : maxLevel(k));
  const enough = price => !reserved && canAffordCoins(coins, price);
  const short = price => reserved ? 'Between waves only.' : `Not enough 🪙: you need ${coinText(missingCoins(coins, price))} more.`;
  const model = {spotId, slot: place, title: info?.name ?? 'Tower spot', purpose: info?.line ?? (point ? 'Build a cannon or a mortar here.' : 'Build a cannon, a mortar or a harpoon tower here.'),
    mode: 'info', built, kind: shown, level, spec: built ? spot.spec ?? null : null, maxLevel: shown ? maxLevel(shown) : 0, pips: [], stats: '', choices: [], cost: '',
    button: '', disabled: true, reason: '', upgrade: null, soon: '', message, busy, skills: null, locked: false,
    coins: funds.line,
    owner: funds.shared ? 'Paid from the island treasury' : point ? 'Paid by you · belongs to Pirate Point' : visitor ? `You pay · it stays on ${ownerName ? `${ownerName}'s` : 'this'} island` : '', hire: false,
    demolish: null, move: null, tree: null};
  if (shown && level > 0) {
    model.pips = Array.from({length: model.maxLevel}, (_, index) => index < level);
    model.stats = statLine(shown, level);
  }
  if (!spot) { model.reason = message ? '' : visitor ? 'The island is still loading.' : 'Your island is still loading.'; return model; }
  model.hire = !point && !visitor && built && (place === 'tower' || place === 'wall');
  if (!point && built && RECOVERY_HEALTH_KINDS.has(shown) && recoveryStatus !== 'disabled') {
    const recovery = recoveryState?.structures?.find(item => item.spot === spotId) ?? null;
    model.recoveryLevel = recovery?.level ?? null;
    model.recovery = buildStructureRecoveryView(recoveryState, recovery, {
      status: recoveryPending ? 'submitting' : recoveryStatus,
      errorCode: recoveryError,
      coins,
    });
  }
  // A spot of a later campaign step (the inner wall ring after wave 5): shown, marked, not buildable yet.
  const spotNeeds = point ? 0 : spotWave(spotId), campaignWave = campaign?.wave ?? unlocks?.wonWave ?? 0;
  if (!built && spotNeeds > campaignWave) {
    model.locked = true; model.soon = `${opensText(spotNeeds)}.`;
    model.purpose = spotNeeds === waveOf('ring_walls') ? 'The inner ring of walls around the heart.'
      : isExtraSpot(spotId) ? 'A new tower spot: any tower can stand here once it opens.' : model.purpose;
    return model;
  }
  // T36: any spot of your island (built or empty) may move to another cell of the build grid, between waves.
  if (!point && movable) model.move = {label: 'Move', disabled: battle || !!busy, reason: battle ? 'You can move it between waves.' : ''};
  if (!built && place === 'tower') {
    model.mode = 'choose'; model.title = 'Tower spot'; model.purpose = 'Choose what to build. You cannot change it later.';
    for (const choice of towerKinds({point})) {
      const price = priceFor(choice, 0, prices);
      if (allowed(choice) < 1) {
        model.choices.push({kind: choice, name: BUILDINGS[choice].name, line: BUILDINGS[choice].line, price: coinText(price),
          disabled: true, locked: true, reason: `${opensText(lockedWave(unlocks, {kind: choice}) ?? '?')}.`, busy: false});
        continue;
      }
      model.choices.push({kind: choice, name: BUILDINGS[choice].name, line: BUILDINGS[choice].line, price: coinText(price),
        disabled: busy || !enough(price), reason: coins === null ? loading : enough(price) ? '' : short(price),
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
    if (coins === null) model.reason = loading;
    else if (!enough(price)) model.reason = short(price);
    else model.disabled = false;
    return model;
  }
  // Built: its tower skill (GAME-V3.md §5), then the next level, if any; and a way to tear it down (§4.2).
  if (!point && campaign && BRANCH_BY_ID[shown]) model.skills = skillsOf(shown, spot, campaign, busy, coins, prices, recoveryVersion);
  // GAME-V3.md "Houses": a house keeps its loot and, from level 2, picks a role (free, changeable between waves).
  if (!point && shown === 'house') model.skills = rolesOf(spot, level, busy, recoveryVersion);
  if (reserved && model.skills?.choices) model.skills.choices = model.skills.choices.map(choice => ({...choice, disabled: true, reason: 'Between waves only.'}));
  if (!point) model.demolish = {label: busy === 'demolish' ? 'Checking…' : 'Tear down', disabled: battle || !!busy,
    reason: battle ? 'You can tear it down between waves.' : ''};
  const recoveryRow = recoveryState?.recoveryVersion === 1
    ? recoveryState.structures?.find(item => item.spot === spotId) : null;
  if (shown === 'wall' && recoveryRow) model.stats = model.stats.replace(/^Strength\b/, 'Base strength');
  const recoveryUnavailable = RECOVERY_HEALTH_KINDS.has(shown)
    && (recoveryStatus === 'loading' || recoveryStatus === 'error'
      || (!!recoveryRow && recoveryRow.level !== level)
      || (recoveryVersion === 1 && (recoveryStatus !== 'ready' || !recoveryRow)));
  const upgradeBlockedReason = reserved ? 'Between waves only.' : recoveryUnavailable ? 'Wait until building health has loaded.'
    : recoveryRow && recoveryState.recoveryVersion === 1
    ? recoveryState.repairWindow === 'reserved_wave' ? 'Upgrades are available between waves.'
      : recoveryRow.hpUnits < 1_000_000 ? 'Repair to full before an upgrade.' : ''
    : '';
  if (!point) model.tree = towerTreeModel({kind: shown, spot, coins, prices, wave: campaignWave, unlocks, busy,
    picked: treePicked, upgradeBlockedReason});
  const next = level + 1;
  if (level >= model.maxLevel) { model.reason = shown === 'house' ? '' : 'Highest level reached.'; return model; }
  if (allowed(shown) < next) { model.soon = `Level ${next}: ${opensText(lockedWave(unlocks, {kind: shown, level: next}) ?? '?')}.`; return model; }
  const price = Number.isSafeInteger(spot.upgradeCost) ? spot.upgradeCost : priceFor(shown, level, prices);
  model.mode = 'upgrade';
  model.upgradePrice = coinText(price);
  model.upgrade = {label: `Level ${next} · ${coinText(price)}`, stats: statLine(shown, level, next)};
  if (shown === 'wall' && recoveryRow) model.upgrade.stats = model.upgrade.stats.replace(/^Strength\b/, 'Base strength');
  model.button = busy ? 'Upgrading…' : 'Upgrade';
  if (busy) return model;
  if (upgradeBlockedReason) model.reason = upgradeBlockedReason;
  else if (coins === null) model.reason = loading;
  else if (!enough(price)) model.reason = short(price);
  else model.disabled = false;
  return model;
}

// The tower skills of a built building (GAME-V3.md §5): the Tech hub opens after wave 8, its branch must be
// researched on this island, then one skill is picked (changeable between waves). D051: each pick costs coins,
// paid once by the player who clicks (skillPrice: islands.json skillCoins, the capstone dearer); the skill the
// tower has already is free. A choice carries its price ("🪙 150") and, when it cannot be paid, a short reason.
function skillsOf(kind, spot, campaign, busy, coins = null, prices = null, recoveryVersion = 0) {
  const branch = BRANCH_BY_ID[kind], current = readSpec(kind, spot?.spec);
  const retiredCurrent = recoveryVersion === 1 && current === 'quick_mend';
  const title = retiredCurrent ? `Stored skill: ${SPECS[current].name}` : current ? `Skill: ${SPECS[current].name}` : 'Tower skill';
  if (!isOpen(campaign, 'tech_hub')) return {title, line: `Tower skills: ${opensText(waveOf('tech_hub'))}.`, choices: [], current};
  if (!campaign.research.done.has(kind)) return {title, line: `Research ${branch.name.toLowerCase()} at the Tech hub first.`, choices: [], current};
  // Tier 3 (GAME-V3.md §5.1): the capstone the island chose is one more pick.
  const capstone = campaign.research.tiers?.[kind]?.tier3 ?? null;
  const choices = recoveryVersion === 1 ? branch.specs.filter(id => id !== 'quick_mend') : branch.specs;
  return {title, line: retiredCurrent ? 'This saved choice remains recorded but no longer affects repair.'
    : current ? 'Switch for the next wave.' : 'Pick one skill.', current,
    choices: [...choices, ...(capstone ? [capstone] : [])].map(id => skillChoice(kind, id, current, busy, coins, prices, recoveryVersion))};
}

// One tower skill on the card: its price, and whether this player can pay it now.
function skillChoice(kind, id, current, busy, coins, prices, recoveryVersion = 0) {
  const active = id === current, price = skillPrice(kind, id, prices), busyHere = busy === `spec:${id}`;
  let reason = '';
  if (!active && coins === null) reason = 'Coins loading';
  else if (!active && !canAffordCoins(coins, price)) reason = `Need ${coinText(missingCoins(coins, price))}`;
  return {id, name: SPECS[id].name, line: recoveryTechLine(id, SPECS[id].line, recoveryVersion), active, capstone: isCapstone(id), price: active ? '' : coinText(price), cost: active ? 0 : price,
    reason, disabled: active || busyHere || reason !== '', busy: busyHere,
    label: `${SPECS[id].name}, ${active ? 'your skill' : `${coinText(price)}${reason ? `, ${reason}` : ''}`}`};
}

// The roles of a built house (GAME-V3.md "Houses"): below level 2 one line says what comes; from level 2 the
// three roles with one plain line each, the active one marked. In the shape of skillsOf (the same card box).
function rolesOf(spot, level, busy, recoveryVersion = 0) {
  const current = level >= HOUSE_ROLE_LEVEL ? readRole('house', spot?.spec) : null;
  const title = current ? `Role: ${HOUSE_ROLES[current].name}` : 'House role';
  if (level < HOUSE_ROLE_LEVEL) {
    const line = recoveryVersion === 1 ? `Level ${HOUSE_ROLE_LEVEL}: choose Barracks or Tavern.`
      : `Level ${HOUSE_ROLE_LEVEL}: choose ${ROLE_IDS.map(id => HOUSE_ROLES[id].name).join(', ').replace(/, (?=[^,]*$)/, ' or ')}.`;
    return {title, line, choices: [], current, role: true};
  }
  const choices = recoveryVersion === 1 ? ROLE_IDS.filter(id => id !== 'workshop') : ROLE_IDS;
  const retiredWorkshop = recoveryVersion === 1 && current === 'workshop';
  return {title, line: retiredWorkshop ? 'This saved Workshop role stays recorded but is inactive; choose Barracks or Tavern to change it.'
    : current ? 'Pick another one for the next wave if you like.' : 'Pick one role for this house. It costs nothing.', current, role: true,
    choices: choices.map(id => ({id, name: HOUSE_ROLES[id].name, line: roleLine(id, recoveryVersion), active: id === current,
      disabled: id === current || busy === `spec:${id}`, busy: busy === `spec:${id}`}))};
}

// The crew panel (§3): one row per crew member that is unlocked; the locked ones in `soon`.
export function crewModel({crew = {}, coins = null, unlocks = null, busy = null, message = '', prices = null, battle = false, economy = undefined, recoveryVersion = 0, sharedSnapshot = null} = {}) {
  if (economy !== undefined) return sharedCrewCard({crew,busy,message,battle,economy,sharedSnapshot});
  const funds = cardFunds(economy, coins); coins = funds.coins;
  const rows = [], soon = [];
  for (const id of CREW_IDS) {
    if (recoveryVersion === 1 && id === 'carpenter' && !funds.shared) continue;
    const sent = prices?.crew?.[id], owned = Number.isSafeInteger(crew?.[id]) ? crew[id] : 0;
    const info = {...CREW[id], ...(Number.isSafeInteger(sent?.max) ? {max: sent.max} : {})};
    const price = Number.isSafeInteger(sent?.price) ? sent.price : info.price;
    const locked = unlocks && !unlocks.crew[id];
    if (locked && owned === 0) { soon.push(`${info.name}: ${opensText(lockedWave(unlocks, {crew: id}) ?? '?')}`); continue; }
    const full = owned >= info.max;
    const row = {id, name: info.name, line: info.line, price: coinText(price), owned: info.icon ? `${owned}/${info.max}` : `${owned} of ${info.max}`,
      button: busy === id ? 'Hiring…' : full ? 'Full' : 'Hire', disabled: true, reason: '', ...(info.icon ? {icon: info.icon} : {})};
    if (info.icon) row.disabled = full || !!busy || (funds.shared && battle) || !canAffordCoins(coins, price); // a compact tile (D052): no sentences
    else if (full) row.reason = info.max === 1 ? 'You have one.' : `You have ${info.max}, the most you can hire.`;
    else if (busy) row.reason = '';
    else if (funds.shared && battle) row.reason = 'Between waves only.';
    else if (coins === null) row.reason = funds.shared ? 'Island treasury unavailable. Reload the island.' : 'Your coins are still loading.';
    else if (!canAffordCoins(coins, price)) row.reason = `Not enough 🪙: you need ${coinText(missingCoins(coins, price))} more.`;
    else row.disabled = false;
    if (locked) { row.disabled = true; row.reason = opensText(lockedWave(unlocks, {crew: id}) ?? '?'); }
    // Shared islands do not sell Carpenters; existing counts remain visible for save conversion.
    if (funds.shared && id === 'carpenter') { row.disabled = true; row.button = 'Unavailable'; row.line = ''; row.reason = ''; }
    rows.push(row);
  }
  return {title: 'Crew', lead: rows.length ? funds.shared ? 'They help this island in every wave.' : 'They help in every wave and stay with you.'
    : `Crew members join after you win wave ${lockedWave(unlocks, {crew: 'gunner'})}.`,
  rows, soon: soon.length ? soon.join(' · ') : '', message, coins: funds.line};
}

// The captain panel (§10): the musket's level and the next one.
export function captainModel({captain = null, coins = null, unlocks = null, busy = false, message = '', economy = undefined, points = null} = {}) {
  const level = Number.isSafeInteger(captain?.level) && captain.level > 0 ? captain.level : 1, next = level + 1;
  const model = {title: 'Your captain', level, badge: `⚔️ ${level}`, pips: Array.from({length: CAPTAIN_MAX}, (_, index) => index < level),
    stats: captainLine(level), hint: 'Tap a ship to fire your musket (F).', upgrade: null, button: '', disabled: true, reason: '', soon: '', message,
    coins: coins === null ? '' : `You have ${coinText(coins)}`};
  if (economy !== undefined || declaresPersonalCaptain(captain)) {
    model.coins = skillPointsText(points);
    model.reason = readPersonalCaptain(captain) ? engineerCommitmentLine(captain) || 'Personal progress: win waves to develop your captain.'
      : 'Captain progress unavailable. Reload the island.';
    return model;
  }
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
  pickedRole = null, busyRole = null, respecAsk = false, busyRespec = false, battle = false, recoveryVersion = 0,
  economy = undefined, respecBlockedReason = '', personalCaptain = null} = {}) {
  const personal = economy !== undefined || declaresPersonalCaptain(personalCaptain), profile = personal ? readPersonalCaptain(personalCaptain) : null;
  const role = personal ? profile?.role ?? null : isRole(skills?.role) ? skills.role : null;
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
      fork: !!skill.excludes, capstone: !!skill.role, role: skill.role, needs: skill.needs,
      label: `${skill.name}, tier ${skill.tier}${skill.excludes ? `, choose this or ${nameOf(skill.excludes)}` : ''}${skill.role ? `, ${ROLE_BY_ID[skill.role].name} only` : ''}, ${cost}, ${word}`};
  };
  const branches = BRANCHES.map(branch => {
    const nodes = SKILLS.filter(skill => skill.branch === branch.id && !isRetiredCaptainSkill(skill.id, personal ? 1 : recoveryVersion)).map(nodeOf);
    const tiers = [1, 2, 3, 4, 5].map(tier => ({tier, fork: nodes.filter(node => node.tier === tier).length > 1, nodes: nodes.filter(node => node.tier === tier)}));
    const owner = ROLES.find(item => item.branch === branch.id);
    // The tile the branch opens on (the phone shows one branch at a time): one you can learn, else a locked one, else its root.
    const first = nodes.find(node => node.state === 'ready') ?? nodes.find(node => node.state === 'locked') ?? nodes[0];
    const start = first?.id ?? null;
    return {...branch, tiers, nodes, start, role: owner.id, roleName: owner.name};
  }).filter(branch => branch.nodes.length);
  const nodes = branches.flatMap(branch => branch.nodes);
  const chosen = nodes.find(item => item.id === picked) ?? nodes.find(item => item.state === 'ready') ?? nodes.find(item => item.state === 'locked') ?? nodes[0];
  const detail = {...chosen, button: busy === chosen.id ? 'Learning…' : chosen.state === 'learned' ? 'Learned' : chosen.state === 'closed' ? 'Closed' : 'Learn',
    disabled: chosen.state !== 'ready' || busy !== null};
  if (personal && (!profile || profile.assignmentWaveId !== null)) detail.disabled = true;
  // The role choice (once, from captain level 3).
  const roleLevel = Number.isSafeInteger(skills?.roleLevel) ? skills.roleLevel : ROLE_LEVEL;
  const level = Number.isSafeInteger(captainLevel) ? captainLevel : 1, locked = level < roleLevel;
  const choices = ROLES.map(item => ({id: item.id, name: item.name, icon: item.icon,
    line: personal && item.id === 'engineer' ? 'Construction and building upgrades cost 10% less.'
      : recoveryVersion === 1 && item.id === 'engineer' ? 'Buildings and upgrades cost you 10% less.' : item.line,
    branchName: BRANCHES.find(b => b.id === item.branch).name,
    capstone: (personal || recoveryVersion === 1) && item.id === 'engineer' ? '' : SKILLS.find(skill => skill.role === item.id)?.name ?? '',
    state: role === item.id ? 'picked' : role ? 'closed' : locked ? 'locked' : 'ready',
    label: `${item.name}, ${role === item.id ? 'your role' : personal && profile?.roleLockedReason === 'engineer_bound' ? 'locked until your next completed wave'
      : role ? 'closed, respec to change' : locked ? `opens at captain level ${roleLevel}` : 'can pick'}`}));
  const shownRole = ROLE_BY_ID[pickedRole] ? pickedRole : role ?? 'medic', pickedChoice = choices.find(item => item.id === shownRole);
  const roleCard = {title: role ? `Your role: ${ROLE_BY_ID[role].name}` : 'Choose your role', current: role, icon: role ? ROLE_BY_ID[role].icon : '',
    lead: role ? 'Your role is set. A respec lets you choose again.' : locked ? `Reach captain level ${roleLevel} to choose a role.` : 'Pick one role. It decides which capstone you can reach, and your crew sees it.',
    choices, picked: shownRole, detail: {...pickedChoice, button: busyRole ? 'Choosing…' : role === shownRole ? 'Your role' : `Become ${/^[aeiou]/i.test(pickedChoice.name) ? 'an' : 'a'} ${pickedChoice.name}`,
      disabled: true},
    locked, level: roleLevel};
  const commitmentLine = personal ? engineerCommitmentLine(profile) : '';
  if (commitmentLine) roleCard.lead = commitmentLine;
  roleCard.detail.disabled = !!role || locked || !!busyRole;
  if (personal && (!profile || profile.roleLockedReason !== null)) {
    roleCard.detail.disabled = true;
    roleCard.locked = true;
    roleCard.lead = commitmentLine || personalRespecReason(profile);
  }
  // Personal v1 respec is free; legacy prices remain scaled with Captain level. The server authorizes either.
  const price = personal ? 0 : Number.isSafeInteger(skills?.respecPrice) && skills.respecPrice > 0 ? skills.respecPrice : respecPrice(level), nothing = !known.length && !role;
  const respec = {price, priceText: coinText(price), line: 'Forget every skill and your role, get your points back and choose again.',
    button: busyRespec ? 'Resetting…' : personal ? respecAsk ? 'Yes, reset skills' : 'Respec' : respecAsk ? `Yes, reset for ${coinText(price)}` : `Respec · ${coinText(price)}`,
    ask: respecAsk && !nothing, disabled: busyRespec, reason: ''};
  if (commitmentLine) respec.line = 'Reset skill choices and keep Engineer for your next wave.';
  if (nothing) { respec.disabled = true; respec.reason = 'Nothing to reset yet.'; }
  else if (!personal && battle) { respec.disabled = true; respec.reason = 'Between waves only.'; }
  else if (personal && (respecBlockedReason || personalRespecReason(profile))) { respec.disabled = true; respec.reason = respecBlockedReason || personalRespecReason(profile); }
  else if (!personal && coins === null) respec.reason = 'Your coins are still loading.';
  else if (!personal && coins < price) { respec.disabled = true; respec.reason = `Not enough 🪙: you need ${coinText(price - coins)} more.`; }
  return {title: 'Skills', recoveryVersion, points, pointsText: skillPointsText(points), line: personal ? 'Win personal wave milestones to earn skill points.' : 'Win new waves to earn skill points: one for every two waves.',
    branches, picked: chosen.id, detail, message, learned: known.length, role: roleCard, respec};
}

// wave: the running wave there or null. countdown: whole seconds left before it starts, or null.
export function bellModel({wave = null, joined = false, countdown = null, busy = false, visitor = false,
  ownerName = '', waveBest = 0, nextWave, preparation = null, message = ''} = {}) {
  const next = nextWaveNumber(nextWave, waveBest);
  const model = {title: 'Harbor bell', line: '', button: 'Ring the bell', disabled: busy, message, action: 'ring'};
  if (wave && !joined) {
    model.line = `Wave ${wave.wave} is under way${visitor ? ` on ${ownerName ? `${ownerName}'s island` : 'this island'}` : ''}.`;
    model.button = busy ? 'Joining…' : 'Join the defense'; model.action = 'join';
  } else if (wave) {
    model.line = countdown > 0 ? `Wave ${wave.wave} arrives in ${countdown} s.` : `Wave ${wave.wave} is under way.`;
    model.button = 'Under way'; model.disabled = true; model.action = 'none';
  } else {
    model.line = `Ring it and wave ${next} sails in after a 10 second countdown.`;
    model.preparation = preparation;
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

// Only the gain: the coin chip (top left) already shows the total (owner, 16 Nov: "you have" read as confusing).
export const lootText = ({loot}) => `Loot ${formatCoinDelta(loot)}`;
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

// The Harbor (after wave 4): market and weather now, the football match board after wave 7. Calm (owner, 15 Nov):
// no lead line, one short line per stall and a short "Open" button (its label names the stall for screen readers).
export function harborModel({campaign = null} = {}) {
  const open = isOpen(campaign, 'harbor');
  const stall = (id, item, name, line, icon) => ({id, name, line, icon, open: isOpen(campaign, item),
    button: 'Open', label: `Open the ${name.toLowerCase()}`, reason: isOpen(campaign, item) ? '' : lockedLine(item)});
  return {title: 'The Harbor', open, line: open ? '' : lockedLine('harbor'),
    stalls: open ? [stall('market', 'market_calls', 'Market stall', 'Up or down in 5 minutes? Put a few coins on it.', '📈'),
      stall('match', 'football_board', 'Match board', 'Pick who wins a real match.', '⚽'),
      stall('weather', 'harbor', 'Weather board', 'Live weather, and what it does to the pirates.', '⛅')] : []};
}

// The Tech hub (GAME-V3.md §5, §5.1): one branch per tower kind, three tiers each, paid by any member for the
// whole island. Tier 1 unlocks the kind's skills; tiers 2 and 3 are forks of two options (the island picks one,
// the other is closed; a change costs the tier's price again). Tier 2 opens after wave 15, tier 3 after 25.
// A branch with research done is folded into one row ("Cannon skills · tier 2 of 3 ✓"); `next` names the
// first step the crew can take now, so it stands out.
//   branches: [{branch, name, tier, summary, folded, tiers: [{tier, state, fork, reason, nodes: [{id, name,
//     line, state, note, button: {label, aria, disabled, reason, action: {branch, tier, choice, change}} | null}]}]}]
//   tier state: done · next · locked;  node state: done · chosen · closed · open · locked
export function techModel({campaign = null, spots = null, towerPrices = null, coins = null, busy = null, message = '', battle = false, recoveryVersion = 0, economy = undefined, sharedSnapshot = null} = {}) {
  if (economy !== undefined) return sharedTechCard({economy,sharedSnapshot,busy,message,battle,recoveryVersion});
  const funds = cardFunds(economy, coins); coins = funds.coins;
  const open = isOpen(campaign, 'tech_hub');
  const sent = new Map((campaign?.research?.branches ?? []).map(item => [item?.branch, item]));
  const installed = Array.isArray(spots) ? defenses(spots, campaign?.research?.tiers).filter(spot => spotById(spot.id)) : null;
  const busyKey = action => `${action.branch}:${action.tier}:${action.choice ?? ''}`;
  let next = null;
  const branches = Object.values(BRANCH_BY_ID).map(branch => {
    const prices = branch.prices.map((price, index) => (Number.isSafeInteger(sent.get(branch.branch)?.prices?.[index]) ? sent.get(branch.branch).prices[index]
      : index === 0 && Number.isSafeInteger(sent.get(branch.branch)?.price) ? sent.get(branch.branch).price : price));
    const state = campaign?.research?.tiers?.[branch.branch] ?? readTier(branch.branch, campaign?.research?.done?.has(branch.branch) ? {tier: 1} : null);
    const kind = BUILDINGS[branch.branch].name.toLowerCase();
    const built = installed?.filter(spot => spot.kind === branch.branch) ?? null;
    const eligibleLookouts = built?.filter(spot => spot.spec === 'spotter' || spot.spec === 'signal_fire') ?? null;
    const scope = {ids: built?.map(spot => spotById(spot.id).id) ?? null, kind, tree: !!TOWER_TREES[branch.branch],
      eligibleLookouts: eligibleLookouts?.length ?? null};
    // Why a step cannot be taken now ('' when it can), and the button that takes it.
    const why = (tier, price) => {
      if (!open) return lockedLine('tech_hub');
      if (!isOpen(campaign, tierItem(tier))) return `${opensText(tierWave(tier))}.`;
      if (state.tier < tier - 1) return `Research tier ${tier - 1} first.`;
      if (battle) return 'Between waves only.'; // a tier-3 change would strip a capstone mid-wave; the server refuses too
      if (busy) return '';
      if (coins === null) return funds.shared ? 'Island treasury unavailable. Reload the island.' : 'Your coins are still loading.';
      if (!canAffordCoins(coins, price)) return `Not enough 🪙: you need ${coinText(missingCoins(coins, price))} more.`;
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
    const availableSpecs = recoveryVersion === 1 && branch.branch === 'wall'
      ? branch.specs.filter(id => id !== 'quick_mend') : branch.specs;
    tiers.push({tier: 1, state: first, fork: false, reason: first === 'locked' ? lockText(1) : '',
      nodes: [{id: `${branch.branch}-1`, name: 'Tower skills', line: availableSpecs.map(id => SPECS[id].name).join(' · '),
        state: first === 'done' ? 'done' : first === 'next' ? 'open' : 'locked',
        note: '', scopeLine: 'Unlocks a paid skill choice per defense.',
        button: first === 'next' ? act({branch: branch.branch, tier: 1, choice: null, change: false}, 'Research', branch.name) : null}]});
    // Tiers 2 and 3: a fork of two options.
    for (const tier of [2, 3]) {
      const picked = tier === 2 ? state.tier2 : state.tier3, status = tierState(tier);
      const choices = optionsOf(branch.branch, tier).filter(id => recoveryVersion !== 1 || id !== 'mason_drill' || picked === id);
      const nodes = choices.map(id => {
        const retiredDrill = recoveryVersion === 1 && id === 'mason_drill';
        const name = optionName(id);
        let scopeLine = tier === 3 ? 'Each defense needs its own paid capstone pick.' : 'Research adds this bonus automatically.';
        if (id === 'lookout_drill') scopeLine = `Requires Spotter or Signal Fire.${built?.length ? ` Equipped on ${scope.eligibleLookouts} of ${built.length}.` : ''}`;
        if (retiredDrill) scopeLine = '';
        const base = {id, name, line: recoveryTechLine(id, optionLine(id), recoveryVersion), scopeLine};
        if (picked === id) return {...base, state: 'chosen', note: retiredDrill ? '' : 'Your crew chose this.', button: null};
        if (picked) return {...base, state: 'closed', note: `Closed: your crew chose ${optionName(picked)}.`,
          button: act({branch: branch.branch, tier, choice: id, change: true}, 'Change to it', name)};
        if (status === 'next') return {...base, state: 'open', note: '', button: act({branch: branch.branch, tier, choice: id, change: false}, 'Pick', name)};
        return {...base, state: 'locked', note: '', button: null};
      });
      const capstone = tier === 3 && picked && nodes.length === 2 ? {
        current: nodes.find(node => node.id === picked), alternative: nodes.find(node => node.id !== picked),
        equippedIds: built?.filter(spot => spot.spec === picked).map(spot => spotById(spot.id).id) ?? null,
        researchPrice: coinText(prices[tier - 1]), equipPrice: coinText(skillPrice(branch.branch, picked, towerPrices)),
      } : null;
      tiers.push({tier, state: status, fork: choices.length > 1, reason: status === 'locked' ? lockText(tier) : '', nodes, capstone});
    }
    const step = tiers.find(item => item.state === 'next');
    if (step && !next) next = {branch: branch.branch, tier: step.tier,
      text: step.tier === 1 ? `Next: research ${branch.name.toLowerCase()} for ${coinText(prices[0])}.`
        : `Next: ${branch.name.toLowerCase()}, tier ${step.tier}. Pick one of two for ${coinText(prices[step.tier - 1])}.`};
    return {branch: branch.branch, name: branch.name, short: BUILDINGS[branch.branch].name, tier: state.tier, folded: state.tier >= 1, scope,
      summary: state.tier >= 1 ? `${branch.name} · tier ${state.tier} of ${TOP_TIER} ✓` : branch.name,
      prices: prices.map(coinText), tiers, next: !!step};
  });
  return {title: 'Tech hub', recoveryVersion, open, next, line: open ? 'Research a tower kind for the whole island. Tiers 2 and 3 are a choice: decide together.'
    : lockedLine('tech_hub'), branches, message, coins: funds.line};
}

// The wreck (after wave 6): members pay coins into her repair. D057: from wave 30 the repaired wreck is the
// island's own boat: her card lists the boat's games (boat: GET /api/island/boat, null while it loads).
export function wreckModel({campaign = null, coins = null, busy = null, message = '', boat = null, battle = false, economy = undefined, requireRewardScope = false, sharedSnapshot = null} = {}) {
  if (economy !== undefined) {
    const model = sharedWreckCard({economy,sharedSnapshot,busy,message,battle});
    model.sail = sailModel({campaign,done:model.done,boat,battle,requireRewardScope});
    if (model.sail.open) {
      model.title = 'Your ship';
      model.line = boat?.rewardScope === 'island'
        ? 'Attempts are free. Each game pays the island only for positive improvements, up to its shared cap for this island wave record.'
        : 'Refresh the ship to read its current reward scope before sailing.';
    }
    return model;
  }
  const funds = cardFunds(economy, coins); coins = funds.coins;
  const open = isOpen(campaign, 'wreck'), wreck = campaign?.wreck ?? {paid: 0, goal: 500, gifts: [25, 100]};
  const paid = Math.min(wreck.goal, wreck.paid), left = wreck.goal - paid, done = left <= 0;
  const percent = Math.floor(paid / wreck.goal * 100);
  const sail = sailModel({campaign, done, boat, battle, requireRewardScope});
  const model = {title: sail.open ? 'Your ship' : 'The wreck', open, done, paid, goal: wreck.goal, percent, progress: `${coinText(paid)} of ${coinText(wreck.goal)}`,
    line: !open ? lockedLine('wreck') : sail.open && requireRewardScope && !['island','player'].includes(boat?.rewardScope)
      ? 'Refresh the ship to read its current reward scope before sailing.' : sail.open && boat?.rewardScope === 'island'
      ? 'Attempts are free. Each game pays the island only for positive improvements, up to its shared cap for this island wave record.'
      : sail.open ? 'Attempts are free. Each game pays only for your first round with at least 1 star after a won wave. Later rounds pay no extra coins for a higher score. Win another wave to earn again.'
      : done ? 'Her hull is whole again, thanks to the whole crew.' : 'Pay a few coins into her repair after every wave. Anyone in the game can help.',
    gifts: [], message, coins: funds.line, sail};
  if (!open || done) return model;
  model.gifts = wreck.gifts.map(amount => {
    const pay = Math.min(amount, left);
    const gift = {amount, label: busy === amount ? 'Paying…' : `Give ${coinText(pay)}`, disabled: true, reason: ''};
    if (busy) return gift;
    if (funds.shared && battle) gift.reason = 'Between waves only.';
    else if (coins === null) gift.reason = funds.shared ? 'Island treasury unavailable. Reload the island.' : 'Your coins are still loading.';
    else if (!canAffordCoins(coins, pay)) gift.reason = `Not enough 🪙: you need ${coinText(missingCoins(coins, pay))} more.`;
    else gift.disabled = false;
    return gift;
  });
  return model;
}

// D057: the boat's part of the wreck card. Open once the ship step (wave 30) is reached and the repair is done;
// one tile per game with what 3 stars pay at this wave, or "Paid ✓" once this player was paid at this wave.
export function sailModel({campaign = null, done = false, boat = null, battle = false, requireRewardScope = false} = {}) {
  const wave = campaign?.wave ?? 0, shipOpen = isOpen(campaign, 'ship'), open = shipOpen && done && boat?.open !== false;
  const note = !shipOpen ? `She sails after wave ${waveOf('ship')}.` : !done ? 'Finish her repair and she sails.'
    : battle ? 'Sail between waves.' : '';
  const paid = new Map((boat?.games ?? []).map(item => [item.id, item.paid === true]));
  const unknownRewards = requireRewardScope && !['island', 'player'].includes(boat?.rewardScope);
  const games = BOAT.games.map(id => {
    const shared = boat?.rewardScope === 'island';
    const reward = shared ? boat.games.find(game => game.id === id) : null;
    const best = reward?.best ?? coinsFor(BOAT.stars, wave), isPaid = paid.get(id) === true;
    return {id, icon: BOAT_TEXT[id].icon, title: BOAT_TEXT[id].title, paid: isPaid, best,
      pay: unknownRewards ? 'Rewards unavailable · refresh the ship' : reward ? sharedBoatPay(reward) : shared ? 'Loading island rewards…'
        : isPaid ? 'Paid ✓ · play for fun' : `★★★ = ${coinText(best)}`,
      disabled: !open || battle || unknownRewards || (shared && !reward)};
  });
  return {open, note, wave, games: open ? games : []};
}

// GAME-V3.md §4.2: the confirmation before a tear-down. quote: the server's {kind, name, level, refunds:
// [{id, name, coins, you}]} (null while it loads); busy: the tear-down is on its way. The safe button
// ("Keep it") is the one that takes the focus.
export function demolishModel({quote = null, busy = false, message = ''} = {}) {
  if (quote?.quoteVersion === 1) return sharedDemolitionCard({quote,busy,message});
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
