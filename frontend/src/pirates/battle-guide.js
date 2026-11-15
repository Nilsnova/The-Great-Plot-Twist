// The battle guide (owner's playtest, 15 Nov: "make their paths clearer … where the pirates land and where
// they will go"): drawing only, read from the wave's state, never fed back into the sim.
//
//   - where pirates land: a red ring with a skull flag on the beach of every sea lane of the wave;
//   - where they walk: a dotted line from each landing to the heart, the route the boarders' own grid takes
//     (boarder-paths.js, the same rule as sim.js with the wave rule "pathing"); an axe badge where the route has
//     to hack through a wall, so a wall the route walks round shows the detour;
//   - the goal: a gold ring and a heart badge on the island's heart;
//   - the walls: a small hp bar over every wall that is hurt or being hacked (green, yellow, red), and a broken
//     wall's gap outlined in red with a rubble badge.
// Between waves (no wave, or the break after a won one) the same landings and routes show faintly, so players
// can put walls and towers where the pirates will walk.
//
// The pure part (tested in tests/pirates/battle-guide.test.js) works out landings and routes; the drawing part
// is one instanced quad mesh on the ground and one in the air, like render.js's layers. Nothing is allocated per
// frame except when the walls change (the routes are worked out again then).
import * as THREE from 'three';
import { CONFIG, coastPoint, curveFor, skillOf } from './sim.js';
import { createBoarderPaths, WALL_FOOTPRINT } from './boarder-paths.js';
import { toScreen } from '../world/pixel-glsl.js';

const Y = .72; // drawn y per world z (the island's tilt)
export const GUIDE = Object.freeze({
  routeLimit: 400,     // at most this many steps per route (a route never visits a cell twice)
  heartReach: CONFIG.boarding.heartRadius,
  dotEvery: 1,         // one dot per grid cell (1 unit)
  previewAlpha: .38,   // between waves: the routes and landings are a faint preview (dots only, no chevrons)
  chevronEvery: 6,     // in a wave: one chevron every this many cells (more on a phone), small dots between
  barShow: 1,          // a wall bar shows below this share of hp (or while the wall is hacked)
});

/** Where boarders of a ship on bearing `a` (radians) step onto the beach (sim.js landBoarder). */
export function landingAt(a, coast = CONFIG.coast) {
  const p = coastPoint(a, CONFIG.boarding.landRadius, coast);
  return { x: round2(p.x), z: round2(p.z) };
}
/** The bearing of a point on the coast's ellipse (the inverse of coastPoint's direction). */
export const bearingOf = (point, coast = CONFIG.coast) => Math.atan2(point.z / coast.rz, point.x / coast.rx);
/** Every sea lane's landing: [{id, a, x, z}] (CONFIG.lanes on the home island). */
export function laneLandings(lanes = CONFIG.lanes, coast = CONFIG.coast) {
  return lanes.map(lane => { const a = lane.bearing * Math.PI / 180; return { id: lane.id, a, ...landingAt(a, coast) }; });
}
/** The landings of a wave from its wave_started lanes ([{id, x, z}]: where the ships of a lane anchor). */
export function waveLandings(lanes = [], coast = CONFIG.coast) {
  return lanes.filter(lane => Number.isFinite(lane?.x) && Number.isFinite(lane?.z))
    .map(lane => { const a = bearingOf(lane, coast); return { id: lane.id, a, ...landingAt(a, coast) }; });
}

/**
 * The walls the guide draws and routes over: [{id, x, z, hp, maxHp, level}] from the defenses (positions) and,
 * in a wave, the sim's state walls (hp). Without a state every wall is whole at its level's hp (skills too).
 */
