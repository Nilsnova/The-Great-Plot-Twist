// A boss finisher on screen (docs/GAME-V3.md §4.3): letterbox bars, the island dimmed and grey with the boss
// left in colour, an original title card ("Bring her down!"), the crew's task drawn in the cartoon style, the
// crew's progress, the result, and a caption that always shows (also with the narrator's captions off). The
// rules and the outcome are the sim's (rules.js); this only draws them and takes this player's input:
//   haul    hold the mouse button, Space or the Haul button: the needle rises; let go: it sinks. Keep it in the zone.
//   cannon  move the mouse (or ← → / A D) along the hull; click, F, Space or Fire shoots the great cannon.
//   duel    press the arrow shown (arrow keys, W A S D, or the four buttons) before the next one comes.
// The controller (src/pirates/controller.js) feeds update() every frame and sends the recorder's windows.
//   const scene = createFinisherScene({container, me, easy, reducedMotion, recorder});
//   scene.update({finisher, dt, boss: {x, y} | null}); scene.dispose()
import './finisher.css';
import lines from '../../narrator/lines.json';
import { ARROWS, FINISHER, promptAt, promptLength, spotAt, zoneAt } from './rules.js';

export const FINISHER_TITLE = 'Bring her down!';
export const TASK_TEXT = Object.freeze({
  haul: { title: 'Haul the chain', how: 'Hold to pull the needle up, let go to let it sink. Keep it in the green.', touch: 'Hold to haul' },
  cannon: { title: 'Aim the great cannon', how: 'Move along the hull and fire when the sight is on the glowing weak spot.', touch: 'Fire' },
  duel: { title: 'Board and duel', how: 'Press the arrow shown before the next one comes.', touch: '' },
});
export const KIND_TITLE = Object.freeze({ haul: 'Haul the chain', cannon: 'Aim the great cannon', duel: 'Board and duel', redtide: 'Chain, cannon and cutlass' });
export const RESULT_TEXT = Object.freeze({ won: { title: 'Sunk!', line: 'Bonus loot for the crew.' }, failed: { title: 'She broke free!', line: 'The boss gets 15% of her hull back.' } });
const ARROW_GLYPH = { up: '↑', right: '→', down: '↓', left: '←' };
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const OUTLINE = '#1f2622';
const lineText = id => lines.lines.find(line => line.id === id)?.text ?? '';
/** The caption of a moment: the narrator's line for the start, the win and the failure. */
export const captionFor = (kind, phase) => lineText(`finisher_${kind}_${phase === 'won' || phase === 'failed' ? phase : 'start'}`);

const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (className, text, label) => { const node = el('button', `kit-button ${className}`, text); node.type = 'button'; if (label) node.setAttribute('aria-label', label); return node; };

