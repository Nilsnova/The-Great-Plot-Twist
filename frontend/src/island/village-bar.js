import {node} from '../ui/kit/dom.js';
import './village-mode.css';

export function createVillageBar({container, onLeave}) {
  const bar = node('section', 'island-village-mode');
  bar.hidden = true; bar.setAttribute('aria-label', 'Village mode');
  const copy = node('div', 'island-village-copy');
  copy.append(node('strong', '', 'Village mode'), node('p', '', 'Select a building to build, upgrade or move it.'));
  const leave = node('button', 'kit-button kit-quiet', 'Exit village mode');
  leave.type = 'button'; leave.addEventListener('click', onLeave);
  bar.append(copy, leave); container.append(bar);
  return {render(active) { bar.hidden = !active; }, dispose() { bar.remove(); }};
}
