// The wave renderer's sprites (render.js): which frames the atlas holds and how a tower post picks one, the atlas
// itself (packAtlas for tests, loadAtlas for the cartoon set), the instanced sprite layer and its shaders, the pooled
// effect lists, the reused colour and option objects and the fixed look tables (ship sizes and variants, the guns' shots).
// Pure data and helpers: no renderer state.
import * as THREE from 'three';
import { projectGroundVector, groundProjectionGlsl } from '../world/projection.js';
import { pirateFrames, pirateLevels, crewArt, pirateDimensions, TIER_ART, FIRE_ART, HARPOON_ART, CULVERIN_ART,
  SWIVEL_ART, fireArt, levelArt } from '../pixel/pirate-catalog.js';
// T33 (D049, proposed): the damaged and broken tower drawings, used only while the wave has tower health.
import { TOWER_KINDS, towerStateFrame } from '../art/tower-states.js';
import { RECOVERY_BADGE, paintRecoveryBadge } from '../art/structure-health-badge.js';
import { MARK_IDS } from '../art/path-marks.js';
import { WALL_ATLAS_IDS } from '../art/village/walls.js';
import { wallAtlasView } from '../art/wall-atlas.js';
import { toScreen, pixelGlsl } from '../world/pixel-glsl.js';

export const UNIT = 16;
export const facingTo = item => projectGroundVector(item.toX - item.x, (item.toZ ?? item.z ?? 0) - (item.z ?? 0)).x < 0 ? -1 : 1;
export const WHITE = 'white';
export const HEALTH_BADGE = 'recovery-health-badge', RUIN_BADGE = 'recovery-ruin-badge';
export const ATLAS_IDS = [...pirateFrames.sloop, ...pirateFrames.brig, ...pirateFrames.flagship, ...pirateFrames.warship,
  ...pirateFrames.splash, ...pirateFrames.wall, ...pirateFrames.cannon, ...pirateFrames.mortar,
  ...pirateLevels.wall.slice(1), ...pirateLevels.cannon.slice(1), ...pirateLevels.mortar.slice(1), ...Object.values(crewArt),
  ...pirateFrames.captain, ...pirateFrames.smoke, ...pirateFrames.fire, ...pirateFrames.explosion, ...pirateFrames.boarder,
  'captain-cutlass', 'fx-musket-flash', 'fx-mortar-shell', 'fx-level-pip', 'pirate-cannonball', 'pirate-wreck'];
