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
// over damaged walls, fire on burning ships and the lookout's early warnings. Boarding (§12): boarders on
// foot walking (two frames) and hacking walls, with a hit flash, small hp pips and a puff when they fall,
// sorted with the island by their z in a few 2-unit bands; the captain's cutlass swing. Every sprite is the art
// lane's own (src/pixel/pirate-catalog.js); nothing is tinted or borrowed any more.
// Captain health (GAME-V3.md §3): a small hp bar over every captain in the wave (yours where you stand), a
// fallen captain lies in their lobby colour (captain-down-1…10, src/art/people.js) inside a pulsing red ring
// on the ground, and the ring fills with gold dots while you hold E to help them up.
import * as THREE from 'three';
import { FIRE_ART, TIER_ART, crewArt, fireArt, levelArt, pipRow, pirateDimensions, pirateFrames, pirateLevels } from '../pixel/pirate-catalog.js';
import { pixelGlsl, toScreen } from '../world/pixel-glsl.js';
import { CHARACTER_SCALE } from './character-scale.js';

const UNIT = 16, Y = .72;
// Characters on foot (boarders, the cutlass swing, the musket pose) are drawn larger in a wave, so they read
// at the zoomed-out battle camera (GAME-V3.md §7 polish; 1 is the atlas box): scene.userData.characterScale
// (game.js, from the camera's zoom: character-scale.js), else CHARACTER_SCALE.
export { CHARACTER_SCALE };
const WHITE = 'white';
export const ATLAS_IDS = [...pirateFrames.sloop, ...pirateFrames.brig, ...pirateFrames.flagship, ...pirateFrames.warship,
  ...pirateFrames.splash, ...pirateFrames.wall, ...pirateFrames.cannon, ...pirateFrames.mortar,
  ...pirateLevels.wall.slice(1), ...pirateLevels.cannon.slice(1), ...pirateLevels.mortar.slice(1), ...Object.values(crewArt),
  ...pirateFrames.captain, ...pirateFrames.smoke, ...pirateFrames.fire, ...pirateFrames.explosion, ...pirateFrames.boarder,
  'captain-cutlass', 'fx-musket-flash', 'fx-mortar-shell', 'fx-level-pip', 'pirate-cannonball', 'pirate-wreck'];
export const WARSHIP_FRAMES = pirateFrames.warship;
const EXPLOSION_FRAMES = pirateFrames.explosion;
const LAYER_ORDER = { far: 76, near: 124, air: 940, fog: 900 };
const CAPACITY = { far: 96, near: 96, air: 320 };
const SINK_SECONDS = 1.8, WRECK_SECONDS = 9, SPLASH_SECONDS = .5, FLASH_SECONDS = .12, FIRE_SECONDS = .22;
const BURST_SECONDS = .6, POSE_SECONDS = .6, POST_CAPACITY = 8;
// Boarders on land: one sprite layer per 2-unit band of z (renderOrder 100 + z like the island's art), so
// they pass in front of and behind walls, buildings and the player; a band is drawn only while it has one.
const BAND = 2, BAND_FROM = -26, BANDS = 26, BAND_CAPACITY = 96, STRIKE_SECONDS = .3, FALL_SECONDS = .5;
export const BOARDER_BANDS = BANDS;
export const bandOf = z => Math.max(0, Math.min(BANDS - 1, Math.floor((z - BAND_FROM) / BAND)));
// The musket (§10): the firing pose and its flash stay ~250 ms, a short tracer runs to the target, a puff on the hit.
export const MUSKET = Object.freeze({ fire: .25, tracerMin: .12, tracerLength: 1.6, puff: .4, muzzleX: 1.5, muzzleY: 1 });
const musketLife = item => Math.max(POSE_SECONDS, item.flight + MUSKET.puff);
// Each weapon's shot looks its own (TOWER-DEFENSE.md §15): the tracer's colour, width and streak length
// (in world units; the rifle draws the whole line at once), the muzzle flash's size and the hit puff's.
export const GUN_LOOKS = Object.freeze({
  musket: Object.freeze({ r: 1, g: .93, b: .62, width: .125, length: 1.6, flash: 1, puff: .75 }),
  pistols: Object.freeze({ r: 1, g: 1, b: .86, width: .08, length: .8, flash: .6, puff: .5 }),
  blunderbuss: Object.freeze({ r: 1, g: .62, b: .3, width: .11, length: .7, flash: 1.5, puff: .6 }),
  long_rifle: Object.freeze({ r: .78, g: .95, b: 1, width: .07, length: 60, flash: 1.2, puff: .9 }),
  fire_bombs: Object.freeze({ r: 1, g: .55, b: .2, width: .1, length: 1, flash: .7, puff: 1 }),
});
const lookOf = weapon => GUN_LOOKS[weapon] ?? GUN_LOOKS.musket;
// A damaged hull darkens (down to 62% at no hp left, a burning one a little more), so a ship under fire
// stays a strong, readable shape at the battle zoom instead of a pale one. Pure.
export function damageTint(base = {}, share = 1) {
  const left = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 1));
  const k = left >= .66 ? 1 : 1 - .38 * (1 - left / .66) - (left < 1 / 3 ? .06 : 0);
  return { r: (base.r ?? 1) * k, g: (base.g ?? 1) * k, b: (base.b ?? 1) * k };
}
const BOMB_BURST = { r: 1, g: .5, b: .2 };

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

