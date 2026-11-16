// Reset my island (T53, docs/GAME-V3.md "Reset my island"): the Settings section where the owner of an
// island starts it again from nothing. The server decides everything (POST /api/island/fresh-start,
// backend/server/island/fresh_start.py): this file only shows what is reset and what stays, asks for the
// island code, and keeps the red button off until the code typed is the island's own.
//
//   const section = createResetSection({read, reset});
//     read()        -> {kind: 'owner', code: 'ISLE-K7Q2M', wave?: true} | {kind: 'member'} | {kind: 'none', message}
//     reset(typed)  -> Promise<{ok, message?}> (island/index.js: the route, then the island read again)
//   resetModel(state, typed) is the same decision without the DOM (tests).
//
// Keyboard: Tab reaches the field and the button; Enter in the field resets once the code matches. The
// status line (role=status) says what happened, and the field is labelled and described for screen readers.
import './reset.css';
import {node, uniqueId} from '../ui/kit/dom.js';
import {islandCode} from './codes.js';

export const RESET_TITLE = 'Reset my island';
export const RESET_WHAT = 'Start your island again from nothing: every building but the cabin, the waves won, the research, ' +
  'the wreck, the arsenal, your crew and your captain\'s level and skills go back to the start, and your coins become 🪙 100.';
export const RESET_STAYS = 'Your friends stay in your game. This cannot be undone.';
export const MEMBER_LINE = 'Only the host can reset this game\'s island.';
export const WAVE_LINE = 'A wave is under way. Reset your island between waves.';
export const DONE_LINE = 'Your island starts fresh: 🪙 100 and wave 1. Ring the bell when you are ready.';

// Whether what was typed is the island's own code (any case, with or without ISLE-, spaces or dashes).
export const codeMatches = (typed, code) => !!islandCode(code ?? '') && islandCode(typed ?? '') === islandCode(code ?? '');

// What the section shows for a state from read() and the text typed so far.
export function resetModel(state, typed = '', {busy = false} = {}) {
  if (state?.kind === 'member') return {kind: 'member', line: MEMBER_LINE};
  if (state?.kind !== 'owner' || !islandCode(state.code ?? '')) {
    return {kind: 'none', line: typeof state?.message === 'string' && state.message ? state.message : 'Open your island first to reset it.'};
  }
  const matches = codeMatches(typed, state.code);
  return {kind: 'owner', code: state.code, matches, wave: state.wave === true,
    enabled: matches && !busy && state.wave !== true, busy,
    hint: state.wave === true ? WAVE_LINE : `Type ${state.code} to confirm.`};
}

export function createResetSection({read = () => null, reset = async () => ({ok: false})} = {}) {
  const section = node('section', 'shell-section island-reset'), heading = node('h3', '', RESET_TITLE);
  heading.id = uniqueId('island-reset-title'); section.setAttribute('aria-labelledby', heading.id);
  section.append(heading);
  const state = (() => { try { return read(); } catch { return null; } })();
  const first = resetModel(state);
  if (first.kind !== 'owner') {
    const line = node('p', 'island-reset-note', first.line);
    section.dataset.state = first.kind;
    section.append(line);
    return section;
  }
  section.dataset.state = 'ready';
  const what = node('p', 'island-reset-copy', RESET_WHAT), stays = node('p', 'island-reset-stays', RESET_STAYS);
  what.id = uniqueId('island-reset-what'); stays.id = uniqueId('island-reset-stays');
  const form = node('form', 'island-reset-form'); form.noValidate = true;
  const label = node('label', 'island-reset-label'), input = node('input', 'island-reset-code'), id = uniqueId('island-reset-code');
  input.id = id; label.htmlFor = id; input.type = 'text'; input.name = 'code'; input.autocomplete = 'off';
  input.autocapitalize = 'characters'; input.spellcheck = false; input.maxLength = 24; input.inputMode = 'text';
  input.placeholder = first.code;
  const hint = node('span', 'island-reset-hint', first.hint); hint.id = uniqueId('island-reset-hint');
  input.setAttribute('aria-describedby', `${what.id} ${stays.id} ${hint.id}`);
  label.append(node('span', '', 'Your island code'), input, hint);
  const button = node('button', 'kit-button island-reset-button', RESET_TITLE); button.type = 'submit';
  const status = node('p', 'island-reset-status'); status.setAttribute('role', 'status');
  form.append(label, button);
  section.append(what, stays, form, status);

  let busy = false;
  function paint() {
    const model = resetModel(state, input.value, {busy});
    button.disabled = !model.enabled;
    button.setAttribute('aria-disabled', String(!model.enabled));
    button.textContent = busy ? 'Starting again…' : RESET_TITLE;
    input.setAttribute('aria-invalid', String(input.value.trim() !== '' && !model.matches));
    hint.textContent = model.hint;
    return model;
  }
  input.addEventListener('input', () => { if (section.dataset.state === 'done') section.dataset.state = 'ready'; status.textContent = ''; paint(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!paint().enabled) { input.focus(); return; }
    busy = true; paint(); status.textContent = 'Starting your island again…';
    let answer;
    try { answer = await reset(input.value); } catch { answer = {ok: false}; }
    busy = false;
    if (answer?.ok) {
      input.value = ''; section.dataset.state = 'done'; status.textContent = DONE_LINE;
    } else {
      status.textContent = typeof answer?.message === 'string' && answer.message ? answer.message : 'Your island could not be reset. Nothing changed. Try again.';
    }
    paint();
    input.focus();
  });
  paint();
  return section;
}
