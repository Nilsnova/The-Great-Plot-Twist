// The games on the island screen (GAME-V3.md §2, index.js): the room state's sync, the lobby and the captains'
// colours, visiting, leaving and entering a game, sailing home, the presence toasts, the bell's actions, the
// first landing's cutscene and Reset my island (T53). A closure over the island's state `isl`.

import {coinText} from './card-model.js';
import {displayIslandCode, islandCode, storeVisit} from './codes.js';
import {ISLAND_INVITE_OPENED} from '../ui/quest-events.js';
import {GAME_STARTED, captainColours, lobbyModel} from './lobby.js';
import {resolvePeer} from '../net/live-extras.js';
import {ARRIVAL_KEY, SPOTS_CHANGED, ISLAND_RESET} from './island-shared.js';
import {readEconomy,readLegacyEconomy,sameEconomyScope} from './economy-view.js';
import {readPersonalCaptain} from './economy-captain.js';

export function createGames(isl) {
  const {container, emit, reducedMotion, preferences, storage, visitStorage, loadCutscenes} = isl;
  // From the other parts (island-*.js), linked once every part exists.
  let campaignSeen, campaignTold, where, applyWorld, endVisit, load, interruptBoat, refreshCard,
    invalidateWallFeedback;
  // --- the game: its lobby and room state ----------------------------------------------------------
  const currentCode = () => islandCode(isl.visiting?.code ?? isl.visitCode ?? isl.own?.code ?? '');
  const canonical=()=>isl.mode!=='fake' && !readLegacyEconomy(isl.getEconomy?.());
  // The lobby answer once per game and landing (and when somebody new turns up in the room).
  async function syncGame(force = false) {
    const code = currentCode();
    if (!code || isl.disposed) return null;
    if (!force && code === isl.gameCode && Date.now() - isl.lobbyRead < 10000) return null;
    isl.gameCode = code; isl.lobbyRead = Date.now();
    const answer = await isl.api.lobby(code);
    if (isl.disposed || currentCode() !== code) return answer;
    if (answer.ok) { isl.lobbyProblem = ''; isl.lobbyAnswer = answer.data; isl.game?.setGame(answer.data); }
    else isl.lobbyProblem = answer.status === 401 || answer.code === 'not_ready' ? 'Sign in to see who is in this game.' : answer.message;
    if (isl.ui.open === 'lobby') refreshCard();
    return answer;
  }
  function wantSync() {
    if (isl.syncSoon || isl.disposed) return;
    const wait = Math.max(1500, isl.lobbyRead + 10000 - Date.now()); // the lobby is read at most every 10 s
    isl.syncSoon = setTimeout(() => { isl.syncSoon = null; if (!isl.disposed) void syncGame(true); }, wait);
  }
  function lobby() {
    const state = isl.game?.state ?? null, code = currentCode();
    // Without the room state (no wave wiring yet) the lobby answer alone: the list, nobody known online.
    const answered = islandCode(isl.lobbyAnswer?.game?.code ?? '') === code ? isl.lobbyAnswer : null;
    const members = state?.code === code ? state.members : answered?.members ?? [];
    const me = state?.me ?? answered?.members.find(member => member.you)?.id ?? null;
    const hostId = state?.hostId ?? answered?.members.find(member => member.role === 'host')?.id ?? null;
    const model=lobbyModel({code, members, online: state?.online ?? new Set(), me, hostId,
      hostAwayMs: state?.hostAwayMs ?? 0, started: state?.code === code && state.started === true, problem: isl.lobbyProblem});
    if(canonical())model.start={show:true,disabled:isl.session?.settingsView?.canManage!==true,label:'Open harbor bell',
      line:isl.session?.settingsView?.canManage?'Start the next defense at the harbor bell.':'Waiting for the current session leader.'};
    return model;
  }
  // The captain colours of the game on screen (by join order, 0-9) and your own (0 outside a game).
  function colours() {
    const state = isl.game?.state ?? null, code = currentCode();
    const answered = islandCode(isl.lobbyAnswer?.game?.code ?? '') === code ? isl.lobbyAnswer : null;
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
    if(canonical()){
      if(isl.session?.settingsView?.canManage!==true){refreshCard();return;}
      isl.pick('island_bell');return;
    }
    if (!isl.game?.start()) { refreshCard(); return; }
    if (isl.ui.open === 'lobby') { isl.ui.close(); isl.openSpot = null; }
  }
  function openLobby() {
    isl.openSpot = null; isl.cardMessage = '';
    isl.ui.lobbyCard(lobby(), {start: startGame});
    emit({type: ISLAND_INVITE_OPENED, code: currentCode() ? displayIslandCode(currentCode()) : null});
    isl.lobbyBusy = true;
    void syncGame(true).finally(() => { isl.lobbyBusy = false; if (isl.ui.open === 'lobby') refreshCard(); });
  }
  // The captains in your island's room (§11): a toast for each one who arrives, a list for the Menu.
  function setPresence(presence) {
    if (isl.disposed) return;
    const onIsland = presence?.status === 'live' && typeof presence.place === 'string' && presence.place.startsWith('isle_');
    const next = new Map(onIsland ? (presence.others ?? []).filter(other => other && typeof other.id === 'string')
      .map(other => [other.id, typeof other.name === 'string' && other.name ? other.name : 'A captain']) : []);
    if (isl.presenceReady && onIsland) {
      for (const [id, name] of next) if (!isl.here.has(id)) isl.ui.toast(`${name} joined ${isl.visiting?.ownerName ? `${isl.visiting.ownerName}'s island` : isl.visiting ? 'this island' : 'your island'}`, 'success');
    }
    isl.presenceReady = onIsland; isl.here = next;
    // The presence shows opaque ids; the live connection turns them back into player ids (the lobby's ids).
    const ids = [...next.keys()].map(id => { try { return resolvePeer(id) ?? id; } catch { return id; } });
    isl.game?.setPresence({live: onIsland, ids});
    // Somebody we do not know yet is in the room: read the lobby again (at most every 10 s).
    if (onIsland && isl.game && ids.some(id => !isl.game.knows(id))) wantSync();
    if (isl.ui.open === 'captains') refreshCard();
  }
  // T53: Settings › Reset my island. Only on your own island; in a friend's game only its host may.
  function resetState() {
    if (isl.visiting || isl.visitCode) return {kind: 'member'};
    if (!isl.own?.code) return {kind: 'none', message: isl.ownMessage || 'Open your island first to reset it.'};
    if (isl.currentFunds().shared) {
      const economy=readEconomy(isl.getEconomy());
      if(isl.mode==='fake' || !economy)return {kind:'none',message:'Read your supported island before resetting it.'};
      if(economy.islandOwner!==isl.getActorId())return {kind:'member'};
      let pending;try{pending=isl.sharedReset.pending(isl.own.code);}catch{return {kind:'none',message:'The original reset request could not be read. Retry storage must be recovered first.'};}
      if(!pending && !isl.domainAvailable('reset'))return {kind:'none',message:'Reset is unavailable for this island.'};
      return {kind:'owner',shared:true,actorId:isl.getActorId(),code:displayIslandCode(isl.own.code),pending:!!pending,
        economy:pending?.economyAtIntent??economy,wave:!pending && (isl.flow.busy || isl.battle===true && !isl.waveOver)};
    }
    // The island answer may carry the starting coins (startingCoins); without it the section says "your starting coins".
    return {kind: 'owner', code: displayIslandCode(isl.own.code), wave: isl.battle === true,preserveCaptain:!!readPersonalCaptain(isl.own.captain),
      ...(Number.isSafeInteger(isl.own.startingCoins) ? {startingCoins: isl.own.startingCoins} : {})};
  }
  async function resetIsland(typed) {
    const actor=isl.getActorId(),identity=isl.authGeneration(),originalCode=islandCode(isl.own?.code??'');
    isl.village.leave();
    const answer = await isl.api.freshStart({confirmCode: typed});
    if (isl.disposed || !answer.ok) return answer;
    if(actor!==isl.getActorId() || !Object.is(identity,isl.authGeneration()) || isl.visiting || isl.visitCode || originalCode!==islandCode(isl.own?.code??''))return {...answer,ignored:true};
    const receipt=answer.data?.receipt,shared=receipt?.action==='reset';
    if(shared){
      isl.session.retireOrigin(receipt.origin);
      if(!sameEconomyScope(readEconomy(isl.getEconomy()),receipt.origin)){
        await isl.reloadOwn();if(!isl.disposed)refreshCard();return {...answer,ignored:true};
      }
    }
    isl.resetGeneration++;
    isl.wrote('own');
    isl.funding.forget(isl.own?.code);
    if(shared){isl.own={...isl.own,economy:null,quotesStale:true};isl.tellCoins();}
    invalidateWallFeedback();
    const code = islandCode(isl.own?.code ?? '') || islandCode(typed);
    // This page's memory of the old island goes too: its campaign, walls and tree picks.
    campaignSeen.delete(code);
    for (const key of [...campaignTold]) if (key.startsWith(`${code}:`)) campaignTold.delete(key);
    isl.walls = new Map(); isl.wallsFor = null; isl.treePicked.clear(); isl.waveOver = false;
    isl.recoveryReadId++; isl.recoveryState = null; isl.recoveryIslandCode = null; isl.recoveryCombat = null; isl.recoveryStatus = 'disabled';
    isl.moving.cancel(); isl.flow.reset(); isl.ui.close(); isl.openSpot = null;
    await load();
    if (isl.disposed) return answer;
    emit({type: SPOTS_CHANGED, place: 'own', spot: 'cabin'}); // the members on the island read it again
    isl.ui.toast('Your island starts fresh', 'success', shared?'The island was read again. Your personal Captain is preserved.':`${coinText(answer.data.balance)} and wave 1. Ring the bell when you are ready.`);
    emit({type: ISLAND_RESET, code: displayIslandCode(code)});
    emit({type: GAME_STARTED, code: displayIslandCode(code), first: true, fresh: true});
    return answer;
  }
  async function bellAction(action) {
    if(action==='session'){await isl.session.ensure();refreshCard();return;}
    isl.cardMessage = '';
    const answer = action === 'join' ? await isl.flow.join(where()) : action === 'ring' ? await isl.flow.ring(where()) : null;
    if (isl.disposed || !answer || answer.ignored) return;
    if (answer.ok) { isl.world?.ring(); isl.ui.close(); return; }
    isl.cardMessage = answer.message; refreshCard();
  }
  // --- where the player is -------------------------------------------------------------------
  // The arrival cutscene, once per device, on the first landing on your own island (game.js awaits it).
  async function playArrival() {
    if (isl.visitCode || isl.visiting) return;
    let seen = false;
    try { seen = storage?.getItem(ARRIVAL_KEY) === '1'; } catch { /* Play it. */ }
    if (seen || isl.disposed) return;
    try { storage?.setItem(ARRIVAL_KEY, '1'); } catch { /* Played once per page instead. */ }
    try {
      const {playCutscene} = await loadCutscenes();
      if (isl.disposed) return;
      isl.cutscene = playCutscene({container, id: 'island_arrival', preferences, reducedMotion});
      await isl.cutscene.done;
    } catch { /* No cutscene: the island is still there. */ } finally { isl.cutscene = null; }
  }
  // Remember a code to visit; the next landing on home_islet shows that island.
  function visit(code) {
    const symbols = storeVisit(code, visitStorage);
    if (!symbols) return false;
    void isl.session?.leave();
    interruptBoat();
    isl.village.leave();
    invalidateWallFeedback();
    isl.selectionGeneration++; isl.loadTicket++;
    isl.moving.cancel(); isl.demolishSpot = null; isl.demolishQuote = null;
    isl.visitCode = symbols; isl.visiting = null; isl.flow.reset(); isl.ui.close();
    return true;
  }
  // Leave the friend's game for good (until you join again) and sail home (GAME-V3.md §2).
  async function leaveGame() {
    const code = islandCode(isl.visiting?.code ?? isl.visitCode ?? '');
    if (!code) return false;
    const answer = await isl.api.leaveGame(code);
    if (isl.disposed) return false;
    if (!answer.ok) { isl.ui.toast(answer.message, 'error'); return false; }
    isl.joined.delete(code);
    isl.ui.toast('You left the game. It stays under Continue until you join again.', 'info');
    await sailHome();
    return true;
  }
  // Which game Play opens (the front door's games card): your own (role host) or a friend's (member).
  function enterGame({code, role = 'member', joined: already = true} = {}) {
    const symbols = islandCode(code ?? '');
    if (!symbols) return false;
    isl.village.leave();
    if (already) isl.joined.add(symbols);
    if (role === 'host') { if (isl.visiting || isl.visitCode) endVisit(); isl.flow.reset(); isl.ui.close(); return true; }
    return visit(symbols);
  }
  async function sailHome() {
    interruptBoat();
    isl.village.leave();
    endVisit(); isl.flow.reset(); isl.ui.close(); applyWorld();
    await load();
  }
  function link() { // the names of the other parts, once every part exists (index.js)
    ({campaignSeen, campaignTold, where, applyWorld, endVisit, load, interruptBoat, refreshCard,
      invalidateWallFeedback} = isl);
  }
  return {currentCode, syncGame, wantSync, lobby, colours, colourOf, captainColour, startGame, openLobby, setPresence,
    resetState, resetIsland, bellAction, playArrival, visit, leaveGame, enterGame, sailHome, link};
}
