// The wave events on screen (docs/GAME-V3.md §4.2): one canvas over the island, under the HUD, drawn in the
// game's cartoon style (bold dark outlines, two flat tones) from the sim's state and events. Nothing here
// changes the battle; the sim (wave-events.js) decides, this only shows it.
//   fog bank     white banks over the sea, clear around every tower's sight and the watchtower
//   storm        a dark wash, rain slanted by the wind, now and then a lightning flash
//   night raid   darkness with light around the towers, the heart, fires and burning hulls; far ships are
//                only their lanterns until a light reaches them
//   fire ships   flames and smoke on every fire ship, a fire ring where one bursts
//   pincer, smugglers  arrows on the water where the ships come in (the first seconds of the wave)
//   siege barge  a red target ring on the tower a shell will hit, smoke over a silenced tower
//   treasure galleon  her route as a dotted line, gold sparkles and a chest over her
//   kraken       the tentacles themselves (render.js leaves them out), rising, waving and slamming
// Reduced motion: no drifting, no flashes, tentacles stand still; low quality: fewer drops and wisps.
//   const art = createEventArt({container, canvas, project, reducedMotion, quality});
//   art.update({state, dt}); art.events(list); art.setVisible(bool); art.dispose()
const TAU = Math.PI * 2;
const OUTLINE = '#1f2622';
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function createEventArt({ container, canvas: world = null, project, reducedMotion = () => false, quality = () => 'high' } = {}) {
  const layer = document.createElement('canvas');
  layer.className = 'pirate-event-art';
  layer.setAttribute('aria-hidden', 'true');
  if (world?.parentElement === container) world.after(layer); else container.prepend(layer);
  const ctx = layer.getContext('2d');
  let clock = 0, visible = true, disposed = false, latest = null, flash = 0, nextFlash = 4;
  const bursts = [], smashes = [], rises = new Map();
  const still = () => !!reducedMotion();
  const low = () => quality() === 'low';

  function size() {
    const rect = layer.getBoundingClientRect(), dpr = Math.min(1.5, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
    if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
    return { w: rect.width, h: rect.height, dpr };
  }
  // Island units to px of the layer, and how many px one unit is (the camera zooms).
  const at = (x, z, lift = 0) => project?.(x, z, lift) ?? null;
  function unit() {
    const a = at(0, 0), b = at(1, 0);
    return a && b ? Math.max(1, Math.abs(b.x - a.x)) : 16;
  }
  const hole = (x, y, r, soft = .35) => {
    const g = ctx.createRadialGradient(x, y, r * (1 - soft), x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };
  // A wash over everything with soft holes where it is clear (destination-out).
  function wash(colour, holes) {
    const { w, h } = size();
    ctx.fillStyle = colour; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    for (const [x, y, r, soft] of holes) hole(x, y, r, soft);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFog(state, u) {
    const sight = (state.towers ?? []).map(tower => { const p = at(tower.x, tower.z); return p ? [p.x, p.y, tower.range * u, .3] : null; }).filter(Boolean);
    for (const tower of state.event.watchtowers ?? []) { const p = at(tower.x, tower.z); if (p) sight.push([p.x, p.y, state.event.clear * u, .45]); }
    const heart = state.heart ? at(state.heart.x, state.heart.z) : null;
    if (heart) sight.push([heart.x, heart.y, 12 * u, .5]);
    wash('rgba(226,233,236,.74)', sight);
    // Drifting banks: soft white ellipses with a pale blue underside.
    const { w, h } = size(), n = low() ? 5 : 10;
    for (let i = 0; i < n; i++) {
      const drift = still() ? 0 : clock * (6 + hash(i) * 8);
      const x = ((hash(i + 1) * w + drift) % (w + 300)) - 150, y = hash(i + 7) * h, rx = 90 + hash(i + 3) * 120, ry = 26 + hash(i + 5) * 18;
      ctx.fillStyle = 'rgba(200,214,224,.30)'; ctx.beginPath(); ctx.ellipse(x, y + ry * .35, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(248,250,250,.38)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    }
  }

  function drawStorm(state, u) {
    const { w, h } = size(), wind = state.event.wind ?? { x: .5, z: 0 };
    ctx.fillStyle = 'rgba(22,32,48,.30)'; ctx.fillRect(0, 0, w, h);
    const lean = Math.max(-.7, Math.min(.7, wind.x * .6)), n = low() ? 90 : 220, fall = 900;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const speed = .8 + hash(i + 11) * .5, len = 14 + hash(i + 3) * 16;
      const t = still() ? hash(i) : (clock * speed * fall / h + hash(i)) % 1;
      const y = t * (h + 60) - 30, x = ((hash(i + 5) * (w + 200)) + y * lean) % (w + 200) - 100;
      ctx.strokeStyle = i % 3 ? 'rgba(200,220,240,.55)' : 'rgba(255,255,255,.75)'; ctx.lineWidth = i % 3 ? 1.4 : 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + lean * len, y + len); ctx.stroke();
    }
    // The wind: a small sock of three strokes at the top left of the sea.
    const p = { x: 28, y: h - 40 };
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + wind.x * 30, p.y + wind.z * 12); ctx.stroke();
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + wind.x * 30, p.y + wind.z * 12); ctx.stroke();
    if (!still()) {
      if (clock > nextFlash) { flash = 1; nextFlash = clock + 5 + hash(clock) * 5; }
      if (flash > 0) {
        ctx.fillStyle = `rgba(235,245,255,${.42 * flash})`; ctx.fillRect(0, 0, w, h);
        const x = w * (.2 + hash(nextFlash) * .6);
        ctx.strokeStyle = `rgba(255,255,230,${flash})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 0);
        for (let k = 1; k <= 5; k++) ctx.lineTo(x + (hash(nextFlash + k) - .5) * 60, k * h * .09);
        ctx.stroke();
      }
    }
    void u;
  }

  function drawNight(state, u) {
    const lights = [];
    for (const tower of state.towers ?? []) { const p = at(tower.x, tower.z); if (p) lights.push([p.x, p.y, Math.max(6, tower.range) * u, .45]); }
    const heart = state.heart ? at(state.heart.x, state.heart.z) : null;
    if (heart) lights.push([heart.x, heart.y, (state.event.heart ?? 10) * u, .5]);
    for (const fire of state.fires ?? []) { const p = at(fire.x, fire.z); if (p) lights.push([p.x, p.y, (fire.radius + (state.event.fire ?? 4)) * u, .5]); }
    for (const ship of state.ships) if (ship.kind === 'fireship' || ship.hp / ship.maxHp < .5) { const p = at(ship.x, ship.z); if (p) lights.push([p.x, p.y, 4 * u, .6]); }
    wash('rgba(8,14,36,.80)', lights);
    // Lanterns: every ship outside the light is a warm dot with a halo (its hull hides in the dark).
    const lit = (x, y) => lights.some(([lx, ly, r]) => Math.hypot(x - lx, y - ly) < r * .8);
    for (const ship of state.ships) {
      if (ship.kind === 'tentacle') continue;
      const p = at(ship.x, ship.z, 1.6); if (!p || lit(p.x, p.y)) continue;
      const pulse = still() ? 1 : .85 + Math.sin(clock * 5 + ship.x) * .15, r = 3.2 + u * .12;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
      g.addColorStop(0, `rgba(255,214,120,${.55 * pulse})`); g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 5, 0, TAU); ctx.fill();
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd77a'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    }
  }

  // A cartoon flame: outlined teardrop, orange then yellow inside.
  function flame(x, y, s, phase) {
    const k = still() ? 1 : 1 + Math.sin(clock * 12 + phase) * .12;
    const shape = (scale, colour) => {
      ctx.fillStyle = colour; ctx.beginPath(); ctx.moveTo(x, y - s * 1.6 * k * scale);
      ctx.bezierCurveTo(x + s * .9 * scale, y - s * .6 * scale, x + s * .7 * scale, y + s * .5 * scale, x, y + s * .5 * scale);
      ctx.bezierCurveTo(x - s * .7 * scale, y + s * .5 * scale, x - s * .9 * scale, y - s * .6 * scale, x, y - s * 1.6 * k * scale); ctx.fill();
    };
    shape(1.18, OUTLINE); shape(1, '#f06b2a'); shape(.6, '#ffd24a');
  }
  function drawFireShips(state, u) {
    for (const ship of state.ships) {
      if (ship.kind !== 'fireship') continue;
      const p = at(ship.x, ship.z, .9); if (!p) continue;
      const s = Math.max(6, u * .55);
      if (!low()) for (let i = 0; i < 3; i++) {
        const rise = still() ? i * .3 : (clock * .7 + i / 3) % 1;
        ctx.fillStyle = `rgba(60,52,56,${.45 * (1 - rise)})`; ctx.beginPath(); ctx.arc(p.x + (i - 1) * s * .5, p.y - s * 1.8 - rise * s * 3, s * (.5 + rise * .7), 0, TAU); ctx.fill();
      }
      flame(p.x - s * .7, p.y, s * .8, 1); flame(p.x + s * .6, p.y + s * .1, s * .7, 2); flame(p.x, p.y - s * .2, s, 0);
    }
  }

  function arrow(from, to, colour, label) {
    const a = at(from.x, from.z), b = at(to.x, to.z); if (!a || !b) return;
    const angle = Math.atan2(b.y - a.y, b.x - a.x), bob = still() ? 0 : Math.sin(clock * 4) * 6;
    const x = b.x - Math.cos(angle) * (30 - bob), y = b.y - Math.sin(angle) * (30 - bob);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    const tri = (r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * .8, -r * .8); ctx.lineTo(-r * .35, 0); ctx.lineTo(-r * .8, r * .8); ctx.closePath(); ctx.fill(); };
    tri(22, OUTLINE); tri(17, colour); ctx.restore();
    if (label) { ctx.font = '700 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.strokeText(label, x, y - 26); ctx.fillStyle = '#fff4d6'; ctx.fillText(label, x, y - 26); }
  }
  function drawLanes(state) {
    if (state.time > 7) return;
    for (const lane of state.event.lanes ?? []) {
      if (state.event.id === 'smugglers' && lane.id !== 'north') continue;
      const length = Math.hypot(lane.x, lane.z) || 1, from = { x: lane.x * 1.5, z: lane.z * 1.5 }, to = { x: lane.x * (1 + 4 / length), z: lane.z * (1 + 4 / length) };
      arrow(from, to, state.event.id === 'smugglers' ? '#9fd26a' : '#ff8a5a', state.event.id === 'smugglers' ? 'Smugglers' : null);
    }
  }

  function drawBarge(state, u) {
    for (const shell of state.event.shells ?? []) {
      const p = at(shell.toX, shell.toZ); if (!p) continue;
      const share = Math.max(0, Math.min(1, (state.time - shell.from) / Math.max(.1, shell.impactAt - shell.from))), r = 3 * u;
      ctx.lineWidth = 5; ctx.strokeStyle = OUTLINE; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = '#e8473a'; ctx.beginPath(); ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + share * TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - r * .4, p.y); ctx.lineTo(p.x + r * .4, p.y); ctx.moveTo(p.x, p.y - r * .4); ctx.lineTo(p.x, p.y + r * .4); ctx.stroke();
    }
    for (const id of state.event.silenced ?? []) {
      const tower = state.towers.find(item => item.id === id), p = tower && at(tower.x, tower.z, 2.6); if (!p) continue;
      const rise = still() ? .3 : (clock * .8) % 1;
      ctx.fillStyle = `rgba(70,64,66,${.7 * (1 - rise)})`; ctx.beginPath(); ctx.arc(p.x, p.y - rise * 18, 9 + rise * 8, 0, TAU); ctx.fill();
      ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.strokeText('Silenced', p.x, p.y + 14);
      ctx.fillStyle = '#ffd0c8'; ctx.fillText('Silenced', p.x, p.y + 14);
    }
  }

  function chest(x, y, s) {
    ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.fillStyle = '#8a5a32';
    ctx.beginPath(); ctx.roundRect?.(x - s, y - s * .7, s * 2, s * 1.4, s * .3) ?? ctx.rect(x - s, y - s * .7, s * 2, s * 1.4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(x, y - s * .7, s * .8, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0b04a'; ctx.fillRect(x - s * .2, y - s * .3, s * .4, s * .5);
  }
  function drawGalleon(state, u) {
    const route = state.event.route ?? [];
    if (route.length > 1) {
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = still() ? 0 : -clock * 20; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,215,122,.8)';
      ctx.beginPath(); route.forEach((point, i) => { const p = at(point.x, point.z); if (p) (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); }); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const ship of state.ships) {
      if (ship.kind !== 'galleon') continue;
      const p = at(ship.x, ship.z, 4.6); if (!p) continue;
      const bob = still() ? 0 : Math.sin(clock * 3) * 3;
      chest(p.x, p.y + bob, Math.max(8, u * .45));
      if (!still()) for (let i = 0; i < 6; i++) {
        const a = clock * 2 + i, r = u * 2.4 * (.6 + hash(i) * .5), sx = p.x + Math.cos(a) * r, sy = p.y + 30 + Math.sin(a) * r * .4;
        ctx.fillStyle = `rgba(255,236,150,${.5 + .5 * Math.sin(clock * 6 + i)})`; ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, TAU); ctx.fill();
      }
    }
  }

  // A kraken tentacle: a thick curve rising from a ring of foam, purple on top, pink suckers below.
  function tentacle(ship, u) {
    const base = at(ship.x, ship.z); if (!base) return;
    const born = rises.get(ship.id) ?? (rises.set(ship.id, clock), clock), grow = still() ? 1 : Math.min(1, (clock - born) / 1.2);
    const slam = smashes.find(item => item.id === ship.id && clock - item.at < .5), hit = slam ? 1 - (clock - slam.at) / .5 : 0;
    const height = u * 5.2 * grow * (1 - hit * .55), sway = still() ? 0 : Math.sin(clock * 2.2 + ship.x) * u * .8;
    const lean = Math.sign(ship.x || 1) * -1, tipX = base.x + lean * u * (1.6 + hit * 2.4) + sway, tipY = base.y - height;
    const w = Math.max(5, u * .9);
    const path = (width) => {
      ctx.beginPath(); ctx.moveTo(base.x - width, base.y);
      ctx.bezierCurveTo(base.x - width, base.y - height * .5, tipX - lean * u * 1.8 - width * .4, tipY + height * .2, tipX, tipY);
      ctx.bezierCurveTo(tipX + lean * u * 2.4 + width * .3, tipY + height * .1, base.x + width, base.y - height * .45, base.x + width, base.y); ctx.closePath();
    };
    ctx.fillStyle = 'rgba(230,246,244,.85)'; ctx.beginPath(); ctx.ellipse(base.x, base.y, w * 2.1, w * .7, 0, 0, TAU); ctx.fill();
    path(w + 3); ctx.fillStyle = OUTLINE; ctx.fill();
    path(w); ctx.fillStyle = '#7b4aa8'; ctx.fill();
    ctx.save(); path(w); ctx.clip(); ctx.fillStyle = '#5b3486'; ctx.fillRect(base.x + lean * w * .2, tipY - 4, w * 2, height + 8); ctx.restore();
    ctx.fillStyle = '#f2a7c6';
    for (let k = 1; k <= 4; k++) { const t = k / 5, sx = base.x + (tipX - base.x) * t * .9 + lean * -w * .45, sy = base.y - height * t * .92; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, w * .22 * (1 - t * .5)), 0, TAU); ctx.fill(); }
    // Its hp bar, like a ship's.
    const share = Math.max(0, ship.hp / ship.maxHp), bw = u * 2.2, bx = base.x - bw / 2, by = tipY - 12;
    ctx.fillStyle = 'rgba(31,38,34,.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = share > .5 ? '#9fd26a' : share > .25 ? '#ffd77a' : '#d8553f'; ctx.fillRect(bx, by, bw * share, 4);
  }
  function drawKraken(state, u) {
    const alive = new Set();
    for (const ship of state.ships) if (ship.kind === 'tentacle') { alive.add(ship.id); tentacle(ship, u); }
    for (const id of rises.keys()) if (!alive.has(id)) rises.delete(id);
  }

  function drawBursts(u) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const item = bursts[i], age = clock - item.at;
      if (age > .7) { bursts.splice(i, 1); continue; }
      const p = at(item.x, item.z); if (!p) continue;
      const r = item.radius * u * (.4 + age / .7 * .6);
      ctx.lineWidth = 5; ctx.strokeStyle = `rgba(255,140,60,${1 - age / .7})`; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      if (!still()) flame(p.x, p.y, u * .9 * (1 - age), 0);
    }
    for (let i = smashes.length - 1; i >= 0; i--) {
      const item = smashes[i], age = clock - item.at;
      if (age > .8) { smashes.splice(i, 1); continue; }
      const p = at(item.x, item.z); if (!p) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(230,246,244,${1 - age / .8})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, u * 3 * (.4 + age), u * (.4 + age) * .9, 0, 0, TAU); ctx.stroke();
    }
  }

  function draw() {
    const { w, h, dpr } = size();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const state = latest;
    if (!visible || !state?.event) return;
    const u = unit(), id = state.event.id;
    if (id === 'kraken') drawKraken(state, u);
    if (id === 'fire_ships') drawFireShips(state, u);
    if (id === 'treasure_galleon') drawGalleon(state, u);
    if (id === 'siege_barge') drawBarge(state, u);
    drawBursts(u);
    if (id === 'pincer' || id === 'smugglers') drawLanes(state);
    if (id === 'fog_bank') drawFog(state, u);
    if (id === 'night_raid') drawNight(state, u);
    if (id === 'storm') drawStorm(state, u);
  }

  return {
    element: layer,
    update({ state, dt = 0 } = {}) {
      if (disposed) return;
      clock += Math.max(0, Math.min(.1, dt || 0)); latest = state ?? latest;
      flash = Math.max(0, flash - (dt || 0) * 3);
      draw();
    },
    events(list = []) {
      for (const event of list) {
        if (event.type === 'fireship_burst') bursts.push({ x: event.x, z: event.z, radius: event.radius ?? 4, at: clock });
        else if (event.type === 'kraken_smash') smashes.push({ id: event.shipId, x: event.x, z: event.z, at: clock });
        else if (event.type === 'kraken_rose') rises.set(event.shipId, clock);
      }
    },
    setVisible(value) { visible = value !== false; layer.hidden = !visible; },
    dispose() { if (disposed) return; disposed = true; layer.remove(); },
  };
}
