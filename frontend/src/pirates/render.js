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
//
// This file is the renderer's entry point: createWaveRenderer() (its layers, posts and pools, one frame's draw() and the
// returned API) and the public exports. Its parts live beside it, one job each:
//   render-sprites.js  the atlas's frames, packAtlas/loadAtlas, the sprite layer and shaders, pools, colours, look tables
//   render-draw.js     ships, boarders, militia, every shot in flight and its burst, the captains' rings and hp bars
//   render-events.js   onEvent: what each wave event starts on screen
// They get the renderer's layers and pools when it is made, and update() hands them its clock and latest state (sync).
import * as THREE from 'three';
import { CHARACTER_SCALE } from './character-scale.js';
import { createCombatOverlay } from './combat-overlay.js';
import { levelArt, pirateLevels, crewArt, pipRow, pirateFrames } from '../pixel/pirate-catalog.js';
import { buildingMarks } from '../art/path-marks.js';
import { makeCombatWallConnections } from './wall-connections.js';
import { makeSelectionBracket } from '../island/selection-bracket.js';
import { makeDefenseRange } from '../island/defense-range.js';
import { defenseDisplayAnchors } from '../island/defense-display.js';
import { createSmoother } from './smoothing.js';
import { projectGround } from '../world/projection.js';
import { towerLook } from './tower-health.js';
import { UNIT, spriteVertex, spriteFragment, createLayer, CAPACITY, LAYER_ORDER, BANDS, BAND_CAPACITY, BAND_FROM,
  BAND, POST_CAPACITY, fogVertex, fogFragment, pool, JAM_FRAMES, opt, RED, GOLD, WHITE, DARK, WRECK_SECONDS,
  SINK_SECONDS, FRAMES, rgb, SPLASH_SECONDS, TOWER_BAR_LIFT, BEAM, BEAM_CORE, towerFrame, BURST_SECONDS, musketLife,
  FALL_SECONDS, SWEEP_SECONDS } from './render-sprites.js';
import { createDraw } from './render-draw.js';
import { createEvents } from './render-events.js';

// The public API, unchanged: the sprite tables and helpers live in render-sprites.js.
export { ATLAS_IDS, GUNBOAT_FRAMES, JAM_FRAMES, GUNBOAT_IDS, BOARDER_BANDS, bandOf, MUSKET, GUN_LOOKS, damageTint,
  packAtlas, DOWN_IDS, STANDING_IDS, MILITIA_IDS, CARTOON_EXTRA_IDS, PIXEL_ONLY_IDS, TIER_IDS, FIRE_LEVEL_IDS, HARPOON_IDS,
  TOWER_STATE_IDS, CULVERIN_IDS, CULVERIN_STATE_IDS, SWIVEL_IDS, MARK_ATLAS_IDS, SWIVEL_STATE_IDS, towerFrame,
  loadAtlas, SHIP_VARIANTS, BRUTE_LOOK } from './render-sprites.js';

// Characters on foot (boarders, the cutlass swing, the musket pose) are drawn larger in a wave, so they read
// at the zoomed-out battle camera (GAME-V3.md §7 polish; 1 is the atlas box): scene.userData.characterScale
// (game.js, from the camera's zoom: character-scale.js), else CHARACTER_SCALE.
export { CHARACTER_SCALE };
/**
 * createWaveRenderer({scene, atlas, defenses, reducedMotion, quality, beamFrom}) where atlas is
 * {texture, width, height, rects} from loadAtlas(), defenses [{id, kind, x, z}] in world units and
 * beamFrom an optional drawn point {x, y} the lamps' beam starts from (the lighthouse lamp).
 * update({state, simTime, dt, defenseCoverage}) every frame; events(list) with the wave's events; dispose() once.
 */
// How whole a wall is drawn (0 = rubble, 1 = whole): a health set in the break (a paid repair or rebuild,
// D039) wins over the hp the wave ended with; otherwise the wave's own hp; a wall the wave does not know is whole.
export function wallShare(post, wall) {
  if (Number.isFinite(post?.rest)) return post.rest;
  return wall && wall.maxHp > 0 ? wall.hp / wall.maxHp : 1;
}

