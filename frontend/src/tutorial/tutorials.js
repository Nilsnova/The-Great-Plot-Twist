// The tutorials of the island game (T52): the guided start of a new island and one card for every new thing.
//
// The guided start. On an island at wave 0 that this device has not guided yet (stored per island code, like the
// narrator), once the intro is over (no cutscene or card open, the narrator's opening said), the goals strip shows
// GUIDE_STEPS (src/ui/first-quests.js) instead of the goals, and the coach (coach.js) shows the current step's
// caption with a highlight on its target. Each step waits for the real action (a bus event, or what the frame
// shows: walking, a build card open). Skip step, Skip tutorial; never again on that island once done or skipped.
// Settings › Replay the guided start runs it again on the island on screen.
//
// The unlock cards. When the island's best won wave goes up, the cards of what opened (src/campaign/tutorials.json,
// unlock-cards.js) wait for a quiet moment (no wave, no card, no cutscene) and show one at a time, once per island.
// Show me walks the camera to the thing (not with reduced motion) and rings it.
//
// Multiplayer. Each screen keeps its own: every player gets the guide on their own screen. A friend who first
// sees an island past wave 0 never gets the guide, only the cards of the things open there that this device has
// not seen on any island.
//
// Nothing starts off an island the player owns or joined (gate.js): no code and campaign, no tutorial.
//
//   const tutorials = createTutorials({container, on, probe, locate, spotTarget, anchor, tour, say, setGuide, ...});
//   tutorials.update(dt)   every frame (game.js)
//   tutorials.replay()     Settings › Replay the guided start (bus event tutorial_replay)
//   tutorials.active       an unlock card is open (the game pauses walking, like any card)
import {GUIDE_STEPS, GUIDE_TITLE, applyGuideEvent, guideCaption, guideCurrent, guideStart, guideView, skipGuideStep} from '../ui/first-quests.js';
import {GUIDE_EVENTS, BUILD_CARD_OPENED, PLAYER_MOVED, WAVE_BEGAN} from '../ui/quest-events.js';
import {gameKey} from '../narrator/logic.js';
import {getPreferences, onPreferences as watchPreferences} from '../settings/preferences.js';
import {cardById, cardsBetween, cardsOpenAt, cardText} from './unlock-cards.js';
import {createTutorialMemory} from './memory.js';
import {createCoach} from './coach.js';
import {onIsland} from './gate.js';