// The gunboat (GAME-V3.md §4.1), cartoon only like the tiers: its own small hull (three bobbing frames), its muzzle
// flash and the two-frame "jammed" mark over a tower (src/art/fleet.js). A pixel atlas (tests) sails it as a plain
// sloop and draws no marks.
export const GUNBOAT_FRAMES = ['pirate-gunboat-1', 'pirate-gunboat-2', 'pirate-gunboat-3'];
export const JAM_FRAMES = ['fx-jam-1', 'fx-jam-2'];
export const GUNBOAT_IDS = [...GUNBOAT_FRAMES, 'fx-gunboat-flash', ...JAM_FRAMES];
export const GUNBOAT_BOX = [56, 44]; // the hull's box in the cartoon atlas (src/art/fleet.js)
export const EXPLOSION_FRAMES = pirateFrames.explosion;
export const LAYER_ORDER = { far: 76, near: 124, air: 940, fog: 900 };
export const CAPACITY = { far: 96, near: 96, air: 320 };
export const SINK_SECONDS = 1.8, WRECK_SECONDS = 9, SPLASH_SECONDS = .5, FLASH_SECONDS = .12, FIRE_SECONDS = .22;
export const TOWER_BAR_LIFT = 2.7;          // T33: drawn units above the ground for a tower's hp bar (a tower is taller than a captain)
export const BURST_SECONDS = .6, POSE_SECONDS = .6, POST_CAPACITY = 12; // sprite, smoke, 5 pips, crew and up to 3 path/skill marks
// Boarders on land: one sprite layer per 2-unit band of z (renderOrder 100 + z like the island's art), so
// they pass in front of and behind walls, buildings and the player; a band is drawn only while it has one.
export const BAND = 2, BAND_FROM = -26, BANDS = 26, BAND_CAPACITY = 96, STRIKE_SECONDS = .3, SWEEP_SECONDS = .5, FALL_SECONDS = .5;
export const BOARDER_BANDS = BANDS;
export const bandOf = z => Math.max(0, Math.min(BANDS - 1, Math.floor((z - BAND_FROM) / BAND)));
// The musket (§10): the firing pose and its flash stay ~250 ms, a short tracer runs to the target, a puff on the hit.
export const MUSKET = Object.freeze({ fire: .25, tracerMin: .12, tracerLength: 1.6, puff: .4, muzzleX: 1.5, muzzleY: 1 });
export const musketLife = item => Math.max(POSE_SECONDS, item.flight + MUSKET.puff);
// Each weapon's shot looks its own (TOWER-DEFENSE.md §15): the tracer's colour, width and streak length
// (in world units; the rifle draws the whole line at once), the muzzle flash's size and the hit puff's.
export const GUN_LOOKS = Object.freeze({
  musket: Object.freeze({ r: 1, g: .93, b: .62, width: .125, length: 1.6, flash: 1, puff: .75 }),
  pistols: Object.freeze({ r: 1, g: 1, b: .86, width: .08, length: .8, flash: .6, puff: .5 }),
  blunderbuss: Object.freeze({ r: 1, g: .62, b: .3, width: .11, length: .7, flash: 1.5, puff: .6 }),
  long_rifle: Object.freeze({ r: .78, g: .95, b: 1, width: .07, length: 60, flash: 1.2, puff: .9 }),
  fire_bombs: Object.freeze({ r: 1, g: .55, b: .2, width: .1, length: 1, flash: .7, puff: 1 }),
});
export const lookOf = weapon => GUN_LOOKS[weapon] ?? GUN_LOOKS.musket;
// A damaged hull darkens (down to 62% at no hp left, a burning one a little more), so a ship under fire
// stays a strong, readable shape at the battle zoom instead of a pale one. Pure.
export function damageTint(base = {}, share = 1) { return damageInto({}, base, share); }
export function damageInto(out, base, share) {
  const left = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 1));
  const k = left >= .66 ? 1 : 1 - .38 * (1 - left / .66) - (left < 1 / 3 ? .06 : 0);
  out.r = (base?.r ?? 1) * k; out.g = (base?.g ?? 1) * k; out.b = (base?.b ?? 1) * k;
  return out;
}
export const BOMB_BURST = { r: 1, g: .5, b: .2 };

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
export const STANDING_IDS = Array.from({length: 10}, (_, index) => `captain-${index + 1}`);
// The Barracks' militia (GAME-V3.md "Houses"), cartoon only: a pixel atlas (tests) simply does not draw them.
export const MILITIA_IDS = ['militia', 'militia-walk-1', 'militia-walk-2', 'militia-strike', 'militia-hit'];
export const CARTOON_EXTRA_IDS = ['boarder', 'boarder-walk-1', 'boarder-walk-2', 'boarder-hit', 'boarder-hack', ...DOWN_IDS, ...STANDING_IDS, ...MILITIA_IDS];
export const PIXEL_ONLY_IDS = [...pirateFrames.boarder];
// Levels 4 and 5 of walls, cannons and mortars and their gold pips (GAME-V3.md §4.1): cartoon-only, so a pixel
// atlas (tests) draws a tier building with its level-3 art and plain pips.
export const TIER_IDS = [...Object.values(TIER_ART).flat(), 'fx-level-pip-gold'];
// The firing frames of levels 2 to 5 (FIRE_ART): cartoon-only like the tiers.
export const FIRE_LEVEL_IDS = Object.values(FIRE_ART).flatMap(list => list.slice(1));
// The harpoon tower, its harpoon and the rope marks of a slowed ship (GAME-V3.md §5): cartoon-only as well.
export const HARPOON_IDS = [...HARPOON_ART.levels, ...HARPOON_ART.fire, HARPOON_ART.bolt, HARPOON_ART.ripples, HARPOON_ART.rope];
// T33: every kind, level 1-5, damaged and broken (src/art/tower-states.js), cartoon only, and only in the atlas
// of a wave with tower health (loadAtlas towerStates), so the atlas of every other wave stays as it was.
export const TOWER_STATE_IDS = TOWER_KINDS.flatMap(kind => [1, 2, 3, 4, 5].flatMap(level =>
  ['damaged', 'broken'].map(state => towerStateFrame(kind, level, state))));
