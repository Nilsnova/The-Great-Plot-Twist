// The status lines at the top of the panel: the practice label, the coins, how often the screen
// is checking (with "Check now"), the waiting message while the ring is closed, signed out or not
// answering, and the notice with its buttons ("Try again", "Watch the reveal"). It only draws what
// the adapter's view says, and redraws a line only when its data changed, so a quiet poll does
// not make a screen reader repeat itself. Used by: panel.js.
import { formatCoins } from '../../ui/kit/logic.js';
import { messageFor } from './messages.js';
import { button, changed, node, redraw } from './dom.js';
import {createServerCallState} from '../../ui/kit/server-call-state.js';

const POLL_TEXT = { fast: 'Checking every 5 s', slow: 'Checking every 30 s', paused: 'Paused.', off: '' };
const WAITING_TEXT = {
  loading: 'Opening the ring…', closed: messageFor('feature_off'), signed_out: messageFor('unauthorized'), unavailable: messageFor('retrying'),
};

export const isReady = view => view.mode === 'ready' || view.mode === 'practice';

export function createStatus({ onRefresh, onRetry, onWatch, onSignIn, onCooldown, now = Date.now }) {
  const practice = node('p', 'duel-practice', 'Practice ring: a local stand-in rival. Nothing is saved.');
  const wallet = node('p', 'duel-wallet'), polling = node('div', 'duel-polling'), message = node('p', 'duel-message');
  const notice = node('div', 'duel-notice'), done = node('p', 'duel-done');
  const memo = { polling: {}, notice: {} };
  let currentView=null,lastCall=null;
  const call=createServerCallState({label:'duel request',now,onRetry:()=>currentView?.canRetry?onRetry():onRefresh(),
    onSignIn,onChange:()=>onCooldown?.(call.read().remaining>0)});
  notice.setAttribute('role', 'status');
  done.setAttribute('role', 'status');

  function drawPolling(view) {
    if (!changed(memo.polling, [view.mode, view.polling])) return;
    polling.replaceChildren();
    if (view.mode !== 'ready') return;
    const label = view.polling === 'paused' ? 'Check again' : 'Check now';
    polling.append(node('span', '', POLL_TEXT[view.polling] ?? ''), button(label, onRefresh, { quiet: true, focus: 'check-now' }));
  }

  // The adapter's notice, with the buttons that fit it. A reveal that was watched needs no reminder.
  function drawNotice(view, played) {
    const current = view.notice && !(view.notice.code === 'decided' && played.has(view.notice.duelId)) ? view.notice : null;
    if (!changed(memo.notice, [current, view.canRetry])) return;
    redraw(notice, () => {
      notice.replaceChildren();
      if (current?.code==='decided') notice.append(node('p', '', current.message));
      if (current?.code === 'decided') notice.append(button('Watch the reveal', () => onWatch(current.duelId), { focus: 'watch' }));
    });
  }

  return {
    elements: [practice, wallet, polling, message, notice, done,call.element],
    focusFailure(){
      if(!call.element.isConnected||call.element.hidden)return;
      const target=[...call.element.querySelectorAll('button,a[href]')].find(control=>
        !control.matches(':disabled')&&!control.closest('[hidden],[inert]')&&control.getClientRects().length);
      target?.focus({preventScroll:false});
    },
    blocked:()=>call.read().remaining>0,
    dispose(){call.dispose();currentView=null;},
    say(text) { done.textContent = text; },
    update(view, played, revealing = false) { // while a reveal plays, the coins stay hidden so they do not spoil it
      currentView=view;
      const ready = isReady(view);
      practice.hidden = view.mode !== 'practice';
      message.hidden = ready;
      message.textContent = ready ? '' : (WAITING_TEXT[view.mode] ?? '');
      notice.hidden = !ready;
      wallet.hidden = !ready || view.coins === null || revealing;
      const held = view.heldCoins > 0 ? ` Held in waiting challenges: ${formatCoins(view.heldCoins)}.` : '';
      wallet.textContent = `Coins: ${formatCoins(view.coins)}.${held}`;
      drawPolling(view);
      drawNotice(view, played);
      const current=view.notice?.code==='decided'?null:view.notice;
      const signature=JSON.stringify([view.mode,current]);
      if(signature!==lastCall){
        lastCall=signature;
        if(view.mode==='loading')call.loading({read:true});
        else if(current||view.mode==='signed_out'){
          const code=current?.code??'unauthorized',status=current?.status;
          const reason=code==='unauthorized'?'sign_in_required':status===429||code==='too_many_requests'?'rate_limited'
            :code==='database_unavailable'?'not_connected':code==='retrying'?(status===0?'offline':'not_connected'):'duel_refused';
          const remaining=Number.isFinite(current?.retryUntil)?Math.max(0,current.retryUntil-now()):undefined;
          call.fail({reason,message:current?.message??messageFor(code),retryAfterSeconds:current?.retryAfterSeconds},
            {retryAfterMs:remaining});
        }else call.clear();
      }
    },
  };
}