export function guideWalls(defenses = [], stateWalls = null) {
  const live = new Map((stateWalls ?? []).map(wall => [wall.id, wall]));
  return defenses.filter(item => item?.kind === 'wall' && Number.isFinite(item.x) && Number.isFinite(item.z)).map(item => {
    const level = Math.max(1, Math.min(CONFIG.levels.wall.length, Number.isInteger(item.level) ? item.level : 1));
    const full = round2(CONFIG.levels.wall[level - 1].hp * (skillOf(item).hp ?? 1)), now = live.get(item.id);
    const maxHp = now?.maxHp > 0 ? now.maxHp : full, hp = now ? Math.max(0, now.hp) : startShare(item.health) * maxHp;
    return { id: item.id, x: item.x, z: item.z, level, hp: round2(hp), maxHp };
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
const startShare = health => (Number.isInteger(health) && health >= 0 && health <= 100 ? health / 100 : 1);

/**
 * The route a boarder landing at `from` walks to `heart` over these walls, as the sim's grid would take it now:
 * {points: [{x, z}] (cell centres, landing first), breaches: [{wallId, x, z}] (where it stops to hack), reachable}.
 * A wall on the way is treated as broken once reached, so the line goes on through the gap it will make.
 * wave: the wave number (the boarders' hack and walk speed set what a breach costs against a detour).
 */
export function guideRoute({ from, heart = CONFIG.boarding.heart, walls = [], coast = CONFIG.coast, wave = 1 }) {
  const curve = curveFor(Math.max(1, wave || 1)), B = CONFIG.boarding;
  const copies = walls.map(wall => ({ id: wall.id, x: wall.x, z: wall.z, hp: wall.hp, maxHp: wall.maxHp }));
  const paths = createBoarderPaths({ coast, heart, walls: copies, pace: { hackPerSecond: B.hack * curve.damage / B.hackEvery, speed: B.speed * curve.speed } });
  paths.refresh();
  const walker = { x: from.x, z: from.z }, points = [{ x: from.x, z: from.z }], breaches = [];
  for (let i = 0; i < GUIDE.routeLimit; i++) {
    if (Math.hypot(walker.x - heart.x, walker.z - heart.z) <= GUIDE.heartReach) return { points: [...points, { x: heart.x, z: heart.z }], breaches, reachable: true };
    const way = paths.next(walker);
    if (way.kind === 'heart') return { points: [...points, { x: heart.x, z: heart.z }], breaches, reachable: true };
    if (way.kind === 'wall') {
      const wall = copies.find(item => item.id === way.wallId);
      if (!wall || breaches.some(item => item.wallId === wall.id)) break;
      breaches.push({ wallId: wall.id, x: wall.x, z: wall.z });
      wall.hp = 0; paths.refresh(); // hacked down: the route goes on through its gap
      continue;
    }
    if (way.kind !== 'step') break;
    walker.x = way.x; walker.z = way.z; points.push({ x: way.x, z: way.z });
  }
  return { points, breaches, reachable: false };
}

/** A route per landing: [{id, landing, points, breaches, reachable}]. */
export function guideRoutes({ landings = [], heart, walls = [], coast, wave }) {
  return landings.map(landing => ({ id: landing.id, landing, ...guideRoute({ from: landing, heart, walls, coast, wave }) }));
}

/** What changes a route: the landings and each wall's quarter of hp (the grid's own breach bands). */
export function routeKey(landings, walls, wave) {
  const band = wall => (wall.hp > 0 ? Math.ceil(wall.hp / wall.maxHp * 4) : 0);
  return `${wave}|${landings.map(item => `${item.id}:${item.x},${item.z}`).join(';')}|${walls.map(wall => `${wall.id}:${wall.x},${wall.z}:${band(wall)}`).join(';')}`;
}

/**
 * A wall's bar, or null: shown while it is hurt (below barShow of its hp) or hacked, never on a broken wall
 * (that one gets the rubble badge). level: 'good' above 60 %, 'low' above 30 %, else 'bad' (green, yellow, red).
 */
export function wallBar(wall, attacked = false) {
  if (!wall || !(wall.maxHp > 0) || !(wall.hp > 0)) return null;
  const share = Math.max(0, Math.min(1, wall.hp / wall.maxHp));
  if (share >= GUIDE.barShow && !attacked) return null;
  return { share, level: share > .6 ? 'good' : share > .3 ? 'low' : 'bad' };
}

/** The ids of the walls a boarder hacks right now (state().boarders). */
export const attackedWalls = boarders => new Set((boarders ?? []).filter(item => item.state === 'hacking' && item.wallId).map(item => item.wallId));

/** Every dot of a route, `GUIDE.dotEvery` apart, with its order along the way (for the marching light). */
export function routeDots(points, every = GUIDE.dotEvery) {
  const dots = [];
  let carry = 0, along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!(length > 0)) continue;
    let t = carry;
    while (t <= length - 1e-9) {
      dots.push({ x: a.x + (b.x - a.x) * t / length, z: a.z + (b.z - a.z) * t / length, along: along + t, dx: (b.x - a.x) / length, dz: (b.z - a.z) / length });
      t += every;
    }
    carry = t - length; along += length;
  }
  return dots;
}

const round2 = value => Math.round(value * 100) / 100;

// ---------------------------------------------------------------- drawing

const SHAPE = { disc: 0, ring: 1, chevron: 2, icon: 3, box: 4 };
const ICONS = ['skull', 'heart', 'axe', 'rubble'];
const ICON_PX = 64;
const vertex = /* glsl */`
attribute vec4 iPos;attribute vec2 iSize;attribute vec4 iColor;attribute vec4 iUv;
varying vec2 vLocal;varying vec4 vColor;varying vec2 vUv;varying float vShape;
void main(){
  vec2 corner=position.xy;vLocal=corner*2.0-1.0;vShape=iPos.w;vColor=iColor;vUv=mix(iUv.xy,iUv.zw,corner);
  vec2 local=(corner-.5)*iSize;float c=cos(iPos.z),s=sin(iPos.z);
  local=vec2(local.x*c-local.y*s,local.x*s+local.y*c);
  gl_Position=projectionMatrix*viewMatrix*vec4(iPos.xy+local,0.0,1.0);
}`;
const fragment = /* glsl */`
uniform sampler2D uIcons;varying vec2 vLocal;varying vec4 vColor;varying vec2 vUv;varying float vShape;
void main(){
  float r=length(vLocal),a=vColor.a;vec3 rgb=vColor.rgb;
  if(vShape<.5){a*=1.0-smoothstep(.82,1.0,r);}
  else if(vShape<1.5){a*=smoothstep(.62,.72,r)*(1.0-smoothstep(.9,1.0,r));}
  else if(vShape<2.5){float x=vLocal.x,y=abs(vLocal.y);
    // A chevron pointing along +x: the big arrowhead minus a smaller one set back behind it.
    a*=step(-.75,x)*step(y,(.85-x)*.62)*(1.0-step(y,(.1-x)*.62));}
  else if(vShape<3.5){vec4 t=texture2D(uIcons,vUv);a*=t.a;rgb=t.rgb*vColor.rgb;}
  if(a<.01)discard;
  gl_FragColor=vec4(rgb*a,a);
  ${toScreen}
}`;

function createInstances(name, capacity, material, renderOrder, owned) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const attr = (size, key) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size); a.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(key, a); return a.array; };
  const pos = attr(4, 'iPos'), size = attr(2, 'iSize'), colour = attr(4, 'iColor'), uv = attr(4, 'iUv');
  geometry.instanceCount = 0;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `battle-guide:${name}`; mesh.renderOrder = renderOrder; mesh.frustumCulled = false; mesh.visible = false;
  owned.push(geometry);
  let count = 0;
  return {
    mesh, get count() { return count; },
    begin() { count = 0; },
    push(shape, x, y, w, h, c, { angle = 0, icon = null } = {}) {
      if (count >= capacity) return;
      const i = count * 4, j = count * 2;
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = angle; pos[i + 3] = shape;
      size[j] = w; size[j + 1] = h;
      colour[i] = c.r; colour[i + 1] = c.g; colour[i + 2] = c.b; colour[i + 3] = c.a ?? 1;
      const k = icon === null ? 0 : ICONS.indexOf(icon);
      uv[i] = k / ICONS.length; uv[i + 1] = 0; uv[i + 2] = (k + 1) / ICONS.length; uv[i + 3] = 1;
      count++;
    },
    end() {
      geometry.instanceCount = count; mesh.visible = count > 0;
      for (const key of ['iPos', 'iSize', 'iColor', 'iUv']) geometry.getAttribute(key).needsUpdate = true;
    },
  };
}

