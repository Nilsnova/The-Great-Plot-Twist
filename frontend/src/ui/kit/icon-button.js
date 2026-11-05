// An icon is decorative; the native button always has a spoken action name.
import { createButton } from './button.js';
import { node } from './dom.js';
export function createIconButton({ label, icon = '×', onClick, disabled } = {}) {
  const button = createButton({ label:'', onClick, disabled, variant:'quiet' });
  button.element.classList.add('kit-icon-button'); button.element.setAttribute('aria-label', String(label ?? 'Close'));
  const glyph = node('span', '', icon); glyph.setAttribute('aria-hidden','true'); button.element.append(glyph);
  return button;
}
