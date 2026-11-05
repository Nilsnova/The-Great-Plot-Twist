// Display supplied wallet, weather and crew data without owning any game rules.
import { node } from './dom.js';
import { formatCoins } from './logic.js';
export function createHudBar(data = {}) {
  const element = node('section','kit-hud-bar'); element.setAttribute('aria-label','Captain status');
  const coins = node('span','kit-coins'), place = node('strong'), weather = node('span'), time = node('time'), seats = node('ol','kit-crew-seats');
  seats.setAttribute('aria-label','Crew seats'); element.append(coins,place,weather,time,seats);
  function update(next) {
    data = {...data,...next}; coins.textContent = `${formatCoins(data.coins)} coins`;
    place.textContent = String(data.place ?? 'At sea'); time.textContent = String(data.time ?? '—');
    weather.textContent = `${({clear:'☀',rain:'☂',fog:'≋',storm:'ϟ'})[data.weather] ?? '·'} ${data.weather ?? 'Weather unknown'}`;
    seats.replaceChildren();
    (data.seats ?? []).forEach((seat,index) => {
      const badge = node('li','kit-seat'); badge.dataset.kind = seat.kind === 'npc' ? 'npc' : 'player';
      badge.append(node('span','kit-seat-number',index+1),node('span','',`${seat.name ?? 'Open seat'} · ${seat.kind === 'npc' ? 'NPC partner' : 'Player'}`)); seats.append(badge);
    });
  }
  update(data); return { element, update, dispose() { element.remove(); } };
}
