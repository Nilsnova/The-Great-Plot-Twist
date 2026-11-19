// Reset my island (T53, docs/GAME-V3.md "Reset my island"): the Settings section where the owner of an
// island starts it again from nothing. The server decides everything (POST /api/island/fresh-start,
// backend/server/island/fresh_start.py): this file only shows what is reset and what stays, asks for the
// island code, and keeps the red button off until the code typed is the island's own.
//
//   const section = createResetSection({read, reset});
//     read()        -> {kind: 'owner', code: 'ISLE-K7Q2M', wave?: true, startingCoins?: 200} | {kind: 'member'} | {kind: 'none', message}
//     reset(typed)  -> Promise<{ok, data?: {balance}, message?}> (island/index.js: the route, then the island read again)
// The coins after a reset are a brand-new player's (the server's islands.json startingCoins): the section names the
// amount when the island answer carries it, else says "your starting coins"; the done line shows the new balance.
//   resetModel(state, typed) is the same decision without the DOM (tests).
//
// Keyboard: Tab reaches the field and the button; Enter in the field resets once the code matches. The
// status line (role=status) says what happened, and the field is labelled and described for screen readers.
import './reset.css';
import {node, uniqueId} from '../ui/kit/dom.js';
import {islandCode} from './codes.js';
import {readEconomy,exactCoinText} from './economy-view.js';

export const RESET_TITLE = 'Reset my island';
const coinsText = coins => (Number.isSafeInteger(coins) && coins > 0 ? `🪙 ${coins}` : 'your starting coins');
export const resetWhat = (coins,{preserveCaptain=false}={}) => 'Start your island again from nothing: every building but the cabin, the waves won, the research, ' +
  `the wreck, the arsenal, ${preserveCaptain?'and your crew':"your crew and your captain's level and skills"} go back to the start, and your coins become ${coinsText(coins)}.` +
  (preserveCaptain?' Your personal Captain level and skills are preserved.':'');
export const RESET_STAYS = 'Your friends stay in your game. This cannot be undone.';
export const MEMBER_LINE = 'Only the host can reset this game\'s island.';
export const WAVE_LINE = 'A wave is under way. Reset your island between waves.';
export const doneLine = coins => `Your island starts fresh: ${coinsText(coins)} and wave 1. Ring the bell when you are ready.`;
export const sharedResetWhat='Start this island’s run again: clear its buildings, crew, research, arsenal, wreck and wave progress. The new treasury receives configured starting capital. Remaining cash and pending wager returns stay in the retired run and cannot fund the new run. Every player keeps their personal Captain, level, skills and progression.';
export const sharedResetDone=result=>`Original reset confirmed. Its new treasury started with ${exactCoinText(result?.startingCoins)}. Old cash and wager returns remain in the retired run.`;

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
  let state = (() => { try { return read(); } catch { return null; } })();
  const first = resetModel(state);
  if (first.kind !== 'owner') {
    const line = node('p', 'island-reset-note', first.line);
    section.dataset.state = first.kind;
    section.append(line);
    return section;
  }
  section.dataset.state = 'ready';
  const what = node('p', 'island-reset-copy', state.shared?sharedResetWhat:resetWhat(state?.startingCoins,{preserveCaptain:state.preserveCaptain===true})), stays = node('p', 'island-reset-stays', RESET_STAYS);
  const scope=node('p','island-reset-scope');
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
  section.append(what, scope, stays, form, status);

  let busy = false,completed=false;const originalActor=state.actorId,originalCode=state.code;
  function paint() {
    if(state.shared && !completed){
      let current;try{current=read();}catch{/* Unreadable current selection stays disabled. */}
      if(current?.kind!=='owner' || current.shared!==true || current.actorId!==originalActor || current.code!==originalCode){
        what.textContent='The sign-in or island selection changed. Reopen Settings.';scope.textContent='';scope.title='';stays.textContent='';input.disabled=true;button.disabled=true;button.setAttribute('aria-disabled','true');
        return {enabled:false,matches:false};
      }
      state=current;
    }
    const model = resetModel(state, input.value, {busy});
    button.disabled = completed || !model.enabled;
    button.setAttribute('aria-disabled', String(completed || !model.enabled));
    button.textContent = busy ? 'Starting again…' : completed?'Reset confirmed':state.pending?'Confirm original reset':RESET_TITLE;
    input.disabled=completed;
    const economy=state.shared?readEconomy(state.economy):null;
    scope.textContent=economy?`${completed?'Original request for':state.pending?'Saved original':'Selected'} run ${economy.runEpoch.slice(0,8)} · ${completed || state.pending?'At request: ':''}Available ${exactCoinText(economy.treasury.availableCoins)} · Reserved ${exactCoinText(economy.treasury.committedCoins)}`:'';
    scope.title=economy?`Account ${economy.accountId}; run ${economy.runEpoch}`:'';
    input.setAttribute('aria-invalid', String(input.value.trim() !== '' && !model.matches));
    hint.textContent = model.hint;
    return {...model,enabled:!completed && model.enabled};
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
      input.value = ''; section.dataset.state = 'done';completed=state.shared===true;
      status.textContent=state.shared?(answer.ignored?'Original reset confirmed. Current island state was read again.':sharedResetDone(answer.data?.receipt?.result)):doneLine(answer.data?.balance ?? state?.startingCoins);
    } else {
      status.textContent = typeof answer?.message === 'string' && answer.message ? answer.message : 'The reset is not confirmed. Retry the original request.';
    }
    paint();
    input.focus();
  });
  paint();
  return section;
}