// Frames the cartoon set adds to the atlas (the boarders, GAME-V3.md §3), drawn in src/art/people.js; they
// replace the pixel boarders (PIXEL_ONLY_IDS) in the cartoon atlas. drawBoarder() takes the cartoon frame
// when the atlas has it, else the pixel one (pixel packAtlas, tests).
export const DOWN_IDS = Array.from({ length: 10 }, (_, i) => `captain-down-${i + 1}`);
// The Barracks' militia (GAME-V3.md "Houses"), cartoon only: a pixel atlas (tests) simply does not draw them.
export const MILITIA_IDS = ['militia', 'militia-walk-1', 'militia-walk-2', 'militia-strike', 'militia-hit'];
export const CARTOON_EXTRA_IDS = ['boarder', 'boarder-walk-1', 'boarder-walk-2', 'boarder-hit', 'boarder-hack', ...DOWN_IDS, ...MILITIA_IDS];
export const PIXEL_ONLY_IDS = [...pirateFrames.boarder];
// Levels 4 and 5 of walls, cannons and mortars and their gold pips (GAME-V3.md §4.1): cartoon-only, so a pixel
// atlas (tests) draws a tier building with its level-3 art and plain pips.
export const TIER_IDS = [...Object.values(TIER_ART).flat(), 'fx-level-pip-gold'];
// The firing frames of levels 2 to 5 (FIRE_ART): cartoon-only like the tiers.
export const FIRE_LEVEL_IDS = Object.values(FIRE_ART).flatMap(list => list.slice(1));
/**
 * The frame of a cannon or mortar post: its level's art, or while it fires its level's firing frame (so a
 * level-3 cannon does not flick to level 1's plain barrel, nor a level-5 one lose its gold). has(id) says
 * whether the atlas holds a frame; without one (the pixel atlas) a tier falls back to level 3's art and a
 * shot to level 1's firing frame. Pure.
 */
export function towerFrame(kind, level, firing = false, has = () => true) {
  const k = kind === 'mortar' ? 'mortar' : 'cannon', n = Math.max(1, Math.min(5, Number.isInteger(level) ? level : 1));
  if (firing) { const id = fireArt(k, n); return has(id) ? id : pirateFrames[k][1]; }
  const id = levelArt(k, n);
  return has(id) ? id : pirateLevels[k][Math.min(3, n) - 1];
}
const BOARDER_ART = Object.freeze({ walk: ['boarder-walk-1', 'boarder-walk-2'], hack: ['boarder', 'boarder-hack'], hit: 'boarder-hit', still: 'boarder' });
/**
 * Paints every atlas sprite in the clean cartoon style (src/art/) into one smooth texture (browser
 * only; cached by the caller): linear filtering with mipmaps, premultiplied alpha, at the screen's
 * density within the atlas budget. rects, width and height stay in logical px (16 per world unit).
 */
export async function loadAtlas({ quality = 'high', colour = 0 } = {}) {
  const { cartoonAtlas, smoothTexture } = await import('../art/textures.js');
  const { setPoseColour } = await import('../art/people.js');
  setPoseColour(colour); // your captain's musket and cutlass poses in your lobby colour
  const ids = [...new Set([...ATLAS_IDS.filter(id => !PIXEL_ONLY_IDS.includes(id)), ...CARTOON_EXTRA_IDS, ...TIER_IDS, ...FIRE_LEVEL_IDS])];
  const atlas = await cartoonAtlas(ids, { quality, extra: [[WHITE, 8, 8]] });
  const white = atlas.rects[WHITE], context = atlas.image.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(white.x * atlas.density, white.y * atlas.density, white.w * atlas.density, white.h * atlas.density);
  return { texture: smoothTexture(atlas.image), width: atlas.image.width / atlas.density, height: atlas.image.height / atlas.density,
    rects: atlas.rects, density: atlas.density };
}

