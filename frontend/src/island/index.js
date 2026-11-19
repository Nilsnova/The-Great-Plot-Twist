// Your island, put together: the server's island (api.js), its drawing on home_islet (world.js), the
// build, bell and invite cards (ui.js), the wave around the bell (wave-flow.js) and visits by code.
// game.js loads this file only when the islands are on (mode.js) and asks it a few small things:
//   decorate(place, art, cleanups, adapters)  draws the island on the home_islet place
//   owns(zoneId) / label(zoneId)              its interaction zones and their prompt
//   presencePlace(place)                      isle_<code> on an island (live:place:isle_k7q2m:1)
//   playArrival() / visit(code) / sailHome()  the first landing, and visits by code
//   chartVisible(id) / chartLabel(id)         the three sea chart destinations
//   placeName(id)                             the arrival banner's name in a friend's game ("Nils's game")
//   active / handleEscape() / dispose()
//   decoratePoint(place, cleanups, adapters)  Pirate Point's shared build spots (TOWER-DEFENSE.md §5)
//   openCrew() / openCaptain() / openInvite()  the Menu's Crew, Captain and skills (the musket and the skill
//                                             tree §14; weapons are in the arsenal, D042), and the invite card
//   setPresence(presence)                     the captains in the room, for the arrival toasts (§11)
//   enterGame({code, role}) / openLobby()       the games of GAME-V3.md §2: which game Play opens, its lobby
//   attachGame(room)                           the game's room state (game-room.js, from the wave wiring)
//   openHarbor(id) / openTechHub() / openWreck()  the campaign's buildings (GAME-V3.md §4, §5)
//   startMove(spotId) / moving                 T36 Move mode: a spot to another square of the build grid
//   arsenal                                    the shared weapon rack (T41, D042; always on), arsenal.js
//   resetIsland(typed)                         T53: Settings › Reset my island (reset.js), your own island only
// Events it emits on the game's bus: island_built {kind, spot}, island_upgraded {kind, spot, level},
// campaign_unlocked {wave, ids, code} (a won wave opened something on the island on screen, once per
// island and wave on this page; the narrator plays its lines), tower_specialised {spot, spec},
// island_spots_changed {place, spot} (any build or upgrade, also a friend's island and Pirate Point), island_visit_named {place, name}
// (the friend's game on screen learned its host's name, so the arrival banner can follow), crew_hired {crew}, island_invite_opened, wave_started_server {...} and wave_finished {...} (wave-hooks.js).
// After a reset (T53): island_reset {code}, then game_started {code, first: true, fresh: true} (no intro or guided start again: explained once per device).
//
// This file builds the island: its options, its state (one object `isl` shared by the parts), everything that
// runs at the start in its order (the API, the cards' UI, Move and Village mode, the arsenal, the wave flow, the
// bus subscriptions, the Menu and Settings entries) and the object game.js uses. The parts, one job each:
//   island-shared.js    the module-level event names, storage keys and small helpers (re-exported here)
//   island-load.js      reading the island on screen: load(), visits and joins, setOwn and the campaign, the
//                       read/write turns, applyWorld, Pirate Point's load, and how answers land (took/refused)
//   island-recovery.js  structure recovery (D059): its read, poll, paid repair, errors and the combat state
//   island-cards.js     the cards: build, bell, crew, captain, tech hub, wreck and boat, harbor, invite, pick()
//   island-actions.js   the actions: build, upgrade, repair, demolish, specialise, trees, Move and Village mode,
//                       research, gifts, hiring, the captain's level, skills and role
//   island-game.js      the games (GAME-V3.md §2): sync, lobby, colours, visit, leave, enter, sail home, the
//                       presence toasts, the bell's actions, the first landing, Reset my island
import {createIslandApi} from './api.js';
import {createWaveFlow} from './wave-flow.js';
import {createIslandUi} from './ui.js';
import {decorateIsland} from './world.js';
import {createMoveMode} from './move-mode.js';
import {createMoveBar} from './move-bar.js';
import {createVillageMode, isTextEntry} from './village-mode.js';
import {createVillageBar} from './village-bar.js';
import {SPOTS, KINDS, BELL, CABIN, ISLAND_PLACE, POINT_PLACE, PP_SPOTS, isIslandZone, isPointSpot, spotById,
  ppSpotById, pointZones, defenses, slotName, campaignBuilding, placedSpot, ARSENAL} from './spots.js';
