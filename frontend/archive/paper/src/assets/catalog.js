// One catalogue connects original artwork, its map size and its planned gameplay use.
import original from './sets/original.js';
import architecture from './sets/architecture.js';
import shore from './sets/shore.js';
import travel from './sets/travel.js';
import nature from './sets/nature.js';
import mystery from './sets/mystery.js';
import economy from './sets/economy.js';
import characters from './sets/characters.js';
import icons from './sets/icons.js';

export const categories = {
  original: 'Original island', architecture: 'Buildings', shore: 'Coastal life',
  travel: 'Sailing', nature: 'Nature', mystery: 'Mystery objects',
  economy: 'Markets and rewards', characters: 'Characters', icons: 'Interface icons',
};
export const roadmapFeatures = {
  intro: 'Lighthouse introduction', building: 'Personal islands and building',
  sailing: 'Sailing and shared islands', market: 'Island Exchange',
  predictions: 'Prediction markets', sports: 'Sports predictions', arena: 'PvP arena',
  raid: 'Cooperative encounters', mystery: 'Shared mystery and rewards',
  companion: 'Optional companion', weather: 'Weather', presence: 'Shared presence',
};
const sets = { original, architecture, shore, travel, nature, mystery, economy, characters, icons };
export const catalog = Object.entries(sets).flatMap(([category, items]) =>
  items.map(item => ({ ...item, category, file: `${item.id}.svg` })));
export const assetById = Object.fromEntries(catalog.map(item => [item.id, item]));
export const islandArtIds = catalog.filter(item => item.usage === 'island').map(item => item.id);
export const artSizes = Object.fromEntries(catalog.filter(item => item.usage !== 'css').map(item => [item.id, item.size]));