const spriteVertex = /* glsl */`
attribute vec4 iPos;attribute vec4 iSize;attribute vec4 iUv;attribute vec4 iTint;attribute float iFlash;
varying vec2 vUv;varying vec4 vTint;varying float vFlash;
void main(){
  vec2 corner=position.xy;
  vec2 local=vec2((corner.x-iSize.z)*iSize.x,corner.y*iSize.y-iSize.w);
  float c=cos(iPos.z),s=sin(iPos.z);
  local=vec2(local.x*c-local.y*s,local.x*s+local.y*c);
  vec2 origin=iPos.xy;
  vUv=mix(iUv.xy,iUv.zw,corner);vTint=iTint;vFlash=iFlash;
  gl_Position=projectionMatrix*viewMatrix*vec4(origin+local,0.0,1.0);
}`;
const spriteFragment = /* glsl */`
uniform sampler2D uMap;varying vec2 vUv;varying vec4 vTint;varying float vFlash;
void main(){
  vec4 t=texture2D(uMap,vUv);float a=t.a*vTint.a;
  if(a<.004)discard;
  // Premultiplied: the texel's colour already carries its alpha; the tint's alpha fades both.
  gl_FragColor=vec4(mix(t.rgb*vTint.rgb,vec3(1.0,.96,.82)*t.a,vFlash)*vTint.a,a);
  ${toScreen}
}`;
const fogVertex = /* glsl */`varying vec2 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xy;gl_Position=projectionMatrix*viewMatrix*w;}`;
const fogFragment = /* glsl */`
${pixelGlsl}
uniform vec2 uCannons[8];uniform float uCount,uSight,uFog,uTime;varying vec2 vWorld;
void main(){
  vec2 p=vWorld;vec2 logical=vec2(p.x,-p.y/.72);
  float d=1e4;
  for(int i=0;i<8;i++){if(float(i)>=uCount)break;d=min(d,length(logical-uCannons[i]));}
  float drift=pxNoise(vec2(p.x*.09+uTime*.05,p.y*.16))*.35;
  float edge=smoothstep(uSight-1.5,uSight+5.0,d+drift*3.0);
  float a=clamp(edge*(.32+.42*uFog)+drift*edge*.15,0.0,1.0);
  if(a<=.002)discard;
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
const BRASS = colour('#e0b04a'), TEAL = colour('#4fc3c9');
const SHIP_SIZE = Object.fromEntries(['sloop', 'brig', 'flagship'].map(kind => {
  const [w, h] = pirateDimensions[pirateFrames[kind][0]]; return [kind, { w: w / UNIT, h: h / UNIT }];
}));
{ const [w, h] = pirateDimensions[pirateFrames.warship[0]]; SHIP_SIZE.warship = { w: w / UNIT, h: h / UNIT }; }
const FRAMES = pirateFrames;
// The campaign's pirate types (docs/GAME-V3.md §4, src/pirates/sim.js CONFIG.tiers): each sails as one of the
// fleet's drawings with its own colour and size, so a new tier reads at a glance. Pure data.
export const SHIP_VARIANTS = Object.freeze({
  raider: Object.freeze({ frames: 'sloop', tint: Object.freeze({ r: 1, g: .52, b: .46 }), scale: .9 }),
  ironclad: Object.freeze({ frames: 'brig', tint: Object.freeze({ r: .6, g: .67, b: .8 }), scale: 1.1 }),
  dreadnought: Object.freeze({ frames: 'warship', tint: Object.freeze({ r: .56, g: .5, b: .62 }), scale: 1.25 }),
  redtide: Object.freeze({ frames: 'warship', tint: Object.freeze({ r: 1, g: .42, b: .4 }), scale: 1.5 }),
});
export const BRUTE_LOOK = Object.freeze({ tint: Object.freeze({ r: 1, g: .7, b: .58 }), scale: 1.3 });

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
    // A hair in from every edge so neighbours never bleed in.
    rect[id] = { u0: (r.x + .01) / atlas.width, u1: (r.x + r.w - .01) / atlas.width,
      v0: 1 - (r.y + r.h - .01) / atlas.height, v1: 1 - (r.y + .01) / atlas.height, w: r.w / UNIT, h: r.h / UNIT, anchor: r.anchor / UNIT };
  }
  const tintOf = r => (r?.tint ? { r: r.tint.r, g: r.tint.g, b: r.tint.b } : {});
  const K = () => { const k = Number(scene?.userData?.characterScale); return Number.isFinite(k) && k >= 1 && k <= 3 ? k : CHARACTER_SCALE; };
  const material = new THREE.ShaderMaterial({ vertexShader: spriteVertex, fragmentShader: spriteFragment,
    uniforms: { uMap: { value: atlas.texture } }, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false });
  owned.push(material);
  const layers = {
    far: createLayer('far-sea', CAPACITY.far, material, LAYER_ORDER.far, owned),
    near: createLayer('near-sea', CAPACITY.near, material, LAYER_ORDER.near, owned),
    air: createLayer('air', CAPACITY.air, material, LAYER_ORDER.air, owned),
  };
  for (const layer of Object.values(layers)) root.add(layer.mesh);
  const bands = Array.from({ length: BANDS }, (_, i) => {
    const layer = createLayer(`boarders:${i}`, BAND_CAPACITY, material, 100 + BAND_FROM + i * BAND + BAND * .5, owned); root.add(layer.mesh); return layer;
  });
  // A one-layer post per wall, cannon and mortar (the sprite, its level pips and its crew figure); the
  // watchtower gets one only for the lookout.
  const hasPost = item => item.kind === 'wall' || item.kind === 'cannon' || item.kind === 'mortar' || item.kind === 'watchtower';
  const levelOf = item => (Number.isInteger(item.level) ? Math.max(1, Math.min(5, item.level)) : 1);
  // A level's art, or level 3's when the atlas has no tier frame (the pixel atlas).
  const levelFrame = (kind, level) => { const id = levelArt(kind, level); return rect[id] ? id : pirateLevels[kind][Math.min(3, level) - 1]; };
  const makePost = item => {
    const layer = createLayer(`defense:${item.id}`, POST_CAPACITY, material, 100 + item.z, owned); root.add(layer.mesh);
    return { ...item, level: levelOf(item), layer, flip: false };
  };
  const posts = defenses.filter(hasPost).map(makePost);
  let cannonsList = defenses.filter(item => item.kind === 'cannon' || item.kind === 'mortar');
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
  const fallen = pool(), strikes = pool(), crew = new Map(); // boarders: id -> {phase, flashUntil}
  const guards = new Map(); // the Barracks' militia: id -> {phase, flashUntil, strikeUntil, facing}
  let captain = null, revive = null, figures = null;
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
        if (event.boarderId) {
          // A boarder's blow: dust off the wall, or a red flash at the heart.
          if (event.type === 'wall_damaged') {
            wallFlash.set(event.wallId, clock + FLASH_SECONDS);
            spark(x, y + .7, { count: 6, speed: [.5, 1.8], angle: Math.PI / 2, spread: 2, gravity: 5, life: [.3, .6], colour: '#b8b2a0', size: [1, 2] });
          } else effects()?.bloom(x, y + .8, { radius: 2, life: .45, colour: '#d8553f' });
          break;
        }
        const ship = latest?.ships?.find(item => item.id === event.shipId);
        const targetX = event.type === 'wall_damaged' ? event.x : event.x * .86, targetZ = event.type === 'wall_damaged' ? event.z : event.z * .86;
        if (ship) balls.add(item => Object.assign(item, { x: ship.x, z: ship.z, toX: targetX, toZ: targetZ, from: simNow, to: simNow + .45,
          hit: true, enemy: true, splashed: false, dust: event.type === 'wall_damaged' ? 'wall' : 'shore', wallId: event.wallId }));
        else if (event.type === 'wall_damaged') wallFlash.set(event.wallId, clock + FLASH_SECONDS);
        break;
      }
      case 'wall_repaired': effects()?.bloom(x, y + 1, { radius: 1.4, life: .6, colour: '#bfe6a8' }); break;
      case 'mortar_fired': {
        shells.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt, bomb: false, radius: event.radius ?? 4 }));
        fire.set(event.towerId, { until: clock + FIRE_SECONDS * 1.6, flip: event.toX < event.x });
        const post = posts.find(item => item.id === event.towerId); if (post) post.flip = event.toX < event.x;
        effects()?.bloom(event.x, y + 1.2, { radius: 1.4, life: .45, colour: '#ffcf6a' });
        spark(event.x, y + 1.3, { count: 14, speed: [.4, 1.4], angle: Math.PI / 2, spread: 1.2, gravity: -1, life: [.7, 1.3], colour: '#cfcabb', size: [1, 3] });
        break;
      }
      case 'mortar_impact': {
        // The area burst: a ring as wide as the blast radius, a flash, debris, and a splash in the sea.
        bursts.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, radius: event.radius ?? 4, fire: false }));
        effects()?.ring(x, y, { radius: event.radius ?? 4, life: .55, colour: '#ffcf6a' });
        effects()?.bloom(x, y + .6, { radius: 2.6, life: .5, colour: '#ff9a4a' });
        spark(x, y + .5, { count: 30, speed: [1.5, 5], angle: Math.PI / 2, spread: 2.6, gravity: 7, life: [.5, 1.1], colour: '#ffb35a', size: [1, 2] });
        splashes.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, big: true }));
        break;
      }
      case 'captain_fired': {
        const weapon = GUN_LOOKS[event.weapon] ? event.weapon : 'musket', look = lookOf(weapon);
        const flightTo = impactAt => Math.max(MUSKET.tracerMin, Number.isFinite(impactAt) && Number.isFinite(event.t) ? impactAt - event.t : 0);
        const dir = event.toX < event.x ? -1 : 1;
        if (weapon === 'fire_bombs') {
          // A bomb on a low arc, then its burst (captain_blast); the pose throws it.
          shells.add(item => Object.assign(item, { x: event.x + dir * .6, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt, bomb: true, radius: event.radius ?? 3 }));
          tracers.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, at: clock, flight: 0, weapon, pose: true, line: false }));
          effects()?.bloom(event.x + dir * MUSKET.muzzleX, y + MUSKET.muzzleY, { radius: .6, life: MUSKET.fire, colour: '#ffb35a' });
          break;
        }
        // One streak per ship hit (the blunderbuss sprays up to three, the rifle goes through to a second).
        let shots = Array.isArray(event.targets) && event.targets.length ? event.targets.map(item => ({ toX: item.toX, toZ: item.toZ, impactAt: item.impactAt })) : [];
        if (!shots.length && weapon === 'blunderbuss' && Number.isFinite(event.heading)) {
          // A spray at nothing: three streaks fanned over the cone.
          const reach = Math.hypot(event.toX - event.x, event.toZ - event.z), half = (event.cone ?? 50) / 2 * Math.PI / 180;
          shots = [-1, 0, 1].map(k => ({ toX: event.x + Math.cos(event.heading + k * half * .8) * reach, toZ: event.z + Math.sin(event.heading + k * half * .8) * reach, impactAt: event.impactAt }));
        }
        if (!shots.length) shots = [{ toX: event.toX, toZ: event.toZ, impactAt: event.impactAt }];
        if (weapon === 'long_rifle' && shots.length > 1) shots = [shots[shots.length - 1]]; // one line through both ships
        shots.forEach((shot, index) => tracers.add(item => Object.assign(item, { x: event.x, z: event.z, toX: shot.toX, toZ: shot.toZ, at: clock,
          flight: flightTo(shot.impactAt), weapon, pose: index === 0, line: true })));
        effects()?.bloom(event.x + dir * MUSKET.muzzleX, y + MUSKET.muzzleY, { radius: .8 * look.flash, life: MUSKET.fire, colour: weapon === 'long_rifle' ? '#e6f6ff' : '#fff0b0' });
        if (weapon === 'blunderbuss' && !low() && !still()) {
          // The cone puff: grey smoke rolling out of the wide muzzle.
          const heading = Number.isFinite(event.heading) ? event.heading : Math.atan2(event.toZ - event.z, event.toX - event.x);
          const angle = Math.atan2(-Math.sin(heading) * Y, Math.cos(heading)); // the cone's direction on screen
          spark(event.x + dir * MUSKET.muzzleX, y + MUSKET.muzzleY, { count: 18, speed: [1.2, 3.2], angle, spread: (event.cone ?? 50) * Math.PI / 180,
            gravity: -.6, life: [.4, .8], colour: '#d9d6c8', size: [1, 3] });
        }
        break;
      }
      case 'captain_blast': {
        // A fire bomb bursts: explosion art with flames, an orange ring as wide as the blast.
        bursts.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, radius: event.radius ?? 3, fire: true }));
        effects()?.ring(x, y, { radius: event.radius ?? 3, life: .55, colour: '#ff8a3a' });
        effects()?.bloom(x, y + .5, { radius: 2.2, life: .5, colour: '#ff7a2a' });
        spark(x, y + .4, { count: 26, speed: [1.2, 4.2], angle: Math.PI / 2, spread: 2.6, gravity: 5, life: [.5, 1.1], colour: '#ff9a3a', size: [1, 2] });
        break;
      }
      case 'ship_warning': warnings.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, boss: event.boss })); break;
      case 'boarder_landed': splashes.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, big: false })); break;
      case 'boarder_hit': {
        boarderMeta(event.boarderId).flashUntil = clock + FLASH_SECONDS;
        spark(x, y + .7, { count: event.blade ? 10 : 6, speed: [.8, 2.6], angle: Math.PI / 2, spread: 2.4, gravity: 7, life: [.3, .6], colour: event.blade ? '#e8eee8' : '#b0402f', size: [1, 2] });
        break;
      }
      case 'boarder_killed': {
        fallen.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, facing: crew.get(event.boarderId)?.facing ?? 1 }));
        crew.delete(event.boarderId);
        effects()?.bloom(x, y + .6, { radius: .7, life: .3, colour: '#ffcf6a' });
        break;
      }
      case 'captain_struck': {
        const dir = event.toX < event.x ? -1 : 1;
        strikes.add(item => Object.assign(item, { x: event.x, z: event.z, dir, at: clock }));
        effects()?.ring(event.x + dir * 1.4, y + .9, { radius: .9, life: .25, colour: '#e8eee8' });
        break;
      }
      // The house roles (GAME-V3.md "Houses"): a militia's spear thrust, a militia hurt or down, a Tavern's healing.
      case 'militia_struck': militiaMeta(event.militiaId).strikeUntil = clock + STRIKE_SECONDS; break;
      case 'militia_hit': militiaMeta(event.militiaId).flashUntil = clock + FLASH_SECONDS; break;
      case 'militia_fell': {
        fallen.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, facing: guards.get(event.militiaId)?.facing ?? 1, militia: true }));
        guards.delete(event.militiaId);
        break;
      }
      case 'captain_healed': {
        effects()?.bloom(x, y + 1.2, { radius: .8, life: .45, colour: '#9fe08a' });
        spark(x, y + 1.6, { count: 4, speed: [.4, 1], angle: Math.PI / 2, spread: .8, gravity: -1.5, life: [.5, .9], colour: '#b8f0a0', size: [1, 2] });
        break;
      }
      case 'wall_rebuilt': {
        effects()?.bloom(x, y + 1, { radius: 1.8, life: .7, colour: '#bfe6a8' });
        spark(x, y + .8, { count: 14, speed: [.6, 2], angle: Math.PI / 2, spread: 2, gravity: 5, life: [.4, .8], colour: '#b8b2a0', size: [1, 2] });
        break;
      }
      default: break;
    }
  }

  function drawShip(ship, meta) {
    const variant = SHIP_VARIANTS[ship.kind] ?? null, kind = variant?.frames ?? ship.kind, k = variant?.scale ?? 1;
    const base = SHIP_SIZE[kind] ?? SHIP_SIZE.sloop, size = { w: base.w * k, h: base.h * k }, frame = frameOf(kind, meta.phase), drawn = rect[frame];
    if (!drawn) return;
    const r = k === 1 ? drawn : { ...drawn, w: drawn.w * k, h: drawn.h * k, anchor: drawn.anchor * k };
    const layer = ship.z < 0 ? layers.far : layers.near, x = ship.x, y = drawnY(ship.z);
    // A hit shows as a short warm flash, kept light so a ship under steady fire never turns white.
    const fadeIn = Math.min(1, (clock - meta.bornAt) / .6), flashing = clock < meta.flashUntil ? (ship.boss ? .2 : .3) : 0;
    const share = ship.maxHp > 0 ? Math.max(0, Math.min(1, ship.hp / ship.maxHp)) : 1, burning = ship.hp > 0 && share < 1 / 3;
    // A wake behind a sailing ship: two pale strokes on the water.
    if (ship.state === 'sailing' && !low() && !still()) {
      const back = -meta.facing * size.w * .45, wob = Math.floor(clock * 6 + meta.phase) % 2;
      layer.push(rect[WHITE], x + back, y - .05, size.w * .28, .06, .5, 0, { a: .45 * fadeIn });
      layer.push(rect[WHITE], x + back * 1.35 - wob * .1, y + .08, size.w * .18, .06, .5, 0, { a: .3 * fadeIn });
    }
    layer.push(drawn, x, y, r.w, r.h, .5, r.anchor, { flip: meta.facing < 0, a: fadeIn, flashing, ...damageTint(variant?.tint ?? tintOf(drawn), share) });
    // A burning ship below a third of its hull: dark smoke rising and the fire on deck, drawn over the hull
    // and big enough to read at the battle zoom (bigger ships burn in two places).
    if (burning) {
      const step = still() ? 0 : Math.floor(clock * 8 + meta.phase), big = size.w > 5;
      const spots = big ? [-.16, .14] : [.12];
      spots.forEach((at, i) => {
        const fx = x + meta.facing * size.w * at, fy = y + size.h * (i ? .42 : .34);
        const smoke = rect[pirateFrames.smoke[(step + i) % 3]];
        if (smoke && !low()) layers.air.push(smoke, fx - meta.facing * .3, fy + 1.1 + (still() ? 0 : (clock * .8 + i * .5) % 1 * .6), smoke.w * 1.1, smoke.h * 1.1, .5, smoke.anchor * 1.1, { r: .32, g: .28, b: .3, a: .55 * fadeIn });
        const flame = rect[pirateFrames.fire[(step + i) % 3]];
        if (flame) layers.air.push(flame, fx, fy, flame.w * 1.35, flame.h * 1.35, .5, flame.anchor * 1.35, { a: fadeIn });
      });
    }
    if (ship.hp < ship.maxHp || ship.boss) {
      const top = y + size.h - r.anchor + .15, w = Math.min(2.4, size.w * .5), share = Math.max(0, ship.hp / ship.maxHp);
      const tint = ship.kind === 'flagship' && !ship.exposed ? { r: .75, g: .78, b: .8 } : ship.boss ? RED : share > .5 ? GREEN : share > .25 ? GOLD : RED;
      layers.air.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .3125, 0, 0, { ...DARK, a: .8 });
      layers.air.push(rect[WHITE], x - w / 2, top, w * share, .1875, 0, 0, { ...tint, a: 1 });
    }
  }

  function boarderMeta(id) {
    let meta = crew.get(id);
    if (!meta) {
      let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
      meta = { phase: (hash >>> 0) % 991 / 991 * 2, flashUntil: -1, facing: 1 };
      crew.set(id, meta);
    }
    return meta;
  }
  // A boarder: walking (frames 1-2), hacking (frames 1-3, the cutlass coming down), a hit flash, hp pips.
  function drawBoarder(boarder) {
    const meta = boarderMeta(boarder.id), layer = bands[bandOf(boarder.z)], x = boarder.x, y = drawnY(boarder.z);
    meta.facing = boarder.facing ?? meta.facing;
    const frames = FRAMES.boarder, hacking = boarder.state === 'hacking' || boarder.state === 'fighting', hit = clock < meta.flashUntil;
    const step = still() ? 0 : Math.floor(clock * (hacking ? 3 : 5) + meta.phase) % 2;
    const cartoon = hit ? BOARDER_ART.hit : hacking ? BOARDER_ART.hack[step] : still() ? BOARDER_ART.still : BOARDER_ART.walk[step];
    const r = rect[cartoon] ?? rect[hacking ? (step ? frames[2] : frames[0]) : frames[step]];
    if (!r) return;
    // A brute (wave 20+) is bigger and redder than the rest of the crowd.
    const big = boarder.brute ? BRUTE_LOOK.scale : 1, look = boarder.brute ? BRUTE_LOOK.tint : {};
    layer.push(r, x, y, r.w * K() * big, r.h * K() * big, .5, r.anchor * K() * big, { flip: meta.facing < 0, flashing: hit ? (rect[cartoon] ? .35 : .7) : 0, ...look });
    if (boarder.hp < boarder.maxHp) {
      const top = y + (r.h - r.anchor) * K() - .35, w = .9, share = Math.max(0, boarder.hp / boarder.maxHp);
      layer.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .25, 0, 0, { ...DARK, a: .8 });
      layer.push(rect[WHITE], x - w / 2, top, w * share, .125, 0, 0, { ...(share > .5 ? GOLD : RED), a: 1 });
    }
  }
  function militiaMeta(id) {
    let meta = guards.get(id);
    if (!meta) {
      let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
      meta = { phase: (hash >>> 0) % 983 / 983 * 2, flashUntil: -1, strikeUntil: -1, facing: 1 };
      guards.set(id, meta);
    }
    return meta;
  }
  // A Barracks militia (GAME-V3.md "Houses"): walking (two frames), the spear thrust, a hit flash, a teal hp bar.
  function drawMilitia(unit) {
    const meta = militiaMeta(unit.id), layer = bands[bandOf(unit.z)], x = unit.x, y = drawnY(unit.z);
    meta.facing = unit.facing ?? meta.facing;
    const hit = clock < meta.flashUntil, striking = clock < meta.strikeUntil, step = still() ? 0 : Math.floor(clock * 5 + meta.phase) % 2;
    const id = hit ? 'militia-hit' : striking ? 'militia-strike' : unit.state === 'walking' && !still() ? MILITIA_IDS[1 + step] : 'militia';
    const r = rect[id];
    if (!r) return;
    layer.push(r, x, y, r.w * K(), r.h * K(), .5, r.anchor * K(), { flip: meta.facing < 0, flashing: hit ? .35 : 0 });
    if (unit.hp < unit.maxHp) {
      const top = y + (r.h - r.anchor) * K() - .35, w = .9, share = Math.max(0, unit.hp / unit.maxHp);
      layer.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .25, 0, 0, { ...DARK, a: .8 });
      layer.push(rect[WHITE], x - w / 2, top, w * share, .125, 0, 0, { ...(share > .5 ? TEAL : share > .25 ? GOLD : RED), a: 1 });
    }
  }
  // A fallen boarder (or militia): the sprite sinks and fades under a puff of smoke.
  function drawFallen(item) {
    const p = Math.min(1, (clock - item.at) / FALL_SECONDS), layer = bands[bandOf(item.z)], y = drawnY(item.z);
    const r = (item.militia ? rect['militia-hit'] : null) ?? rect[BOARDER_ART.hit] ?? rect[FRAMES.boarder[0]], k = K();
    if (r) layer.push(r, item.x, y, r.w * k, r.h * k * (1 - p * .5), .5, r.anchor * k, { flip: item.facing < 0, a: 1 - p, flashing: .5 * (1 - p) });
    const puff = rect[pirateFrames.smoke[still() ? 0 : Math.min(2, Math.floor(p * 3))]];
    if (puff) layer.push(puff, item.x, y - .1, puff.w * .6, puff.h * .6, .5, puff.anchor * .6, { a: 1 - p * p });
  }
  function drawStrike(item) {
    const r = rect['captain-cutlass'], k = K();
    if (r) bands[bandOf(item.z)].push(r, item.x, drawnY(item.z), r.w * k, r.h * k, .5, r.anchor * k, { flip: item.dir < 0 });
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
    if (shell.bomb) { drawBomb(shell, p, x, z, distance); return; }
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
  // A fire bomb: a small dark ball on a low arc with a flickering flame and sparks, its landing ring in orange.
  function drawBomb(shell, p, x, z, distance) {
    const lift = still() ? 1 : 1 + (2 + distance * .12) * 4 * p * (1 - p), ball = rect['pirate-cannonball'];
    const flame = rect[pirateFrames.fire[(still() ? 0 : Math.floor(clock * 10)) % 3]];
    if (ball) layers.air.push(ball, x, drawnY(z) + lift, ball.w * .8, ball.h * .8, .5, .55 * ball.h * .8, { r: .5, g: .35, b: .3 });
    if (flame) layers.air.push(flame, x, drawnY(z) + lift + .25, flame.w * .45, flame.h * .45, .5, flame.anchor * .45, { a: .95 });
    if (!still()) layers.air.push(rect[WHITE], x, drawnY(z) - .05, .35 * (.6 + p * .6), .12, .5, 0, { ...DARK, a: .3 + p * .2 });
    if (p > .25) layers.air.push(rect[WHITE], shell.toX, drawnY(shell.toZ), (shell.radius ?? 3) * 2 * p, .1, .5, 0, { ...BOMB_BURST, a: .45 * p });
  }
  function drawBurst(burst) {
    const p = (clock - burst.at) / BURST_SECONDS, frame = EXPLOSION_FRAMES[Math.min(3, Math.floor(p * 4))], r = rect[frame];
    if (!r) return;
    const grow = 1.2, y = drawnY(burst.z);
    layers.air.push(r, burst.x, y, r.w * grow, r.h * grow, .5, r.anchor * grow, { ...tintOf(r), a: 1 - Math.max(0, p - .6) * 2 });
    if (!burst.fire) return;
    // A fire bomb's flames: three tongues of the fire art around the blast, fading out.
    for (let i = 0; i < 3; i++) {
      const flame = rect[pirateFrames.fire[(i + (still() ? 0 : Math.floor(clock * 8))) % 3]];
      if (!flame) continue;
      const a = i / 3 * Math.PI * 2 + .5, spread = burst.radius * .45;
      layers.air.push(flame, burst.x + Math.cos(a) * spread, y + Math.sin(a) * spread * Y, flame.w * .7, flame.h * .7, .5, flame.anchor * .7, { a: 1 - p });
    }
  }
  // The shot: the firing pose with its flash, a short tracer from the muzzle to the ship, a puff on the hit.
  function drawTracer(tracer) {
    if (tracer.pose !== false) drawPose(tracer);
    if (tracer.line === false) return;
    const look = lookOf(tracer.weapon);
    const age = clock - tracer.at, dir = tracer.toX < tracer.x ? -1 : 1;
    const mx = tracer.x + dir * MUSKET.muzzleX, my = drawnY(tracer.z) + MUSKET.muzzleY;
    const tx = tracer.toX, ty = drawnY(tracer.toZ) + .7, dx = tx - mx, dy = ty - my, length = Math.hypot(dx, dy) || 1;
    const flash = rect['fx-musket-flash'];
    if (flash && age < MUSKET.fire && tracer.pose !== false) {
      layers.air.push(flash, mx + dir * .3, my, flash.w * look.flash, flash.h * look.flash, .5, flash.h * look.flash / 2, { flip: dir < 0, a: age < MUSKET.fire * .6 ? 1 : .6 });
    }
    const angle = Math.atan2(dy, dx) - Math.PI / 2;
    if (tracer.weapon === 'long_rifle' && age < tracer.flight + .18) {
      // The rifle: one thin, pale line from the muzzle through both ships, fading fast.
      const fade = Math.max(0, 1 - Math.max(0, age - tracer.flight) / .18);
      layers.air.push(rect[WHITE], mx, my, look.width * 2.6, length, .5, 0, { r: look.r, g: look.g, b: look.b, angle, a: .25 * fade });
      layers.air.push(rect[WHITE], mx, my, look.width, length, .5, 0, { r: look.r, g: look.g, b: look.b, angle, a: .95 * fade });
    } else if (age < tracer.flight) {
      // Reduced motion: the whole line for a moment instead of a moving streak.
      const p = still() ? 1 : age / tracer.flight, head = Math.min(1, p), tail = still() ? 0 : Math.max(0, head - look.length / length);
      const x0 = mx + dx * tail, y0 = my + dy * tail, span = (head - tail) * length;
      if (span > .05) layers.air.push(rect[WHITE], x0, y0, look.width, span, .5, 0, { r: look.r, g: look.g, b: look.b, angle, a: .95 });
    }
    if (age >= tracer.flight && age < tracer.flight + MUSKET.puff) {
      const p = (age - tracer.flight) / MUSKET.puff, puff = rect[pirateFrames.smoke[still() ? 0 : Math.min(2, Math.floor(p * 3))]];
      if (puff) layers.air.push(puff, tx, ty - .3, puff.w * look.puff, puff.h * look.puff, .5, puff.anchor * look.puff, { a: 1 - p * p });
    }
  }
  // The musket pose: the captain-musket art at the shooter, firing (frame 2) for MUSKET.fire, then aiming.
  function drawPose(tracer) {
    const age = clock - tracer.at;
    if (age >= POSE_SECONDS) return;
    const r = rect[pirateFrames.captain[age < MUSKET.fire ? 1 : 0]], k = K();
    layers.air.push(r, tracer.x, drawnY(tracer.z), r.w * k, r.h * k, .5, r.anchor * k, { flip: tracer.toX < tracer.x });
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
  // Captain health: a captain's hp bar (over the head, drawn units above where they stand), a fallen
  // captain in their colour with the red ring, and your revive's gold dots filling around them.
  function drawHealthBar(x, z, hp, maxHp) {
    const share = Math.max(0, Math.min(1, hp / (maxHp || 1))), w = 1.3, top = drawnY(z) + 2.05 * K();
    layers.air.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .3125, 0, 0, { ...DARK, a: .8 });
    layers.air.push(rect[WHITE], x - w / 2, top, w * share, .1875, 0, 0, { ...(share > .5 ? GREEN : share > .25 ? GOLD : RED), a: 1 });
  }
  function drawDown(hero, x, z, reviving) {
    const y = drawnY(z), pulse = still() ? .8 : .55 + .35 * Math.abs(Math.sin(clock * 3)), k = K();
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2 - Math.PI / 2, lit = reviving !== null && i / 20 < reviving;
      const dx = x + Math.cos(a) * 1.9 * k, dy = y + .15 + Math.sin(a) * .8 * k;
      layers.air.push(rect[WHITE], dx, dy, .44, .44, .5, .22, { ...DARK, a: .55 });
      layers.air.push(rect[WHITE], dx, dy, .3, .3, .5, .15, lit ? { ...BRASS, a: 1 } : { ...RED, a: pulse });
    }
    const r = rect[DOWN_IDS[Math.max(0, Math.min(9, hero.colour ?? 0))]];
    if (r) bands[bandOf(z)].push(r, x, y, r.w * k, r.h * k, .5, r.anchor * k);
  }
  function drawParty(state) {
    for (const hero of state.party ?? []) {
      if (!hero.present) continue;
      const mine = captain && hero.id === captain.id, x = mine ? captain.x : hero.x, z = mine ? captain.z : hero.z;
      if (hero.down) { drawDown(hero, x, z, revive?.targetId === hero.id ? revive.share : null); continue; }
      // A teammate's bar sits over their presence figure when it is drawn (src/pirates/figures.js).
      const figure = mine ? null : figures?.get?.(hero.id);
      drawHealthBar(figure ? figure.x : x, figure ? figure.z : z, hero.hp, hero.maxHp);
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
  // Level pips (pipRow): 1 to 3 brass pips (fx-level-pip) above a tower or wall; 4 and 5 smaller gold stars on
  // teal (fx-level-pip-gold), spaced so they never overlap. The pixel atlas has no gold pip: plain ones, as small.
  function drawPips(layer, x, top, level) {
    const row = pipRow(level), r = rect[row.art] ?? rect['fx-level-pip'], w = r.w * row.scale, h = r.h * row.scale;
    for (const offset of row.offsets) layer.push(r, x + offset * r.w, top, w, h, .5, r.anchor * row.scale);
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
    for (const layer of bands) layer.begin();
    const state = latest;
    if (state && visible) {
      for (const wreck of wrecks.items) {
        const age = clock - wreck.at; if (age < 0) continue;
        const a = Math.min(1, age / .5) * Math.min(1, Math.max(0, (WRECK_SECONDS - age) / 2.5)), r = rect['pirate-wreck'];
        (wreck.z < 0 ? layers.far : layers.near).push(r, wreck.x, drawnY(wreck.z), r.w * (wreck.big ? 1.25 : 1), r.h * (wreck.big ? 1.25 : 1), .5, r.anchor, { flip: wreck.facing < 0, a: a * .9 });
      }
      for (const ship of state.ships) drawShip(ship, shipMeta(ship.id, ship.kind, ship.x));
      for (const boarder of state.boarders ?? []) drawBoarder(boarder);
      for (const unit of state.militia ?? []) drawMilitia(unit);
      for (const item of fallen.items) drawFallen(item);
      for (const item of strikes.items) drawStrike(item);
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
      drawParty(state);
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
    for (const layer of bands) layer.end();
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
          id = share > .6 ? levelFrame('wall', level) : share > 0 ? pirateFrames.wall[1] : pirateFrames.wall[2];
          smoking = share <= .6;
        } else {
          // Each kind and level has its own art; firing shows that level's firing frame (a mortar stays a mortar).
          id = towerFrame(post.kind, level, (fire.get(post.id)?.until ?? -1) > clock, frame => !!rect[frame]);
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
    update({ state, simTime = simNow, dt = 0, captain: own = null, revive: helping = null, figures: drawnAt = null } = {}) {
      if (disposed) return;
      clock += Math.max(0, Math.min(.1, dt || 0)); simNow = simTime; latest = state ?? latest; captain = own; revive = helping;
      figures = drawnAt instanceof Map ? drawnAt : null;
      shells.sweep(shell => simNow < shell.to);
      bursts.sweep(item => clock - item.at < BURST_SECONDS);
      tracers.sweep(item => clock - item.at < musketLife(item));
      warnings.sweep(item => clock - item.at < 3.2);
      fallen.sweep(item => clock - item.at < FALL_SECONDS);
      strikes.sweep(item => clock - item.at < STRIKE_SECONDS);
      balls.sweep(ball => { if (simNow < ball.to) return true; land(ball); return false; });
      splashes.sweep(item => clock - item.at < SPLASH_SECONDS);
      sinkers.sweep(item => clock - item.at < SINK_SECONDS);
      wrecks.sweep(item => clock - item.at < WRECK_SECONDS);
      if (latest) { const alive = new Set(latest.ships.map(ship => ship.id)); for (const id of ships.keys()) if (!alive.has(id)) ships.delete(id); }
      if (latest?.boarders) { const alive = new Set(latest.boarders.map(item => item.id)); for (const id of crew.keys()) if (!alive.has(id)) crew.delete(id); }
      draw();
    },
    setVisible(value) { visible = value !== false; root.visible = visible; },
    // The island changed while this wave's posts stand (an upgrade or a new building in the break, or a
    // friend's): every post takes its new level, and a spot built since gets its post. The sim is not
    // touched; it fights with the defenses it started with.
    setDefenses(list) {
      if (disposed) return;
      for (const item of list ?? []) {
        if (!hasPost(item)) continue;
        const post = posts.find(entry => entry.id === item.id);
        if (post) { post.level = levelOf(item); if (item.kind === post.kind) continue; Object.assign(post, {kind: item.kind}); }
        else posts.push(makePost(item));
      }
      cannonsList = (list ?? []).filter(item => item.kind === 'cannon' || item.kind === 'mortar');
      fogUniforms.uCannons.value.forEach((vector, i) => vector.set(cannonsList[i]?.x ?? 0, cannonsList[i]?.z ?? 0));
      fogUniforms.uCount.value = Math.min(8, cannonsList.length);
    },
    // Each post's level, for checks.
    levels() { return Object.fromEntries(posts.map(post => [post.id, post.level])); },
    // For the pooling test and the perf panel: what the renderer holds right now.
    stats() {
      return { objects: root.children.length, owned: owned.length, ships: ships.size, balls: balls.size, splashes: splashes.size,
        sinkers: sinkers.size, wrecks: wrecks.size, shells: shells.size, bursts: bursts.size, tracers: tracers.size,
        boarders: crew.size, fallen: fallen.size, strikes: strikes.size,
        instances: layers.far.count + layers.near.count + layers.air.count + bands.reduce((sum, layer) => sum + layer.count, 0) };
    },
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear();
      for (const item of owned) item.dispose();
      owned.length = 0; ships.clear(); fire.clear(); wallFlash.clear(); crew.clear();
      for (const list of [sinkers, wrecks, balls, splashes, shells, bursts, tracers, warnings, fallen, strikes]) list.clear();
    },
  };
}
