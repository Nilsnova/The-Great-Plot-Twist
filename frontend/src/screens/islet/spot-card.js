// One spot card of the islet panel. It shows the labels it is given and tells the panel when its button is pressed.
import {node, uniqueId} from '../../ui/kit/dom.js';
import {createButton} from '../../ui/kit/button.js';
import {setText, showText} from './set-text.js';

export function createSpotCard({onBuild}) {
  const element = node('li', 'islet-spot-item');
  const card = node('article', 'islet-spot');
  const head = node('header', 'islet-spot-head');
  const heading = node('h3', 'islet-spot-name');
  const badge = node('span', 'islet-badge');
  const lines = {
    plotName: node('p', 'islet-line islet-plot'), about: node('p', 'islet-line'), cost: node('p', 'islet-line islet-cost'),
    missing: node('p', 'islet-line islet-missing'), note: node('p', 'islet-line islet-detail'),
  };
  let plot = null;

  // Focus moves to the heading first, so it is not lost when the button turns off while the build runs.
  const button = createButton({label: 'Build', onClick() {
    heading.focus();
    onBuild(plot);
  }});
  heading.id = uniqueId('islet-spot');
  heading.tabIndex = -1;
  card.setAttribute('aria-labelledby', heading.id);
  button.element.setAttribute('aria-describedby', heading.id);
  head.append(heading, badge);
  card.append(head, ...Object.values(lines), button.element);
  element.append(card);

  function showButton(labels) {
    button.element.hidden = !labels;
    if (!labels) return;
    if (button.element.textContent !== labels.label) button.update({label: labels.label});
    if (button.element.disabled !== labels.disabled) button.update({disabled: labels.disabled});
  }

  function update(spot, labels) {
    plot = spot.plot;
    card.dataset.plot = spot.plot;
    card.dataset.state = labels.tone;
    badge.dataset.tone = labels.tone;
    setText(heading, spot.name);
    setText(badge, labels.badge);
    showText(lines.plotName, spot.plotName);
    showText(lines.about, spot.about);
    showText(lines.cost, labels.cost);
    showText(lines.missing, labels.missing);
    showText(lines.note, labels.note);
    showButton(labels.button);
  }

  // The button when it can be pressed, otherwise the heading.
  const focusTarget = () => (!button.element.hidden && !button.element.disabled ? button.element : heading);

  return {element, heading, update, focusTarget, dispose() { button.dispose(); element.remove(); }};
}
