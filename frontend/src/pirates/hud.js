// The wave's words on screen: a slim wave bar at the top (wave N · ships left · ♥ island · loot this run),
// the musket button (bottom right: hold it or F to keep firing, its frame fills while it reloads), the
// 10-second countdown, the boss warning, the "E · Fire" / "E · Repair" prompt next to a cannon or wall,
// the end banner and the break between waves (a compact card: "Next wave", Pause and the "Auto next wave" switch).
// Captain health (GAME-V3.md §3): your hp under the wave bar, the slim "You have fallen" strip with its timer
// (inside the bar, so the fight stays in view),
// a timer over every fallen captain, and the prompt held down (E or a finger) to help a teammate up.
// DOM only, built with the kit's safe text helpers; the controller decides what to show.
import './pirates.css';
import { node } from '../ui/kit/dom.js';

// Boarders on land (TOWER-DEFENSE.md §12) show between the ships and the heart while there are any.
export const waveBarText = ({ wave, shipsLeft, islandHp, maxIslandHp, boardersLeft = 0 }) =>
  `Wave ${wave} · ${shipsLeft} ${shipsLeft === 1 ? 'ship' : 'ships'} left${boardersLeft > 0 ? ` · ${boardersLeft} ashore` : ''} · ♥ ${Math.round(islandHp / maxIslandHp * 100)}`;

export const runLootText = loot => `Loot this run: 🪙 ${Math.max(0, Math.round(loot) || 0)}`;

// The button: "Cutlass" with a boarder within strike reach (§12), else the equipped weapon's name (§15),
// or that no pirate is in range.
export const musketText = (ready, blade = false, name = 'Musket') => (blade ? 'Cutlass' : ready ? name : 'No pirate in range');

