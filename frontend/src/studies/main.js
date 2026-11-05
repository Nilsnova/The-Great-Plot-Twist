// Local art direction workspace. Scene changes replace and dispose selected textures.
import * as THREE from 'three';
import './styles.css';
import { createRenderer } from '../core/renderer.js';
import { startLoop } from '../core/loop.js';
import { presets, setWeather } from '../world/weather.js';
import { studies } from './presets.js';
import { createStudy } from './scene.js';

const select = query => document.querySelector(query), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const graphics = createRenderer(select('#study')), camera = new THREE.OrthographicCamera();
camera.userData.viewHeight = 44; camera.position.set(0, 1, 100); camera.lookAt(0, 1, 0);
graphics.renderer.domElement.setAttribute('aria-label', 'Composition study. Use the wheel to zoom; the fit scene button restores the overview.');
let current, version = 0, hour = 12, quality = 'high', motion = !reduced, selected;
select('#motion').checked = motion; graphics.setQuality(quality); setWeather(presets.clear);
select('#destinations').innerHTML = Object.entries(studies).map(([id, study], i) => `<button data-scene="${id}" aria-pressed="false">0${i + 1} / ${study.title.split(' ').slice(0, 3).join(' ')}</button>`).join('');
async function show(id) {
  if (!Object.hasOwn(studies, id)) return;
  const request = ++version; select('#status').textContent = 'Preparing the drawings…';
  try {
    const next = await createStudy(studies[id], reduced);
    if (request !== version) { next.dispose(); return; }
    current?.dispose(); current = next; selected = id;
    select('#scene-title').textContent = studies[id].title; select('#scene-description').textContent = studies[id].subtitle;
    select('#scene-number').textContent = `STUDY 0${Object.keys(studies).indexOf(id) + 1} / THREE LITTLE WORLDS`;
    document.querySelectorAll('[data-scene]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === id)));
    history.replaceState(null, '', `?scene=${id}`); camera.zoom = 1; graphics.resize(camera); select('#status').textContent = '';
  } catch (error) { console.error(error); select('#status').textContent = 'The drawings could not load. Reload to try again.'; }
}
select('#destinations').onclick = event => { const button = event.target.closest('[data-scene]'); if (button) show(button.dataset.scene); };
select('#light').onchange = event => { hour = Number(event.target.value); document.body.dataset.night = String(hour === 0); };
select('#weather').onchange = event => setWeather(presets[event.target.value]);
select('#quality').onchange = event => { quality = event.target.value; graphics.setQuality(quality); };
select('#motion').onchange = event => { motion = event.target.checked; };
select('#reset').onclick = () => { camera.zoom = 1; camera.updateProjectionMatrix(); };
const zoom = event => { event.preventDefault(); camera.zoom = Math.max(.75, Math.min(1.7, camera.zoom * Math.exp(-event.deltaY * .001))); camera.updateProjectionMatrix(); };
graphics.renderer.domElement.addEventListener('wheel', zoom, { passive: false });
const resize = () => graphics.resize(camera); window.addEventListener('resize', resize); resize();
const stop = startLoop(delta => current?.update(delta, hour, quality, motion), () => { if (current) graphics.renderer.render(current.scene, camera); });
if (import.meta.env.DEV) window.__studies = { camera, renderer: graphics.renderer, get current() { return current; }, get selected() { return selected; } };
if (import.meta.hot) import.meta.hot.dispose(() => { version++; stop(); current?.dispose(); graphics.renderer.dispose(); window.removeEventListener('resize', resize); delete window.__studies; });
const requested = new URLSearchParams(location.search).get('scene'); show(Object.hasOwn(studies, requested) ? requested : 'harbour');
