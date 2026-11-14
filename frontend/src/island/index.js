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
//   openCrew() / openCaptain() / openInvite()  the Menu's Crew, Captain and skills (the musket, the skill
//                                             tree §14 and the weapon shop §15), and the invite card
//   setPresence(presence)                     the captains in the room, for the arrival toasts (§11)
//   enterGame({code, role}) / openLobby()       the games of GAME-V3.md §2: which game Play opens, its lobby
//   attachGame(room)                           the game's room state (game-room.js, from the wave wiring)
//   openHarbor(id) / openTechHub() / openWreck()  the campaign's buildings (GAME-V3.md §4, §5)
// Events it emits on the game's bus: island_built {kind, spot}, island_upgraded {kind, spot, level},
// campaign_unlocked {wave, ids, code} (a won wave opened something on the island on screen, once per
// island and wave on this page; the narrator plays its lines), tower_specialised {spot, spec},
// island_spots_changed {place, spot} (any build or upgrade, also a friend's island and Pirate Point), island_visit_named {place, name}
// (the friend's game on screen learned its host's name, so the arrival banner can follow), crew_hired {crew}, island_invite_opened, wave_started_server {...} and wave_finished {...} (wave-hooks.js).
import {createIslandApi} from './api.js';
import {createWaveFlow} from './wave-flow.js';
import {createIslandUi} from './ui.js';
import {decorateIsland} from './world.js';
import {SPOTS, KINDS, BELL, CABIN, ISLAND_PLACE, POINT_PLACE, PP_SPOTS, isIslandZone, isPointSpot, spotById, ppSpotById, pointZones, defenses, slotName,
  campaignBuilding} from './spots.js';
import {buildCardModel, bellModel, inviteModel, crewModel, captainModel, captainsModel, skillsModel, weaponsModel, coinText,
  harborModel, techModel, wreckModel, demolishModel, refundToast} from './card-model.js';
import {campaignOf, openedBetween, opensText, waveOf} from '../campaign/index.js';
import {BRANCH_BY_ID, SPECS, optionName, optionsOf} from '../campaign/tech.js';
import {ROLES, activeRole, roleRadius} from '../campaign/houses.js';
import {ROLE_BY_ID, SKILL_BY_ID, WEAPON_BY_ID, WEAPONS, isRole, readSkills, readWeapon} from '../pirates/captain-ids.js';
import {displayIslandCode, islandCode, islandRoom, storeVisit, readVisit, forgetVisit} from './codes.js';
import {ISLAND_BUILT, ISLAND_INVITE_OPENED, ISLAND_UPGRADED, CREW_HIRED, WAVE_FINISHED} from '../ui/quest-events.js';
import {readUnlocks, CREW, BUILDINGS, maxLevel} from './td-rules.js';
import {WAVE_STARTED} from './wave-hooks.js';
import {addMenuExtras} from '../shell/menu-extras.js';
import {GAME_STARTED, captainColours, lobbyModel} from './lobby.js';
import {resolvePeer} from '../net/live-extras.js';
import {travelAllowed, visitChip, visitName} from './one-island.js';
import {withWallRecovery} from './wall-recovery.js';

export const ARRIVAL_KEY = 'plot_twist_island_arrival_v1';
// A build or upgrade went through: {place: 'own' | 'visit' | 'point', spot}. The wave wiring tells the
// room (island_changed), so every other defender reads the island again (co-op, TOWER-DEFENSE.md §6).
export const SPOTS_CHANGED = 'island_spots_changed';
// What this device has been told once: the unlock lines (§9) and the musket hint (§10).
export const NEWS_KEY = 'plot_twist_td_news_v1';
// GAME-V3.md §4: a won wave opened something on the island on screen.
export const CAMPAIGN_UNLOCKED = 'campaign_unlocked';
export const TOWER_SPECIALISED = 'tower_specialised';
// A house picked a role (GAME-V3.md "Houses"): {spot, role, first} (first: the first role on this island seen by this page).
export const HOUSE_ROLE_PICKED = 'house_role_picked';
export const VISIT_NAMED = 'island_visit_named';
export const CHART_NAMES = Object.freeze({home_islet: 'Your island', saltreach_harbor: 'The Harbor', lighthouse_isle: 'Pirate Point'});
const notReady = () => Promise.resolve({ok: false, status: 503, code: 'not_ready',
  message: 'Sign in to build on your island. You can keep exploring.'});
