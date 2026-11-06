// Connection words come from the adapter; retry sends the existing read-only continuation intent.
import './connection-banner.css';
import {node} from './kit/dom.js';
import {createProblemLink} from '../diagnostics/report-link.js';

export function createConnectionBanner({send, inline = false} = {}) {
  const element = node('aside', 'connection-banner');
  if (inline) element.classList.add('connection-inline');
  element.setAttribute('aria-label', 'Connection');
  const message = node('p');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const actions = node('div', 'connection-actions');
  const retry = node('button', 'kit-button kit-quiet', 'Retry connection');
  retry.type = 'button';
  retry.dataset.focus = 'connection-retry';
  const report = createProblemLink();
  report.dataset.focus = 'connection-report';
  actions.append(retry, report);
  element.append(message, actions);
  let disposed = false, pending = false, state = 'idle',lastMessage=null;
  const retryable = () => ['offline', 'error', 'online'].includes(state);
  retry.onclick = async () => {
    if (disposed || pending || !retryable()) return;
    pending = true; retry.setAttribute('aria-disabled','true');
    try { await send?.('continueGame'); }
    finally { pending = false; if (!disposed) retry.setAttribute('aria-disabled',String(!retryable())); }
  };
  return {
    element,
    update(view) {
      const connection = view?.account?.connection;
      const nextState=connection?.state??'idle',nextMessage=connection?.message??'';
      if(nextState===state&&nextMessage===lastMessage)return;
      state=nextState;lastMessage=nextMessage;
      if((state==='idle'||!connection?.message)&&element.contains(document.activeElement)){
        const scope=element.closest('dialog')??element.parentElement;
        const target=[...(scope?.querySelectorAll('button,a[href],canvas[tabindex]')??[])].find(control=>
          !element.contains(control)&&!control.disabled&&!control.closest('[hidden]')&&control.getClientRects().length);
        target?.focus({preventScroll:true});
      }
      element.hidden = state === 'idle' || !connection?.message;
      element.dataset.state = state;
      if (message.textContent !== connection?.message) message.textContent = connection?.message ?? '';
      retry.hidden = !retryable();
      retry.setAttribute('aria-disabled',String(pending || !retryable()));
      report.hidden = !['offline', 'error', 'slow', 'expired'].includes(state);
      actions.hidden = retry.hidden && report.hidden;
    },
    dispose() { disposed = true; retry.onclick = null; element.remove(); },
  };
}
