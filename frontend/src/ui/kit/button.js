// Native, focusable action button. The caller decides what the action does.
import { node } from './dom.js';
export function createButton({ label = 'Continue', onClick, disabled = false, variant = 'primary' } = {}) {
  const element = node('button', `kit-button ${variant === 'quiet' ? 'kit-quiet' : ''}`, label); element.type = 'button';
  element.disabled = disabled;
  const click = event => onClick?.(event); element.addEventListener('click', click);
  return { element,
    update(data) { if (data.label !== undefined) element.textContent = String(data.label); if (data.disabled !== undefined) element.disabled = data.disabled; },
    dispose() { element.removeEventListener('click', click); element.remove(); },
  };
}