// Your captain's hp under the wave bar, and the timer over a fallen captain (seconds as m:ss).
export const healthText = ({ hp, maxHp }) => `Captain ${Math.max(0, Math.ceil(hp))} / ${maxHp}`;
export const clockText = seconds => { const s = Math.max(0, Math.floor(seconds) || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const DOWN_TITLE = 'You have fallen';
export const downLine = alone => (alone ? 'every captain is down' : 'a teammate can hold E next to you');

export function createWaveHud({ container, onAction = () => {}, onNext = () => {}, onAuto = () => {}, onShoot = () => {}, onHold = () => {},
  onPromptHold = () => {}, reducedMotion = () => false }) {
  const layer = node('div', 'pirate-hud');
  const bar = node('div', 'pirate-bar'); bar.setAttribute('role', 'status');
  const label = node('span', 'pirate-bar-text'), meter = node('span', 'pirate-bar-meter'), fill = node('span', 'pirate-bar-fill');
  meter.append(fill); meter.setAttribute('aria-hidden', 'true'); bar.append(label, meter); bar.hidden = true;
  const countdown = node('div', 'pirate-countdown'); countdown.setAttribute('aria-live', 'polite'); countdown.hidden = true;
  const countWords = node('span', 'pirate-countdown-words'), countNumber = node('strong', 'pirate-countdown-number');
  countdown.append(countWords, countNumber);
  const prompt = node('button', 'kit-button pirate-prompt'); prompt.type = 'button'; prompt.hidden = true;
  const key = node('kbd', '', 'E'), action = node('span');
  // A hold (helping a fallen teammate up): the bar fills while the prompt is held down.
  const promptMeter = node('span', 'pirate-prompt-meter'), promptFill = node('span', 'pirate-prompt-fill');
  promptMeter.append(promptFill); promptMeter.setAttribute('aria-hidden', 'true'); promptMeter.hidden = true;
  prompt.append(key, action, promptMeter);
  prompt.addEventListener('click', event => { event.preventDefault(); onAction(); });
  const letPromptGo = () => onPromptHold(false);
  prompt.addEventListener('pointerdown', event => { if (!promptMeter.hidden) { event.preventDefault(); try { prompt.setPointerCapture(event.pointerId); } catch { /* old browsers */ } onPromptHold(true); } });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) prompt.addEventListener(type, letPromptGo);
  prompt.addEventListener('keydown', event => { if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat && !promptMeter.hidden) { event.preventDefault(); onPromptHold(true); } });
  prompt.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') letPromptGo(); });
  prompt.addEventListener('contextmenu', event => { if (!promptMeter.hidden) event.preventDefault(); });
  // Your hp under the wave bar (role=status with the bar), the strip while you are down, the timers.
  const health = node('span', 'pirate-health'), healthLabel = node('span', 'pirate-health-text'), healthMeter = node('span', 'pirate-health-meter');
  const healthFill = node('span', 'pirate-health-fill'); healthMeter.append(healthFill); healthMeter.setAttribute('aria-hidden', 'true');
  health.append(healthLabel, healthMeter); health.hidden = true;
  // While you are down: one slim line under the wave's numbers, "You have fallen · a teammate can hold E
  // next to you · 0:12", inside the bar (its role=status reads it once; the ticking clock is not read out).
  const down = node('div', 'pirate-down'); down.hidden = true;
  const downTitle = node('strong', 'pirate-down-title', DOWN_TITLE), downLineEl = node('span', 'pirate-down-line'), downClock = node('span', 'pirate-down-clock');
  downClock.setAttribute('aria-hidden', 'true');
  down.append(downTitle, downLineEl, downClock);
  const marks = node('div', 'pirate-marks'); marks.setAttribute('aria-hidden', 'true');
  const markPool = new Map();
  const banner = node('div', 'pirate-banner'); banner.setAttribute('role', 'status'); banner.hidden = true;
  const loot = node('span', 'pirate-bar-loot'); loot.hidden = true;
  const extra = node('span', 'pirate-bar-extra'); bar.append(extra, down); extra.append(health, loot);
  // v3 waves: the wave's event under the wave's numbers (wave-events.js): its title and line while the wave
  // starts, then the title alone as a small chip for the rest of the wave.
  const event = node('div', 'pirate-event'); event.hidden = true;
  const eventIcon = node('span', 'pirate-event-icon'), eventTitle = node('strong', 'pirate-event-title'), eventLine = node('span', 'pirate-event-line');
  eventIcon.setAttribute('aria-hidden', 'true'); event.append(eventIcon, eventTitle, eventLine); bar.append(event);
  // The captain's musket (§10): a big button, held to keep firing at the nearest ship in range (or F).
  const musket = node('button', 'kit-button pirate-musket'); musket.type = 'button'; musket.hidden = true;
  const musketLabel = node('span', 'pirate-musket-label', musketText(true)), musketMeter = node('span', 'pirate-musket-meter');
  const musketFill = node('span', 'pirate-musket-fill'); musketMeter.append(musketFill); musketMeter.setAttribute('aria-hidden', 'true');
  musket.append(node('kbd', 'pirate-musket-key', 'F'), musketLabel, musketMeter);
  musket.setAttribute('aria-label', 'Fire your musket (F)');
  const release = () => onShoot(false);
  musket.addEventListener('pointerdown', event => { event.preventDefault(); try { musket.setPointerCapture(event.pointerId); } catch { /* old browsers */ } onShoot(true); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) musket.addEventListener(type, release);
  musket.addEventListener('click', event => { event.preventDefault(); if (event.detail === 0) { onShoot(true); onShoot(false); } }); // keyboard Enter or Space
  const warning = node('div', 'pirate-boss'); warning.setAttribute('role', 'alert'); warning.hidden = true;
  // The break between two won waves: seconds left, the big button and the switch (kept by the controller).
  const pause = node('div', 'pirate-break'); pause.hidden = true;
  const pauseTitle = node('strong', 'pirate-break-title'), pauseLine = node('span', 'pirate-break-line');
  const next = node('button', 'kit-button pirate-next'); next.type = 'button';
  next.addEventListener('click', event => { event.preventDefault(); if (!next.disabled) onNext(); });
  const autoLabel = node('label', 'pirate-auto'), auto = document.createElement('input');
  auto.type = 'checkbox'; auto.addEventListener('change', () => onAuto(auto.checked));
  autoLabel.append(auto, node('span', '', 'Auto next wave'));
  // × closes the card (owner, 11 Nov: "need to be able to close it"); a slim "Next wave" button stays
  // under the wave bar until the break ends, so building between waves has the whole screen.
  const close = node('button', 'pirate-break-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
  const mini = node('button', 'kit-button pirate-next-mini'); mini.type = 'button'; mini.hidden = true;
  mini.addEventListener('click', event => { event.preventDefault(); if (!mini.disabled) onNext(); });
  let pauseClosed = false;
  close.addEventListener('click', event => { event.preventDefault(); pauseClosed = true; lastPause = ''; document.documentElement.style.removeProperty('--pirate-break-bottom'); });
  // The game's room-wide Pause (GAME-V3.md §2): the host (or anyone when the host is away) holds the break.
  const hold = node('button', 'kit-button kit-quiet pirate-hold'); hold.type = 'button'; hold.hidden = true;
  hold.addEventListener('click', event => { event.preventDefault(); if (!hold.disabled) onHold(); });
  // A compact card (owner, 12 Nov): the title and loot line beside the × (its own corner, never over the
  // title), Next wave and Pause side by side, the Auto switch as a small line below. pirates.css places it
  // under the Menu on a wide screen (the goals' slot, empty during a wave) and under the wave bar on a phone.
  const pauseHead = node('div', 'pirate-break-head'), pauseText = node('div', 'pirate-break-text'), pauseActions = node('div', 'pirate-break-actions');
  pauseText.append(pauseTitle, pauseLine); pauseHead.append(pauseText, close); pauseActions.append(next, hold);
  pause.append(pauseHead, pauseActions, autoLabel);
  // The island takes damage: a short red flash on the screen's edge (not with reduced motion).
  const edge = node('div', 'pirate-hurt-edge'); edge.setAttribute('aria-hidden', 'true');
  layer.append(edge, marks, bar, countdown, warning, prompt, musket, banner, pause, mini); container.append(layer);
  let lastBar = '', lastCount = '', lastPrompt = '', lastLoot = '', lastPause = '', lastMusket = '', hurtUntil = 0, hp = null;
  let lastHealth = '', lastDown = '', ownHp = null, lastEvent = '';

  return {
    element: layer,
    setVisible(value) { layer.hidden = !value; },
    countdown(seconds, words = 'Pirates in') {
      const text = seconds > 0 ? String(seconds) : '';
      countdown.hidden = !text;
      if (text === lastCount) return;
      lastCount = text; countWords.textContent = words; countNumber.textContent = text;
      countdown.classList.toggle('pirate-pop', !reducedMotion());
      void countdown.offsetWidth; // restart the pop for every new number
    },
    bar(state) {
      if (!state) { bar.hidden = true; return; }
      const text = waveBarText(state);
      bar.hidden = false;
      if (hp !== null && state.islandHp < hp) {
        hurtUntil = performance.now() + 400;
        if (!reducedMotion()) { edge.classList.remove('pirate-flash'); void edge.offsetWidth; edge.classList.add('pirate-flash'); }
      }
      hp = state.islandHp;
      bar.classList.toggle('pirate-hurt', performance.now() < hurtUntil);
      if (text === lastBar) return;
      lastBar = text; label.textContent = text;
      const share = Math.max(0, state.islandHp / state.maxIslandHp);
      fill.style.width = `${Math.round(share * 100)}%`;
      fill.dataset.level = share > .5 ? 'good' : share > .25 ? 'low' : 'bad';
    },
    // progress (0..1, or null): a prompt held down to fill (helping a teammate up); null is a plain press.
    prompt(text, enabled = true, progress = null) {
      const held = Number.isFinite(progress);
      const next = text ? `${text}|${enabled}|${held ? Math.round(progress * 20) : '-'}` : '';
      if (next === lastPrompt) return;
      if (!text || !held) letPromptGo();
      lastPrompt = next; prompt.hidden = !text; action.textContent = text ?? ''; prompt.disabled = !enabled;
      promptMeter.hidden = !held; prompt.classList.toggle('pirate-prompt-hold', held);
      if (held) promptFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    },
    // Your captain's hp ({hp, maxHp, down}) under the wave bar; null hides it. A hit flashes it.
    health(info) {
      if (!info) { if (!health.hidden) { health.hidden = true; lastHealth = ''; ownHp = null; } return; }
      const text = info.down ? 'Captain down' : healthText(info), share = Math.max(0, Math.min(1, info.hp / (info.maxHp || 1)));
      health.hidden = false;
      if (ownHp !== null && info.hp < ownHp && !reducedMotion()) { health.classList.remove('pirate-flash'); void health.offsetWidth; health.classList.add('pirate-flash'); }
      ownHp = info.hp;
      if (text === lastHealth) return;
      lastHealth = text; healthLabel.textContent = text;
      healthFill.style.width = `${Math.round(share * 100)}%`;
      healthFill.dataset.level = share > .5 ? 'good' : share > .25 ? 'low' : 'bad';
    },
    // While you are down: {seconds, alone}; null hides the strip.
    down(info) {
      const key = info ? `${info.alone === true}|${clockText(info.seconds)}` : '';
      if (key === lastDown) return;
      lastDown = key; down.hidden = !info;
      if (!info) return;
      downLineEl.textContent = downLine(info.alone === true); downClock.textContent = clockText(info.seconds);
    },
    // A timer over every fallen captain: [{id, x, y, seconds, mine}] in px of the container.
    marks(list = []) {
      const seen = new Set();
      for (const item of list) {
        seen.add(item.id);
        let mark = markPool.get(item.id);
        if (!mark) { mark = node('span', 'pirate-mark'); markPool.set(item.id, mark); marks.append(mark); }
        mark.classList.toggle('is-mine', item.mine === true);
        const text = `⏱ ${clockText(item.seconds)}`;
        if (mark.textContent !== text) mark.textContent = text;
        mark.style.left = `${Math.round(item.x)}px`; mark.style.top = `${Math.round(item.y)}px`;
      }
      for (const [id, mark] of markPool) if (!seen.has(id)) { mark.remove(); markPool.delete(id); }
    },
    // The gun button: {share: reload 0..1, ready: a ship or boarder is in range, blade: a boarder within
    // cutlass reach (the button then swings the cutlass), label: the equipped weapon's name} while the
    // wave runs, null hides it.
    musket(info) {
      if (!info) { if (!musket.hidden) { musket.hidden = true; lastMusket = ''; release(); } return; }
      musket.hidden = false;
      const name = typeof info.label === 'string' && info.label ? info.label : 'Musket', blade = info.blade === true;
      const share = Math.max(0, Math.min(1, Number(info.share) || 0)), key = `${info.ready === true}|${blade}|${Math.round(share * 20)}|${name}`;
      if (key === lastMusket) return;
      lastMusket = key; musketLabel.textContent = musketText(info.ready === true, blade, name);
      musket.classList.toggle('pirate-musket-blade', blade);
      musket.setAttribute('aria-label', blade ? 'Strike with your cutlass (F)' : `Fire your ${name.toLowerCase()} (F)`);
      musket.classList.toggle('pirate-musket-idle', info.ready !== true);
      musketFill.style.width = `${Math.round(share * 100)}%`;
    },
    // Loot this run, under the bar; null hides it.
    loot(amount) {
      const text = amount === null || amount === undefined ? '' : runLootText(amount);
      if (text === lastLoot) return;
      lastLoot = text; loot.hidden = !text; loot.textContent = text;
    },
    boss(text) { warning.hidden = !text; warning.textContent = text || ''; },
    // The wave's event: {id, icon, title, line, open} (open: the line shows too) or null to hide it.
    event(info) {
      const key = info ? `${info.id}|${info.open === true}` : '';
      if (key === lastEvent) return;
      lastEvent = key; event.hidden = !info;
      if (!info) return;
      event.dataset.event = info.id; event.classList.toggle('is-open', info.open === true);
      eventIcon.textContent = info.icon ?? ''; eventTitle.textContent = info.title; eventLine.textContent = info.open ? info.line : '';
      eventLine.hidden = !info.open;
    },
    // The break: {title, line, seconds, auto, ready, paused, hold: {label, enabled} | null} or null to hide it.
    pause(info) {
      if (!info) { pause.hidden = true; mini.hidden = true; pauseClosed = false; lastPause = ''; document.documentElement.style.removeProperty('--pirate-break-bottom'); return; }
      const key = `${info.title}|${info.line}|${info.seconds}|${info.auto}|${info.ready}|${info.paused}|${info.hold?.label}|${info.hold?.enabled}|${pauseClosed}`;
      pause.hidden = pauseClosed; mini.hidden = !pauseClosed;
      if (key === lastPause) return;
      lastPause = key; pauseTitle.textContent = info.title; pauseLine.textContent = info.line ?? '';
      next.textContent = info.paused ? 'Paused' : info.ready ? (info.seconds > 0 ? `Next wave · ${info.seconds}` : 'Next wave') : 'Counting the loot…';
      next.disabled = !info.ready; auto.checked = info.auto === true;
      hold.hidden = !info.hold; hold.textContent = info.hold?.label ?? ''; hold.disabled = info.hold?.enabled !== true;
      pause.classList.toggle('is-paused', info.paused === true);
      mini.textContent = next.textContent; mini.disabled = next.disabled;
      if (pauseClosed) return;
      if (info.ready && document.activeElement === document.body) next.focus({ preventScroll: true });
      // Phones put the toasts below the break (pirates.css): tell them where it ends.
      const bottom = pause.getBoundingClientRect().bottom;
      if (bottom > 0) document.documentElement.style.setProperty('--pirate-break-bottom', `${Math.ceil(bottom) + 10}px`);
    },
    banner(title, line = '') {
      banner.replaceChildren();
      if (!title) { banner.hidden = true; return; }
      banner.append(node('strong', '', title));
      if (line) banner.append(node('span', '', line));
      banner.hidden = false;
    },
    dispose() { release(); letPromptGo(); layer.remove(); markPool.clear(); document.documentElement.style.removeProperty('--pirate-break-bottom'); },
  };
}