const safeLocal = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createIsland({container, emit, on, mode = 'live', getTransport = () => null, transport = null,
  search = globalThis.location?.search ?? '', focus = () => {}, resetInput = () => {}, reducedMotion = () => false,
  preferences = () => ({}), storage = safeLocal(), visitStorage = undefined, loadCutscenes = () => import('../cutscenes/player.js'),
  onCoins = () => {}, onCaptain = () => {}, menu = addMenuExtras, now, setTimer, clearTimer, openHarborStall = () => {},
  travel = () => travelAllowed({islandsMode: mode}),
  // D039 (proposed): whether /api/config says the flag wall_recovery is on (lasting wall damage, Repair/Rebuild).
  wallRecovery = () => false} = {}) {
  let disposed = false, own = null, ownMessage = '', visiting = null, visitCode = readVisit(visitStorage), busySpot = null, cardMessage = '';
  let world = null, cutscene = null, openSpot = null, loadTicket = 0, battle = false;
  let pointBattle = false;
  // GAME-V3.md §4.2, tearing a building down: the wave on screen is over (its break), the spot whose
  // confirmation is open, the server's quote for it, and the tear-down on its way.
  let waveOver = false, demolishSpot = null, demolishQuote = null, busyDemolish = false;
  let busyKind = null, point = null, pointWorld = null, pointMessage = '', busyCrew = null, busyCaptain = false, here = new Map(), presenceReady = false;
  // The Captain and skills card: the open tab, the skill shown below the tree, a learn, buy or equip under way.
  let captainTab = 'captain', pickedSkill = null, busySkill = null, busyWeapon = null;
  // D039: the walls of the island on screen (spot -> {health, recoversAt, repairCost}), read when a wall card opens.
  let walls = new Map(), wallsFor = null; // wallsFor: the island code they belong to
  let pickedRole = null, busyRole = false, respecAsk = false, busyRespec = false;
  // The games (GAME-V3.md §2): the room state from the wave wiring, the codes joined this page, the lobby.
  let game = null, gameCode = null, lobbyAnswer = null, lobbyProblem = '', lobbyBusy = false, lobbyRead = 0, stopGame = () => {};
  const joined = new Set();
  const tellCaptain = island => { const level = island?.captain?.level; if (!disposed && Number.isSafeInteger(level)) { try { onCaptain(level); } catch { /* The HUD cannot stop the island. */ } } };
  // Once-per-device lines (the first unlock explanation, the musket hint).
  const news = (() => { try { return new Set(JSON.parse(storage?.getItem(NEWS_KEY) ?? '[]')); } catch { return new Set(); } })();
  function firstTime(id) {
    if (news.has(id)) return false;
    news.add(id); try { storage?.setItem(NEWS_KEY, JSON.stringify([...news])); } catch { /* Told again next time. */ }
    return true;
  }
  // The player's balance is the island's `coins` (GET /api/island and every answer after it); the HUD shows it.
  const tellCoins = (coins, options) => { if (!disposed && Number.isSafeInteger(coins)) { try { onCoins(coins, options); } catch { /* The HUD cannot stop the island. */ } } };
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
      ui.toast(step.title, 'success', firstTime(`campaign_${step.wave}`) ? step.line : '');
      emit({type: CAMPAIGN_UNLOCKED, wave: step.wave, ids: step.ids, code: displayIslandCode(code)});
    }
  }
  // A fresh island answer: coins and captain to the HUD, and the campaign of your own island (§4).
  const setOwn = next => {
    const before = own; own = next; tellCoins(next?.coins); tellCaptain(next);
    if (!visiting) noteCampaign(next);
    if (!before || !next) return;
    // A won wave may bring a skill point (§14) or a weapon in the shop (§15).
    const from = readUnlocks(before).wonWave, to = readUnlocks(next).wonWave;
    for (const weapon of WEAPONS) if (weapon.unlockWave > from && weapon.unlockWave <= to) ui.toast(`New in the weapon shop: ${weapon.name}!`, 'success');
    const gained = (next.skills?.points ?? 0) - (before.skills?.points ?? 0);
    if (gained > 0 && (next.skills?.spent ?? 0) === (before.skills?.spent ?? 0)) {
      ui.toast(gained === 1 ? 'New skill point!' : `${gained} new skill points!`, 'success', firstTime('skill_point') ? 'Spend it in Menu › Captain and skills.' : '');
    }
  };
  const unlocks = () => (own ? readUnlocks(own) : null);
  // What may be built on the island on screen (GAME-V3.md §4): its own campaign decides the kinds and levels;
  // crew and captain levels stay the player's own.
  const islandUnlocks = () => {
    const mine = unlocks();
    if (!visiting) return mine;
    const there = readUnlocks({waveBest: campaignOf(visiting).wave});
    return mine ? {...there, crew: mine.crew, captain: mine.captain} : there;
  };
  const campaign = () => (target() ? campaignOf(target()) : null);
  // Reads and writes of one island can cross: a read asked before our own build or upgrade may answer after
  // it, with the island as it was. reading(kind) gives a check for the answer: false when a newer read was
  // already used or a write answered meanwhile (that answer is newer than the read), so the island on screen
  // never steps back a level.
  const turns = {own: {asked: 0, used: 0, wrote: 0}, visit: {asked: 0, used: 0, wrote: 0}, point: {asked: 0, used: 0, wrote: 0}};
  const reading = kind => {
    const turn = turns[kind], mine = ++turn.asked, wrote = turn.wrote;
    return () => { if (mine < turn.used || turn.wrote !== wrote) return false; turn.used = mine; return true; };
  };
  const wrote = kind => { turns[kind].wrote++; };
  // The fake answers at once; the live transport is the signed-in session's, read at every call.
  const live = {get: path => (getTransport()?.get?.(path) ?? notReady()), post: (path, body) => (getTransport()?.post?.(path, body) ?? notReady())};
  const api = createIslandApi({transport: transport ?? live});
  const ui = createIslandUi({container, focus, resetInput});
  const placeholder = mode === 'fake' || new URLSearchParams(search).get('wavedebug') === '1';
  const target = () => visiting ?? own;
  const where = () => (visiting ? displayIslandCode(visiting.code) : 'own');
  // Before a wave we are in starts: the defended island once more, so a friend's co-op build is in it.
  const flow = createWaveFlow({api, emit, placeholder, now, setTimer, clearTimer, prepare: () => refreshDefended(),
    notify: (text, tone) => ui.toast(text, tone), banner: text => ui.banner(text), onChange: () => refreshCard(),
    defensesOf: () => defenses(target()?.spots ?? [], campaign()?.research?.tiers)});
  const stopFinished = on(WAVE_FINISHED, event => {
    if (disposed) return;
    tellCoins(event.coins, {tick: true}); // the loot counts up in the HUD
    waveOver = true; // its break: buildings may come down again
    if (!own) return;
    if (!visiting && Number.isSafeInteger(event.coins)) own = {...own, coins: event.coins, flags: event.flags ?? own.flags};
    refreshCard();
    // A won wave may open something (GAME-V3.md §4): read the island again; setOwn (or the visit) tells what is new.
    if (event.survived === true) {
      const current = reading('own'); void api.getIsland().then(fresh => { if (!disposed && fresh.ok && current()) { setOwn(fresh.data); refreshCard(); } });
      if (visiting) void reloadVisit().then(() => { if (!disposed) refreshCard(); });
    }
  });
  // The musket hint (§10), once per device, when the first wave starts.
  const stopStarted = on(WAVE_STARTED, () => {
    if (!disposed && firstTime('musket')) ui.toast('Tap a ship to fire your musket (F).', 'info');
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
    ui.close(); flow.reset(); openSpot = null;
    if (visiting && event.to !== ISLAND_PLACE) endVisit();
  });

  function applyWorld() {
    world?.apply({spots: target()?.spots ?? [], visitor: !!visiting, battle, unlocks: islandUnlocks(), crew: target()?.crew ?? null, campaign: campaign()});
    pointWorld?.apply({spots: point?.spots ?? [], visitor: false, battle: pointBattle, unlocks: unlocks()});
  }
  function endVisit() { visiting = null; visitCode = null; forgetVisit(visitStorage); ui.visit(null); }
  // The chip of a friend's game: the old "Visiting … · Sail home" only where travel still applies (one
  // island off); with one island the game itself and a way to its lobby (GAME-V3.md §2).
  const canTravel = () => { try { return travel() === true; } catch { return false; } };
  function showVisit() {
    if (!visiting) { ui.visit(null); return; }
    const chip = visitChip({ownerName: visiting.ownerName, code: displayIslandCode(visiting.code), travel: canTravel()});
    ui.visit(chip, () => (chip.action === 'home' ? void sailHome() : openLobby()));
    emit({type: VISIT_NAMED, place: ISLAND_PLACE, name: placeName(ISLAND_PLACE)});
  }
  // The island on screen is a friend's game: the banner names it like the chip does; null for your own.
  function placeName(id) {
    if (id !== ISLAND_PLACE || (!visiting && !visitCode)) return null;
    return visitName({ownerName: visiting?.ownerName, travel: canTravel()});
  }

  // A friend's game: join it first (once per page), so building and the bell are allowed (GAME-V3.md §2).
  // A full game or an unknown code ends the visit: the player lands on their own island instead.
  // One join per code at a time: the landing (load) and a wave already running there (joinRunningWave)
  // share it, so the wave is joined only once the game is (the server wants a member: 403 not_member).
  const joining = new Map();
  function joinFirst(code) {
    if (joined.has(code)) return Promise.resolve(true);
    if (!joining.has(code)) joining.set(code, joinGameOnce(code).finally(() => joining.delete(code)));
    return joining.get(code);
  }
  async function joinGameOnce(code) {
    const answer = await api.joinGame(code);
    if (answer.ok) { joined.add(code); return true; }
    if (['game_full', 'no_such_game', 'no_such_island'].includes(answer.code)) {
      ui.toast(answer.message, 'error');
      return false;
    }
    return true; // signed out or offline: the visit still shows; building answers on its own
  }
  async function load() {
    const ticket = ++loadTicket;
    if (visitCode && !(await joinFirst(visitCode))) {
      if (disposed || ticket !== loadTicket) return {ok: false};
      endVisit();
    }
    if (disposed || ticket !== loadTicket) return {ok: false};
    if (visitCode) {
      const current = reading('visit');
      const answer = await api.visit(visitCode);
      if (disposed || ticket !== loadTicket) return answer;
      if (answer.ok) {
        if (current() || !visiting) { visiting = {...answer.data, code: islandCode(answer.data.code)}; noteCampaign(visiting); }
        showVisit();
      } else {
        endVisit(); ui.toast(answer.message, 'error');
      }
    }
    {
      // Your own island also while visiting: its coins pay for what you build on the friend's island.
      const current = reading('own');
      const answer = await api.getIsland();
      if (disposed || ticket !== loadTicket) return answer;
      if (answer.ok) { if (current()) setOwn(answer.data); ownMessage = ''; } else ownMessage = answer.message;
    }
    applyWorld(); refreshCard();
    void syncGame();
    if (target()) await flow.look(where());
    return {ok: true};
  }
  // --- the game: its lobby and room state ----------------------------------------------------------
  const currentCode = () => islandCode(visiting?.code ?? visitCode ?? own?.code ?? '');
  // The lobby answer once per game and landing (and when somebody new turns up in the room).
  async function syncGame(force = false) {
    const code = currentCode();
    if (!code || disposed) return null;
    if (!force && code === gameCode && Date.now() - lobbyRead < 10000) return null;
    gameCode = code; lobbyRead = Date.now();
    const answer = await api.lobby(code);
    if (disposed || currentCode() !== code) return answer;
    if (answer.ok) { lobbyProblem = ''; lobbyAnswer = answer.data; game?.setGame(answer.data); }
    else lobbyProblem = answer.status === 401 || answer.code === 'not_ready' ? 'Sign in to see who is in this game.' : answer.message;
    if (ui.open === 'lobby') refreshCard();
    return answer;
  }
  let syncSoon = null;
  function wantSync() {
    if (syncSoon || disposed) return;
    const wait = Math.max(1500, lobbyRead + 10000 - Date.now()); // the lobby is read at most every 10 s
    syncSoon = setTimeout(() => { syncSoon = null; if (!disposed) void syncGame(true); }, wait);
  }
  function lobby() {
    const state = game?.state ?? null, code = currentCode();
    // Without the room state (no wave wiring yet) the lobby answer alone: the list, nobody known online.
    const answered = islandCode(lobbyAnswer?.game?.code ?? '') === code ? lobbyAnswer : null;
    const members = state?.code === code ? state.members : answered?.members ?? [];
    const me = state?.me ?? answered?.members.find(member => member.you)?.id ?? null;
    const hostId = state?.hostId ?? answered?.members.find(member => member.role === 'host')?.id ?? null;
    return lobbyModel({code, members, online: state?.online ?? new Set(), me, hostId,
      hostAwayMs: state?.hostAwayMs ?? 0, started: state?.code === code && state.started === true, problem: lobbyProblem});
  }
  // The captain colours of the game on screen (by join order, 0-9) and your own (0 outside a game).
  function colours() {
    const state = game?.state ?? null, code = currentCode();
    const answered = islandCode(lobbyAnswer?.game?.code ?? '') === code ? lobbyAnswer : null;
    const members = state?.code === code ? state.members : answered?.members ?? [];
    const me = state?.me ?? answered?.members?.find(member => member.you)?.id ?? null;
    return {map: captainColours(members), me};
  }
  // id: a member's id, or the presence's opaque id of a captain on screen (live-captain-N), turned back
  // into the member's id first, so the figures of the others wear their lobby colours too.
  const colourOf = id => {
    if (typeof id !== 'string') return null;
    const map = colours().map;
    if (map.has(id)) return map.get(id);
    let member = null;
    try { member = resolvePeer(id); } catch { member = null; }
    return (member && map.get(member)) ?? null;
  };
  const captainColour = () => { const {map, me} = colours(); return (me && map.get(me)) ?? 0; };
  function startGame() {
    if (!game?.start()) { refreshCard(); return; }
    if (ui.open === 'lobby') { ui.close(); openSpot = null; }
  }
  function openLobby() {
    openSpot = null; cardMessage = '';
    ui.lobbyCard(lobby(), {start: startGame});
    emit({type: ISLAND_INVITE_OPENED, code: currentCode() ? displayIslandCode(currentCode()) : null});
    lobbyBusy = true;
    void syncGame(true).finally(() => { lobbyBusy = false; if (ui.open === 'lobby') refreshCard(); });
  }
  // Start pressed anywhere in the room: every lobby closes (the narrator listens to the same event).
  const stopStartedGame = on(GAME_STARTED, () => {
    if (disposed) return;
    if (ui.open === 'lobby') { ui.close(); openSpot = null; }
    ui.toast('The game is on! Ring the bell when you are ready.', 'success');
  });

  // Pirate Point's shared spots: anyone builds and upgrades them with their own coins (§5).
  async function loadPoint() {
    const current = reading('point');
    const answer = await api.piratePoint();
    if (disposed) return answer;
    if (answer.ok) { if (current()) { point = answer.data; tookCoins(answer.data.coins); } pointMessage = ''; } else pointMessage = answer.message;
    if (!own) { const check = reading('own'), mine = await api.getIsland(); if (!disposed && mine.ok && check()) setOwn(mine.data); }
    applyWorld(); refreshCard();
    return answer;
  }

  // --- cards ---------------------------------------------------------------------------------
  function buildModel(spotId) {
    if (isPointSpot(spotId)) {
      const spot = point?.spots.find(item => item.id === spotId) ?? null;
      return buildCardModel({spotId, slot: ppSpotById(spotId).slot, spot, coins: own?.coins ?? null, busy: busySpot === spotId ? busyKind : false,
        message: cardMessage || (!point ? pointMessage : ''), point: true, prices: own?.prices ?? null,
        // The server holds you to your own unlocks at Pirate Point too (a level you have not won is refused).
        unlocks: own ? unlocks() : null});
    }
    // On a friend's island you build with your own coins (and your own unlocks); it stays theirs.
    const island = target(), spot = island?.spots.find(item => item.id === spotId) ?? null;
    const model = buildCardModel({spotId, slot: spotById(spotId)?.slot, spot, coins: own?.coins ?? null,
      visitor: !!visiting, ownerName: visiting?.ownerName, busy: busySpot === spotId ? busyKind : false, message: cardMessage || (!island ? ownMessage : ''),
      unlocks: own ? islandUnlocks() : null, prices: own?.prices ?? null, campaign: campaign(), battle: battle && !waveOver});
    // D039: a damaged or destroyed wall shows Repair or Rebuild instead of Upgrade (flag wall_recovery).
    const shown = wallsFor !== null && wallsFor === island?.code ? walls.get(spotId) ?? null : null;
    return withWallRecovery(model, {wall: shown, coins: own?.coins ?? null,
      busy: busySpot === spotId ? busyKind : false, battle: battle && !waveOver});
  }
  const crew = () => crewModel({crew: own?.crew ?? {}, coins: own?.coins ?? null, unlocks: own ? unlocks() : null, busy: busyCrew, message: cardMessage || (!own ? ownMessage : ''), prices: own?.prices});
  const captain = () => {
    const message = cardMessage || (!own ? ownMessage : ''), wonWave = own ? unlocks().wonWave : 0;
    return {tab: captainTab,
      captain: captainModel({captain: own?.captain ?? null, coins: own?.coins ?? null, unlocks: own ? unlocks() : null, busy: busyCaptain, message: captainTab === 'captain' ? message : ''}),
      skills: skillsModel({skills: own?.skills ?? null, wonWave, picked: pickedSkill, busy: busySkill, message: captainTab === 'skills' ? message : '',
        coins: own?.coins ?? null, captainLevel: own?.captain?.level ?? 1, pickedRole, busyRole, respecAsk, busyRespec, battle: battle && !waveOver}),
      weapons: weaponsModel({weapons: own?.weapons ?? null, coins: own?.coins ?? null, wonWave, busy: busyWeapon, message: captainTab === 'weapons' ? message : ''})};
  };
  const captainHandlers = {upgrade: () => void upgradeCaptain(), tab: id => { captainTab = id; },
    pick: id => { pickedSkill = id; cardMessage = ''; refreshCard(); }, learn: id => void learnSkill(id),
    pickRole: id => { pickedRole = id; cardMessage = ''; refreshCard(); }, role: id => void takeRole(id),
    respec: () => void respecCaptain(), respecCancel: () => { respecAsk = false; refreshCard(); },
    buy: id => void buyWeapon(id), equip: id => void equipWeapon(id)};
  const handlers = {build: (spotId, kind) => void build(spotId, kind), upgrade: spotId => void upgrade(spotId), repair: spotId => void repairWall(spotId), hire: () => openCrew(),
    specialise: (spotId, spec) => void specialise(spotId, spec), demolish: spotId => void askDemolish(spotId)};
  const demolishHandlers = {confirm: () => void confirmDemolish(), keep: () => { const spot = demolishSpot; demolishSpot = null; if (spot) openBuild(spot); }};
  const demolishCardModel = () => demolishModel({quote: demolishQuote, busy: busyDemolish, message: cardMessage});
  // The campaign's buildings (GAME-V3.md §4, §5): the Harbor, the Tech hub and the wreck.
  let busyResearch = null, busyGift = null;
  const harbor = () => harborModel({campaign: campaign()});
  const tech = () => techModel({campaign: campaign(), coins: own?.coins ?? null, busy: busyResearch, battle: battle && !waveOver, message: cardMessage || (!target() ? ownMessage : '')});
  const wreck = () => wreckModel({campaign: campaign(), coins: own?.coins ?? null, busy: busyGift, message: cardMessage || (!target() ? ownMessage : '')});
  const harborHandlers = {open: id => { ui.close(); try { openHarborStall(id); } catch { /* The stall answers on its own. */ } }};
  const techHandlers = {research: step => void research(step)};
  const wreckHandlers = {give: amount => void giveWreck(amount)};
  function bell() {
    const wave = flow.current;
    return bellModel({wave: wave?.wave ?? null, joined: wave?.joined === true, countdown: flow.secondsLeft(), busy: flow.busy,
      visitor: !!visiting, ownerName: visiting?.ownerName, waveBest: target()?.waveBest ?? 0, message: cardMessage});
  }
  function refreshCard() {
    if (disposed) return;
    applyWorld();
    if (ui.open === 'build' && openSpot) ui.buildCard(buildModel(openSpot), handlers);
    else if (ui.open === 'bell') ui.bellCard(bell(), bellAction);
    else if (ui.open === 'invite') ui.inviteCard(inviteModel(own?.code));
    else if (ui.open === 'lobby') ui.lobbyCard(lobby(), {start: startGame});
    else if (ui.open === 'crew') ui.crewCard(crew(), hire);
    else if (ui.open === 'captain') ui.captainCard(captain(), captainHandlers);
    else if (ui.open === 'captains') ui.captainsCard(captainsModel([...here.values()]));
    else if (ui.open === 'harbor') ui.harborCard(harbor(), harborHandlers);
    else if (ui.open === 'tech') ui.techCard(tech(), techHandlers);
    else if (ui.open === 'wreck') ui.wreckCard(wreck(), wreckHandlers);
    else if (ui.open === 'demolish') ui.demolishCard(demolishCardModel(), demolishHandlers);
  }
  // The Tear down button follows the wave on screen (off while it runs, on again in its break).
  function refreshCardIfBuild() { if (ui.open === 'build' && openSpot) refreshCard(); }
  function openHarbor() { openSpot = null; cardMessage = ''; ui.harborCard(harbor(), harborHandlers); }
  function openTechHub() { openSpot = null; cardMessage = ''; ui.techCard(tech(), techHandlers); void freshOwn(); }
  function openWreck() { openSpot = null; cardMessage = ''; ui.wreckCard(wreck(), wreckHandlers); void freshOwn(); }
  function openBuild(spotId) { openSpot = spotId; cardMessage = ''; ui.buildCard(buildModel(spotId), handlers); if (spotById(spotId)?.slot === 'wall') void readWalls(); }
  async function freshOwn() {
    if (own) return null;
    const current = reading('own'), answer = await api.getIsland();
    if (!disposed && answer.ok && current()) { setOwn(answer.data); refreshCard(); }
    return answer;
  }
  function openCrew() { openSpot = null; cardMessage = ''; ui.crewCard(crew(), hire); void freshOwn(); }
  function openCaptain(tab = null) {
    openSpot = null; cardMessage = ''; if (['captain', 'skills', 'weapons'].includes(tab)) captainTab = tab;
    ui.captainCard(captain(), captainHandlers); void freshOwn();
  }
  let leaderboardRequest = 0;
  async function openLeaderboard() {
    const request = ++leaderboardRequest;
    openSpot = null;
    ui.leaderboardCard({loading: true}, () => void openLeaderboard());
    const answer = await api.leaderboard();
    if (disposed || request !== leaderboardRequest || ui.open !== 'leaderboard') return;
    ui.leaderboardCard(answer.ok ? {data: answer.data} : {message: answer.message}, () => void openLeaderboard());
  }
  function openCaptains() { openSpot = null; cardMessage = ''; ui.captainsCard(captainsModel([...here.values()])); }
  async function openBell() {
    openSpot = null; cardMessage = ''; ui.bellCard(bell(), bellAction);
    if (target()) await flow.look(where());
  }
  function openInvite() {
    openSpot = null; cardMessage = '';
    ui.inviteCard(inviteModel(own?.code));
    emit({type: ISLAND_INVITE_OPENED, code: own?.code ? displayIslandCode(own.code) : null});
    if (!own) void freshOwn().then(answer => {
      if (disposed || own || !answer || answer.ok || ui.open !== 'invite') return;
      const problem = answer.status === 401 || answer.code === 'not_ready' ? 'signin'
        : (answer.message || 'Your island could not be loaded.');
      ui.inviteCard(inviteModel(null, undefined, problem));
    });
  }
  function pick(id) {
    if (disposed) return;
    if (id === BELL.id) void openBell();
    else if (id === CABIN.id) openLobby();
    else if (id === 'island_harbor') openHarbor();
    else if (id === 'island_techhub') openTechHub();
    else if (id === 'island_wreck') openWreck();
    else if (spotById(id) || isPointSpot(id)) openBuild(id);
  }

  // The answer of a write: the island, or (on Pirate Point) the shared spots plus your fresh coins.
  // Where a build goes: Pirate Point's shared spots, the friend's island you visit, or your own.
  const placeOf = spotId => (isPointSpot(spotId) ? 'point' : visiting ? 'visit' : 'own');
  const tookCoins = coins => { if (own && Number.isSafeInteger(coins)) setOwn({...own, coins}); else tellCoins(coins); };
  async function reloadVisit() {
    if (!visiting) return;
    const current = reading('visit'), fresh = await api.visit(visiting.code);
    if (!disposed && fresh.ok && visiting && current()) { visiting = {...visiting, ...fresh.data, code: islandCode(fresh.data.code)}; noteCampaign(visiting); }
  }
  async function reloadOwn() { const current = reading('own'), mine = await api.getIsland(); if (!disposed && mine.ok && current()) setOwn(mine.data); }
  // The island being defended, read again: after a friend built or upgraded there (island_changed in
  // the island's room, src/pirates/game-wiring.js) and before every wave, so all defenders agree.
  async function refreshDefended() {
    if (disposed) return;
    if (visiting) await reloadVisit(); else if (own) await reloadOwn(); else return;
    refreshCard();
  }
  async function took(answer, place) {
    wrote(place === 'point' ? 'point' : place === 'visit' ? 'visit' : 'own');
    if (place === 'point') { point = answer.data; if (Number.isSafeInteger(answer.data.coins)) tookCoins(answer.data.coins); else await reloadOwn(); }
    else if (place === 'visit') { wrote('own'); await Promise.all([reloadVisit(), reloadOwn()]); }
    else setOwn(answer.data);
  }
  async function refused(answer, place) {
    cardMessage = answer.message;
    if (['spot_taken', 'insufficient_funds', 'max_level', 'not_built', 'locked', 'crew_full'].includes(answer.code)) {
      if (place === 'point') { const current = reading('point'), fresh = await api.piratePoint(); if (!disposed && fresh.ok && current()) { point = fresh.data; tookCoins(fresh.data.coins); } }
      else if (place === 'visit') await Promise.all([reloadVisit(), reloadOwn()]);
      else await reloadOwn();
    }
  }
  const onWhere = place => (place === 'point' ? ' for Pirate Point' : place === 'visit' ? ` on ${visiting?.ownerName ? `${visiting.ownerName}'s` : 'this'} island` : '');
  async function build(spotId, kind) {
    const place = placeOf(spotId), spot = place === 'point' ? ppSpotById(spotId) : spotById(spotId);
    const choice = kind ?? spot?.kind;
    if (!spot || busySpot || !BUILDINGS[choice]) return;
    busySpot = spotId; busyKind = choice; cardMessage = ''; refreshCard();
    const answer = place === 'point' ? await api.pointBuild({spot: spotId, kind: choice})
      : await api.build({spot: spotId, kind: choice, ...(place === 'visit' ? {code: visiting.code} : {})});
    if (disposed) return;
    busySpot = null; busyKind = null;
    if (answer.ok) {
      await took(answer, place);
      if (disposed) return;
      if (place === 'own') emit({type: ISLAND_BUILT, kind: choice, spot: spotId});
      emit({type: SPOTS_CHANGED, place, spot: spotId});
      // Close the card so the new building and the toast can be seen.
      if (ui.open === 'build' && openSpot === spotId) { ui.close(); openSpot = null; }
      ui.toast(`${BUILDINGS[choice].name} built${onWhere(place)}! You have ${coinText(own?.coins)}.`, 'success');
    } else await refused(answer, place);
    refreshCard();
  }
  // D039 (flag wall_recovery): the walls' health of the island on screen; nothing at all while the flag is off.
  async function readWalls() {
    if (!wallRecovery() || isPointSpot(openSpot ?? '')) return;
    const answer = await api.walls({code: visiting ? visiting.code : null});
    if (disposed || !answer.ok) return;
    walls = new Map(answer.data.walls.map(wall => [wall.spot, wall])); wallsFor = target()?.code ?? null;
    refreshCardIfBuild();
  }
  async function repairWall(spotId) {
    const place = placeOf(spotId);
    if (busySpot || place === 'point') return;
    busySpot = spotId; busyKind = 'repair'; cardMessage = ''; refreshCard();
    const answer = await api.repairWall({spot: spotId, ...(place === 'visit' ? {code: visiting.code} : {})});
    if (disposed) return;
    busySpot = null; busyKind = null;
    if (answer.ok) {
      walls = new Map(answer.data.walls.map(wall => [wall.spot, wall])); wallsFor = target()?.code ?? null;
      tookCoins(answer.data.coins);
      emit({type: SPOTS_CHANGED, place, spot: spotId});
      ui.toast(`Wall repaired${onWhere(place)}! You have ${coinText(answer.data.coins)}.`, 'success');
    } else {
      cardMessage = answer.message;
      if (['intact', 'insufficient_funds', 'not_built'].includes(answer.code)) await readWalls();
    }
    refreshCard();
  }
  async function upgrade(spotId) {
    const place = placeOf(spotId);
    if (busySpot) return;
    busySpot = spotId; busyKind = 'upgrade'; cardMessage = ''; refreshCard();
    const answer = place === 'point' ? await api.pointUpgrade({spot: spotId})
      : await api.upgrade({spot: spotId, ...(place === 'visit' ? {code: visiting.code} : {})});
    if (disposed) return;
    busySpot = null; busyKind = null;
    if (answer.ok) {
      await took(answer, place);
      if (disposed) return;
      const now = (place === 'point' ? point : place === 'visit' ? visiting : own)?.spots?.find(item => item.id === spotId);
      const name = BUILDINGS[now?.kind]?.name ?? 'Building';
      if (place === 'own') emit({type: ISLAND_UPGRADED, kind: now?.kind, spot: spotId, level: now?.level});
      emit({type: SPOTS_CHANGED, place, spot: spotId});
      ui.toast(`${name} is now level ${now?.level ?? '?'}${onWhere(place)}! You have ${coinText(own?.coins)}.`, 'success');
    } else await refused(answer, place);
    refreshCard();
  }
  // GAME-V3.md §4.2: Tear down asks the server who gets what back, then the confirmation card; Tear down there
  // takes the building down (between waves), every payer gets half of what they paid, and the room hears it.
  async function askDemolish(spotId) {
    if (busySpot || busyDemolish || isPointSpot(spotId)) return;
    demolishSpot = spotId; demolishQuote = null; cardMessage = '';
    ui.demolishCard(demolishCardModel(), demolishHandlers);
    const answer = await api.demolishQuote({spot: spotId, ...placeCode()});
    if (disposed || demolishSpot !== spotId) return;
    if (answer.ok) demolishQuote = answer.data; else cardMessage = answer.message;
    if (ui.open === 'demolish') ui.demolishCard(demolishCardModel(), demolishHandlers);
  }
  async function confirmDemolish() {
    const spotId = demolishSpot;
    if (!spotId || !demolishQuote || busyDemolish) return;
    busyDemolish = true; cardMessage = ''; refreshCard();
    const answer = await api.demolish({spot: spotId, ...placeCode()});
    if (disposed) return;
    busyDemolish = false;
    if (!answer.ok) {
      cardMessage = answer.message; refreshCard();
      if (['not_built', 'wave_running', 'busy'].includes(answer.code)) await refreshDefended();
      return;
    }
    const {demolished: done, ...island} = answer.data, place = visiting ? 'visit' : 'own';
    await took({...answer, data: island}, place);
    if (disposed) return;
    const who = colours().me;
    emit({type: SPOTS_CHANGED, place, spot: spotId, demolished: {...(who ? {who} : {}), kind: done.kind, level: done.level,
      refunds: done.refunds.slice(0, 6).map(item => ({id: item.id, coins: item.coins}))}});
    emit({type: 'island_demolished', spot: spotId, kind: done.kind, level: done.level, refunds: done.refunds});
    demolishSpot = null; demolishQuote = null;
    if (ui.open === 'demolish') { ui.close(); openSpot = null; }
    const mine = done.refunds.find(item => item.you)?.coins ?? 0;
    ui.toast(`${done.name ?? BUILDINGS[done.kind]?.name ?? 'Building'} torn down.${mine > 0 ? ` You got back ${coinText(mine)}.` : ''} You have ${coinText(own?.coins)}.`, 'success');
    refreshCard();
  }
  // A teammate tore a building down (the room's island_changed): a toast for the payers who got coins back.
  const heardRefunds = new Map();
  function heardDemolish(demolished) {
    const me = colours().me, key = JSON.stringify(demolished), at = Date.now();
    if (disposed || !me) return;
    const text = refundToast({demolished, me, whoName: lobby().rows?.find(row => row.id === demolished?.who)?.name ?? ''});
    if (!text) return;
    // On a teammate's island the HUD shows your own wallet: read it again at every note (the room says it
    // twice; the first may come before the server's answer reached this screen). The toast shows once.
    if (visiting) { wrote('own'); void reloadOwn(); }
    if (at - (heardRefunds.get(key) ?? -Infinity) < 15000) return;
    heardRefunds.set(key, at);
    ui.toast(text, 'success');
  }
  // GAME-V3.md §5: a tower picks a skill (free); research a kind at the Tech hub; §4: coins into the wreck.
  // Each answer is the island; the room hears island_changed, so every screen reads it again.
  const placeCode = () => (visiting ? {code: visiting.code} : {});
  async function landed(answer, spot) {
    if (visiting) { wrote('visit'); wrote('own'); await Promise.all([reloadVisit(), reloadOwn()]); }
    else { wrote('own'); setOwn(answer.data); }
    emit({type: SPOTS_CHANGED, place: visiting ? 'visit' : 'own', spot});
  }
  async function specialise(spotId, spec) {
    if (busySpot || (!SPECS[spec] && !ROLES[spec])) return;
    const role = !!ROLES[spec], first = role && !(target()?.spots ?? []).some(item => activeRole(item));
    busySpot = spotId; busyKind = `spec:${spec}`; cardMessage = ''; refreshCard();
    const answer = await api.specialise({spot: spotId, spec, ...placeCode()});
    if (disposed) return;
    busySpot = null; busyKind = null;
    if (answer.ok) {
      await landed(answer, spotId);
      if (disposed) return;
      if (role) {
        emit({type: HOUSE_ROLE_PICKED, spot: spotId, role: spec, first});
        ui.toast(`${ROLES[spec].name}: this house works as one from the next wave.`, 'success');
      } else {
        emit({type: TOWER_SPECIALISED, spot: spotId, spec});
        ui.toast(`${SPECS[spec].name}: this tower fights with it from the next wave.`, 'success');
      }
    } else { cardMessage = answer.message; if (['not_researched', 'not_built', 'wrong_kind', 'house_level'].includes(answer.code)) await refreshDefended(); }
    refreshCard();
  }
  // The reach of the open house card's role, for the ring on the ground (world.js), or null.
  function houseRange() {
    if (ui.open !== 'build' || !openSpot) return null;
    const where = spotById(openSpot), role = activeRole((target()?.spots ?? []).find(item => item.id === openSpot));
    return where && role ? {x: where.x, z: where.z, radius: roleRadius(role), role} : null;
  }
  // GAME-V3.md §5.1: one research step: tier 1 of a branch, or one of the two options of tier 2 or 3 (change:
  // the crew picked the other one before and pays the tier's price again to switch).
  async function research(step) {
    const {branch, tier = 1, choice = null, change = false} = typeof step === 'string' ? {branch: step} : step ?? {};
    if (busyResearch || !BRANCH_BY_ID[branch]) return;
    busyResearch = `${branch}:${tier}:${choice ?? ''}`; cardMessage = ''; refreshCard();
    const answer = await api.research({branch, tier, choice, change, ...placeCode()});
    if (disposed) return;
    busyResearch = null;
    if (answer.ok) {
      await landed(answer, 'tech_hub');
      if (disposed) return;
      emit({type: 'tech_researched', branch, tier, choice});
      const kind = KINDS[branch].name.toLowerCase();
      ui.toast(tier === 1 ? `${BRANCH_BY_ID[branch].name} researched! Tap a ${kind} to pick its skill.`
        : tier === 2 ? `${optionName(choice)}: every ${kind} fights with it from the next wave.`
          : `${optionName(choice)}! Tap a ${kind} to pick it as its skill.`, 'success');
    } else { cardMessage = answer.message; if (['known', 'locked', 'insufficient_funds', 'closed', 'needs_tier', 'top_tier', 'wave_running'].includes(answer.code)) await refreshDefended(); }
    refreshCard();
  }
  async function giveWreck(amount) {
    if (busyGift) return;
    busyGift = amount; cardMessage = ''; refreshCard();
    const answer = await api.repairWreck({amount, ...placeCode()});
    if (disposed) return;
    busyGift = null;
    if (answer.ok) {
      await landed(answer, 'wreck');
      if (disposed) return;
      const now = campaign()?.wreck;
      ui.toast(now && now.paid >= now.goal ? 'The wreck is repaired! Sailing opens later.' : `Thanks! The wreck has ${coinText(now?.paid ?? 0)} of ${coinText(now?.goal ?? 0)}.`, 'success');
    } else { cardMessage = answer.message; if (['repaired', 'locked', 'insufficient_funds'].includes(answer.code)) await refreshDefended(); }
    refreshCard();
  }
  async function hire(id) {
    if (busyCrew || !CREW[id]) return;
    busyCrew = id; cardMessage = ''; refreshCard();
    const answer = await api.hire({crew: id});
    if (disposed) return;
    busyCrew = null;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: CREW_HIRED, crew: id});
      ui.toast(`${CREW[id].name} hired! You have ${coinText(own.coins)}.`, 'success');
    } else await refused(answer, false);
    refreshCard();
  }
  async function upgradeCaptain() {
    if (busyCaptain) return;
    busyCaptain = true; cardMessage = ''; refreshCard();
    const answer = await api.upgradeCaptain();
    if (disposed) return;
    busyCaptain = false;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: 'captain_upgraded', level: own.captain?.level});
      ui.toast(`Your captain is now level ${own.captain?.level ?? '?'}! You have ${coinText(own.coins)}.`, 'success');
    } else await refused(answer, false);
    refreshCard();
  }
  // §14: learn a skill with skill points. The answer is the island with the new skill.
  async function learnSkill(id) {
    if (busySkill || !SKILL_BY_ID[id]) return;
    busySkill = id; pickedSkill = id; cardMessage = ''; refreshCard();
    const answer = await api.learnSkill({skill: id});
    if (disposed) return;
    busySkill = null;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: 'captain_skill_learned', skill: id});
      ui.toast(`New skill: ${SKILL_BY_ID[id].name}!`, 'success');
    } else { cardMessage = answer.message; if (['locked', 'no_points', 'known', 'closed', 'wrong_role'].includes(answer.code)) await reloadOwn(); }
    refreshCard();
  }
  // The role choice at captain level 3 (once), and the respec that clears skills and role (coins, asked twice).
  async function takeRole(id) {
    if (busyRole || !isRole(id)) return;
    busyRole = true; pickedRole = id; cardMessage = ''; refreshCard();
    const answer = await api.pickRole({role: id});
    if (disposed) return;
    busyRole = false;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: 'captain_role_picked', role: id});
      ui.toast(`You are the ${ROLE_BY_ID[id].name} now!`, 'success');
    } else { cardMessage = answer.message; if (['locked', 'role_known'].includes(answer.code)) await reloadOwn(); }
    refreshCard();
  }
  async function respecCaptain() {
    if (busyRespec) return;
    if (!respecAsk) { respecAsk = true; cardMessage = ''; refreshCard(); return; }
    busyRespec = true; cardMessage = ''; refreshCard();
    const answer = await api.respec();
    if (disposed) return;
    busyRespec = false; respecAsk = false;
    if (answer.ok) {
      setOwn(answer.data); pickedSkill = null; pickedRole = null;
      emit({type: 'captain_respec'});
      ui.toast(`Skills reset. You have ${coinText(own.coins)}.`, 'success');
    } else { cardMessage = answer.message; if (answer.code === 'nothing_to_reset') await reloadOwn(); }
    refreshCard();
  }
  // §15: buy a weapon once with coins (the server equips it at once), or equip one you own.
  async function buyWeapon(id) {
    if (busyWeapon || !WEAPON_BY_ID[id]) return;
    busyWeapon = id; cardMessage = ''; refreshCard();
    const answer = await api.buyWeapon({weapon: id});
    if (disposed) return;
    busyWeapon = null;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: 'captain_weapon_bought', weapon: id});
      ui.toast(`${WEAPON_BY_ID[id].name} bought and equipped! You have ${coinText(own.coins)}.`, 'success');
      if (readWeapon(own.weapons?.equipped) !== id) await equipWeapon(id, true);
    } else await refused(answer, false);
    refreshCard();
  }
  async function equipWeapon(id, quiet = false) {
    if ((busyWeapon && !quiet) || !WEAPON_BY_ID[id]) return;
    busyWeapon = id; cardMessage = ''; refreshCard();
    const answer = await api.equipWeapon({weapon: id});
    if (disposed) return;
    busyWeapon = null;
    if (answer.ok) {
      setOwn(answer.data);
      emit({type: 'captain_weapon_equipped', weapon: id});
      ui.toast(`${WEAPON_BY_ID[id].name} equipped. Your captain shoots with it now.`, 'success');
    } else { cardMessage = answer.message; if (answer.code === 'not_owned') await reloadOwn(); }
    refreshCard();
  }
  // The captains in your island's room (§11): a toast for each one who arrives, a list for the Menu.
  function setPresence(presence) {
    if (disposed) return;
    const onIsland = presence?.status === 'live' && typeof presence.place === 'string' && presence.place.startsWith('isle_');
    const next = new Map(onIsland ? (presence.others ?? []).filter(other => other && typeof other.id === 'string')
      .map(other => [other.id, typeof other.name === 'string' && other.name ? other.name : 'A captain']) : []);
    if (presenceReady && onIsland) {
      for (const [id, name] of next) if (!here.has(id)) ui.toast(`${name} joined ${visiting?.ownerName ? `${visiting.ownerName}'s island` : visiting ? 'this island' : 'your island'}`, 'success');
    }
    presenceReady = onIsland; here = next;
    // The presence shows opaque ids; the live connection turns them back into player ids (the lobby's ids).
    const ids = [...next.keys()].map(id => { try { return resolvePeer(id) ?? id; } catch { return id; } });
    game?.setPresence({live: onIsland, ids});
    // Somebody we do not know yet is in the room: read the lobby again (at most every 10 s).
    if (onIsland && game && ids.some(id => !game.knows(id))) wantSync();
    if (ui.open === 'captains') refreshCard();
  }
  // The Menu's island entries (shell/menu-extras.js).
  const stopMenu = menu(() => [
    {label: 'Players and invite', onSelect: () => openLobby()},
    ...(visiting || visitCode ? [{label: 'Leave this game', onSelect: () => void leaveGame()}] : []),
    {label: 'Weekly leaderboard', onSelect: () => void openLeaderboard()},
    {label: 'Crew', onSelect: () => openCrew()},
    {label: 'Captain and skills', onSelect: () => openCaptain()},
    ...(here.size ? [{label: `Captains here (${here.size})`, onSelect: () => openCaptains()}] : []),
  ]);
  async function bellAction(action) {
    cardMessage = '';
    const answer = action === 'join' ? await flow.join(where()) : action === 'ring' ? await flow.ring(where()) : null;
    if (disposed || !answer) return;
    if (answer.ok) { world?.ring(); ui.close(); return; }
    cardMessage = answer.message; refreshCard();
  }

  // --- where the player is -------------------------------------------------------------------
  // The arrival cutscene, once per device, on the first landing on your own island (game.js awaits it).
  async function playArrival() {
    if (visitCode || visiting) return;
    let seen = false;
    try { seen = storage?.getItem(ARRIVAL_KEY) === '1'; } catch { /* Play it. */ }
    if (seen || disposed) return;
    try { storage?.setItem(ARRIVAL_KEY, '1'); } catch { /* Played once per page instead. */ }
    try {
      const {playCutscene} = await loadCutscenes();
      if (disposed) return;
      cutscene = playCutscene({container, id: 'island_arrival', preferences, reducedMotion});
      await cutscene.done;
    } catch { /* No cutscene: the island is still there. */ } finally { cutscene = null; }
  }
  // Remember a code to visit; the next landing on home_islet shows that island.
  function visit(code) {
    const symbols = storeVisit(code, visitStorage);
    if (!symbols) return false;
    visitCode = symbols; visiting = null; flow.reset(); ui.close();
    return true;
  }
  // Leave the friend's game for good (until you join again) and sail home (GAME-V3.md §2).
  async function leaveGame() {
    const code = islandCode(visiting?.code ?? visitCode ?? '');
    if (!code) return false;
    const answer = await api.leaveGame(code);
    if (disposed) return false;
    if (!answer.ok) { ui.toast(answer.message, 'error'); return false; }
    joined.delete(code);
    ui.toast('You left the game. It stays under Continue until you join again.', 'info');
    await sailHome();
    return true;
  }
  // Which game Play opens (the front door's games card): your own (role host) or a friend's (member).
  function enterGame({code, role = 'member', joined: already = true} = {}) {
    const symbols = islandCode(code ?? '');
    if (!symbols) return false;
    if (already) joined.add(symbols);
    if (role === 'host') { if (visiting || visitCode) endVisit(); flow.reset(); ui.close(); return true; }
    return visit(symbols);
  }
  async function sailHome() {
    endVisit(); flow.reset(); ui.close(); applyWorld();
    await load();
  }

  return {
    decorate(place, art, cleanups, adapters = {}) {
      world?.dispose();
      const deco = decorateIsland(place, {art, reducedMotion, canvas: adapters.canvas, camera: adapters.camera,
        isActive: adapters.isActive, onPick: pick, range: houseRange, player: adapters.player, onFar: adapters.onFar});
      world = deco; applyWorld();
      const original = place.update;
      place.update = (dt, frame) => { original(dt, frame); deco.update(dt, frame?.time ?? 0); };
      cleanups.push(() => { deco.dispose(); if (world === deco) world = null; place.update = original; });
    },
    // Pirate Point's shared build spots on lighthouse_isle (factory.js); its bell and lamps stay lane P's.
    decoratePoint(place, adapters = {}) {
      pointWorld?.dispose();
      const deco = decorateIsland(place, {reducedMotion, canvas: adapters.canvas, camera: adapters.camera, isActive: adapters.isActive, onPick: pick, player: adapters.player, onFar: adapters.onFar,
        layout: {spots: PP_SPOTS, zones: pointZones, bell: false, cabin: false, name: 'pirate-point-spots'}});
      pointWorld = deco; applyWorld();
      const original = place.update, dispose = place.dispose;
      place.update = (dt, frame) => { original(dt, frame); deco.update(dt, frame?.time ?? 0); };
      place.dispose = () => { deco.dispose(); if (pointWorld === deco) pointWorld = null; place.update = original; dispose?.(); };
      return place;
    },
    owns: isIslandZone,
    label(zone) {
      if (zone === BELL.id) return flow.current && !flow.current.joined ? 'Join the defense' : 'Ring the harbor bell';
      if (zone === CABIN.id) return 'Players and invite';
      const building = campaignBuilding(zone);
      if (building) {
        const shown = campaign();
        return shown?.open.has(building.item) ? building.name : `${building.name} · ${opensText(waveOf(building.item))}`;
      }
      const pointSpot = isPointSpot(zone), spot = pointSpot ? ppSpotById(zone) : spotById(zone);
      if (!spot) return undefined;
      const answer = (pointSpot ? point : target())?.spots.find(item => item.id === zone);
      if (answer?.built) {
        const name = KINDS[answer.kind]?.name ?? slotName(spot.slot);
        return (answer.level ?? 1) >= maxLevel(answer.kind) ? `${name} · top level` : `Upgrade ${name}`;
      }
      return 'Build here';
    },
    // Where the floating prompt hangs: the spot's world point and how far above it the building is drawn.
    anchor(zone) {
      const thing = spotById(zone) ?? ppSpotById(zone) ?? (zone === BELL.id ? BELL : zone === CABIN.id ? CABIN : campaignBuilding(zone));
      if (!thing) return null;
      return {x: thing.x, z: thing.z, lift: thing.kind === 'watchtower' ? 4.6 : thing.h ? Math.min(4.6, thing.h * .7) : 2.6};
    },
    presencePlace(place) {
      if (place !== ISLAND_PLACE) return null;
      return islandRoom(visiting?.code ?? visitCode ?? own?.code ?? '');
    },
    load, loadPoint, playArrival, visit, sailHome, pick, build, upgrade, hire, upgradeCaptain, learnSkill, takeRole, respecCaptain, buyWeapon, equipWeapon, setPresence,
    // Your captain for the wave (src/pirates/game-wiring.js): level, learnt skills (§14), equipped weapon (§15).
    captainLoadout: () => ({level: own?.captain?.level ?? 1, skills: readSkills([...(own?.skills?.known ?? []), ...(isRole(own?.skills?.role) ? [own.skills.role] : [])]), weapon: readWeapon(own?.weapons?.equipped),
      colour: captainColour()}),
    // Captain colours (GAME-V3.md §7): each member's 0-9 by join order, and your own (src/island/lobby.js).
    colourOf, captainColour,
    openLeaderboard, openInvite, openCrew, openCaptain, openCaptains, openLobby, enterGame, leaveGame, openHarbor, openTechHub, openWreck,
    specialise, research, giveWreck, askDemolish, confirmDemolish, heardDemolish,
    // The campaign of the island on screen (GAME-V3.md §4): {wave, open, locked, later, research, wreck}.
    get campaign() { return campaign(); },
    // The game's room state (src/island/game-room.js), handed in by the wave wiring.
    attachGame(room) {
      stopGame(); game = room ?? null; gameCode = null;
      if (game) { void syncGame(); stopGame = () => {}; }
      if (ui.open === 'lobby') refreshCard();
    },
    get game() { return game?.state ?? null; },
    get mode() { return mode; },
    // The room state changed: draw the lobby again, and read it again when somebody new is in the room.
    refreshLobby() {
      if (game && [...(game.state.online ?? [])].some(id => !game.knows(id))) wantSync();
      if (ui.open === 'lobby') refreshCard();
    },
    get gameCode() { return currentCode(); },
    get point() { return point ? structuredClone(point) : null; },
    // The wave on screen (src/pirates/, wired in game.js): the built defenses it fights with, the client
    // for Pirate Point, the island's room place (isle_<code>), joining a running wave, and the battle look.
    defenses: () => defenses(target()?.spots ?? [], campaign()?.research?.tiers),
    get api() { return api; },
    roomPlace: () => islandRoom(visiting?.code ?? visitCode ?? own?.code ?? '') || null,
    async joinRunningWave() {
      if (disposed || !target()) return null;
      if (visitCode && !(await joinFirst(visitCode))) return null; // a friend's wave: join the game first
      if (disposed || !target()) return null;
      await flow.look(where());
      return flow.current && !flow.current.joined ? flow.join(where()) : null;
    },
    refreshDefended,
    // Captain health (GAME-V3.md §3): you stand a fallen teammate up and pay for it (your coins follow).
    async reviveCaptain({waveId, fallen, downAt} = {}) {
      const answer = await api.reviveCaptain({waveId, fallen, downAt});
      if (!disposed && answer.ok) tookCoins(answer.data.coins);
      return answer;
    },
    setBattle(value) { battle = value === true; if (battle) waveOver = false; applyWorld(); refreshCardIfBuild(); if (['captain', 'tech'].includes(ui.open)) refreshCard(); },
    // A Pirate Point battle: its built walls, cannons and mortars are drawn by the wave renderer meanwhile.
    setPointBattle(value) { pointBattle = value === true; applyWorld(); },
    // The bell again, for the wave's break ("Next wave", TOWER-DEFENSE.md §1): the start route where the
    // player stands (own island or the friend's), the bell swings; answers like flow.ring ({ok, ...}).
    async ringBell() {
      if (disposed || !target()) return {ok: false, status: 0, code: 'not_ready', message: 'Your island is still loading.'};
      const answer = await flow.ring(where(), {joinRunning: true});
      if (!disposed && answer.ok) world?.ring();
      return answer;
    },
    chartVisible: id => Object.hasOwn(CHART_NAMES, id),
    chartLabel: id => CHART_NAMES[id],
    placeName,
    get visiting() { return visiting ? {...visiting} : visitCode ? {code: visitCode} : null; },
    get island() { return own ? structuredClone(own) : null; },
    get flow() { return flow; },
    // The fake server's helpers (setCoins, failNext, startWaveAt...) in fake mode, for the console and checks.
    get dev() { return transport?.dev ?? null; },
    get ui() { return ui; },
    get active() { return ui.active || !!cutscene; },
    handleEscape() {
      if (cutscene) { cutscene.skip(); return true; }
      return ui.close();
    },
    dispose() {
      if (disposed) return; disposed = true;
      stopFinished(); stopStarted(); stopArrived(); stopPoint(); stopInteract(); stopTravel(); stopMenu?.(); stopStartedGame(); stopGame(); clearTimeout(syncSoon);
      flow.dispose(); ui.dispose(); cutscene?.dispose?.(); world?.dispose(); world = null; pointWorld?.dispose(); pointWorld = null;
    },
    spots: SPOTS,
  };
}
