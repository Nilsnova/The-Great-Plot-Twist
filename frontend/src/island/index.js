// Your island, put together: the server's island (api.js), its drawing on home_islet (world.js), the
// build, bell and invite cards (ui.js), the wave around the bell (wave-flow.js) and visits by code.
// game.js loads this file only when the islands are on (mode.js) and asks it a few small things:
//   decorate(place, art, cleanups, adapters)  draws the island on the home_islet place
//   owns(zoneId) / label(zoneId)              its interaction zones and their prompt
//   presencePlace(place)                      isle_<code> on an island (live:place:isle_k7q2m:1)
//   playArrival() / visit(code) / sailHome()  the first landing, and visits by code
//   chartVisible(id) / chartLabel(id)         the three sea chart destinations
//   active / handleEscape() / dispose()
//   decoratePoint(place, cleanups, adapters)  Pirate Point's shared build spots (TOWER-DEFENSE.md §5)
//   openCrew() / openCaptain() / openInvite()  the Menu's Crew and Captain, and the invite card
//   setPresence(presence)                     the captains in the room, for the arrival toasts (§11)
//   enterGame({code, role}) / openLobby()       the games of GAME-V3.md §2: which game Play opens, its lobby
//   attachGame(room)                           the game's room state (game-room.js, from the wave wiring)
// Events it emits on the game's bus: island_built {kind, spot}, island_upgraded {kind, spot, level},
// island_spots_changed {place, spot} (any build or upgrade, also a friend's island and Pirate Point), crew_hired {crew}, island_invite_opened, wave_started_server {...} and wave_finished {...} (wave-hooks.js).
import {createIslandApi} from './api.js';
import {createWaveFlow} from './wave-flow.js';
import {createIslandUi} from './ui.js';
import {decorateIsland} from './world.js';
import {SPOTS, KINDS, BELL, CABIN, ISLAND_PLACE, POINT_PLACE, PP_SPOTS, isIslandZone, isPointSpot, spotById, ppSpotById, pointZones, defenses, slotName} from './spots.js';
import {buildCardModel, bellModel, inviteModel, crewModel, captainModel, captainsModel, coinText} from './card-model.js';
import {displayIslandCode, islandCode, islandRoom, storeVisit, readVisit, forgetVisit} from './codes.js';
import {ISLAND_BUILT, ISLAND_INVITE_OPENED, ISLAND_UPGRADED, CREW_HIRED, WAVE_FINISHED} from '../ui/quest-events.js';
import {readUnlocks, newUnlocks, CREW, BUILDINGS} from './td-rules.js';
import {WAVE_STARTED} from './wave-hooks.js';
import {addMenuExtras} from '../shell/menu-extras.js';
import {GAME_STARTED, lobbyModel} from './lobby.js';

export const ARRIVAL_KEY = 'plot_twist_island_arrival_v1';
// A build or upgrade went through: {place: 'own' | 'visit' | 'point', spot}. The wave wiring tells the
// room (island_changed), so every other defender reads the island again (co-op, TOWER-DEFENSE.md §6).
export const SPOTS_CHANGED = 'island_spots_changed';
// What this device has been told once: the unlock lines (§9) and the musket hint (§10).
export const NEWS_KEY = 'plot_twist_td_news_v1';
export const CHART_NAMES = Object.freeze({home_islet: 'Your island', saltreach_harbor: 'The Harbor', lighthouse_isle: 'Pirate Point'});
const notReady = () => Promise.resolve({ok: false, status: 503, code: 'not_ready',
  message: 'Sign in to build on your island. You can keep exploring.'});