import {createArsenal} from './arsenal.js';
import {createArsenalApi} from './arsenal-api.js';
import {opensText, waveOf} from '../campaign/index.js';
import {isRole, readSkills} from '../pirates/captain-ids.js';
import {displayIslandCode, islandRoom, readVisit} from './codes.js';
import {WAVE_FINISHED} from '../ui/quest-events.js';
import {maxLevel} from './td-rules.js';
import {WAVE_STARTED} from './wave-hooks.js';
import {addMenuExtras} from '../shell/menu-extras.js';
import {GAME_STARTED} from './lobby.js';
import {travelAllowed} from './one-island.js';
import {createResetSection} from './reset.js';
import {addSettingsSection} from '../shell/settings-extras.js';
import {createCoreState} from './core-state.js';
import {decorateCore} from './core-world.js';
import {NEWS_KEY, CHART_NAMES, notReady, ALL_REPAIRED, safeLocal} from './island-shared.js';
import {createRecovery} from './island-recovery.js';
import {createLoading} from './island-load.js';
import {createGames} from './island-game.js';
import {createCards} from './island-cards.js';
import {createActions} from './island-actions.js';
import {createIslandEconomy} from './island-economy.js';
import {createSharedBoatApi} from './shared-boat-api.js';
import {createBoatRoundSession} from './shared-boat-session.js';
import {createIslandSession} from './island-session.js';
import {readLegacyEconomy} from './economy-view.js';
import {createSharedWaveApi} from './shared-wave-api.js';
import {createSharedRevivalApi} from './shared-revival-api.js';

export {ARRIVAL_KEY, SPOTS_CHANGED, NEWS_KEY, CAMPAIGN_UNLOCKED, TOWER_SPECIALISED, TOWER_TREE_BOUGHT,
  HOUSE_ROLE_PICKED, VISIT_NAMED, ISLAND_RESET, CHART_NAMES, ALL_REPAIRED} from './island-shared.js';

