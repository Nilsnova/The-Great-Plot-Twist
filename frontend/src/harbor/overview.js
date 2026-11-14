// The "Harbor" overview card and the weather board card. Both are small kit modals with no server calls:
// the overview lists the stalls with one plain sentence each about the real data behind them, and the
// weather board reads the answer net/weather.js already fetched. Loaded lazily by host.js.
import {button, createCard, el} from './dom.js';
import {weatherView} from './weather-model.js';
import {EXPLAIN, OPEN_STALL, TITLES} from './words.js';

// No fortune teller: there is no prediction market in the game (D035, 11 Nov).
export const STALLS = ['market', 'match', 'weather', 'duel'];

export function createOverviewCard({container, resetInput, focusGame, openStall}) {
  const card = createCard({title: TITLES.harbor, kind: 'overview', resetInput, focusGame});
  function render() {
    const listNode = el('ul', 'harbor-stalls');
    for (const id of STALLS) {
      const item = el('li', 'harbor-stall');
      const heading = el('h3', 'harbor-item-title', TITLES[id]); heading.id = `harbor-stall-${id}`;
      item.setAttribute('aria-labelledby', heading.id); item.dataset.stall = id;
      item.append(heading, el('p', '', EXPLAIN[id]));
      if (id !== 'duel') {
        const open = button(OPEN_STALL(TITLES[id]), () => { card.close(); openStall(id); });
        open.dataset.key = `stall:${id}`; item.append(open);
      }
      listNode.append(item);
    }
    card.main.replaceChildren(listNode);
  }
  return {get active() { return card.active; }, open() { render(); card.open(container); }, close: () => card.close(), dispose: () => card.dispose()};
}

export function createWeatherCard({container, resetInput, focusGame, getWeather}) {
  const card = createCard({title: TITLES.weather, kind: 'weather', resetInput, focusGame});
  function render() {
    const view = weatherView(getWeather?.() ?? null);
    const item = el('article', 'harbor-item harbor-weather-item');
    item.dataset.weather = view.state;
    const icon = el('span', 'harbor-weather-icon', view.icon); icon.setAttribute('aria-hidden', 'true');
    const pirates = el('p', 'harbor-pirates'); pirates.append(icon, ' ', view.pirates);
    item.append(el('p', 'harbor-weather-now', view.line), pirates);
    if (view.old) item.append(el('p', 'harbor-quiet', view.old));
    // T46: where a wave takes its weather from, and tonight's forecast as words only (D045).
    if (view.tonight) item.append(el('p', 'harbor-weather-tonight', view.tonight));
    item.append(el('p', 'harbor-quiet', view.waves));
    const credit = el('p', 'harbor-footnote');
    const source = el('a', '', view.credit.text), licence = el('a', '', view.credit.licenceText);
    for (const [link, href] of [[source, view.credit.href], [licence, view.credit.licenceHref]]) {
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
    credit.append(source, ' (', licence, ')');
    card.main.replaceChildren(item, credit);
  }
  return {get active() { return card.active; }, open() { render(); card.open(container); }, close: () => card.close(), dispose: () => card.dispose()};
}
