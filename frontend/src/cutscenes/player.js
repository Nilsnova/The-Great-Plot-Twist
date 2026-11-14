// Reusable cutscene player: timed shots with gentle parallax and fades, subtitles that are always
// shown, a music bed and optional voice lines. Skip with the button, Escape or a tap. A shot is a
// cartoon panel drawn in code (shot.panel names a scene of src/art/scenery.js, painted on a canvas by
// src/art/stage.js, GAME-V3.md §7); custom players may still pass image layers. Until a panel is ready
// the shot shows its plain sky colours. Loaded lazily (import('./cutscenes/player.js')); the cold
// title never contains it.
import './cutscenes.css';
import scriptData from './scripts.json';
import {scenes as sceneMap} from './scenes.js';
import {findScript, normalizeManifest, buildTimeline, lineAt, shotOpacity, shotProgress} from './timeline.js';
import {createCutsceneAudio} from './audio.js';

const MANIFEST_WAIT_MS = 800;
const PANEL_WAIT_MS = 1500;
const loadPanelModules = () => Promise.all([import('../art/scenery.js'), import('../art/stage.js')]);
const base = () => import.meta.env?.BASE_URL ?? './';

export async function loadVoiceManifest({fetchImpl = globalThis.fetch?.bind(globalThis), timeout = MANIFEST_WAIT_MS} = {}) {
  if (!fetchImpl) return {};
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeout);
  try {
    const response = await fetchImpl(`${base()}audio/voice/manifest.json`, {signal: controller?.signal, headers: {Accept: 'application/json'}});
    if (!response.ok) return {};
    return normalizeManifest(await response.json());
  } catch { return {}; } finally { clearTimeout(timer); }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function playCutscene({container = document.body, id, data = scriptData, scenes = sceneMap,
  preferences = () => ({}), reducedMotion = () => false, loadManifest = loadVoiceManifest,
  createAudio = createCutsceneAudio, now = () => performance.now(), loadPanels = loadPanelModules,
  raf = callback => requestAnimationFrame(callback), caf = handle => cancelAnimationFrame(handle)} = {}) {
  const script = findScript(data, id);
  let settle;
  const done = new Promise(resolve => { settle = resolve; });
  if (!script) { settle({status: 'missing'}); return {done, active: false, skip() {}, dispose() {}}; }

  const reduced = !!reducedMotion();
  const dialog = element('dialog', 'cutscene');
  dialog.dataset.cutscene = script.id;
  if (reduced) dialog.dataset.reducedMotion = 'true';
  if (preferences()?.subtitleSize === 'large') dialog.classList.add('cutscene-large');
  const heading = element('h2', 'cutscene-heading', script.title ?? 'Cutscene');
  heading.id = `cutscene-${script.id}-${Math.random().toString(36).slice(2, 8)}`;
  dialog.setAttribute('aria-labelledby', heading.id);
  const stage = element('div', 'cutscene-stage');
  const subtitle = element('p', 'cutscene-subtitle');
  subtitle.setAttribute('aria-live', 'polite');
  const skipButton = element('button', 'kit-button cutscene-skip', 'Skip');
  skipButton.type = 'button';
  const hint = element('p', 'cutscene-hint', 'Tap or press Escape to skip');
  dialog.append(heading, stage, subtitle, skipButton, hint);

  const shots = (scenes[script.id] ?? [{from: 0, to: script.lines.length - 1, sky: 'night', layers: []}]);
  let timeline = buildTimeline(script, {}, shots);
  const shotNodes = shots.map(shot => {
    const node = element('div', `cutscene-shot shot-sky-${shot.sky ?? 'night'}`);
    node.setAttribute('aria-hidden', 'true');
    for (const layer of shot.layers ?? []) {
      const image = element('img', `cutscene-layer ${layer.className ?? ''}`);
      image.alt = ''; image.decoding = 'async'; image.draggable = false;
      image.src = `${base()}${layer.art}`;
      image.onerror = () => { image.hidden = true; };
      image.dataset.depth = String(layer.depth ?? 0);
      node.append(image);
    }
    if (shot.panel) { const canvas = element('canvas', 'cutscene-panel'); node.dataset.panel = typeof shot.panel === 'string' ? shot.panel : shot.panel.name ?? 'custom'; node.append(canvas); }
    node.style.opacity = '0';
    stage.append(node);
    return node;
  });

  // Cartoon panels: the scenes load with the voice manifest; a shot's canvas is painted a moment before
  // it shows and released once it has passed, so only one or two panels hold memory at a time.
  let panelScenes = [], createStage = null;
  const stages = shots.map(() => null);
  const panelsReady = shots.some(shot => shot.panel) ? Promise.resolve().then(() => loadPanels()).then(([scenery, stageModule]) => {
    createStage = stageModule.createStage;
    return Promise.all(shots.map(shot => {
      if (!shot.panel) return null;
      const options = typeof shot.panel === 'string' ? scenery.PANELS[shot.panel] : shot.panel;
      return options ? scenery.createScene({...options, still: reduced}).catch(() => null) : null;
    }));
  }).then(list => { panelScenes = list; }).catch(() => {}) : Promise.resolve();
  const size = () => ({width: dialog.clientWidth || globalThis.innerWidth || 1280, height: dialog.clientHeight || globalThis.innerHeight || 720});
  function ensureStage(index) {
    if (stages[index] || !panelScenes[index] || !createStage) return stages[index];
    const canvas = shotNodes[index].querySelector('.cutscene-panel'), {width, height} = size();
    try { stages[index] = createStage(canvas, panelScenes[index]); stages[index].resize(width, height); } catch { stages[index] = null; }
    return stages[index];
  }
  function releaseStage(index) { stages[index]?.dispose(); stages[index] = null; }
  function resize() { const {width, height} = size(); for (const item of stages) item?.resize(width, height); render(elapsed()); }

  let frame = null, started = null, pausedAt = null, pausedTotal = 0, finished = false, shownLine = -1;
  const audio = createAudio({preferences, base: base()});
  const elapsed = () => started === null ? 0 : ((pausedAt ?? now()) - started - pausedTotal) / 1000;

  function render(time) {
    for (const [index, shot] of timeline.shots.entries()) {
      const node = shotNodes[index], opacity = shotOpacity(shot, time, {reduced, total: timeline.total});
      node.style.opacity = String(opacity);
      node.hidden = opacity === 0;
      if (shots[index].panel) {
        if (time >= shot.end && index < timeline.shots.length - 1) releaseStage(index);
        else if (time >= shot.start - 1) ensureStage(index);
      }
      if (opacity === 0) continue;
      const progress = shotProgress(shot, time, {reduced});
      stages[index]?.render(reduced ? 0 : time - shot.start, reduced ? 0 : (progress - .5) * 2);
      for (const image of node.children) {
        const depth = Number(image.dataset.depth) || 0;
        image.style.transform = depth && !reduced ? `translate3d(${(-depth * (progress - .5)).toFixed(1)}px,0,0)` : '';
      }
    }
    const line = lineAt(timeline, time);
    const index = line?.index ?? -1;
    if (index !== shownLine && line) { shownLine = index; subtitle.textContent = line.text; dialog.dataset.line = line.id; }
  }
  function tick() {
    frame = null;
    if (finished) return;
    const time = elapsed();
    if (time >= timeline.total) { finish('completed'); return; }
    render(time);
    frame = raf(tick);
  }
  function visibility() {
    if (finished || started === null) return;
    if (document.hidden && pausedAt === null) { pausedAt = now(); audio.pause(); }
    else if (!document.hidden && pausedAt !== null) { pausedTotal += now() - pausedAt; pausedAt = null; audio.resume(); if (frame === null) frame = raf(tick); }
  }
  function finish(status) {
    if (finished) return;
    finished = true;
    if (frame !== null) caf(frame);
    frame = null;
    audio.stop(status === 'completed' ? .8 : .3);
    document.removeEventListener('visibilitychange', visibility);
    globalThis.removeEventListener?.('resize', resize);
    stages.forEach((_, index) => releaseStage(index));
    dialog.removeEventListener('cancel', cancel);
    dialog.removeEventListener('keydown', trap);
    stage.removeEventListener('click', skipFromTap);
    if (dialog.open) dialog.close();
    dialog.remove();
    settle({status});
  }
  function cancel(event) { event.preventDefault(); finish('skipped'); }
  // Skip is the only control, so Tab keeps focus on it inside the modal.
  function trap(event) { if (event.key === 'Tab') { event.preventDefault(); skipButton.focus({preventScroll: true}); } }
  function skipFromTap() { finish('skipped'); }
  skipButton.addEventListener('click', () => finish('skipped'));
  stage.addEventListener('click', skipFromTap);
  dialog.addEventListener('cancel', cancel);
  dialog.addEventListener('keydown', trap);
  document.addEventListener('visibilitychange', visibility);
  globalThis.addEventListener?.('resize', resize);

  container.append(dialog);
  try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  skipButton.focus({preventScroll: true});
  subtitle.textContent = script.lines[0].text;
  shownLine = 0;
  render(0);

  void panelsReady.then(() => { if (!finished && started === null) render(0); });
  const panelWait = new Promise(resolve => setTimeout(resolve, PANEL_WAIT_MS));
  void Promise.all([Promise.resolve().then(() => loadManifest()).catch(() => ({})), Promise.race([panelsReady, panelWait])]).then(([voices]) => {
    if (finished) return;
    timeline = buildTimeline(script, voices ?? {}, shots);
    started = now();
    if (document.hidden) pausedAt = started;
    void audio.start(timeline, {mood: script.music ?? 'dusk'}).catch(() => {});
    frame = raf(tick);
  });

  return {
    done,
    get active() { return !finished; },
    get element() { return dialog; },
    get timeline() { return timeline; },
    skip() { finish('skipped'); },
    dispose() { finish('cancelled'); },
  };
}
