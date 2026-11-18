// The own boat's games on screen (D057, docs/GAME-V3.md §4.5): the boss finishers' cartoon look (dark outlines,
// flat warm colours, the parchment card, the count-down card, the result card), a stage drawn on a canvas and
// this player's input. The rules and the score are rules.js; this only draws a round and records its samples.
//   broadside  Space, F, Enter, a click or tap on the sea, or the Fire button: fire the broadside.
//   dash       ← → or A D, drag on the sea, or hold the ◀ ▶ buttons: steer the boat.
// Pictures say how to play (arrows, the gold band, a coin ✓ and a cannonball ✗); the words stay few.
//   const game = createBoatGame({container, game: 'dash', wave: 30, code: 'ISLE-K7Q2M', easy, reducedMotion,
//     onFinish: async ({game, stars, score, max}) => ({line, coins}), onClose});
//   game.update(dt) is called by its own animation frame (autoplay) or by a test; game.dispose().
import './boat.css';
import { node as el } from '../../ui/kit/dom.js';
import { BOAT, GAME_TEXT, boatDifficulty, boatSalt, coinsFor, enemyX, fallOf, itemsOf, passAt, passesOf, scoreOf, shotAt, starsOf } from './rules.js';

export { GAME_TEXT, starText };
const OUTLINE = '#1f2622';
const SEA_TOP = '#2c5d73', SEA_DEEP = '#173a4d', FOAM = 'rgba(214,240,236,.35)';
const button = (className, text, label) => { const node = el('button', `kit-button ${className}`, text); node.type = 'button'; if (label) node.setAttribute('aria-label', label); return node; };
const starText = n => '★'.repeat(n) + '☆'.repeat(BOAT.stars - n);
// Three stars, the won ones lit (the meter's marks and the result card).
const starRow = (node, n) => { node.replaceChildren(...[...Array(BOAT.stars)].map((_, i) => el('i', i < n ? 'is-lit' : '', '★'))); node.setAttribute('aria-label', `${n} of ${BOAT.stars} stars`); };

