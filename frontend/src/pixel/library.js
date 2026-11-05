// Review the active pixel kit at crisp integer magnifications, without loading WebGL.
import './library.css';
import { pixelArt } from './catalog.js';
const select = query => document.querySelector(query), url = item => `${import.meta.env.BASE_URL}pixel/${item.file}`;
const title = id => id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
const nature = ['birch', 'birch-tall', 'oak', 'pine', 'rock', 'shrub', 'flowers', 'grass-tuft', 'fern', 'reeds', 'mushrooms'];
const family = id => id.startsWith('explorer') ? 'characters' : nature.includes(id) ? 'nature' : ['cottage', 'cottage-glow', 'cottage-interior', 'boathouse', 'lighthouse', 'harbour-office', 'harbour-beacon', 'signal-station','jail','market-hall','prediction-kiosk','sports-pavilion','cabin','workshop','greenhouse','windmill','back-room','low-tide-cave','arena-gate','raid-arch','watchtower-ruin','salvage-yard','harbour-office-glow'].includes(id) ? 'buildings' : 'props';
select('#totals').textContent = `${pixelArt.length} original sprites · ${pixelArt.filter(item => item.usage === 'island').length} active · ${pixelArt.filter(item => item.usage === 'library').length} place/story library · 9 backgrounds/charts`;
function render() {
  const query = select('#search').value.trim().toLowerCase(), category = select('#category').value, usage = select('#usage').value;
  const items = pixelArt.filter(item => title(item.id).toLowerCase().includes(query) && (category === 'all' || family(item.id) === category) && (usage === 'all' || item.usage === usage));
  select('#count').textContent = `${items.length} ${items.length === 1 ? 'drawing' : 'drawings'} · click to inspect native pixels`;
  select('#gallery').innerHTML = items.map(item => { const scale = Math.max(1, Math.min(4, Math.floor(224 / item.height), Math.floor(200 / item.width)));
    return `<button class="sprite-card" data-id="${item.id}" aria-label="Inspect ${title(item.id)}"><span class="sprite-window"><img src="${url(item)}" alt="${title(item.id)}" width="${item.width * scale}" height="${item.height * scale}" loading="lazy"></span><strong>${title(item.id)}</strong><small>${item.width} × ${item.height} px · ${scale}× · ${item.usage === 'library' ? 'place/story' : 'island'}</small></button>`;
  }).join('');
}
select('#search').oninput = render; select('#category').onchange = render; select('#usage').onchange = render;
select('#gallery').onclick = event => {
  const card = event.target.closest('[data-id]'); if (!card) return;
  const item = pixelArt.find(item => item.id === card.dataset.id);
  const scale = Math.max(1, Math.min(6, Math.floor(360 / item.height), Math.floor((innerWidth - 100) / item.width)));
  select('#detail-title').textContent = title(item.id); const image = select('#detail-image');
  image.src = url(item); image.alt = title(item.id); image.width = item.width * scale; image.height = item.height * scale;
  select('#detail-meta').textContent = `${item.usage === 'library' ? 'Place/story library' : 'Lighthouse kit'} · ${item.width} × ${item.height} px · ${scale}× integer preview · ${item.size[0]} × ${item.size[1]} world units`;
  select('#source').href = url(item); select('#detail').showModal();
};
select('#close').onclick = () => select('#detail').close(); render();
