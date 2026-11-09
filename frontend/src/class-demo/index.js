// G29 class demo: the demo path in Saltreach Harbor for a presenter on a projector and ~30 phones.
// One shared class harbor (live:place:class_harbor:1), the quest strip (wave, duel, Keeper's Lock),
// the duel shortcut, the Keeper's Lock, the team finale "Light the three lamps" and, for the host,
// the projector's "Join the harbor" panel. ?demo=1 rehearses all of it alone with simulated captains.
// Loaded lazily by game.js after the front door; the cold title never contains it. Display and
// requests only: the server decides duels and the lock; the lamps are a broadcast-only show.
import './class-demo.css';
import {node} from '../ui/kit/dom.js';
import {api as defaultApi} from '../online/api.js';
import {isMe, resolvePeer, sendExtra, setClassHarbor} from '../net/live-extras.js';
import {CLASS_HARBOR_PLACE} from '../net/live-rules.js';
import {addMenuExtras} from '../shell/menu-extras.js';
import {readQuests, writeQuests, completeQuest, playerKey, questView} from './quests.js';
import {HARBOR_PLACE, LOCK_SPOT, LAMP_SPOTS, arrivals, joinedText, nearestSpot, presencePlace, readInvite, rememberInvite, readPath, writePath} from './harbor.js';
import {nearestCaptain} from './duel-shortcut.js';
import {hasNews, isLampLit, isRelit} from './lamp-sync.js';
import {createQuestStrip} from './quest-strip.js';
import {createLampFinale} from './lamps.js';
import {createDemoObjects} from './world-objects.js';
import {createLockApi} from './lock-api.js';
import {REWARD_LINE} from './lock-state.js';
import {createDuelApi, pendingInvite} from './duel-api.js';

const INVITE_POLL_MS = 20000;
const local = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const sessionStore = () => { try { return globalThis.sessionStorage ?? null; } catch { return null; } };

