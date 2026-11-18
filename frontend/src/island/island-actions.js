// What the player does to the island (index.js): build, upgrade, repair a wall, tear down, specialise, buy a
// tree tier, Move mode and Village mode, research, give to the wreck, hire crew, and the captain's level,
// skills, role and respec. Each calls the server and lands its answer. A closure over the island's state `isl`.

import {KINDS, isPointSpot, placedSpot, spotById, ppSpotById} from './spots.js';
import {coinText, refundToast} from './card-model.js';
import {previewHouseSupport} from './house-support-model.js';
import {isOpen, waveOf} from '../campaign/index.js';
import {BRANCH_BY_ID, SPECS, optionName} from '../campaign/tech.js';
import {TOWER_TREES} from '../pirates/tower-trees.js';
import {ROLES, activeRole} from '../campaign/houses.js';
import {ROLE_BY_ID, SKILL_BY_ID, isRole} from '../pirates/captain-ids.js';
import {islandCode} from './codes.js';
import {ISLAND_BUILT, ISLAND_UPGRADED, CREW_HIRED} from '../ui/quest-events.js';
import {CREW, BUILDINGS} from './td-rules.js';
import {SPOTS_CHANGED, TOWER_SPECIALISED, TOWER_TREE_BOUGHT, HOUSE_ROLE_PICKED} from './island-shared.js';

