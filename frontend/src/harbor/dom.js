// The small DOM parts every Harbor card shares: the card shell (a kit modal), the pick-a-side and
// stake picker (D050), the sign-in line, the "My stakes" list and the sparkline. Strings are always text.
import './harbor.css';
import {createModal} from '../ui/kit/modal.js';
import {formatCoins} from '../lib/coins.js';
import {QUICK_SHARES, clampStake, firstStake, shareStake, stepFor, stepStake} from './stakes.js';
import {MY_STAKES, PLACE, SIGN_IN, SIGN_IN_BUTTON, STAKE} from './words.js';

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
// game already looks for (market-modal, sports-modal) so Escape and focus keep working.
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

// Pick a side, choose an amount, see the win, then confirm (D050). One stray tap never places a stake:
// no side is preselected and the confirm button stays off until one is chosen. The amount starts at
// 10 % of the coins; "−" and "+" move it by 5 % of the coins (stakes.js), the quick buttons jump to
// 10 %, 25 %, 50 % or "All in". Every amount stays inside `range` ({min, max} from stakeRange).
// `sides` is [{id, label}]; `win(stake)` is the one line under the amount ("Win 🪙 500").
// `selection` ({side, stake}) belongs to the caller, so a refresh that redraws the card keeps the picks.
// `itemName` (the asset or match) ends every button's accessible name, so a card with several items
// never has two buttons with the same name ("Up, Bitcoin", "More by 50 coins, Bitcoin").
export function createPicker({name, itemName = '', sides, sideGroup, choose, range, coins, win, confirmText, onConfirm,
  busy = false, selection = {side: null, stake: null}}) {
  const named = text => (itemName ? `${text}, ${itemName}` : text);
  if (!Number.isSafeInteger(selection.stake)) selection.stake = firstStake(coins, range);
  selection.stake = clampStake(selection.stake, range);
  const box = el('div', 'harbor-picker');
  const group = (className, label) => {
    const row = el('div', className);
    row.setAttribute('role', 'group'); row.setAttribute('aria-label', label); return row;
  };
  const sideRow = group('harbor-choices harbor-sides', sideGroup);
  const amountRow = group('harbor-amount', named(STAKE.group));
  const quickRow = group('harbor-choices harbor-quick', named(STAKE.quickGroup));
  const amount = el('output', 'harbor-amount-value');
  amount.setAttribute('aria-live', 'polite');
  const line = el('p', 'harbor-hint harbor-win');
  const labelOf = id => sides.find(option => option.id === id)?.label ?? id;
  const ready = () => sides.some(option => option.id === selection.side);
  const setStake = value => { selection.stake = clampStake(value, range); sync(); };
  const confirm = button(PLACE, () => { if (ready() && !busy) onConfirm(selection.side, selection.stake, labelOf(selection.side)); },
    'kit-button harbor-button harbor-confirm');
  confirm.dataset.key = `${name}:confirm`;
  const sideButtons = sides.map(option => {
    const choice = button(option.label, () => { selection.side = option.id; sync(); }, 'kit-choice harbor-choice');
    choice.dataset.side = option.id; choice.dataset.key = `${name}:side:${option.id}`;
    choice.setAttribute('aria-label', named(option.label)); return choice;
  });
  const stepButton = direction => {
    const choice = button(direction < 0 ? STAKE.less : STAKE.more,
      () => setStake(stepStake(selection.stake, direction, coins, range)), 'kit-choice harbor-choice harbor-step');
    choice.dataset.step = direction < 0 ? 'less' : 'more'; choice.dataset.key = `${name}:${choice.dataset.step}`;
    return choice;
  };
  const less = stepButton(-1), more = stepButton(1);
  const quickButtons = QUICK_SHARES.map(percent => {
    const choice = button(STAKE.quick(percent), () => setStake(shareStake(percent, coins, range)), 'kit-choice harbor-choice harbor-share');
    choice.dataset.share = String(percent); choice.dataset.key = `${name}:share:${percent}`;
    choice.setAttribute('aria-label', named(STAKE.quick(percent))); return choice;
  });
  function sync() {
    const stake = selection.stake, step = stepFor(coins);
    sideButtons.forEach((choice, index) => choice.setAttribute('aria-pressed', String(sides[index].id === selection.side)));
    quickButtons.forEach((choice, index) => choice.setAttribute('aria-pressed', String(shareStake(QUICK_SHARES[index], coins, range) === stake)));
    amount.textContent = formatCoins(stake); amount.dataset.stake = String(stake);
    less.setAttribute('aria-label', named(STAKE.lessLabel(step))); more.setAttribute('aria-label', named(STAKE.moreLabel(step)));
    line.textContent = win(stake);
    confirm.textContent = ready() ? confirmText(stake, labelOf(selection.side)) : choose;
    confirm.setAttribute('aria-label', named(confirm.textContent));
    confirm.disabled = !ready() || busy;
    for (const choice of [...sideButtons, ...quickButtons]) choice.disabled = busy;
    // At a limit the button stays focusable (aria-disabled), so keyboard focus never drops to the page.
    less.disabled = more.disabled = busy;
    less.setAttribute('aria-disabled', String(stake <= range.min)); more.setAttribute('aria-disabled', String(stake >= range.max));
  }
  sideRow.append(...sideButtons); amountRow.append(less, amount, more); quickRow.append(...quickButtons);
  box.append(sideRow, amountRow, quickRow, line, confirm);
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