// The culverin (T43, D048 proposed): every level idle and firing and its shot, cartoon only, and only in the atlas of a
// wave that fights with one (loadAtlas culverins), its damaged and broken drawings only with tower health as well.
// A pixel atlas has none and draws a cannon instead.
export const CULVERIN_IDS = [...CULVERIN_ART.levels, ...CULVERIN_ART.fire, CULVERIN_ART.shot];
export const CULVERIN_STATE_IDS = [...CULVERIN_ART.damaged, ...CULVERIN_ART.broken];
// The swivel-gun nest (D055), the same way: only in the atlas of a wave that fights with one (loadAtlas swivels).
export const SWIVEL_IDS = [...SWIVEL_ART.levels, ...SWIVEL_ART.fire, SWIVEL_ART.shot];
// D055/D051: the path plates and skill emblems over a post (src/art/path-marks.js), cartoon only and small; a pixel
// atlas (tests) has none and simply draws no marks.
export const MARK_ATLAS_IDS = MARK_IDS;
export const SWIVEL_STATE_IDS = [...SWIVEL_ART.damaged, ...SWIVEL_ART.broken];
/**
 * The frame of a cannon or mortar post: its level's art, or while it fires its level's firing frame (so a
 * level-3 cannon does not flick to level 1's plain barrel, nor a level-5 one lose its gold). has(id) says
 * whether the atlas holds a frame; without one (the pixel atlas) a tier falls back to level 3's art and a
 * shot to level 1's firing frame. Pure.
 * state (T33): 'damaged' or 'broken' takes that drawing when the atlas has it (a broken tower never shows a
 * shot), else the intact frame; 'intact' (the default) is exactly the frame of before.
 */
export function towerFrame(kind, level, firing = false, has = () => true, state = 'intact') {
  if (state === 'damaged' || state === 'broken') {
    const id = towerStateFrame(kind, level, state);
    if (has(id)) return id;
    if (state === 'broken') firing = false;
  }
  if (kind === 'culverin' || kind === 'swivel') { // cartoon-only, like the harpoon: a pixel atlas has neither, so a cannon stands in
    const art = kind === 'swivel' ? SWIVEL_ART : CULVERIN_ART;
    const n = Math.max(1, Math.min(5, Number.isInteger(level) ? level : 1)), id = (firing ? art.fire : art.levels)[n - 1];
    return has(id) ? id : towerFrame('cannon', level, firing, has);
  }
  if (kind === 'harpoon') { // cartoon-only: a pixel atlas has no harpoon, so a cannon stands in
    const n = Math.max(1, Math.min(5, Number.isInteger(level) ? level : 1)), id = (firing ? HARPOON_ART.fire : HARPOON_ART.levels)[n - 1];
    return has(id) ? id : towerFrame('cannon', level, firing, has);
  }
  const k = kind === 'mortar' ? 'mortar' : 'cannon', n = Math.max(1, Math.min(5, Number.isInteger(level) ? level : 1));
  if (firing) { const id = fireArt(k, n); return has(id) ? id : pirateFrames[k][1]; }
  const id = levelArt(k, n);
  return has(id) ? id : pirateLevels[k][Math.min(3, n) - 1];
}
export const BOARDER_ART = Object.freeze({ walk: ['boarder-walk-1', 'boarder-walk-2'], hack: ['boarder', 'boarder-hack'], hit: 'boarder-hit', still: 'boarder' });
/**
 * Paints every atlas sprite in the clean cartoon style (src/art/) into one smooth texture (browser
 * only; cached by the caller): linear filtering with mipmaps, premultiplied alpha, at the screen's
 * density within the atlas budget. rects, width and height stay in logical px (16 per world unit).
 */