export const TUTORIAL_REPLAY = 'tutorial_replay';
export const MOVE_STEP = 3;            // world units walked that count as "walked"
export const OPENING_WAIT_MS = 12000;  // the guide waits at most this long for the narrator's opening
export const SHOW_MS = 4000;           // Show me: the ring stays this long
export const TOUR_MS = 2600;           // ...and the camera looks there this long
const CHECK_MS = 250;
const safeLocal = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createTutorials({container = globalThis.document?.body, on, storage = safeLocal(),
  preferences = getPreferences, onPreferences = watchPreferences, reducedMotion = () => false,
  probe = () => null, locate = () => null, spotTarget = () => null, anchor = () => null, tour = () => {},
  say = () => [], setGuide = () => {}, focusGame = () => {}, flags = {}, hudParent = () => null,
  loadCard = () => import('./unlock-card.js'), createCoachImpl = createCoach, now = () => Date.now()} = {}) {
  const memory = createTutorialMemory(storage, {now});
  const coach = createCoachImpl(container, {parent: hudParent?.() ?? null, focusGame,
    onSkipStep: () => skip(false), onSkipAll: () => skip(true)});
  const stops = [];
  let disposed = false, code = null, guide = null, guiding = false, replaying = false, readyAt = null, lastCheck = -Infinity;
  let walked = 0, lastPos = null, cardOpen = null, cardLoading = false, showing = null, target = null, targetAt = -Infinity;
  const queue = [];
  const enabled = () => preferences()?.tutorials !== false;
  const read = () => { try { return probe() ?? null; } catch { return null; } };

  // ---- the guided start ----
  function saveGuide(status = 'active') {
    if (code) memory.setGuide(code, {status: guide?.done ? (status === 'skipped' ? 'skipped' : 'done') : status, step: guide?.step ?? 0, ready: guide?.ready, skipped: guide?.skipped});
  }
  function showGuide() {
    if (!guiding || !guide) { setGuide(null); return; }
    setGuide(guideView(guide));
  }
  function stopGuide(status) {
    if (!guiding) return;
    guiding = false; replaying = false;
    if (code) {
      memory.setGuide(code, {status, step: guide?.step ?? 0, skipped: guide?.skipped ?? []});
      memory.mark(code, ['defenses']); // the guide taught the start: its card is not needed on this island
    }
    coach.hide(); setGuide(null);
  }
  function apply(event) {
    if (!guiding || !guide || disposed) return;
    const before = guideCurrent(guide), wasReady = guide.ready, result = applyGuideEvent(guide, event);
    if (!result.changed) return;
    guide = result.state;
    if (result.finished) { stopGuide('done'); return; }
    saveGuide();
    const step = guideCurrent(guide);
    // A narrator line where one fits: the musket as the wave begins, the cutlass once boarders land.
    if (step?.narrator && enabled() && (step !== before ? !step.after : guide.ready && !wasReady)) say(step.narrator);
    target = null; showGuide();
  }
  function skip(all) {
    if (!guiding || !guide) return;
    guide = skipGuideStep(guide, GUIDE_STEPS, {all});
    if (guide.done) { stopGuide(all ? 'skipped' : 'done'); return; }
    saveGuide(); target = null; showGuide();
  }
  function beginGuide(state) {
    guide = state ?? guideStart(); guiding = true; walked = 0; lastPos = null; target = null;
    showGuide();
  }

  // ---- the unlock cards ----
  function hand(cards) {
    if (!code || !cards.length) return;
    if (!enabled()) { memory.mark(code, cards.map(card => card.id)); return; } // off: told as passed, never piled up
    memory.queue(code, cards.map(card => card.id));
    for (const card of cards) if (!queue.includes(card.id)) queue.push(card.id);
  }
  // The island on screen changed or its wave went up.
  function sight(p) {
    const key = gameKey(p.code, null), wave = p.wave;
    if (key !== code) {
      if (guiding) { coach.hide(); setGuide(null); guiding = false; }
      code = key; queue.length = 0; readyAt = now();
      const known = memory.game(code);
      if (!known) {
        if (wave === 0) memory.setGuide(code, {status: 'active', step: 0});
        else {
          // A friend (or a new device) on an island past wave 0: no guide, only what this device never saw.
          memory.setGuide(code, {status: 'none', step: 0});
          hand(cardsOpenAt(wave, flags).filter(card => card.wave > 0 && !memory.seenAnywhere(card.id)));
        }
        memory.setWave(code, wave);
      } else {
        for (const id of known.queued) if (!known.cards.includes(id) && cardById(id) && !queue.includes(id)) queue.push(id);
        if (known.wave === null) memory.setWave(code, wave);
      }
    }
    const entry = memory.game(code), from = entry?.wave ?? wave;
    if (wave > from) {
      memory.setWave(code, wave);
      hand(cardsBetween(from, wave, flags).filter(card => !entry.cards.includes(card.id)));
      if (guiding && !replaying) stopGuide('done'); // the first wave is won: the guide is over
    }
  }
  const calm = p => !p.waveRunning && !p.blocked && !p.cutscene && !p.dialog;
  async function nextCard() {
    if (cardOpen || cardLoading || showing || !queue.length || disposed) return;
    const id = queue[0], card = cardById(id);
    if (!card) { queue.shift(); return; }
    cardLoading = true;
    let module = null;
    try { module = await loadCard(); } catch { module = null; }
    cardLoading = false;
    if (disposed || !module || queue[0] !== id) return;
    const total = queue.length, current = cardOpen = module.openUnlockCard({container, text: cardText(card), index: 1, total});
    const reason = await current.done;
    if (cardOpen === current) cardOpen = null;
    current.dispose?.();
    if (disposed || reason === 'disposed') return;
    if (reason === 'skip_all') { memory.mark(code, [...queue]); queue.length = 0; }
    else { queue.shift(); memory.mark(code, [id]); }
    if (reason === 'show') showMe(card);
    focusGame();
  }
  // Show me: the ring on the thing, and the camera there for a moment (not with reduced motion: the ring and
  // the edge arrow say where it is instead).
  function showMe(card) {
    if (!card?.where) return;
    showing = {where: card.where, until: now() + SHOW_MS, tourUntil: 0};
    const point = card.where.startsWith('hud:') ? null : anchor(card.where);
    if (point && !reducedMotion()) { tour({x: point.x, z: point.z}); showing.tourUntil = now() + TOUR_MS; }
  }

  // ---- every frame ----
  function update(dt = 0) {
    if (disposed) return;
    const p = read();
    if (!p || !onIsland(p)) {
      if (guiding) { coach.hide(); setGuide(null); guiding = false; }
      if (showing) endShow();
      return;
    }
    const t = now();
    if (t - lastCheck >= CHECK_MS || gameKey(p.code, null) !== code) { lastCheck = t; sight(p); }
    // Walking, for the first step: the player's own steps on this screen.
    if (p.player && Number.isFinite(p.player.x)) {
      if (lastPos && guiding && !p.blocked) walked += Math.hypot(p.player.x - lastPos.x, p.player.z - lastPos.z);
      lastPos = {x: p.player.x, z: p.player.z};
    }
    // Start (or resume) the guide once the intro is over.
    const stored = code ? memory.game(code)?.guide : null;
    // (A wave may already run: a friend joined during wave 1. The guide then starts at the fight.)
    if (!guiding && enabled() && stored?.status === 'active' && !p.blocked && !p.cutscene && !p.dialog && !cardOpen && !showing) {
      const opening = readyAt !== null && t - readyAt < OPENING_WAIT_MS && p.narrating;
      if (!opening) {
        beginGuide({...guideStart(), step: stored.step, ready: stored.ready, skipped: stored.skipped});
      }
    }
    if (guiding && !enabled()) { coach.hide(); setGuide(null); guiding = false; }
    if (guiding) {
      if (walked >= MOVE_STEP) { walked = 0; apply({type: PLAYER_MOVED}); }
      if (guiding && p.card === 'build') apply({type: BUILD_CARD_OPENED});
      if (guiding && p.waveRunning && (guide?.step ?? 0) <= GUIDE_STEPS.findIndex(step => step.id === 'bell')) apply({type: WAVE_BEGAN, wave: Math.max(1, p.wave + 1)});
    }
    if (guiding) drawCoach(p, t); else if (!showing) coach.point(null);
    if (showing) drawShow(t);
    if (!guiding && queue.length && calm(p) && enabled()) void nextCard();
  }
  function drawCoach(p, t) {
    const step = guideCurrent(guide);
    if (!step) return;
    // Hidden while a card or a cutscene covers the game; the strip keeps the step.
    if (p.dialog || p.cutscene) { coach.hide(); return; }
    const index = guide.step + 1;
    coach.show({step: `Step ${index} of ${GUIDE_STEPS.length}`, title: step.label, caption: guideCaption(guide, step), keys: step.keys ?? ''});
    if (!target || t - targetAt > 500) {
      targetAt = t;
      target = step.target === 'spot' ? spotTarget() : step.target;
    }
    if (showing) return;
    coach.point(target ? locate(target) : null, {text: target === 'island_bell' ? 'Bell' : ''});
  }
  function drawShow(t) {
    if (t >= showing.tourUntil && showing.tourUntil) { tour(null); showing.tourUntil = 0; }
    if (t >= showing.until) { endShow(); return; }
    coach.point(locate(showing.where));
  }
  function endShow() { if (showing?.tourUntil) tour(null); showing = null; coach.point(null); }

  function replay() {
    if (disposed || !code) return false;
    replaying = true;
    if (guiding) { coach.hide(); guiding = false; }
    memory.setGuide(code, {status: 'active', step: 0});
    readyAt = null;
    return true;
  }

  for (const type of new Set([...Object.values(GUIDE_EVENTS), 'wave_started_server'])) {
    stops.push(on(type, event => apply(type === 'wave_started_server' ? {...event, type: WAVE_BEGAN} : event)));
  }
  stops.push(on('campaign_unlocked', () => { lastCheck = -Infinity; }));
  stops.push(on(TUTORIAL_REPLAY, () => { replay(); }));
  stops.push(onPreferences?.(() => { if (!enabled() && guiding) { coach.hide(); setGuide(null); guiding = false; } }) ?? (() => {}));

  return {
    update, replay, skip,
    get active() { return !!cardOpen || cardLoading; },
    get guide() { return guiding && guide ? {...guide, current: guideCurrent(guide)?.id ?? null} : null; },
    get queue() { return [...queue]; },
    get code() { return code; },
    get title() { return GUIDE_TITLE; },
    handleEscape() { if (cardOpen) { cardOpen.close('ok'); return true; } return false; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of stops) { try { stop?.(); } catch { /* gone */ } }
      cardOpen?.dispose?.(); cardOpen = null; if (showing?.tourUntil) tour(null);
      coach.dispose(); setGuide(null);
    },
  };
}
