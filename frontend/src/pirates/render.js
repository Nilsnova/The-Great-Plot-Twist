// The wave on screen (lane P3): ships bobbing in on the sea lanes, cannonballs on an arc, splashes,
// hit flashes, sinking ships and fading wrecks, wall damage states, cannon fire frames, the lighthouse
// beam on the flagship and fog beyond the cannons' sight. Drawn from wave.state() and the wave's events.
//
// Budget (GRAPHICS.md): everything moving is a batched sprite. One atlas texture holds every pirate
// sprite; one shader draws a whole layer of quads in a single call (far sea, near sea, air), each wall
// and cannon is a one-quad layer of its own so it sorts with the player by Z, and the fog is one quad.
// 24 ships with their balls, splashes and bars cost 3 draw calls plus one per defense. Sparks and
// rings go to the shared pixel effects (scene.userData.pixelFx). Nothing is allocated per frame: the
// layers have fixed capacities and the effect lists reuse their entries.
// Reduced motion: no bobbing, no arcs (balls fly flat), no sparks, a single bloom instead. Low quality:
// about a third of the sparks, no smoke puffs and no wakes.
//
// Tower defense v2: mortar shells on a high arc with an area burst, warships, tower levels (their own
// level art with brass pips), crew figures, the captain's musket (pose, tracer, flash, reload ring), smoke
// over damaged walls, fire on burning ships and the lookout's early warnings. Every sprite is the art
// lane's own (src/pixel/pirate-catalog.js); nothing is tinted or borrowed any more.
import * as THREE from 'three';
import { crewArt, pirateDimensions, pirateFrames, pirateLevels } from '../pixel/pirate-catalog.js';
import { pixelGlsl, toScreen } from '../world/pixel-glsl.js';

const UNIT = 16, Y = .72;
const WHITE = 'white';
export const ATLAS_IDS = [...pirateFrames.sloop, ...pirateFrames.brig, ...pirateFrames.flagship, ...pirateFrames.warship,
  ...pirateFrames.splash, ...pirateFrames.wall, ...pirateFrames.cannon, ...pirateFrames.mortar,
  ...pirateLevels.wall.slice(1), ...pirateLevels.cannon.slice(1), ...pirateLevels.mortar.slice(1), ...Object.values(crewArt),
  ...pirateFrames.captain, ...pirateFrames.smoke, ...pirateFrames.fire, ...pirateFrames.explosion,
  'fx-musket-flash', 'fx-mortar-shell', 'fx-level-pip', 'pirate-cannonball', 'pirate-wreck'];
export const WARSHIP_FRAMES = pirateFrames.warship;
const EXPLOSION_FRAMES = pirateFrames.explosion;
const LAYER_ORDER = { far: 76, near: 124, air: 940, fog: 900 };
const CAPACITY = { far: 96, near: 96, air: 320 };
const SINK_SECONDS = 1.8, WRECK_SECONDS = 9, SPLASH_SECONDS = .5, FLASH_SECONDS = .12, FIRE_SECONDS = .22;
const BURST_SECONDS = .6, TRACER_SECONDS = .14, POSE_SECONDS = .45, POST_CAPACITY = 8;

/** Shelf-packs the sprites (and a small white block for bars and the beam) into one atlas. Pure. */
export function packAtlas(ids = ATLAS_IDS, dimensions = pirateDimensions, width = 512, pad = 2) {
  const rects = {}, items = [...ids.map(id => [id, dimensions[id][0], dimensions[id][1]]), [WHITE, 8, 8]];
  items.sort((a, b) => b[2] - a[2]);
  let x = pad, y = pad, shelf = 0;
  for (const [id, w, h] of items) {
    if (x + w + pad > width) { x = pad; y += shelf + pad; shelf = 0; }
    rects[id] = { x, y, w, h, anchor: id === WHITE ? 0 : dimensions[id][2] };
    x += w + pad; shelf = Math.max(shelf, h);
  }
  let height = 16;
  while (height < y + shelf + pad) height *= 2;
  return { width, height, rects };
}

/** Loads the pirate PNGs into one canvas texture (browser only). Cached by the caller. */
export async function loadAtlas({ base = import.meta.env?.BASE_URL ?? './' } = {}) {
  const load = id => new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = 'async';
    image.onload = () => resolve([id, image]); image.onerror = () => reject(new Error(`Drawing failed: ${id}`));
    image.src = `${base}pixel/${id}.png`;
  });
  const images = await Promise.all(ATLAS_IDS.map(load));
  const pack = packAtlas();
  const canvas = document.createElement('canvas'); canvas.width = pack.width; canvas.height = pack.height;
  const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
  for (const [id, image] of images) context.drawImage(image, pack.rects[id].x, pack.rects[id].y);
  const white = pack.rects[WHITE]; context.fillStyle = '#fff'; context.fillRect(white.x, white.y, white.w, white.h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, ...pack };
}

