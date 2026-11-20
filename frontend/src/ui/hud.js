// The play HUD keeps three things (docs/PITCH.md): 🪙 coins top-left, the quest strip top-right and one
// Menu button. Everything else appears only when it matters: the place name as a 2-second arrival
// banner, the E prompt next to a hotspot, toasts (src/ui/toasts.js) and a hint after 20 s standing still.
// Controls help, the sea chart and the place · weather · time line moved into the pause menu.
import {node} from './kit/dom.js';
import {places} from '../world/places/registry.js';
import {settings} from '../config.js';
import {getWeather} from '../world/weather.js';
import {on as defaultOn, emit as defaultEmit} from '../core/events.js';
import {getPreferences, reducedMotion} from '../settings/preferences.js';
import {counterValue} from './coin-counter.js';
import {addMenuExtras, addMenuStatus} from '../shell/menu-extras.js';
import {createQuestStrip} from './quest-strip.js';
import {QUEST_EVENTS, PLACE_ARRIVED, HUD_OPENED, WAVE_REWARDS_RECOVERED} from './quest-events.js';
import {applyQuestEvent, reconcileFirstQuests, createIdleHint, firstQuestView, questsFor, readFirstQuests, writeFirstQuests} from './first-quests.js';
import {showToast} from './toasts.js';
import {coinsSpoken, formatCoins} from '../lib/coins.js';
import {hudWaveView} from './wave-progress.js';
import {createTreasuryProjection, exactCoinText, readEconomy, treasuryLine} from '../island/economy-view.js';
import './hud.css';

export const ARRIVAL_MS = 2000;
export const COIN_TICK_MS = 900;
const names = Object.fromEntries(Object.values(places).flatMap(p => p.zones.map(z => [z.id, z.name])));
const local = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export const weatherLabel = weather => weather.rain > 0.5 ? 'Rain at sea' : weather.fog > 0.7 ? 'Sea mist' : weather.cloudCover > 0.6 ? 'Overcast' : 'Fair skies';

