// Native pixel sea chart. Dialog focus, buttons and arrows support keyboard travel.
import { places, placeIds } from '../world/places/registry.js';
export function createChart(container, world, travel, focusGame) {
  const dialog = document.createElement('dialog'); dialog.className = 'sea-chart';
  dialog.setAttribute('aria-labelledby', 'chart-title');
  dialog.innerHTML = `<header><div><small>COASTAL SURVEY · 01</small><h2 id="chart-title">The Saltreach Isles</h2></div>
    <button class="chart-close" aria-label="Close sea chart">×</button></header>
    <div class="chart-map"><img alt="Pixel sea chart with marked routes and a northern fog bank" src="${import.meta.env.BASE_URL}places/chart.png">
    ${placeIds.map(id => { const p = places[id]; return `<button data-place="${id}" style="left:${p.chart[0] / 448 * 100}%;top:${p.chart[1] / 256 * 100}%"><i aria-hidden="true"></i><span></span></button>`; }).join('')}</div>
    <footer><p class="chart-status" role="status">Choose a landing.</p><label><input type="checkbox" class="fast-travel"> Fast travel</label></footer>
    <p class="chart-help">Tab or arrow keys to choose · Enter to sail · Esc to close</p>`;
  container.append(dialog);
  const buttons = [...dialog.querySelectorAll('[data-place]')];
  function close() { if (dialog.open) dialog.close(); focusGame(); }
  function refresh() {
    dialog.querySelector('img').src = `${import.meta.env.BASE_URL}places/chart${world.relit ? '-relit' : ''}.png`;
    buttons.forEach(button => {
      const id = button.dataset.place, open = world.canTravel(id);
      button.setAttribute('aria-disabled', String(!open)); button.classList.toggle('locked', !open);
      button.setAttribute('aria-current', String(world.current?.id === id));
      button.querySelector('span').textContent = open ? places[id].name : 'Uncharted islet';
      button.setAttribute('aria-label', `${open ? places[id].name : 'Uncharted islet'}${open ? '' : ', locked'}`);
    });
  }
  buttons.forEach(button => { button.onclick = async () => {
    const id = button.dataset.place;
    if (!world.canTravel(id)) { dialog.querySelector('.chart-status').textContent = 'No safe route through the fog yet.'; return; }
    if (id === world.current?.id) { close(); return; }
    const fast = dialog.querySelector('.fast-travel').checked; close();
    await travel(id, { fast });
  }; });
  dialog.querySelector('.chart-close').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.code === 'KeyM') { event.preventDefault(); event.stopPropagation(); close(); }
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.code)) return;
    event.preventDefault(); event.stopPropagation();
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.code) ? 1 : -1;
    buttons[(buttons.indexOf(document.activeElement) + direction + buttons.length) % buttons.length].focus();
  });
  return { get open() { return dialog.open; }, close,
    show() {
      if (world.busy || dialog.open) return;
      refresh(); const scale = Math.max(1, Math.floor(Math.min((innerWidth - 70) / 448, (innerHeight - 190) / 256)));
      dialog.dataset.scale = String(scale); dialog.style.setProperty('--chart-scale', scale); dialog.showModal();
      buttons.find(b => b.dataset.place === world.current?.id)?.focus();
    },
    dispose() { dialog.close(); dialog.remove(); },
  };
}
