// The bar of Move mode (T36, flexible placement): a parchment strip at the bottom of the screen with what is
// moved, whether the square is free, four arrow buttons (one square each, big enough for a thumb) and
// Place here / Cancel. It shows models from move-mode.js (moveModel) and calls back; it decides nothing.
// The island stays in view above it, so a tap on the ground picks the square. Used by index.js.
import {node} from '../ui/kit/dom.js';
import {buildingArt} from './world.js';
import * as textures from '../art/textures.js';
import './move-bar.css';

const ARROWS = Object.freeze([['←', 'One square west', -1, 0], ['↑', 'One square north', 0, -1], ['↓', 'One square south', 0, 1], ['→', 'One square east', 1, 0]]);

function button(label, onClick, className) {
  const element = node('button', `kit-button ${className}`, label); element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

async function sharedPortrait(id) {
  // The approved PNG pipeline prepares sources asynchronously; the pinned procedural baseline has
  // frameCanvas only. Both paths use the renderer's actual frame, never a separate thumbnail.
  const paint = Reflect.get(textures, 'paintIds');
  if (!paint) return textures.frameCanvas(id, 2);
  let frame = null;
  await paint([id], 2, (_id, canvas) => { frame = canvas; });
  return frame;
}

// handlers: {nudge(dx, dz), place(), cancel()}. render(model) shows the bar, render(null) hides it.
export function createMoveBar({container, handlers = {}, loadPortrait = sharedPortrait}) {
  const bar = node('section', 'island-move-bar island-reference-move'); bar.hidden = true; bar.setAttribute('aria-label', 'Move a building');
  const portrait = node('div', 'island-move-portrait'); portrait.setAttribute('aria-hidden', 'true');
  const neutral = () => portrait.replaceChildren(node('span', '', '◇'));
  neutral();
  let requested = '', cachedId = '', cachedFrame = null, selection = 0;
  function showPortrait(value) {
    const id = value ? buildingArt(value.kind, value.level, value.spec) : null;
    if (id === requested) return;
    requested = id; const token = ++selection; neutral();
    if (!id) return;
    if (id === cachedId) { portrait.replaceChildren(cachedFrame); return; }
    Promise.resolve().then(() => loadPortrait(id)).then(frame => {
      if (token !== selection || !frame) return;
      cachedId = id; cachedFrame = frame; portrait.replaceChildren(frame);
    }).catch(() => { if (token === selection) neutral(); });
  }
  const title = node('strong', 'island-move-title'), hint = node('p', 'island-move-line');
  const status = node('p', 'island-move-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const pad = node('div', 'island-move-pad'); pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', 'Move one square');
  const arrows = [];
  for (const [label, name, dx, dz] of ARROWS) {
    const arrow = button(label, () => handlers.nudge?.(dx, dz), 'kit-quiet island-move-arrow'); arrow.setAttribute('aria-label', name);
    arrow.dataset.direction = name.split(' ').at(-1); pad.append(arrow); arrows.push(arrow);
  }
  const place = button('Place here', () => handlers.place?.(), 'island-move-place');
  const cancel = button('Cancel', () => handlers.cancel?.(), 'kit-quiet island-move-cancel');
  const actions = node('div', 'island-move-actions'); actions.append(cancel, place);
  const copy = node('div', 'island-move-copy'); copy.tabIndex = 0; copy.setAttribute('aria-label', 'Move details'); copy.append(title, hint, status);
  const controls = node('div', 'island-move-controls'); controls.append(pad, actions);
  bar.append(portrait, copy, controls);
  container.append(bar);
  return {
    render(model) {
      bar.hidden = !model;
      if (!model) { requested = ''; selection++; neutral(); return; }
      showPortrait(model.portrait);
      title.textContent = model.title; hint.textContent = model.line; status.textContent = model.status;
      bar.classList.toggle('is-refused', model.refused); place.textContent = model.placeLabel; place.disabled = !model.ok;
      for (const arrow of arrows) arrow.disabled = !!model.busy;
    },
    get element() { return bar; },
    dispose() { selection++; cachedFrame = null; neutral(); bar.remove(); },
  };
}
