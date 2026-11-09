// The Keeper's Lock screen: the server's question about the sky over your place, big choice buttons
// with simple sky icons, "Change place", the honest messages from the server and the hint path. The
// rules of the screen are in lock-state.js; the calls in lock-api.js (or the rehearsal's fake lock).
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {newActionUid} from '../screens/duels/logic.js';
import {initialLock, lockStep, lockActions, sourceLine, readChosenPlace, writeChosenPlace, isPlace, placeLabel, REWARD_LINE} from './lock-state.js';

const SVG = 'http://www.w3.org/2000/svg';
// [x, y, w, h, colour] rectangles on a 12 by 12 grid. Words are always written beside the icon.
const SUN = [[4, 4, 4, 4, '#f3c74f'], [5, 1, 2, 2, '#f3c74f'], [5, 9, 2, 2, '#f3c74f'], [1, 5, 2, 2, '#f3c74f'], [9, 5, 2, 2, '#f3c74f']];
const CLOUD = [[2, 5, 8, 4, '#d9dfd4'], [4, 3, 4, 2, '#d9dfd4'], [1, 7, 10, 2, '#b9c2b6']];
const ICONS = {
  clear: SUN,
  cloudy: CLOUD,
  rain: [...CLOUD.map(([x, y, w, h, c]) => [x, y - 2, w, h, c]), [3, 9, 1, 2, '#7fb6e6'], [6, 9, 1, 2, '#7fb6e6'], [9, 9, 1, 2, '#7fb6e6']],
  fog: [[1, 3, 10, 1, '#c8cfc4'], [2, 6, 9, 1, '#c8cfc4'], [1, 9, 8, 1, '#c8cfc4']],
  snow: [[5, 1, 2, 10, '#eef4f6'], [1, 5, 10, 2, '#eef4f6'], [2, 2, 2, 2, '#eef4f6'], [8, 2, 2, 2, '#eef4f6'], [2, 8, 2, 2, '#eef4f6'], [8, 8, 2, 2, '#eef4f6']],
};
function skyIcon(id) {
  const shape = ICONS[id];
  if (!shape) return null;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');svg.setAttribute('aria-hidden', 'true');svg.setAttribute('focusable', 'false');
  svg.setAttribute('shape-rendering', 'crispEdges');
  for (const [x, y, w, h, colour] of shape) {
    const rect = document.createElementNS(SVG, 'rect');
    rect.setAttribute('x', x);rect.setAttribute('y', y);rect.setAttribute('width', w);rect.setAttribute('height', h);rect.setAttribute('fill', colour);
    svg.append(rect);
  }
  return svg;
}
const button = (label, onClick, className = 'kit-button', focusKey = label) => {
  const element = node('button', className, label);element.type = 'button';element.dataset.focus = focusKey;element.addEventListener('click', onClick);return element;
};

