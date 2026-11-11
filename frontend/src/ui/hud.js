// The play HUD keeps three things (docs/PITCH.md): 🪙 coins top-left, the quest strip top-right and one
// Menu button. Everything else appears only when it matters: the place name as a 2-second arrival
// banner, the E prompt next to a hotspot, toasts (src/ui/toasts.js) and a hint after 20 s standing still.
// Controls help, the sea chart and the place · weather · time line moved into the pause menu.
import {node} from './kit/dom.js';
import {places} from '../world/places/registry.js';
import {settings} from '../config.js';
import {getWeather} from '../world/weather.js';
import {on as defaultOn} from '../core/events.js';
import {getPreferences} from '../settings/preferences.js';
import {addMenuExtras, addMenuStatus} from '../shell/menu-extras.js';
import {createQuestStrip} from './quest-strip.js';
import {QUEST_EVENTS, PLACE_ARRIVED} from './quest-events.js';
import {FIRST_QUESTS, applyQuestEvent, createIdleHint, firstQuestView, readFirstQuests, writeFirstQuests} from './first-quests.js';
import {showToast} from './toasts.js';
import {coinsSpoken, formatCoins} from '../lib/coins.js';
import './hud.css';

export const ARRIVAL_MS = 2000;
const names = Object.fromEntries(Object.values(places).flatMap(p => p.zones.map(z => [z.id, z.name])));
const local = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export const weatherLabel = weather => weather.rain > 0.5 ? 'Rain at sea' : weather.fog > 0.7 ? 'Sea mist' : weather.cloudCover > 0.6 ? 'Overcast' : 'Fair skies';