export async function loadAtlas({ quality = 'high', colour = 0, towerStates = false, culverins = false, swivels = false } = {}) {
  const { cartoonAtlas, smoothTexture } = await import('../art/textures.js');
  const { setPoseColour } = await import('../art/people.js');
  setPoseColour(colour); // your captain's musket and cutlass poses in your lobby colour
  const ids = [...new Set([...ATLAS_IDS.filter(id => !PIXEL_ONLY_IDS.includes(id)), ...CARTOON_EXTRA_IDS, ...TIER_IDS, ...WALL_ATLAS_IDS, ...FIRE_LEVEL_IDS, ...HARPOON_IDS, ...GUNBOAT_IDS,
    ...(towerStates ? TOWER_STATE_IDS : []), ...(culverins ? CULVERIN_IDS : []), ...(culverins && towerStates ? CULVERIN_STATE_IDS : []),
    ...(swivels ? SWIVEL_IDS : []), ...(swivels && towerStates ? SWIVEL_STATE_IDS : []), ...MARK_ATLAS_IDS])];
  const extra = [[WHITE, 8, 8]];
  if (towerStates) extra.push([HEALTH_BADGE, RECOVERY_BADGE.width, RECOVERY_BADGE.height],
    [RUIN_BADGE, RECOVERY_BADGE.width, RECOVERY_BADGE.height]);
  const atlas = await cartoonAtlas(ids, { quality, extra });
  const white = atlas.rects[WHITE], context = atlas.image.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(white.x * atlas.density, white.y * atlas.density, white.w * atlas.density, white.h * atlas.density);
  if (towerStates) {
    for (const id of [HEALTH_BADGE, RUIN_BADGE]) {
      const { x, y } = atlas.rects[id];
      context.save();
      context.translate(x * atlas.density, y * atlas.density);
      context.scale(atlas.density, atlas.density);
      paintRecoveryBadge(context, id === RUIN_BADGE);
      context.restore();
    }
  }
  const result = {texture: smoothTexture(atlas.image), width: atlas.image.width / atlas.density, height: atlas.image.height / atlas.density,
    rects: atlas.rects, density: atlas.density};
  result.wallArt = wallAtlasView(result); return result;
}

