// Your island, put together: the server's island (api.js), its drawing on home_islet (world.js), the
// build, bell and invite cards (ui.js), the wave around the bell (wave-flow.js) and visits by code.
// game.js loads this file only when the islands are on (mode.js) and asks it a few small things:
//   decorate(place, art, cleanups, adapters)  draws the island on the home_islet place
//   owns(zoneId) / label(zoneId)              its interaction zones and their prompt
//   presencePlace(place)                      isle_<code> on an island (live:place:isle_k7q2m:1)
//   playArrival() / visit(code) / sailHome()  the first landing, and visits by code
//   chartVisible(id) / chartLabel(id)         the three sea chart destinations
//   active / handleEscape() / dispose()
// Events it emits on the game's bus: island_built {kind, spot}, island_invite_opened,
// wave_started_server {...} and wave_finished {...} (see wave-hooks.js).
import {createIslandApi} from './api.js';
import {createWaveFlow} from './wave-flow.js';
import {createIslandUi} from './ui.js';
import {decorateIsland} from './world.js';
import {SPOTS, KINDS, BELL, CABIN, ISLAND_PLACE, isIslandZone, spotById, defenses} from './spots.js';
import {buildCardModel, bellModel, inviteModel, coinText} from './card-model.js';
import {displayIslandCode, islandCode, islandRoom, storeVisit, readVisit, forgetVisit} from './codes.js';

export const ARRIVAL_KEY = 'plot_twist_island_arrival_v1';
export const CHART_NAMES = Object.freeze({home_islet: 'Your island', saltreach_harbor: 'The Harbor', lighthouse_isle: 'Pirate Point'});
const notReady = () => Promise.resolve({ok: false, status: 503, code: 'not_ready',
  message: 'Sign in to build on your island. You can keep exploring.'});
