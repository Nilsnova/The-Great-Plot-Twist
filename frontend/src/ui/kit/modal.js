// A native modal with Escape, labelled content and restoration of the invoking focus.
import { node, content, uniqueId } from './dom.js';
import { createIconButton } from './icon-button.js';
// Match native Tab stops, including inherited fieldset disabling and radio groups.
function tabStops(element) {
  const controls=[...element.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')]
    .filter(control=>control.tabIndex>=0&&!control.matches(':disabled')&&control.getClientRects().length
      &&getComputedStyle(control).visibility==='visible'
      &&!control.closest('[hidden],[inert],details:not([open])>:not(summary)'));
  return controls.filter(control=>{
    if(!control.matches('input[type="radio"]')||!control.name)return true;
    const group=controls.filter(other=>other.matches('input[type="radio"]')
      &&other.name===control.name&&other.form===control.form&&other.getRootNode()===control.getRootNode());
    return control===(group.find(other=>other.checked)??group[0]);
  });
}
export function createModal({ title = 'Details', body = '', onClose, onCancel } = {}) {
  const element = node('dialog','kit-modal'), header = node('header','kit-modal-header'), heading = node('h2','kit-heading',title), bodyNode = node('div','kit-modal-body');
  heading.id = uniqueId('modal'); element.setAttribute('aria-labelledby',heading.id); content(bodyNode,body);
  let opener = null, reason = 'close';
  function close(nextReason = 'close') { reason = nextReason; if (element.open) element.close(); }
  const closeButton = createIconButton({ label:'Close dialog', onClick:() => onCancel ? onCancel() : close() });
  header.append(heading,closeButton.element); element.append(header,bodyNode);
  const cancel = event => { event.preventDefault(); event.stopPropagation(); if (onCancel) onCancel(); else close('escape'); };
  const key = event => {
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(onCancel)onCancel();else close('escape');return;}
    if(event.key!=='Tab')return;
    const controls=tabStops(element);
    const first=controls[0],last=controls.at(-1);
    if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
  };
  const closed = () => { if(element.open)return; if (opener?.isConnected && opener.getClientRects().length && !document.querySelector('dialog[open]')) opener.focus({preventScroll:true}); onClose?.(reason); };
  element.addEventListener('cancel',cancel); element.addEventListener('keydown',key); element.addEventListener('close',closed);
  return { element, body:bodyNode,
    open(parent = document.body, focusTarget) { if (element.open) return; opener = document.activeElement; if (!element.isConnected) parent.append(element); element.showModal(); (focusTarget ?? closeButton.element).focus(); },
    close, setTitle(text) { heading.textContent = text; }, setContent(value) { content(bodyNode,value); },
    dispose() { const wasOpen = element.open; element.removeEventListener('close',closed); close('dispose');
      if (wasOpen) { if (opener?.isConnected && opener.getClientRects().length && !document.querySelector('dialog[open]')) opener.focus({preventScroll:true}); onClose?.('dispose'); } closeButton.dispose(); element.removeEventListener('cancel',cancel); element.removeEventListener('keydown',key); element.remove(); },
  };
}
