import './village-art-notice.css';
import {node} from './kit/dom.js';
export function createVillageArtNotice({container, isActive = () => true, retry, focus} = {}) {
  if (!container) return {set() {}, update() {}, dispose() {}};
  const element = node('aside', 'village-art-notice'), message = node('p'), button = node('button', 'kit-button', 'Retry artwork');
  element.setAttribute('aria-label', 'Island artwork'); element.hidden = true;
  message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); button.type = 'button';
  element.append(message, button); container.append(element);
  let state = {failed: [], pending: []}, disposed = false;
  function update() {
    if (disposed) return;
    const show = state.failed.length > 0 && isActive();
    if (!show && element.contains(document.activeElement)) focus?.();
    element.hidden = !show; button.disabled = state.pending.length > 0;
    const line = button.disabled ? 'Loading island artwork…' : 'Some island artwork could not load. Try again.', label = button.disabled ? 'Retrying…' : 'Retry artwork';
    if (message.textContent !== line) message.textContent = line;
    if (button.textContent !== label) button.textContent = label;
  }
  button.onclick = () => { if (!disposed && !button.disabled) void retry(); };
  return {set(value) { state = value; update(); }, update,
    dispose() { disposed = true; button.onclick = null; element.remove(); }};
}