export const spriteVertex = /* glsl */`
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
export const spriteFragment = /* glsl */`
uniform sampler2D uMap;varying vec2 vUv;varying vec4 vTint;varying float vFlash;
void main(){
  vec4 t=texture2D(uMap,vUv);float a=t.a*vTint.a;
  if(a<.004)discard;
  // Premultiplied: the texel's colour already carries its alpha; the tint's alpha fades both.
  gl_FragColor=vec4(mix(t.rgb*vTint.rgb,vec3(1.0,.96,.82)*t.a,vFlash)*vTint.a,a);
  ${toScreen}
}`;
export const fogVertex = /* glsl */`varying vec2 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xy;gl_Position=projectionMatrix*viewMatrix*w;}`;
export const fogFragment = /* glsl */`
${pixelGlsl}
${groundProjectionGlsl}
uniform vec2 uCannons[8];uniform float uCount,uSight,uFog,uTime;varying vec2 vWorld;
void main(){
  vec2 p=vWorld;vec2 logical=unprojectGround(p);
  float d=1e4;
  for(int i=0;i<8;i++){if(float(i)>=uCount)break;d=min(d,length(logical-uCannons[i]));}
  float drift=pxNoise(vec2(p.x*.09+uTime*.05,p.y*.16))*.35;
  float edge=smoothstep(uSight-1.5,uSight+5.0,d+drift*3.0);
  float a=clamp(edge*(.32+.42*uFog)+drift*edge*.15,0.0,1.0);
  if(a<=.002)discard;
  gl_FragColor=vec4(vec3(.80,.85,.84),a);
  ${toScreen}
}`;

export function createLayer(name, capacity, material, renderOrder, owned) {
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
      for (const key of ATTRIBUTES) {
        const attribute = geometry.getAttribute(key); attribute.needsUpdate = true;
        attribute.clearUpdateRanges?.(); attribute.addUpdateRange?.(0, count * attribute.itemSize);
      }
    },
  };
}

// A small reusable list: entries are recycled instead of allocated per event.
export function pool() {
  const items = [], spare = [];
  return {
    items,
    add(fill) { const item = spare.pop() ?? {}; fill(item); items.push(item); return item; },
    sweep(keep) { for (let i = items.length - 1; i >= 0; i--) if (!keep(items[i])) { spare.push(items[i]); items.splice(i, 1); } },
    clear() { spare.push(...items); items.length = 0; },
    get size() { return items.length; },
  };
}

export const colour = hex => { const c = new THREE.Color(hex); return { r: c.r, g: c.g, b: c.b }; };
export const RECOVERY_TINT = {
  green: colour(RECOVERY_BADGE.green), gold: colour(RECOVERY_BADGE.gold), red: colour(RECOVERY_BADGE.red),
  light: colour(RECOVERY_BADGE.light),
};
export const GOLD = colour('#ffd77a'), RED = colour('#d8553f'), GREEN = colour('#9fd26a'), DARK = colour('#1f2622'), BEAM = colour('#ffe9a8');
export const BRASS = colour('#e0b04a'), TEAL = colour('#4fc3c9');
export const CANNONBALL_LOOK = {
  island: { core: { r: 1.1, g: 1.05, flashing: .04 }, trail: colour('#ffdc97') },
  ship: { core: { r: 1.4, g: .72, b: .55, flashing: .065 }, trail: colour('#fa8355') },
};
export const CANNONBALL_TAIL = [{ width: .32, alpha: .88 }, { width: .19, alpha: .44 }];
// One reused {r, g, b, a} for a colour at an alpha: layer.push copies the numbers at once, so the many
// bars, shadows and pips drawn each frame need no new object each.
export const TINT = { r: 1, g: 1, b: 1, a: 1 };
export const tinted = (c, a) => { TINT.r = c.r; TINT.g = c.g; TINT.b = c.b; TINT.a = a; return TINT; };
// The same for every other sprite: one reused option object with the alpha, colour (r, g, b; white
// without one), flip, flash and angle, so no sprite drawn per frame makes a new object. Same defaults as push.
export const OPT = { flip: false, angle: 0, r: 1, g: 1, b: 1, a: 1, flashing: 0 };
export function opt(a = 1, c = null, flip = false, flashing = 0, angle = 0) {
  OPT.a = a; OPT.r = c?.r ?? 1; OPT.g = c?.g ?? 1; OPT.b = c?.b ?? 1;
  OPT.flip = flip; OPT.flashing = flashing; OPT.angle = angle;
  return OPT;
}
export const RGB = { r: 1, g: 1, b: 1 };
export const rgb = (r, g, b) => { RGB.r = r; RGB.g = g; RGB.b = b; return RGB; };
export const SMOKE = { r: .32, g: .28, b: .3 }, SPRAY = { r: .86, g: .73, b: .47 }, SHOT_TRAIL = { r: .95, g: .92, b: .82 };
export const SPARK_TRAIL = { r: 1, g: .94, b: .72 }, SHOT = { r: .36, g: .38, b: .44 };
export const BOMB_TRAIL = { r: .85, g: .82, b: .78 }, FIRE_BALL = { r: .5, g: .35, b: .3 };
export const STAR = { r: .95, g: .98, b: 1 }, TRACER = { r: 1, g: .97, b: .85 }, BEAM_CORE = { r: 1, g: 1, b: .95 }, ARMOURED = { r: .75, g: .78, b: .8 };
export const SHIP_DRAWN = { w: 0, h: 0, anchor: 0 }, SHIP_DRAWN_SIZE = { w: 0, h: 0 };
export const ATTRIBUTES = ['iPos', 'iSize', 'iUv', 'iTint', 'iFlash'];
export const SHIP_SIZE = Object.fromEntries(['sloop', 'brig', 'flagship'].map(kind => {
  const [w, h] = pirateDimensions[pirateFrames[kind][0]]; return [kind, { w: w / UNIT, h: h / UNIT }];
}));
{ const [w, h] = pirateDimensions[pirateFrames.warship[0]]; SHIP_SIZE.warship = { w: w / UNIT, h: h / UNIT }; }
export const FRAMES = { ...pirateFrames, gunboat: GUNBOAT_FRAMES };
SHIP_SIZE.gunboat = { w: GUNBOAT_BOX[0] / UNIT, h: GUNBOAT_BOX[1] / UNIT };
// The campaign's pirate types (docs/GAME-V3.md §4, src/pirates/sim.js CONFIG.tiers): each sails as one of the
// fleet's drawings with its own colour and size, so a new tier reads at a glance. Pure data.
export const SHIP_VARIANTS = Object.freeze({
  raider: Object.freeze({ frames: 'sloop', tint: Object.freeze({ r: 1, g: .52, b: .46 }), scale: .9 }),
  ironclad: Object.freeze({ frames: 'brig', tint: Object.freeze({ r: .6, g: .67, b: .8 }), scale: 1.1 }),
  dreadnought: Object.freeze({ frames: 'warship', tint: Object.freeze({ r: .56, g: .5, b: .62 }), scale: 1.25 }),
  redtide: Object.freeze({ frames: 'warship', tint: Object.freeze({ r: 1, g: .42, b: .4 }), scale: 1.5 }),
  // v3 waves (wave-events.js): the event ships. Fire ships are charred hulls (their flames: wave-events-art.js),
  // the armada's cutters small teal sloops, the barge a broad grey hull, the galleon a gold warship, the
  // smugglers' longboats tiny dark boats; the kraken's tentacles are drawn by wave-events-art.js alone.
  fireship: Object.freeze({ frames: 'sloop', tint: Object.freeze({ r: .5, g: .36, b: .3 }), scale: 1 }),
  cutter: Object.freeze({ frames: 'sloop', tint: Object.freeze({ r: .62, g: .92, b: .9 }), scale: .72 }),
  barge: Object.freeze({ frames: 'brig', tint: Object.freeze({ r: .66, g: .66, b: .62 }), scale: 1.3 }),
  galleon: Object.freeze({ frames: 'warship', tint: Object.freeze({ r: 1, g: .86, b: .45 }), scale: 1.1 }),
  longboat: Object.freeze({ frames: 'sloop', tint: Object.freeze({ r: .55, g: .5, b: .44 }), scale: .6 }),
  // The gunboat (CONFIG.ships.gunboat): its own hull; without it in the atlas (the pixel one) a small dark sloop.
  gunboat: Object.freeze({ frames: 'gunboat', tint: Object.freeze({ r: 1, g: 1, b: 1 }), scale: 1 }),
  tentacle: Object.freeze({ frames: 'sloop', hidden: true, scale: 1 }),
});
export const BRUTE_LOOK = Object.freeze({ tint: Object.freeze({ r: 1, g: .7, b: .58 }), scale: 1.3 });