const safeLocal = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createIsland({container, emit, on, mode = 'live', getTransport = () => null, transport = null,
  search = globalThis.location?.search ?? '', focus = () => {}, resetInput = () => {}, reducedMotion = () => false,
  preferences = () => ({}), storage = safeLocal(), visitStorage = undefined, loadCutscenes = () => import('../cutscenes/player.js'),
  now, setTimer, clearTimer} = {}) {
  let disposed = false, own = null, ownMessage = '', visiting = null, visitCode = readVisit(visitStorage), busySpot = null, cardMessage = '';
  let world = null, cutscene = null, openSpot = null, loadTicket = 0;
  // The fake answers at once; the live transport is the signed-in session's, read at every call.
  const live = {get: path => (getTransport()?.get?.(path) ?? notReady()), post: (path, body) => (getTransport()?.post?.(path, body) ?? notReady())};
  const api = createIslandApi({transport: transport ?? live});
  const ui = createIslandUi({container, focus, resetInput});
  const placeholder = mode === 'fake' || new URLSearchParams(search).get('wavedebug') === '1';
  const target = () => visiting ?? own;
  const where = () => (visiting ? displayIslandCode(visiting.code) : 'own');
  const flow = createWaveFlow({api, emit, placeholder, now, setTimer, clearTimer,
    notify: text => ui.toast(text), banner: text => ui.banner(text), onChange: () => refreshCard(),
    defensesOf: () => defenses(target()?.spots ?? [])});
  const stopFinished = on('wave_finished', event => {
    if (disposed || !own || visiting) return;
    if (Number.isSafeInteger(event.coins)) own = {...own, coins: event.coins, waveBest: event.waveBest ?? own.waveBest, flags: event.flags ?? own.flags};
    refreshCard();
  });
  // Every landing on home_islet loads the island shown there: your own, or the one you visit.
  const stopArrived = on('arrived', event => { if (event.place === ISLAND_PLACE) void load(); });
  const stopInteract = on('interact', event => { if (event.place === ISLAND_PLACE && isIslandZone(event.id)) pick(event.id); });
  // Leaving the island closes its card and ends a visit (the next landing is your own island).
  const stopTravel = on('travel', event => {
    ui.close(); flow.reset(); openSpot = null;
    if (visiting && event.to !== ISLAND_PLACE) endVisit();
  });

  function applyWorld() { world?.apply({spots: target()?.spots ?? [], visitor: !!visiting}); }
  function endVisit() { visiting = null; visitCode = null; forgetVisit(visitStorage); ui.visit(null); }

  async function load() {
    const ticket = ++loadTicket;
    if (visitCode) {
      const answer = await api.visit(visitCode);
      if (disposed || ticket !== loadTicket) return answer;
      if (answer.ok) {
        visiting = {...answer.data, code: islandCode(answer.data.code)};
        ui.visit({ownerName: visiting.ownerName, code: displayIslandCode(visiting.code)}, () => void sailHome());
      } else {
        endVisit(); ui.toast(answer.message);
      }
    }
    if (!visiting) {
      const answer = await api.getIsland();
      if (disposed || ticket !== loadTicket) return answer;
      if (answer.ok) { own = answer.data; ownMessage = ''; } else ownMessage = answer.message;
    }
    applyWorld(); refreshCard();
    if (target()) await flow.look(where());
    return {ok: true};
  }

  // --- cards ---------------------------------------------------------------------------------
  function buildModel(spotId) {
    const island = target(), spot = island?.spots.find(item => item.id === spotId) ?? null;
    return buildCardModel({spotId, kind: spotById(spotId)?.kind, spot, coins: visiting ? null : own?.coins ?? null,
      visitor: !!visiting, ownerName: visiting?.ownerName, busy: busySpot === spotId, message: cardMessage || (!island ? ownMessage : '')});
  }
  function bell() {
    const wave = flow.current;
    return bellModel({wave: wave?.wave ?? null, joined: wave?.joined === true, countdown: flow.secondsLeft(), busy: flow.busy,
      visitor: !!visiting, ownerName: visiting?.ownerName, waveBest: target()?.waveBest ?? 0, message: cardMessage});
  }
  function refreshCard() {
    if (disposed) return;
    applyWorld();
    if (ui.open === 'build' && openSpot) ui.buildCard(buildModel(openSpot), build);
    else if (ui.open === 'bell') ui.bellCard(bell(), bellAction);
    else if (ui.open === 'invite') ui.inviteCard(inviteModel(own?.code));
  }
  function openBuild(spotId) { openSpot = spotId; cardMessage = ''; ui.buildCard(buildModel(spotId), build); }
  async function openBell() {
    openSpot = null; cardMessage = ''; ui.bellCard(bell(), bellAction);
    if (target()) await flow.look(where());
  }
  function openInvite() {
    openSpot = null; cardMessage = '';
    ui.inviteCard(inviteModel(own?.code));
    emit({type: 'island_invite_opened', code: own?.code ? displayIslandCode(own.code) : null});
  }
  function pick(id) {
    if (disposed) return;
    if (id === BELL.id) void openBell();
    else if (id === CABIN.id) { if (!visiting) openInvite(); }
    else if (spotById(id)) openBuild(id);
  }

  async function build(spotId) {
    const spot = spotById(spotId);
    if (!spot || visiting || busySpot) return;
    busySpot = spotId; cardMessage = ''; refreshCard();
    const answer = await api.build({spot: spotId, kind: spot.kind});
    if (disposed) return;
    busySpot = null;
    if (answer.ok) {
      own = answer.data;
      emit({type: 'island_built', kind: spot.kind, spot: spotId});
      ui.toast(`${KINDS[spot.kind].name} built! You have ${coinText(own.coins)}.`);
    } else {
      cardMessage = answer.message;
      if (['spot_taken', 'insufficient_funds'].includes(answer.code)) {
        const fresh = await api.getIsland();
        if (disposed) return;
        if (fresh.ok) own = fresh.data;
      }
    }
    refreshCard();
  }
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
    visitCode = symbols; visiting = null;
    return true;
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
    owns: isIslandZone,
    label(zone) {
      if (zone === BELL.id) return flow.current && !flow.current.joined ? 'Join the defense' : 'Ring the harbor bell';
      if (zone === CABIN.id) return 'Invite a friend';
      const spot = spotById(zone);
      if (!spot) return undefined;
      const built = target()?.spots.find(item => item.id === zone)?.built === true;
      return built || visiting ? KINDS[spot.kind].name : `Build a ${KINDS[spot.kind].name.toLowerCase()} · ${coinText(KINDS[spot.kind].cost)}`;
    },
    presencePlace(place) {
      if (place !== ISLAND_PLACE) return null;
      return islandRoom(visiting?.code ?? visitCode ?? own?.code ?? '');
    },
    load, playArrival, visit, sailHome, pick, build,
    openInvite,
    chartVisible: id => Object.hasOwn(CHART_NAMES, id),
    chartLabel: id => CHART_NAMES[id],
    get visiting() { return visiting ? {...visiting} : visitCode ? {code: visitCode} : null; },
    get island() { return own ? structuredClone(own) : null; },
    get flow() { return flow; },
    get ui() { return ui; },
    get active() { return ui.active || !!cutscene; },
    handleEscape() {
      if (cutscene) { cutscene.skip(); return true; }
      return ui.close();
    },
    dispose() {
      if (disposed) return; disposed = true;
      stopFinished(); stopArrived(); stopInteract(); stopTravel(); flow.dispose(); ui.dispose(); cutscene?.dispose?.(); world?.dispose(); world = null;
    },
    spots: SPOTS,
  };
}