// lock: {read(place), answer({answer, actionUid, place}), search(text)} -> {ok, status, data, code, ...}
export function createLockScreen({container, lock, storage = safeSession(), onOpened, onClose}) {
  let state = initialLock(), disposed = false, request = 0, searching = false, searchResults = [], searchMessage = '', searchText = '', opener = null;
  let place = readChosenPlace(storage);
  const body = node('div', 'lock-body');
  const modal = createModal({title: "The Keeper's Lock", body, onCancel: close, onClose: () => onClose?.()});
  modal.element.classList.add('lock-modal');

  function set(next) { state = next; render(); }
  async function load() {
    const token = ++request;
    set(lockStep(state, {type: 'load'}));
    const reply = await lock.read(place);
    if (disposed || token !== request) return;
    set(reply.ok ? lockStep(state, {type: 'loaded', view: reply.data}) : lockStep(state, {type: 'load_failed', failure: reply}));
  }
  async function answer(id) {
    const next = lockStep(state, {type: 'answer', answer: id, uid: newActionUid()});
    if (next === state) return;
    set(next);
    const token = ++request, sent = {answer: next.pending, actionUid: next.uid, ...(place ? {place} : {})};
    const reply = await lock.answer(sent);
    if (disposed || token !== request) return;
    const wasOpen = state.opened;
    set(reply.ok ? lockStep(state, {type: 'answered', reply: reply.data}) : lockStep(state, {type: 'answer_failed', failure: reply}));
    if (!wasOpen && state.opened) onOpened?.({match: state.match, message: state.message});
  }
  async function search(text) {
    if (searching || text.trim().length < 2) { searchMessage = 'Type at least two letters.'; render(); return; }
    searching = true;searchMessage = 'Searching…';render();
    const reply = await lock.search(text);
    searching = false;
    if (disposed) return;
    searchResults = reply.ok ? (reply.data?.places ?? []).filter(isPlace).slice(0, 5) : [];
    searchMessage = reply.ok ? (searchResults.length ? reply.data?.attribution ?? '' : 'No place found. Try another spelling.')
      : reply.status === 429 ? (reply.message || 'Too many searches. Wait a moment.') : 'The place search is not available right now.';
    render();
  }
  function choosePlace(next) {
    place = next;writeChosenPlace(storage, next);searchResults = [];searchMessage = '';state = {...state, picking: false};
    void load();
  }

  function render() {
    if (disposed) return;
    const view = state.view, actions = lockActions(state), parts = [];
    if (view) {
      parts.push(node('p', 'lock-question', view.question));
      if (view.note) parts.push(node('p', 'lock-note', view.note));
      if (sourceLine(view)) parts.push(node('p', 'lock-source', sourceLine(view)));
      const placeRow = node('div', 'lock-place');
      placeRow.append(node('span', '', `Your place: ${view.place?.name ?? 'your area'}`));
      if (actions.changePlace) placeRow.append(button('Change place', () => { state = {...state, picking: !state.picking}; render(); if (state.picking) body.querySelector('.lock-search input')?.focus(); }, 'kit-button kit-quiet'));
      if (place && actions.changePlace) placeRow.append(button('Use my area again', () => choosePlace(null), 'kit-button kit-quiet'));
      parts.push(placeRow);
      if (state.picking) parts.push(searchForm());
    }
    const status = node('p', 'lock-status', state.message);
    status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');status.dataset.tone = state.tone;
    if (state.status === 'loading' && !view) status.textContent = 'The lock is waking up…';
    parts.push(status);
    if (actions.choices.length) {
      const grid = node('div', 'lock-choices');grid.setAttribute('role', 'group');grid.setAttribute('aria-label', 'Your answer');
      for (const choice of actions.choices) {
        const control = button('', () => void answer(choice.id), 'lock-choice', `choice-${choice.id}`);
        const icon = skyIcon(choice.id);if (icon) control.append(icon);
        control.append(node('span', '', choice.label));control.dataset.choice = choice.id;
        grid.append(control);
      }
      parts.push(grid);
    } else if (state.status === 'sending' && view) {
      const grid = node('div', 'lock-choices');
      for (const choice of view.choices) { const control = button(choice.label, () => {}, 'lock-choice');control.disabled = true;grid.append(control); }
      parts.push(grid);
    }
    const row = node('div', 'lock-actions');
    if (actions.hint) row.append(button("That's not what I see outside", () => void answer('hint'), 'kit-button kit-quiet'));
    if (actions.confirm) row.append(button(actions.confirm, () => void answer('hint_confirm')));
    if (actions.retry) row.append(button('Try again', () => void load()));
    if (state.opened) parts.push(node('p', 'lock-reward', REWARD_LINE));
    row.append(button(state.opened ? 'Back to the harbor' : 'Close', close, state.opened ? 'kit-button' : 'kit-button kit-quiet'));
    parts.push(row);
    if (view?.attribution) parts.push(node('p', 'lock-attribution', view.attribution));
    const focused = body.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
    body.replaceChildren(...parts);
    if (!modal.element.open) return;
    const again = focused ? [...body.querySelectorAll('[data-focus]')].find(control => control.dataset.focus === focused && !control.disabled) : null;
    if (again) again.focus({preventScroll: true});
    else if (!modal.element.contains(document.activeElement) || document.activeElement === document.body || focused)
      body.querySelector('.lock-choice:not(:disabled),.lock-actions button')?.focus({preventScroll: true});
  }
  function searchForm() {
    const form = node('form', 'lock-search'), label = node('label', '', 'Search for your town'), input = node('input'), list = node('ul'), note = node('p', 'lock-note', searchMessage);
    input.type = 'search';input.autocomplete = 'off';input.maxLength = 60;input.id = 'lock-place-search';label.htmlFor = input.id;
    input.value = searchText;input.dataset.focus = 'search';input.addEventListener('input', () => { searchText = input.value; });
    note.setAttribute('role', 'status');
    for (const result of searchResults) {
      const li = node('li');li.append(button(placeLabel(result), () => choosePlace(result), 'kit-button kit-quiet'));list.append(li);
    }
    const go = button('Search', () => {});go.type = 'submit';
    form.addEventListener('submit', event => { event.preventDefault(); void search(input.value); });
    form.append(label, input, go, note, list);
    return form;
  }
  function close() { if (!modal.element.open) return; request++; modal.close('close'); opener?.focus?.({preventScroll: true}); }

  return {
    open() { if (disposed) return; opener = null; render(); modal.open(container, body.querySelector('button')); void load(); },
    close,
    get active() { return modal.element.open; },
    get state() { return state; },
    dispose() { disposed = true; request++; modal.dispose(); },
  };
}
function safeSession() { try { return globalThis.sessionStorage ?? null; } catch { return null; } }