export function createFinisherScene({ container, me = null, easy = () => false, reducedMotion = () => false, recorder = null } = {}) {
  const root = el('section', 'finisher');
  root.setAttribute('aria-label', 'Boss finisher');
  const dim = el('div', 'finisher-dim'), top = el('div', 'finisher-bar finisher-top'), bottom = el('div', 'finisher-bar finisher-bottom');
  const caption = el('p', 'finisher-caption'); caption.setAttribute('aria-live', 'polite'); bottom.append(caption);
  const card = el('div', 'finisher-card'), cardTitle = el('strong', 'finisher-card-title', FINISHER_TITLE), cardKind = el('span', 'finisher-card-kind');
  card.append(cardTitle, cardKind);
  const panel = el('div', 'finisher-panel'); panel.hidden = true;
  const head = el('div', 'finisher-head'), taskTitle = el('strong', 'finisher-task-title'), clockText = el('span', 'finisher-clock');
  head.append(taskTitle, clockText);
  const how = el('p', 'finisher-how');
  const stage = el('canvas', 'finisher-stage'); stage.width = 640; stage.height = 300; stage.setAttribute('aria-hidden', 'true');
  const meter = el('div', 'finisher-meter'), fill = el('span', 'finisher-meter-fill'), goal = el('span', 'finisher-meter-goal'), meterText = el('span', 'finisher-meter-text');
  meter.append(fill, goal, meterText); meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-label', 'The crew\'s progress');
  const crew = el('ul', 'finisher-crew');
  const controls = el('div', 'finisher-controls');
  const hold = button('finisher-hold', TASK_TEXT.haul.touch), left = button('finisher-left', '◀', 'Aim left'), right = button('finisher-right', '▶', 'Aim right');
  const fire = button('finisher-fire', TASK_TEXT.cannon.touch, 'Fire the great cannon');
  const arrows = ARROWS.map((name, i) => { const b = button(`finisher-arrow finisher-arrow-${name}`, ARROW_GLYPH[name], `Arrow ${name}`); b.dataset.arrow = String(i); return b; });
  const arrowPad = el('div', 'finisher-pad'); arrowPad.append(...arrows);
  controls.append(hold, left, fire, right, arrowPad);
  const watch = el('p', 'finisher-watch'); watch.hidden = true;
  panel.append(head, how, stage, meter, crew, controls, watch);
  const result = el('div', 'finisher-result'), resultTitle = el('strong', 'finisher-result-title'), resultLine = el('span', 'finisher-result-line');
  result.append(resultTitle, resultLine); result.hidden = true;
  root.append(dim, top, card, panel, result, bottom);
  container.append(root);
  const ctx = stage.getContext('2d');

  // This player's input state.
  let holding = false, needle = 0, velocity = 0, aim = 50, aimKeys = 0, lastShot = -Infinity, pressedPrompt = new Map();
  let current = null, clock = 0, disposed = false, lastCaption = '', flashAt = -1, flashGood = false;
  const playing = () => !!current && current.players.includes(me) && current.phase === 'task' && !current.outcome;
  const task = () => current?.tasks?.[current.task] ?? null;
  const localSample = () => (task() ? current.sample - task().from : -1);
  const inTask = () => { const t = task(); return !!t && current.sample >= t.from && current.sample < t.to; };

  function shoot() {
    if (!playing() || task()?.task !== 'cannon' || !inTask()) return;
    if (current.sample - lastShot < FINISHER.tasks.cannon.cooldown) return;
    lastShot = current.sample; recorder?.press(current.sample, Math.round(aim));
    const hit = Math.abs(aim - spotAt(localSample(), current.salt)) <= (easy() ? FINISHER.tasks.cannon.easyWidth : FINISHER.tasks.cannon.width);
    flashAt = clock; flashGood = hit;
  }
  function arrow(index) {
    if (!playing() || task()?.task !== 'duel' || !inTask()) return;
    const L = promptLength(easy()), k = Math.floor(localSample() / L);
    if (pressedPrompt.has(k)) return;
    pressedPrompt.set(k, index); recorder?.press(current.sample, index);
    flashAt = clock; flashGood = index === promptAt(me, k, current.salt);
  }
  const holdOn = () => { holding = true; }, holdOff = () => { holding = false; };
  // The whole stage takes the mouse: down holds (haul) or fires (cannon), moving aims (cannon).
  stage.addEventListener('pointerdown', event => { event.preventDefault(); if (task()?.task === 'cannon') { aimFrom(event); shoot(); } else holdOn(); try { stage.setPointerCapture(event.pointerId); } catch { /* fine */ } });
  stage.addEventListener('pointermove', event => { if (task()?.task === 'cannon') aimFrom(event); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, holdOff);
  function aimFrom(event) { const rect = stage.getBoundingClientRect(); if (rect.width) aim = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width - .1) / .8 * 100)); }
  hold.addEventListener('pointerdown', event => { event.preventDefault(); holdOn(); try { hold.setPointerCapture(event.pointerId); } catch { /* fine */ } });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(type, holdOff);
  hold.addEventListener('keydown', event => { if (event.code === 'Enter') { event.preventDefault(); holdOn(); } });
  hold.addEventListener('keyup', event => { if (event.code === 'Enter') holdOff(); });
  fire.addEventListener('click', event => { event.preventDefault(); shoot(); });
  for (const [b, k] of [[left, -1], [right, 1]]) {
    b.addEventListener('pointerdown', event => { event.preventDefault(); aimKeys = k; });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(type, () => { if (aimKeys === k) aimKeys = 0; });
  }
  for (const b of arrows) b.addEventListener('click', event => { event.preventDefault(); arrow(Number(b.dataset.arrow)); });
  const keydown = event => {
    if (!current || event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
    const kind = task()?.task;
    if (event.code === 'Space') { event.preventDefault(); if (kind === 'haul') holdOn(); else if (kind === 'cannon' && !event.repeat) shoot(); }
    else if (event.code === 'KeyF' && kind === 'cannon' && !event.repeat) { event.preventDefault(); shoot(); }
    else if (kind === 'cannon' && (event.code === 'ArrowLeft' || event.code === 'KeyA')) { event.preventDefault(); aimKeys = -1; }
    else if (kind === 'cannon' && (event.code === 'ArrowRight' || event.code === 'KeyD')) { event.preventDefault(); aimKeys = 1; }
    else if (kind === 'duel' && Object.hasOwn(KEYS, event.code) && !event.repeat) { event.preventDefault(); arrow(KEYS[event.code]); }
  };
  const keyup = event => {
    if (event.code === 'Space') holdOff();
    if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(event.code)) aimKeys = 0;
  };
  const blur = () => { holding = false; aimKeys = 0; };
  window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', blur);

  // ---- the stage's drawings (640 × 300, cartoon: dark outlines, two tones) ----
  const round = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  function sea() {
    const g = ctx.createLinearGradient(0, 0, 0, 300); g.addColorStop(0, '#2c5d73'); g.addColorStop(1, '#173a4d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 300);
    ctx.strokeStyle = 'rgba(214,240,236,.35)'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const y = 60 + i * 42, shift = reducedMotion() ? 0 : (clock * 12 * .3 + i * 37) % 80; ctx.beginPath(); for (let x = -80 + shift; x < 700; x += 80) { ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20, y - 8, x + 40, y); } ctx.stroke(); }
  }
  function drawHaul(s, f) {
    sea();
    const width = easy() ? FINISHER.tasks.haul.easyWidth : FINISHER.tasks.haul.width, zone = zoneAt(s, f.salt);
    // The chain from the winch (bottom left) to the boss's bow (top right): links tighten as you haul.
    const pull = holding && playing() ? 1 : 0;
    ctx.lineWidth = 7; ctx.strokeStyle = OUTLINE;
    const links = 11;
    for (let i = 0; i < links; i++) {
      const t = i / (links - 1), x = 150 + t * 330, y = 230 - t * 150 + Math.sin(t * Math.PI) * (26 - pull * 18);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-.42 + (i % 2) * Math.PI / 2 * .0);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = i % 2 ? '#a7aeb0' : '#cfd6d6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // The boss's bow.
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.moveTo(470, 110); ctx.lineTo(640, 40); ctx.lineTo(640, 170); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a3b2e'; ctx.beginPath(); ctx.moveTo(482, 108); ctx.lineTo(640, 48); ctx.lineTo(640, 162); ctx.closePath(); ctx.fill();
    // The winch.
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(130, 238, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5a32'; ctx.beginPath(); ctx.arc(130, 238, 38, 0, Math.PI * 2); ctx.fill();
    const turn = reducedMotion() ? 0 : clock * (pull ? 4 : -1);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7;
    for (let k = 0; k < 4; k++) { const a = turn + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(130, 238); ctx.lineTo(130 + Math.cos(a) * 52, 238 + Math.sin(a) * 52); ctx.stroke(); }
    // The gauge: a tall brass tube, the green zone moving, the needle.
    const gx = 26, gy = 20, gh = 260, gw = 46, y = value => gy + gh - value / 100 * gh;
    round(gx - 4, gy - 4, gw + 8, gh + 8, 14); ctx.fillStyle = OUTLINE; ctx.fill();
    round(gx, gy, gw, gh, 10); ctx.fillStyle = '#efe2bd'; ctx.fill();
    ctx.fillStyle = '#7fc35a'; ctx.fillRect(gx, y(Math.min(100, zone + width)), gw, (Math.min(100, zone + width) - Math.max(0, zone - width)) / 100 * gh);
    const inside = Math.abs(needle - zone) <= width;
    ctx.fillStyle = OUTLINE; ctx.fillRect(gx - 12, y(needle) - 5, gw + 24, 10);
    ctx.fillStyle = inside ? '#ffd24a' : '#e8473a'; ctx.fillRect(gx - 9, y(needle) - 3, gw + 18, 6);
  }
  function drawCannon(s, f) {
    sea();
    const width = easy() ? FINISHER.tasks.cannon.easyWidth : FINISHER.tasks.cannon.width, spot = spotAt(s, f.salt);
    const hx = value => 64 + value / 100 * 512;
    // The hull: planks with an outline, gun ports, the glowing weak spot.
    round(40, 40, 560, 150, 26); ctx.fillStyle = OUTLINE; ctx.fill();
    round(46, 46, 548, 138, 22); ctx.fillStyle = '#7a3b2e'; ctx.fill();
    ctx.strokeStyle = '#5a2a20'; ctx.lineWidth = 3;
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(50, 46 + k * 27); ctx.lineTo(590, 46 + k * 27); ctx.stroke(); }
    for (let k = 0; k < 6; k++) { round(92 + k * 86, 80, 34, 26, 6); ctx.fillStyle = OUTLINE; ctx.fill(); }
    const glow = reducedMotion() ? 1 : .8 + Math.sin(clock * 8) * .2, sw = width / 100 * 512;
    ctx.fillStyle = `rgba(255,170,60,${.55 * glow})`; round(hx(spot) - sw, 50, sw * 2, 130, 12); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(hx(spot) - 14, 90); ctx.lineTo(hx(spot) + 4, 112); ctx.lineTo(hx(spot) - 8, 130); ctx.lineTo(hx(spot) + 12, 150); ctx.stroke();
    // The great cannon below, turned toward the sight; the sight on the hull.
    const cx = 320, cy = 286, angle = Math.atan2(115 - cy, hx(aim) - cx);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    round(-10, -22, 108, 44, 16); ctx.fillStyle = OUTLINE; ctx.fill(); round(-4, -16, 98, 32, 12); ctx.fillStyle = '#4b5258'; ctx.fill();
    ctx.restore();
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(cx, cy, 30, Math.PI, 0); ctx.fill();
    const reload = Math.max(0, Math.min(1, (f.sample - lastShot) / FINISHER.tasks.cannon.cooldown));
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(hx(aim), 115, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = reload >= 1 ? '#fff4d6' : '#9aa3a6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx(aim), 115, 24, -Math.PI / 2, -Math.PI / 2 + reload * Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx(aim) - 34, 115); ctx.lineTo(hx(aim) + 34, 115); ctx.moveTo(hx(aim), 81); ctx.lineTo(hx(aim), 149); ctx.stroke();
    if (clock - flashAt < .35) { ctx.fillStyle = flashGood ? 'rgba(255,214,90,.8)' : 'rgba(230,246,244,.7)'; ctx.beginPath(); ctx.arc(hx(aim), 115, 20 + (clock - flashAt) * 120, 0, Math.PI * 2); ctx.fill(); }
  }
  function drawDuel(s, f) {
    // The deck: planks, two cartoon duellists, the arrow to press with its timer ring.
    ctx.fillStyle = '#6b4226'; ctx.fillRect(0, 0, 640, 300);
    ctx.strokeStyle = '#4e2f1a'; ctx.lineWidth = 3; for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.moveTo(0, k * 36); ctx.lineTo(640, k * 36); ctx.stroke(); }
    const L = promptLength(easy()), k = Math.floor(s / L), dir = promptAt(me ?? '', k, f.salt), share = (s % L) / L;
    const figure = (x, colour, flip) => {
      ctx.save(); ctx.translate(x, 210); ctx.scale(flip ? -1 : 1, 1);
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(0, 0, 34, 52, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(0, -70, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colour; ctx.beginPath(); ctx.ellipse(0, 0, 28, 46, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2c79a'; ctx.beginPath(); ctx.arc(0, -70, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(20, -10); ctx.lineTo(95, -60 - (reducedMotion() ? 0 : Math.sin(clock * 9) * 8)); ctx.stroke();
      ctx.strokeStyle = '#e8eee8'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
    };
    figure(150, '#2f6fa8', false); figure(490, '#b23a2e', true);
    const done = pressedPrompt.has(k), mark = pressedPrompt.get(k);
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(320, 120, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = done ? (mark === dir ? '#7fc35a' : '#e8473a') : '#efe2bd'; ctx.beginPath(); ctx.arc(320, 120, 62, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(320, 120, 66, -Math.PI / 2, -Math.PI / 2 + (1 - share) * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = OUTLINE; ctx.font = '900 84px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ARROW_GLYPH[ARROWS[dir]], 320, 124);
  }

  function setPhase(f) {
    root.dataset.kind = f.kind; root.dataset.phase = f.phase;
    const t = f.tasks[f.task]?.task ?? 'haul';
    root.dataset.task = t;
    card.hidden = f.phase !== 'intro';
    cardKind.textContent = KIND_TITLE[f.kind] ?? '';
    panel.hidden = !(f.phase === 'task' || f.phase === 'grace');
    result.hidden = !f.outcome;
    if (f.outcome) { resultTitle.textContent = RESULT_TEXT[f.outcome].title; resultLine.textContent = RESULT_TEXT[f.outcome].line; }
    const text = TASK_TEXT[t];
    const step = f.kind === 'redtide' ? ` · ${f.task + 1} of 3` : '';
    taskTitle.textContent = `${text.title}${step}`; how.textContent = text.how;
    for (const node of [hold]) node.hidden = t !== 'haul';
    for (const node of [left, right, fire]) node.hidden = t !== 'cannon';
    arrowPad.hidden = t !== 'duel';
    const watcher = !f.players.includes(me);
    watch.hidden = !watcher; controls.hidden = watcher;
    if (watcher) watch.textContent = 'You are watching: the captains in the fight do this together.';
    const words = captionFor(f.kind, f.outcome ?? 'start');
    if (words !== lastCaption) { lastCaption = words; caption.textContent = words; }
  }
  function progress(f) {
    const t = f.tasks[f.task]; if (!t) return;
    const share = Math.max(0, Math.min(1, t.score / Math.max(1, t.goal)));
    fill.style.width = `${Math.round(share * 100)}%`; meter.classList.toggle('is-done', t.cleared);
    meter.setAttribute('aria-valuenow', String(Math.round(share * 100))); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100');
    meterText.textContent = t.cleared ? 'Done!' : `${t.score} / ${t.goal}`;
    const seconds = Math.max(0, Math.ceil((t.to - f.sample) / 10));
    clockText.textContent = f.sample < t.to ? `${seconds} s` : '…';
    const key = f.players.map(id => `${id}:${t.players?.[id] ?? 0}`).join('|');
    if (crew.dataset.key !== key) {
      crew.dataset.key = key; crew.replaceChildren();
      for (const id of f.players) {
        const item = el('li', id === me ? 'is-me' : '', `${id === me ? 'You' : 'Captain'} · ${Math.max(0, t.players?.[id] ?? 0)}`);
        crew.append(item);
      }
    }
  }

  return {
    element: root,
    resetInput() {holding = false; needle = 0; velocity = 0; aim = 50; aimKeys = 0; lastShot = -Infinity; pressedPrompt = new Map(); current = null;},
    focusControls() { (task()?.task === 'haul' ? hold : task()?.task === 'cannon' ? fire : arrows[0]).focus(); },
    update({ finisher: f, dt = 0, boss = null } = {}) {
      if (disposed || !f) return;
      clock += Math.max(0, Math.min(.1, dt || 0));
      const before = current?.task, beforePhase = current?.phase;
      current = f;
      if (before !== f.task || beforePhase !== f.phase) { pressedPrompt = new Map(); holding = holding && f.phase === 'task'; }
      setPhase(f);
      // The boss stays in colour: the grey wash has a hole around it.
      if (boss) { root.style.setProperty('--finisher-x', `${Math.round(boss.x)}px`); root.style.setProperty('--finisher-y', `${Math.round(boss.y)}px`); }
      if (f.phase === 'task' || f.phase === 'grace') {
        const t = task(), s = Math.max(0, Math.min((t?.to ?? 0) - (t?.from ?? 0) - 1, localSample()));
        // The needle: hold to rise, let go to sink (eased, so it can be steered); the crosshair: keys and buttons.
        const want = holding && playing() ? 78 : -64;
        velocity += (want - velocity) * Math.min(1, dt * 7); needle = Math.max(0, Math.min(100, needle + velocity * dt));
        if (needle <= 0 && velocity < 0) velocity = 0;
        aim = Math.max(0, Math.min(100, aim + aimKeys * 70 * dt));
        if (t?.task === 'haul' && playing()) recorder?.fill(f.sample, Math.round(needle));
        if (t?.task === 'haul') drawHaul(s, f); else if (t?.task === 'cannon') drawCannon(s, f); else drawDuel(s, f);
        progress(f);
      }
    },
    get needle() { return needle; },
    get aim() { return aim; },
    dispose() {
      if (disposed) return; disposed = true;
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', blur);
      root.remove();
    },
  };
}
