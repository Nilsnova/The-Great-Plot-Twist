// Native progress semantics with a label. Feature owners supply the values.
import './components.css';
import { node } from './dom.js';
import { progressRatio } from './logic.js';
export function createProgress({ label = 'Progress', value = 0, max = 1 } = {}) {
  const element = node('label','kit-progress'), text = node('span'), bar = node('progress'), amount = node('span','kit-progress-value'); bar.max = 1;
  element.append(text,bar,amount);
  function update(data) {
    if (data.label !== undefined) label = data.label; if (data.value !== undefined) value = data.value; if (data.max !== undefined) max = data.max;
    const ratio = progressRatio(value,max); text.textContent = label; bar.value = ratio; amount.textContent = `${Math.round(ratio*100)}%`; bar.setAttribute('aria-label',label);
  }
  update({}); return { element, update, dispose() { element.remove(); } };
}
