// Local DOM interface: masthead, place toast, interaction prompt, controls and visual debug settings.
import { node } from './kit/dom.js';
import { places } from '../world/places/registry.js';
import { settings } from '../config.js';
import { getWeather, presets, setWeather } from '../world/weather.js';
import './quiet-hud.css';

const names = Object.fromEntries(Object.values(places).flatMap(p => p.zones.map(z => [z.id, z.name])));
export function createHud(container, actions) {
  let disposed=false;
  const overlay = document.createElement('div'); overlay.className = 'hud hud-quiet';
  overlay.innerHTML = `
    <header class="masthead"><span class="wordmark" aria-hidden="true"><span class="mark">✦</span> <span class="hud-brand">Saltreach</span></span>
      <div class="chapter"><span class="status-dot"></span> Saltreach Harbor </div></header>
    <div class="location" hidden><span class="eyebrow">YOU HAVE ARRIVED</span><strong>Saltreach Harbor</strong><span>Meet the captains and explore the isles.</span></div>
    <div class="interact" role="status" hidden><kbd>E</kbd><div><small>Press E</small><strong></strong></div><span aria-hidden="true">↗</span></div>
    <div class="toast" role="status" hidden></div>
    <div class="hud-actions"><button class="controls-toggle" aria-expanded="false">Controls</button><button class="hud-menu">Menu</button></div>
    <footer class="bottom-bar"><div class="controls" hidden><span><kbd>W A S D</kbd> move</span><span><kbd>⇧</kbd> run</span><span><kbd>E</kbd> interact</span><span><kbd>SCROLL</kbd> zoom</span><button class="chart-toggle" aria-label="Open sea chart">Sea chart <kbd>M</kbd></button></div>
      <div class="conditions"><span class="weather-label">Fair skies</span><span class="divider"></span><time>18:24</time><button class="settings-toggle" aria-label="Open visual settings" aria-expanded="false">☷</button></div></footer>
    <section class="debug" aria-label="Visual settings" hidden>
      <div class="panel-heading"><strong>Island atmosphere</strong><button class="close-settings" aria-label="Close visual settings">×</button></div>
      <label for="hour">Time of day <span class="hour-value"></span></label><input id="hour" type="range" min="0" max="23.99" step="0.01" value="${settings.hour}">
      <div class="preset-buttons">${Object.keys(presets).map((name, i) => `<button data-preset="${name}">${i + 1} ${name}</button>`).join('')}</div>
      <label for="quality">Quality</label><select id="quality"><option value="high">High · full weather</option><option value="low">Low · lighter weather</option></select>
      <label class="check"><input id="fast-time" type="checkbox"> Speed up time <kbd>T</kbd></label>
      <p class="settings-note">Try midnight, sea mist or a passing storm.</p>
      ${import.meta.env.DEV ? '<output class="performance">Measuring rendering…</output>' : ''}
    </section>`;
  // Signed-out players see no account text up here; Settings > Account keeps the captain details.
  const captain=node('div','captain-status'),captainName=node('strong'),save=node('span');captainName.hidden=true;save.hidden=true;save.setAttribute('role','status');captain.append(captainName,save);overlay.querySelector('.masthead').append(captain);
  container.append(overlay);
  const controls=overlay.querySelector('.controls'),controlsToggle=overlay.querySelector('.controls-toggle');
  controls.setAttribute('aria-label','Game controls');controls.id='island-controls';controlsToggle.setAttribute('aria-controls',controls.id);
  function toggleControls(open){controls.hidden=open===undefined?!controls.hidden:!open;controlsToggle.setAttribute('aria-expanded',String(!controls.hidden));}
  controlsToggle.onclick=()=>toggleControls();
  overlay.querySelector('.hud-menu').onclick=()=>{toggleControls(false);(actions.menu??actions.settings)?.();};
  function closeQuickPanels(){if(document.querySelector('dialog[open]')||controls.hidden)return false;toggleControls(false);controlsToggle.focus({preventScroll:true});return true;}
  const escape=event=>{if(event.key==='Escape'&&!event.repeat&&closeQuickPanels()){event.preventDefault();event.stopImmediatePropagation();}};
  window.addEventListener('keydown',escape,true);
  const timers = [];
  const select = selector => overlay.querySelector(selector);
  const panel = select('.debug'), toggle = select('.settings-toggle');
  select('.chapter').setAttribute('role','status');select('.chapter').setAttribute('aria-atomic','true');
  if(actions.settings){toggle.removeAttribute('aria-expanded');toggle.setAttribute('aria-haspopup','dialog');}
  function togglePanel(open) {
    panel.hidden = open === undefined ? !panel.hidden : !open;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (panel.hidden) actions.focus();
  }
  select('.chart-toggle').onclick = () => actions.chart();
  toggle.onclick = () => actions.settings ? actions.settings() : togglePanel(); select('.close-settings').onclick = () => togglePanel(false);
  function start() {
    select('.location').hidden = false;
    overlay.classList.add('exploring'); actions.start();
    timers.push(window.setTimeout(() => { select('.location').hidden = true; }, 5000));
    actions.focus();
  }
  select('#hour').oninput = event => { settings.hour = Number(event.target.value); };
  select('#quality').value = settings.quality;
  select('#quality').onchange = event => actions.quality(event.target.value);
  select('#fast-time').onchange = event => { settings.fastTime = event.target.checked; };
  overlay.querySelectorAll('[data-preset]').forEach(button => { button.onclick = () => {
    setWeather(presets[button.dataset.preset]); actions.focus();
  }; });
  let toastUntil = 0, syncAt = 0;
  return {get quickPanelsOpen(){return !controls.hidden;},setCaptain(view){const known=['signed_in','expired'].includes(view.account?.state);captain.dataset.account=view.account?.state??'none';captainName.hidden=!known;save.hidden=!known;if(!known){captainName.textContent='';captainName.removeAttribute('title');save.textContent='';delete save.dataset.state;return;}captainName.textContent=view.captain.name;captainName.title=captainName.textContent;save.dataset.state=view.account.state;save.textContent=view.account.state==='expired'?'Sign in again to keep playing online':'';save.hidden=!save.textContent;},togglePanel,toggleControls,closeQuickPanels,start,
    dispose() { if(disposed)return;disposed=true;window.removeEventListener('keydown',escape,true);timers.forEach(clearTimeout); overlay.remove(); },
    arrive(id) {
      select('.chapter').childNodes[1].textContent = ` ${places[id].name} `;
      select('.location strong').textContent = places[id].name;
    },
    message(text) { select('.toast').textContent = text; select('.toast').hidden = false; toastUntil = performance.now() + 3000; },
    notify(id) {
      const toast = select('.toast');
      toast.textContent = names[id]; toast.hidden = false;
      toastUntil = performance.now() + 2600;
    },
    update(zone, stats) {
      overlay.classList.toggle('night', stats?.night > 0.4);
      const prompt = select('.interact'); prompt.hidden = !zone; prompt.dataset.zone = zone || '';
      if (zone) prompt.querySelector('strong').textContent = stats?.interactionLabel??names[zone];
      const now = performance.now();
      select('.toast').hidden = now > toastUntil;
      if (now < syncAt) return;
      syncAt = now + 150; // Clock and diagnostics need not rewrite the DOM every frame.
      const hour = Math.floor(settings.hour), minute = Math.floor((settings.hour % 1) * 60);
      const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      select('time').textContent = clock; select('.hour-value').textContent = clock;
      if (document.activeElement !== select('#hour')) select('#hour').value = settings.hour;
      select('#fast-time').checked = settings.fastTime;
      const weather = getWeather();
      select('.weather-label').textContent = weather.rain > 0.5 ? 'Rain at sea' : weather.fog > 0.7 ? 'Sea mist' : weather.cloudCover > 0.6 ? 'Overcast' : 'Fair skies';
      if (import.meta.env.DEV && stats) select('.performance').textContent = `${stats.fps} FPS · ${stats.calls} calls · ${stats.triangles.toLocaleString()} triangles`;
    },
  };
}
