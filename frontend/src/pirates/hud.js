// The wave's words on screen: a slim wave bar (wave N · ships left · ♥ island), the 10-second
// countdown, the "E · Fire" / "E · Repair" prompt next to a cannon or wall, and the end banner.
// DOM only, built with the kit's safe text helpers; the controller decides what to show.
import './pirates.css';
import { node } from '../ui/kit/dom.js';

export const waveBarText = ({ wave, shipsLeft, islandHp, maxIslandHp }) =>
  `Wave ${wave} · ${shipsLeft} ${shipsLeft === 1 ? 'ship' : 'ships'} left · ♥ ${Math.round(islandHp / maxIslandHp * 100)}`;

export function createWaveHud({ container, onAction = () => {}, reducedMotion = () => false }) {
  const layer = node('div', 'pirate-hud');
  const bar = node('div', 'pirate-bar'); bar.setAttribute('role', 'status');
  const label = node('span', 'pirate-bar-text'), meter = node('span', 'pirate-bar-meter'), fill = node('span', 'pirate-bar-fill');
  meter.append(fill); meter.setAttribute('aria-hidden', 'true'); bar.append(label, meter); bar.hidden = true;
  const countdown = node('div', 'pirate-countdown'); countdown.setAttribute('aria-live', 'polite'); countdown.hidden = true;
  const countWords = node('span', 'pirate-countdown-words'), countNumber = node('strong', 'pirate-countdown-number');
  countdown.append(countWords, countNumber);
  const prompt = node('button', 'kit-button pirate-prompt'); prompt.type = 'button'; prompt.hidden = true;
  const key = node('kbd', '', 'E'), action = node('span');
  prompt.append(key, action);
  prompt.addEventListener('click', event => { event.preventDefault(); onAction(); });
  const banner = node('div', 'pirate-banner'); banner.setAttribute('role', 'status'); banner.hidden = true;
  layer.append(bar, countdown, prompt, banner); container.append(layer);
  let lastBar = '', lastCount = '', lastPrompt = '', hurtUntil = 0, hp = null;

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
      if (hp !== null && state.islandHp < hp) hurtUntil = performance.now() + 400;
      hp = state.islandHp;
      bar.classList.toggle('pirate-hurt', performance.now() < hurtUntil);
      if (text === lastBar) return;
      lastBar = text; label.textContent = text;
      const share = Math.max(0, state.islandHp / state.maxIslandHp);
      fill.style.width = `${Math.round(share * 100)}%`;
      fill.dataset.level = share > .5 ? 'good' : share > .25 ? 'low' : 'bad';
    },
    prompt(text, enabled = true) {
      const next = text ? `${text}|${enabled}` : '';
      if (next === lastPrompt) return;
      lastPrompt = next; prompt.hidden = !text; action.textContent = text ?? ''; prompt.disabled = !enabled;
    },
    banner(title, line = '') {
      banner.replaceChildren();
      if (!title) { banner.hidden = true; return; }
      banner.append(node('strong', '', title));
      if (line) banner.append(node('span', '', line));
      banner.hidden = false;
    },
    dispose() { layer.remove(); },
  };
}
