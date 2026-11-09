// The duel shortcut on screen: the small "Wave / Friendly duel" menu, the in-place invitation
// ("Accept / Not now"), and the spotlight overlay in the harbor with the sealed picker and the
// dramatic reveal. The picker and the reveal are the arena's own (screens/duels); the machine is
// duel-shortcut.js; the calls go through duel-api.js or the rehearsal's practice rival.
import '../screens/duels/duels.css';
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {createPicker} from '../screens/duels/picker.js';
import {createReveal} from '../screens/duels/reveal.js';
import {newActionUid} from '../screens/duels/logic.js';
import {resultText} from '../screens/duels/steps.js';
import {SHORTCUT_ROUNDS, WAIT_LIMIT_MS, duelStep, initialDuel, menuCopy, inviteCopy} from './duel-shortcut.js';

const POLL_MS = 2500;
const btn = (label, onClick, quiet = false) => {
  const element = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label);element.type = 'button';element.addEventListener('click', onClick);return element;
};

// duels: {challenge, answer, decline, detail} -> {ok, status, data, code, message}
export function createDuelOverlay({container, duels, reducedMotion = () => false, cue = () => {}, onWave, onFinished, onInviteSent, onChange}) {
  let state = initialDuel(), disposed = false, pollTimer = null, picker = null, reveal = null;
  const body = node('div', 'shortcut-body');
  const modal = createModal({title: 'Friendly duel', body, onCancel: () => dispatch({type: 'close'})});
  modal.element.classList.add('duel-spotlight', 'duel-modal');
  const invite = node('section', 'duel-invite');invite.hidden = true;invite.setAttribute('role', 'region');invite.setAttribute('aria-live', 'polite');
  container.append(invite);

  function dispatch(event) {
    const before = state;
    state = duelStep(state, event);
    if (state !== before) { render(); onChange?.(state); }
    return state;
  }
  function stopPoll() { clearTimeout(pollTimer); pollTimer = null; }

  async function seal(signals) {
    dispatch({type: 'seal', uid: newActionUid()});
    if (state.screen !== 'sending') return;
    const reply = await duels.challenge({opponentName: state.target.name, signals, actionUid: state.uid});
    if (disposed || state.screen !== 'sending') return;
    if (!reply.ok && reply.code !== 'already_applied') { dispatch({type: 'failed', failure: reply, signals}); return; }
    const duel = reply.data?.duel ?? null;
    dispatch({type: 'sent', duel, now: Date.now()});
    onInviteSent?.({duel, opponentName: state.target.name});
    if (duel?.reveal) { dispatch({type: 'finished', duel}); return; }
    poll();
  }
  async function poll() {
    stopPoll();
    if (disposed || state.screen !== 'waiting' || !state.duel?.id) return;
    if (Date.now() - (state.startedAt ?? Date.now()) > WAIT_LIMIT_MS) { dispatch({type: 'timeout'}); return; }
    const reply = await duels.detail(state.duel.id);
    if (disposed || state.screen !== 'waiting') return;
    const duel = reply.ok ? reply.data?.duel : null;
    if (duel?.reveal) { dispatch({type: 'finished', duel}); return; }
    if (duel && ['declined', 'withdrawn', 'expired'].includes(duel.status)) { dispatch({type: 'declined'}); return; }
    pollTimer = setTimeout(poll, POLL_MS);
  }
  async function answer(signals) {
    dispatch({type: 'answer', uid: newActionUid()});
    if (state.screen !== 'answering') return;
    const reply = await duels.answer({id: state.duel.id, signals, actionUid: state.uid});
    if (disposed || state.screen !== 'answering') return;
    let duel = reply.ok ? reply.data?.duel : null;
    if (!reply.ok && reply.code === 'already_applied') duel = (await duels.detail(state.duel.id)).data?.duel ?? null;
    if (!duel?.reveal) { dispatch({type: 'failed', failure: reply.ok ? {status: 500} : reply, signals}); return; }
    dispatch({type: 'finished', duel});
  }

  function pickerPanel(lead, actionLabel, onSeal, retry) {
    picker?.dispose();picker = createPicker({onChange: ({complete}) => { go.disabled = !complete; }});
    picker.setRounds(SHORTCUT_ROUNDS);
    const go = btn(actionLabel, () => { if (picker.isComplete()) void onSeal(picker.getSignals()); });go.disabled = true;
    const wrap = node('div');
    wrap.append(node('p', 'shortcut-lead', lead), picker.element);
    if (retry) {
      const again = btn('Try again', () => void onSeal(retry));
      wrap.append(node('div', 'shortcut-actions'));wrap.lastChild.append(again);
    }
    const actions = node('div', 'shortcut-actions');actions.append(go, btn('Not now', () => dispatch({type: 'close'}), true));
    wrap.append(actions);
    return wrap;
  }

  function render() {
    if (disposed) return;
    modal.element.dataset.motion = reducedMotion() ? 'off' : 'on';
    renderInvite();
    const screen = state.screen;
    if (['idle', 'invited'].includes(screen)) { if (modal.element.open) modal.close('close'); stopPoll(); return; }
    const beam = node('div', 'spotlight-beam');beam.setAttribute('aria-hidden', 'true');
    let content, focus = null;
    if (screen === 'menu') {
      const copy = menuCopy(state.target);
      modal.setTitle(copy.title);
      const row = node('div', 'shortcut-actions'), wave = btn(copy.wave, () => { dispatch({type: 'wave'}); onWave?.(); });
      row.append(wave, btn(copy.duel, () => dispatch({type: 'choose_duel'})), btn(copy.close, () => dispatch({type: 'close'}), true));
      content = node('div');content.append(node('p', 'shortcut-lead', `What would you like to do with ${state.target.name}?`), row);focus = wave;
    } else if (screen === 'picking') {
      modal.setTitle(`Duel ${state.target.name}`);
      content = pickerPanel('Seal three lantern signals. Flash beats Shade, Shade beats Mirror, Mirror beats Flash. Friendly: no coins.', 'Seal and challenge', seal);
    } else if (screen === 'answering_pick') {
      modal.setTitle(`Answer ${state.target.name}`);
      content = pickerPanel(`Seal your three signals against ${state.target.name}. The server opens both at once.`, 'Seal and answer', answer);
    } else if (screen === 'sending' || screen === 'answering') {
      content = node('p', 'shortcut-lead', screen === 'sending' ? 'Sealing your signals…' : 'Opening both envelopes…');
    } else if (screen === 'waiting') {
      modal.setTitle(`Waiting for ${state.target.name}`);
      const stop = btn('Stop waiting', () => { stopPoll(); dispatch({type: 'close'}); }, true);
      content = node('div');content.append(node('p', 'shortcut-lead', state.message), node('p', '', 'Your signals are sealed. The other captain sees them only in the reveal.'), stop);focus = stop;
    } else if (screen === 'reveal') {
      modal.setTitle('The reveal');
      reveal?.dispose();reveal = createReveal({onLeave: () => { const duel = state.duel; dispatch({type: 'done'}); onFinished?.(duel); }});
      content = reveal.element;
      queueMicrotask(() => { if (!disposed && state.screen === 'reveal') { reveal.play(state.duel); cue('festival-ring-bell'); } });
    } else if (screen === 'error') {
      modal.setTitle('Friendly duel');
      const status = node('p', 'shortcut-lead', state.message);status.setAttribute('role', 'alert');
      content = node('div');content.append(status);
      if (state.retry && state.signals) {
        const again = btn('Try again', () => void (state.retry === 'seal' ? seal(state.signals) : answer(state.signals)));
        content.append(again);focus = again;
      }
      const closeButton = btn('Close', () => dispatch({type: 'done'}), !!focus);content.append(closeButton);focus ??= closeButton;
    }
    body.replaceChildren(beam, content);
    if (!modal.element.open) modal.open(container, focus ?? body.querySelector('button,input'));
    else (focus ?? body.querySelector('button:not(:disabled),input:not(:disabled)'))?.focus({preventScroll: true});
  }

  function renderInvite() {
    if (state.screen !== 'invited') { invite.hidden = true; invite.replaceChildren(); return; }
    const copy = inviteCopy(state.target.name), heading = node('h2', '', copy.title), row = node('div');
    heading.id = 'duel-invite-heading';invite.setAttribute('aria-labelledby', heading.id);
    const accept = btn(copy.accept, () => dispatch({type: 'accept'}));
    row.append(accept, btn(copy.decline, () => { const duel = state.duel; dispatch({type: 'decline'}); void duels.decline?.(duel.id); }, true));
    invite.replaceChildren(heading, node('p', '', copy.text), row);invite.hidden = false;
  }

  return {
    open(target) { dispatch({type: 'open', target}); },
    invited(duel) { if (state.screen === 'idle') { dispatch({type: 'invited', duel}); cue('festival-claim'); } },
    get state() { return state; },
    get active() { return modal.element.open; },
    get inviting() { return state.screen === 'invited'; },
    resultLine: duel => resultText(duel),
    close() { stopPoll(); if (!['sending', 'answering'].includes(state.screen)) { state = initialDuel(); render(); } },
    dispose() { disposed = true; stopPoll(); picker?.dispose(); reveal?.dispose(); modal.dispose(); invite.remove(); },
  };
}
