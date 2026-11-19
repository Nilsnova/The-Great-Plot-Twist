// A view of the existing build model, never a purchase/recovery controller or modal focus trap.
import {node} from '../ui/kit/dom.js';
import {activeRole, ROLES} from '../campaign/houses.js';
import {SPECS} from '../campaign/tech.js';
import {createBuildingPortrait} from './building-portrait.js';
import {houseSupportView} from './building-inspection.js';
import './selection-dock.css';

export const canDockSelection = model => model?.built === true && !!model.kind
  && (model.kind !== 'wall' || (!model.tree && model.mode !== 'repair' && !model.recovery?.visible && !model.recovery?.actionPending));

const TARGET_NAMES = {ships: 'ships', 'sailing-ships': 'sailing ships', boarders: 'boarders'};

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
  const level = node('span', 'island-selection-level'), hp = node('p', 'island-selection-health');
  const spec = node('span', 'island-selection-spec');
  const identity = node('p', 'island-selection-identity'); identity.append(level, spec);
  const meter = node('div', 'island-selection-meter'), fill = node('span'); meter.setAttribute('role', 'meter'); meter.setAttribute('aria-label', 'Building health'); meter.append(fill);
  copy.append(title, identity, hp, meter);
  const actions = node('div', 'island-selection-actions'), messages = node('div', 'island-selection-messages');
  const support = node('section', 'island-house-support');
  const coverageRow = node('div', 'island-selection-coverage');
  const coverageCopy = node('p', ''); coverageCopy.setAttribute('role', 'status');
  const views = node('div', 'island-selection-views'); views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'Village camera');
  for (const [label, action, name] of [['Work', 'work', 'Working village view'], ['Fit', 'fit', 'Fit village']]) {
    const view = node('button', 'kit-button kit-quiet', label); view.type = 'button'; view.setAttribute('aria-label', name);
    view.addEventListener('click', () => handlers.camera?.(action));
    views.append(view);
  }
  coverageRow.id = 'island-selection-coverage'; coverageRow.hidden = true; coverageRow.append(coverageCopy, views);
  let model, handlers, rangeShown = false;
  const updateRange = () => {
    const coverage = model.coverage;
    range.hidden = !coverage;
    range.setAttribute('aria-pressed', String(rangeShown));
    coverageRow.hidden = !rangeShown;
    views.hidden = !handlers.camera;
    coverageCopy.textContent = rangeShown ? `Clear-weather range ${coverage.range} units · ${coverage.targets.map(key => TARGET_NAMES[key]).join(' and ')}${coverage.minRange ? ` · Starts at ${coverage.minRange} units` : ''}` : '';
  };
  const make = (label, key, quiet, callback) => {
    const button = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label); button.type = 'button'; button.dataset.focus = key;
    button.addEventListener('click', callback); actions.append(button); return button;
  };
  const move = make('Move', 'move', true, () => handlers.move?.(model.spotId));
  const upgrade = make('Upgrade', 'upgrade', false, () => handlers.upgrade?.(model.spotId));
  const range = make('Range', 'range', true, () => { rangeShown = !!model.coverage && !rangeShown; updateRange(); });
  range.setAttribute('aria-controls', coverageRow.id);
  const details = make('Details', 'details', true, onDetails), close = make('Close', 'close', true, onClose);
  element.append(portrait.element, copy, actions, messages, coverageRow, support); container.append(element);
  return {
    element,
    get coverage() { return rangeShown ? model?.coverage ?? null : null; },
    render(next, on) {
      const changed = model?.spotId !== next.spotId; model = next; handlers = on;
      if (changed || !model.coverage) rangeShown = false;
      element.classList.toggle('is-structure', model.kind !== 'wall');
      title.textContent = model.title; level.textContent = `Level ${model.level}`;
      const role = activeRole(model);
      spec.textContent = ROLES[role]?.name ?? SPECS[model.skills?.current]?.name ?? '';
      spec.hidden = !spec.textContent;
      portrait.render({kind: model.kind, level: model.level, spec: model.spec});
      const health = model.recovery, stale = model.recoveryLevel !== undefined && model.recoveryLevel !== model.level;
      const known = !stale && Number.isFinite(health?.actualHp) && Number.isFinite(health?.maxHP)
        && health.actualHp >= 0 && health.maxHP > 0 && health.actualHp <= health.maxHP;
      const fallback = model.kind === 'wall' && !health ? model.stats : '';
      hp.textContent = known ? health.hpLabel ?? `${health.actualHp} / ${health.maxHP} HP`
        : health?.message ?? (stale ? 'Loading building health…' : fallback);
      hp.hidden = !hp.textContent;
      if (health?.status === 'error') hp.setAttribute('role', 'alert'); else hp.removeAttribute('role');
      meter.hidden = !known;
      if (known) {
        meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', String(health.maxHP));
        meter.setAttribute('aria-valuenow', String(health.actualHp)); meter.setAttribute('aria-valuetext', hp.textContent);
        fill.style.width = `${100 * health.actualHp / health.maxHP}%`;
      }
      move.hidden = !model.move || !handlers.move; move.disabled = !!model.move?.disabled;
      upgrade.hidden = !!model.tree || model.mode !== 'upgrade' || !handlers.upgrade; upgrade.disabled = model.disabled;
      upgrade.textContent = model.upgradePrice ? `${model.button} · ${model.upgradePrice}` : model.button;
      if (!model.coverage && (document.activeElement === range || views.contains(document.activeElement))) details.focus({preventScroll: true});
      updateRange();
      houseSupportView(support, model.houseSupport);
      messages.replaceChildren();
      for (const [text, alert] of [[model.tree ? '' : model.reason], [model.tree ? '' : model.soon], [model.message, true]]) {
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