export function createHud(container, actions, {on = defaultOn, emit = defaultEmit, storage = local(), toast = showToast, hintsEnabled = () => getPreferences().hintsEnabled !== false} = {}) {
  let disposed = false, place = 'saltreach_harbor', override = null, coins = null, account = 'none', lastFrame = 0;
  // Where the balance comes from: the wallet (view.captain.coins) or, with the islands on, the island API
  // through setCoins(). The island's own count wins once chosen, so the wallet never overwrites it.
  let coinSource = 'wallet';
  let sharedTreasury = null, sharedMode = false;
  let managing = false, captainLevel = null, waveView = null, waveKey = '';
  const overlay = node('div', 'hud hud-play');
  // 1. Coins.
  const purse = node('div', 'hud-coins'), purseText = node('span', 'hud-coins-value');
  purse.dataset.hudGroup = 'coins';purse.setAttribute('role', 'status');purse.append(purseText);
  const treasuryName = node('span', 'hud-treasury-name'), treasuryHeld = node('span', 'hud-treasury-held');
  treasuryName.hidden = true; treasuryHeld.hidden = true; purse.prepend(treasuryName); purse.append(treasuryHeld);
  const waveBadge = node('span', 'hud-wave'), waveText = node('span', 'hud-wave-value');
  const waveIcon = node('span', 'hud-wave-icon');waveIcon.setAttribute('aria-hidden', 'true');
  waveBadge.hidden = true;waveBadge.append(waveIcon, waveText);purse.append(waveBadge);
  // 2. Menu, and 3. the quest strip under it.
  const right = node('div', 'hud-right'), menu = node('button', 'hud-menu');
  menu.type = 'button';menu.dataset.hudGroup = 'menu';menu.setAttribute('aria-haspopup', 'dialog');
  const bars = node('span', 'hud-menu-icon');bars.setAttribute('aria-hidden', 'true');menu.append(bars, document.createTextNode('Menu'));
  menu.addEventListener('click', () => { opened('menu'); (actions.menu ?? actions.settings)?.(); });
  right.append(menu);
  const strip = createQuestStrip({parent: right, focusGame: () => actions.focus?.()});
  // The guided start (T52) waits for the Menu or the goals being opened: hud_opened {what}.
  function opened(what) { try { emit?.({type: HUD_OPENED, what}); } catch { /* The HUD never stops for it. */ } }
  strip.element.addEventListener('click', event => { if (event.target?.closest?.('button')) opened('goals'); });
  // Contextual: arrival banner (and a screen-reader place status), the E prompt.
  const banner = node('div', 'hud-arrival'), bannerEyebrow = node('span', '', 'You have arrived'), bannerName = node('strong');
  banner.hidden = true;banner.setAttribute('aria-hidden', 'true');banner.append(bannerEyebrow, bannerName);
  const chapter = node('p', 'chapter');chapter.classList.add('kit-sr-only');chapter.setAttribute('role', 'status');chapter.setAttribute('aria-atomic', 'true');
  const prompt = node('div', 'interact'), promptLabel = node('strong');
  prompt.setAttribute('role', 'status');prompt.hidden = true;prompt.append(node('kbd', '', 'E'), promptLabel);
  // "Walk closer": a click on something out of reach says so next to it for a moment (src/world/reach.js).
  const nudge = node('div', 'interact-nudge');nudge.setAttribute('role', 'status');nudge.hidden = true;
  overlay.append(purse, right, banner, chapter, prompt, nudge);
  container.append(overlay);
  // A two-row phone purse must not collide with the normal Goals panel beneath Menu.
  function measureHeader() {
    if (disposed) return;
    const purseBottom = purse.getBoundingClientRect().bottom;
    const extra = Math.max(0, purseBottom - menu.getBoundingClientRect().bottom);
    right.style.setProperty('--hud-quest-offset', `${extra}px`);
    document.documentElement.style.setProperty('--hud-island-treasury-bottom', sharedMode ? `${purseBottom + 10}px` : '0px');
    // Toasts share #game but may be in the popover top layer. Reserve the actual Goals box,
    // including visibility:hidden cards; display:none/hidden Goals have no box to reserve.
    const goal = strip.element.getBoundingClientRect();
    document.documentElement.style.setProperty('--hud-goals-toast-top', `${goal.width > 0 && goal.height > 0 ? goal.bottom + 10 : 0}px`);
  }
  const headerSize = typeof ResizeObserver === 'function' ? new ResizeObserver(measureHeader) : null;
  headerSize?.observe(purse);headerSize?.observe(menu);headerSize?.observe(strip.element);
  window.addEventListener('resize', measureHeader);

  let tickFrame = 0;
  function drawPurseLabel() {
    const balance = sharedMode ? treasuryLine(sharedTreasury?.valid ? sharedTreasury.current : null)
      : Number.isFinite(coins) ? coinsSpoken(coins) : 'Coins not loaded yet';
    purse.setAttribute('aria-label', waveView ? `${balance} · ${waveView.label}` : balance);
  }
  function drawWave(status) {
    const next = hudWaveView(status), key = next ? `${next.text}|${next.label}` : '';
    if (key === waveKey) return;
    waveKey = key;waveView = next;waveBadge.hidden = !next;waveIcon.textContent = next ? '⚔️' : '';waveText.textContent = next?.text ?? '';
    drawPurseLabel();measureHeader();
  }
  function drawCoins() {
    cancelAnimationFrame(tickFrame);
    if (sharedMode) {
      const state = sharedTreasury?.valid ? sharedTreasury.current : null;
      purse.dataset.economy = 'shared'; treasuryName.hidden = false; treasuryHeld.hidden = false;
      treasuryName.textContent = 'Island treasury';
      purseText.textContent = state ? exactCoinText(state.treasury.availableCoins) : '🪙 …';
      treasuryHeld.textContent = state ? `${exactCoinText(state.treasury.committedCoins)} committed · ${exactCoinText(state.treasury.balanceCoins)} total`
        : 'Reload the island to refresh its treasury.';
      purse.hidden = false; drawPurseLabel(); measureHeader(); return;
    }
    delete purse.dataset.economy; treasuryName.hidden = true; treasuryHeld.hidden = true;
    treasuryName.textContent = ''; treasuryHeld.textContent = '';
    const known = Number.isFinite(coins);
    purseText.textContent = known ? formatCoins(coins) : '🪙 …';
    drawPurseLabel();
    // Signed out there is no purse to load, so no endless "🪙 …": the chip waits until there are coins.
    purse.hidden = !known && account === 'signed_out';
    measureHeader();
  }
  // Loot: the number counts up to the new balance (the label says the new balance at once).
  function tickCoins(from) {
    drawCoins();
    const target = coins, start = performance.now();
    const step = () => {
      if (disposed || coins !== target) return;
      const fraction = Math.min(1, (performance.now() - start) / COIN_TICK_MS);
      purseText.textContent = formatCoins(counterValue(from, target, fraction));
      if (fraction < 1) tickFrame = requestAnimationFrame(step);
    };
    step();
  }
  drawCoins();

  // ---- quests: the first 3 minutes unless a part of the game (the class demo) shows its own ----
  let first = readFirstQuests(storage), guide = null, questIsland = null, recoveredWinBest = 0;
  const idle = createIdleHint();
  // T52: the first-run goals show only on an island the player owns or joined (actions.hasIsland), never on the
  // front door or signed out; a part of the game with its own goals (the class demo) keeps its strip.
  const islandShown = () => { try { return actions.hasIsland ? actions.hasIsland() === true : true; } catch { return false; } };
  // actions.travel() says whether the sea chart is there (docs/GAME-V3.md §2 "one island": no, by default).
  const travel = () => { try { return actions.travel ? actions.travel() !== false : false; } catch { return false; } };
  const quests = () => questsFor(travel());
  const draw = () => {
    const view = override ?? guide ?? (islandShown() ? firstQuestView(first, quests()) : null);
    strip.hidden = managing || !view;
    if (view) strip.render(view);
    measureHeader();
  };
  function setManaging(value) {
    const next = value === true;
    if (next === managing) return;
    managing = next;
    if (managing && strip.element.contains(document.activeElement)) actions.focus?.();
    draw();
  }
  function completeGoal(result) {
    if (!result.changed || disposed) return;
    first = reconcileFirstQuests(result.state, questIsland, quests());writeFirstQuests(storage, first);idle.progress();
    if (override) return;
    draw();
    if (guide) return; // the guided start says it itself
    toast({text: first.done >= quests().length ? 'All goals done!' : `Goal done: ${result.completed.label}`, tone: 'success'});
  }
  function savedWins() {
    while (!disposed && recoveredWinBest > 0 && quests()[first.done]?.event === QUEST_EVENTS.WAVE_FINISHED) {
      const result = applyQuestEvent(first, {type: QUEST_EVENTS.WAVE_FINISHED, survived: true, waveBest: recoveredWinBest}, quests());
      if (!result.changed) break;
      completeGoal(result);
    }
  }
  function progress(event) { completeGoal(applyQuestEvent(first, event, quests())); savedWins(); }
  const stops = Object.values(QUEST_EVENTS).map(type => on(type, progress));
  stops.push(on(WAVE_REWARDS_RECOVERED, event => {
    if (!Number.isSafeInteger(event?.wonWaveBest) || event.wonWaveBest < 0 || event.wonWaveBest > 1000) return;
    recoveredWinBest = Math.max(recoveredWinBest, event.wonWaveBest); savedWins();
  }));
  // The world's own arrival event counts as place_arrived too.
  stops.push(on('arrived', event => progress({type: PLACE_ARRIVED, id: event.place})));
  draw();

  // ---- what moved into the pause menu ----
  const clock = () => { const hour = Math.floor(settings.hour), minute = Math.floor((settings.hour % 1) * 60); return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; };
  stops.push(addMenuStatus(() => `${placeName(place)}, ${weatherLabel(getWeather())}, ${clock()}${captainLevel === null ? '' : `, Captain level ${captainLevel}`}`));
  stops.push(addMenuExtras(() => [
    actions.chart && (!actions.travel || travel()) && {label: 'Sea chart', onSelect: () => actions.chart()},
    actions.controls && {label: 'Controls', onSelect: () => actions.controls()},
    actions.tutorial && {label: 'How to play', onSelect: () => actions.tutorial()},
  ].filter(Boolean)));

  let bannerTimer = 0;
  function showBanner(text) {
    clearTimeout(bannerTimer);bannerName.textContent = text;banner.hidden = false;
    bannerTimer = setTimeout(() => { banner.hidden = true; }, ARRIVAL_MS);
  }
  // The place's name: actions.placeName(id) names a friend's game ("Nils's game", src/island/one-island.js),
  // else the registry's ("Your island").
  function placeName(id) {
    try { const named = actions.placeName?.(id); if (typeof named === 'string' && named) return named; } catch { /* the registry's */ }
    return places[id]?.name ?? '';
  }
  function arrive(id) {
    place = id;const name = placeName(id);chapter.textContent = name;
    if (overlay.classList.contains('exploring')) showBanner(name);
  }
  arrive(place);

  return {
    resetRecoveredWins() { recoveredWinBest = 0; },
    get quickPanelsOpen() { return false; },
    setCaptain(view) {
      const value = view?.captain?.coins;
      const state = view?.account?.state ?? 'none';
      if (state === 'expired' && account !== 'expired') toast({text: 'Your sign-in ran out.', next: 'Sign in again from Menu › Settings to keep playing online.', tone: 'error'});
      account = state;
      if (coinSource === 'wallet' && Number.isFinite(value)) { coins = value; drawCoins(); }
      else purse.hidden = !Number.isFinite(coins) && account === 'signed_out';
    },
    // {tick: true} (loot after a wave): an increase counts up, unless motion is reduced.
    setCoins(value, {tick = false} = {}) {
      if (sharedMode) return;
      if (!Number.isFinite(value)) return;
      const from = coins; coins = Math.round(value);
      if (tick && Number.isFinite(from) && coins > from && !reducedMotion()) tickCoins(from); else drawCoins();
    },
    setCaptainLevel(level) {
      captainLevel = Number.isSafeInteger(level) && level > 0 ? level : null;
    },
    setManaging,
    setTreasury(value, {replace = false} = {}) {
      sharedMode = true;
      const next = readEconomy(value);
      if (!next) {
        if (sharedTreasury) sharedTreasury.update({economy: value});
        drawCoins(); return false;
      }
      if (!sharedTreasury || replace) sharedTreasury = createTreasuryProjection(next);
      else sharedTreasury.update({economy: next});
      coinSource = 'island'; drawCoins(); return sharedTreasury.valid;
    },
    clearTreasury() { sharedTreasury = null; sharedMode = false; coins = null; drawCoins(); },
    // 'island' (the island API sends setCoins) or 'wallet' (the default).
    setCoinSource(source) { coinSource = source === 'island' ? 'island' : 'wallet'; },
    // Only the player's own island is supplied here, never the visited island's buildings or crew.
    setQuestIsland(island) {
      if (disposed) return;
      questIsland = island;
      const next = reconcileFirstQuests(first, questIsland, quests());
      if (next !== first) {
        first = next;writeFirstQuests(storage, first);idle.progress();draw();
      }
      savedWins();
    },
    get coins() { return coins; },
    // A part of the game with its own goals (the class demo) passes its view; null gives the strip back.
    setQuests(view) { override = view ?? null; draw(); },
    // The guided start of a new island (T52, src/tutorial/tutorials.js): its steps in the strip, or null for the goals.
    setGuide(view) { guide = view ?? null; draw(); },
    get quests() { return {...first, view: override ?? firstQuestView(first, quests())}; },
    // The goals again (the island game decided on one island or travel after the first Play).
    refreshQuests() { draw(); },
    // T51: open water behind the front door has no island, so no goals strip yet.
    setBare(on) { overlay.classList.toggle('hud-bare', !!on); measureHeader(); },
    togglePanel() {}, toggleControls() {},
    closeQuickPanels() { return strip.closeHint(); },
    start() {
      overlay.classList.add('exploring');actions.start();
      showBanner(placeName(place));
      actions.focus();
    },
    dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(tickFrame); clearTimeout(bannerTimer); headerSize?.disconnect();window.removeEventListener('resize', measureHeader); document.documentElement.style.removeProperty('--hud-goals-toast-top');document.documentElement.style.removeProperty('--hud-island-treasury-bottom');stops.forEach(stop => stop()); strip.dispose(); overlay.remove(); },
    arrive,
    // The place on screen got its name late (a friend's game learned its host): the place status and a
    // banner still showing follow; no new banner.
    renamePlace() {
      const name = placeName(place);chapter.textContent = name;
      if (!banner.hidden) bannerName.textContent = name;
    },
    message(text, options = {}) { toast({text, ...options}); },
    notify() { /* The E prompt already names the hotspot; no extra toast. */ },
    update(zone, stats = {}) {
      if (Object.hasOwn(stats, 'managing')) setManaging(stats.managing);
      drawWave(stats.waveStatus);
      const now = performance.now(), delta = lastFrame ? Math.min(250, now - lastFrame) : 0;lastFrame = now;
      overlay.classList.toggle('night', stats.night > 0.4);
      prompt.hidden = !zone;prompt.dataset.zone = zone || '';
      if (zone) promptLabel.textContent = stats.interactionLabel ?? names[zone] ?? '';
      // Over the building when its screen point is known (promptAt: fractions of the screen), else at the bottom.
      const at = zone ? stats.promptAt : null;
      prompt.classList.toggle('floating', !!at);
      prompt.classList.toggle('combat-context', !!zone && stats.combatPrompt === true);
      prompt.style.left = at ? `${Math.max(8, Math.min(92, at.x * 100))}%` : '';prompt.style.top = at ? `${Math.max(10, Math.min(92, at.y * 100))}%` : '';
      if (zone) prompt.setAttribute('aria-label', `E · ${promptLabel.textContent}`); else prompt.removeAttribute('aria-label');
      const hint = stats.hint;
      nudge.hidden = !hint;
      if (hint) {
        nudge.textContent = hint.text;
        nudge.style.left = hint.at ? `${Math.max(8, Math.min(92, hint.at.x * 100))}%` : '50%';nudge.style.top = hint.at ? `${Math.max(10, Math.min(92, hint.at.y * 100))}%` : '40%';
      }
      // The island answered (or left): the goals follow (T52, islandShown).
      if (!override && !guide && strip.element.hidden !== (managing || !islandShown())) draw();
      if (idle.step(delta, {moving: (stats.speed ?? 0) > 0.05, blocked: stats.blocked === true || !overlay.classList.contains('exploring') || strip.element.hidden})) {
        const item = strip.current;
        if (item && !item.done && hintsEnabled()) toast({text: `Need a hand? ${item.hint}`, ms: 7000});
      }
    },
  };
}