export function createHud(container, actions, {on = defaultOn, storage = local(), toast = showToast, hintsEnabled = () => getPreferences().hintsEnabled !== false} = {}) {
  let disposed = false, place = 'saltreach_harbor', override = null, coins = null, account = 'none', lastFrame = 0;
  // Where the balance comes from: the wallet (view.captain.coins) or, with the islands on, the island API
  // through setCoins(). The island's own count wins once chosen, so the wallet never overwrites it.
  let coinSource = 'wallet';
  const overlay = node('div', 'hud hud-play');
  // 1. Coins.
  const purse = node('div', 'hud-coins'), purseText = node('span', 'hud-coins-value');
  purse.dataset.hudGroup = 'coins';purse.setAttribute('role', 'status');purse.append(purseText);
  // The captain's level (TOWER-DEFENSE.md §10) next to the coins, once the island tells it: "⚔ 2".
  const captainBadge = node('span', 'hud-captain');captainBadge.hidden = true;purse.append(captainBadge);
  // 2. Menu, and 3. the quest strip under it.
  const right = node('div', 'hud-right'), menu = node('button', 'hud-menu');
  menu.type = 'button';menu.dataset.hudGroup = 'menu';menu.setAttribute('aria-haspopup', 'dialog');
  const bars = node('span', 'hud-menu-icon');bars.setAttribute('aria-hidden', 'true');menu.append(bars, document.createTextNode('Menu'));
  menu.addEventListener('click', () => (actions.menu ?? actions.settings)?.());
  right.append(menu);
  const strip = createQuestStrip({parent: right, focusGame: () => actions.focus?.()});
  // Contextual: arrival banner (and a screen-reader place status), the E prompt.
  const banner = node('div', 'hud-arrival'), bannerEyebrow = node('span', '', 'You have arrived'), bannerName = node('strong');
  banner.hidden = true;banner.setAttribute('aria-hidden', 'true');banner.append(bannerEyebrow, bannerName);
  const chapter = node('p', 'chapter');chapter.classList.add('kit-sr-only');chapter.setAttribute('role', 'status');chapter.setAttribute('aria-atomic', 'true');
  const prompt = node('div', 'interact'), promptLabel = node('strong');
  prompt.setAttribute('role', 'status');prompt.hidden = true;prompt.append(node('kbd', '', 'E'), promptLabel);
  overlay.append(purse, right, banner, chapter, prompt);
  container.append(overlay);

  function drawCoins() {
    const known = Number.isFinite(coins);
    purseText.textContent = known ? formatCoins(coins) : '🪙 …';
    purse.setAttribute('aria-label', known ? coinsSpoken(coins) : 'Coins not loaded yet');
  }
  drawCoins();

  // ---- quests: the first 3 minutes unless a part of the game (the class demo) shows its own ----
  let first = readFirstQuests(storage);
  const idle = createIdleHint();
  const draw = () => strip.render(override ?? firstQuestView(first));
  function progress(event) {
    const result = applyQuestEvent(first, event);
    if (!result.changed || disposed) return;
    first = result.state;writeFirstQuests(storage, first);idle.progress();
    if (override) return;
    draw();
    toast({text: first.done >= FIRST_QUESTS.length ? 'All goals done!' : `Goal done: ${result.completed.label}`, tone: 'success'});
  }
  const stops = Object.values(QUEST_EVENTS).map(type => on(type, progress));
  // The world's own arrival event counts as place_arrived too.
  stops.push(on('arrived', event => progress({type: PLACE_ARRIVED, id: event.place})));
  draw();

  // ---- what moved into the pause menu ----
  const clock = () => { const hour = Math.floor(settings.hour), minute = Math.floor((settings.hour % 1) * 60); return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; };
  stops.push(addMenuStatus(() => `${places[place]?.name ?? ''} · ${weatherLabel(getWeather())} · ${clock()}`));
  stops.push(addMenuExtras(() => [
    actions.chart && {label: 'Sea chart', onSelect: () => actions.chart()},
    actions.controls && {label: 'Controls', onSelect: () => actions.controls()},
  ].filter(Boolean)));

  let bannerTimer = 0;
  function showBanner(text) {
    clearTimeout(bannerTimer);bannerName.textContent = text;banner.hidden = false;
    bannerTimer = setTimeout(() => { banner.hidden = true; }, ARRIVAL_MS);
  }
  function arrive(id) {
    place = id;const name = places[id]?.name ?? '';chapter.textContent = name;
    if (overlay.classList.contains('exploring')) showBanner(name);
  }
  arrive(place);

  return {
    get quickPanelsOpen() { return false; },
    setCaptain(view) {
      const value = view?.captain?.coins;
      if (coinSource === 'wallet' && Number.isFinite(value)) { coins = value; drawCoins(); }
      const state = view?.account?.state ?? 'none';
      if (state === 'expired' && account !== 'expired') toast({text: 'Your sign-in ran out.', next: 'Sign in again from Menu › Settings to keep playing online.', tone: 'error'});
      account = state;
    },
    setCoins(value) { if (Number.isFinite(value)) { coins = Math.round(value); drawCoins(); } },
    setCaptainLevel(level) {
      const known = Number.isSafeInteger(level) && level > 0;
      captainBadge.hidden = !known;captainBadge.textContent = known ? `⚔ ${level}` : '';
      if (known) captainBadge.setAttribute('aria-label', `Captain level ${level}`); else captainBadge.removeAttribute('aria-label');
    },
    // 'island' (the island API sends setCoins) or 'wallet' (the default).
    setCoinSource(source) { coinSource = source === 'island' ? 'island' : 'wallet'; },
    get coins() { return coins; },
    // A part of the game with its own goals (the class demo) passes its view; null gives the strip back.
    setQuests(view) { override = view ?? null; draw(); },
    get quests() { return {...first, view: override ?? firstQuestView(first)}; },
    togglePanel() {}, toggleControls() {},
    closeQuickPanels() { return strip.closeHint(); },
    start() {
      overlay.classList.add('exploring');actions.start();
      showBanner(places[place]?.name ?? '');
      actions.focus();
    },
    dispose() { if (disposed) return; disposed = true; clearTimeout(bannerTimer); stops.forEach(stop => stop()); strip.dispose(); overlay.remove(); },
    arrive,
    message(text, options = {}) { toast({text, ...options}); },
    notify() { /* The E prompt already names the hotspot; no extra toast. */ },
    update(zone, stats = {}) {
      const now = performance.now(), delta = lastFrame ? Math.min(250, now - lastFrame) : 0;lastFrame = now;
      overlay.classList.toggle('night', stats.night > 0.4);
      prompt.hidden = !zone;prompt.dataset.zone = zone || '';
      if (zone) promptLabel.textContent = stats.interactionLabel ?? names[zone] ?? '';
      if (idle.step(delta, {moving: (stats.speed ?? 0) > 0.05, blocked: stats.blocked === true || !overlay.classList.contains('exploring')})) {
        const item = strip.current;
        if (item && !item.done && hintsEnabled()) toast({text: `Need a hand? ${item.hint}`, ms: 7000});
      }
    },
  };
}
