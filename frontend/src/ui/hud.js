// Local DOM interface: arrival card, story prompts and visual debug controls.
import { node } from './kit/dom.js';
import { places } from '../world/places/registry.js';
import { settings } from '../config.js';
import { getWeather, presets, setWeather } from '../world/weather.js';
import { tonightLabel } from '../screens/bulletin/logic.js';
import '../screens/bulletin/bulletin.css';

const names = Object.fromEntries(Object.values(places).flatMap(p => p.zones.map(z => [z.id, z.name])));
export function createHud(container, actions) {
  const overlay = document.createElement('div'); overlay.className = 'hud';
  overlay.innerHTML = `
    <header class="masthead"><a class="wordmark" href="./" aria-label="The Great Plot Twist home"><span class="mark">✦</span> THE GREAT PLOT TWIST</a>
      <div class="chapter"><span class="status-dot"></span> LIGHTHOUSE ISLE <span class="chapter-number">01 / PROLOGUE</span></div></header>
    <section class="arrival" aria-labelledby="arrival-title">
      <p class="eyebrow">A SMALL ISLAND. AN UNFINISHED STORY.</p>
      <h1 id="arrival-title">The keeper’s<br><em>last log.</em></h1>
      <p class="intro-copy">Three nights without a light.<br>One keeper gone. Your story starts ashore.</p>
      <button class="explore" id="explore">Step ashore <span aria-hidden="true">↗</span></button>
      <p class="arrival-note">A LITTLE ISLAND WITH A STORY TO TELL</p>
    </section>
    <div class="location" hidden><span class="eyebrow">YOU HAVE ARRIVED</span><strong>Lighthouse Isle</strong><span>Follow the path. Look a little closer.</span></div>
    <aside class="island-label" aria-hidden="true"><span>THE KEEPER'S LAST LOG</span><i></i><span>FIELD NOTES &nbsp; / &nbsp; No. 01</span></aside>
    <div class="interact" role="status" hidden><kbd>E</kbd><div><small>Press E</small><strong></strong></div><span aria-hidden="true">↗</span></div>
    <div class="toast" role="status" hidden></div>
    <footer class="bottom-bar"><div class="controls"><span><kbd>W A S D</kbd> move</span><span><kbd>⇧</kbd> run</span><span><kbd>E</kbd> investigate</span><span><kbd>SCROLL</kbd> zoom</span><button class="chart-toggle" aria-label="Open sea chart">Sea chart <kbd>M</kbd></button></div>
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
  const captain=node('div','captain-status'),captainName=node('strong','','Captain pending'),save=node('span','','Local intro only');save.setAttribute('role','status');captain.append(captainName,save);overlay.querySelector('.masthead').append(captain);
  const caseToolbar=node('nav','case-toolbar');caseToolbar.setAttribute('aria-label','Case tools');for(const [name,label] of [['crew','Crew'],['board','Board'],['log','Log'],['hints','What next?']]){const button=node('button','',label);button.type='button';button.onclick=()=>actions.caseScreen?.(name);caseToolbar.append(button);}overlay.append(caseToolbar);
  const tonightChip=node('aside','tonight-chip');tonightChip.hidden=true;const tonightState=node('strong'),tonightFog=node('span'),tonightStart=node('span');tonightChip.append(tonightState,tonightFog,tonightStart);overlay.append(tonightChip);
  container.append(overlay);
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
  select('#explore').onclick = () => {
    select('.arrival').classList.add('departed'); select('.location').hidden = false;
    overlay.classList.add('exploring'); actions.start();
    timers.push(window.setTimeout(() => { select('.arrival').hidden = true; }, 650));
    timers.push(window.setTimeout(() => { select('.location').hidden = true; }, 5000));
    actions.focus();
  };
  select('#hour').oninput = event => { settings.hour = Number(event.target.value); };
  select('#quality').value = settings.quality;
  select('#quality').onchange = event => actions.quality(event.target.value);
  select('#fast-time').onchange = event => { settings.fastTime = event.target.checked; };
  overlay.querySelectorAll('[data-preset]').forEach(button => { button.onclick = () => {
    setWeather(presets[button.dataset.preset]); actions.focus();
  }; });
  let toastUntil = 0, syncAt = 0, tonightSyncAt=0, bulletinModel=null;
  function refreshTonight(){
    const now=Date.now();if(now<tonightSyncAt)return;tonightSyncAt=now+1000;
    const bulletin=bulletinModel?.bulletin??bulletinModel;
    if(bulletin?.status!=='ready'){tonightChip.hidden=true;return;}
    const model=tonightLabel(bulletin.weather?.tonight,now);
    if(!model){tonightChip.hidden=true;return;}
    tonightChip.hidden=false;
    const stateText=`Tonight · ${model.state}`,startText=model.startsAt;
    if(tonightState.textContent!==stateText)tonightState.textContent=stateText;
    const fogText=model.fog??'';if(tonightFog.textContent!==fogText)tonightFog.textContent=fogText;tonightFog.hidden=!model.fog;
    if(tonightStart.textContent!==startText)tonightStart.textContent=startText;
    const label=[stateText,model.fog,startText].filter(Boolean).join('. ');if(tonightChip.getAttribute('aria-label')!==label)tonightChip.setAttribute('aria-label',label);
  }
  return {setCaptain(view){captainName.textContent=view.captain.name+((view.rewards?.keepsakes??[]).some(item=>item.id==='relighter'&&item.owned)?' · Relighter':'');captainName.title=captainName.textContent;const status=view.account?.save??view.captain.save;save.dataset.state=status.state;const prefix={saving:'Saving',offline:'Offline',conflict:'Save conflict'}[status.state];save.textContent=view.account?.state==='expired'?'Sign in again; device progress is kept':prefix&&!status.label.toLowerCase().includes(prefix.toLowerCase())?`${prefix} · ${status.label}`:status.label;},setBulletin(view){bulletinModel=view;tonightSyncAt=0;refreshTonight();},togglePanel,start(){select('#explore').click();},
    dispose() { timers.forEach(clearTimeout); overlay.remove(); },
    arrive(id) {
      select('.chapter').childNodes[1].textContent = ` ${places[id].name.toUpperCase()} `;
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
      if (zone) prompt.querySelector('strong').textContent = names[zone];
      const now = performance.now();
      select('.toast').hidden = now > toastUntil;
      if (now < syncAt) return;
      syncAt = now + 150; // Clock and diagnostics need not rewrite the DOM every frame.
      refreshTonight();
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
