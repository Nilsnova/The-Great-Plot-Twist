// Reading the island on screen (index.js): load() of your own island or a friend's (joining their game first),
// a fresh answer's coins, captain and campaign (setOwn), the read/write turns that keep an older read from
// stepping the island back, the world's drawing (applyWorld) and the core display's context, Pirate Point's
// spots, and how an action's answer lands (took, refused, reloads). A closure over the island's state `isl`.

import {ISLAND_PLACE, isPointSpot} from './spots.js';
import {campaignOf, openedBetween} from '../campaign/index.js';
import {WEAPONS} from '../pirates/captain-ids.js';
import {displayIslandCode, islandCode, forgetVisit} from './codes.js';
import {readUnlocks} from './td-rules.js';
import {declaresEconomy} from './economy-view.js';
import {declaresPersonalCaptain, preferPersonalSnapshot, readPersonalCaptain} from './economy-captain.js';
import {visitChip, visitName} from './one-island.js';
import {NEWS_KEY, CAMPAIGN_UNLOCKED, VISIT_NAMED, mayPass} from './island-shared.js';

export function createLoading(isl) {
  const {emit, storage, visitStorage, onCoins, onCaptain, onQuestIsland, travel} = isl;
  const personalPinned = new Set();
  const currentFunds = () => isl.funding.view(isl.visiting ?? isl.own, isl.own?.coins ?? null);
  const sharedCard = () => { const source = currentFunds(); return source.shared ? {economy: source.economy} : {}; };
  async function readOwn() {
    const [answer, personal] = await Promise.all([isl.api.getIsland(), isl.api.getCaptain()]);
    if (!answer.ok) return answer;
    if (personal.ok) return {...answer, data: {...answer.data, ...personal.data}, personalReadState: 'v1'};
    const legacy = !personalPinned.has(islandCode(answer.data?.code ?? '')) && (personal.status === 404 || personal.code === 'captain_not_initialized');
    if (legacy && !currentFunds().shared && !declaresEconomy(answer.data)) return {...answer, personalReadState: 'legacy'};
    return {...answer, data: {...answer.data, captain: {progressionVersion: 1}, skills: null}, personalReadState: 'unavailable'};
  }
  const applyPersonal = data => setOwn(declaresPersonalCaptain(data?.captain) && isl.own ? {...isl.own, ...data} : data);
  // From the other parts (island-*.js), linked once every part exists.
  let clearRecoveryError, recoveryPolicyOn, readStructureRecovery, syncGame, openLobby, sailHome, refreshCard,
    invalidateWallFeedback, wallFeedbackScope;
  const tellCaptain = island => { const level = island?.captain?.level; if (!isl.disposed && Number.isSafeInteger(level)) { try { onCaptain(level); } catch { /* The HUD cannot stop the island. */ } } };
  function firstTime(id) {
    if (isl.news.has(id)) return false;
    isl.news.add(id); try { storage?.setItem(NEWS_KEY, JSON.stringify([...isl.news])); } catch { /* Told again next time. */ }
    return true;
  }
  // The player's balance is the island's `coins` (GET /api/island and every answer after it); the HUD shows it.
  const tellCoins = (coins, options = {}) => {
    if (isl.disposed) return;
    const source = currentFunds();
    try {
      if (source.shared) onCoins(source.coins, {...options, economy: source.economy, shared: true, fundingKey: source.key});
      else if (Number.isSafeInteger(coins)) onCoins(coins, {...options, legacyIsland: true});
    } catch { /* The HUD cannot stop the island. */ }
  };
  // The campaign of the island on screen (GAME-V3.md §4): the best won wave seen per island code on this page.
  // A higher one than before means a win opened something: campaign_unlocked {wave, ids} once per island and
  // wave (the narrator plays its lines once per island game), and its toast.
  const campaignSeen = new Map(), campaignTold = new Set();
  function noteCampaign(answer) {
    const code = islandCode(answer?.code ?? ''), wave = campaignOf(answer).wave;
    if (!code) return;
    const before = campaignSeen.get(code);
    campaignSeen.set(code, Math.max(before ?? 0, wave));
    if (before === undefined || wave <= before) return;
    for (const step of openedBetween(before, wave)) {
      const key = `${code}:${step.wave}`;
      if (campaignTold.has(key)) continue;
      campaignTold.add(key);
      const line = answer?.recoveryVersion === 1 && step.ids.includes('crew:carpenter')
        ? 'Raise walls around the heart. All walls and towers fully recover when the wave ends.' : step.line;
      isl.ui.toast(step.title, 'success', firstTime(`campaign_${step.wave}`) ? line : '');
      emit({type: CAMPAIGN_UNLOCKED, wave: step.wave, ids: step.ids, code: displayIslandCode(code)});
    }
  }
  // A fresh island answer: coins and captain to the HUD, and the campaign of your own island (§4).
  const setOwn = (next, personalReadState = null, {fromRead = false} = {}) => {
    if (personalReadState !== null && !isl.funding.acceptRead(next)) return;
    const before = isl.own;
    if (!fromRead) {
      if (isl.pendingWallet) wrote('own');
      isl.pendingWallet = null; isl.walletGeneration++;
    }
    const profileKey = islandCode(next?.code ?? '');
    if (personalReadState !== 'legacy' || personalPinned.has(profileKey)) next = preferPersonalSnapshot(before, next, {unavailable: personalReadState === 'unavailable'});
    if (readPersonalCaptain(next?.captain)) {
      personalPinned.add(profileKey);
      if (next.skills) next = {...next, skills: {...next.skills, role: next.captain.role}};
    }
    if (before?.code !== next?.code || before?.recoveryVersion !== next?.recoveryVersion) {
      isl.recoveryReadId++; isl.recoveryState = null; isl.recoveryIslandCode = next?.code ?? null; isl.recoveryCombat = null; isl.recoveryStatus = next?.code ? 'loading' : 'disabled';
      clearRecoveryError();
    }
    isl.own = next; tellCoins(next?.coins); tellCaptain(next);
    if (!isl.disposed) { try { onQuestIsland(next); } catch { /* The HUD cannot stop the island. */ } }
    if (!isl.visiting) noteCampaign(next);
    if (!before || !next) return;
    // A won wave may bring a skill point (§14) or a weapon in the shop (§15).
    const from = readUnlocks(before).wonWave, to = readUnlocks(next).wonWave;
    for (const weapon of WEAPONS) if (weapon.unlockWave > from && weapon.unlockWave <= to) isl.ui.toast(`New in the arsenal: ${weapon.name}!`, 'success');
    const gained = (next.skills?.points ?? 0) - (before.skills?.points ?? 0);
    if (gained > 0 && (next.skills?.spent ?? 0) === (before.skills?.spent ?? 0)) {
      isl.ui.toast(gained === 1 ? 'New skill point!' : `${gained} new skill points!`, 'success', firstTime('skill_point') ? 'Spend it in Menu › Captain and skills.' : '');
    }
  };
  const unlocks = () => (isl.own ? readUnlocks(isl.own) : null);
  // What may be built on the island on screen (GAME-V3.md §4): its own campaign decides the kinds and levels;
  // crew and captain levels stay the player's own.
  const islandUnlocks = () => {
    const mine = unlocks();
    if (!isl.visiting) return mine;
    const there = readUnlocks({waveBest: campaignOf(isl.visiting).wave});
    if (currentFunds().shared) return there;
    return mine ? {...there, crew: mine.crew, captain: mine.captain} : there;
  };
  const campaign = () => (target() ? campaignOf(target()) : null);
  // Reads and writes of one island can cross: a read asked before our own build or upgrade may answer after
  // it, with the island as it was. reading(kind) gives a check for the answer: false when a newer read was
  // already used or a write answered meanwhile (that answer is newer than the read), so the island on screen
  // never steps back a level.
  const turns = {own: {asked: 0, used: 0, wrote: 0}, visit: {asked: 0, used: 0, wrote: 0}, point: {asked: 0, used: 0, wrote: 0}};
  const reading = kind => {
    const turn = turns[kind], mine = ++turn.asked, wrote = turn.wrote, selection = isl.selectionGeneration;
    return () => { if (mine < turn.used || turn.wrote !== wrote || kind === 'visit' && selection !== isl.selectionGeneration) return false; turn.used = mine; return true; };
  };
  const wrote = kind => { turns[kind].wrote++; };
  const setOwnRead = (next, personalReadState = null) => {
    // Only reads already in flight when the fresh account balance arrived may hold older coins.
    if (isl.pendingWallet && turns.own.used <= isl.pendingWallet.through) next = {...next, coins: isl.pendingWallet.coins};
    // Consuming the highest covered read fences every smaller ID; earlier reads must keep the guard.
    if (isl.pendingWallet && turns.own.used >= isl.pendingWallet.through) isl.pendingWallet = null;
    setOwn(next, personalReadState, {fromRead: true});
  };
  // Coins that another answer carries (the arsenal's): stale once an island read asked later was shown or a
  // write answered. Unlike reading('own') it does not use the turn, so a load's island read still lands.
  const coinsAsked = () => {
    const turn = turns.own, asked = turn.asked, wrote = turn.wrote, wallet = isl.walletGeneration;
    const fresh = () => turn.used <= asked && turn.wrote === wrote && isl.walletGeneration === wallet;
    fresh.through = asked;
    return fresh;
  };
  const target = () => isl.visiting ?? isl.own;
  // Which island is on screen (a visit or your own, and its code), not which answer object: a fresh read of
  // the same island (a crewmate's change, a finished wave) replaces the object but not the island.
  const shownIsland = () => (target() ? JSON.stringify([isl.visiting ? 'visit' : 'own', target().code]) : null);
  const where = () => (isl.visiting ? displayIslandCode(isl.visiting.code) : 'own');
  function applyWorld() {
    syncCoreContext();
    tellCoins(isl.own?.coins);
    const spots = target()?.spots ?? [];
    isl.villageBar.setBuildings(spots);
    isl.world?.apply({spots, visitor: !!isl.visiting, battle: isl.battle, unlocks: islandUnlocks(), crew: target()?.crew ?? null, campaign: campaign(),
      arsenal: true, feedbackScope: wallFeedbackScope()});
    const replaying = isl.recoveryCombat && isl.flow.current?.wave?.waveId === isl.recoveryCombat.waveId;
    isl.world?.setRecoveryState?.(isl.recoveryState && recoveryPolicyOn() ? {...isl.recoveryState, displayPhase: replaying ? 'combat' : isl.recoveryState.displayPhase} : null);
    isl.pointWorld?.apply({spots: isl.point?.spots ?? [], visitor: false, battle: isl.pointBattle, unlocks: unlocks()});
  }
  function syncCoreContext() {
    const shown = target(), code = shown?.code ?? isl.visitCode ?? null;
    const epoch = shown?.islandEpoch ?? (isl.recoveryIslandCode === code ? isl.recoveryState?.islandEpoch : null) ?? null;
    const key = code ? JSON.stringify([code, epoch, isl.resetGeneration, isl.coreTravelGeneration]) : null;
    if (key !== isl.coreContextKey) { isl.coreContextKey = key; isl.coreRejoin = null; isl.coreState.reset(key); isl.coreWorld?.reset(); }
    return {key, epoch, islandIdentity: code ? JSON.stringify([code, epoch, isl.resetGeneration]) : null};
  }
  function setCoreCombatState(snapshot) {
    if (isl.disposed) return;
    const context = syncCoreContext();
    if (!snapshot) { isl.coreState.reset(context.key); isl.coreWorld?.reset(); return; }
    if (isl.coreState.accept(snapshot, {waveId: isl.flow.current?.wave?.waveId, contextKey: context.key, epoch: context.epoch})) {
      isl.coreWorld?.setHealth(isl.coreState.current);
    }
  }
  function endVisit(invalidateLoad = true) {
    invalidateWallFeedback();
    isl.selectionGeneration++; if (invalidateLoad) isl.loadTicket++;
    moving.cancel(); demolishSpot = null; demolishQuote = null;
    isl.visiting = null; isl.visitCode = null; forgetVisit(visitStorage); isl.ui.visit(null);
  }
  // The chip of a friend's game: the old "Visiting … · Sail home" only where travel still applies (one
  // island off); with one island the game itself and a way to its lobby (GAME-V3.md §2).
  const canTravel = () => { try { return travel() === true; } catch { return false; } };
  function showVisit() {
    if (!isl.visiting) { isl.ui.visit(null); return; }
    const chip = visitChip({ownerName: isl.visiting.ownerName, code: displayIslandCode(isl.visiting.code), travel: canTravel()});
    isl.ui.visit(chip, () => (chip.action === 'home' ? void sailHome() : openLobby()));
    emit({type: VISIT_NAMED, place: ISLAND_PLACE, name: placeName(ISLAND_PLACE)});
  }
  // The island on screen is a friend's game: the banner names it like the chip does; null for your own.
  function placeName(id) {
    if (id !== ISLAND_PLACE || (!isl.visiting && !isl.visitCode)) return null;
    return visitName({ownerName: isl.visiting?.ownerName, travel: canTravel()});
  }
  // A friend's game: join it first (once per page), so building and the bell are allowed (GAME-V3.md §2).
  // A full game or an unknown code ends the visit: the player lands on their own island instead.
  // One join per code at a time: the landing (load) and a wave already running there (joinRunningWave)
  // share it, so the wave is joined only once the game is (the server wants a member: 403 not_member).
  const joining = new Map();
  function joinFirst(code) {
    if (isl.joined.has(code)) return Promise.resolve(true);
    if (!joining.has(code)) joining.set(code, joinGameOnce(code).finally(() => joining.delete(code)));
    return joining.get(code);
  }
  async function joinGameOnce(code) {
    const answer = await isl.api.joinGame(code);
    if (answer.ok) { isl.joined.add(code); return true; }
    if (['game_full', 'no_such_game', 'no_such_island'].includes(answer.code)) {
      isl.ui.toast(answer.message, 'error');
      return false;
    }
    return true; // signed out or offline: the visit still shows; building answers on its own
  }
  async function load() {
    const ticket = ++isl.loadTicket;
    const travelGeneration = isl.coreTravelGeneration;
    let loadedTarget = null;
    if (isl.visitCode && !(await joinFirst(isl.visitCode))) {
      if (isl.disposed || ticket !== isl.loadTicket) return {ok: false};
      endVisit(false);
    }
    if (isl.disposed || ticket !== isl.loadTicket) return {ok: false};
    if (isl.visitCode) {
      const current = reading('visit');
      const answer = await isl.api.visit(isl.visitCode);
      if (isl.disposed || ticket !== isl.loadTicket) return answer;
      if (answer.ok) {
        if (current() && isl.funding.acceptRead(answer.data)) { isl.visiting = {...answer.data, code: islandCode(answer.data.code)}; loadedTarget = shownIsland(); noteCampaign(isl.visiting); }

        showVisit();
      } else {
        endVisit(false); isl.ui.toast(answer.message, 'error');
      }
    }
    {
      // Read personal progress and legacy funding while the defended island supplies any shared treasury.
      const current = reading('own');
      const answer = await readOwn();
      if (isl.disposed || ticket !== isl.loadTicket) return answer;
      if (answer.ok) {
        if (current()) { setOwnRead(answer.data, answer.personalReadState); if (!isl.visiting) loadedTarget = shownIsland(); }

        isl.ownMessage = ''; isl.ownRetry = false;
      } else { isl.ownMessage = answer.message; isl.ownRetry = mayPass(answer); }
    }
    await readStructureRecovery();
    applyWorld(); refreshCard();
    void syncGame();
    void isl.arsenal.refresh();
    if (target()) {
      const context = syncCoreContext();
      const answer = await isl.flow.look(where());
      // A retained controller may resume only after this landing confirms its actual server wave.
      // Reject a late load across travel, another load, target change or reset.
      if (!isl.disposed && ticket === isl.loadTicket && travelGeneration === isl.coreTravelGeneration && loadedTarget !== null && loadedTarget === shownIsland()
          && context.key && context.key === syncCoreContext().key && answer?.ok
          && typeof answer.data?.waveId === 'string' && answer.data.waveId
          && isl.flow.current?.wave?.waveId === answer.data.waveId) {
        isl.coreRejoin = {contextKey: context.key, waveId: answer.data.waveId};
      }
    }
    return {ok: true};
  }
  // Pirate Point's shared spots: anyone builds and upgrades them with their own coins (§5).
  async function loadPoint() {
    const current = reading('point');
    const answer = await isl.api.piratePoint();
    if (isl.disposed) return answer;
    if (answer.ok) { if (current()) { isl.point = answer.data; tookCoins(answer.data.coins); } isl.pointMessage = ''; } else isl.pointMessage = answer.message;
    if (!isl.own) { const check = reading('own'), mine = await readOwn(); if (!isl.disposed && mine.ok && check()) setOwnRead(mine.data, mine.personalReadState); }
    applyWorld(); refreshCard();
    return answer;
  }
  async function freshOwn() {
    if (isl.own) return null;
    const current = reading('own'), answer = await readOwn();
    if (!isl.disposed && answer.ok && current()) { setOwnRead(answer.data, answer.personalReadState); refreshCard(); }
    return answer;
  }
  // The answer of a write: the island, or (on Pirate Point) the shared spots plus your fresh coins.
  // Where a build goes: Pirate Point's shared spots, the friend's island you visit, or your own.
  const placeOf = spotId => (isPointSpot(spotId) ? 'point' : isl.visiting ? 'visit' : 'own');
  const tookCoins = coins => {
    if (isl.own && Number.isSafeInteger(coins)) setOwn({...isl.own, coins});
    else {
      if (Number.isSafeInteger(coins)) isl.pendingWallet = {coins, through: turns.own.asked};
      tellCoins(coins);
    }
  };
  // The arsenal's coins go into the island object as it is: replacing it would make a load still waiting for
  // its wave answer take the island for another one and drop a returning player's rejoin proof.
  const arsenalCoins = (coins, fresh = () => true) => {
    if (!Number.isSafeInteger(coins) || !fresh()) return;
    // An arsenal read confirms coins after these own reads started, while later own reads stay authoritative.
    if (fresh.through > turns.own.used) isl.pendingWallet = {coins, through: fresh.through};
    if (isl.own?.coins === coins) return;
    if (isl.own) isl.own.coins = coins;
    tellCoins(coins);
  };
  async function reloadVisit() {
    if (!isl.visiting) return;
    const code = isl.visiting.code, current = reading('visit'), fresh = await isl.api.visit(code);
    if (!isl.disposed && fresh.ok && isl.visiting?.code === code && current() && isl.funding.acceptRead(fresh.data)) { isl.visiting = {...isl.visiting, ...fresh.data, code: islandCode(fresh.data.code)}; noteCampaign(isl.visiting); }
  }
  async function reloadOwn() {
    const current = reading('own'), mine = await readOwn();
    if (isl.disposed) return;
    if (mine.ok) { isl.ownRetry = false; isl.ownMessage = ''; if (current()) setOwnRead(mine.data, mine.personalReadState); } else if (!isl.own) { isl.ownMessage = mine.message; isl.ownRetry = mayPass(mine); }
  }
  // The island being defended, read again: after a friend built or upgraded there (island_changed in
  // the island's room, src/pirates/game-wiring.js) and before every wave, so all defenders agree.
  async function refreshDefended() {
    if (isl.disposed) return;
    const had = !!isl.own;
    if (isl.visiting) { await reloadVisit(); if (!isl.own && isl.ownRetry) await reloadOwn(); } else if (isl.own || isl.ownRetry) await reloadOwn(); else return;
    if (isl.disposed) return;
    if (!had && isl.own) { void syncGame(); if (!isl.flow.current) void isl.flow.look(where()); } // the first read that worked: the rest of load()
    await isl.arsenal.refresh(); // the weapon you carry is read again before every wave
    refreshCard();
  }
  async function took(answer, place) {
    wrote(place === 'point' ? 'point' : place === 'visit' ? 'visit' : 'own');
    if (place === 'point') { isl.point = answer.data; if (Number.isSafeInteger(answer.data.coins)) tookCoins(answer.data.coins); else await reloadOwn(); }
    else if (place === 'visit') { wrote('own'); await Promise.all([reloadVisit(), reloadOwn()]); }
    else setOwn(answer.data);
  }
  async function refused(answer, place, spotId = null) {
    if (!spotId || isl.openSpot === spotId) isl.cardMessage = answer.message;
    else isl.ui.toast(answer.message, 'error');
    if (['spot_taken', 'insufficient_funds', 'max_level', 'not_built', 'locked', 'crew_full'].includes(answer.code)) {
      if (place === 'point') { const current = reading('point'), fresh = await isl.api.piratePoint(); if (!isl.disposed && fresh.ok && current()) { isl.point = fresh.data; tookCoins(fresh.data.coins); } }
      else if (place === 'visit') await Promise.all([reloadVisit(), reloadOwn()]);
      else await reloadOwn();
    }
  }
  function link() { // the names of the other parts, once every part exists (index.js)
    ({clearRecoveryError, recoveryPolicyOn, readStructureRecovery, syncGame, openLobby, sailHome, refreshCard,
      invalidateWallFeedback, wallFeedbackScope} = isl);
  }
  return {currentFunds, sharedCard, readOwn, applyPersonal, firstTime, tellCoins, campaignSeen, campaignTold, setOwn, unlocks, islandUnlocks, campaign, reading, wrote,
    setOwnRead, coinsAsked, target, where, applyWorld, syncCoreContext, setCoreCombatState, endVisit, placeName,
    joinFirst, load, loadPoint, freshOwn, placeOf, tookCoins, arsenalCoins, reloadVisit, reloadOwn, refreshDefended,
    took, refused, link};
}
