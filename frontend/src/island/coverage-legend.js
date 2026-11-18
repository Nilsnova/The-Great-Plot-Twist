import {node} from '../ui/kit/dom.js';

export function createCoverageLegend() {
  const element = node('div', 'island-coverage-legend');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Coverage legend');
  element.hidden = true;
  const summary = node('span', 'island-coverage-source');
  element.append(summary);
  for (const [kind, label] of [['gap', 'Gap'], ['conditional', 'Conditional'], ['unknown', 'Unknown']]) {
    const entry = node('span', 'island-coverage-entry');
    const symbol = node('span', `island-coverage-symbol is-${kind}`);
    symbol.setAttribute('aria-hidden', 'true');
    entry.append(symbol, node('span', '', label)); element.append(entry);
  }
  return {element, show(target, draft = false) {
    element.hidden = !target;
    if (target) {
      const kind = target === 'ships' ? 'Sea' : 'Ground';
      summary.textContent = draft ? `${kind} · Clear weather · Move preview` : `${kind} · Clear weather`;
    }
  }};
}
