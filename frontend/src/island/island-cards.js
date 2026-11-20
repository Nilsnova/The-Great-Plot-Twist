// The island's cards (index.js): the build card's model and handlers, the bell, crew, captain, overview,
// leaderboard, captains and invite cards, the campaign's harbor, tech hub, wreck and boat games, refreshCard()
// and pick(), which opens the card of a tapped zone. A closure over the island's state `isl`.

import {canDockSelection, holdOtherBuildingAction} from './selection-dock.js';
import {footprintOf} from './placement.js';
import {previewDefenseCoverage, previewDefenseUpgrade} from '../pirates/sim.js';
import {BELL, CABIN, isPointSpot, spotById, ppSpotById, defenses, onIsland, placedSpot, ARSENAL} from './spots.js';
import {buildCardModel, bellModel, inviteModel, crewModel, captainModel, captainsModel, skillsModel, coinText,
  harborModel, techModel, wreckModel, demolishModel} from './card-model.js';
import {campaignOf, isOpen} from '../campaign/index.js';
import {displayIslandCode} from './codes.js';
import {ISLAND_INVITE_OPENED} from '../ui/quest-events.js';
import {progressSummary} from './progression.js';
import {upgradeOverviewModel} from './upgrade-overview.js';
import {withWallRecovery} from './wall-recovery.js';
import {preparationModel} from './preparation-model.js';
import {launchSharedBoatScene} from './shared-boat-scene.js';
import {boatOrigin, sameBoatOrigin} from './shared-boat-shapes.js';
import {declaresPersonalCaptain} from './economy-captain.js';

