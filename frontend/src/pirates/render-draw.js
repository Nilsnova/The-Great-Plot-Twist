// The wave renderer's ships, people and shots (render.js): ships with their wakes, ropes, fire and hp bars, boarders and
// the Barracks' militia on foot and when they fall; every shot in flight (cannonballs, harpoons, culverin balls, swivel
// pellets, mortar shells, fire bombs) with its burst, burning ground, the captains' tracers and cutlass sweep, the
// gunboat's jamming shot and what a ball does when it lands; the captains' reload ring, hp bars and a fallen captain's
// ring. A closure over the renderer's layers and pools, passed in by render.js.
import { projectGround, projectGroundVector, projectLegacyGround } from '../world/projection.js';
import { HARPOON_ART, pirateFrames, CULVERIN_ART, SWIVEL_ART } from '../pixel/pirate-catalog.js';
import { RECOVERY_BADGE, recoveryBadgeFill, recoveryBadgeLift, recoveryBadgeTone } from '../art/structure-health-badge.js';
import { FRAMES, SHIP_VARIANTS, SHIP_SIZE, SHIP_DRAWN_SIZE, SHIP_DRAWN, WHITE, opt, damageInto, RGB, SMOKE, ARMOURED,
  RED, GREEN, GOLD, tinted, DARK, bandOf, BOARDER_ART, BRUTE_LOOK, MILITIA_IDS, TEAL, FALL_SECONDS, SPRAY,
  SHOT_TRAIL, SPARK_TRAIL, SHOT, CANNONBALL_LOOK, CANNONBALL_TAIL, BOMB_TRAIL, FIRE_BALL, BOMB_BURST, BURST_SECONDS,
  EXPLOSION_FRAMES, MUSKET, lookOf, facingTo, SWEEP_SECONDS, STAR, BRASS, DOWN_IDS, TRACER,
  FLASH_SECONDS, HEALTH_BADGE, RUIN_BADGE, RECOVERY_TINT } from './render-sprites.js';

