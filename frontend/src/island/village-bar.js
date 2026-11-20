import {node} from '../ui/kit/dom.js';
import {BUILDINGS} from './td-rules.js';
import {createCoverageLegend} from './coverage-legend.js';
import './village-mode.css';

export function createVillageBar({container, onLeave, onPick, onCamera = () => {}, onCoverage}) {
  const bar = node('section', 'island-village-mode');
  bar.hidden = true; bar.setAttribute('aria-label', 'Village mode');
  const copy = node('div', 'island-village-copy');
  copy.append(node('strong', '', 'Village'), node('p', '', 'Press E to find a building. Zoom in, then drag the view.'));
  const buildings = node('select', 'island-village-buildings');
  buildings.setAttribute('aria-label', 'Find building');
  buildings.hidden = true;
  buildings.addEventListener('change', () => {
    const id = buildings.value;
    buildings.value = '';
    if (id) onPick(id);
  });
  const coverage = onCoverage ? node('select', 'island-village-coverage') : null;
  const legend = coverage ? createCoverageLegend() : null;
  if (coverage) {
    bar.classList.add('has-coverage');
    coverage.setAttribute('aria-label', 'Approach coverage');
    for (const [value, name] of [['', 'Coverage off'], ['boarders', 'Ground'], ['ships', 'Sea']]) {
      const option = node('option', '', name); option.value = value; coverage.append(option);
    }
    coverage.addEventListener('change', () => onCoverage(coverage.value));
  }
  const leave = node('button', 'kit-button kit-quiet island-village-exit', 'Exit');
  leave.setAttribute('aria-label', 'Exit village mode'); leave.type = 'button'; leave.addEventListener('click', onLeave);
  const tools = node('div', 'island-village-camera'); tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Village camera');
  for (const [label, action, name] of [['−', 'out', 'Zoom out'], ['+', 'in', 'Zoom in'], ['Work', 'work', 'Working village view'], ['Fit', 'fit', 'Fit village']]) {
    const button = node('button', 'kit-button kit-quiet', label); button.type = 'button'; button.setAttribute('aria-label', name);
    button.addEventListener('click', () => onCamera(action)); tools.append(button);
  }
  bar.append(copy, buildings);
  if (coverage) bar.append(coverage);
  bar.append(tools, leave);
  if (legend) bar.append(legend.element);
  container.append(bar);
  let previous = '';
  return {
    render(active) { bar.hidden = !active; },
    setCoverage(value) { if (coverage) { coverage.value = value; legend.show(value); } },
    focusBuildings() {
      if (bar.hidden || buildings.hidden) return false;
      buildings.focus({preventScroll: true});
      return true;
    },
    setBuildings(spots) {
      const picks = spots.filter(spot => spot?.built && BUILDINGS[spot.kind]);
      const key = JSON.stringify(picks.map(({id, kind, level}) => [id, kind, level]));
      if (key === previous) return;
      previous = key;
      const placeholder = node('option', '', 'Find building'); placeholder.value = '';
      buildings.replaceChildren(placeholder);
      for (const spot of picks) {
        const index = spot.id.split('_').slice(1).join('-');
        const label = [BUILDINGS[spot.kind].name, index].filter(Boolean).join(' ');
        const option = node('option', '', `${label} · Level ${spot.level}`);
        option.value = spot.id; buildings.append(option);
      }
      buildings.hidden = picks.length === 0;
    },
    dispose() { bar.remove(); },
  };
}