export function createCards(isl) {
  const {emit, on, focus, resetInput, reducedMotion, preferences, loadBoatScene, openHarborStall, villageCamera,
    } = isl;
  // From the other parts (island-*.js), linked once every part exists.
  let currentFunds, sharedCard, clearRecoveryError, recoveryPolicyOn, recoveryControlsOn, recoveryModelVersion, readStructureRecovery,
    repairStructure, tellCoins, unlocks, islandUnlocks, campaign, target, where, applyWorld, freshOwn, reloadOwn,
    refreshDefended, lobby, startGame, openLobby, bellAction, build, readWalls, repairWall, upgrade, askDemolish,
    confirmDemolish, placeCode, specialise, buyTree, startMove, research, giveWreck, hire, upgradeCaptain, learnSkill,
    takeRole, respecCaptain, inspectHouse, syncCoreContext, researchIsland;
  // --- cards ---------------------------------------------------------------------------------
  function buildModel(spotId) {
    if (isPointSpot(spotId)) {
      const spot = isl.point?.spots.find(item => item.id === spotId) ?? null;
      return buildCardModel({spotId, slot: ppSpotById(spotId).slot, spot, coins: isl.own?.coins ?? null, busy: isl.busySpot === spotId ? isl.busyKind : false,
        message: isl.cardMessage || (!isl.point ? isl.pointMessage : ''), point: true, prices: isl.own?.prices ?? null,
        // The server holds you to your own unlocks at Pirate Point too (a level you have not won is refused).
        unlocks: isl.own ? unlocks() : null});
    }
    // The defended island supplies shared funds and unlocks; legacy islands retain personal funding.
    const island = target(), spot = island?.spots.find(item => item.id === spotId) ?? null;
    const recoveryEnabled = recoveryControlsOn() && !!spot?.built && ['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel'].includes(spot.kind);
    const recoveryReady = recoveryEnabled && isl.recoveryStatus === 'ready' && recoveryPolicyOn()
      && isl.recoveryIslandCode === island?.code && !!isl.recoveryState;
    const recoveryRow = recoveryReady ? isl.recoveryState.structures.find(item => item.spot === spotId) : null;
    const replayActive = !!isl.recoveryCombat && isl.flow.current?.wave?.waveId === isl.recoveryCombat.waveId;
    const live = recoveryReady && replayActive
      && isl.recoveryState.islandEpoch === isl.recoveryCombat.islandEpoch ? isl.recoveryCombat.structures.find(item => item.spot === spotId) : null;
    const recoveryViewState = recoveryReady ? isl.recoveryState : null;
    const recoveryViewRow = live && recoveryRow?.instanceId === live.instanceId ? {...recoveryRow, hpUnits: live.hpUnits,
      maxHP: live.maxHP, repairSeq: live.repairSeq} : recoveryRow;
    const recoveryView = recoveryViewState && recoveryRow ? {...recoveryViewState,
      structures: [recoveryViewRow],
      displayPhase: replayActive ? 'combat' : recoveryViewState.displayPhase,
      repairWindow: replayActive ? 'reserved_wave' : recoveryViewState.repairWindow,
      waveId: replayActive ? isl.recoveryCombat.waveId : recoveryViewState.waveId,
    } : recoveryViewState;
    const model = buildCardModel({spotId, slot: spotById(spotId)?.slot, spot, coins: isl.own?.coins ?? null, ...sharedCard(),
      visitor: !!isl.visiting, ownerName: isl.visiting?.ownerName, busy: isl.busySpot === spotId ? isl.busyKind : false, message: isl.cardMessage || (!island ? isl.ownMessage : ''),
      unlocks: isl.own ? islandUnlocks() : null, prices: currentFunds().shared ? island?.prices ?? null : isl.own?.prices ?? null,
      campaign: campaign(), battle: isl.battle && !isl.waveOver || currentFunds().shared && (isl.flow.busy || !!isl.flow.current && !isl.waveOver),
      movable: island?.layout?.movable === true, treePicked: isl.treePicked.get(spotId) ?? null,
      recoveryState: recoveryView, recoveryStatus: recoveryEnabled ? (recoveryReady ? 'ready' : isl.recoveryStatus) : 'disabled',
      recoveryError: isl.recoveryError, recoveryPending: isl.recoveryPendingSpot === spotId, recoveryVersion: recoveryModelVersion()});
    const version = island?.recoveryVersion ?? 0;
    if (model.mode === 'upgrade' && Number.isSafeInteger(spot?.upgradeCost) && model.tree?.detail.action?.type === 'upgrade' && !isl.busySpot
      && (version === 0 || version === 1 && recoveryEnabled) && (!isl.battle || isl.waveOver)
      && (!recoveryEnabled || (recoveryReady && recoveryRow?.level === model.level
        && recoveryRow.hpUnits === 1_000_000 && recoveryView.repairWindow !== 'reserved_wave'))) {
      model.upgradeComparison = previewDefenseUpgrade({defenses: defenses(island.spots, campaign()?.research?.tiers),
        selectedId: spotId, currentLevel: model.level, gunnerCount: island.crew?.gunner,
        defensesV2: true});
    }
    if (recoveryEnabled && isl.recoveryState?.displayPhase === 'combat' && !live) {
      model.recovery = {visible: false, status: 'error', message: 'Battle health is still loading.'};
    }
    // D039: a damaged or destroyed wall shows Repair or Rebuild instead of Upgrade (flag wall_recovery).
    const shown = isl.wallsFor !== null && isl.wallsFor === island?.code ? isl.walls.get(spotId) ?? null : null;
    return holdOtherBuildingAction(recoveryControlsOn() ? model : withWallRecovery(model, {wall: shown, coins: isl.own?.coins ?? null,
      busy: isl.busySpot === spotId ? isl.busyKind : false, battle: isl.battle && !isl.waveOver}), isl.busySpot);
  }
  // Shared hires use the defended island; legacy hires still use the caller's own island.
  const crew = () => {
    const island = currentFunds().shared ? target() : isl.own;
    return crewModel({crew: island?.crew ?? {}, coins: isl.own?.coins ?? null, ...sharedCard(),
      unlocks: isl.own ? currentFunds().shared ? islandUnlocks() : unlocks() : null,
      busy: isl.busyCrew, battle: isl.flow.busy || !!isl.flow.current && !isl.waveOver || isl.battle && !isl.waveOver,
      message: isl.cardMessage || (!island ? isl.ownMessage : ''), prices: island?.prices,
      recoveryVersion: currentFunds().shared ? recoveryModelVersion() : isl.visiting ? isl.own?.recoveryVersion ?? 0 : recoveryModelVersion()});
  };
  const captain = () => {
    const message = isl.cardMessage || (!isl.own ? isl.ownMessage : '');
    const profile=isl.own?.captain ?? (isl.personalUnavailable ? {progressionVersion:1} : null);
    const wonWave = currentFunds().shared || declaresPersonalCaptain(isl.own?.captain) ? isl.own?.captain?.personalBestWave ?? 0 : isl.own ? unlocks().wonWave : 0;
    return {tab: isl.captainTab,
      captain: captainModel({captain: profile, coins: isl.own?.coins ?? null, ...sharedCard(), points: isl.own?.skills?.points ?? null,
        unlocks: isl.own ? unlocks() : null, busy: isl.busyCaptain, message: isl.captainTab === 'captain' ? message : ''}),
      skills: skillsModel({skills: isl.own?.skills ?? null, wonWave, picked: isl.pickedSkill, busy: isl.busySkill, message: isl.captainTab === 'skills' ? message : '',
        coins: isl.own?.coins ?? null, ...sharedCard(), personalCaptain: profile,
        captainLevel: isl.own?.captain?.level ?? 1, pickedRole: isl.pickedRole, busyRole: isl.busyRole, respecAsk: isl.respecAsk, busyRespec: isl.busyRespec,
        battle: isl.battle && !isl.waveOver, recoveryVersion: recoveryModelVersion()})};

  };
  const captainHandlers = {upgrade: () => void upgradeCaptain(), tab: id => { isl.captainTab = id; },
    pick: id => { isl.pickedSkill = id; isl.cardMessage = ''; refreshCard(); }, learn: id => void learnSkill(id),
    pickRole: id => { isl.pickedRole = id; isl.cardMessage = ''; refreshCard(); }, role: id => void takeRole(id),
    respec: () => void respecCaptain(), respecCancel: () => { isl.respecAsk = false; refreshCard(); }};
  const handlers = {build: (spotId, kind) => void build(spotId, kind), upgrade: spotId => void upgrade(spotId), repair: spotId => void repairWall(spotId),
    repairStructure: (spotId, quote) => void repairStructure(spotId, quote), hire: () => openCrew(),
    specialise: (spotId, spec) => void specialise(spotId, spec), demolish: spotId => void askDemolish(spotId), move: spotId => startMove(spotId),
    camera: action => villageCamera(action, action === 'work' ? selectedAnchor() : null),
    treeSelect: (spotId, id) => { isl.treePicked.set(spotId, id); isl.cardMessage = ''; refreshCard(); }, tree: (spotId, path, tier) => void buyTree(spotId, path, tier)};
  const demolishHandlers = {confirm: () => void confirmDemolish(), keep: () => { const spot = isl.demolishSpot; isl.demolishSpot = null; if (spot) openBuild(spot); }};
  const demolishCardModel = () => demolishModel({quote: isl.demolishQuote, busy: isl.busyDemolish, message: isl.cardMessage});
  const harbor = () => {
    const model=harborModel({campaign:campaign()});
    return {...model,stalls:model.stalls.map(stall=>['market','match'].includes(stall.id) && !isl.domainAvailable(stall.id)
      ?{...stall,open:false,reason:'This activity is unavailable on shared islands.'}:stall)};
  };
  const tech = () => techModel({campaign: campaign(), spots: target()?.spots ?? null, coins: isl.own?.coins ?? null, ...sharedCard(), busy: isl.busyResearch,
    battle: isl.battle && !isl.waveOver || currentFunds().shared && (isl.flow.busy || !!isl.flow.current && !isl.waveOver),
    message: isl.cardMessage || (!target() ? isl.ownMessage : ''), recoveryVersion: recoveryModelVersion()});
  const wreck = () => wreckModel({campaign: campaign(), coins: isl.own?.coins ?? null, ...sharedCard(), busy: isl.busyGift, message: isl.cardMessage || (!target() ? isl.ownMessage : ''),
    boat: isl.boatStatus, requireRewardScope: isl.mode !== 'fake', battle: isl.battle && !isl.waveOver || currentFunds().shared && (isl.flow.busy || !!isl.flow.current && !isl.waveOver)});
  const harborHandlers = {open: id => {
    if(['market','match'].includes(id) && !isl.domainAvailable(id)) return;
    isl.ui.close(); try { openHarborStall(id); } catch { /* The stall answers on its own. */ }
  }};
  const techHandlers = {research: step => void research(step)};
  const wreckHandlers = {give: amount => void giveWreck(amount), sail: game => void sail(game)};
  const boatBlocked = () => (isl.battle && !isl.waveOver) || isl.flow.busy || (!!isl.flow.current && !isl.waveOver);
  // Dispose directly: normal Close opens the wreck card and would keep captain input blocked.
  function interruptBoat(waveStarting = false) {
    isl.boatLaunch++;
    if (!isl.boatGame && !isl.boatLoading) return;
    const completed = isl.boatGame?.phase === 'result';
    isl.boatGame?.dispose();isl.boatGame = null;isl.boatLoading = false;
    isl.ui.close();resetInput();focus();
    if (waveStarting) isl.ui.boatNotice(completed
      ? 'Your completed round keeps any coins earned. Boat attempts cost no coins.'
      : 'Boat round interrupted. No coins were spent and this attempt did not use a reward.');
  }
  async function readBoat() {
    if (!isOpen(campaign(), 'ship')) { isl.boatStatus = null; return; }
    const ticket = ++isl.boatTicket, code = target()?.code;
    const economy = boatOrigin(isl.getEconomy()), actorId = isl.getActorId();
    if (isl.mode !== 'fake') isl.boatStatus = null;
    const answer = await (isl.mode === 'fake' ? isl.api.boatStatus(placeCode()) : isl.sharedBoatApi.status(placeCode()));
    if (isl.disposed || ticket !== isl.boatTicket || code !== target()?.code) return;
    if (isl.mode !== 'fake' && (actorId !== isl.getActorId()
      || economy && !sameBoatOrigin(economy, isl.getEconomy()))) return;
    if (isl.getEconomy()?.mode === 'island_shared' && !sameBoatOrigin(answer.data?.economy, isl.getEconomy())) return;
    isl.boatStatus = answer.ok ? answer.data : null;
    if (isl.ui.open === 'wreck') refreshCard();
  }
  async function sail(game) {
    if (isl.boatGame || isl.boatLoading || boatBlocked()) return;
    isl.boatLoading = true;
    const launch = ++isl.boatLaunch;
    const at = campaign(), code = target()?.code ?? '', where = placeCode();
    const economy = boatOrigin(isl.getEconomy()), actorId = isl.getActorId();
    let rewardScope = isl.mode === 'fake' ? 'player' : null;
    if (isl.mode !== 'fake') {
      await readBoat();
      if (isl.disposed || launch !== isl.boatLaunch) return;
      if (!isl.boatStatus?.open || !['island', 'player'].includes(isl.boatStatus.rewardScope)) {
        isl.boatLoading = false; isl.ui.toast('Read the current ship rewards before sailing. Try again.', 'info'); return;
      }
      rewardScope = isl.boatStatus.rewardScope;
      if (rewardScope === 'island' && (!sameBoatOrigin(economy, isl.getEconomy())
        || !sameBoatOrigin(isl.boatStatus.economy, economy))) {
        isl.boatLoading = false; isl.ui.toast('Read the current island treasury before sailing.', 'info'); return;
      }
    }
    let scene;
    try { scene = await loadBoatScene(); } catch {
      if (!isl.disposed && launch === isl.boatLaunch) { isl.boatLoading = false; isl.ui.toast('The boat could not load. Try again.', 'info'); }
      return;
    }
    if (isl.disposed || launch !== isl.boatLaunch) return;
    isl.boatLoading = false;
    if (boatBlocked() || code !== target()?.code || at?.wave !== campaign()?.wave) return;
    if (isl.mode !== 'fake' && (actorId !== isl.getActorId()
      || ((rewardScope === 'island' || isl.getEconomy()?.mode === 'island_shared')
        && !sameBoatOrigin(economy, isl.getEconomy())))) {
      isl.ui.toast('The island or sign-in changed. Read the ship rewards again.', 'info'); return;
    }
    isl.ui.close();
    if (rewardScope === 'island') {
      isl.boatLoading = true;
      const answer = await launchSharedBoatScene({createBoatGame: scene.createBoatGame, session: isl.sharedBoatSession,
        game, container: document.body, code, reducedMotion, easy: () => preferences()?.easyFinishers === true,
        isCurrent: () => !isl.disposed && launch === isl.boatLaunch && !boatBlocked() && code === target()?.code
          && sameBoatOrigin(economy, isl.getEconomy()) && actorId === isl.getActorId(),
        onSettled: () => { if (!isl.disposed) void readBoat(); },
        onClose: () => { isl.boatGame = null; if (!isl.disposed) { focus(); openWreck(); } }});
      if (isl.disposed || launch !== isl.boatLaunch) { answer.data?.dispose(); return; }
      isl.boatLoading = false;
      if (!answer.ok) { isl.ui.toast(answer.message, 'error'); openWreck(); return; }
      isl.boatGame = answer.data; return;
    }
    const round = scene.createBoatGame({container: document.body, game, wave: at?.wave ?? 0, code, reducedMotion,
      easy: () => preferences()?.easyFinishers === true,
      onFinish: async ({stars}) => {
        if (stars < 1) return {line: 'No stars this time. Try again!', coins: 0};
        const answer = await isl.api.boatReward({game, stars, ...where});
        if (isl.disposed) return null;
        if (!answer.ok) {
          if (isl.boatGame !== round) isl.ui.toast(answer.message, 'error');
          return {line: answer.message, coins: 0};
        }
        if (answer.data.paid) {
          tellCoins(answer.data.balance);
          void readBoat(); void reloadOwn();
          if (isl.boatGame !== round) isl.ui.toast(`Boat reward: +${coinText(answer.data.coins)}!`, 'success');
          return {line: `+${coinText(answer.data.coins)}!`, coins: answer.data.coins};
        }
        return {line: answer.data.already ? 'Paid already this wave. Win a wave to sail for coins again.' : 'No coins this time.', coins: 0};
      },
      onClose: () => { isl.boatGame = null; focus(); openWreck(); }});
    isl.boatGame = round;
  }
  function bell() {
    const wave = isl.flow.current, island = target();
    const model=bellModel({wave: wave?.wave ?? null, joined: wave?.joined === true, countdown: isl.flow.secondsLeft(), busy: isl.flow.busy,
      visitor: !!isl.visiting, ownerName: isl.visiting?.ownerName, waveBest: island?.waveBest ?? 0, nextWave: island?.nextWave,
      preparation: preparationModel({island, wallRecovery: !recoveryControlsOn(),
        wallState: {code: isl.wallsFor, rows: [...isl.walls.values()]}}), message: isl.cardMessage});
    if(!currentFunds().shared)return model;
    if(!isl.domainAvailable('session'))return {...model,disabled:true,action:'none',line:'Island defense is unavailable. Reload the island.'};
    const session=isl.session,settings=session.settingsView;
    if(!session.proof()){
      if(wave)return {...model,button:wave.joined?'Watching defense':'Watch defense',disabled:wave.joined || isl.flow.busy,
        action:wave.joined?'none':'join',message:'Spectating this island. Connect your Captain before the next bell to join its roster.'};
      const connecting=session.state.phase==='connecting';
      return {...model,button:connecting?'Connecting…':'Retry connection',disabled:connecting,action:'session',line:session.state.message || 'Watching this island. Retry to connect your Captain.'};
    }
    if(!wave){
      if(settings?.canManage!==true)return {...model,disabled:true,action:'none',line:'Waiting for the session leader to ring the bell.'};
      return {...model,line:`Ring it and wave ${island.nextWave} sails in after a ${settings.countdownSeconds} second countdown.`};
    }
    return model;
  }
  function refreshCard() {
    if (isl.disposed) return;
    isl.village.refresh();
    applyWorld();
    if (isl.moving.active) isl.moving.refresh();
    if (isl.ui.open === 'build' && isl.openSpot) showBuild(isl.openSpot);
    else if (isl.ui.open === 'bell') isl.ui.bellCard(bell(), bellAction);
    else if (isl.ui.open === 'invite') isl.ui.inviteCard(inviteModel(isl.own?.code));
    else if (isl.ui.open === 'lobby') isl.ui.lobbyCard(lobby(), {start: startGame});
    else if (isl.ui.open === 'crew') isl.ui.crewCard(crew(), hire);
    else if (isl.ui.open === 'captain') isl.ui.captainCard(captain(), captainHandlers);
    else if (isl.ui.open === 'captains') isl.ui.captainsCard(captainsModel([...isl.here.values()]));
    else if (isl.ui.open === 'harbor') isl.ui.harborCard(harbor(), harborHandlers);
    else if (isl.ui.open === 'tech') showTechHub();
    else if (isl.ui.open === 'wreck') isl.ui.wreckCard(wreck(), wreckHandlers);
    else if (isl.ui.open === 'demolish') isl.ui.demolishCard(demolishCardModel(), demolishHandlers);
    else if (isl.ui.open === 'arsenal') isl.arsenal.redraw();
    else if (isl.ui.open === 'overview') showOverview();
  }
  // The Tear down button follows the wave on screen (off while it runs, on again in its break).
  function refreshCardIfBuild() { if (isl.ui.open === 'build' && isl.openSpot) refreshCard(); }
  function openHarbor() { isl.openSpot = null; isl.cardMessage = ''; isl.ui.harborCard(harbor(), harborHandlers); }
  function showTechHub() {
    const scope = buildingFindScope();
    isl.ui.techCard(tech(), {research: step => void research(step), find: canFindBuilding() ? (id, kind) => {
      if (findOwnedBuilding(id, 'tech', scope, kind) === false) {
        isl.cardMessage = 'This defense is no longer on your island.';
        showTechHub();
      }
    } : null});
  }
  function openTechHub() { isl.openSpot = null; isl.cardMessage = ''; showTechHub(); void freshOwn(); }
  function openWreck() { isl.openSpot = null; isl.cardMessage = ''; isl.ui.wreckCard(wreck(), wreckHandlers); void freshOwn(); void readBoat(); }
  function openBuild(spotId) {
    isl.reportLocation = null;
    isl.openSpot = spotId; isl.cardMessage = ''; showBuild(spotId);
    if (!isl.own && isl.ownRetry) void refreshDefended();
    if (spotById(spotId)?.slot === 'wall') void readWalls();
    if (recoveryControlsOn() && !isPointSpot(spotId) && target()?.spots.find(item => item.id === spotId)?.built) {
      isl.recoveryStatus = isl.recoveryState && isl.recoveryIslandCode === target()?.code ? 'ready' : 'loading';
      clearRecoveryError(); refreshCard(); void readStructureRecovery(spotId);
    }
  }
  function showBuild(spotId) {
    const model = buildModel(spotId);
    isl.selectedHouse = model.kind === 'house' ? inspectHouse(spotId) : null;
    model.houseSupport = isl.selectedHouse?.support ?? null;
    if (isl.ui.selectionSpot === spotId && !model.built) { isl.ui.close(); isl.openSpot = null; return; }
    const dock = isl.village.active && !isl.visiting && !isPointSpot(spotId) && canDockSelection(model);
    const destroyed = model.recovery?.actualHp === 0 && model.recoveryLevel === model.level;
    if (dock && model.slot === 'tower' && !destroyed) {
      const installed = defenses(target()?.spots ?? [], campaign()?.research?.tiers);
      model.coverage = previewDefenseCoverage(installed, spotId, {defensesV2: true});
    }
    isl.ui.buildCard(model, handlers, {dock});
  }
  function selectedAnchor() {
    if (!isl.village.active) return null;
    if (!isl.ui.selectionElement || !isl.openSpot) return isl.reportLocation;
    const spots = target()?.spots, spot = spots?.find(item => item.id === isl.openSpot);
    const at = placedSpot(isl.openSpot, spots);
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return null;
    return {spotId: isl.openSpot, kind: spot?.kind, level: spot?.level, x: at.x, z: at.z,
      size: footprintOf(isl.openSpot), lift: 1, keepFit: spot?.kind !== 'wall'};
  }
  function defenseReportIdentity() {
    const code = target()?.code;
    return code ? JSON.stringify([code, isl.resetGeneration, isl.coreTravelGeneration, isl.reportVisitGeneration]) : null;
  }
  function canFocusDefenseReport(intent) {
    if (!intent?.identity || intent.identity !== defenseReportIdentity() || !isl.village.available
      || !spotById(intent.id) || ![intent.x, intent.z].every(Number.isFinite) || !onIsland(intent.x, intent.z)) return false;
    const epoch = syncCoreContext().epoch;
    return !intent.epoch || !epoch || intent.epoch === epoch;
  }
  function structureAtReportSite(intent) {
    const spot = isl.own?.spots.find(item => item.id === intent.id);
    const at = placedSpot(intent.id, isl.own?.spots);
    return spot?.built && spot.kind === intent.kind && at?.x === intent.x && at.z === intent.z;
  }
  async function resolveDefenseReport(intent) {
    if (!canFocusDefenseReport(intent)) return null;
    if (!intent.epoch) return {spot: null};
    const answer = await isl.api.structureRecovery();
    if (!canFocusDefenseReport(intent)) return null;
    if (!answer.ok) return {spot: null};
    const data = answer.data;
    if (data.islandEpoch !== intent.epoch || data.repairWindow !== 'between_waves') return null;
    const row = data.structures.find(item => item.spot === intent.id);
    const current = intent.instanceId && row?.instanceId === intent.instanceId && row.kind === intent.kind;
    return {spot: current && structureAtReportSite(intent) ? intent.id : null};
  }
  function focusDefenseReport(intent, destination) {
    if (!canFocusDefenseReport(intent)) return false;
    isl.ui.close(); isl.moving.cancel(); isl.openSpot = null; resetInput();
    if (!isl.village.enter()) return false;
    isl.reportLocation = null;
    if (destination.spot === intent.id && structureAtReportSite(intent) && canDockSelection(buildModel(intent.id))) {
      openBuild(intent.id);
      isl.ui.focusSelection();
    } else {
      isl.reportLocation = {x: intent.x, z: intent.z, lift: 1, positionOnly: true};
      isl.ui.toast('Battle location marked', 'info');
      isl.villageBar.focusBuildings();
    }
    return true;
  }
  function openCrew() { isl.openSpot = null; isl.cardMessage = ''; isl.ui.crewCard(crew(), hire); void freshOwn(); }
  const buildingFindScope = () => JSON.stringify([isl.own?.code, isl.own?.islandEpoch, isl.resetGeneration, isl.coreTravelGeneration, isl.reportVisitGeneration]);
  const canFindBuilding = () => isl.village.available && !isl.moving.active;
  function showOverview(message = isl.ownMessage) {
    const find = canFindBuilding(), scope = buildingFindScope();
    isl.ui.overviewCard(upgradeOverviewModel({island: isl.own, battle: isl.battle && !isl.waveOver, find, message}), {
      find: find ? id => {
        if (findOwnedBuilding(id, 'overview', scope) === false) showOverview('This building is no longer on your island.');
      } : null,
    });
  }
  function findOwnedBuilding(id, card, scope, kind = null) {
    if (isl.ui.open !== card || scope !== buildingFindScope() || !canFindBuilding()) return;
    if (!spotById(id) || !isl.own.spots.some(spot => spot.id === id && spot.built === true && (!kind || spot.kind === kind))) return false;
    if (!isl.village.enter()) return;
    isl.ui.close();
    openBuild(id);
  }
  function openOverview() { isl.openSpot = null; isl.cardMessage = ''; showOverview(); void freshOwn(); }
  function openCaptain(tab = null) {
    isl.openSpot = null; isl.cardMessage = ''; if (['captain', 'skills'].includes(tab)) isl.captainTab = tab;
    isl.ui.captainCard(captain(), captainHandlers); void freshOwn();
  }
  async function openLeaderboard(scope = isl.leaderboardScope) {
    const request = ++isl.leaderboardRequest;
    isl.openSpot = null; isl.leaderboardScope = scope;
    const shown = campaign(); // the island on screen, as its statue and shield show it
    const base = {scope, progress: shown ? progressSummary(shown.wave) : null};
    const actions = {retry: () => void openLeaderboard(), choose: next => void openLeaderboard(next)};
    isl.ui.leaderboardCard({...base, loading: true}, actions);
    const answer = await isl.api.leaderboard(scope);
    if (isl.disposed || request !== isl.leaderboardRequest || isl.ui.open !== 'leaderboard') return;
    isl.ui.leaderboardCard(answer.ok ? {...base, data: answer.data} : {...base, message: answer.message}, actions);
  }
  function openCaptains() { isl.openSpot = null; isl.cardMessage = ''; isl.ui.captainsCard(captainsModel([...isl.here.values()])); }
  async function openBell() {
    isl.openSpot = null; isl.cardMessage = ''; isl.ui.bellCard(bell(), bellAction);
    if (!isl.own && isl.ownRetry) void refreshDefended();
    void readWalls();
    if (target()) await isl.flow.look(where());
  }
  function openInvite() {
    isl.openSpot = null; isl.cardMessage = '';
    isl.ui.inviteCard(inviteModel(isl.own?.code));
    emit({type: ISLAND_INVITE_OPENED, code: isl.own?.code ? displayIslandCode(isl.own.code) : null});
    if (!isl.own) void freshOwn().then(answer => {
      if (isl.disposed || isl.own || !answer || answer.ok || isl.ui.open !== 'invite') return;
      const problem = answer.status === 401 || answer.code === 'not_ready' ? 'signin'
        : (answer.message || 'Your island could not be loaded.');
      isl.ui.inviteCard(inviteModel(null, undefined, problem));
    });
  }
  function pick(id) {
    if (isl.disposed) return;
    isl.reportLocation = null;
    if (id === BELL.id) void openBell();
    else if (id === CABIN.id) openLobby();
    else if (id === 'island_harbor') openHarbor();
    else if (id === 'island_techhub') openTechHub();
    else if (id === 'island_wreck') openWreck();
    else if (id === ARSENAL.id) { isl.openSpot = null; isl.arsenal.open(); }
    else if (spotById(id) || isPointSpot(id)) openBuild(id);
  }
  function link() { // the names of the other parts, once every part exists (index.js)
    ({currentFunds, sharedCard, clearRecoveryError, recoveryPolicyOn, recoveryControlsOn, recoveryModelVersion, readStructureRecovery,
      repairStructure, tellCoins, unlocks, islandUnlocks, campaign, target, where, applyWorld, freshOwn, reloadOwn,
      refreshDefended, lobby, startGame, openLobby, bellAction, build, readWalls, repairWall, upgrade, askDemolish,
      confirmDemolish, placeCode, specialise, buyTree, startMove, research, giveWreck, hire, upgradeCaptain,
      learnSkill, takeRole, respecCaptain, inspectHouse, syncCoreContext, researchIsland} = isl);
  }
  return {demolishHandlers, demolishCardModel, interruptBoat, readBoat, bell, refreshCard, refreshCardIfBuild,
    openHarbor, openTechHub, openWreck, selectedAnchor, openCrew, openOverview, openCaptain, openLeaderboard,
    openCaptains, openInvite, pick, defenseReportIdentity, canFocusDefenseReport, resolveDefenseReport,
    focusDefenseReport, link};
}