// The badges, painted once on a small canvas (one 64 px square each): a skull flag, a heart, an axe, rubble.
function paintIcons() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = ICON_PX * ICONS.length; canvas.height = ICON_PX;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const badge = (k, fill) => {
    const x = k * ICON_PX + ICON_PX / 2, y = ICON_PX / 2;
    c.beginPath(); c.arc(x, y, 29, 0, Math.PI * 2); c.fillStyle = '#1f2622'; c.fill();
    c.beginPath(); c.arc(x, y, 25, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
    return { x, y };
  };
  { // skull (pirates land here)
    const { x, y } = badge(0, '#b8322a');
    c.fillStyle = '#fff6e6'; c.beginPath(); c.arc(x, y - 4, 13, 0, Math.PI * 2); c.fill(); c.fillRect(x - 8, y + 4, 16, 10);
    c.fillStyle = '#1f2622'; c.beginPath(); c.arc(x - 5, y - 4, 4, 0, Math.PI * 2); c.arc(x + 5, y - 4, 4, 0, Math.PI * 2); c.fill();
    c.fillRect(x - 5, y + 9, 2, 5); c.fillRect(x - 1, y + 9, 2, 5); c.fillRect(x + 3, y + 9, 2, 5);
  }
  { // heart (defend this)
    const { x, y } = badge(1, '#f3c35c');
    c.fillStyle = '#d8323f'; c.beginPath(); c.moveTo(x, y + 15);
    c.bezierCurveTo(x - 22, y, x - 13, y - 17, x, y - 7); c.bezierCurveTo(x + 13, y - 17, x + 22, y, x, y + 15); c.fill();
  }
  { // axe (they hack through here)
    const { x, y } = badge(2, '#e2762e');
    c.save(); c.translate(x, y); c.rotate(-.7);
    c.fillStyle = '#7a4a24'; c.fillRect(-2.5, -16, 5, 32);
    c.fillStyle = '#e8eef0'; c.beginPath(); c.moveTo(2, -15); c.quadraticCurveTo(16, -10, 13, 2); c.lineTo(2, -3); c.closePath(); c.fill();
    c.restore();
  }
  { // rubble (a broken wall: a gap)
    const { x, y } = badge(3, '#5b5f63');
    c.fillStyle = '#c9b48f';
    for (const [dx, dy, w, h] of [[-14, 4, 10, 8], [-3, 6, 12, 8], [8, 2, 9, 9], [-8, -6, 11, 8], [3, -8, 8, 7]]) c.fillRect(x + dx, y + dy, w, h);
    c.strokeStyle = '#ff5a4a'; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 13, y - 13); c.lineTo(x + 13, y + 13); c.moveTo(x + 13, y - 13); c.lineTo(x - 13, y + 13); c.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.premultiplyAlpha = false;
  return texture;
}

