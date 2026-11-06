// Small DOM helpers shared by the duel panel files. Text is always set as text, never as HTML.
// Used by: panel.js, picker.js, reveal.js, history.js, challenges.js, new-challenge.js, rules-card.js.
import { node, uniqueId } from '../../ui/kit/dom.js';
import { createButton } from '../../ui/kit/button.js';

export { node, uniqueId };

// A native button from the UI kit. `focus` is a name that redraw() uses to find it again.
export function button(label, onClick, { quiet = false, disabled = false, focus } = {}) {
  const control = createButton({ label, onClick, disabled, variant: quiet ? 'quiet' : 'primary' }).element;
  if (focus) control.dataset.focus = focus;
  return control;
}

// A text label above a control, both inside one <label> so a click on the words focuses the control.
export function field(labelText, control, className = 'duel-field') {
  const label = node('label', className);
  label.append(node('span', '', labelText), control);
  return label;
}

// Rebuilds a part of the screen and puts the keyboard focus back on the control that had it.
export function redraw(root, render) {
  const key = root.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
  render();
  if (!key) return;
  [...root.querySelectorAll('[data-focus]')].find(item => item.dataset.focus === key)?.focus({ preventScroll: true });
}

// The same data again means nothing to redraw. Returns true only when `signature` is new.
export function changed(holder, signature) {
  const text = JSON.stringify(signature);
  if (holder.last === text) return false;
  holder.last = text;
  return true;
}

// Calls `callback` once when `element`, which sits in `container`, has been taken out of the page
// (the game clears its container when it shuts down). Returns a function that stops watching.
export function whenRemoved(container, element, callback) {
  const observer = new MutationObserver(() => {
    if (element.isConnected) return;
    observer.disconnect();
    callback();
  });
  observer.observe(container, { childList: true });
  return () => observer.disconnect();
}
