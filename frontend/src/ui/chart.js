// Native pixel sea chart. Dialog focus, buttons and arrows support keyboard travel.
import { places, placeIds } from '../world/places/registry.js';
export function createChart(container, world, travel, focusGame) {
  const dialog = document.createElement('dialog'); dialog.className = 'sea-chart';
  dialog.setAttribute('aria-labelledby', 'chart-title');
  dialog.innerHTML = `<header><div><small>COASTAL SURVEY · 01</small><h2 id="chart-title">The Saltreach Isles</h2></div>
    <button class="chart-close" aria-label="Close sea chart">×</button></header>
    <div class="chart-scroll"><div class="chart-map"><img alt="Pixel sea chart with marked routes and a northern fog bank" src="${import.meta.env.BASE_URL}places/chart.png">
    ${placeIds.map(id => `<button data-place="${id}"><i aria-hidden="true"></i><span></span></button>`).join('')}</div></div>
    <footer><p class="chart-status" role="status">Choose a landing.</p><label><input type="checkbox" class="fast-travel"> Fast travel</label></footer>
    <p class="chart-help">Tab or arrow keys to choose · Enter to sail · Esc to close</p>`;
  container.append(dialog);
  let partners=[],hasStar=false;
  const lines=document.createElementNS('http://www.w3.org/2000/svg','svg');lines.setAttribute('viewBox','0 0 448 256');lines.setAttribute('aria-label','Partner journeys');lines.setAttribute('role','img');lines.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';dialog.querySelector('.chart-map').append(lines);
  function drawPartners(){lines.replaceChildren();for(const partner of partners){const line=partner.life?.chartLine;if(!line?.active)continue;const path=document.createElementNS(lines.namespaceURI,'line');for(const [key,value] of Object.entries({x1:line.from.x,y1:line.from.y,x2:line.to.x,y2:line.to.y,stroke:'#f3d58c','stroke-width':2,'stroke-dasharray':'4 3'}))path.setAttribute(key,String(value));const title=document.createElementNS(lines.namespaceURI,'title');title.textContent=`${partner.name}: ${line.label}`;path.append(title);lines.append(path);}}
  const buttons = [...dialog.querySelectorAll('[data-place]')];
  buttons.forEach(button => {
    const place = places[button.dataset.place];
    button.style.left = `${place.chart[0] / 448 * 100}%`;
    button.style.top = `${place.chart[1] / 256 * 100}%`;
  });
  function close() { if (dialog.open) dialog.close(); focusGame(); }
  function refresh() {drawPartners();
    dialog.querySelector('img').src = `${import.meta.env.BASE_URL}places/chart${world.relit ? '-relit' : ''}.png`;
    buttons.forEach(button => {
      const id = button.dataset.place, open = world.canTravel(id);
      button.setAttribute('aria-disabled', String(!open)); button.classList.toggle('locked', !open);
      button.setAttribute('aria-current', String(world.current?.id === id));
      button.querySelector('span').textContent = open ? places[id].name+(id==='home_islet'&&hasStar?' ★':'') : 'Uncharted islet';
      button.setAttribute('aria-label', `${open ? places[id].name+(id==='home_islet'&&hasStar?' ★':'') : 'Uncharted islet'}${open ? '' : ', locked'}`);
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
  return {setKeepsakes(value){hasStar=(value??[]).some(item=>item.id==='keepers_star'&&item.owned);},setPartners(value){partners=value??[];if(dialog.open)drawPartners();}, get open() { return dialog.open; }, close,
    show() {
      if (world.busy || dialog.open) return;
      refresh(); const scale = Math.max(1, Math.floor(Math.min((innerWidth - 70) / 448, (innerHeight - 190) / 256)));
      dialog.dataset.scale = String(scale); dialog.style.setProperty('--chart-scale', scale); dialog.showModal();
      buttons.find(b => b.dataset.place === world.current?.id)?.focus();
    },
    dispose() { dialog.close(); dialog.remove(); },
  };
}
