// One polite status announcement; timeout and DOM are released by dispose.
import { node } from './dom.js';
export function createToast({ duration = 3200 } = {}) {
  const element = node('div','kit-toast'); element.setAttribute('role','status'); element.hidden = true; let timer;
  return { element, show(text, ms = duration) { clearTimeout(timer); element.textContent = String(text); element.hidden = false; timer = setTimeout(() => { element.hidden = true; },ms); },
    hide() { clearTimeout(timer); element.hidden = true; }, dispose() { clearTimeout(timer); element.remove(); } };
}
