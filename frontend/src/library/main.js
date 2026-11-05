// The review workshop uses the same catalogue as the game, without loading WebGL.
import './styles.css';
import { catalog, categories, roadmapFeatures, assetById } from '../assets/catalog.js';

const select = query => document.querySelector(query);
const state = { category: 'all', search: '', feature: 'all', usage: 'all' };
const assetUrl = item => `${import.meta.env.BASE_URL}art/${item.file}`;
const uses = { island: 'In Lighthouse Isle', library: 'Staged library', css: 'Page texture' };
select('#totals').textContent = `${catalog.length} drawings · ${catalog.filter(a => a.usage === 'island').length} in the island kit`;
select('#feature').insertAdjacentHTML('beforeend', Object.entries(roadmapFeatures).map(([id, label]) => `<option value="${id}">${label}</option>`).join(''));
select('#categories').innerHTML = [['all', 'Everything'], ...Object.entries(categories)].map(([id, label]) =>
  `<button data-category="${id}" aria-pressed="${id === 'all'}">${label}<span>${id === 'all' ? catalog.length : catalog.filter(a => a.category === id).length}</span></button>`).join('');

function render() {
  const items = catalog.filter(item => (state.category === 'all' || item.category === state.category)
    && (state.feature === 'all' || item.roadmap.includes(state.feature))
    && (state.usage === 'all' || item.usage === state.usage)
    && `${item.label} ${item.id} ${item.roadmap.join(' ')}`.toLowerCase().includes(state.search));
  select('#category-title').textContent = state.category === 'all' ? 'The full collection' : categories[state.category];
  select('#result-count').textContent = `${items.length} ${items.length === 1 ? 'drawing' : 'drawings'}`;
  select('#empty').hidden = items.length > 0;
  select('#gallery').innerHTML = items.map(item => `<button class="asset-card" data-asset="${item.id}" aria-label="Inspect ${item.label}">
    <span class="art-window"><img loading="lazy" decoding="async" src="${assetUrl(item)}" alt="${item.label}"></span>
    <span class="card-caption"><strong>${item.label}</strong><small>${uses[item.usage]}</small></span></button>`).join('');
}
function inspect(id) {
  const item = assetById[id], [width, height, anchor] = item.size;
  select('#detail-title').textContent = item.label;
  select('#detail-category').textContent = categories[item.category];
  select('#detail-image').src = assetUrl(item); select('#detail-image').alt = item.label;
  select('#scale-study').innerHTML = [32, 64, 96].map(size => `<figure><img src="${assetUrl(item)}" alt="${item.label} at ${size} pixels" style="width:${size}px;height:${size}px"><figcaption>${size} px</figcaption></figure>`).join('');
  const scale = Math.min(300 / width, 300 / height);
  select('.preview-sheet').style.width = `${width * scale}px`;
  select('.preview-sheet').style.height = `${height * scale}px`;
  select('.anchor').style.top = `${(1 - anchor) * 100}%`;
  select('#detail-description').textContent = item.roadmap.map(id => roadmapFeatures[id]).join(' · ');
  select('#metadata').innerHTML = `<dt>Use</dt><dd>${uses[item.usage]}</dd><dt>Map size</dt><dd>${width} × ${height} units</dd><dt>Anchor</dt><dd>Centre X, ${(anchor * 100).toFixed(1)}% from bottom</dd><dt>File</dt><dd>${item.file}</dd>`;
  select('#source-link').href = assetUrl(item); select('#detail').showModal();
}
select('#categories').onclick = event => {
  const button = event.target.closest('[data-category]'); if (!button) return;
  state.category = button.dataset.category;
  document.querySelectorAll('[data-category]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  render();
};
select('#gallery').onclick = event => { const card = event.target.closest('[data-asset]'); if (card) inspect(card.dataset.asset); };
select('#search').oninput = event => { state.search = event.target.value.toLowerCase().trim(); render(); };
for (const id of ['feature', 'usage']) select(`#${id}`).onchange = event => { state[id] = event.target.value; render(); };
document.querySelectorAll('[data-mode]').forEach(button => { button.onclick = () => {
  document.body.dataset.mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}; });
select('.close-detail').onclick = () => select('#detail').close();
select('#detail').onclick = event => { if (event.target === select('#detail')) select('#detail').close(); };
select('#show-anchor').onchange = event => { select('.anchor').hidden = !event.target.checked; };
render();
