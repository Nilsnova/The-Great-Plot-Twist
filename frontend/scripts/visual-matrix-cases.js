// Developer-only review cases use the game's real frame selection; they never mutate a save.
import {buildingArt} from '../src/island/world.js';
import {towerFrame} from '../src/pirates/render.js';
import {getRasterFrame} from '../src/art/village-raster.js';

export const LEVELS = [1, 2, 3, 4, 5];
export const DEFENSES = ['cannon', 'mortar', 'harpoon', 'culverin', 'swivel'];
export const STATES = ['intact', 'fire', 'damaged', 'broken'];
export function defenseCases(kind) {
  if (!DEFENSES.includes(kind)) throw new Error('Select an existing defense family.');
  return STATES.map(state => ({label: state, cells: LEVELS.map(level => ({
    label: `Level ${level}`, id: towerFrame(kind, level, state === 'fire', id => !!getRasterFrame(id), state === 'fire' ? 'intact' : state),
  }))}));
}
export function buildingCases() {
  const house = role => ({label: role || 'house', cells: [1, 2, 3].map(level => ({
    label: `Level ${level}`, id: buildingArt('house', level, role),
  }))});
  return [house(null), ...['barracks', 'tavern', 'workshop'].map(house),
    {label: 'watchtower', cells: LEVELS.map(level => ({label: `Level ${level}`, id: buildingArt('watchtower', level)}))},
    {label: 'core', cells: ['island_core', 'island_core_damaged', 'island_core_broken'].map((id, i) => ({label: ['intact', 'damaged', 'broken'][i], id}))},
    {label: 'services', cells: ['cabin', 'island-bell', 'island-techhub', 'island-arsenal'].map(id => ({label: id, id}))}];
}
const cells = [[-4,-2],[-2,-2],[0,-2],[2,-2],[4,-2],[-4,0],[4,0],[-4,2],[-2,2],[0,2],[2,2],[4,2],[-2,0]];
export function wallCases(level) {
  if (!LEVELS.includes(level)) throw new Error('Select wall level 1–5.');
  return ['intact', 'damaged', 'broken', 'selected', 'mixed'].map(state => ({
    label: state, selected: state === 'selected' ? 'wall_3' : null,
    spots: cells.map(([x, z], index) => ({id: `wall_${index + 1}`, kind: 'wall', built: true, x, z,
      level: state === 'mixed' && index % 2 ? Math.max(1, level - 1) : level,
      ...(index === 2 && state === 'damaged' ? {look: 'damaged', hp: 50} : {}),
      ...(index === 2 && state === 'broken' ? {broken: true, hp: 0} : {}),
    })),
  }));
}