export function createIsland({container, emit, on, mode = 'live', getTransport = () => null, transport = null,
  search = globalThis.location?.search ?? '', focus = () => {}, resetInput = () => {}, reducedMotion = () => false,
  preferences = () => ({}), storage = safeLocal(), visitStorage = undefined, getActorId = () => null, isOnIsland = () => true,
  authGeneration = () => transport, onAuthGenerationChange = () => () => {},
  loadCutscenes = () => import('../cutscenes/player.js'),
  loadBoatScene = () => import('../pirates/boat/scene.js'),
  onCoins = () => {}, onCaptain = () => {}, onQuestIsland = () => {}, menu = addMenuExtras, settings = addSettingsSection, now, setTimer, clearTimer, openHarborStall = () => {},
  travel = () => travelAllowed({islandsMode: mode}), villageCamera = () => {},
  structureRecoveryOn = () => false} = {}) {
  // The island's state, shared by its parts (island-*.js) as isl.own, isl.visiting, isl.ui, ...: every `let` of this
  // closure and the objects built below that the parts use; the options too.
  const isl = {container, emit, on, mode, getTransport, transport, search, focus, resetInput, reducedMotion,
    preferences, storage, visitStorage, getActorId, isOnIsland, authGeneration, onAuthGenerationChange, loadCutscenes, loadBoatScene, onCoins, onCaptain, onQuestIsland, menu,
    settings, now, setTimer, clearTimer, openHarborStall, travel, villageCamera, structureRecoveryOn};
  Object.assign(isl, createIslandEconomy(isl));
  const economyContext = mode === 'fake' ? {} : {getEconomy: isl.getEconomy, getActorId};
  // The parts, each a closure over isl; they call each other through names linked once all exist. They only
  // define functions here: everything that runs at the start stays below, in its order.
  const parts = [createRecovery, createLoading, createGames, createCards, createActions].map(create => create(isl));
  for (const {link, ...part} of parts) Object.assign(isl, part);
  for (const part of parts) part.link?.();
  const {recoveryPolicyOn, recoveryModelVersion, stopRecoveryPoll, readStructureRecovery, setRecoveryCombatState,
    setRecoveryCheckpointHandler, firstTime, tellCoins, campaign, reading, wrote, setOwnRead, coinsAsked, target,
    where, applyWorld, syncCoreContext, setCoreCombatState, endVisit, placeName, joinFirst, load, loadPoint,
    tookCoins, arsenalCoins, reloadVisit, refreshDefended, currentCode, syncGame, wantSync, colourOf, captainColour,
    openLobby, setPresence, resetState, resetIsland, playArrival, visit, leaveGame, enterGame, sailHome,
    interruptBoat, refreshCard, refreshCardIfBuild, openHarbor, openTechHub, openWreck, selectedAnchor, openCrew,
    openOverview, openCaptain, openLeaderboard, openCaptains, openInvite, pick, invalidateWallFeedback, build,
    upgrade, askDemolish, confirmDemolish, heardDemolish, specialise, buyTree, toggleVillage, startMove, moved,
    houseRange, research, giveWreck, hire, upgradeCaptain, learnSkill, takeRole, respecCaptain} = isl;
  // ownRetry: your own island's read failed for a passing reason, so the next reread (the wave wiring's
  // 15 s timer, the bell or a build card) reads it again instead of leaving the island empty for good.
  isl.disposed = false; isl.own = null; isl.ownMessage = ''; isl.ownRetry = false; isl.visiting = null; isl.visitCode = readVisit(visitStorage); isl.busySpot = null; isl.cardMessage = '';
  isl.personalUnavailable = false; isl.selectionGeneration = 0;
  isl.pendingWallet = null; isl.walletGeneration = 0;
  isl.world = null; isl.cutscene = null; isl.openSpot = null; isl.loadTicket = 0; isl.battle = false;
  isl.wallFeedbackGeneration = 0;
  isl.coreState = createCoreState();
  isl.coreWorld = null; isl.coreContextKey = null; isl.coreTravelGeneration = 0; isl.coreRejoin = null;
  isl.pointBattle = false;
  // GAME-V3.md §4.2, tearing a building down: the wave on screen is over (its break), the spot whose
  // confirmation is open, the server's quote for it, and the tear-down on its way.
  isl.waveOver = false; isl.demolishSpot = null; isl.demolishQuote = null; isl.busyDemolish = false;
  isl.busyKind = null; isl.point = null; isl.pointWorld = null; isl.pointMessage = ''; isl.busyCrew = null; isl.busyCaptain = false; isl.here = new Map(); isl.presenceReady = false;
  // The Captain and skills card: the open tab, the skill shown below the tree, a learn, buy or equip under way.
  isl.captainTab = 'captain'; isl.pickedSkill = null; isl.busySkill = null;
  // D039: the walls of the island on screen (spot -> {health, recoversAt, repairCost}), read when a wall card opens.
  isl.walls = new Map(); isl.wallsFor = null; // wallsFor: the island code they belong to
  isl.recoveryState = null; isl.recoveryIslandCode = null; isl.recoveryStatus = 'disabled'; isl.recoveryError = null;
  isl.recoveryErrorSource = null; isl.recoveryErrorContext = null;
  isl.recoveryCheckpointHandler = null;
  isl.recoveryCombat = null; isl.recoveryPendingSpot = null; isl.recoveryReadId = 0; isl.recoveryPollTimer = null; isl.recoveryPollCode = null;
  isl.recoveryReadPromise = null; isl.recoveryReadCode = null;
  isl.pickedRole = null; isl.busyRole = false; isl.respecAsk = false; isl.busyRespec = false;
  // D055: the tile of a tower's tree the player tapped, per spot (the card picks the next step without one).
  isl.treePicked = new Map();
  // The games (GAME-V3.md §2): the room state from the wave wiring, the codes joined this page, the lobby.
  isl.game = null; isl.gameCode = null; isl.lobbyAnswer = null; isl.lobbyProblem = ''; isl.lobbyBusy = false; isl.lobbyRead = 0; isl.stopGame = () => {};
  isl.joined = new Set();
  // Once-per-device lines (the first unlock explanation, the musket hint).
  isl.news = (() => { try { return new Set(JSON.parse(storage?.getItem(NEWS_KEY) ?? '[]')); } catch { return new Set(); } })();
  // The fake answers at once; the live transport is the signed-in session's, read at every call.
  isl.live = {get: (path, ...options) => (getTransport()?.get?.(path, ...options) ?? notReady()),
    post: (path, body, ...options) => (getTransport()?.post?.(path, body, ...options) ?? notReady())};
  isl.islandTransport = transport ?? isl.live;
  isl.sharedBoatApi = createSharedBoatApi({transport: isl.islandTransport, getEconomy: isl.getEconomy, onEconomy: isl.refreshEconomy});
  isl.sharedBoatSession = createBoatRoundSession({api: isl.sharedBoatApi, getEconomy: isl.getEconomy, getActorId, storage});
  isl.session = createIslandSession(isl);
  isl.sharedWaves = createSharedWaveApi({transport:isl.islandTransport,getEconomy:isl.getEconomy,getActorId,
    getProof:()=>isl.session.proof(),onEconomy:isl.refreshEconomy,storage,allowLegacy:()=>mode==='fake' || !!readLegacyEconomy(isl.getEconomy())});
  isl.sharedRevival=createSharedRevivalApi({transport:isl.islandTransport,getEconomy:isl.getEconomy,getActorId,getProof:()=>isl.session.proof(),storage});
  isl.api = createIslandApi({transport: isl.islandTransport, ...economyContext, onEconomy: isl.refreshEconomy,
    sharedWaves:()=>mode!=='fake' && isl.domainAvailable('session')?isl.sharedWaves:null,
    economy: () => isl.currentFunds().shared ? isl.currentFunds().economy : undefined, sharedSnapshot: () => isl.visitCode && !isl.visiting ? null : isl.visiting ?? isl.own,
    personalCaptain: () => isl.own?.captain ?? (isl.personalUnavailable ? {progressionVersion: 1} : null),
    personalScope: () => `${getActorId() ?? ''}:${isl.own?.code ?? ''}`, pendingStorage: storage, authGeneration, negotiateEconomy: mode !== 'fake',
    waveProtocol: where => where === 'pirate_point' ? 1 : 2});
  isl.recoveryTransport = Object.freeze(isl.sharedWaves.recoveryTransport(isl.islandTransport));
  const roomPlace = () => mode === 'fake' || readLegacyEconomy(isl.getEconomy())
    ? islandRoom(isl.visiting?.code ?? isl.visitCode ?? isl.own?.code ?? '') || null : isl.session.roomPlace();
  isl.ui = createIslandUi({container, focus, resetInput,
    onSelection: active => isl.villageBar.render(isl.village.active && !active && !isl.moving.active)});
  // T36, flexible placement: Move mode (move-mode.js) with its bar (move-bar.js) and the preview on the island.
  isl.moving = createMoveMode({api: isl.api, render: model => { isl.moveBar.render(model); isl.villageBar.render(isl.village.active && !model); }, preview: cell => isl.world?.preview(cell),
    spots: () => target()?.spots ?? [], code: () => (isl.visiting ? isl.visiting.code : null), onMoved: (answer, spotId) => void moved(answer, spotId)});
  isl.moveBar = createMoveBar({container, handlers: {nudge: (dx, dz) => isl.moving.nudge(dx, dz), place: () => void isl.moving.confirm(), cancel: () => isl.moving.cancel()}});
  // A confirmed fresh start begins a new island identity for the core display (VIS-35).
  isl.resetGeneration = 0;
  isl.villageBar = createVillageBar({container, onLeave: () => isl.village.leave(), onPick: pick, onCamera: villageCamera});
  isl.village = createVillageMode({
    context: () => ({ready: !!isl.own?.code && !!isl.world, own: !isl.visiting && !isl.visitCode, code: isl.own?.code,
      // A successful start/join awaits preparation before flow.current is set.
      reserved: isl.flow.busy || !!isl.flow.current || (isl.battle && !isl.waveOver)}),
    render: active => isl.villageBar.render(active),
    onLeave: () => { isl.moving.cancel(); isl.ui.close(); isl.openSpot = null; resetInput(); focus(); },
  });
  const villageKeys = event => {
    if (event.defaultPrevented || isTextEntry(event.target)) return;
    const gameFocus = event.target?.matches?.('canvas') || event.target === globalThis.document?.body;
    if (gameFocus && !isl.ui.active && !isl.moving.active && event.code === 'KeyE'
      && !event.altKey && !event.ctrlKey && !event.metaKey && isl.villageBar.focusBuildings()) {
      event.preventDefault(); event.stopPropagation(); return;
    }
    const buttonEnter = event.key === 'Enter' && event.target?.tagName === 'BUTTON';
    if (isl.moving.active && !isl.ui.active && !buttonEnter) isl.moving.handleKey(event);
  };
  globalThis.addEventListener?.('keydown', villageKeys, true);
  // The arsenal (T41, D042): the crew's weapons (the server's flag "arsenal" is always on; the old shop is gone).
  isl.arsenal = createArsenal({api: createArsenalApi({transport: transport ?? isl.live, ...economyContext}),
    ...economyContext, onEconomy: isl.refreshEconomy, ui: isl.ui, emit, enabled: () => isl.domainAvailable('arsenal'),
    readEnabled: () => !target() || !!isl.visitCode && !isl.visiting || isl.domainAvailable('arsenal'),
    code: () => (isl.visiting ? displayIslandCode(isl.visiting.code) : isl.visitCode ? displayIslandCode(isl.visitCode) : null),
    place: () => (isl.visiting ? 'visit' : 'own'), level: () => isl.own?.captain?.level ?? 1,
    skills: () => readSkills([...(isl.own?.skills?.known ?? []), ...(isRole(isl.own?.skills?.role) ? [isl.own.skills.role] : [])]),
    asking: coinsAsked, onCoins: (coins, fresh) => arsenalCoins(coins, fresh)});
  isl.placeholder = mode === 'fake' || new URLSearchParams(search).get('wavedebug') === '1';
  // Before a wave we are in starts: the defended island once more, so a friend's co-op build is in it.
  isl.flow = createWaveFlow({api: isl.api, emit, placeholder: isl.placeholder, now, setTimer, clearTimer, prepare: async () => {
    await refreshDefended();
    if (isl.openSpot && recoveryPolicyOn()) await readStructureRecovery(isl.openSpot);
  },
    notify: (text, tone) => isl.ui.toast(text, tone), banner: text => isl.ui.banner(text), onChange: () => refreshCard(),
    defensesOf: () => defenses(target()?.spots ?? [], campaign()?.research?.tiers)});
  const stopFinished = on(WAVE_FINISHED, event => {
    if (isl.disposed) return;
    tellCoins(event.coins, {tick: true}); // the loot counts up in the HUD
    const activeWaveId = isl.flow.current?.wave.waveId;
    const endedHere = !activeWaveId || activeWaveId === event.waveId;
    if (endedHere) isl.waveOver = true; // An old receipt must not open the next wave's break.
    if (!isl.own) return;
    if (!isl.visiting && Number.isSafeInteger(event.coins)) isl.own = {...isl.own, coins: event.coins, flags: event.flags ?? isl.own.flags};
    refreshCard();
    void readStructureRecovery();
    // The owner's rule (fix/playtest-1117): the server repairs every building when a wave ends.
    if (endedHere && Number.isSafeInteger(event.coins)) isl.ui.toast(ALL_REPAIRED, 'info');
    // A won wave may open something (GAME-V3.md §4): read the island again; setOwn (or the visit) tells what is new.
    if (event.survived === true) {
      const current = reading('own'); void isl.api.getIsland().then(fresh => { if (!isl.disposed && fresh.ok && current()) { setOwnRead(fresh.data); refreshCard(); } });
      if (isl.visiting) void reloadVisit().then(() => { if (!isl.disposed) refreshCard(); });
    }
  });
  // The musket hint (§10), once per device, when the first wave starts.
  const stopStarted = on(WAVE_STARTED, () => {
    isl.village.leave();
    void readStructureRecovery();
    if (!isl.disposed && firstTime('musket')) isl.ui.toast('Tap a ship to fire your musket (F).', 'info');
    interruptBoat(true);
  });
  // Every landing on home_islet loads the island shown there: your own, or the one you visit.
  const stopArrived = on('arrived', event => { if (event.place === ISLAND_PLACE) void load(); });
  const stopInteract = on('interact', event => {
    if (event.place === ISLAND_PLACE && isIslandZone(event.id)) pick(event.id);
    else if (event.place === POINT_PLACE && isPointSpot(event.id)) pick(event.id);
  });
  const stopPoint = on('arrived', event => { if (event.place === POINT_PLACE) void loadPoint(); });
  // Leaving the island closes its card and ends a visit (the next landing is your own island).
  const stopTravel = on('travel', event => {
    void isl.session.leave();
    interruptBoat();
    isl.village.leave();
    invalidateWallFeedback();
    isl.coreTravelGeneration++; syncCoreContext();
    isl.ui.close(); isl.flow.reset(); isl.openSpot = null; isl.moving.cancel();
    if (isl.visiting && event.to !== ISLAND_PLACE) endVisit();
  });
  isl.syncSoon = null;
  // Start pressed anywhere in the room: every lobby closes (the narrator listens to the same event).
  const stopStartedGame = on(GAME_STARTED, event => {
    if (isl.disposed || event?.fresh === true) return; // a reset (T53) has its own toast
    if (isl.ui.open === 'lobby') { isl.ui.close(); isl.openSpot = null; }
    isl.ui.toast('The game is on! Ring the bell when you are ready.', 'success');
  });
  // The campaign's buildings (GAME-V3.md §4, §5): the Harbor, the Tech hub and the wreck.
  isl.busyResearch = null; isl.busyGift = null;
  // D057: the island's own boat after wave 30. boatStatus: GET /api/island/boat of the island on screen (null while
  // it loads); boatGame: the round on screen (pirates/boat/scene.js, loaded on the first sail).
  isl.boatStatus = null; isl.boatGame = null; isl.boatLoading = false; isl.boatTicket = 0; isl.boatLaunch = 0;
  // T7/T45: the Leaderboard card. It remembers the chosen tab (this week or all time) while the game runs.
  isl.leaderboardRequest = 0; isl.leaderboardScope = 'week';
  // The Menu's island entries (shell/menu-extras.js).
  const stopMenu = menu(() => [
    {label: 'Players and invite', onSelect: () => openLobby()},
    ...(isl.visiting || isl.visitCode ? [{label: 'Leave this game', onSelect: () => void leaveGame()}] : []),
    ...(isl.village.active || isl.village.available ? [{label: isl.village.active ? 'Exit village mode' : 'Manage village', onSelect: toggleVillage}] : []),
    {label: 'Leaderboard', onSelect: () => void openLeaderboard()},
    ...(!isl.visiting && !isl.visitCode ? [{label: 'Base overview', onSelect: () => openOverview()}] : []),
    {label: 'Crew', onSelect: () => openCrew()},
    {label: 'Captain and skills', onSelect: () => openCaptain()},
    ...(isl.here.size ? [{label: `Captains here (${isl.here.size})`, onSelect: () => openCaptains()}] : []),
  ]);
  const stopSettings = settings(() => createResetSection({read: resetState, reset: resetIsland}));


  const stopEconomyIdentity = isl.watchEconomyIdentity();
  return {
    decorate(place, art, cleanups, adapters = {}) {
      isl.world?.dispose();
      isl.coreWorld?.dispose();
      const core = decorateCore(place);
      const deco = decorateIsland(place, {container, art, reducedMotion, quality: () => preferences().quality, canvas: adapters.canvas, camera: adapters.camera,
        isActive: adapters.isActive, onPick: pick, range: houseRange, selection: selectedAnchor, defenseRange: () => isl.ui.selectionRange,
        player: adapters.player, onFar: adapters.onFar,
        placing: () => isl.moving.active, onGround: (x, z) => isl.moving.tap(x, z),
        canPickRemote: id => isl.village.active && !!spotById(id),
        retryAdditionalArt: () => deco.runArtTask('core', () => core.retryArt())});
      isl.world = deco; isl.coreWorld = core; applyWorld(); core.setHealth(isl.coreState.current);
      deco.runArtTask('core', () => core.retryArt());
      const original = place.update;
      place.update = (dt, frame) => { original(dt, frame); deco.update(dt, frame?.time ?? 0, frame?.paused); };
      cleanups.push(() => { deco.dispose(); core.dispose(); if (isl.world === deco) isl.world = null; if (isl.coreWorld === core) isl.coreWorld = null; place.update = original; });
    },
    // Pirate Point's shared build spots on lighthouse_isle (factory.js); its bell and lamps stay lane P's.
    decoratePoint(place, adapters = {}) {
      isl.pointWorld?.dispose();
      const deco = decorateIsland(place, {container, reducedMotion, quality: () => preferences().quality, canvas: adapters.canvas, camera: adapters.camera, isActive: adapters.isActive, onPick: pick, selection: selectedAnchor, player: adapters.player, onFar: adapters.onFar,
        layout: {spots: PP_SPOTS, zones: pointZones, bell: false, cabin: false, name: 'pirate-point-spots'}});
      isl.pointWorld = deco; applyWorld();
      const original = place.update, dispose = place.dispose;
      place.update = (dt, frame) => { original(dt, frame); deco.update(dt, frame?.time ?? 0); };
      place.dispose = () => { deco.dispose(); if (isl.pointWorld === deco) isl.pointWorld = null; place.update = original; dispose?.(); };
      return place;
    },
    owns: isIslandZone,
    label(zone) {
      if (zone === BELL.id) return isl.flow.current && !isl.flow.current.joined ? 'Join the defense' : 'Ring the harbor bell';
      if (zone === CABIN.id) return 'Players and invite';
      if (zone === ARSENAL.id) return 'Open the arsenal';
      const building = campaignBuilding(zone);
      if (building) {
        const shown = campaign();
        return shown?.open.has(building.item) ? building.name : `${building.name} · ${opensText(waveOf(building.item))}`;
      }
      const pointSpot = isPointSpot(zone), spot = pointSpot ? ppSpotById(zone) : spotById(zone);
      if (!spot) return undefined;
      const answer = (pointSpot ? isl.point : target())?.spots.find(item => item.id === zone);
      if (answer?.built) {
        const name = KINDS[answer.kind]?.name ?? slotName(spot.slot);
        return (answer.level ?? 1) >= maxLevel(answer.kind) ? `${name} · top level` : `Upgrade ${name}`;
      }
      return 'Build here';
    },
    // Where the floating prompt hangs: the spot's world point and how far above it the building is drawn.
    anchor(zone) {
      const thing = placedSpot(zone, target()?.spots) ?? ppSpotById(zone) ?? (zone === BELL.id ? BELL : zone === CABIN.id ? CABIN : zone === ARSENAL.id ? ARSENAL : campaignBuilding(zone));
      if (!thing) return null;
      return {x: thing.x, z: thing.z, lift: thing.kind === 'watchtower' ? 4.6 : thing.h ? Math.min(4.6, thing.h * .7) : 2.6};
    },
    presencePlace(place) {
      if (place !== ISLAND_PLACE) return null;
      return roomPlace();
    },
    load, loadPoint, playArrival, visit, sailHome, resetIsland, pick, build, upgrade, hire, upgradeCaptain, learnSkill, takeRole, respecCaptain, setPresence,
    setRecoveryCombatState, setRecoveryCheckpointHandler, setCoreCombatState,
    get coreContext() { return {...syncCoreContext(), rejoin: isl.coreRejoin ? {...isl.coreRejoin} : null}; },
    // Your captain for the wave (src/pirates/game-wiring.js): level, learnt skills (§14), equipped weapon (§15).
    captainLoadout: () => ({level: isl.own?.captain?.level ?? 1, skills: readSkills([...(isl.own?.skills?.known ?? []), ...(isRole(isl.own?.skills?.role) ? [isl.own.skills.role] : [])]), weapon: isl.arsenal.weapon(),
      colour: captainColour()}),
    // The arsenal of the island on screen (T41): open(), refresh(), weapon(), answer.
    arsenal: isl.arsenal,
    // Captain colours (GAME-V3.md §7): each member's 0-9 by join order, and your own (src/island/lobby.js).
    colourOf, captainColour,
    openOverview, openLeaderboard, openInvite, openCrew, openCaptain, openCaptains, openLobby, enterGame, leaveGame, openHarbor, openTechHub, openWreck,
    specialise, research, giveWreck, askDemolish, confirmDemolish, heardDemolish, buyTree,
    // The campaign of the island on screen (GAME-V3.md §4): {wave, open, locked, later, research, wreck}.
    get campaign() { return campaign(); },
    // The game's room state (src/island/game-room.js), handed in by the wave wiring.
    attachGame(room) {
      isl.stopGame(); isl.game = room ?? null; isl.gameCode = null;
      if (isl.game) { void syncGame(); isl.stopGame = () => {}; }
      if (isl.ui.open === 'lobby') refreshCard();
    },
    get game() { return isl.game?.state ?? null; },
    get mode() { return mode; },
    // The room state changed: draw the lobby again, and read it again when somebody new is in the room.
    refreshLobby() {
      if (isl.game && [...(isl.game.state.online ?? [])].some(id => !isl.game.knows(id))) wantSync();
      if (isl.ui.open === 'lobby') refreshCard();
    },
    get gameCode() { return currentCode(); },
    get point() { return isl.point ? structuredClone(isl.point) : null; },
    // The wave on screen (src/pirates/, wired in game.js): the built defenses it fights with, the client
    // for Pirate Point, the island's room place (isle_<code>), joining a running wave, and the battle look.
    defenses: () => defenses(target()?.spots ?? [], campaign()?.research?.tiers),
    get api() { return isl.api; },
    // A fresh account read after background reward settlement, guarded by its service owner and write order.
    setWalletCoins(value) {
      if (isl.disposed || !Number.isSafeInteger(value) || value < 0) return;
      if (isl.own) wrote('own');
      else isl.walletGeneration++;
      tookCoins(value); refreshCard();
    },
    resetWalletRecovery() { isl.pendingWallet = null; isl.walletGeneration++; wrote('own'); },
    get recoveryTransport() { return isl.recoveryTransport; },
    get recoveryVersion() { return recoveryModelVersion(); },
    roomPlace,
    get session() { return isl.session; },
    completeRevival:intent=>isl.sharedRevival.complete(intent),
    // A recovery wave ended on screen (controller.js): free the bell and the village, and with its close
    // answer ({survived, loot, coins, waveBest, flags}) tell the island like a finish answer.
    recoveryWaveEnded(waveId, data = null) { if (!isl.disposed && typeof waveId === 'string') isl.flow.ended(waveId, data); },
    async joinRunningWave() {
      if (isl.disposed || !target()) return null;
      if (isl.visitCode && !(await joinFirst(isl.visitCode))) return null; // a friend's wave: join the game first
      if (isl.disposed || !target()) return null;
      const looked = await isl.flow.look(where());
      if (isl.flow.current && !isl.flow.current.joined) return isl.flow.join(where());
      // A newer read of the current wave (the landing's own, after a reload) made this answer stale before it
      // was shown: 'busy' makes the wave wiring try again in a moment instead of never joining.
      if (!isl.flow.current && looked?.ok && looked.data) return {ok: false, status: 0, code: 'busy', message: 'The wave is still being read.'};
      return null;
    },
    refreshDefended,
    // Captain health (GAME-V3.md §3): you stand a fallen teammate up and pay for it (your coins follow).
    async reviveCaptain(body = {}) {
      const answer = await isl.api.reviveCaptain(body);
      if (!isl.disposed && answer.ok) tookCoins(answer.data.coins);
      return answer;
    },
    // The island's wave controller stopped this wave (src/pirates/game-wiring.js): a bell still holding it goes.
    waveStopped(waveId) { if (!isl.disposed && typeof waveId === 'string') isl.flow.release(waveId); },
    setBattle(value) {
      if (value === true && !isl.battle) invalidateWallFeedback();
      isl.battle = value === true;
      if (isl.battle) {
        isl.village.leave(); isl.waveOver = false; isl.moving.cancel(); interruptBoat(true);
      }
      applyWorld(); refreshCardIfBuild();
      if (['captain', 'tech', 'overview'].includes(isl.ui.open)) refreshCard();
    },
    // A Pirate Point battle: its built walls, cannons and mortars are drawn by the wave renderer meanwhile.
    setPointBattle(value) { isl.pointBattle = value === true; applyWorld(); },
    // The bell again, for the wave's break ("Next wave", TOWER-DEFENSE.md §1): the start route where the
    // player stands (own island or the friend's), the bell swings; answers like flow.ring ({ok, ...}).
    async ringBell() {
      if (isl.disposed || !target()) return {ok: false, status: 0, code: 'not_ready', message: 'Your island is still loading.'};
      const answer = await isl.flow.ring(where(), {joinRunning: true});
      if (!isl.disposed && answer.ok && !answer.ignored) isl.world?.ring();
      return answer;
    },
    chartVisible: id => Object.hasOwn(CHART_NAMES, id),
    chartLabel: id => CHART_NAMES[id],
    placeName,
    get visiting() { return isl.visiting ? {...isl.visiting} : isl.visitCode ? {code: isl.visitCode} : null; },
    get island() { return isl.own ? structuredClone(isl.own) : null; },
    get economy() { const value = isl.getEconomy(); return value ? structuredClone(value) : null; },
    refreshEconomy: isl.refreshEconomy,
    // T52: your own island's best wave, without copying the island (the tutorials read it every frame).
    get ownWaveBest() { return Number.isSafeInteger(isl.own?.waveBest) ? isl.own.waveBest : null; },
    get flow() { return isl.flow; },
    // The fake server's helpers (setCoins, failNext, startWaveAt...) in fake mode, for the console and checks.
    get dev() { return transport?.dev ?? null; },
    get ui() { return isl.ui; },
    get active() { return isl.ui.active || !!isl.cutscene || isl.boatLoading || !!isl.boatGame; }, // Pending rounds hold the keys too.
    get managing() { return isl.village.active; },
    get selection() { return selectedAnchor(); },
    get selectionElement() { return isl.ui.selectionElement; },
    toggleVillage,
    startMove,
    get moving() { return isl.moving.state; },
    get moveMode() { return isl.moving; },
    handleEscape() {
      if (isl.boatLoading) { interruptBoat(); return true; }
      if (isl.boatGame) { isl.boatGame.close(); return true; }
      if (isl.cutscene) { isl.cutscene.skip(); return true; }
      if (isl.moving.active && !isl.ui.active) { isl.moving.cancel(); return true; }
      return isl.ui.cancel() || isl.village.leave();
    },
    dispose() {
      stopEconomyIdentity?.();
      if (isl.disposed) return; isl.disposed = true;
      isl.session.dispose();
      isl.village.dispose(); isl.villageBar.dispose();
      stopRecoveryPoll(); isl.recoveryReadId++;
      stopFinished(); stopStarted(); stopArrived(); stopPoint(); stopInteract(); stopTravel(); stopMenu?.(); stopSettings?.(); stopStartedGame(); isl.stopGame(); clearTimeout(isl.syncSoon);
      isl.boatLaunch++;isl.boatGame?.dispose(); isl.boatGame = null;
      isl.flow.dispose(); isl.ui.dispose(); isl.moveBar.dispose(); globalThis.removeEventListener?.('keydown', villageKeys, true); isl.cutscene?.dispose?.(); isl.world?.dispose(); isl.world = null; isl.coreWorld?.dispose(); isl.coreWorld = null; isl.pointWorld?.dispose(); isl.pointWorld = null;
    },
    spots: SPOTS,
  };
}
