import {node} from '../ui/kit/dom.js';
import './village-mode.css';

export function createVillageBar({container, onLeave, onCamera = () => {}}) {
  const bar = node('section', 'island-village-mode');
  bar.hidden = true; bar.setAttribute('aria-label', 'Village mode');
  const copy = node('div', 'island-village-copy');
  copy.append(node('strong', '', 'Village mode'), node('p', '', 'Select a building to build, upgrade or move it. Zoom in, then drag the view.'));
  const leave = node('button', 'kit-button kit-quiet', 'Exit');
  leave.setAttribute('aria-label', 'Exit village mode'); leave.type = 'button'; leave.addEventListener('click', onLeave);
  const tools = node('div', 'island-village-camera'); tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Village camera');
  for (const [label, action, name] of [['−', 'out', 'Zoom out'], ['+', 'in', 'Zoom in'], ['Fit', 'fit', 'Fit village']]) {
    const button = node('button', 'kit-button kit-quiet', label); button.type = 'button'; button.setAttribute('aria-label', name);
    button.addEventListener('click', () => onCamera(action)); tools.append(button);
  }
  bar.append(copy, tools, leave); container.append(bar);
  return {render(active) { bar.hidden = !active; }, dispose() { bar.remove(); }};
}
