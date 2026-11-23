// The bar of Move mode (T36, flexible placement): a parchment strip at the bottom of the screen with what is
// moved, whether the square is free, four arrow buttons big enough for a thumb, and
// Place here / Cancel. It shows models from move-mode.js (moveModel) and calls back; it decides nothing.
// The island stays in view above it, so a tap on the ground picks the square. Used by index.js.
import {node} from '../ui/kit/dom.js';
import {createBuildingPortrait} from './building-portrait.js';
import {createCoverageLegend} from './coverage-legend.js';
import './move-bar.css';

const ARROWS = Object.freeze([['←', 'west', -1, 0], ['↑', 'north', 0, -1], ['↓', 'south', 0, 1], ['→', 'east', 1, 0]]);

function button(label, onClick, className) {
  const element = node('button', `kit-button ${className}`, label); element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

// handlers: {nudge(dx, dz), place(), cancel()}. render(model) shows the bar, render(null) hides it.
export function createMoveBar({container, handlers = {}, loadPortrait}) {
  const bar = node('section', 'island-move-bar island-reference-move'); bar.hidden = true; bar.setAttribute('aria-label', 'Move a building');
  const portrait = createBuildingPortrait({className: 'island-move-portrait', loadPortrait});
  const title = node('strong', 'island-move-title'), hint = node('p', 'island-move-line');
  const status = node('p', 'island-move-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const support = node('p', 'island-move-support'); support.setAttribute('aria-live', 'polite');
  const pad = node('div', 'island-move-pad'); pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', 'Move one square');
  const arrows = [];
  for (const [label, direction, dx, dz] of ARROWS) {
    const arrow = button(label, () => handlers.nudge?.(dx, dz), 'kit-quiet island-move-arrow');
    arrow.dataset.direction = direction; pad.append(arrow); arrows.push(arrow);
  }
  const place = button('Place here', () => handlers.place?.(), 'island-move-place');
  const cancel = button('Cancel', () => handlers.cancel?.(), 'kit-quiet island-move-cancel');
  const actions = node('div', 'island-move-actions'); actions.append(cancel, place);
  const copy = node('div', 'island-move-copy'); copy.tabIndex = 0; copy.setAttribute('aria-label', 'Move details'); copy.append(title, hint, status, support);
  const controls = node('div', 'island-move-controls'); controls.append(pad, actions);
  const legend = createCoverageLegend();
  bar.append(portrait.element, copy, controls, legend.element);
  container.append(bar);
  return {
    render(model) {
      bar.hidden = !model;
      if (!model) { portrait.render(null); return; }
      portrait.render(model.portrait);
      title.textContent = model.title; hint.textContent = model.line; status.textContent = model.status;
      support.textContent = model.support ?? ''; support.hidden = !support.textContent;
      bar.classList.toggle('is-refused', model.refused); place.textContent = model.placeLabel; place.disabled = !model.ok;
      legend.show(model.coverage, model.coverageDraft);
      pad.setAttribute('aria-label', model.wall ? 'Choose a wall spot on the grass edge' : 'Move one square');
      for (const arrow of arrows) {
        arrow.disabled = !!model.busy;
        const direction = arrow.dataset.direction;
        arrow.setAttribute('aria-label', model.wall ? `Select a free wall spot to the ${direction}` : `One square ${direction}`);
      }
    },
    get element() { return bar; },
    dispose() { portrait.dispose(); bar.remove(); },
  };
}