// The arguments in this order (render.js passes them so; positional, so the minifier shortens them).
export function createDraw(rect, layers, bands, posts, ships, crew, guards, splashes, wallFlash, K, still, low,
  drawnX, drawnY, effects, spark) {
  // The renderer's clock and latest state as update() last set them (render.js calls sync() right after, every frame).
  let clock = 0, simNow = 0, latest = null, captain = null, revive = null, figures = null;
  function sync(now, simTime, state, own, helping, drawnAt) { clock = now; simNow = simTime; latest = state; captain = own; revive = helping; figures = drawnAt; }
  function shipMeta(id, kind, x, z, toX, toZ) {
    let meta = ships.get(id);
    if (!meta) {
      const at = projectGround(x, z), dx = projectGround(toX ?? 0, toZ ?? 0).x - at.x;
      const facing = Math.abs(dx) > .5 ? (dx < 0 ? -1 : 1) : (at.x > 0 ? -1 : 1);
      let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
      meta = { kind, facing, phase: (hash >>> 0) % 997 / 997 * 4, flashUntil: -1, bornAt: clock };
      ships.set(id, meta);
    }
    return meta;
  }
  const frameOf = (kind, phase) => {
    let frames = FRAMES[kind] ?? FRAMES.sloop;
    if (!rect[frames[0]]) frames = FRAMES.sloop; // a pixel atlas has no gunboat hull
    if (still()) return frames[0];
    const step = Math.floor(clock * 3.2 + phase) % 4; return frames[step === 3 ? 1 : step];
  };

  function drawShip(ship, meta) {
    const variant = SHIP_VARIANTS[ship.kind] ?? null, kind = variant?.frames ?? ship.kind, k = variant?.scale ?? 1;
    if (variant?.hidden) return; // v3 waves: drawn by wave-events-art.js
    const base = SHIP_SIZE[kind] ?? SHIP_SIZE.sloop, frame = frameOf(kind, meta.phase), drawn = rect[frame];
    if (!drawn) return;
    const size = SHIP_DRAWN_SIZE; size.w = base.w * k; size.h = base.h * k;
    const r = k === 1 ? drawn : SHIP_DRAWN; if (k !== 1) { r.w = drawn.w * k; r.h = drawn.h * k; r.anchor = drawn.anchor * k; }
    const layer = ship.z < 0 ? layers.far : layers.near, {x, y} = projectGround(ship.x, ship.z);
    // A hit shows as a short warm flash, kept light so a ship under steady fire never turns white.
    const fadeIn = Math.min(1, (clock - meta.bornAt) / .6), flashing = clock < meta.flashUntil ? (ship.boss ? .2 : .3) : 0;
    const share = ship.maxHp > 0 ? Math.max(0, Math.min(1, ship.hp / ship.maxHp)) : 1, burning = ship.hp > 0 && share < 1 / 3;
    // A wake behind a sailing ship: two pale strokes on the water.
    if (ship.state === 'sailing' && !low() && !still()) {
      const back = -meta.facing * size.w * .45, wob = Math.floor(clock * 6 + meta.phase) % 2;
      layer.push(rect[WHITE], x + back, y - .05, size.w * .28, .06, .5, 0, opt(.45 * fadeIn));
      layer.push(rect[WHITE], x + back * 1.35 - wob * .1, y + .08, size.w * .18, .06, .5, 0, opt(.3 * fadeIn));
    }
    // A ship a harpoon (or Chain shot) holds back (GAME-V3.md §5): foam rings on the water around the hull, swelling
    // a little, and a small coil of rope over it. Cartoon-only: a pixel atlas has neither frame.
    const slowedRipples = ship.slowed ? rect[HARPOON_ART.ripples] : null;
    if (slowedRipples) {
      const swell = still() ? 1 : 1 + Math.sin(clock * 4 + meta.phase) * .06, wide = Math.max(size.w * 1.05, 3) * swell;
      layer.push(slowedRipples, x, y - .02, wide, wide * slowedRipples.h / slowedRipples.w, .5, slowedRipples.anchor * wide / slowedRipples.w, opt(.85 * fadeIn));
    }
    layer.push(drawn, x, y, r.w, r.h, .5, r.anchor, opt(fadeIn, damageInto(RGB, variant?.tint ?? (drawn.tint || null), share), meta.facing < 0, flashing));
    if (ship.slowed && rect[HARPOON_ART.rope]) {
      const mark = rect[HARPOON_ART.rope], bob = still() ? 0 : Math.sin(clock * 3 + meta.phase) * .06;
      layers.air.push(mark, x - Math.min(1.5, size.w * .3), y + size.h - r.anchor + .55 + bob, mark.w * .85, mark.h * .85, .5, mark.anchor * .85, opt(fadeIn));
    }
    // A burning ship below a third of its hull: dark smoke rising and the fire on deck, drawn over the hull
    // and big enough to read at the battle zoom (bigger ships burn in two places).
    if (burning) {
      const step = still() ? 0 : Math.floor(clock * 8 + meta.phase), big = size.w > 5;
      const spots = big ? [-.16, .14] : [.12];
      spots.forEach((at, i) => {
        const fx = x + meta.facing * size.w * at, fy = y + size.h * (i ? .42 : .34);
        const smoke = rect[pirateFrames.smoke[(step + i) % 3]];
        if (smoke && !low()) layers.air.push(smoke, fx - meta.facing * .3, fy + 1.1 + (still() ? 0 : (clock * .8 + i * .5) % 1 * .6), smoke.w * 1.1, smoke.h * 1.1, .5, smoke.anchor * 1.1, opt(.55 * fadeIn, SMOKE));
        const flame = rect[pirateFrames.fire[(step + i) % 3]];
        if (flame) layers.air.push(flame, fx, fy, flame.w * 1.35, flame.h * 1.35, .5, flame.anchor * 1.35, opt(fadeIn));
      });
    }
    if (ship.hp < ship.maxHp || ship.boss) {
      const top = y + size.h - r.anchor + .15, w = Math.min(2.4, size.w * .5), share = Math.max(0, ship.hp / ship.maxHp);
      const tint = ship.kind === 'flagship' && !ship.exposed ? ARMOURED : ship.boss ? RED : share > .5 ? GREEN : share > .25 ? GOLD : RED;
      layers.air.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .3125, 0, 0, tinted(DARK, .8));
      layers.air.push(rect[WHITE], x - w / 2, top, w * share, .1875, 0, 0, opt(1, tint));
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
    const meta = boarderMeta(boarder.id), layer = bands[bandOf(boarder.z)], {x, y} = projectGround(boarder.x, boarder.z);
    faceActor(meta, boarder);
    const frames = FRAMES.boarder, hacking = boarder.state === 'hacking' || boarder.state === 'fighting', hit = clock < meta.flashUntil;
    const step = still() ? 0 : Math.floor(clock * (hacking ? 3 : 5) + meta.phase) % 2;
    const cartoon = hit ? BOARDER_ART.hit : hacking ? BOARDER_ART.hack[step] : still() ? BOARDER_ART.still : BOARDER_ART.walk[step];
    const r = rect[cartoon] ?? rect[hacking ? (step ? frames[2] : frames[0]) : frames[step]];
    if (!r) return;
    // A brute (wave 20+) is bigger and redder than the rest of the crowd.
    const big = boarder.brute ? BRUTE_LOOK.scale : 1, look = boarder.brute ? BRUTE_LOOK.tint : {};
    layer.push(r, x, y, r.w * K() * big, r.h * K() * big, .5, r.anchor * K() * big, opt(1, look, meta.facing < 0, hit ? (rect[cartoon] ? .35 : .7) : 0));
    if (boarder.hp < boarder.maxHp) {
      const top = y + (r.h - r.anchor) * K() - .35, w = .9, share = Math.max(0, boarder.hp / boarder.maxHp);
      layer.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .25, 0, 0, tinted(DARK, .8));
      layer.push(rect[WHITE], x - w / 2, top, w * share, .125, 0, 0, opt(1, share > .5 ? GOLD : RED));
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
    const meta = militiaMeta(unit.id), layer = bands[bandOf(unit.z)], {x, y} = projectGround(unit.x, unit.z);
    faceActor(meta, unit);
    const hit = clock < meta.flashUntil, striking = clock < meta.strikeUntil, step = still() ? 0 : Math.floor(clock * 5 + meta.phase) % 2;
    const id = hit ? 'militia-hit' : striking ? 'militia-strike' : unit.state === 'walking' && !still() ? MILITIA_IDS[1 + step] : 'militia';
    const r = rect[id];
    if (!r) return;
    layer.push(r, x, y, r.w * K(), r.h * K(), .5, r.anchor * K(), opt(1, null, meta.facing < 0, hit ? .35 : 0));
    if (unit.hp < unit.maxHp) {
      const top = y + (r.h - r.anchor) * K() - .35, w = .9, share = Math.max(0, unit.hp / unit.maxHp);
      layer.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .25, 0, 0, tinted(DARK, .8));
      layer.push(rect[WHITE], x - w / 2, top, w * share, .125, 0, 0, opt(1, share > .5 ? TEAL : share > .25 ? GOLD : RED));
    }
  }
  // A fallen boarder (or militia): the sprite sinks and fades under a puff of smoke.
  function faceActor(meta, actor) {
    const target = actor.wallId ? posts.find(post => post.id === actor.wallId) : actor.towerId ? posts.find(post => post.id === actor.towerId)
      : latest?.party?.find(unit => unit.id === actor.foe) ?? latest?.boarders?.find(unit => unit.id === actor.foe)
        ?? latest?.militia?.find(unit => unit.id === actor.foe);
    const dx = target ? projectGroundVector(target.x - actor.x, target.z - actor.z).x
      : meta.x == null ? 0 : projectGroundVector(actor.x - meta.x, actor.z - meta.z).x;
    if (Math.abs(dx) > .001) meta.facing = dx < 0 ? -1 : 1;
    else if (meta.x == null) meta.facing = actor.facing ?? meta.facing;
    meta.x = actor.x; meta.z = actor.z;
  }
  function drawFallen(item) {
    const p = Math.min(1, (clock - item.at) / FALL_SECONDS), layer = bands[bandOf(item.z)], {x, y} = projectGround(item.x, item.z);
    const r = (item.militia ? rect['militia-hit'] : null) ?? rect[BOARDER_ART.hit] ?? rect[FRAMES.boarder[0]], k = K();
    if (r) layer.push(r, x, y, r.w * k, r.h * k * (1 - p * .5), .5, r.anchor * k, opt(1 - p, null, item.facing < 0, .5 * (1 - p)));
    const puff = rect[pirateFrames.smoke[still() ? 0 : Math.min(2, Math.floor(p * 3))]];
    if (puff) layer.push(puff, x, y - .1, puff.w * .6, puff.h * .6, .5, puff.anchor * .6, opt(1 - p * p));
  }

  // A harpoon in flight: the barbed head turned along its path, a sagging rope from the tower to it, a shadow on the water.
  function drawHarpoon(ball) {
    const span = Math.max(.05, ball.to - ball.from), p = Math.min(1, Math.max(0, (simNow - ball.from) / span)), r = rect[HARPOON_ART.bolt];
    const lift = q => 1.3 + 1.4 * 4 * q * (1 - q);
    const at = projectGround(ball.x + (ball.toX - ball.x) * p, ball.z + (ball.toZ - ball.z) * p), {x} = at, y = at.y + lift(p);
    if (!still()) for (let k = 1; k <= 7; k++) {
      const q = p * k / 8, qx = ball.x + (ball.toX - ball.x) * q, qz = ball.z + (ball.toZ - ball.z) * q;
      layers.air.push(rect[WHITE], drawnX(qx, qz), drawnY(qz) + lift(q) - .35 * Math.sin(Math.PI * k / 8) * p, .2, .2, .5, .1, opt(.9, SPRAY));
    }
    if (r) {
      const direction = projectGroundVector(ball.toX - ball.x, ball.toZ - ball.z), dx = direction.x, dy = direction.y + 1.4 * 4 * (1 - 2 * p) * .35; // along the path, a little nose-up early and nose-down late
      layers.air.push(r, x, y, r.w, r.h, .5, r.anchor, opt(1, null, false, 0, Math.atan2(dy, dx || .001)));
    }
    if (!still()) layers.air.push(rect[WHITE], x, at.y - .05, .3, .1, .5, 0, tinted(DARK, .3));
  }

  // A culverin's shot (T43): a low, fast arc, the long ball turned along its path, a pale streak behind it.
  function drawCulverinBall(ball) {
    const span = Math.max(.05, ball.to - ball.from), p = Math.min(1, Math.max(0, (simNow - ball.from) / span)), r = rect[CULVERIN_ART.shot];
    const lift = q => 1.1 + .8 * 4 * q * (1 - q);
    const at = projectGround(ball.x + (ball.toX - ball.x) * p, ball.z + (ball.toZ - ball.z) * p), {x} = at, y = at.y + lift(p);
    if (!still() && p > .05) for (const back of [.05, .1, .16]) {
      const q = Math.max(0, p - back), tz = ball.z + (ball.toZ - ball.z) * q;
      layers.air.push(rect[WHITE], drawnX(ball.x + (ball.toX - ball.x) * q, tz), drawnY(tz) + lift(q), .22, .22, .5, .11, opt(.6 - back * 2.5, SHOT_TRAIL));
    }
    const direction = projectGroundVector(ball.toX - ball.x, ball.toZ - ball.z);
    if (r) layers.air.push(r, x, y, r.w, r.h, .5, r.anchor, opt(1, null, false, 0, Math.atan2(direction.y, direction.x || .001)));
    else layers.air.push(rect['pirate-cannonball'], x, y, rect['pirate-cannonball'].w, rect['pirate-cannonball'].h, .5, .55 * rect['pirate-cannonball'].h);
    if (!still()) layers.air.push(rect[WHITE], x, at.y - .05, .3, .1, .5, 0, tinted(DARK, .35));
  }

  // A swivel nest's pellet (D055): a tiny lead ball on a flat, quick line, a short bright streak behind it.
  function drawPellet(ball) {
    const span = Math.max(.05, ball.to - ball.from), p = Math.min(1, Math.max(0, (simNow - ball.from) / span)), r = rect[SWIVEL_ART.shot];
    const at = projectGround(ball.x + (ball.toX - ball.x) * p, ball.z + (ball.toZ - ball.z) * p), {x} = at, y = at.y + 1.2;
    if (!still() && p > .1) {
      const q = p - .1, tx = ball.x + (ball.toX - ball.x) * q, tz = ball.z + (ball.toZ - ball.z) * q;
      layers.air.push(rect[WHITE], drawnX(tx, tz), drawnY(tz) + 1.2, .16, .16, .5, .08, opt(.7, SPARK_TRAIL));
    }
    const direction = projectGroundVector(ball.toX - ball.x, ball.toZ - ball.z);
    if (r) layers.air.push(r, x, y, r.w, r.h, .5, r.anchor, opt(1, null, false, 0, Math.atan2(direction.y, direction.x || .001)));
    else layers.air.push(rect[WHITE], x, y, .2, .2, .5, .1, opt(1, SHOT));
  }

  function drawBall(ball) {
    if (ball.kind === 'harpoon') { drawHarpoon(ball); return; }
    if (ball.kind === 'swivel') { drawPellet(ball); return; }
    if (ball.kind === 'culverin') { drawCulverinBall(ball); return; }
    const span = Math.max(.05, ball.to - ball.from), p = Math.min(1, Math.max(0, (simNow - ball.from) / span));
    const dx = ball.toX - ball.x, dz = ball.toZ - ball.z;
    const ground = projectGround(ball.x + dx * p, ball.z + dz * p);
    const reduced = still(), lowArc = ball.enemy ? .8 : 1.2;
    const arc = 4 * Math.hypot(dx, dz) * (ball.enemy ? .03 : .07);
    const lift = reduced ? .8 : lowArc + arc * p * (1 - p);
    const y = ground.y + lift, look = ball.enemy ? CANNONBALL_LOOK.ship : CANNONBALL_LOOK.island;
    if (!reduced && p > 0) {
      const direction = projectGroundVector(dx, dz);
      // Sample the same lifted arc just behind the head. Cap the wake in display units on long shots.
      const speed = Math.hypot(direction.x, direction.y + arc * (1 - 2 * p));
      const step = Math.min(.07, .96 / Math.max(speed, 1));
      let frontX = ground.x, frontY = y, q = p;
      for (const segment of CANNONBALL_TAIL) {
        q = Math.max(0, q - step);
        const backX = ground.x - direction.x * (p - q);
        const backY = ground.y - direction.y * (p - q) + lowArc + arc * q * (1 - q);
        const trailX = frontX - backX, trailY = frontY - backY;
        const length = Math.min(1, Math.hypot(trailX, trailY));
        if (length > .02) {
          const angle = Math.atan2(trailY, trailX) - Math.PI / 2;
          layers.air.push(rect[WHITE], frontX, frontY, segment.width, length, .5, length,
            opt(segment.alpha, look.trail, false, 0, angle));
        }
        frontX = backX;
        frontY = backY;
      }
    }
    const r = rect['pirate-cannonball'];
    layers.air.push(r, ground.x, y, r.w * 1.1, r.h * 1.1, .5, .55 * r.h, opt(1, look.core, false, look.core.flashing));
    if (!reduced) layers.air.push(rect[WHITE], ground.x, ground.y - .05, .3, .1, .5, 0, tinted(DARK, .35));
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
      layers.air.push(rect[WHITE], drawnX(tx, tz), drawnY(tz) + tl, .3, .3, .5, .15, opt(.5 - back * 2, BOMB_TRAIL));
    }
    layers.air.push(r, drawnX(x, z), drawnY(z) + lift, r.w, r.h, .5, .55 * r.h, opt(1, r?.tint || null));
    if (!still()) layers.air.push(rect[WHITE], drawnX(x, z), drawnY(z) - .05, .45 * (.6 + p * .6), .14, .5, 0, tinted(DARK, .3 + p * .2));
    // Where it will land: a faint target mark, so the player sees the area coming.
    if (p > .35) layers.air.push(rect[WHITE], drawnX(shell.toX, shell.toZ), drawnY(shell.toZ), 2.4 * p, .1, .5, 0, tinted(RED, .35 * p));
  }
  // A fire bomb: a small dark ball on a low arc with a flickering flame and sparks, its landing ring in orange.
  function drawBomb(shell, p, x, z, distance) {
    const lift = still() ? 1 : 1 + (2 + distance * .12) * 4 * p * (1 - p), ball = rect['pirate-cannonball'];
    x = drawnX(x, z) + (shell.handX ?? 0) * (1 - p);
    const flame = rect[pirateFrames.fire[(still() ? 0 : Math.floor(clock * 10)) % 3]];
    if (ball) layers.air.push(ball, x, drawnY(z) + lift, ball.w * .8, ball.h * .8, .5, .55 * ball.h * .8, opt(1, FIRE_BALL));
    if (flame) layers.air.push(flame, x, drawnY(z) + lift + .25, flame.w * .45, flame.h * .45, .5, flame.anchor * .45, opt(.95));
    if (!still()) layers.air.push(rect[WHITE], x, drawnY(z) - .05, .35 * (.6 + p * .6), .12, .5, 0, tinted(DARK, .3 + p * .2));
    if (p > .25) layers.air.push(rect[WHITE], drawnX(shell.toX, shell.toZ), drawnY(shell.toZ), (shell.radius ?? 3) * 2 * p, .1, .5, 0, tinted(BOMB_BURST, .45 * p));
  }
  function drawBurst(burst) {
    const p = (clock - burst.at) / BURST_SECONDS, frame = EXPLOSION_FRAMES[Math.min(3, Math.floor(p * 4))], r = rect[frame];
    if (!r) return;
    const grow = 1.2, at = projectGround(burst.x, burst.z);
    layers.air.push(r, at.x, at.y, r.w * grow, r.h * grow, .5, r.anchor * grow, opt(1 - Math.max(0, p - .6) * 2, r?.tint || null));
    if (!burst.fire) return;
    // A fire bomb's flames: three tongues of the fire art around the blast, fading out.
    for (let i = 0; i < 3; i++) {
      const flame = rect[pirateFrames.fire[(i + (still() ? 0 : Math.floor(clock * 8))) % 3]];
      if (!flame) continue;
      const a = i / 3 * Math.PI * 2 + .5, spread = burst.radius * .45;
      const at = projectGround(burst.x + Math.cos(a) * spread, burst.z - Math.sin(a) * spread);
      layers.air.push(flame, at.x, at.y, flame.w * .7, flame.h * .7, .5, flame.anchor * .7, opt(1 - p));
    }
  }
  // Burning ground (a Fire pot, or the wider Inferno of tier 3, GAME-V3.md §5.1): flames from the fire art in a
  // ring as wide as the patch, flickering while it burns (still with reduced motion).
  function drawBurning(patch) {
    const count = Math.max(3, Math.round(patch.radius * 1.6)), tick = still() ? 0 : Math.floor(clock * 8);
    for (let i = 0; i < count; i++) {
      const flame = rect[pirateFrames.fire[(i + tick) % 3]];
      if (!flame) continue;
      const a = i / count * Math.PI * 2 + patch.x, spread = patch.radius * (i % 2 ? .45 : .8);
      const at = projectGround(patch.x + Math.cos(a) * spread, patch.z - Math.sin(a) * spread);
      layers.air.push(flame, at.x, at.y, flame.w * .6, flame.h * .6, .5, flame.anchor * .6, opt(.85));
    }
  }
  // The shot: the firing pose with its flash, a short tracer from the muzzle to the ship, a puff on the hit.
  // Where the shooter stands now: your captain, a teammate's presence figure, else where the shot was fired.
  // The muzzle (flash and tracer) follows the hand of the body that fires.
  function shooterAt(tracer) {
    if (tracer.by != null && captain && tracer.by === captain.id) return captain;
    const figure = tracer.by != null ? figures?.get?.(tracer.by) : null;
    return figure && Number.isFinite(figure.x) && Number.isFinite(figure.z) ? figure : tracer;
  }
  // The muzzle in the shooter's hand now (the pose art at the character's scale): flash, tracer, blooms, spray.
  function muzzleOf(item, dir) {
    const from = shooterAt(item), k = K(), at = projectGround(from.x, from.z);
    return { x: at.x + dir * MUSKET.muzzleX * k, y: at.y + MUSKET.muzzleY * k };
  }
  // The shot: the flash at the muzzle, a short tracer from the muzzle to the ship, a puff on the hit. No body:
  // the captain who fires is their own character or figure in its pose (src/pirates/poses.js), never a second one.
  function drawTracer(tracer) {
    if (tracer.line === false) return;
    const look = lookOf(tracer.weapon);
    const age = clock - tracer.at, dir = facingTo(tracer);
    const { x: mx, y: my } = muzzleOf(tracer, dir);
    const tx = drawnX(tracer.toX, tracer.toZ), ty = drawnY(tracer.toZ) + .7, dx = tx - mx, dy = ty - my, length = Math.hypot(dx, dy) || 1;
    const flash = rect['fx-musket-flash'];
    if (flash && age < MUSKET.fire && tracer.pose !== false) {
      layers.air.push(flash, mx + dir * .3, my, flash.w * look.flash, flash.h * look.flash, .5, flash.h * look.flash / 2, opt(age < MUSKET.fire * .6 ? 1 : .6, null, dir < 0));
    }
    const angle = Math.atan2(dy, dx) - Math.PI / 2;
    if (tracer.weapon === 'long_rifle' && age < tracer.flight + .18) {
      // The rifle: one thin, pale line from the muzzle through both ships, fading fast.
      const fade = Math.max(0, 1 - Math.max(0, age - tracer.flight) / .18);
      layers.air.push(rect[WHITE], mx, my, look.width * 2.6, length, .5, 0, opt(.25 * fade, look, false, 0, angle));
      layers.air.push(rect[WHITE], mx, my, look.width, length, .5, 0, opt(.95 * fade, look, false, 0, angle));
    } else if (age < tracer.flight) {
      // Reduced motion: the whole line for a moment instead of a moving streak.
      const p = still() ? 1 : age / tracer.flight, head = Math.min(1, p), tail = still() ? 0 : Math.max(0, head - look.length / length);
      const x0 = mx + dx * tail, y0 = my + dy * tail, span = (head - tail) * length;
      if (span > .05) layers.air.push(rect[WHITE], x0, y0, look.width, span, .5, 0, opt(.95, look, false, 0, angle));
    }
    if (age >= tracer.flight && age < tracer.flight + MUSKET.puff) {
      const p = (age - tracer.flight) / MUSKET.puff, puff = rect[pirateFrames.smoke[still() ? 0 : Math.min(2, Math.floor(p * 3))]];
      if (puff) layers.air.push(puff, tx, ty - .3, puff.w * look.puff, puff.h * look.puff, .5, puff.anchor * look.puff, opt(1 - p * p));
    }
  }
  // The cutlass sweep: a bright arc that runs once round the captain (in the swing's direction) and fades, on the
  // ground ellipse at the swing's radius, so melee reads as "everyone in this circle", never as a shot.
  function drawSweep(item) {
    const p = Math.max(0, Math.min(1, (clock - item.at) / SWEEP_SECONDS)), r = item.radius;
    const head = still() ? Math.PI * 2 : Math.min(1, p / .6) * Math.PI * 2, fade = still() ? .8 : 1 - Math.max(0, p - .5) * 1.6, k = K();
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      if (a > head) break;
      const lit = 1 - Math.min(1, (head - a) / (Math.PI * 1.5)), angle = item.dir * a - Math.PI / 2, size = (.4 + lit * .3) * k;
      const {x, y: groundY} = projectGround(item.x + Math.cos(angle) * r, item.z - Math.sin(angle) * r), y = groundY + .3;
      layers.air.push(rect[WHITE], x, y, size + .12 * k, size + .12 * k, .5, (size + .12 * k) / 2, tinted(DARK, .5 * fade));
      layers.air.push(rect[WHITE], x, y, size, size, .5, size / 2, opt((.45 + lit * .55) * fade, STAR));
    }
  }
  function drawCaptain() {
    // The reload ring around your own captain: 12 brass dots fill up until the musket is ready again.
    if (!captain || captain.share >= 1) return;
    const {x: cx, y: cy} = projectGround(captain.x, captain.z);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 - Math.PI / 2, lit = i / 12 < captain.share;
      layers.air.push(rect[WHITE], cx + Math.cos(a) * .95, cy + .9 + Math.sin(a) * .95, .19, .19, .5, .09, lit ? tinted(BRASS, 1) : tinted(DARK, .55));
    }
  }
  // Captain health: a captain's hp bar (over the head, drawn units above where they stand), a fallen
  // captain in their colour with the red ring, and your revive's gold dots filling around them.
  // lift: drawn units above the ground (a captain's head; a tower's bar sits higher).
  function drawHealthBar(x, z, hp, maxHp, lift = 2.05) {
    x = drawnX(x, z);
    const share = Math.max(0, Math.min(1, hp / (maxHp || 1))), w = 1.3, top = drawnY(z) + lift * K();
    layers.air.push(rect[WHITE], x - w / 2 - .0625, top - .0625, w + .125, .3125, 0, 0, tinted(DARK, .8));
    layers.air.push(rect[WHITE], x - w / 2, top, w * share, .1875, 0, 0, opt(1, share > .5 ? GREEN : share > .25 ? GOLD : RED));
  }
  function drawRecoveryHealthBar({hp, maxHp}, position, kind) {
    if (!position) return;
    const {z} = position, x = drawnX(position.x, z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(hp) || !(maxHp > 0) || hp >= maxHp) return;
    const { width, height, units, fillInset, fillHeight } = RECOVERY_BADGE;
    const destroyed = hp <= 0, badge = rect[destroyed ? RUIN_BADGE : HEALTH_BADGE];
    const center = drawnY(z) + recoveryBadgeLift(kind), left = x - width / (2 * units), bottom = center - height / (2 * units);
    layers.air.push(badge ?? rect[WHITE], x, center, width / units, height / units, .5, height / (2 * units),
      badge ? undefined : opt(1, DARK));
    if (destroyed && !badge) {
      layers.air.push(rect[WHITE], left + 26 / units, bottom + 5 / units, 2 / units, 3 / units, 0, 0, opt(1, RECOVERY_TINT.light));
      layers.air.push(rect[WHITE], left + 26 / units, bottom + 2 / units, 2 / units, 2 / units, 0, 0, opt(1, RECOVERY_TINT.light));
    }
    if (destroyed) return;
    const share = hp / maxHp;
    layers.air.push(rect[WHITE], left + fillInset / units, bottom + fillInset / units,
      recoveryBadgeFill(share) / units, fillHeight / units, 0, 0, opt(1, RECOVERY_TINT[recoveryBadgeTone(share)]));
  }
  function drawDown(hero, x, z, reviving) {
    x = drawnX(x, z);
    const y = drawnY(z), pulse = still() ? .8 : .55 + .35 * Math.abs(Math.sin(clock * 3)), k = K();
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2 - Math.PI / 2, lit = reviving !== null && i / 20 < reviving;
      const offset = projectLegacyGround(Math.cos(a) * 1.9 * k, Math.sin(a) * .8 * k), dx = x + offset.x, dy = y + .15 + offset.y;
      layers.air.push(rect[WHITE], dx, dy, .44, .44, .5, .22, tinted(DARK, .55));
      layers.air.push(rect[WHITE], dx, dy, .3, .3, .5, .15, lit ? tinted(BRASS, 1) : tinted(RED, pulse));
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
  function drawJamShot(item) {
    const age = clock - item.at, flash = rect['fx-gunboat-flash'];
    if (flash && age < .22) {
      const grow = still() ? 1 : .8 + Math.min(.4, age * 3);
      layers.air.push(flash, item.x + item.facing * flash.w * .42 * grow, item.y, flash.w * grow, flash.h * grow, .5, flash.h * grow / 2, opt(age < .12 ? 1 : .6, null, item.facing < 0));
    }
    if (age < .28) {
      const dx = item.toX - item.x, dy = item.toY - item.y, length = Math.hypot(dx, dy) || 1, angle = Math.atan2(dy, dx) - Math.PI / 2, fade = still() ? 1 : 1 - age / .28;
      layers.air.push(rect[WHITE], item.x, item.y, .2, length, .5, 0, opt(.35 * fade, GOLD, false, 0, angle));
      layers.air.push(rect[WHITE], item.x, item.y, .07, length, .5, 0, opt(.9 * fade, TRACER, false, 0, angle));
    }
  }

  function land(ball) {
    if (ball.enemy) {
      const x = drawnX(ball.toX, ball.toZ), y = drawnY(ball.toZ) + .6;
      if (ball.wallId) wallFlash.set(ball.wallId, clock + FLASH_SECONDS);
      // T50: a ball on the heart bursts red, like a boarder's blow there, a little bigger.
      if (ball.dust === 'heart') effects()?.bloom(x, y + .2, { radius: 2.4, life: .5, colour: '#d8553f' });
      spark(x, y, { count: 10, speed: [.6, 2.4], angle: Math.PI / 2, spread: 2.2, gravity: 5, life: [.4, .8], colour: ball.dust === 'wall' ? '#b8b2a0' : ball.dust === 'heart' ? '#e0705a' : '#d8c590', size: [1, 2] });
      effects()?.bloom(x, y, { radius: .9, life: .25, colour: '#ffb35a' });
      return;
    }
    if (!ball.hit) splashes.add(item => Object.assign(item, { x: ball.toX, z: ball.toZ, at: clock, big: false }));
  }
  return { shipMeta, boarderMeta, militiaMeta, shooterAt, muzzleOf, drawShip, drawBoarder, drawMilitia, drawFallen,
    drawBall, drawShell, drawBurst, drawBurning, drawTracer, drawJamShot, drawSweep, drawCaptain, drawParty,
    drawRecoveryHealthBar, drawHealthBar, land, sync };
}
