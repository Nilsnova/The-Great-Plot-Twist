// Local DOM interface: arrival card, story prompts and visual debug controls.
import { settings } from '../config.js';
import { getWeather, presets, setWeather } from '../world/weather.js';

const names = { cottage: "Keeper's cottage", desk: "Elena's writing desk", shore: 'The old jetty', tower_door: 'Lighthouse door' };
export function createHud(container, actions) {
  const overlay = document.createElement('div'); overlay.className = 'hud';
  overlay.innerHTML = `
    <header class="masthead"><a class="wordmark" href="./" aria-label="The Great Plot Twist home"><span class="mark">✦</span> THE GREAT PLOT TWIST</a>
      <div class="chapter"><span class="status-dot"></span> LIGHTHOUSE ISLE <span class="chapter-number">01 / PROLOGUE</span></div></header>
    <section class="arrival" aria-labelledby="arrival-title">
      <p class="eyebrow">A SMALL ISLAND. AN UNFINISHED STORY.</p>
      <h1 id="arrival-title">Every light<br>keeps a <em>secret.</em></h1>
      <p class="intro-copy">Three nights without a light.<br>One keeper gone. Your story starts ashore.</p>
      <button class="explore" id="explore">Step ashore <span aria-hidden="true">↗</span></button>
      <p class="arrival-note">AN ISLAND TO EXPLORE · A MYSTERY TO COME</p>
    </section>
    <div class="location" hidden><span class="eyebrow">YOU HAVE ARRIVED</span><strong>Lighthouse Isle</strong><span>Follow the path. Look a little closer.</span></div>
    <aside class="island-label" aria-hidden="true"><span>THE KEEPER'S LAST LOG</span><i></i><span>38° N &nbsp; / &nbsp; 09° W</span></aside>
    <div class="interact" role="status" hidden><kbd>E</kbd><div><small>Press E</small><strong></strong></div><span aria-hidden="true">↗</span></div>
    <div class="toast" role="status" hidden></div>
    <footer class="bottom-bar"><div class="controls"><span><kbd>W A S D</kbd> move</span><span><kbd>⇧</kbd> run</span><span><kbd>DRAG</kbd> orbit</span><span><kbd>SCROLL</kbd> zoom</span></div>
      <div class="conditions"><span class="weather-label">Fair skies</span><span class="divider"></span><time>18:24</time><button class="settings-toggle" aria-label="Open visual settings" aria-expanded="false">☷</button></div></footer>
    <section class="debug" aria-label="Visual settings" hidden>
      <div class="panel-heading"><strong>Island atmosphere</strong><button class="close-settings" aria-label="Close visual settings">×</button></div>
      <label for="hour">Time of day <span class="hour-value"></span></label><input id="hour" type="range" min="0" max="23.99" step="0.01" value="${settings.hour}">
      <div class="preset-buttons">${Object.keys(presets).map((name, i) => `<button data-preset="${name}">${i + 1} ${name}</button>`).join('')}</div>
      <label for="quality">Quality</label><select id="quality"><option value="high">High · soft shadows</option><option value="low">Low · lighter rendering</option></select>
      <label class="check"><input id="fast-time" type="checkbox"> Speed up time <kbd>T</kbd></label>
      <p class="settings-note">Try midnight, sea mist or a passing storm.</p>
      ${import.meta.env.DEV ? '<output class="performance">Measuring rendering…</output>' : ''}
    </section>`;
  container.append(overlay);
  const select = selector => overlay.querySelector(selector);
  const panel = select('.debug'), toggle = select('.settings-toggle');
  function togglePanel(open) { panel.hidden = open === undefined ? !panel.hidden : !open; toggle.setAttribute('aria-expanded', String(!panel.hidden)); }
  toggle.onclick = () => togglePanel(); select('.close-settings').onclick = () => togglePanel(false);
  select('#explore').onclick = () => {
    select('.arrival').classList.add('departed'); select('.location').hidden = false;
    overlay.classList.add('exploring'); actions.start();
    window.setTimeout(() => { select('.arrival').hidden = true; }, 650);
    actions.focus();
  };
  select('#hour').oninput = event => { settings.hour = Number(event.target.value); };
  select('#quality').onchange = event => actions.quality(event.target.value);
  select('#fast-time').onchange = event => { settings.fastTime = event.target.checked; };
  overlay.querySelectorAll('[data-preset]').forEach(button => { button.onclick = () => {
    setWeather(presets[button.dataset.preset]); actions.focus();
  }; });
  let toastUntil = 0;
  return { togglePanel,
    notify(id) {
      const toast = select('.toast');
      toast.textContent = names[id]; toast.hidden = false;
      toastUntil = performance.now() + 2600;
    },
    update(zone, stats) {
      const prompt = select('.interact'); prompt.hidden = !zone;
      if (zone) prompt.querySelector('strong').textContent = names[zone];
      const hour = Math.floor(settings.hour), minute = Math.floor((settings.hour % 1) * 60);
      const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      select('time').textContent = clock; select('.hour-value').textContent = clock;
      if (document.activeElement !== select('#hour')) select('#hour').value = settings.hour;
      select('#fast-time').checked = settings.fastTime;
      const weather = getWeather();
      select('.weather-label').textContent = weather.rain > 0.5 ? 'Rain at sea' : weather.fog > 0.7 ? 'Sea mist' : weather.cloudCover > 0.6 ? 'Overcast' : 'Fair skies';
      if (import.meta.env.DEV && stats) select('.performance').textContent = `${stats.fps} FPS · ${stats.calls} calls · ${stats.triangles.toLocaleString()} triangles`;
      if (performance.now() > toastUntil) select('.toast').hidden = true;
    },
  };
}
