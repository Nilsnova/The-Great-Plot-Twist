// Lazy keyboard help owns loading/error feedback and the opened native modal.
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import './shortcuts-loading.css';

export function createShortcutsHost(container, {load = () => import('./hints/shortcuts.js')} = {}) {
  let overlay = null, disposed = false, pending = null, requested = false, request = 0, feedback = null;
  function clearFeedback() { feedback?.dispose(); feedback = null; }
  function close() { request++; requested = false; overlay?.close(); clearFeedback(); }
  function showFeedback(failed = false) {
    clearFeedback();
    const message = document.createElement('p'); message.setAttribute('role', failed ? 'alert' : 'status');
    message.textContent = failed ? 'Shortcuts could not load. Try again, or return to the game.' : 'Loading shortcuts…';
    const retry = createButton({label: 'Try again', onClick: () => void open()}); retry.element.hidden = !failed;
    const back = createButton({label: 'Back to game', variant: 'quiet', onClick: close});
    const body = document.createElement('div'); body.append(message, retry.element, back.element);
    feedback = createModal({title: 'Shortcuts', body, onCancel: close});
    feedback.element.classList.add('shortcuts-load-feedback');
    feedback.open(container, failed ? retry.element : undefined);
  }
  async function open() {
    if (disposed || requested) return;
    if (overlay) { overlay.open(container); return; }
    const token = ++request; requested = true; showFeedback();
    try {
      pending ??= load().then(module => { if (!disposed) overlay = module.createShortcutsOverlay(); });
      await pending;
      if (!disposed && requested && token === request) { requested = false; clearFeedback(); overlay?.open(container); }
    } catch {
      pending = null;
      if (disposed || token !== request) return;
      requested = false; showFeedback(true);
    }
  }
  const key = event => {
    if (event.key !== '?' || event.repeat || event.target?.matches?.('input,textarea,select,[contenteditable]')) return;
    event.preventDefault(); void open();
  };
  window.addEventListener('keydown', key);
  return {open, get active() { return requested || !!feedback?.element.open || !!overlay?.element.open; }, close,
    dispose() { disposed = true; close(); window.removeEventListener('keydown', key); overlay?.dispose(); },
  };
}