const spriteVertex = /* glsl */`
attribute vec4 iPos;attribute vec4 iSize;attribute vec4 iUv;attribute vec4 iTint;attribute float iFlash;
varying vec2 vUv;varying vec4 vTint;varying float vFlash;
void main(){
  vec2 corner=position.xy;
  vec2 local=vec2((corner.x-iSize.z)*iSize.x,corner.y*iSize.y-iSize.w);
  float c=cos(iPos.z),s=sin(iPos.z);
  local=vec2(local.x*c-local.y*s,local.x*s+local.y*c);
  vec2 origin=floor(iPos.xy*16.0+.5)/16.0;
  vUv=mix(iUv.xy,iUv.zw,corner);vTint=iTint;vFlash=iFlash;
  gl_Position=projectionMatrix*viewMatrix*vec4(origin+local,0.0,1.0);
}`;
const spriteFragment = /* glsl */`
uniform sampler2D uMap;varying vec2 vUv;varying vec4 vTint;varying float vFlash;
void main(){
  vec4 t=texture2D(uMap,vUv);float a=t.a*vTint.a;
  if(a<.03)discard;
  gl_FragColor=vec4(mix(t.rgb*vTint.rgb,vec3(1.0,.96,.82),vFlash),a);
  ${toScreen}
}`;
const fogVertex = /* glsl */`varying vec2 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xy;gl_Position=projectionMatrix*viewMatrix*w;}`;
const fogFragment = /* glsl */`
${pixelGlsl}
uniform vec2 uCannons[8];uniform float uCount,uSight,uFog,uTime;varying vec2 vWorld;
void main(){
  vec2 px=floor(vWorld*16.0);vec2 p=(px+.5)/16.0;vec2 logical=vec2(p.x,-p.y/.72);
  float d=1e4;
  for(int i=0;i<8;i++){if(float(i)>=uCount)break;d=min(d,length(logical-uCannons[i]));}
  float drift=pxNoise(vec2(p.x*.09+uTime*.05,p.y*.16))*.35;
  float edge=smoothstep(uSight-1.5,uSight+5.0,d+drift*3.0);
  float a=pxSteps(edge*(.32+.42*uFog)+drift*edge*.15,4.0,px);
  if(a<=0.0)discard;
  gl_FragColor=vec4(vec3(.80,.85,.84),a);
  ${toScreen}
}`;

function createLayer(name, capacity, material, renderOrder, owned) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const attr = (size, key) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
    a.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute(key, a); return a.array;
  };
  const pos = attr(4, 'iPos'), size = attr(4, 'iSize'), uv = attr(4, 'iUv'), tint = attr(4, 'iTint'), flash = attr(1, 'iFlash');
  geometry.instanceCount = 0;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `pirates:${name}`; mesh.renderOrder = renderOrder; mesh.frustumCulled = false; mesh.visible = false;
  owned.push(geometry);
  let count = 0;
  return {
    mesh,
    get count() { return count; },
    begin() { count = 0; },
    // rect: atlas rect in uv; x, y drawn; w, h world units; ax 0..1 across, ay units below the base line.
    push(rect, x, y, w, h, ax, ay, { flip = false, angle = 0, r = 1, g = 1, b = 1, a = 1, flashing = 0 } = {}) {
      if (count >= capacity || !rect) return;
      const i = count * 4;
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = angle; pos[i + 3] = 0;
      size[i] = w; size[i + 1] = h; size[i + 2] = ax; size[i + 3] = ay;
      uv[i] = flip ? rect.u1 : rect.u0; uv[i + 1] = rect.v0; uv[i + 2] = flip ? rect.u0 : rect.u1; uv[i + 3] = rect.v1;
      tint[i] = r; tint[i + 1] = g; tint[i + 2] = b; tint[i + 3] = a; flash[count] = flashing;
      count++;
    },
    end() {
      geometry.instanceCount = count; mesh.visible = count > 0;
      for (const key of ['iPos', 'iSize', 'iUv', 'iTint', 'iFlash']) {
        const attribute = geometry.getAttribute(key); attribute.needsUpdate = true;
        attribute.clearUpdateRanges?.(); attribute.addUpdateRange?.(0, count * attribute.itemSize);
      }
    },
  };
}

// A small reusable list: entries are recycled instead of allocated per event.
function pool() {
  const items = [], spare = [];
  return {
    items,
    add(fill) { const item = spare.pop() ?? {}; fill(item); items.push(item); return item; },
    sweep(keep) { for (let i = items.length - 1; i >= 0; i--) if (!keep(items[i])) { spare.push(items[i]); items.splice(i, 1); } },
    clear() { spare.push(...items); items.length = 0; },
    get size() { return items.length; },
  };
}