const safeLocal = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createIsland({container, emit, on, mode = 'live', getTransport = () => null, transport = null,
  search = globalThis.location?.search ?? '', focus = () => {}, resetInput = () => {}, reducedMotion = () => false,
  preferences = () => ({}), storage = safeLocal(), visitStorage = undefined, loadCutscenes = () => import('../cutscenes/player.js'),
  onCoins = () => {}, onCaptain = () => {}, menu = addMenuExtras, now, setTimer, clearTimer} = {}) {
  let disposed = false, own = null, ownMessage = '', visiting = null, visitCode = readVisit(visitStorage), busySpot = null, cardMessage = '';
  let world = null, cutscene = null, openSpot = null, loadTicket = 0, battle = false;
  let pointBattle = false;
  let busyKind = null, point = null, pointWorld = null, pointMessage = '', busyCrew = null, busyCaptain = false, here = new Map(), presenceReady = false;
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
  // A fresh island answer: coins and captain to the HUD, and a toast for every unlock it brings (§9).
  const setOwn = next => {
    const before = own; own = next; tellCoins(next?.coins); tellCaptain(next);
    for (const step of newUnlocks(before, next)) ui.toast(step.title, 'success', firstTime(`unlock_${step.wave}`) ? step.line : '');
  };
  const unlocks = () => (own ? readUnlocks(own) : null);
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
    defensesOf: () => defenses(target()?.spots ?? [])});
  const stopFinished = on(WAVE_FINISHED, event => {
    if (disposed) return;
    tellCoins(event.coins, {tick: true}); // the loot counts up in the HUD
    if (!own) return;
    if (!visiting && Number.isSafeInteger(event.coins)) own = {...own, coins: event.coins, flags: event.flags ?? own.flags};
    refreshCard();
    // A won wave may unlock something (§9): read the island again; setOwn toasts what is new.
    if (event.survived === true) void api.getIsland().then(fresh => { if (!disposed && fresh.ok) { setOwn(fresh.data); refreshCard(); } });
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
    world?.apply({spots: target()?.spots ?? [], visitor: !!visiting, battle, unlocks: unlocks(), crew: target()?.crew ?? null});
    pointWorld?.apply({spots: point?.spots ?? [], visitor: false, battle: pointBattle, unlocks: null});
  }
  function endVisit() { visiting = null; visitCode = null; forgetVisit(visitStorage); ui.visit(null); }

  // A friend's game: join it first (once per page), so building and the bell are allowed (GAME-V3.md §2).
  // A full game or an unknown code ends the visit: the player lands on their own island instead.
  async function joinFirst(code) {
    if (joined.has(code)) return true;
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
      const answer = await api.visit(visitCode);
      if (disposed || ticket !== loadTicket) return answer;
      if (answer.ok) {
        visiting = {...answer.data, code: islandCode(answer.data.code)};
        ui.visit({ownerName: visiting.ownerName, code: displayIslandCode(visiting.code)}, () => void sailHome());
      } else {
        endVisit(); ui.toast(answer.message, 'error');
      }
    }
    {
      // Your own island also while visiting: its coins pay for what you build on the friend's island.
      const answer = await api.getIsland();
      if (disposed || ticket !== loadTicket) return answer;
      if (answer.ok) { setOwn(answer.data); ownMessage = ''; } else ownMessage = answer.message;
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
    syncSoon = setTimeout(() => { syncSoon = null; if (!disposed) void syncGame(true); }, 1500);
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
    const answer = await api.piratePoint();
    if (disposed) return answer;
    if (answer.ok) { point = answer.data; pointMessage = ''; tookCoins(answer.data.coins); } else pointMessage = answer.message;
    if (!own) { const mine = await api.getIsland(); if (!disposed && mine.ok) setOwn(mine.data); }
    applyWorld(); refreshCard();
    return answer;
  }

  // --- cards ---------------------------------------------------------------------------------
  function buildModel(spotId) {
    if (isPointSpot(spotId)) {
      const spot = point?.spots.find(item => item.id === spotId) ?? null;
      return buildCardModel({spotId, slot: ppSpotById(spotId).slot, spot, coins: own?.coins ?? null, busy: busySpot === spotId ? busyKind : false,
        message: cardMessage || (!point ? pointMessage : ''), point: true, prices: own?.prices ?? null});
    }
    // On a friend's island you build with your own coins (and your own unlocks); it stays theirs.
    const island = target(), spot = island?.spots.find(item => item.id === spotId) ?? null;
    return buildCardModel({spotId, slot: spotById(spotId)?.slot, spot, coins: own?.coins ?? null,
      visitor: !!visiting, ownerName: visiting?.ownerName, busy: busySpot === spotId ? busyKind : false, message: cardMessage || (!island ? ownMessage : ''),
      unlocks: own ? unlocks() : null, prices: own?.prices ?? null});
  }
  const crew = () => crewModel({crew: own?.crew ?? {}, coins: own?.coins ?? null, unlocks: own ? unlocks() : null, busy: busyCrew, message: cardMessage || (!own ? ownMessage : ''), prices: own?.prices});
  const captain = () => captainModel({captain: own?.captain ?? null, coins: own?.coins ?? null, unlocks: own ? unlocks() : null, busy: busyCaptain, message: cardMessage || (!own ? ownMessage : '')});
  const handlers = {build: (spotId, kind) => void build(spotId, kind), upgrade: spotId => void upgrade(spotId), hire: () => openCrew()};
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
    else if (ui.open === 'captain') ui.captainCard(captain(), upgradeCaptain);
    else if (ui.open === 'captains') ui.captainsCard(captainsModel([...here.values()]));
  }
  function openBuild(spotId) { openSpot = spotId; cardMessage = ''; ui.buildCard(buildModel(spotId), handlers); }
  async function freshOwn() {
    if (own) return null;
    const answer = await api.getIsland();
    if (!disposed && answer.ok) { setOwn(answer.data); refreshCard(); }
    return answer;
  }
  function openCrew() { openSpot = null; cardMessage = ''; ui.crewCard(crew(), hire); void freshOwn(); }
  function openCaptain() { openSpot = null; cardMessage = ''; ui.captainCard(captain(), upgradeCaptain); void freshOwn(); }
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
    else if (spotById(id) || isPointSpot(id)) openBuild(id);
  }

  // The answer of a write: the island, or (on Pirate Point) the shared spots plus your fresh coins.
  // Where a build goes: Pirate Point's shared spots, the friend's island you visit, or your own.
  const placeOf = spotId => (isPointSpot(spotId) ? 'point' : visiting ? 'visit' : 'own');
  const tookCoins = coins => { if (own && Number.isSafeInteger(coins)) setOwn({...own, coins}); else tellCoins(coins); };
  async function reloadVisit() {
    if (!visiting) return;
    const fresh = await api.visit(visiting.code);
    if (!disposed && fresh.ok && visiting) visiting = {...visiting, ...fresh.data, code: islandCode(fresh.data.code)};
  }
  async function reloadOwn() { const mine = await api.getIsland(); if (!disposed && mine.ok) setOwn(mine.data); }
  // The island being defended, read again: after a friend built or upgraded there (island_changed in
  // the island's room, src/pirates/game-wiring.js) and before every wave, so all defenders agree.
  async function refreshDefended() {
    if (disposed) return;
    if (visiting) await reloadVisit(); else if (own) await reloadOwn(); else return;
    refreshCard();
  }
  async function took(answer, place) {
    if (place === 'point') { point = answer.data; if (Number.isSafeInteger(answer.data.coins)) tookCoins(answer.data.coins); else await reloadOwn(); }
    else if (place === 'visit') { await Promise.all([reloadVisit(), reloadOwn()]); }
    else setOwn(answer.data);
  }
  async function refused(answer, place) {
    cardMessage = answer.message;
    if (['spot_taken', 'insufficient_funds', 'max_level', 'not_built', 'locked', 'crew_full'].includes(answer.code)) {
      if (place === 'point') { const fresh = await api.piratePoint(); if (!disposed && fresh.ok) { point = fresh.data; tookCoins(fresh.data.coins); } }
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
    game?.setPresence({live: onIsland, ids: [...next.keys()]});
    // Somebody we do not know yet is in the room: read the lobby again (at most every 10 s).
    if (onIsland && game && [...next.keys()].some(id => !game.knows(id))) wantSync();
    if (ui.open === 'captains') refreshCard();
  }
  // The Menu's island entries (shell/menu-extras.js).
  const stopMenu = menu(() => [
    {label: 'Players and invite', onSelect: () => openLobby()},
    ...(visiting || visitCode ? [{label: 'Leave this game', onSelect: () => void leaveGame()}] : []),
    {label: 'Crew', onSelect: () => openCrew()},
    {label: 'Captain', onSelect: () => openCaptain()},
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
        isActive: adapters.isActive, onPick: pick});
      world = deco; applyWorld();
      const original = place.update;
      place.update = (dt, frame) => { original(dt, frame); deco.update(dt, frame?.time ?? 0); };
      cleanups.push(() => { deco.dispose(); if (world === deco) world = null; place.update = original; });
    },
    // Pirate Point's shared build spots on lighthouse_isle (factory.js); its bell and lamps stay lane P's.
    decoratePoint(place, adapters = {}) {
      pointWorld?.dispose();
      const deco = decorateIsland(place, {reducedMotion, canvas: adapters.canvas, camera: adapters.camera, isActive: adapters.isActive, onPick: pick,
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
      const pointSpot = isPointSpot(zone), spot = pointSpot ? ppSpotById(zone) : spotById(zone);
      if (!spot) return undefined;
      const answer = (pointSpot ? point : target())?.spots.find(item => item.id === zone);
      if (answer?.built) return `${KINDS[answer.kind]?.name ?? slotName(spot.slot)} · level ${answer.level ?? 1}`;
      return spot.slot === 'tower' ? 'Build a tower' : `Build a ${KINDS[spot.kind].name.toLowerCase()} · ${coinText(KINDS[spot.kind].cost)}`;
    },
    presencePlace(place) {
      if (place !== ISLAND_PLACE) return null;
      return islandRoom(visiting?.code ?? visitCode ?? own?.code ?? '');
    },
    load, loadPoint, playArrival, visit, sailHome, pick, build, upgrade, hire, upgradeCaptain, setPresence,
    openInvite, openCrew, openCaptain, openCaptains, openLobby, enterGame, leaveGame,
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
    defenses: () => defenses(target()?.spots ?? []),
    get api() { return api; },
    roomPlace: () => islandRoom(visiting?.code ?? visitCode ?? own?.code ?? '') || null,
    async joinRunningWave() {
      if (disposed || !target()) return null;
      await flow.look(where());
      return flow.current && !flow.current.joined ? flow.join(where()) : null;
    },
    refreshDefended,
    setBattle(value) { battle = value === true; applyWorld(); },
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
