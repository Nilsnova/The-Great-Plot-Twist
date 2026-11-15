// D054, Start fresh: a danger button for Settings › Account and its type-to-confirm dialog. Your own island,
// coins and progress go back to the start (POST /api/island/reset, api.js resetIsland). It decides no rule: the
// server checks the player, the confirm word and that no wave runs.
//   const fresh = createIslandReset({reset: () => api.resetIsland(), onDone: island => ...});
//   fresh.element                 the "Start fresh" button (index.js offers it through shell/account-extras.js)
//   fresh.open() / fresh.close()  the dialog; fresh.dispose()
// reset() answers {ok, data} or {ok: false, message} (api.js); onDone(data, {play}) runs after a reset went through.
import './island-reset.css';
import {node, uniqueId} from '../ui/kit/dom.js';
import {createModal} from '../ui/kit/modal.js';

export const CONFIRM_WORD = 'RESET';
export const RESET_LINE = 'Your island, coins and progress go back to the start.';
// Typed on a phone it may come capitalised or with a space; the word itself must match.
export const confirmed = text => String(text ?? '').trim().toUpperCase() === CONFIRM_WORD;

export function createIslandReset({reset, onDone = () => {}, parent = () => document.body} = {}) {
  let modal = null, parts = null, busy = false, disposed = false, play = null;
  const element = node('button', 'kit-button island-reset-open');
  element.type = 'button'; element.dataset.focus = 'island-reset';
  const mark = node('span', 'island-reset-mark', '⚠'); mark.setAttribute('aria-hidden', 'true');
  element.append(mark, document.createTextNode('Start fresh'));
  element.addEventListener('click', () => open());

  function build() {
    const body = node('div', 'island-reset');
    const warning = node('div', 'island-reset-warning', '⚠'); warning.setAttribute('aria-hidden', 'true');
    const line = node('p', 'island-reset-line', RESET_LINE); line.id = uniqueId('island-reset');
    const label = node('label', 'island-reset-type'), input = node('input', 'island-reset-input');
    input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 12; input.placeholder = CONFIRM_WORD;
    input.setAttribute('autocapitalize', 'characters'); input.id = uniqueId('island-reset-word');
    label.htmlFor = input.id; label.append(node('span', 'island-reset-hint', `Type ${CONFIRM_WORD} to confirm`));
    const error = node('p', 'island-reset-error'); error.setAttribute('role', 'alert'); error.hidden = true;
    const keep = node('button', 'kit-button kit-quiet island-reset-keep', 'Keep my island'); keep.type = 'button';
    const go = node('button', 'kit-button island-reset-go', 'Start fresh'); go.type = 'button'; go.disabled = true;
    go.setAttribute('aria-describedby', line.id);
    const actions = node('div', 'island-reset-actions'); actions.append(keep, go);
    body.append(warning, line, label, input, error, actions);
    const sync = () => { go.disabled = busy || !confirmed(input.value); };
    input.addEventListener('input', () => { error.hidden = true; sync(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !go.disabled) { event.preventDefault(); void confirm(); } });
    keep.addEventListener('click', () => close());
    go.addEventListener('click', () => void confirm());
    return {body, input, go, keep, error, sync};
  }
  function open() {
    if (disposed || modal) return;
    parts = build();
    modal = createModal({title: 'Start fresh?', body: parts.body, onCancel: () => close(), onClose: () => forget()});
    modal.element.classList.add('island-reset-modal');
    modal.open(parent(), parts.input);
  }
  function forget() { if (!busy) { modal?.dispose(); modal = null; parts = null; } }
  function close() { if (busy) return; const shown = modal; modal = null; parts = null; shown?.dispose(); }
  async function confirm() {
    if (busy || !parts || !confirmed(parts.input.value)) return;
    const shown = parts;
    busy = true; shown.go.textContent = 'Starting fresh…'; shown.sync(); shown.keep.disabled = true; shown.input.disabled = true;
    let answer;
    try { answer = await reset(); } catch { answer = {ok: false, message: 'Something went wrong. Try again.'}; }
    busy = false;
    if (disposed) return;
    if (answer?.ok) { close(); onDone(answer.data, {play}); return; }
    shown.go.textContent = 'Start fresh'; shown.keep.disabled = false; shown.input.disabled = false; shown.sync();
    shown.error.textContent = answer?.message || 'Something went wrong. Try again.'; shown.error.hidden = false;
  }
  return {element, open, close,
    // The Settings page's way back to the game (shell/account-extras.js), kept for onDone.
    offer(next = null) { play = typeof next === 'function' ? next : null; return element; },
    get isOpen() { return !!modal; },
    get busy() { return busy; },
    dispose() { disposed = true; busy = false; close(); element.remove(); }};
}
