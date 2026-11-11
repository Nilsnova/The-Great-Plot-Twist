// The small DOM parts every Harbor card shares: the card shell (a kit modal), the pick-a-side and
// stake picker, the sign-in line, the "My stakes" list and the sparkline. Strings are always text.
import './harbor.css';
import {createModal} from '../ui/kit/modal.js';
import {formatCoins} from '../lib/coins.js';
import {MY_STAKES, SIGN_IN, SIGN_IN_BUTTON} from './words.js';

let ids = 0;
export const uid = prefix => `harbor-${prefix}-${++ids}`;
export function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}
export function button(label, onClick, className = 'kit-button harbor-button') {
  const element = el('button', className, label);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

// One card: a native modal dialog with a heading, a status line and a body. `marker` is the class the
// game already looks for (market-modal, sports-modal, desk-modal) so Escape and focus keep working.
export function createCard({title, kind, marker, onClose, resetInput, focusGame}) {
  const body = el('div', 'harbor-card-body');
  const status = el('p', 'harbor-status');
  status.setAttribute('role', 'status');
  const main = el('div', 'harbor-card-main');
  body.append(status, main);
  const modal = createModal({title, body, onClose: reason => { onClose?.(reason); if (reason !== 'dispose') focusGame?.(); }});
  modal.element.classList.add('harbor-card', `harbor-${kind}`, ...(marker ? [marker] : []));
  const stopKey = event => event.stopPropagation();
  for (const type of ['keydown', 'keyup']) modal.element.addEventListener(type, stopKey);
  return {element: modal.element, main,
    get active() { return modal.element.open; },
    say(text, tone = 'info', actions = []) {
      status.dataset.tone = tone;
      status.replaceChildren(...(text ? [el('span', 'harbor-status-text', text)] : []), ...actions);
      status.hidden = !text && !actions.length;
    },
    open(container) { resetInput?.(); modal.open(container ?? document.body); },
    close: () => modal.close(),
    dispose() { for (const type of ['keydown', 'keyup']) modal.element.removeEventListener(type, stopKey); modal.dispose(); },
  };
}

export function signInLine(onSignIn) {
  const box = el('p', 'harbor-sign-in', SIGN_IN);
  if (typeof onSignIn === 'function') box.append(' ', button(SIGN_IN_BUTTON, () => onSignIn(), 'kit-button kit-quiet harbor-button'));
  return box;
}

// Pick a side, pick 5 / 10 / 25, see the promise, then confirm. Nothing is preselected, so one stray tap
// never places a stake. `sides` is [{id, label}]; `hint(side, stake)` says what a win would bring.
// `selection` ({side, stake}) belongs to the caller, so a refresh that redraws the card keeps the picks.
export function createPicker({name, sides, stakes, sideGroup, stakeGroup, choose, hint, confirmText, onConfirm,
  busy = false, selection = {side: null, stake: null}}) {
  const box = el('div', 'harbor-picker');
  const sideRow = el('div', 'harbor-choices harbor-sides'), stakeRow = el('div', 'harbor-choices harbor-stakes');
  sideRow.setAttribute('role', 'group'); sideRow.setAttribute('aria-label', sideGroup);
  stakeRow.setAttribute('role', 'group'); stakeRow.setAttribute('aria-label', stakeGroup);
  const line = el('p', 'harbor-hint', choose);
  const labelOf = id => sides.find(option => option.id === id)?.label ?? id;
  const ready = () => sides.some(option => option.id === selection.side) && stakes.includes(selection.stake);
  const confirm = button(choose, () => { if (ready() && !busy) onConfirm(selection.side, selection.stake, labelOf(selection.side)); },
    'kit-button harbor-button harbor-confirm');
  confirm.dataset.key = `${name}:confirm`;
  const sideButtons = sides.map(option => {
    const choice = button(option.label, () => { selection.side = option.id; sync(); }, 'kit-choice harbor-choice');
    choice.dataset.side = option.id; choice.dataset.key = `${name}:side:${option.id}`; return choice;
  });
  const stakeButtons = stakes.map(amount => {
    const choice = button(formatCoins(amount), () => { selection.stake = amount; sync(); }, 'kit-choice harbor-choice harbor-stake');
    choice.dataset.stake = String(amount); choice.dataset.key = `${name}:stake:${amount}`;
    choice.setAttribute('aria-label', `${amount} coins`); return choice;
  });
  function sync() {
    sideButtons.forEach((choice, index) => choice.setAttribute('aria-pressed', String(sides[index].id === selection.side)));
    stakeButtons.forEach((choice, index) => choice.setAttribute('aria-pressed', String(stakes[index] === selection.stake)));
    const set = ready();
    line.textContent = set ? hint(selection.side, selection.stake) : choose;
    confirm.textContent = set ? confirmText(selection.stake, labelOf(selection.side)) : choose;
    confirm.disabled = !set || busy;
    for (const choice of [...sideButtons, ...stakeButtons]) choice.disabled = busy;
  }
  sideRow.append(...sideButtons); stakeRow.append(...stakeButtons);
  box.append(sideRow, stakeRow, line, confirm);
  sync();
  return box;
}

// Redraws a part of a card without losing the keyboard focus: the control with the same data-key
// gets the focus back (a poll must never move the player's focus).
export function replaceKeepingFocus(parent, ...nodes) {
  const key = parent.contains(document.activeElement) ? document.activeElement?.dataset?.key : null;
  parent.replaceChildren(...nodes);
  if (!key) return;
  const again = [...parent.querySelectorAll('[data-key]')].find(node => node.dataset.key === key);
  (again && !again.disabled ? again : parent.closest('dialog')?.querySelector('button'))?.focus?.({preventScroll: true});
}

// "My stakes": a short list of the newest stakes with their state in words.
export function myStakesList(rows, limit = 5) {
  const section = el('section', 'harbor-own');
  const heading = el('h3', 'harbor-own-title', MY_STAKES.title); heading.id = uid('stakes');
  section.setAttribute('aria-labelledby', heading.id);
  section.append(heading);
  if (!rows.length) { section.append(el('p', 'harbor-quiet', MY_STAKES.none)); return section; }
  const listNode = el('ul', 'harbor-own-list');
  for (const row of rows.slice(0, limit)) listNode.append(el('li', `harbor-own-row harbor-${row.tone ?? 'info'}`, row.text));
  section.append(listNode);
  return section;
}

// A tiny price line. Decorative: the price itself is in the text next to it.
export function sparkline(points, width = 96, height = 28) {
  const values = points.map(point => point.price).filter(Number.isFinite);
  if (values.length < 2) return null;
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('class', 'harbor-spark');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  const line = document.createElementNS(svg.namespaceURI, 'polyline');
  line.setAttribute('points', values.map((value, index) => `${Math.round(index / (values.length - 1) * (width - 4) + 2)},${Math.round(height - 2 - (value - low) / span * (height - 4))}`).join(' '));
  svg.dataset.trend = values.at(-1) > values[0] ? 'up' : values.at(-1) < values[0] ? 'down' : 'flat';
  svg.append(line);
  return svg;
}