export function createBoatGame({ container, game = 'broadside', wave = 30, code = '', easy = () => false, reducedMotion = () => false,
  onFinish = async () => null, onClose = () => {}, autoplay = true, frame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) } = {}) {
  if (!GAME_TEXT[game]) throw new Error(`unknown boat game: ${game}`);
  const text = GAME_TEXT[game], difficulty = boatDifficulty(game, wave), salt = boatSalt(code, wave, game);
  const passes = game === 'broadside' ? passesOf(salt, difficulty) : [];
  const items = game === 'dash' ? itemsOf(salt, difficulty) : [], fall = fallOf(difficulty);
  const best = coinsFor(BOAT.stars, wave);

  const root = el('section', 'boat-game'); root.dataset.game = game; root.dataset.phase = 'intro';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', text.title);
  const panel = el('div', 'boat-panel');
  const head = el('div', 'boat-head'), title = el('strong', 'boat-title', `${text.icon} ${text.title}`);
  const score = el('span', 'boat-score', '0'), clockText = el('span', 'boat-clock', `${BOAT.samples / 10} s`);
  const close = button('boat-close', '✕', 'Back to the island');
  head.append(title, score, clockText, close);
  const stageBox = el('div', 'boat-stage-box');
  const stage = el('canvas', 'boat-stage'); stage.setAttribute('aria-hidden', 'true');
  const countdown = el('div', 'boat-count'); countdown.setAttribute('aria-live', 'polite');
  stageBox.append(stage, countdown);
  const meter = el('div', 'boat-meter'), fill = el('span', 'boat-meter-fill');
  meter.append(fill); meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-label', 'Stars'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', String(BOAT.stars));
  // A star sits on each mark of the meter and lights up when the score passes it.
  const marks = BOAT[game].stars.map(need => { const mark = el('i', 'boat-meter-mark', '★'); mark.style.left = `${need * 100}%`; meter.append(mark); return mark; });
  const hint = el('p', 'boat-hint', text.hint);
  const controls = el('div', 'boat-controls');
  const fire = button('boat-fire', '💥 Fire', 'Fire the broadside'), left = button('boat-left', '◀', 'Steer left'), right = button('boat-right', '▶', 'Steer right');
  if (game === 'broadside') controls.append(fire); else controls.append(left, right);
  panel.append(head, stageBox, meter, hint, controls);
  const result = el('div', 'boat-result'); result.hidden = true;
  const resultStars = el('strong', 'boat-result-stars'), resultScore = el('span', 'boat-result-score'), resultLine = el('span', 'boat-result-line');
  const again = button('boat-again', '↻ Again'), shore = button('boat-shore', '⚓ Shore');
  const resultButtons = el('div', 'boat-result-buttons'); resultButtons.append(again, shore);
  result.append(resultStars, resultScore, resultLine, resultButtons);
  root.append(panel, result);
  container.append(root);
  const ctx = stage.getContext?.('2d') ?? null;

  let W = 640, H = 360;
  function fit() {
    const portrait = (globalThis.innerWidth ?? 1280) < (globalThis.innerHeight ?? 720) * .8;
    const [w, h] = portrait ? [420, 520] : [640, 360];
    if (w !== W || h !== H || stage.width !== w) { W = w; H = h; stage.width = w; stage.height = h; root.dataset.shape = portrait ? 'tall' : 'wide'; }
  }
  fit();

  // ---- the round's clock and this player's input ----
  let phase = 'intro', clock = 0, t = -BOAT.intro / 10, disposed = false, handle = null, lastTime = null;
  let samples = new Map(), filled = 0, lastShot = -Infinity, live = { score: 0, max: 1 }, outcome = null;
  let boatX = 50, steerKeys = 0, pointerX = null, dragging = false;
  const effects = []; // {kind, x, y, at, text?, good?}
  const seen = new Set(), got = new Set(); // dash: items already judged on screen, coins taken
  let shelterUntil = -Infinity;
  let shake = 0;
  const sample = () => Math.floor(t * 10);
  const playing = () => phase === 'play';

  function shoot() {
    if (!playing() || game !== 'broadside') return;
    const s = sample();
    if (s < 0 || s >= BOAT.samples || s - lastShot < BOAT.broadside.cooldown) return;
    lastShot = s; samples.set(s, 1);
    const pass = passAt(passes, s), sunk = effects.some(item => item.kind === 'sunk' && item.k === pass?.k);
    const shot = sunk ? 'miss' : shotAt(pass, s, easy() ? difficulty.easyWidth : difficulty.width);
    effects.push({ kind: 'ball', at: clock, shot, k: pass?.k ?? -1 });
    if (shot !== 'miss' && pass) effects.push({ kind: 'sunk', at: clock, k: pass.k, x: enemyX(pass, s + .5), dir: pass.dir, cutter: pass.kind === 'cutter' });
    effects.push({ kind: 'pop', at: clock + .22, x: .5, y: .3, text: shot === 'bull' ? '+2 ★' : shot === 'hit' ? '+1' : '✗ −1', good: shot !== 'miss' });
    refreshScore();
  }
  function refreshScore() {
    live = scoreOf(game, samples, { salt, easy: easy(), difficulty });
    score.textContent = game === 'dash' ? `🪙 ${live.score}` : `💥 ${live.score}`;
    const share = Math.max(0, Math.min(1, live.score / Math.max(1, live.max)));
    fill.style.width = `${Math.round(share * 100)}%`;
    const now = starsOf(game, live);
    marks.forEach((mark, i) => mark.classList.toggle('is-lit', i < now)); meter.setAttribute('aria-valuenow', String(now));
  }

  const stagePoint = event => { const rect = stage.getBoundingClientRect(); return rect.width ? Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)) : 50; };
  stage.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (game === 'broadside') { shoot(); return; }
    dragging = true; pointerX = stagePoint(event); try { stage.setPointerCapture(event.pointerId); } catch { /* fine */ }
  });
  stage.addEventListener('pointermove', event => { if (game === 'dash' && (dragging || event.pointerType === 'mouse')) pointerX = stagePoint(event); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, () => { dragging = false; });
  stage.addEventListener('pointerleave', () => { if (!dragging) pointerX = null; });
  fire.addEventListener('pointerdown', event => { event.preventDefault(); shoot(); });
  fire.addEventListener('click', event => { if (event.detail === 0) shoot(); }); // the keyboard's Enter on the button
  for (const [b, k] of [[left, -1], [right, 1]]) {
    b.addEventListener('pointerdown', event => { event.preventDefault(); pointerX = null; steerKeys = k; try { b.setPointerCapture(event.pointerId); } catch { /* fine */ } });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => { if (steerKeys === k) steerKeys = 0; });
  }
  const STEER = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
  const keydown = event => {
    if (disposed) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); end(); return; }
    if (game === 'broadside' && ['Space', 'KeyF', 'Enter'].includes(event.code) && !(event.target instanceof HTMLButtonElement && event.code !== 'Space')) {
      event.preventDefault(); event.stopPropagation(); if (!event.repeat) shoot();
    } else if (game === 'dash' && Object.hasOwn(STEER, event.code)) { event.preventDefault(); event.stopPropagation(); pointerX = null; steerKeys = STEER[event.code]; }
  };
  const keyup = event => { if (Object.hasOwn(STEER, event.code) && steerKeys === STEER[event.code]) steerKeys = 0; };
  const blur = () => { steerKeys = 0; dragging = false; };
  window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', blur);
  close.addEventListener('click', () => end());
  shore.addEventListener('click', () => end());
  again.addEventListener('click', () => restart());

  // ---- drawing (cartoon: dark outlines, two tones) ----
  const round = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  const still = () => reducedMotion();
  function sea(vertical) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, SEA_TOP); g.addColorStop(1, SEA_DEEP);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = FOAM; ctx.lineWidth = 3;
    const rows = Math.ceil(H / 44) + 1;
    for (let i = 0; i < rows; i++) {
      const drift = still() ? 0 : clock * (vertical ? 46 : 14);
      const y = vertical ? ((i * 44 + drift) % (rows * 44)) - 22 : 36 + i * 44, shift = vertical ? (i * 37) % 80 : (drift + i * 37) % 80;
      ctx.beginPath(); for (let x = -80 + shift; x < W + 80; x += 80) { ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20, y - 8, x + 40, y); } ctx.stroke();
    }
  }
  function pop(item, age) {
    const a = Math.max(0, 1 - age / .8), x = item.x * W, y = item.y * H - age * 40;
    ctx.globalAlpha = a; ctx.font = `900 ${Math.round(H * .085)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = OUTLINE; ctx.strokeText(item.text, x, y);
    ctx.fillStyle = item.good ? '#ffd24a' : '#ff8a7a'; ctx.fillText(item.text, x, y); ctx.globalAlpha = 1;
  }
  // A side-view sailing ship: hull, masts, sails, a flag. facing 1 = sailing right.
  function sideShip(x, y, size, facing, colours, tilt = 0, sink = 0) {
    ctx.save(); ctx.translate(x, y + sink * size * .9); ctx.rotate(tilt); ctx.scale(facing, 1);
    ctx.globalAlpha = Math.max(0, 1 - sink);
    const w = size, h = size * .32;
    // the hull
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.moveTo(-w * .55, -h * .2); ctx.lineTo(w * .62, -h * .35); ctx.lineTo(w * .4, h); ctx.lineTo(-w * .45, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = colours.hull; ctx.beginPath(); ctx.moveTo(-w * .5, -h * .08); ctx.lineTo(w * .55, -h * .24); ctx.lineTo(w * .36, h * .86); ctx.lineTo(-w * .41, h * .86); ctx.closePath(); ctx.fill();
    ctx.fillStyle = colours.stripe; ctx.fillRect(-w * .46, h * .2, w * .92, h * .16);
    for (let k = 0; k < 3; k++) { ctx.fillStyle = OUTLINE; ctx.fillRect(-w * .3 + k * w * .25, h * .42, w * .08, h * .18); }
    // masts and sails
    const masts = colours.masts ?? 2;
    for (let m = 0; m < masts; m++) {
      const mx = masts === 1 ? 0 : -w * .18 + m * w * .36, top = -h * (masts === 1 ? 3.2 : 3.6 - m * .3);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(3, size * .035); ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, top); ctx.stroke();
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.moveTo(mx - w * .17, top * .9); ctx.quadraticCurveTo(mx + w * .02, top * .55, mx - w * .15, -h * .45); ctx.lineTo(mx + w * .2, -h * .45); ctx.quadraticCurveTo(mx + w * .3, top * .55, mx + w * .17, top * .9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = colours.sail; ctx.beginPath(); ctx.moveTo(mx - w * .14, top * .86); ctx.quadraticCurveTo(mx + w * .03, top * .56, mx - w * .12, -h * .55); ctx.lineTo(mx + w * .17, -h * .55); ctx.quadraticCurveTo(mx + w * .26, top * .56, mx + w * .14, top * .86); ctx.closePath(); ctx.fill();
    }
    const fx = masts === 1 ? 0 : w * .18, ft = -h * (masts === 1 ? 3.2 : 3.3);
    ctx.fillStyle = OUTLINE; ctx.fillRect(fx - 2, ft - h * .55, w * .2, h * .5); ctx.fillStyle = colours.flag; ctx.fillRect(fx, ft - h * .5, w * .17, h * .4);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  const bandX = value => W * .08 + value / 100 * W * .84;
  function drawBroadside() {
    sea(false);
    const width = easy() ? difficulty.easyWidth : difficulty.width, laneY = H * .47, now = t * 10;
    // The gold band from your guns up across the enemy lane: fire when a ship is inside it.
    const half = width / 100 * W * .84, inner = half * BOAT.broadside.bull, cx = W / 2;
    const glow = still() ? .9 : .78 + Math.sin(clock * 5) * .12;
    ctx.fillStyle = `rgba(255,210,74,${.22 * glow})`; ctx.fillRect(cx - half, 0, half * 2, H * .78);
    ctx.fillStyle = `rgba(255,210,74,${.32 * glow})`; ctx.fillRect(cx - inner, 0, inner * 2, H * .78);
    ctx.strokeStyle = 'rgba(255,226,140,.9)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(cx - half, 0); ctx.lineTo(cx - half, H * .78); ctx.moveTo(cx + half, 0); ctx.lineTo(cx + half, H * .78); ctx.stroke(); ctx.setLineDash([]);
    // The enemy ships on their lane (the one on the sea now, or the next one waiting at the edge).
    const size = Math.min(W * .2, H * .32);
    for (const pass of passes) {
      const sunk = effects.find(item => item.kind === 'sunk' && item.k === pass.k);
      const colours = pass.kind === 'cutter' ? { hull: '#7a3b2e', stripe: '#b23a2e', sail: '#d9574a', flag: '#1f2622', masts: 1 } : { hull: '#5b3a24', stripe: '#2b2b2b', sail: '#efe2bd', flag: '#1f2622', masts: 2 };
      const shipSize = pass.kind === 'cutter' ? size * .78 : size;
      if (sunk) {
        const age = clock - sunk.at; if (age > 1.6) continue;
        sideShip(bandX(sunk.x), laneY, shipSize, sunk.dir, colours, .5 * Math.min(1, age), Math.min(1, age / 1.4));
        if (age < .6) { burst(bandX(sunk.x), laneY - shipSize * .1, age); }
        continue;
      }
      if (now < pass.from - 2 || now > pass.to + 1) continue;
      const x = enemyX(pass, Math.max(pass.from, Math.min(pass.to, now)));
      const bob = still() ? 0 : Math.sin(clock * 3 + pass.k) * 3;
      sideShip(bandX(x), laneY + bob, shipSize, pass.dir, colours);
    }
    // Your ship at the bottom, broadside up: three guns, the middle one on the band.
    const by = H * .9, bw = Math.min(W * .62, 380), bh = H * .16;
    round(cx - bw / 2 - 5, by - bh / 2 - 5, bw + 10, bh + 10, 22); ctx.fillStyle = OUTLINE; ctx.fill();
    round(cx - bw / 2, by - bh / 2, bw, bh, 18); ctx.fillStyle = '#8a5a32'; ctx.fill();
    ctx.fillStyle = '#6b4226'; ctx.fillRect(cx - bw / 2 + 10, by - 2, bw - 20, 6);
    for (const k of [-1, 0, 1]) {
      const gx = cx + k * bw * .3;
      round(gx - 13, by - bh / 2 - 34, 26, 44, 8); ctx.fillStyle = OUTLINE; ctx.fill();
      round(gx - 8, by - bh / 2 - 29, 16, 36, 6); ctx.fillStyle = k === 0 ? '#4b5258' : '#3a4045'; ctx.fill();
    }
    // The reload: a ring of pips round the middle gun.
    const reload = Math.max(0, Math.min(1, (now - lastShot) / BOAT.broadside.cooldown));
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, by + 4, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = reload >= 1 ? '#ffd24a' : '#9aa3a6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, by + 4, 18, -Math.PI / 2, -Math.PI / 2 + reload * Math.PI * 2); ctx.stroke();
    // Shots in flight: three balls up the band, a splash or a hit at the lane.
    for (const item of effects) {
      if (item.kind !== 'ball') continue;
      const age = clock - item.at; if (age > .7) continue;
      if (age < .25) {
        const f = age / .25;
        for (const k of [-1, 0, 1]) { const x = cx + k * bw * .3 * (1 - f) , y = by - bh / 2 - 34 - f * (by - bh / 2 - 34 - laneY); ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,214,90,.85)'; ctx.beginPath(); ctx.arc(cx, by - bh / 2 - 40, 22 * (1 - f), 0, Math.PI * 2); ctx.fill();
      } else if (item.shot === 'miss') { splash(cx, laneY + size * .12, age - .25); }
    }
  }
  function burst(x, y, age) {
    const r = 18 + age * 120;
    ctx.fillStyle = `rgba(255,170,60,${Math.max(0, .9 - age * 1.4)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,236,150,${Math.max(0, .9 - age * 1.8)})`; ctx.beginPath(); ctx.arc(x, y, r * .55, 0, Math.PI * 2); ctx.fill();
  }
  function splash(x, y, age) {
    const a = Math.max(0, 1 - age * 2.2);
    ctx.strokeStyle = `rgba(230,246,244,${a})`; ctx.lineWidth = 4;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x + k * 9, y); ctx.lineTo(x + k * 14, y - 30 - age * 40 + Math.abs(k) * 8); ctx.stroke(); }
  }
  // Top-down: your boat (pointed bow up, a sail, a wake).
  function topBoat(x, y, size, hurt) {
    ctx.save(); ctx.translate(x, y);
    const lean = steerKeys * .12 + (pointerX !== null ? Math.sign(pointerX - boatX) * .08 : 0); ctx.rotate(still() ? 0 : lean);
    ctx.strokeStyle = 'rgba(230,246,244,.55)'; ctx.lineWidth = 4;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * size * .28, size * .5); ctx.quadraticCurveTo(side * size * .5, size * .9, side * size * .7, size * 1.25); ctx.stroke(); }
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.moveTo(0, -size * .78); ctx.quadraticCurveTo(size * .48, -size * .1, size * .34, size * .62); ctx.lineTo(-size * .34, size * .62); ctx.quadraticCurveTo(-size * .48, -size * .1, 0, -size * .78); ctx.fill();
    ctx.fillStyle = hurt ? '#e8473a' : '#8a5a32'; ctx.beginPath(); ctx.moveTo(0, -size * .66); ctx.quadraticCurveTo(size * .38, -size * .08, size * .27, size * .53); ctx.lineTo(-size * .27, size * .53); ctx.quadraticCurveTo(-size * .38, -size * .08, 0, -size * .66); ctx.fill();
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.moveTo(-size * .05, -size * .42); ctx.lineTo(size * .44, size * .22); ctx.lineTo(-size * .05, size * .3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#efe2bd'; ctx.beginPath(); ctx.moveTo(0, -size * .32); ctx.lineTo(size * .35, size * .18); ctx.lineTo(0, size * .24); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function coin(x, y, r, spin) {
    const squash = still() ? 1 : .55 + Math.abs(Math.cos(spin)) * .45;
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(x, y, r * squash + 3, r + 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.ellipse(x, y, r * squash, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0a52a'; ctx.beginPath(); ctx.ellipse(x, y, r * squash * .55, r * .55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(x - r * squash * .35, y - r * .4, r * .18, r * .25, 0, 0, Math.PI * 2); ctx.fill();
  }
  function ball(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + r * .3, y + r * .5, r, r * .5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a4045'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(x - r * .35, y - r * .35, r * .28, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff9a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + r * .5, y - r * .8); ctx.lineTo(x + r * .9, y - r * 1.5); ctx.stroke();
  }
  const dashX = value => W * .06 + value / 100 * W * .88;
  function drawDash() {
    sea(true);
    const now = t * 10, boatY = H * .83, size = Math.min(W, H) * .17, reach = easy() ? difficulty.easyCatch : difficulty.catch;
    // Buoys down both sides, red and green, sliding past: you sail a channel.
    for (let i = 0; i < 6; i++) {
      const y = ((i * H / 4 + (still() ? 0 : clock * 46)) % (H * 1.5)) - H * .2;
      for (const [x, colour] of [[W * .025, '#d9574a'], [W * .975, '#5aa35a']]) {
        ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      }
    }
    // The catch band under your boat: a coin inside it is yours.
    const bx = dashX(boatX), half = reach / 100 * W * .88;
    ctx.fillStyle = 'rgba(255,210,74,.14)'; ctx.fillRect(bx - half, boatY - size * .9, half * 2, size * 1.6);
    const hurt = effects.some(item => item.kind === 'hit' && clock - item.at < .45);
    for (const item of items) {
      const ahead = item.at - now;
      if (ahead > fall || ahead < -2 || got.has(item.id)) continue;
      const y = boatY - ahead / fall * (boatY + size), x = dashX(item.x);
      if (item.kind === 'coin') coin(x, y, size * .24, clock * 4 + item.id);
      else {
        // A red marker on your row shows where a cannonball will land.
        if (ahead < fall * .6 && ahead > 0) { ctx.fillStyle = `rgba(232,71,58,${.35 + .4 * (1 - ahead / (fall * .6))})`; ctx.beginPath(); ctx.moveTo(x - 16, boatY + size * .98); ctx.lineTo(x + 16, boatY + size * .98); ctx.lineTo(x, boatY + size * .66); ctx.closePath(); ctx.fill(); }
        ball(x, y, size * .3);
      }
    }
    const shakeX = still() ? 0 : Math.sin(clock * 60) * shake * 8;
    topBoat(bx + shakeX, boatY, size, hurt);
    for (const item of effects) if (item.kind === 'hit' && clock - item.at < .5) burst(dashX(item.x), boatY - size * .3, clock - item.at);
  }
  // The picture card before the round: how to play, in arrows and icons, and the count-down.
  function drawIntroPicture() {
    const k = still() ? .5 : (Math.sin(clock * 3) + 1) / 2;
    ctx.fillStyle = 'rgba(13,18,22,.42)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const big = `900 ${Math.round(Math.min(W, H) * .11)}px system-ui, sans-serif`;
    const label = (txt, x, y, colour = '#fff4d6') => { ctx.font = big; ctx.lineWidth = 7; ctx.strokeStyle = OUTLINE; ctx.strokeText(txt, x, y); ctx.fillStyle = colour; ctx.fillText(txt, x, y); };
    if (game === 'broadside') {
      const y = H * .4, x = W / 2 + (k - .5) * W * .5;
      ctx.strokeStyle = '#fff4d6'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(W * .15, y + H * .14); ctx.lineTo(W * .4, y + H * .14); ctx.lineTo(W * .36, y + H * .1); ctx.moveTo(W * .4, y + H * .14); ctx.lineTo(W * .36, y + H * .18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W * .85, y + H * .14); ctx.lineTo(W * .6, y + H * .14); ctx.lineTo(W * .64, y + H * .1); ctx.moveTo(W * .6, y + H * .14); ctx.lineTo(W * .64, y + H * .18); ctx.stroke();
      label('🎯', W / 2, y + H * .14);
      label('⇧ 💥', W / 2, H * .7, '#ffd24a');
      ctx.globalAlpha = .55; sideShip(x, y + H * .07, Math.min(W * .2, H * .32), 1, { hull: '#5b3a24', stripe: '#2b2b2b', sail: '#efe2bd', flag: '#1f2622', masts: 2 }); ctx.globalAlpha = 1;
    } else {
      const y = H * .83, size = Math.min(W, H) * .17;
      label('◀', W / 2 - size * 1.9 - k * 8, y); label('▶', W / 2 + size * 1.9 + k * 8, y);
      label('🪙 ✓', W * .28, H * .5, '#ffd24a'); label('💣 ✗', W * .72, H * .5, '#ff8a7a');
    }
  }

  function setPhase(next) {
    phase = next; root.dataset.phase = next;
    result.hidden = next !== 'result';
    controls.toggleAttribute('inert', next === 'result');
  }
  async function finish() {
    setPhase('result');
    const final = scoreOf(game, samples, { salt, easy: easy(), difficulty });
    const n = starsOf(game, final);
    outcome = { game, stars: n, score: final.score, max: final.max, wave };
    starRow(resultStars, n);
    resultScore.textContent = game === 'dash' ? `🪙 ${final.coins} · 💣 ${final.hits}` : `💥 ${final.hits} / ${final.ships} · ★ ${final.bulls}`;
    resultLine.textContent = '…';
    again.focus?.();
    let answer = null;
    try { answer = await onFinish(outcome); } catch { answer = null; }
    if (disposed || outcome?.stars !== n) return;
    resultLine.textContent = answer?.line ?? (n ? `Up to 🪙 ${best} for ${starText(3)}` : 'No stars this time.');
    root.dataset.paid = answer?.coins > 0 ? 'yes' : 'no';
  }
  function restart() {
    samples = new Map(); filled = 0; lastShot = -Infinity; effects.length = 0; seen.clear(); got.clear(); shelterUntil = -Infinity; boatX = 50; steerKeys = 0; pointerX = null; shake = 0; outcome = null;
    t = -BOAT.intro / 10; delete root.dataset.paid; setPhase('intro'); refreshScore();
  }
  let closed = false;
  function end() { if (closed) return; closed = true; dispose(); onClose(outcome); }

  function update(dt = 0) {
    if (disposed) return;
    const step = Math.max(0, Math.min(.1, Number(dt) || 0));
    clock += step;
    fit();
    if (phase === 'intro' || phase === 'play') t += step;
    if (phase === 'intro' && t >= 0) setPhase('play');
    const s = Math.min(BOAT.samples, Math.max(0, sample()));
    if (game === 'dash' && phase === 'play') {
      // Steering: keys and buttons push at a fixed speed; a pointer pulls the boat toward it (eased).
      if (pointerX !== null && steerKeys === 0) boatX += Math.sign(pointerX - boatX) * Math.min(Math.abs(pointerX - boatX), BOAT.dash.steer * step);
      else boatX += steerKeys * BOAT.dash.steer * step;
      boatX = Math.max(0, Math.min(100, boatX));
      for (; filled < s; filled++) samples.set(filled, Math.round(boatX * 10) / 10);
      for (const item of items) {
        if (seen.has(item.id) || item.at >= s) continue;
        seen.add(item.id);
        const x = samples.get(item.at), off = Number.isFinite(x) ? Math.abs(x - item.x) : Infinity, reach = easy() ? difficulty.easyCatch : difficulty.catch;
        if (item.kind === 'coin' && off <= reach) { got.add(item.id); effects.push({ kind: 'pop', at: clock, x: (W * .06 + item.x / 100 * W * .88) / W, y: .72, text: '+1', good: true }); }
        if (item.kind === 'ball' && off <= reach * BOAT.dash.ballReach) {
          if (item.at >= shelterUntil) { shelterUntil = item.at + BOAT.dash.shelter; effects.push({ kind: 'hit', at: clock, x: item.x }); effects.push({ kind: 'pop', at: clock, x: (W * .06 + item.x / 100 * W * .88) / W, y: .62, text: '−2', good: false }); shake = 1; }
        }
      }
      refreshScore();
    }
    shake = Math.max(0, shake - step * 3);
    const left = phase === 'intro' ? Math.ceil(-t) : Math.max(0, Math.ceil((BOAT.samples - sample()) / 10));
    clockText.textContent = `${phase === 'intro' ? BOAT.samples / 10 : left} s`;
    const count = phase === 'intro' ? String(Math.max(1, Math.ceil(-t))) : phase === 'play' && t < .6 ? 'Go!' : '';
    if (countdown.textContent !== count) countdown.textContent = count;
    if (phase === 'play' && sample() >= BOAT.samples) void finish();
    if (ctx) {
      if (game === 'broadside') drawBroadside(); else drawDash();
      if (phase === 'intro') drawIntroPicture();
      for (const item of effects) { const age = clock - item.at; if (item.kind === 'pop' && age >= 0 && age < .8) pop(item, age); }
    }
    while (effects.length > 80) effects.shift();
  }
  function loop(time) {
    if (disposed) return;
    const dt = lastTime === null ? 0 : (time - lastTime) / 1000; lastTime = time;
    update(dt); handle = frame(loop);
  }
  refreshScore(); update(0);
  if (autoplay && frame) handle = frame(loop);
  queueMicrotask?.(() => { if (!disposed) (game === 'broadside' ? fire : right).focus?.({ preventScroll: true }); });

  function dispose() {
    if (disposed) return; disposed = true;
    if (handle !== null && cancelFrame) cancelFrame(handle);
    window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', blur);
    root.remove();
  }
  return {
    element: root,
    update,
    get phase() { return phase; },
    get samples() { return samples; },
    get outcome() { return outcome; },
    get boatX() { return boatX; },
    shoot, steer(k) { steerKeys = k; }, aim(x) { pointerX = x; },
    close: end,
    dispose,
  };
}
