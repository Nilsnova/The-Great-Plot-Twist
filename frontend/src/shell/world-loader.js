// Keep the large world's preload inventory out of the title entry.
export const loadGameModule = () => import('../game.js');
export const loadFestivalModule = () => import('../screens/festival/entry.js');

export const loadAfterPaintModule=()=>import('./after-paint.js');
