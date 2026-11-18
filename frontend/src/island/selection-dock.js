// A view of the existing build model, never a purchase/recovery controller or modal focus trap.
import {node} from '../ui/kit/dom.js';
import {createBuildingPortrait} from './building-portrait.js';
import './selection-dock.css';

export const canDockSelection = model => model?.built === true && model.kind === 'wall' && !model.tree
  && model.mode !== 'repair' && !model.recovery?.visible && !model.recovery?.actionPending;

export function holdOtherBuildingAction(model, busySpot) {
  if (!busySpot || busySpot === model.spotId) return model;
  return {...model, disabled: true, reason: 'Another building action is in progress.',
    choices: model.choices?.map(choice => ({...choice, disabled: true})),
    skills: model.skills ? {...model.skills, choices: model.skills.choices.map(choice => ({...choice, disabled: true}))} : null,
    tree: model.tree ? {...model.tree, detail: {...model.tree.detail, disabled: true, reason: 'Another building action is in progress.'}} : null,
    move: model.move ? {...model.move, disabled: true} : null,
    demolish: model.demolish ? {...model.demolish, disabled: true} : null};
}

export function createSelectionDock({container, onClose, onDetails, loadPortrait}) {
  const element = node('section', 'island-selection-dock'); element.setAttribute('aria-label', 'Selected building');
  const portrait = createBuildingPortrait({className: 'island-selection-portrait', loadPortrait});
  const copy = node('div', 'island-selection-copy'), title = node('strong', 'island-selection-title');
  const level = node('p', 'island-selection-level'), hp = node('p', 'island-selection-health');
  const meter = node('div', 'island-selection-meter'), fill = node('span'); meter.setAttribute('role', 'meter'); meter.setAttribute('aria-label', 'Building health'); meter.append(fill);
  copy.append(title, level, hp, meter);
  const actions = node('div', 'island-selection-actions'), messages = node('div', 'island-selection-messages');
  let model, handlers;
  const make = (label, key, quiet, callback) => {
    const button = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label); button.type = 'button'; button.dataset.focus = key;
    button.addEventListener('click', callback); actions.append(button); return button;
  };
  const move = make('Move', 'move', true, () => handlers.move?.(model.spotId));
  const upgrade = make('Upgrade', 'upgrade', false, () => handlers.upgrade?.(model.spotId));
  const details = make('Details', 'details', true, onDetails), close = make('Close', 'close', true, onClose);
  element.append(portrait.element, copy, actions, messages); container.append(element);
  return {
    element,
    render(next, on) {
      const changed = model?.spotId !== next.spotId; model = next; handlers = on;
      title.textContent = model.title; level.textContent = `Level ${model.level}`;
      portrait.render({kind: model.kind, level: model.level, spec: model.spec});
      const health = model.recovery, stale = model.recoveryLevel !== undefined && model.recoveryLevel !== model.level;
      const known = !stale && Number.isFinite(health?.actualHp) && Number.isFinite(health?.maxHP)
        && health.actualHp >= 0 && health.maxHP > 0 && health.actualHp <= health.maxHP;
      const fallback = health ? '' : model.stats;
      hp.textContent = known ? health.hpLabel ?? `${health.actualHp} / ${health.maxHP} HP`
        : health?.message ?? (stale ? 'Loading building health…' : fallback || 'Health is unavailable.');
      if (health?.status === 'error') hp.setAttribute('role', 'alert'); else hp.removeAttribute('role');
      meter.hidden = !known;
      if (known) {
        meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', String(health.maxHP));
        meter.setAttribute('aria-valuenow', String(health.actualHp)); meter.setAttribute('aria-valuetext', hp.textContent);
        fill.style.width = `${100 * health.actualHp / health.maxHP}%`;
      }
      move.hidden = !model.move || !handlers.move; move.disabled = !!model.move?.disabled;
      upgrade.hidden = model.mode !== 'upgrade'; upgrade.disabled = model.disabled;
      upgrade.textContent = model.upgradePrice ? `${model.button} · ${model.upgradePrice}` : model.button;
      messages.replaceChildren();
      for (const [text, alert] of [[model.reason], [model.soon], [model.message, true]]) {
        if (!text) continue;
        const line = node('p', '', text); if (alert) line.setAttribute('role', 'alert'); messages.append(line);
      }
      messages.hidden = !messages.children.length;
      if (changed) close.focus({preventScroll: true});
    },
    focusDetails() { details.focus({preventScroll: true}); },
    dispose() { portrait.dispose(); element.remove(); },
  };
}