/** Where a landing's skull badge stands: on the landing, or SKULL_SHIFT seaward (away from the heart) when a wall stands within SKULL_CLEAR of it. */
export const SKULL_CLEAR = 3, SKULL_SHIFT = 2.6;
export function skullAt(landing, heart = CONFIG.boarding.heart, walls = [], scale = 1) {
  if (!walls.some(wall => Math.hypot(wall.x - landing.x, wall.z - landing.z) < SKULL_CLEAR)) return [landing.x, landing.z];
  const dx = landing.x - heart.x, dz = landing.z - heart.z, d = Math.hypot(dx, dz) || 1;
  return [round2(landing.x + dx / d * SKULL_SHIFT * scale), round2(landing.z + dz / d * SKULL_SHIFT * scale)];
}
// How far right of a wall's centre its axe badge sits: half the hp bar (.8 + .07 frame) plus half the badge (.7) and a gap.
export const AXE_SIDE = 1.75;
const RGB = hex => { const c = new THREE.Color(hex); return { r: c.r, g: c.g, b: c.b }; };
const RED = RGB('#ff4a36'), DARK = RGB('#1f2622'), GOLD = RGB('#ffd34d'), WHITE = { r: 1, g: 1, b: 1 };
const BAR = { good: RGB('#7ed957'), low: RGB('#ffd34d'), bad: RGB('#ff4a36') };

/**
 * createBattleGuide({scene, reducedMotion, characterScale}) → {update(view), dispose()}.
 * view: null (hide), or {mode: 'preview'|'wave', lanes (the wave_started lanes, or null: every sea lane), defenses
 * (where the walls stand), stateWalls (the sim's walls in a wave, else null), boarders, heart: {x, z}, wave, dt}.
 * preview draws faintly and without wall marks; wave draws everything. The
 * routes are worked out again only when routeKey() changes (a wall placed, broken, rebuilt or past a quarter of hp).
 */