const colour = hex => { const c = new THREE.Color(hex); return { r: c.r, g: c.g, b: c.b }; };
const GOLD = colour('#ffd77a'), RED = colour('#d8553f'), GREEN = colour('#9fd26a'), DARK = colour('#1f2622'), BEAM = colour('#ffe9a8');
const BRASS = colour('#e0b04a');
const SHIP_SIZE = Object.fromEntries(['sloop', 'brig', 'flagship'].map(kind => {
  const [w, h] = pirateDimensions[pirateFrames[kind][0]]; return [kind, { w: w / UNIT, h: h / UNIT }];
}));
{ const [w, h] = pirateDimensions[pirateFrames.warship[0]]; SHIP_SIZE.warship = { w: w / UNIT, h: h / UNIT }; }
const FRAMES = pirateFrames;

/**
 * createWaveRenderer({scene, atlas, defenses, reducedMotion, quality, beamFrom}) where atlas is
 * {texture, width, height, rects} from loadAtlas(), defenses [{id, kind, x, z}] in world units and
 * beamFrom an optional drawn point {x, y} the lamps' beam starts from (the lighthouse lamp).
 * update({state, simTime, dt}) every frame; events(list) with the wave's events; dispose() once.
 */
export function createWaveRenderer({ scene, atlas, defenses = [], reducedMotion = () => false, quality = () => 'high',
  beamFrom = null, fx = () => scene.userData?.pixelFx ?? null }) {
  const owned = [], root = new THREE.Group(); root.name = 'pirate-wave'; scene.add(root);
  const rect = {};
  for (const [id, r] of Object.entries(atlas.rects)) {
    // Half a texel in from every edge so neighbours never bleed in.
    rect[id] = { u0: (r.x + .01) / atlas.width, u1: (r.x + r.w - .01) / atlas.width,
      v0: 1 - (r.y + r.h - .01) / atlas.height, v1: 1 - (r.y + .01) / atlas.height, w: r.w / UNIT, h: r.h / UNIT, anchor: r.anchor / UNIT };
  }
  const tintOf = r => (r?.tint ? { r: r.tint.r, g: r.tint.g, b: r.tint.b } : {});
  const material = new THREE.ShaderMaterial({ vertexShader: spriteVertex, fragmentShader: spriteFragment,
    uniforms: { uMap: { value: atlas.texture } }, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  owned.push(material);
  const layers = {
    far: createLayer('far-sea', CAPACITY.far, material, LAYER_ORDER.far, owned),
    near: createLayer('near-sea', CAPACITY.near, material, LAYER_ORDER.near, owned),
    air: createLayer('air', CAPACITY.air, material, LAYER_ORDER.air, owned),
  };
  for (const layer of Object.values(layers)) root.add(layer.mesh);
  // A one-layer post per wall, cannon and mortar (the sprite, its level pips and its crew figure); the
  // watchtower gets one only for the lookout.
  const posts = defenses.filter(item => item.kind === 'wall' || item.kind === 'cannon' || item.kind === 'mortar' || item.kind === 'watchtower').map(item => {
    const layer = createLayer(`defense:${item.id}`, POST_CAPACITY, material, 100 + item.z, owned); root.add(layer.mesh);
    const level = Number.isInteger(item.level) ? Math.max(1, Math.min(3, item.level)) : 1;
    return { ...item, level, layer, flip: false };
  });
  const cannonsList = defenses.filter(item => item.kind === 'cannon' || item.kind === 'mortar');
  const fogUniforms = { uCannons: { value: Array.from({ length: 8 }, (_, i) => new THREE.Vector2(cannonsList[i]?.x ?? 0, cannonsList[i]?.z ?? 0)) },
    uCount: { value: Math.min(8, cannonsList.length) }, uSight: { value: 28 }, uFog: { value: 0 }, uTime: { value: 0 } };
  const fogMaterial = new THREE.ShaderMaterial({ vertexShader: fogVertex, fragmentShader: fogFragment, uniforms: fogUniforms,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const fogGeometry = new THREE.PlaneGeometry(160, 120);
  owned.push(fogMaterial, fogGeometry);
  const fog = new THREE.Mesh(fogGeometry, fogMaterial); fog.name = 'pirates:fog'; fog.renderOrder = LAYER_ORDER.fog; fog.frustumCulled = false; fog.visible = false;
  root.add(fog);

  const ships = new Map(); // id -> {facing, phase, flashUntil, bornAt}
  const sinkers = pool(), wrecks = pool(), balls = pool(), splashes = pool(), shells = pool(), bursts = pool(), tracers = pool(), warnings = pool();
  let captain = null;
  const fire = new Map(), wallFlash = new Map();
  let clock = 0, simNow = 0, latest = null, visible = true, disposed = false;
  const still = () => !!reducedMotion();
  const low = () => quality() === 'low';
  const drawnY = z => -z * Y;
  const effects = () => (disposed ? null : fx());
  const spark = (x, y, options) => { const f = effects(); if (!f || still()) return; f.burst(x, y, low() ? { ...options, count: Math.ceil(options.count / 3) } : options); };

  function shipMeta(id, kind, x, toX) {
    let meta = ships.get(id);
    if (!meta) {
      const dx = (toX ?? 0) - x;
      const facing = Math.abs(dx) > .5 ? (dx < 0 ? -1 : 1) : (x > 0 ? -1 : 1);
      let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
      meta = { kind, facing, phase: (hash >>> 0) % 997 / 997 * 4, flashUntil: -1, bornAt: clock };
      ships.set(id, meta);
    }
    return meta;
  }
  const frameOf = (kind, phase) => {
    const frames = FRAMES[kind] ?? FRAMES.sloop;
    if (still()) return frames[0];
    const step = Math.floor(clock * 3.2 + phase) % 4; return frames[step === 3 ? 1 : step];
  };

  function onEvent(event) {
    const x = event.x, y = drawnY(event.z ?? 0);
    switch (event.type) {
      case 'ship_spawned': shipMeta(event.shipId, event.kind, event.x, event.toX); break;
      case 'cannon_fired': {
        balls.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt,
          hit: event.hit, enemy: false, splashed: false, manual: event.manual }));
        const flip = event.toX < event.x;
        fire.set(event.cannonId, { until: clock + FIRE_SECONDS, flip });
        const post = posts.find(item => item.id === event.cannonId); if (post) post.flip = flip;
        const mx = event.x + (flip ? -1.3 : 1.3), my = drawnY(event.z) + .9;
        if (!low() && !still()) spark(mx, my, { count: 8, speed: [.3, 1.1], angle: Math.PI / 2, spread: 1.6, gravity: -.8, life: [.5, 1], colour: '#d9d6c8', size: [1, 2] });
        effects()?.bloom(mx, my, { radius: event.manual ? 1.3 : .9, life: .35, colour: '#ffcf6a' });
        break;
      }
      case 'ship_hit': {
        const meta = ships.get(event.shipId);
        if (meta && !event.blocked) meta.flashUntil = clock + FLASH_SECONDS;
        const size = SHIP_SIZE[event.kind] ?? SHIP_SIZE.sloop, hy = y + size.h * .35;
        if (event.blocked) { effects()?.ring(x, hy, { radius: 1.4, life: .4, colour: '#e6eef0' }); break; }
        if (event.source === 'lamps') {
          effects()?.bloom(x, hy, { radius: 3.4, life: 1.1, colour: '#ffd77a' });
          spark(x, hy, { count: 40, speed: [1.5, 5], angle: Math.PI / 2, spread: Math.PI * 1.4, gravity: 5, life: [.6, 1.4], colour: '#ffe08a' });
          break;
        }
        spark(x, hy, { count: event.manual ? 22 : 12, speed: [1, 3.6], angle: Math.PI / 2, spread: 2.4, gravity: 7, life: [.4, .9], colour: '#8a5a32', size: [1, 2] });
        effects()?.bloom(x, hy, { radius: event.manual ? 1.6 : 1, life: .3, colour: '#ffb35a' });
        break;
      }
      case 'ship_sunk': {
        const meta = ships.get(event.shipId) ?? shipMeta(event.shipId, event.kind, event.x);
        sinkers.add(item => Object.assign(item, { kind: event.kind, x: event.x, z: event.z, facing: meta.facing, at: clock }));
        wrecks.add(item => Object.assign(item, { x: event.x, z: event.z, facing: meta.facing, at: clock + SINK_SECONDS * .6, big: event.kind !== 'sloop' }));
        ships.delete(event.shipId);
        splashes.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, big: true }));
        effects()?.ring(x, y, { radius: event.kind === 'flagship' ? 6 : 3, life: .9, colour: '#d8f0e6' });
        spark(x, y + .6, { count: event.kind === 'flagship' ? 70 : 26, speed: [1, 4.5], angle: Math.PI / 2, spread: 2, gravity: 6, life: [.6, 1.4], colour: '#cfe9e2' });
        break;
      }
      case 'wall_damaged': case 'island_damaged': {
        // The pirates' shot: a short flat arc from the ship to what it hit (drawn only).
        const ship = latest?.ships?.find(item => item.id === event.shipId);
        const targetX = event.type === 'wall_damaged' ? event.x : event.x * .86, targetZ = event.type === 'wall_damaged' ? event.z : event.z * .86;
        if (ship) balls.add(item => Object.assign(item, { x: ship.x, z: ship.z, toX: targetX, toZ: targetZ, from: simNow, to: simNow + .45,
          hit: true, enemy: true, splashed: false, dust: event.type === 'wall_damaged' ? 'wall' : 'shore', wallId: event.wallId }));
        else if (event.type === 'wall_damaged') wallFlash.set(event.wallId, clock + FLASH_SECONDS);
        break;
      }
      case 'wall_repaired': effects()?.bloom(x, y + 1, { radius: 1.4, life: .6, colour: '#bfe6a8' }); break;
      case 'mortar_fired': {
        shells.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt }));
        fire.set(event.towerId, { until: clock + FIRE_SECONDS * 1.6, flip: event.toX < event.x });
        const post = posts.find(item => item.id === event.towerId); if (post) post.flip = event.toX < event.x;
        effects()?.bloom(event.x, y + 1.2, { radius: 1.4, life: .45, colour: '#ffcf6a' });
        spark(event.x, y + 1.3, { count: 14, speed: [.4, 1.4], angle: Math.PI / 2, spread: 1.2, gravity: -1, life: [.7, 1.3], colour: '#cfcabb', size: [1, 3] });
        break;
      }
      case 'mortar_impact': {
        // The area burst: a ring as wide as the blast radius, a flash, debris, and a splash in the sea.
        bursts.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, radius: event.radius ?? 4 }));
        effects()?.ring(x, y, { radius: event.radius ?? 4, life: .55, colour: '#ffcf6a' });
        effects()?.bloom(x, y + .6, { radius: 2.6, life: .5, colour: '#ff9a4a' });
        spark(x, y + .5, { count: 30, speed: [1.5, 5], angle: Math.PI / 2, spread: 2.6, gravity: 7, life: [.5, 1.1], colour: '#ffb35a', size: [1, 2] });
        splashes.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, big: true }));
        break;
      }
      case 'captain_fired': {
        tracers.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, at: clock }));
        effects()?.bloom(event.x, y + 1.1, { radius: .7, life: .2, colour: '#fff0b0' });
        break;
      }
      case 'ship_warning': warnings.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, boss: event.boss })); break;
      default: break;
    }
  }

  function drawShip(ship, meta) {
    const size = SHIP_SIZE[ship.kind] ?? SHIP_SIZE.sloop, frame = frameOf(ship.kind, meta.phase), r = rect[frame];
    if (!r) return;
    const layer = ship.z < 0 ? layers.far : layers.near, x = ship.x, y = drawnY(ship.z);
    const fadeIn = Math.min(1, (clock - meta.bornAt) / .6), flashing = clock < meta.flashUntil ? .85 : 0;
    // A wake behind a sailing ship: two pale strokes on the water.
    if (ship.state === 'sailing' && !low() && !still()) {
      const back = -meta.facing * size.w * .45, wob = Math.floor(clock * 6 + meta.phase) % 2;
      layer.push(rect[WHITE], x + back, y - .05, size.w * .28, .06, .5, 0, { a: .45 * fadeIn });
      layer.push(rect[WHITE], x + back * 1.35 - wob * .1, y + .08, size.w * .18, .06, .5, 0, { a: .3 * fadeIn });
    }
    layer.push(r, x, y, r.w, r.h, .5, r.anchor, { flip: meta.facing < 0, a: fadeIn, flashing, ...tintOf(r) });
    // A burning ship below a third of its hull: the fire art flickers on deck.
    if (ship.hp > 0 && ship.hp < ship.maxHp / 3) {
      const flame = rect[pirateFrames.fire[(still() ? 0 : Math.floor(clock * 8 + meta.phase)) % 3]];
      layers.air.push(flame, x + meta.facing * size.w * .12, y + size.h * .35, flame.w, flame.h, .5, flame.anchor, { a: fadeIn });
    }
    if (ship.hp < ship.maxHp || ship.boss) {
      const top = y + size.h - r.anchor + .15, w = Math.min(2.4, size.w * .5), share = Math.max(0, ship.hp / ship.maxHp);
      const tint = ship.kind === 'flagship' && !ship.exposed ? { r: .75, g: .78, b: .8 } : ship.boss ? RED : share > .5 ? GREEN : share > .25 ? GOLD : RED;
      layers.air.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .3125, 0, 0, { ...DARK, a: .8 });
      layers.air.push(rect[WHITE], x - w / 2, top, w * share, .1875, 0, 0, { ...tint, a: 1 });
    }
  }

  function drawBall(ball) {
    const span = Math.max(.05, ball.to - ball.from), p = Math.min(1, Math.max(0, (simNow - ball.from) / span));
    const x = ball.x + (ball.toX - ball.x) * p, z = ball.z + (ball.toZ - ball.z) * p;
    const distance = Math.hypot(ball.toX - ball.x, ball.toZ - ball.z);
    const lift = still() ? .8 : (ball.enemy ? .8 : 1.2) + 4 * (distance * (ball.enemy ? .03 : .07)) * p * (1 - p);
    const r = rect['pirate-cannonball'];
    // A short pale trail behind the ball, then the ball itself.
    if (!still() && p > .08) for (const back of [.07, .14]) {
      const q = Math.max(0, p - back), tx = ball.x + (ball.toX - ball.x) * q, tz = ball.z + (ball.toZ - ball.z) * q;
      const tl = (ball.enemy ? .8 : 1.2) + 4 * (distance * (ball.enemy ? .03 : .07)) * q * (1 - q);
      layers.air.push(rect[WHITE], tx, drawnY(tz) + tl, .25, .25, .5, .125, { r: .9, g: .9, b: .85, a: back < .1 ? .55 : .3 });
    }
    layers.air.push(r, x, drawnY(z) + lift, r.w * 1.1, r.h * 1.1, .5, .55 * r.h, ball.enemy ? { r: .55, g: .45, b: .4 } : undefined);
    // The ball's shadow on the water or the sand.
    if (!still()) layers.air.push(rect[WHITE], x, drawnY(z) - .05, .3, .1, .5, 0, { ...DARK, a: .35 });
  }

  // A mortar shell: a high, slow arc with its shadow racing ahead on the water.
  function drawShell(shell) {
    const span = Math.max(.05, shell.to - shell.from), p = Math.min(1, Math.max(0, (simNow - shell.from) / span));
    const x = shell.x + (shell.toX - shell.x) * p, z = shell.z + (shell.toZ - shell.z) * p;
    const distance = Math.hypot(shell.toX - shell.x, shell.toZ - shell.z), r = rect['fx-mortar-shell'] ?? rect['pirate-cannonball'];
    const lift = still() ? 1.2 : 1.2 + (5 + distance * .18) * 4 * p * (1 - p);
    if (!still() && p > .05) for (const back of [.04, .09, .15]) {
      const q = Math.max(0, p - back), tx = shell.x + (shell.toX - shell.x) * q, tz = shell.z + (shell.toZ - shell.z) * q;
      const tl = 1.2 + (5 + distance * .18) * 4 * q * (1 - q);
      layers.air.push(rect[WHITE], tx, drawnY(tz) + tl, .3, .3, .5, .15, { r: .85, g: .82, b: .78, a: .5 - back * 2 });
    }
    layers.air.push(r, x, drawnY(z) + lift, r.w, r.h, .5, .55 * r.h, tintOf(r));
    if (!still()) layers.air.push(rect[WHITE], x, drawnY(z) - .05, .45 * (.6 + p * .6), .14, .5, 0, { ...DARK, a: .3 + p * .2 });
    // Where it will land: a faint target mark, so the player sees the area coming.
    if (p > .35) layers.air.push(rect[WHITE], shell.toX, drawnY(shell.toZ), 2.4 * p, .1, .5, 0, { ...RED, a: .35 * p });
  }
  function drawBurst(burst) {
    const p = (clock - burst.at) / BURST_SECONDS, frame = EXPLOSION_FRAMES[Math.min(3, Math.floor(p * 4))], r = rect[frame];
    if (!r) return;
    const grow = 1.2, y = drawnY(burst.z);
    layers.air.push(r, burst.x, y, r.w * grow, r.h * grow, .5, r.anchor * grow, { ...tintOf(r), a: 1 - Math.max(0, p - .6) * 2 });
  }
  function drawTracer(tracer) {
    drawPose(tracer);
    const p = (clock - tracer.at) / TRACER_SECONDS;
    if (p >= 1) return;
    const fromY = drawnY(tracer.z) + 1.1, toY = drawnY(tracer.toZ) + 1;
    const dx = tracer.toX - tracer.x, dy = toY - fromY, length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx) - Math.PI / 2;
    layers.air.push(rect[WHITE], tracer.x, fromY, .12, length, .5, 0, { r: 1, g: .95, b: .7, angle, a: .9 * (1 - p) });
    const flash = rect['fx-musket-flash'];
    if (flash && p < .6) layers.air.push(flash, tracer.x + Math.sign(dx) * .5, fromY, flash.w, flash.h, .5, flash.h / 2, { a: 1 - p });
    else if (p < .5) layers.air.push(rect[WHITE], tracer.x + Math.sign(dx) * .5, fromY - .2, .5, .5, .5, 0, { r: 1, g: .9, b: .5, angle: .785, a: 1 - p * 2 });
  }
  // The musket pose: the captain-musket art at the shooter for a moment after a shot.
  function drawPose(tracer) {
    const p = (clock - tracer.at) / POSE_SECONDS, r = rect[pirateFrames.captain[p < .4 ? 1 : 0]];
    if (p >= 1) return;
    layers.air.push(r, tracer.x, drawnY(tracer.z), r.w, r.h, .5, r.anchor, { flip: tracer.toX < tracer.x });
  }
  function drawCaptain() {
    // The reload ring around your own captain: 12 brass dots fill up until the musket is ready again.
    if (!captain || captain.share >= 1) return;
    const cx = captain.x, cy = drawnY(captain.z);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 - Math.PI / 2, lit = i / 12 < captain.share;
      layers.air.push(rect[WHITE], cx + Math.cos(a) * .95, cy + .9 + Math.sin(a) * .95, .19, .19, .5, .09, lit ? { ...BRASS, a: 1 } : { ...DARK, a: .55 });
    }
  }
  function drawWarning(item) {
    const age = clock - item.at, blink = still() ? 1 : (Math.floor(age * 4) % 2 ? .4 : 1);
    const p = coastEdge(item), colourOf = item.boss ? RED : GOLD;
    layers.air.push(rect[WHITE], p.x, p.y, .7, .7, .5, .35, { ...colourOf, angle: .785, a: blink });
    layers.air.push(rect[WHITE], p.x, p.y, .4, .4, .5, .2, { ...DARK, angle: .785, a: blink * .8 });
  }
  // A warning sits a little inside the spawn point, so it is on screen before the ship.
  const coastEdge = item => ({ x: item.x * .78, y: drawnY(item.z * .78) + 1 });
  // A crew member: the art lane's figure (gunner, carpenter, lookout).
  function drawCrew(layer, kind, x, y, busy) {
    const r = rect[crewArt[kind]], bob = busy && !still() ? Math.abs(Math.sin(clock * 8)) * .08 : 0;
    layer.push(r, x, y + bob, r.w, r.h, .5, r.anchor);
  }
  // Level pips: 1 to 3 brass pips (fx-level-pip) above a tower or wall.
  function drawPips(layer, x, top, level) {
    const r = rect['fx-level-pip'];
    for (let i = 0; i < level; i++) layer.push(r, x + (i - (level - 1) / 2) * r.w * .7, top, r.w, r.h, .5, r.anchor);
  }

  function land(ball) {
    if (ball.enemy) {
      const x = ball.toX, y = drawnY(ball.toZ) + .6;
      if (ball.wallId) wallFlash.set(ball.wallId, clock + FLASH_SECONDS);
      spark(x, y, { count: 10, speed: [.6, 2.4], angle: Math.PI / 2, spread: 2.2, gravity: 5, life: [.4, .8], colour: ball.dust === 'wall' ? '#b8b2a0' : '#d8c590', size: [1, 2] });
      effects()?.bloom(x, y, { radius: .9, life: .25, colour: '#ffb35a' });
      return;
    }
    if (!ball.hit) splashes.add(item => Object.assign(item, { x: ball.toX, z: ball.toZ, at: clock, big: false }));
  }

  function draw() {
    for (const layer of Object.values(layers)) layer.begin();
    const state = latest;
    if (state && visible) {
      for (const wreck of wrecks.items) {
        const age = clock - wreck.at; if (age < 0) continue;
        const a = Math.min(1, age / .5) * Math.min(1, Math.max(0, (WRECK_SECONDS - age) / 2.5)), r = rect['pirate-wreck'];
        (wreck.z < 0 ? layers.far : layers.near).push(r, wreck.x, drawnY(wreck.z), r.w * (wreck.big ? 1.25 : 1), r.h * (wreck.big ? 1.25 : 1), .5, r.anchor, { flip: wreck.facing < 0, a: a * .9 });
      }
      for (const ship of state.ships) drawShip(ship, shipMeta(ship.id, ship.kind, ship.x));
      for (const sinker of sinkers.items) {
        const age = clock - sinker.at, p = Math.min(1, age / SINK_SECONDS), r = rect[(FRAMES[sinker.kind] ?? FRAMES.sloop)[0]];
        if (!r) continue;
        const tilt = still() ? 0 : sinker.facing * p * .35;
        (sinker.z < 0 ? layers.far : layers.near).push(r, sinker.x, drawnY(sinker.z) - p * r.h * .45, r.w, r.h, .5, r.anchor,
          { flip: sinker.facing < 0, angle: tilt, a: 1 - p * p, r: 1 - p * .4, g: 1 - p * .35, b: 1 - p * .25 });
      }
      for (const splash of splashes.items) {
        const p = (clock - splash.at) / SPLASH_SECONDS, frame = pirateFrames.splash[Math.min(2, Math.floor(p * 3))], r = rect[frame];
        const scale = splash.big ? 1.6 : 1;
        layers.air.push(r, splash.x, drawnY(splash.z), r.w * scale, r.h * scale, .5, r.anchor * scale);
      }
      for (const ball of balls.items) drawBall(ball);
      for (const shell of shells.items) drawShell(shell);
      for (const burst of bursts.items) drawBurst(burst);
      for (const tracer of tracers.items) drawTracer(tracer);
      for (const item of warnings.items) drawWarning(item);
      drawCaptain();
      // The lamps' beam: from the lighthouse lamp to an exposed flagship.
      const flagship = state.lampsLit && beamFrom ? state.ships.find(ship => ship.kind === 'flagship') : null;
      if (flagship) {
        const tx = flagship.x, ty = drawnY(flagship.z) + 3, dx = tx - beamFrom.x, dy = ty - beamFrom.y;
        const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx) - Math.PI / 2, pulse = still() ? .7 : .6 + Math.sin(clock * 9) * .15;
        layers.air.push(rect[WHITE], beamFrom.x, beamFrom.y, 1.1, length, .5, 0, { ...BEAM, angle, a: pulse * .45 });
        layers.air.push(rect[WHITE], beamFrom.x, beamFrom.y, .35, length, .5, 0, { r: 1, g: 1, b: .95, angle, a: pulse });
      }
    }
    for (const layer of Object.values(layers)) layer.end();
    const walls = new Map((state?.walls ?? []).map(wall => [wall.id, wall]));
    const towers = new Map((state?.towers ?? []).map(tower => [tower.id, tower]));
    const crew = state?.crew ?? {};
    for (const post of posts) {
      post.layer.begin();
      if (visible && post.kind === 'watchtower') {
        if (crew.lookout) drawCrew(post.layer, 'lookout', post.x + 1.4, drawnY(post.z) - .2, false);
      } else if (visible) {
        let id;
        const level = post.level, suffix = level > 1 ? `-l${level}` : '';
        let smoking = false;
        if (post.kind === 'wall') {
          const wall = walls.get(post.id), share = wall ? wall.hp / wall.maxHp : 1;
          id = share > .6 ? pirateLevels.wall[level - 1] : share > 0 ? pirateFrames.wall[1] : pirateFrames.wall[2];
          smoking = share <= .6;
        } else {
          // Each kind and level has its own art; firing shows the kind's firing frame (a mortar stays a mortar).
          const firing = (fire.get(post.id)?.until ?? -1) > clock, kind = post.kind === 'mortar' ? 'mortar' : 'cannon';
          id = firing ? pirateFrames[kind][1] : pirateLevels[kind][level - 1];
        }
        const r = rect[id], flashing = (wallFlash.get(post.id) ?? -1) > clock ? .7 : 0;
        const repairing = post.kind === 'wall' && (walls.get(post.id)?.repairing || walls.get(post.id)?.crew);
        const grow = 1, x = post.x, y = drawnY(post.z);
        post.layer.push(r, x, y, r.w, r.h, .5, r.anchor, { flip: post.kind !== 'wall' && post.flip, flashing,
          g: repairing && !still() ? 1 + Math.sin(clock * 10) * .15 : 1 });
        if (smoking) {
          const puff = rect[pirateFrames.smoke[(still() ? 0 : Math.floor(clock * 5)) % 3]];
          post.layer.push(puff, x, y + r.h - r.anchor, puff.w, puff.h, .5, puff.anchor, { a: .85 });
        }
        if (level > 1 || post.kind !== 'wall') drawPips(post.layer, x, y + (r.h - r.anchor) * grow + .2, level);
        if (post.kind === 'wall' && walls.get(post.id)?.crew) drawCrew(post.layer, 'carpenter', x + (x > 0 ? -1.3 : 1.3), y - .3, true);
        if (post.kind !== 'wall' && towers.get(post.id)?.manned) drawCrew(post.layer, 'gunner', x + (post.flip ? 1.2 : -1.2), y - .15, (fire.get(post.id)?.until ?? -1) > clock);
      }
      post.layer.end();
    }
    fog.visible = visible && !!state && state.fog > 0 && cannonsList.length > 0;
    if (state) { fogUniforms.uSight.value = state.sight; fogUniforms.uFog.value = state.fog; }
    fogUniforms.uTime.value = still() ? 0 : clock;
  }

  return {
    root,
    events(list) { for (const event of list ?? []) onEvent(event); },
    update({ state, simTime = simNow, dt = 0, captain: own = null } = {}) {
      if (disposed) return;
      clock += Math.max(0, Math.min(.1, dt || 0)); simNow = simTime; latest = state ?? latest; captain = own;
      shells.sweep(shell => simNow < shell.to);
      bursts.sweep(item => clock - item.at < BURST_SECONDS);
      tracers.sweep(item => clock - item.at < POSE_SECONDS);
      warnings.sweep(item => clock - item.at < 3.2);
      balls.sweep(ball => { if (simNow < ball.to) return true; land(ball); return false; });
      splashes.sweep(item => clock - item.at < SPLASH_SECONDS);
      sinkers.sweep(item => clock - item.at < SINK_SECONDS);
      wrecks.sweep(item => clock - item.at < WRECK_SECONDS);
      if (latest) { const alive = new Set(latest.ships.map(ship => ship.id)); for (const id of ships.keys()) if (!alive.has(id)) ships.delete(id); }
      draw();
    },
    setVisible(value) { visible = value !== false; root.visible = visible; },
    // For the pooling test and the perf panel: what the renderer holds right now.
    stats() {
      return { objects: root.children.length, owned: owned.length, ships: ships.size, balls: balls.size, splashes: splashes.size,
        sinkers: sinkers.size, wrecks: wrecks.size, shells: shells.size, bursts: bursts.size, tracers: tracers.size,
        instances: layers.far.count + layers.near.count + layers.air.count };
    },
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear();
      for (const item of owned) item.dispose();
      owned.length = 0; ships.clear(); fire.clear(); wallFlash.clear();
      for (const list of [sinkers, wrecks, balls, splashes, shells, bursts, tracers, warnings]) list.clear();
    },
  };
}