export function createClassDemo(ctx) {
  const {container, scene, world, player, input, audio, reducedMotion, on, canvas} = ctx;
  const api = ctx.api ?? defaultApi, storage = ctx.storage ?? local(), session = ctx.sessionStorage ?? sessionStore();
  const rehearsal = ctx.rehearsal === true, present = ctx.present === true;
  let path = readPath(storage), joined = rehearsal || readInvite(session), disposed = false, view = null, key = 'device';
  let quests = readQuests(storage, key), host = rehearsal || false, hostChecked = false, splashShown = false;
  let promptKey = '', target = null, lastCount = 1, known = new Set(), seeded = false, invitePoll = 0, inviteSeen = new Set();
  let lock = null, duel = null, projector = null, captains = null, simulateAt = 0, localEmote = null, lockOpened = false, rehearsalInvited = false, arrivedAt = null;
  if (joined) setClassHarbor(true);

  const layer = node('div', 'class-demo-layer');container.append(layer);
  const strip = createQuestStrip({parent: layer, focusGame: () => ctx.focus?.()});
  const prompt = node('div', 'demo-prompt');prompt.hidden = true;prompt.setAttribute('role', 'group');prompt.setAttribute('aria-label', 'Nearby');
  const joinButton = node('button', 'kit-button demo-join', 'Join the class harbor');joinButton.type = 'button';joinButton.hidden = true;
  joinButton.addEventListener('click', event => { joinHarbor(); if (event.detail > 0) ctx.focus?.(); });
  const toast = node('p', 'demo-toast');toast.setAttribute('role', 'status');toast.hidden = true;
  layer.append(prompt, joinButton, toast);
  const objects = createDemoObjects({scene, reducedMotion});
  let toastTimer = null;
  function say(text, ms = 3200) {
    if (!text) return;
    toast.textContent = text;toast.hidden = false;clearTimeout(toastTimer);toastTimer = setTimeout(() => { toast.hidden = true; }, ms);
  }

  // ---- rehearsal: simulated captains, duel and lock (no server writes) ----
  const rehearsalTools = rehearsal ? import('./rehearsal.js').then(module => {
    if (disposed) return null;
    const asked = new URLSearchParams(globalThis.location?.search ?? '').get('captains'), count = asked === null || !Number.isFinite(Number(asked)) ? 14 : Number(asked);
    captains = module.createRehearsalCaptains({count, canStand: ctx.canStand});
    return {duels: module.createRehearsalDuels(), lock: module.createRehearsalLock(), captains};
  }) : null;
  const duelApi = () => rehearsalTools ? rehearsalTools.then(tools => tools?.duels) : Promise.resolve(createDuelApi({api}));
  const lockApi = () => rehearsalTools ? rehearsalTools.then(tools => tools?.lock) : Promise.resolve(createLockApi({api}));

  // ---- quests ----
  function tick(id) {
    const result = completeQuest(quests, id);
    if (!result.changed) return;
    quests = result.state;writeQuests(storage, key, quests);strip.update(quests);
    const progress = questView(quests);
    say(progress.allDone ? 'All three goals done! Now light the three lamps together.' : `Goal done: ${progress.items.find(item => item.id === id).label}.`);
    audio?.cue?.('festival-claim');
  }

  // ---- the class harbor ----
  function joinHarbor() {
    joined = true;rememberInvite(session);setClassHarbor(true);joinButton.hidden = true;splashShown = false;
  }
  function splash() {
    splashShown = true;
    const box = node('div', 'demo-splash'), card = node('div');
    card.append(node('strong', '', 'The class harbor'), node('span', '', rehearsal ? 'Rehearsal: simulated captains are here with you.' : 'Everyone from class lands here. Wave, duel, and open the lock!'));
    box.append(card);box.setAttribute('role', 'status');layer.classList.toggle('demo-motion-off', reducedMotion());
    layer.append(box);setTimeout(() => box.remove(), 2700);
  }

  // ---- host and projector ----
  const isHostLike = () => host || present || rehearsal;
  async function checkHost() {
    if (hostChecked || rehearsal) return;
    const account = view?.account;
    if (account?.state !== 'signed_in' || account.guest === true) return;
    hostChecked = true;
    const reply = await api.get('/api/host/demo');
    if (!disposed && reply.ok) host = true;
  }
  async function toggleProjector() {
    if (!isHostLike()) return;
    if (!projector) {
      const module = await import('./projector.js');
      if (disposed) return;
      projector = module.createProjector({container: layer, host: host && !rehearsal ? module.createHostApi(api) : null,
        isHost: () => host && !rehearsal, rehearsal, focus: ctx.focus});
    }
    projector.setCount(lastCount);projector.toggle();
  }
  const stopMenu = addMenuExtras(() => {
    const entries = [];
    if (path === 'demo') entries.push({label: 'Full mystery', prologue: true, onSelect: () => setPath('full')});
    else entries.push({label: 'Class demo', onSelect: () => setPath('demo')});
    if (isHostLike()) entries.push({label: 'Projector: Join the harbor (J)', onSelect: () => void toggleProjector()});
    if (!joined && path === 'demo') entries.push({label: 'Join the class harbor', onSelect: joinHarbor});
    return entries;
  });
  function setPath(next) {
    path = next;writePath(storage, next);applyPath();
  }
  function applyPath() {
    const demo = path === 'demo';
    container.classList.toggle('demo-path', demo);strip.hidden = !demo;
    if (!demo) { prompt.hidden = true; joinButton.hidden = true; objects.setVisible(false); }
  }

  // ---- presence: arrivals, the count, invitations and lamps ----
  const stops = [];
  stops.push(on('live_presence_changed', event => {
    if (event.place !== CLASS_HARBOR_PLACE) return;
    lastCount = 1 + (event.shown?.length ?? 0) + (event.hiddenCount ?? 0);projector?.setCount(lastCount);
    const named = (event.shown ?? []).filter(peer => typeof peer.name === 'string' && peer.name.trim());
    const fresh = arrivals(known, named);
    for (const peer of named) known.add(peer.id);
    if (seeded && fresh.length && path === 'demo') say(joinedText(fresh.map(peer => peer.name)));
    seeded = true;
  }));
  stops.push(on('live_peer_extra', event => {
    if (event.event === 'lamp') finale.receive(event.data);
    if (event.event === 'duel' && isMe(event.data?.to) && typeof event.data.duel === 'string' && event.data.duel.length <= 64) void lookForInvite(event.data.duel);
  }));
  const myName = () => (rehearsal ? 'You' : view?.captain?.name ?? 'Captain');

  // ---- the duel shortcut ----
  async function ensureDuel() {
    if (duel) return duel;
    const [module, duels] = await Promise.all([import('./duel-overlay.js'), duelApi()]);
    if (disposed || !duels) return null;
    duel ??= module.createDuelOverlay({container: layer, duels, reducedMotion, cue: name => audio?.cue?.(name),
      onWave: () => void wave(),
      onInviteSent: ({duel: sent, target: invited}) => {
        const to = rehearsal ? null : resolvePeer(invited?.id);
        if (sent?.id && to) sendExtra('duel', {v: 1, to, duel: sent.id});
      },
      onChange: state => { if (state.screen === 'reveal') tick('duel'); },
      onFinished: finished => { if (finished) say(duel.resultLine(finished)); ctx.focus?.(); }});
    return duel;
  }
  async function lookForInvite(id) {
    const overlay = await ensureDuel(), duels = await duelApi();
    if (!overlay || !duels || overlay.state.screen !== 'idle' || inviteSeen.has(id)) return;
    const reply = id ? await duels.detail(id) : await duels.list();
    const found = id ? (reply.ok && reply.data?.duel?.canAnswer ? reply.data.duel : null) : (reply.ok ? pendingInvite(reply.data, inviteSeen) : null);
    if (reply.status === 404 && !id) invitePoll = Infinity; // duels are switched off: stop asking
    if (!found || disposed) return;
    inviteSeen.add(found.id);overlay.invited(found);
  }
  async function wave() {
    if (rehearsal) {
      localEmote = {id: 'wave', until: Date.now() + 1800};
      if (captains?.bots.length) { tick('wave'); setTimeout(() => captains?.wave(Date.now()), 900); }
      return;
    }
    const result = await ctx.send?.('setEmote', 'wave');
    if (result?.accepted && (view?.presence?.others?.length ?? 0) > 0) tick('wave');
    else if (!result?.accepted) say(result?.message || 'Wait a moment before you wave again.');
  }

  // ---- the Keeper's Lock ----
  async function openLock() {
    if (!lock) {
      const [module, transport] = await Promise.all([import('./lock-screen.js'), lockApi()]);
      if (disposed || !transport) return;
      lock ??= module.createLockScreen({container: layer, lock: transport, onClose: () => ctx.focus?.(),
        onOpened: () => {
          lockOpened = true; objects.setLockOpen(true); tick('lock');
          void playCutscene('lock_opens').then(() => { if (!disposed) say(REWARD_LINE, 8000); });
        }});
    }
    lock.open();
  }
  let cutscene = null;
  async function playCutscene(id) {
    try {
      const module = await import('../cutscenes/player.js');
      if (disposed) return;
      lock?.close();cutscene?.dispose?.();ctx.resetInput?.();
      cutscene = module.playCutscene({container, id, reducedMotion});
      await cutscene.done;
    } catch { /* The cutscene is a bonus: the reward line already shows. */ } finally { cutscene = null; ctx.focus?.(); }
  }

  // ---- the lamps ----
  const finale = createLampFinale({container: layer, myName, canFill: isHostLike,
    send: (event, data) => (rehearsal ? true : sendExtra(event, data)),
    helpers: rehearsal ? (lit, light) => {
      const others = [0, 1, 2].filter(index => index !== lit);
      others.forEach((index, order) => setTimeout(() => { if (!disposed) light(index); }, 3000 * (order + 1)));
    } : null,
    onLit: () => audio?.cue?.('festival-claim'),
    onRelit: ({celebrate}) => {
      objects.setRelit(true, {celebrate});audio?.cue?.('foghorn');audio?.cue?.('beam');
      say('The lighthouse burns again!', 5000);void playCutscene('lamps_relit');
    }});

  // ---- the prompt next to the player ----
  function renderPrompt(next, progress = 0) {
    const nextKey = next ? `${next.kind}:${next.id}:${next.lit ? 1 : 0}` : '';
    if (nextKey !== promptKey) {
      promptKey = nextKey;target = next;prompt.replaceChildren();prompt.hidden = !next;prompt.holdBar = null;
      if (!next) return;
      if (next.kind === 'lamp') {
        const lit = next.lit;
        prompt.append(node('p', '', lit ? `Lamp ${next.index + 1} burns. Two more captains, two more lamps!` : `Lamp ${next.index + 1}: hold the button or E for 2 seconds.`));
        if (!lit) { const hold = finale.holdButton(next.index); prompt.append(hold.button); prompt.holdBar = hold.bar; }
      } else {
        const label = next.kind === 'lock' ? (lockOpened ? "Look at the open Keeper's Lock" : "Open the Keeper's Lock") : `Meet ${next.name}`;
        const action = node('button', 'kit-button');action.type = 'button';action.append(node('kbd', '', 'E'), document.createTextNode(label));
        action.addEventListener('click', () => act());prompt.append(action);
      }
    }
    if (prompt.holdBar) prompt.holdBar.value = progress;
  }
  function act() {
    if (!target) return;
    if (target.kind === 'lock') void openLock();
    if (target.kind === 'captain') void ensureDuel().then(overlay => overlay?.open({id: target.id, name: target.name}));
  }

  // Taps on a captain near you open the same menu.
  function tapCaptain(event) {
    if (path !== 'demo' || ctx.isBlocked?.() || !ctx.project) return;
    const others = currentOthers(), me = {x: player.position.x, y: player.position.z};
    for (const other of others) {
      if (Math.hypot(other.x - me.x, other.y - me.y) > 6) continue;
      const point = ctx.project(other.x, other.y);
      if (point && Math.hypot(point.x - event.clientX, point.y - event.clientY + 24) < 34) {
        ctx.cancelWalk?.();void ensureDuel().then(overlay => overlay?.open({id: other.id, name: other.name}));
        return;
      }
    }
  }
  canvas?.addEventListener('click', tapCaptain);

  function currentOthers() {
    if (rehearsal) return captains ? captains.presence(Date.now(), HARBOR_PLACE).others : [];
    return (view?.presence?.others ?? []).filter(other => other.place === CLASS_HARBOR_PLACE || other.place === world.current?.id);
  }

  applyPath();strip.update(quests);

  return {
    get active() { return !!(lock?.active || duel?.active || cutscene); },
    get joined() { return joined; },
    // For the browser checks and the presenter's console: what the demo knows right now.
    get debug() { return {others: currentOthers(), quests: {...quests}, lamps: finale.state, target, path, host: isHostLike(), count: lastCount}; },
    presencePlace: place => presencePlace(place, joined),
    apply(next) {
      view = next;
      const nextKey = playerKey(next);
      if (nextKey !== key) { key = nextKey; quests = readQuests(storage, key); strip.update(quests); }
      void checkHost();
    },
    update(delta, {blocked = false, zoneActive = false} = {}) {
      if (disposed) return;
      const now = Date.now(), place = world.current?.id, inHarbor = place === HARBOR_PLACE, demo = path === 'demo';
      const shown = demo && inHarbor;
      objects.setVisible(shown);objects.update(delta);
      joinButton.hidden = !shown || joined || blocked;
      if (shown && joined && !splashShown && !blocked) splash();
      if (rehearsal && captains && inHarbor) {
        captains.step(delta, now, {x: player.position.x, z: player.position.z});
        if (now >= simulateAt) {
          simulateAt = now + 200;
          ctx.simulate?.({...captains.presence(now, CLASS_HARBOR_PLACE), localEmote: localEmote?.until > now ? localEmote : null, canEmote: true});
          if (!lastCount || lastCount !== captains.bots.length + 1) { lastCount = captains.bots.length + 1; projector?.setCount(lastCount); }
        }
        arrivedAt ??= now;
        if (!rehearsalInvited && now > arrivedAt + 25000 && captains.bots[1]) {
          rehearsalInvited = true;
          void rehearsalTools.then(async tools => { const overlay = await ensureDuel(); overlay?.invited(tools.duels.invite(captains.bots[1].name)); });
        }
      } else if (rehearsal && !inHarbor) ctx.simulate?.(null);
      const me = {x: player.position.x, z: player.position.z};
      const lampsOn = shown && (joined || rehearsal);
      const lampSpot = lampsOn ? nearestSpot(LAMP_SPOTS, me) : null;
      const nearLamps = lampsOn && LAMP_SPOTS.some(spot => Math.hypot(spot.x - me.x, spot.z - me.z) < 7);
      const finaleState = finale.update({lampSpot, heldE: !blocked && !zoneActive && !!lampSpot && input.held.has('KeyE'),
        shown: lampsOn && !blocked && (nearLamps || hasNews(finale.state, now))});
      objects.setLamps(finale.state.lamps.map(lamp => isLampLit(lamp, now)));
      if (!isRelit(finale.state, now)) objects.setRelit(false);
      let next = null;
      if (shown && !blocked && !zoneActive) {
        if (lampSpot) next = {kind: 'lamp', id: lampSpot.id, index: lampSpot.index, lit: finaleState.lit};
        else if (nearestSpot([LOCK_SPOT], me)) next = {kind: 'lock', id: LOCK_SPOT.id};
        else {
          const captain = nearestCaptain(currentOthers(), {x: me.x, y: me.z});
          if (captain) next = {kind: 'captain', id: captain.id, name: captain.name};
        }
      }
      renderPrompt(next, finaleState.progress);
      if (next && next.kind !== 'lamp' && !blocked && input.consume('KeyE')) act();
      if (isHostLike() && !blocked && input.consume('KeyJ')) void toggleProjector();
      if (!rehearsal && shown && joined && now >= invitePoll && view?.presence?.status === 'live') {
        invitePoll = now + INVITE_POLL_MS;void lookForInvite(null);
      }
    },
    handleEscape() {
      if (projector?.visible) { projector.hide(); return true; }
      if (strip.closeHint()) return true;
      return false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;clearTimeout(toastTimer);stopMenu();for (const stop of stops) stop();
      canvas?.removeEventListener('click', tapCaptain);
      lock?.dispose();duel?.dispose();projector?.dispose();finale.dispose();objects.dispose();cutscene?.dispose?.();
      ctx.simulate?.(null);container.classList.remove('demo-path');layer.remove();
    },
  };
}
