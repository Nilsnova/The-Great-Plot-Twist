// A native modal with Escape, labelled content and restoration of the invoking focus.
import { node, content, uniqueId } from './dom.js';
import { createIconButton } from './icon-button.js';
export function createModal({ title = 'Details', body = '', onClose, onCancel } = {}) {
  const element = node('dialog','kit-modal'), header = node('header','kit-modal-header'), heading = node('h2','kit-heading',title), bodyNode = node('div','kit-modal-body');
  heading.id = uniqueId('modal'); element.setAttribute('aria-labelledby',heading.id); content(bodyNode,body);
  let opener = null, reason = 'close';
  function close(nextReason = 'close') { reason = nextReason; if (element.open) element.close(); }
  const closeButton = createIconButton({ label:'Close dialog', onClick:() => onCancel ? onCancel() : close() });
  header.append(heading,closeButton.element); element.append(header,bodyNode);
  const cancel = event => { event.preventDefault(); event.stopPropagation(); if (onCancel) onCancel(); else close('escape'); };
  const key = event => { if (event.key === 'Escape') event.stopPropagation(); };
  const closed = () => { if (opener?.isConnected) opener.focus({preventScroll:true}); onClose?.(reason); };
  element.addEventListener('cancel',cancel); element.addEventListener('keydown',key); element.addEventListener('close',closed);
  return { element, body:bodyNode,
    open(parent = document.body, focusTarget) { if (element.open) return; opener = document.activeElement; if (!element.isConnected) parent.append(element); element.showModal(); (focusTarget ?? closeButton.element).focus(); },
    close, setTitle(text) { heading.textContent = text; }, setContent(value) { content(bodyNode,value); },
    dispose() { const wasOpen = element.open; element.removeEventListener('close',closed); close('dispose');
      if (wasOpen) { if (opener?.isConnected) opener.focus({preventScroll:true}); onClose?.('dispose'); } closeButton.dispose(); element.removeEventListener('cancel',cancel); element.removeEventListener('keydown',key); element.remove(); },
  };
}
