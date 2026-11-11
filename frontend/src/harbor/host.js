// The Harbor in the running game: the "Harbor" menu entry, the overview card and the weather board.
// The market, match and fortune cards keep their own hosts in game.js (online/market-host.js,
// screens/sports/index.js, online/predictions-entry.js), which load the cards of this folder.
//   const harbor = createHarbor({container, resetInput, focusGame, getWeather, openStall, notify});
//   harbor.openOverview(); harbor.openWeather(); harbor.active; harbor.close(); harbor.dispose();
// Kept tiny on purpose: game.js imports it at start, the cards load on first use.
import {addMenuExtras} from '../shell/menu-extras.js';

export const loadMarketCard = () => import('./market-card.js');
export const loadMatchCard = () => Promise.all([import('../screens/sports/http.js'), import('./match-card.js')]);
export const loadFortuneCard = () => import('./fortune-card.js');

export function createHarbor({container, resetInput, focusGame, getWeather, openStall, notify,
  load = () => import('./overview.js'), menu = addMenuExtras}) {
  let cards = null, pending = null, disposed = false;
  async function ready() {
    pending ??= load().then(module => {
      if (disposed) return null;
      const shared = {container, resetInput, focusGame};
      cards = {overview: module.createOverviewCard({...shared, openStall: id => (id === 'weather' ? show('weather') : openStall(id))}),
        weather: module.createWeatherCard({...shared, getWeather})};
      return cards;
    }).catch(() => { pending = null; notify?.('The harbor could not open. Try again.'); return null; });
    return pending;
  }
  async function show(name) { const loaded = await ready(); if (loaded && !disposed) loaded[name].open(); }
  const stopMenu = menu(() => [{label: 'Harbor', onSelect: () => void show('overview')}]);
  return {
    openOverview: () => show('overview'), openWeather: () => show('weather'),
    get active() { return Boolean(cards?.overview.active || cards?.weather.active); },
    close() { cards?.overview.close(); cards?.weather.close(); },
    dispose() { if (disposed) return; disposed = true; stopMenu?.(); cards?.overview.dispose(); cards?.weather.dispose(); },
  };
}
