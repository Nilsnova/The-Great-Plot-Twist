// Small DOM helpers shared by the views of the desk. Text is always set as text, never as HTML.
//
// Used by: card-list.js, questions-view.js, stakes-view.js, presenter-view.js and desk.js.

import { node, uniqueId } from '../../ui/kit/dom.js';
import { createButton } from '../../ui/kit/button.js';

export { node, uniqueId };

// A real <button> with a text label (the kit's look). `focus` is a key that keepFocus can find again.
// A button inside a <form> that should send it passes type: 'submit'.
export function button(label, onClick, { quiet = false, disabled = false, focus, type = 'button' } = {}) {
  const { element } = createButton({ label, onClick, disabled, variant: quiet ? 'quiet' : 'primary' });
  element.type = type;
  if (focus) element.dataset.focus = focus;
  return element;
}

// While a request is in flight the button cannot be pressed twice, and a screen reader hears that it is busy.
export function setBusy(control, busy) {
  control.disabled = busy;
  if (busy) control.setAttribute('aria-busy', 'true');
  else control.removeAttribute('aria-busy');
}

// A polite live region. It stays in the page for the whole life of a card, so a new text is announced.
export function liveStatus(className = 'desk-status') {
  const element = node('p', className);
  element.setAttribute('role', 'status');
  return element;
}

export function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

// Finds a control by its focus key inside `root` and puts the keyboard focus on it.
export function focusKey(root, key) {
  const target = [...root.querySelectorAll('[data-focus]')].find(item => item.dataset.focus === key);
  target?.focus({ preventScroll: false });
  return Boolean(target);
}

// Rebuilds part of the page and puts the focus back on the same control, so a refresh never throws the
// player's place away. If that control is gone, the focus goes to the card's title (data-focus="title").
export function keepFocus(root, rebuild) {
  const key = root.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
  rebuild();
  if (key && !focusKey(root, key)) focusKey(root, 'title');
}