export function createActions(isl) {
  const {emit, focus, resetInput, reducedMotion, now, wallRecovery} = isl;
  // From the other parts (island-*.js), linked once every part exists.
  let recoveryControlsOn, recoveryPolicyOn, readStructureRecovery, setOwn, campaign, wrote, target, shownIsland, researchIsland, where,
    placeOf, tookCoins, reloadVisit, reloadOwn, refreshDefended, took, refused, lobby, colours, bellAction,
    demolishHandlers, demolishCardModel, readBoat, bell, refreshCard, refreshCardIfBuild;
  const onWhere = place => (place === 'point' ? ' for Pirate Point' : place === 'visit' ? ` on ${isl.visiting?.ownerName ? `${isl.visiting.ownerName}'s` : 'this'} island` : '');
  function invalidatePurchaseFeedback() {
    isl.purchaseFeedbackGeneration++;
    isl.world?.clearPurchaseFeedback();
    isl.ui.clearBuildingFeedback();
  }
  function purchaseFeedbackScope() {
    const code = islandCode(target()?.code ?? '');
    return code && (!isl.visitCode || code === isl.visitCode) ? `${code}:${isl.purchaseFeedbackGeneration}` : null;
  }
  const ownPurchaseView = () => !isl.visiting && !isl.visitCode && !isl.moving.active;
  function purchaseAt(spot, upgrading, kind = null) {
    if (!isl.world || isl.battle || !spot) return null;
    const scope = purchaseFeedbackScope();
    const spots = target()?.spots;
    const before = spots?.find(item => item.id === spot.id);
    if (!scope || !before || before.built !== upgrading) return null;
    const chosen = upgrading ? before.kind : kind;
    const level = upgrading ? before.level + 1 : 1;
    if (spot.slot === 'wall') {
      return chosen === 'wall' ? {scope, world: isl.world, spotId: spot.id, kind: chosen, level} : null;
    }
    if (!Object.hasOwn(KINDS, chosen) || chosen === 'wall' || !ownPurchaseView()
        || !Number.isSafeInteger(level) || level < 1) return null;
    const {x, z} = placedSpot(spot.id, spots);
    return {scope, world: isl.world, spotId: spot.id, kind: chosen, level, x, z};
  }
  function showPurchase(action, answer, wallReceipt = '') {
    if (!action || !answer.ok || answer.reconciled || action.world !== isl.world || action.scope !== purchaseFeedbackScope()
        || islandCode(answer.data.code ?? '') !== islandCode(target()?.code ?? '')) return;
    const confirmed = answer.data.spots.find(spot => spot.id === action.spotId);
    if (confirmed?.built !== true || confirmed.kind !== action.kind || confirmed.level !== action.level) return;
    if (action.kind === 'wall') {
      isl.world.showWallFeedback(action.spotId, action.level);
      return wallReceipt && isl.ui.showWallReceipt(action.spotId, wallReceipt, reducedMotion());
    }
    const at = placedSpot(action.spotId, answer.data.spots);
    if (!ownPurchaseView() || at?.x !== action.x || at?.z !== action.z) return;
    if (isl.world.showBuildingFeedback(action) && action.level > 1)
      isl.ui.showBuildingFeedback(action.spotId, action.kind, reducedMotion());
  }
  async function build(spotId, kind) {
    const place = placeOf(spotId), spot = place === 'point' ? ppSpotById(spotId) : spotById(spotId);
    const choice = kind ?? spot?.kind;
    if (!spot || isl.busySpot || !BUILDINGS[choice]) return;
    const action = place !== 'point' ? purchaseAt(spot, false, choice) : null;
    isl.busySpot = spotId; isl.busyKind = choice; isl.cardMessage = ''; refreshCard();
    const answer = place === 'point' ? await isl.api.pointBuild({spot: spotId, kind: choice})
      : await isl.api.build({spot: spotId, kind: choice, ...(place === 'visit' ? {code: isl.visiting.code} : {})});
    if (isl.disposed) return;
    isl.busySpot = null; isl.busyKind = null;
    if (answer.ok) {
      await took(answer, place);
      if (isl.disposed) return;
      if (place === 'own') emit({type: ISLAND_BUILT, kind: choice, spot: spotId});
      emit({type: SPOTS_CHANGED, place, spot: spotId});
      // Close the card so the new building and the toast can be seen.
      if (isl.ui.open === 'build' && isl.openSpot === spotId) { isl.ui.close(); isl.openSpot = null; }
      isl.ui.toast(`${BUILDINGS[choice].name} built${onWhere(place)} · ${coinText(isl.own?.coins)}`, 'success');
    } else await refused(answer, place, spotId);
    refreshCard();
    showPurchase(action, answer);
  }
  // D039 (flag wall_recovery): the walls' health of the island on screen; nothing at all while the flag is off.
  async function readWalls() {
    if (!wallRecovery() || isPointSpot(isl.openSpot ?? '')) return;
    const asked = target()?.code;
    const answer = await isl.api.walls({code: isl.visiting ? isl.visiting.code : null});
    if (isl.disposed || !answer.ok || asked !== target()?.code) return;
    isl.walls = new Map(answer.data.walls.map(wall => [wall.spot, wall])); isl.wallsFor = target()?.code ?? null;
    refreshCardIfBuild();
    if (isl.ui.open === 'bell') isl.ui.bellCard(bell(), bellAction);
  }
  async function repairWall(spotId) {
    const place = placeOf(spotId);
    if (isl.busySpot || place === 'point') return;
    const asked = target()?.code;
    isl.busySpot = spotId; isl.busyKind = 'repair'; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.repairWall({spot: spotId, ...(place === 'visit' ? {code: isl.visiting.code} : {})});
    if (isl.disposed) return;
    isl.busySpot = null; isl.busyKind = null;
    if (asked !== target()?.code) { refreshCard(); return; }
    if (answer.ok) {
      isl.walls = new Map(answer.data.walls.map(wall => [wall.spot, wall])); isl.wallsFor = target()?.code ?? null;
      tookCoins(answer.data.coins);
      // The fresh health goes along, so the wave's picture of this island stops drawing the old damage.
      emit({type: SPOTS_CHANGED, place, spot: spotId, walls: Object.fromEntries(answer.data.walls.map(wall => [wall.spot, wall.health]))});
      isl.ui.toast(`Wall repaired${onWhere(place)} · ${coinText(answer.data.coins)}`, 'success');
    } else {
      isl.cardMessage = answer.message;
      if (['intact', 'insufficient_funds', 'not_built'].includes(answer.code)) await readWalls();
    }
    refreshCard();
  }
  async function upgrade(spotId) {
    const place = placeOf(spotId);
    if (isl.busySpot) return;
    const action = place !== 'point' ? purchaseAt(spotById(spotId), true) : null;
    let wallReceipt = '';
    isl.busySpot = spotId; isl.busyKind = 'upgrade'; isl.cardMessage = ''; refreshCard();
    const answer = place === 'point' ? await isl.api.pointUpgrade({spot: spotId})
      : await isl.api.upgrade({spot: spotId, ...(place === 'visit' ? {code: isl.visiting.code} : {})});
    if (isl.disposed) return;
    isl.busySpot = null; isl.busyKind = null;
    if (answer.ok) {
      await took(answer, place);
      if (isl.disposed) return;
      isl.treePicked.delete(spotId); // the tree card moves on to the next step
      const now = (place === 'point' ? isl.point : place === 'visit' ? isl.visiting : isl.own)?.spots?.find(item => item.id === spotId);
      const name = BUILDINGS[now?.kind]?.name ?? 'Building';
      if (place === 'own') emit({type: ISLAND_UPGRADED, kind: now?.kind, spot: spotId, level: now?.level});
      emit({type: SPOTS_CHANGED, place, spot: spotId});
      const receipt = `${name} level ${now?.level ?? '?'}${onWhere(place)} · ${coinText(isl.own?.coins)}`;
      if (action?.kind === 'wall') wallReceipt = receipt;
      else isl.ui.toast(receipt, 'success');
      if (recoveryControlsOn()) void readStructureRecovery(spotId);
    } else await refused(answer, place, spotId);
    refreshCard();
    if (!showPurchase(action, answer, wallReceipt) && wallReceipt) isl.ui.toast(wallReceipt, 'success');
  }
  // GAME-V3.md §4.2: Tear down asks the server who gets what back, then the confirmation card; Tear down there
  // takes the building down (between waves), every payer gets half of what they paid, and the room hears it.
  async function askDemolish(spotId) {
    if (isl.busySpot || isl.busyDemolish || isPointSpot(spotId)) return;
    isl.demolishSpot = spotId; isl.demolishQuote = null; isl.cardMessage = '';
    isl.ui.demolishCard(demolishCardModel(), demolishHandlers);
    const answer = await isl.api.demolishQuote({spot: spotId, ...placeCode()});
    if (isl.disposed || isl.demolishSpot !== spotId) return;
    if (answer.ok) isl.demolishQuote = answer.data; else isl.cardMessage = answer.message;
    if (isl.ui.open === 'demolish') isl.ui.demolishCard(demolishCardModel(), demolishHandlers);
  }
  async function confirmDemolish() {
    const spotId = isl.demolishSpot;
    if (!spotId || !isl.demolishQuote || isl.busyDemolish) return;
    isl.busyDemolish = true; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.demolish({spot: spotId, ...placeCode()});
    if (isl.disposed) return;
    isl.busyDemolish = false;
    if (!answer.ok) {
      isl.cardMessage = answer.message; refreshCard();
      if (['not_built', 'wave_running', 'busy'].includes(answer.code)) await refreshDefended();
      return;
    }
    const {demolished: done, ...island} = answer.data, place = isl.visiting ? 'visit' : 'own';
    await took({...answer, data: island}, place);
    if (isl.disposed) return;
    const who = colours().me;
    emit({type: SPOTS_CHANGED, place, spot: spotId, demolished: {...(who ? {who} : {}), kind: done.kind, level: done.level,
      refunds: done.refunds.slice(0, 6).map(item => ({id: item.id, coins: item.coins}))}});
    emit({type: 'island_demolished', spot: spotId, kind: done.kind, level: done.level, refunds: done.refunds});
    isl.demolishSpot = null; isl.demolishQuote = null;
    if (isl.ui.open === 'demolish') { isl.ui.close(); isl.openSpot = null; }
    const mine = done.refunds.find(item => item.you)?.coins ?? 0;
    isl.ui.toast(`${done.name ?? BUILDINGS[done.kind]?.name ?? 'Building'} torn down${mine > 0 ? ` · +${coinText(mine)}` : ''}`, 'success');
    refreshCard();
  }
  // A teammate tore a building down (the room's island_changed): a toast for the payers who got coins back.
  const heardRefunds = new Map();
  function heardDemolish(demolished) {
    const me = colours().me, key = JSON.stringify(demolished), at = Date.now();
    if (isl.disposed || !me) return;
    const text = refundToast({demolished, me, whoName: lobby().rows?.find(row => row.id === demolished?.who)?.name ?? ''});
    if (!text) return;
    // On a teammate's island the HUD shows your own wallet: read it again at every note (the room says it
    // twice; the first may come before the server's answer reached this screen). The toast shows once.
    if (isl.visiting) { wrote('own'); void reloadOwn(); }
    if (at - (heardRefunds.get(key) ?? -Infinity) < 15000) return;
    heardRefunds.set(key, at);
    isl.ui.toast(text, 'success');
  }
  // GAME-V3.md §5: a tower picks a skill (free); research a kind at the Tech hub; §4: coins into the wreck.
  // Each answer is the island; the room hears island_changed, so every screen reads it again.
  const placeCode = () => (isl.visiting ? {code: isl.visiting.code} : {});
  async function landed(answer, spot, current = () => true) {
    const place = isl.visiting ? 'visit' : 'own';
    if (place === 'visit') { wrote('visit'); wrote('own'); await Promise.all([reloadVisit(), reloadOwn()]); }
    else { wrote('own'); setOwn(answer.data); }
    if (current()) emit({type: SPOTS_CHANGED, place, spot});
  }
  async function specialise(spotId, spec) {
    if (isl.busySpot || (!SPECS[spec] && !ROLES[spec])) return;
    const role = !!ROLES[spec], first = role && !(target()?.spots ?? []).some(item => activeRole(item));
    isl.busySpot = spotId; isl.busyKind = `spec:${spec}`; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.specialise({spot: spotId, spec, ...placeCode()});
    if (isl.disposed) return;
    isl.busySpot = null; isl.busyKind = null;
    if (answer.ok) {
      await landed(answer, spotId);
      if (isl.disposed) return;
      if (role) {
        emit({type: HOUSE_ROLE_PICKED, spot: spotId, role: spec, first});
        isl.ui.toast(`${ROLES[spec].name}: this house works as one from the next wave.`, 'success');
      } else {
        emit({type: TOWER_SPECIALISED, spot: spotId, spec});
        isl.ui.toast(`${SPECS[spec].name}: this tower fights with it from the next wave.`, 'success');
      }
    } else { isl.cardMessage = answer.message; if (['not_researched', 'not_built', 'wrong_kind', 'house_level', 'insufficient_funds'].includes(answer.code)) await refreshDefended(); }
    refreshCard();
  }
  // D055: one tier of a level-5 tower's upgrade tree, paid by this player; the answer is the island and the room
  // hears island_changed, so every screen (and the next wave's sim) reads the tree again.
  async function buyTree(spotId, path, tier) {
    if (isl.busySpot || isPointSpot(spotId)) return;
    isl.busySpot = spotId; isl.busyKind = `tree:${path}${tier}`; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.towerTree({spot: spotId, path, tier, ...placeCode()});
    if (isl.disposed) return;
    isl.busySpot = null; isl.busyKind = null;
    if (answer.ok) {
      await landed(answer, spotId);
      if (isl.disposed) return;
      isl.treePicked.delete(spotId);
      const kind = (target()?.spots ?? []).find(item => item.id === spotId)?.kind;
      emit({type: TOWER_TREE_BOUGHT, spot: spotId, kind, path, tier});
      const step = TOWER_TREES[kind]?.[path];
      isl.ui.toast(`${step ? `${step.name} ${'I'.repeat(tier)}` : 'Upgrade'} · ${coinText(isl.own?.coins)}`, 'success');
    } else { isl.cardMessage = answer.message; if (['not_built', 'needs_level', 'known', 'needs_tier', 'closed', 'locked', 'insufficient_funds'].includes(answer.code)) await refreshDefended(); }
    refreshCard();
  }
  function toggleVillage() {
    if (isl.village.active) return isl.village.leave();
    isl.ui.close(); isl.moving.cancel(); isl.openSpot = null; resetInput(); focus();
    if (isl.village.enter()) return true;
    isl.ui.toast('Manage your village between waves on your own island.', 'info');
    return false;
  }
  // T36: Move closes the card and lets the player pick the new square (between waves only; the server checks).
  function startMove(spotId) {
    if (isl.disposed || isPointSpot(spotId) || (isl.battle && !isl.waveOver) || target()?.layout?.movable !== true) return false;
    isl.ui.close(); isl.openSpot = null;
    return isl.moving.start(spotId);
  }
  async function moved(answer, spotId) {
    const place = isl.visiting ? 'visit' : 'own';
    await took(answer, place);
    if (isl.disposed) return;
    emit({type: SPOTS_CHANGED, place, spot: spotId});
    refreshCard();
    isl.ui.toast(`Moved${onWhere(place)}. Your defenders fight from the new spot.`, 'success');
  }
  function inspectHouse(houseId, move = null) {
    const island = target();
    if (!island?.spots || spotById(houseId)?.slot !== 'house' || (isl.battle && !isl.waveOver)) return null;
    const at = isl.housePlayer?.();
    const captains = at && Number.isFinite(at.x) && Number.isFinite(at.z)
      ? [{id: 'you', x: at.x, z: at.z, present: true, down: false}] : null;
    const recoveryVersion = recoveryPolicyOn() ? 1 : island.recoveryVersion ?? 0;
    return {island, support: previewHouseSupport({houseId, spots: island.spots, recoveryVersion, captains, move})};
  }
  function activeHouseSupport() {
    if (isl.battle && !isl.waveOver) return null;
    const shown = isl.moving.active ? isl.movingHouse : isl.ui.open === 'build' ? isl.selectedHouse : null;
    return shown && shown.island === target() ? shown.support : null;
  }
  // GAME-V3.md §5.1: one research step: tier 1 of a branch, or one of the two options of tier 2 or 3 (change:
  // the crew picked the other one before and pays the tier's price again to switch).
  async function research(step) {
    const {branch, tier = 1, choice = null, change = false} = typeof step === 'string' ? {branch: step} : step ?? {};
    if (isl.busyResearch || !BRANCH_BY_ID[branch] || !researchIsland()) return;
    const scope = shownIsland(), travelGeneration = isl.coreTravelGeneration, reset = isl.resetGeneration;
    const visitGeneration = isl.reportVisitGeneration;
    const current = () => !isl.disposed && !!researchIsland() && shownIsland() === scope
      && isl.coreTravelGeneration === travelGeneration && isl.resetGeneration === reset && isl.reportVisitGeneration === visitGeneration;
    isl.busyResearch = `${branch}:${tier}:${choice ?? ''}`; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.research({branch, tier, choice, change, ...placeCode()});
    if (isl.disposed) return;
    isl.busyResearch = null;
    if (!current()) {
      if (answer.ok) await Promise.all([reloadOwn(), reloadVisit()]);
      refreshCard();
      return;
    }
    if (answer.ok) {
      await landed(answer, 'tech_hub', current);
      if (!current()) return;
      emit({type: 'tech_researched', branch, tier, choice});
      const kind = KINDS[branch].name.toLowerCase();
      isl.ui.toast(tier === 1 ? `${BRANCH_BY_ID[branch].name} researched! Tap a ${kind} to pick its skill.`
        : tier === 2 ? `${optionName(choice)}: every ${kind} fights with it from the next wave.`
          : `${optionName(choice)}! Tap a ${kind} to pick it as its skill.`, 'success');
    } else { isl.cardMessage = answer.message; if (['known', 'locked', 'insufficient_funds', 'closed', 'needs_tier', 'top_tier', 'wave_running'].includes(answer.code)) await refreshDefended(); }
    refreshCard();
  }
  async function giveWreck(amount) {
    if (isl.busyGift) return;
    isl.busyGift = amount; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.repairWreck({amount, ...placeCode()});
    if (isl.disposed) return;
    isl.busyGift = null;
    if (answer.ok) {
      await landed(answer, 'wreck');
      if (isl.disposed) return;
      const now = campaign()?.wreck;
      if (now && now.paid >= now.goal) void readBoat();
      isl.ui.toast(now && now.paid >= now.goal ? (isOpen(campaign(), 'ship') ? 'The wreck is repaired! Your ship sails: tap her to play.' : `The wreck is repaired! She sails after wave ${waveOf('ship')}.`) : `Thanks! The wreck has ${coinText(now?.paid ?? 0)} of ${coinText(now?.goal ?? 0)}.`, 'success');
    } else { isl.cardMessage = answer.message; if (['repaired', 'locked', 'insufficient_funds'].includes(answer.code)) await refreshDefended(); }
    refreshCard();
  }
  async function hire(id) {
    if (isl.busyCrew || !CREW[id]) return;
    isl.busyCrew = id; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.hire({crew: id});
    if (isl.disposed) return;
    isl.busyCrew = null;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: CREW_HIRED, crew: id});
      isl.ui.toast(`${CREW[id].name} hired · ${coinText(isl.own.coins)}`, 'success');
    } else await refused(answer, false);
    refreshCard();
  }
  async function upgradeCaptain() {
    if (isl.busyCaptain) return;
    isl.busyCaptain = true; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.upgradeCaptain();
    if (isl.disposed) return;
    isl.busyCaptain = false;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: 'captain_upgraded', level: isl.own.captain?.level});
      isl.ui.toast(`Captain level ${isl.own.captain?.level ?? '?'} · ${coinText(isl.own.coins)}`, 'success');
    } else await refused(answer, false);
    refreshCard();
  }
  // §14: learn a skill with skill points. The answer is the island with the new skill.
  async function learnSkill(id) {
    if (isl.busySkill || !SKILL_BY_ID[id]) return;
    isl.busySkill = id; isl.pickedSkill = id; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.learnSkill({skill: id});
    if (isl.disposed) return;
    isl.busySkill = null;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: 'captain_skill_learned', skill: id});
      isl.ui.toast(`New skill: ${SKILL_BY_ID[id].name}!`, 'success');
    } else { isl.cardMessage = answer.message; if (['locked', 'no_points', 'known', 'closed', 'wrong_role'].includes(answer.code)) await reloadOwn(); }
    refreshCard();
  }
  // The role choice at captain level 3 (once), and the respec that clears skills and role (coins, asked twice).
  async function takeRole(id) {
    if (isl.busyRole || !isRole(id)) return;
    isl.busyRole = true; isl.pickedRole = id; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.pickRole({role: id});
    if (isl.disposed) return;
    isl.busyRole = false;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: 'captain_role_picked', role: id});
      isl.ui.toast(`You are the ${ROLE_BY_ID[id].name} now!`, 'success');
    } else { isl.cardMessage = answer.message; if (['locked', 'role_known'].includes(answer.code)) await reloadOwn(); }
    refreshCard();
  }
  async function respecCaptain() {
    if (isl.busyRespec) return;
    if (!isl.respecAsk) { isl.respecAsk = true; isl.cardMessage = ''; refreshCard(); return; }
    isl.busyRespec = true; isl.cardMessage = ''; refreshCard();
    const answer = await isl.api.respec();
    if (isl.disposed) return;
    isl.busyRespec = false; isl.respecAsk = false;
    if (answer.ok) {
      setOwn(answer.data); isl.pickedSkill = null; isl.pickedRole = null;
      emit({type: 'captain_respec'});
      isl.ui.toast(`Skills reset · ${coinText(isl.own.coins)}`, 'success');
    } else { isl.cardMessage = answer.message; if (answer.code === 'nothing_to_reset') await reloadOwn(); }
    refreshCard();
  }
  function link() { // the names of the other parts, once every part exists (index.js)
    ({recoveryControlsOn, recoveryPolicyOn, readStructureRecovery, setOwn, campaign, wrote, target, shownIsland, researchIsland, where,
      placeOf, tookCoins, reloadVisit, reloadOwn, refreshDefended, took, refused, lobby, colours, bellAction,
      demolishHandlers, demolishCardModel, readBoat, bell, refreshCard, refreshCardIfBuild} = isl);
  }
  return {invalidatePurchaseFeedback, purchaseFeedbackScope, build, readWalls, repairWall, upgrade, askDemolish,
    confirmDemolish, heardDemolish, placeCode, specialise, buyTree, toggleVillage, startMove, moved, inspectHouse, activeHouseSupport,
    research, giveWreck, hire, upgradeCaptain, learnSkill, takeRole, respecCaptain, link};
}