export function createWaveRenderer({ scene, atlas, defenses = [], reducedMotion = () => false, quality = () => 'high',
  beamFrom = null, place = null, recoveryV1 = false, nativeCaptains = false, fx = () => scene.userData?.pixelFx ?? null }) {
  const owned = [], root = new THREE.Group(); root.name = 'pirate-wave'; scene.add(root);
  const combatOverlay = createCombatOverlay(root);
  const rect = {};
  for (const [id, r] of Object.entries(atlas.rects)) {
    // A hair in from every edge so neighbours never bleed in.
    rect[id] = { u0: (r.x + .01) / atlas.width, u1: (r.x + r.w - .01) / atlas.width,
      v0: 1 - (r.y + r.h - .01) / atlas.height, v1: 1 - (r.y + .01) / atlas.height, w: r.w / UNIT, h: r.h / UNIT, anchor: r.anchor / UNIT };
  }
  const K = () => { const k = Number(scene?.userData?.characterScale); return Number.isFinite(k) && k >= 1 && k <= 3 ? k : CHARACTER_SCALE; };
  const material = new THREE.ShaderMaterial({ vertexShader: spriteVertex, fragmentShader: spriteFragment,
    uniforms: { uMap: { value: atlas.texture } }, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false });
  owned.push(material);
  const layers = {
    far: createLayer('far-sea', CAPACITY.far, material, LAYER_ORDER.far, owned),
    near: createLayer('near-sea', CAPACITY.near, material, LAYER_ORDER.near, owned),
    air: createLayer('air', CAPACITY.air, material, LAYER_ORDER.air, owned),
  };
  const layerList = Object.values(layers);
  for (const layer of layerList) root.add(layer.mesh);
  const bands = Array.from({ length: BANDS }, (_, i) => {
    const layer = createLayer(`boarders:${i}`, BAND_CAPACITY, material, 100 + BAND_FROM + i * BAND + BAND * .5, owned); root.add(layer.mesh); return layer;
  });
  // A one-layer post per wall, cannon and mortar (the sprite, its level pips and its crew figure); the
  // watchtower gets one only for the lookout.
  const hasPost = item => ['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel', 'watchtower'].includes(item.kind);
  const levelOf = item => (Number.isInteger(item.level) ? Math.max(1, Math.min(5, item.level)) : 1);
  // A level's art, or level 3's when the atlas has no tier frame (the pixel atlas).
  const levelFrame = (kind, level) => { const id = levelArt(kind, level); return rect[id] ? id : pirateLevels[kind][Math.min(3, level) - 1]; };
  // D055/D051: which path plates and skill emblem a post wears (read-only from the defense's tree and spec, legacy
  // {a, b} or the recovery snapshot's [a, b]); memoised, picked when the post is made or its defense changes.
  const marksOf = post => buildingMarks(post.kind, post.level, post.tree, post.spec);
  let displayAnchors = defenseDisplayAnchors(place, defenses);
  const defenseView = id => displayAnchors.get(id);
  const viewOf = item => defenseView(item.id) ?? item;
  const makePost = item => {
    const layer = createLayer(`defense:${item.id}`, POST_CAPACITY, material, 100 + viewOf(item).z, owned); root.add(layer.mesh);
    const post = { ...item, level: levelOf(item), layer, flip: false };
    post.marks = marksOf(post);
    return post;
  };
  function drawMarks(layer, x, y, marks) {
    for (const mark of marks) { const r = rect[mark.art]; if (r) layer.push(r, x + mark.dx, y + mark.dy, r.w, r.h, .5, r.anchor); }
  }
  const posts = defenses.filter(hasPost).map(makePost);
  const wallConnections = makeCombatWallConnections(root, atlas.wallArt);
  let inBreak = false;
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
  const sinkers = pool(), wrecks = pool(), balls = pool(), splashes = pool(), shells = pool(), bursts = pool(), tracers = pool(), warnings = pool(), jamShots = pool();
  const fallen = pool(), strikes = pool(), crew = new Map(); // boarders: id -> {phase, flashUntil}
  const guards = new Map(); // the Barracks' militia: id -> {phase, flashUntil, strikeUntil, facing}
  let captain = null, revive = null, figures = null;
  const fire = new Map(), wallFlash = new Map();
  const frameWalls = new Map(), frameTowers = new Map(), aliveShips = new Set(), aliveBoarders = new Set();
  const aliveAny = { has: id => aliveShips.has(id) || aliveBoarders.has(id) };
  let clock = 0, simNow = 0, latest = null, visible = true, disposed = false;
  let defenseSelection, defenseRange;
  const defenseAnchor = {};
  function showDefenseCoverage(coverage) {
    if (coverage?.id == null || !Number.isFinite(coverage.x) || !Number.isFinite(coverage.z)) {
      defenseSelection?.show(null);
      defenseRange?.show(null);
      return;
    }
    defenseSelection ??= makeSelectionBracket(root);
    defenseAnchor.spotId = coverage.id;
    defenseAnchor.kind = coverage.kind;
    defenseAnchor.level = coverage.level;
    const view = viewOf(coverage);
    defenseAnchor.x = view.x;
    defenseAnchor.z = view.z;
    defenseSelection.show(defenseAnchor);
    if (coverage.status === 'ready') {
      defenseRange ??= makeDefenseRange(root, {combat: true});
      defenseRange.show(coverage);
    } else defenseRange?.show(null);
  }
  // Ships and boarders glide between sim ticks instead of stepping (src/pirates/smoothing.js); drawing only.
  const smooth = createSmoother(() => clock);
  const still = () => !!reducedMotion();
  const low = () => quality() === 'low';
  const drawnY = z => projectGround(0, z).y;
  const drawnX = (x, z) => projectGround(x, z).x;
  const effects = () => (disposed ? null : fx());
  const spark = (x, y, options) => { const f = effects(); if (!f || still()) return; f.burst(x, y, low() ? { ...options, count: Math.ceil(options.count / 3) } : options); };

  const parts = createDraw(rect, layers, bands, posts, ships, crew, guards, splashes, wallFlash, K, still, low,
    drawnX, drawnY, effects, spark, nativeCaptains, defenseView, place === 'home_islet');
  const events = createEvents(parts, posts, ships, crew, guards, fire, wallFlash, balls, sinkers, wrecks, splashes,
    shells, bursts, tracers, jamShots, warnings, fallen, strikes, K, still, low, effects, spark, defenseView), onEvent = events.onEvent;
  const { drawShip, shipMeta, drawBoarder, drawMilitia, drawFallen, drawBall, drawShell, drawBurst, drawBurning,
    drawTracer, drawJamShot, drawSweep, drawCaptain, drawParty, drawRecoveryHealthBar, drawHealthBar, land } = parts;
  // A tower a gunboat has jammed (GAME-V3.md §4.1): a broken gear with sparks over it, in the air layer so no tree
  // hides it, until the jam is over.
  function drawJamMark(tower) {
    const mark = rect[JAM_FRAMES[still() ? 0 : Math.floor(clock * 5) % 2]];
    const {x, z} = viewOf(tower);
    if (mark) layers.air.push(mark, drawnX(x, z), drawnY(z) + 2.7 + (still() ? 0 : Math.sin(clock * 6) * .07), mark.w * 1.2, mark.h * 1.2, .5, mark.anchor * 1.2, opt(.97));
  }
  function drawWarning(item) {
    const age = clock - item.at, blink = still() ? 1 : (Math.floor(age * 4) % 2 ? .4 : 1);
    const p = coastEdge(item), colourOf = item.boss ? RED : GOLD;
    layers.air.push(rect[WHITE], p.x, p.y, .7, .7, .5, .35, opt(blink, colourOf, false, 0, .785));
    layers.air.push(rect[WHITE], p.x, p.y, .4, .4, .5, .2, opt(blink * .8, DARK, false, 0, .785));
  }
  // A warning sits a little inside the spawn point, so it is on screen before the ship.
  const coastEdge = item => ({ x: drawnX(item.x * .78, item.z * .78), y: drawnY(item.z * .78) + 1 });
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

  function draw() {
    for (const layer of layerList) layer.begin();
    for (const layer of bands) layer.begin();
    const state = latest;
    if (state && visible) {
      for (const wreck of wrecks.items) {
        const age = clock - wreck.at; if (age < 0) continue;
        const a = Math.min(1, age / .5) * Math.min(1, Math.max(0, (WRECK_SECONDS - age) / 2.5)), r = rect['pirate-wreck'];
        (wreck.z < 0 ? layers.far : layers.near).push(r, drawnX(wreck.x, wreck.z), drawnY(wreck.z), r.w * (wreck.big ? 1.25 : 1), r.h * (wreck.big ? 1.25 : 1), .5, r.anchor, opt(a * .9, null, wreck.facing < 0));
      }
      for (const ship of state.ships) {
        const at = smooth(ship);
        drawShip(at, shipMeta(ship.id, ship.kind, at.x, at.z));
      }
      for (const boarder of state.boarders ?? []) drawBoarder(smooth(boarder));
      for (const unit of state.militia ?? []) drawMilitia(unit);
      for (const item of fallen.items) drawFallen(item);
      for (const sinker of sinkers.items) {
        const age = clock - sinker.at, p = Math.min(1, age / SINK_SECONDS), r = rect[(FRAMES[sinker.kind] ?? FRAMES.sloop)[0]];
        if (!r) continue;
        const tilt = still() ? 0 : sinker.facing * p * .35;
        (sinker.z < 0 ? layers.far : layers.near).push(r, drawnX(sinker.x, sinker.z), drawnY(sinker.z) - p * r.h * .45, r.w, r.h, .5, r.anchor,
          opt(1 - p * p, rgb(1 - p * .4, 1 - p * .35, 1 - p * .25), sinker.facing < 0, 0, tilt));
      }
      for (const splash of splashes.items) {
        const p = (clock - splash.at) / SPLASH_SECONDS, frame = pirateFrames.splash[Math.min(2, Math.floor(p * 3))], r = rect[frame];
        const scale = splash.big ? 1.6 : 1;
        layers.air.push(r, drawnX(splash.x, splash.z), drawnY(splash.z), r.w * scale, r.h * scale, .5, r.anchor * scale);
      }
      for (const ball of balls.items) drawBall(ball);
      for (const shell of shells.items) drawShell(shell);
      for (const burst of bursts.items) drawBurst(burst);
      for (const patch of state.fires ?? []) drawBurning(patch);
      for (const tracer of tracers.items) drawTracer(tracer);
      for (const item of warnings.items) drawWarning(item);
      for (const item of jamShots.items) drawJamShot(item);
      for (const tower of state.towers ?? []) if (tower.jammed !== undefined) drawJamMark(tower);
      for (const item of strikes.items) drawSweep(item);
      drawCaptain();
      drawParty(state);
      if (recoveryV1) {
        for (const wall of state.walls ?? []) drawRecoveryHealthBar(wall);
        for (const tower of state.towers ?? []) drawRecoveryHealthBar(tower, viewOf(tower));
      } else {
        // T33: a bar over every tower with hp that has taken damage (none while the wave has no tower health).
        for (const tower of state.towers ?? []) if (tower.maxHp > 0 && tower.hp > 0 && tower.hp < tower.maxHp) {
          const {x, z} = viewOf(tower);
          drawHealthBar(x, z, tower.hp, tower.maxHp, TOWER_BAR_LIFT);
        }
      }
      // The lamps' beam: from the lighthouse lamp to an exposed flagship.
      const flagship = state.lampsLit && beamFrom ? state.ships.find(ship => ship.kind === 'flagship') : null;
      if (flagship) {
        const tx = drawnX(flagship.x, flagship.z), ty = drawnY(flagship.z) + 3, dx = tx - beamFrom.x, dy = ty - beamFrom.y;
        const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx) - Math.PI / 2, pulse = still() ? .7 : .6 + Math.sin(clock * 9) * .15;
        layers.air.push(rect[WHITE], beamFrom.x, beamFrom.y, 1.1, length, .5, 0, opt(pulse * .45, BEAM, false, 0, angle));
        layers.air.push(rect[WHITE], beamFrom.x, beamFrom.y, .35, length, .5, 0, opt(pulse, BEAM_CORE, false, 0, angle));
      }
    }
    for (const layer of layerList) layer.end();
    for (const layer of bands) layer.end();
    wallConnections.show(posts, state?.walls ?? [], {visible, inBreak});
    // Reused every frame (no new Map per frame): this frame's walls and towers by id.
    const walls = frameWalls, towers = frameTowers;
    walls.clear(); for (const wall of state?.walls ?? []) walls.set(wall.id, wall);
    towers.clear(); for (const tower of state?.towers ?? []) towers.set(tower.id, tower);
    const crew = state?.crew ?? {};
    for (const post of posts) {
      post.layer.begin();
      if (visible && post.kind === 'watchtower') {
        if (crew.lookout) drawCrew(post.layer, 'lookout', drawnX(post.x, post.z) + 1.4, drawnY(post.z) - .2, false);
      } else if (visible) {
        let id;
        const level = post.level, suffix = level > 1 ? `-l${level}` : '';
        let smoking = false, look = 'intact', share = 1, joinedWall = false;
        if (post.kind === 'wall') {
          share = wallShare(post, walls.get(post.id));
          id = share > .6 ? levelFrame('wall', level) : share > 0 ? pirateFrames.wall[1] : pirateFrames.wall[2];
          smoking = share <= .6;
          joinedWall = share > .6 && wallConnections.isJoined(post.id);
        } else {
          // Each kind and level has its own art; firing shows that level's firing frame (a mortar stays a mortar).
          look = towerLook(towers.get(post.id)); // T33: intact unless the wave has tower health
          id = towerFrame(post.kind, level, (fire.get(post.id)?.until ?? -1) > clock, frame => !!rect[frame], look);
        }
        const r = rect[id], flashing = (wallFlash.get(post.id) ?? -1) > clock ? .7 : 0;
        const repairing = post.kind === 'wall' && (walls.get(post.id)?.repairing || walls.get(post.id)?.crew);
        const view = viewOf(post), grow = 1, {x, y} = projectGround(view.x, view.z);
        // Match the world renderer's healthy junction posts; damaged/ruin frames remain full width.
        if (!wallConnections.hasPost(post.id)) post.layer.push(r, x, y, r.w * (joinedWall ? .62 : 1), r.h, .5, r.anchor, opt(1, rgb(1, repairing && !still() ? 1 + Math.sin(clock * 10) * .15 : 1, 1), post.kind !== 'wall' && post.flip, flashing));
        if (smoking) {
          const puff = rect[pirateFrames.smoke[(still() ? 0 : Math.floor(clock * 5)) % 3]];
          post.layer.push(puff, x, y + r.h - r.anchor, puff.w, puff.h, .5, puff.anchor, opt(.85));
        }
        if (!(post.kind === 'wall' && wallConnections.hasPost(post.id)) && (level > 1 || post.kind !== 'wall') && look !== 'broken') drawPips(post.layer, x, y + (r.h - r.anchor) * grow + .2, level);
        if (look !== 'broken' && share > 0 && post.marks.length) drawMarks(post.layer, x, y, post.marks);
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
    update({ state, simTime = simNow, dt = 0, captain: own = null, revive: helping = null, figures: drawnAt = null,
      combatFeedback = null, defenseCoverage = null } = {}) {
      if (disposed) return;
      clock += Math.max(0, Math.min(.1, dt || 0)); simNow = simTime; latest = state ?? latest; captain = own; revive = helping;
      figures = drawnAt instanceof Map ? drawnAt : null;
      parts.sync(clock, simNow, latest, captain, revive, figures); events.sync(clock, simNow, latest);
      shells.sweep(shell => simNow < shell.to);
      bursts.sweep(item => clock - item.at < BURST_SECONDS);
      tracers.sweep(item => clock - item.at < musketLife(item));
      warnings.sweep(item => clock - item.at < 3.2);
      jamShots.sweep(item => clock - item.at < .3);
      fallen.sweep(item => clock - item.at < FALL_SECONDS);
      strikes.sweep(item => clock - item.at < SWEEP_SECONDS);
      balls.sweep(ball => { if (simNow < ball.to) return true; land(ball); return false; });
      splashes.sweep(item => clock - item.at < SPLASH_SECONDS);
      sinkers.sweep(item => clock - item.at < SINK_SECONDS);
      wrecks.sweep(item => clock - item.at < WRECK_SECONDS);
      // Forget ships and boarders no longer in the wave; the id sets are reused, not built anew each frame.
      if (latest) {
        aliveShips.clear(); for (const ship of latest.ships) aliveShips.add(ship.id);
        for (const id of ships.keys()) if (!aliveShips.has(id)) ships.delete(id);
        aliveBoarders.clear(); for (const item of latest.boarders ?? []) aliveBoarders.add(item.id);
        if (latest.boarders) for (const id of crew.keys()) if (!aliveBoarders.has(id)) crew.delete(id);
        smooth.prune(aliveAny);
      }
      draw();
      combatOverlay.update(combatFeedback ?? {});
      showDefenseCoverage(visible ? defenseCoverage : null);
    },
    setVisible(value) {
      visible = value !== false; root.visible = visible;
      if (!visible) showDefenseCoverage(null);
    },
    // The island changed while this wave's posts stand (an upgrade or a new building in the break, or a
    // friend's): every post takes its new level, and a spot built since gets its post. The sim is not
    // touched; it fights with the defenses it started with.
    setDefenses(list) {
      if (disposed) return;
      inBreak = true;
      displayAnchors = defenseDisplayAnchors(place, list ?? []);
      showDefenseCoverage(null);
      // A building torn down in the break (GAME-V3.md §4.2) takes its post with it.
      for (const post of posts.filter(entry => !(list ?? []).some(item => item.id === entry.id))) {
        post.layer.mesh.visible = false; posts.splice(posts.indexOf(post), 1);
      }
      for (const item of list ?? []) {
        if (!hasPost(item)) continue;
        let post = posts.find(entry => entry.id === item.id);
        if (post) { post.level = levelOf(item); post.tree = item.tree; post.spec = item.spec; if (item.kind !== post.kind) Object.assign(post, {kind: item.kind}); post.marks = marksOf(post); }
        else { post = makePost(item); posts.push(post); }
        if (post.kind !== 'wall') post.layer.mesh.renderOrder = 100 + viewOf(post).z;
        // A wall repaired or rebuilt in the break (D039): draw its new health, not the one the wave ended with.
        if (post.kind === 'wall' && Number.isInteger(item.health)) post.rest = Math.max(0, Math.min(100, item.health)) / 100;
      }
      cannonsList = (list ?? []).filter(item => item.kind === 'cannon' || item.kind === 'mortar');
      fogUniforms.uCannons.value.forEach((vector, i) => vector.set(cannonsList[i]?.x ?? 0, cannonsList[i]?.z ?? 0));
      fogUniforms.uCount.value = Math.min(8, cannonsList.length);
    },
    // Each post's level, for checks.
    levels() { return Object.fromEntries(posts.map(post => [post.id, post.level])); },
    // Each post's path/skill marks (frame names), for checks.
    marks() { return Object.fromEntries(posts.map(post => [post.id, post.marks.map(mark => mark.art)])); },
    // Each wall's drawn health share (0 broken, 1 whole), for checks.
    wallShares(state = null) { const walls = new Map((state?.walls ?? []).map(wall => [wall.id, wall])); return Object.fromEntries(posts.filter(post => post.kind === 'wall').map(post => [post.id, wallShare(post, walls.get(post.id))])); },
    // For the pooling test and the perf panel: what the renderer holds right now.
    stats() {
      return { objects: root.children.length, owned: owned.length, ships: ships.size, balls: balls.size, splashes: splashes.size,
        sinkers: sinkers.size, wrecks: wrecks.size, shells: shells.size, bursts: bursts.size, tracers: tracers.size,
        boarders: crew.size, fallen: fallen.size, strikes: strikes.size,
        instances: layers.far.count + layers.near.count + layers.air.count + bands.reduce((sum, layer) => sum + layer.count, 0) };
    },
    dispose() {
      if (disposed) return; disposed = true;
      wallConnections.dispose();
      combatOverlay.dispose();
      defenseSelection?.dispose();
      defenseRange?.dispose();
      root.removeFromParent(); root.clear();
      for (const item of owned) item.dispose();
      owned.length = 0; ships.clear(); fire.clear(); wallFlash.clear(); crew.clear();
      for (const list of [sinkers, wrecks, balls, splashes, shells, bursts, tracers, warnings, jamShots, fallen, strikes]) list.clear();
    },
  };
}