// sparse(): a phone-sized screen (overlap audit, 15 Nov): half the dots and fewer chevrons, so the routes stay readable.
// Between waves the preview always draws half the dots and no chevrons.
const phoneSized = () => typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) <= 500;
export function createBattleGuide({ scene, reducedMotion = () => false, characterScale = () => 1, sparse = phoneSized }) {
  const owned = [], root = new THREE.Group(); root.name = 'battle-guide'; scene.add(root);
  const icons = paintIcons(), blank = icons ? null : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  if (blank) blank.needsUpdate = true;
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { uIcons: { value: icons ?? blank } },
    transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false });
  owned.push(material, icons ?? blank);
  // On the ground (over the terrain, under every building and character) and in the air (badges and bars).
  const ground = createInstances('ground', 1400, material, 9, owned), air = createInstances('air', 160, material, 936, owned);
  root.add(ground.mesh, air.mesh);
  let clock = 0, disposed = false, key = null, routes = [];
  const still = () => !!reducedMotion();
  const drawnY = z => -z * Y;

  // k: how big the marks draw, the characters' battle scale during a wave (the camera is zoomed out), 1 between waves.
  let k = 1, thin = false;
  // Routes from two landings often share their last cells: each cell draws once (`cells`), each axe once (`axes`).
  const cells = new Set(), axes = new Set();
  function drawRoute(route, alpha, live) {
    const dots = routeDots(route.points);
    const total = dots.length ? dots[dots.length - 1].along : 0;
    // Calm (owner, 15 Nov: "limit the visual overload"): a chevron only every GUIDE.chevronEvery cells in a wave
    // (none in the preview), small soft dots, and every other dot left out between waves and on a phone.
    const every = thin ? GUIDE.chevronEvery + 2 : GUIDE.chevronEvery, sparseDots = thin || !live;
    dots.forEach((dot, i) => {
      if (i < 2) return; // under the landing ring
      const cell = `${Math.round(dot.x * 2)},${Math.round(dot.z * 2)}`;
      if (cells.has(cell)) return;
      cells.add(cell);
      const chevron = live && i % every === 0 && total - dot.along > 2;
      if (sparseDots && !chevron && i % 2) return;
      // A light runs along the route from the beach to the heart, so the way reads at a glance.
      const glow = still() || !live ? 0 : Math.max(0, Math.cos((dot.along - clock * 3.2) * .7)) ** 2;
      const y = drawnY(dot.z);
      if (chevron) {
        const angle = Math.atan2(-dot.dz * Y, dot.dx);
        ground.push(SHAPE.chevron, dot.x, y, .95 * k, .95 * k, { ...DARK, a: alpha * .6 }, { angle });
        ground.push(SHAPE.chevron, dot.x, y, .72 * k, .72 * k, { r: 1, g: .3 + glow * .55, b: .2 + glow * .4, a: alpha }, { angle });
      } else {
        const d = (.26 + glow * .08) * k;
        ground.push(SHAPE.disc, dot.x, y, d + .1 * k, (d + .1 * k) * Y, { ...DARK, a: alpha * .45 });
        ground.push(SHAPE.disc, dot.x, y, d, d * Y, { r: 1, g: .3 + glow * .55, b: .2 + glow * .4, a: alpha * .85 });
      }
    });
    // The axe sits beside the wall's hp bar (same row, to its right), never on top of it.
    for (const breach of route.breaches) {
      if (axes.has(breach.wallId)) continue;
      axes.add(breach.wallId);
      air.push(SHAPE.icon, breach.x + AXE_SIDE * k, drawnY(breach.z) + 1.45 * k, 1.4 * k, 1.4 * k, { ...WHITE, a: Math.min(1, alpha + .25) }, { icon: 'axe' });
    }
  }
  function drawLanding(landing, alpha, live, heart, walls) {
    const pulse = still() || !live ? 1 : 1 + .1 * Math.sin(clock * 5), y = drawnY(landing.z), r = 3.4 * k * pulse;
    ground.push(SHAPE.ring, landing.x, y, r + .3 * k, (r + .3 * k) * Y, { ...DARK, a: alpha * .6 });
    ground.push(SHAPE.ring, landing.x, y, r, r * Y, { ...RED, a: alpha });
    // A shore wall on the landing would hide under the skull (and its hp bar collide with it): the skull then
    // moves seaward, still inside the ring.
    const [sx, sz] = skullAt(landing, heart, walls, k);
    air.push(SHAPE.icon, sx, drawnY(sz) + 1.5 * k, 1.8 * k, 1.8 * k, { ...WHITE, a: Math.min(1, alpha + .3) }, { icon: 'skull' });
  }
  function drawHeart(heart, live) {
    const pulse = still() ? 1 : 1 + (live ? .08 : .04) * Math.sin(clock * 3), y = drawnY(heart.z), r = 4 * k * pulse;
    ground.push(SHAPE.ring, heart.x, y, r + .3 * k, (r + .3 * k) * Y, { ...DARK, a: .55 });
    ground.push(SHAPE.ring, heart.x, y, r, r * Y, { ...GOLD, a: live ? .95 : .75 });
    air.push(SHAPE.icon, heart.x, y + 2.4 * k, 2 * k * pulse, 2 * k * pulse, { ...WHITE, a: 1 }, { icon: 'heart' });
  }
  function drawWall(wall, attacked) {
    const y = drawnY(wall.z), half = WALL_FOOTPRINT / 2;
    if (!(wall.hp > 0)) {
      // The gap: the footprint outlined in red dashes on the ground, and the rubble badge over it.
      for (let i = 0; i < 8; i += 2) {
        const t = (i + .5) / 8 * 2 - 1;
        for (const [x, z] of [[wall.x + t * half, wall.z - half], [wall.x + t * half, wall.z + half], [wall.x - half, wall.z + t * half], [wall.x + half, wall.z + t * half]]) {
          ground.push(SHAPE.box, x, drawnY(z), .36, .3, { ...RED, a: .9 });
        }
      }
      air.push(SHAPE.icon, wall.x, y + 1.3 * k, 1.5 * k, 1.5 * k, { ...WHITE, a: .95 }, { icon: 'rubble' });
      return;
    }
    const bar = wallBar(wall, attacked);
    if (!bar) return;
    const w = 1.6 * k, h = .22 * k, top = y + 1.45 * k;
    air.push(SHAPE.box, wall.x, top, w + .14 * k, h + .14 * k, { ...DARK, a: .9 });
    air.push(SHAPE.box, wall.x - w / 2 * (1 - bar.share), top, w * bar.share, h, { ...BAR[bar.level], a: 1 });
  }

  return {
    root,
    update(view) {
      if (disposed) return;
      ground.begin(); air.begin(); cells.clear(); axes.clear();
      if (view) {
        thin = !!sparse();
        clock += Math.max(0, Math.min(.1, view.dt || 0));
        const live = view.mode === 'wave', alpha = live ? .95 : GUIDE.previewAlpha;
        k = live ? Math.max(1, Math.min(2, Number(characterScale()) || 1)) : 1;
        const landings = view.lanes?.length ? waveLandings(view.lanes) : laneLandings();
        const walls = guideWalls(view.defenses ?? [], view.stateWalls ?? null), attacked = attackedWalls(view.boarders);
        const heart = view.heart ?? CONFIG.boarding.heart, next = `${heart.x},${heart.z}|${routeKey(landings, walls, view.wave ?? 1)}`;
        if (next !== key) { key = next; routes = guideRoutes({ landings, heart, walls, wave: view.wave ?? 1 }); }
        for (const route of routes) drawRoute(route, alpha, live);
        for (const route of routes) drawLanding(route.landing, alpha, live, heart, walls);
        drawHeart(heart, live);
        if (live) for (const wall of walls) drawWall(wall, attacked.has(wall.id));
      }
      ground.end(); air.end();
    },
    setVisible(value) { root.visible = value !== false; },
    stats() { return { ground: ground.count, air: air.count, routes: routes.map(route => ({ id: route.id, points: route.points.length, breaches: route.breaches.map(item => item.wallId), reachable: route.reachable })) }; },
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear();
      for (const item of owned) item.dispose();
    },
  };
}
