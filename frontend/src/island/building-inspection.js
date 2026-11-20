import {node} from '../ui/kit/dom.js';
import {ROLES} from '../campaign/houses.js';
import './building-inspection.css';

export function upgradeComparisonView({before, after, damageUnit, gunnerChanges}) {
  const section = node('section', 'island-upgrade-comparison');
  section.setAttribute('aria-label', 'Next level comparison');
  section.append(node('strong', '', 'Next level comparison'));
  const list = node('dl');
  for (const [field, label, unit] of [
    ['range', 'Clear-weather range', ' units'],
    ['reloadSeconds', 'Reload', ' s'],
    ['damage', `Damage per ${damageUnit}`, ''],
  ]) {
    list.append(node('dt', '', label), node('dd', '', `${before[field]} → ${after[field]}${unit}`));
  }
  section.append(list, node('p', '', 'Applies from the next wave. Weather can shorten sight.'));
  if (before.manned !== after.manned || gunnerChanges.length) {
    const change = after.manned ? 'A Gunner moves here.' : 'The Gunner moves to another tower.';
    section.append(node('p', '', change));
  }
  return section;
}

const namesOf = walls => walls.map(wall => wall.id.replace(/^wall_(\d+)$/, 'Wall $1')).join(', ');
const count = (value, noun) => `${value} ${noun}${value === 1 ? '' : 's'}`;

function supportSummary({role, status, current}) {
  if (status === 'inactive') return 'This saved role is inactive under the current recovery rules.';
  if (status === 'unknown-policy') return 'The island’s recovery rules are unavailable.';
  if (role === 'workshop') return current.beneficiaries.length
    ? `Speeds up wall repair during waves. ${namesOf(current.beneficiaries)} in reach.`
    : 'Speeds up wall repair during waves. No walls are in reach.';
  if (role === 'tavern') return current.beneficiaries?.some(target => target.id === 'you')
    ? 'Captains heal in this area during waves. Your captain is in reach.'
    : 'Captains heal in this area during waves.';
  return current.militiaAtWaveStart
    ? `Deploys ${count(current.militiaAtWaveStart, 'militia unit')} at wave start. The ring shows where they guard.`
    : 'Other Barracks already fill the island’s militia limit.';
}

export function houseSupportView(container, preview) {
  container.replaceChildren();
  container.hidden = !preview;
  if (!preview) return;
  container.append(node('strong', '', `${ROLES[preview.role].name} support`), node('p', '', supportSummary(preview)));
}

export function houseMoveSummary(preview) {
  if (!preview) return '';
  if (!preview.proposed) return `Current position · ${supportSummary(preview)}`;
  const {role, current, proposed, changes} = preview;
  if (role === 'workshop') {
    const summary = `Proposed position · Walls in reach ${current.beneficiaries.length} → ${proposed.beneficiaries.length}.`;
    const differences = [changes.added.length ? `Gains ${namesOf(changes.added)}.` : '',
      changes.removed.length ? `Loses ${namesOf(changes.removed)}.` : ''].filter(Boolean).join(' ');
    return differences ? `${summary} ${differences}` : summary;
  }
  if (role === 'tavern') {
    const here = proposed.beneficiaries?.some(target => target.id === 'you');
    const before = current.beneficiaries?.some(target => target.id === 'you');
    const change = here === before ? '' : here ? ' Your captain enters its reach.' : ' Your captain leaves its reach.';
    return `Proposed position · Captain healing area moves.${change}`;
  }
  return proposed.militiaAtWaveStart === 0 ? 'Proposed position · Other Barracks still fill the militia limit.'
    : `Proposed position · Moves ${count(proposed.militiaAtWaveStart, 'militia post')}.`;
}
