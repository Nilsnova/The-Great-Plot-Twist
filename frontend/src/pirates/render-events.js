// The wave renderer's reaction to the wave's events (render.js): each sim event starts its shot, flash, sparks or
// pooled effect. A closure over the renderer's pools, passed in by render.js, and the drawing part (render-draw.js).
import { projectGround, projectGroundVector } from '../world/projection.js';
import { facingTo, FIRE_SECONDS, FLASH_SECONDS, SHIP_SIZE, SHIP_VARIANTS, SINK_SECONDS, GUN_LOOKS, lookOf, MUSKET,
  STRIKE_SECONDS } from './render-sprites.js';

// The arguments in this order (render.js passes them so; positional, so the minifier shortens them).
export function createEvents(parts, posts, ships, crew, guards, fire, wallFlash, balls, sinkers, wrecks, splashes,
  shells, bursts, tracers, jamShots, warnings, fallen, strikes, K, still, low, effects, spark) {
  const { shipMeta, shooterAt, muzzleOf, boarderMeta, boarderArrived, militiaMeta } = parts;
  // The renderer's clock and latest state as update() last set them (render.js calls sync() right after, every frame).
  let clock = 0, simNow = 0, latest = null;
  function sync(now, simTime, state) { clock = now; simNow = simTime; latest = state; }
  function onEvent(event) {
    const {x, y} = projectGround(event.x, event.z ?? 0);
    // v3 waves: the siege barge's shells fly like a mortar's; a fire ship bursts like a fire bomb.
    if (event.type === 'barge_fired') { onEvent({ ...event, type: 'mortar_fired', towerId: event.shipId }); return; }
    if (event.type === 'barge_impact') { onEvent({ ...event, type: 'mortar_impact' }); return; }
    if (event.type === 'fireship_burst') { onEvent({ ...event, type: 'captain_blast' }); return; }
    switch (event.type) {
      case 'ship_spawned': shipMeta(event.shipId, event.kind, event.x, event.z, event.toX, event.toZ); break;
      case 'cannon_fired': {
        balls.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt,
          hit: event.hit, enemy: false, splashed: false, manual: event.manual, kind: 'cannon' }));
        const flip = facingTo(event) < 0;
        fire.set(event.cannonId, { until: clock + FIRE_SECONDS, flip });
        const post = posts.find(item => item.id === event.cannonId); if (post) post.flip = flip;
        const mx = x + (flip ? -1.3 : 1.3), my = y + .9;
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
        const meta = ships.get(event.shipId) ?? shipMeta(event.shipId, event.kind, event.x, event.z);
        if (!SHIP_VARIANTS[event.kind]?.hidden) sinkers.add(item => Object.assign(item, { kind: SHIP_VARIANTS[event.kind]?.frames ?? event.kind, x: event.x, z: event.z, facing: meta.facing, at: clock })); // v3 waves: a variant sinks as its own hull
        wrecks.add(item => Object.assign(item, { x: event.x, z: event.z, facing: meta.facing, at: clock + SINK_SECONDS * .6, big: event.kind !== 'sloop' }));
        ships.delete(event.shipId);
        splashes.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, big: true }));
        effects()?.ring(x, y, { radius: event.kind === 'flagship' ? 6 : 3, life: .9, colour: '#d8f0e6' });
        spark(x, y + .6, { count: event.kind === 'flagship' ? 70 : 26, speed: [1, 4.5], angle: Math.PI / 2, spread: 2, gravity: 6, life: [.6, 1.4], colour: '#cfe9e2' });
        break;
      }
      case 'tower_damaged': // T33: a boarder's blow at a tower: the post flashes and a little dust flies
        wallFlash.set(event.towerId, clock + FLASH_SECONDS);
        spark(x, y + .7, { count: 6, speed: [.5, 1.8], angle: Math.PI / 2, spread: 2, gravity: 5, life: [.3, .6], colour: '#b8b2a0', size: [1, 2] });
        break;
      case 'tower_broken': // T33: once per break (the sim sends it once), a puff of smoke
        effects()?.bloom(x, y + 1, { radius: 2.2, life: .6, colour: '#8c8a92' });
        break;
      case 'ship_fired': {
        // T50 (the wave rule ship_fire): the ship's ball flies from its hull to the wall, tower or heart it aims at, on
        // the sim's own flight (its impactAt); the impact's dust, flash or red burst comes when it lands (land()).
        balls.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt,
          hit: true, enemy: true, splashed: false, kind: 'cannon', dust: event.target === 'heart' ? 'heart' : 'wall', wallId: event.targetId ?? null }));
        const meta = ships.get(event.shipId), size = SHIP_SIZE[event.kind] ?? SHIP_SIZE.sloop;
        effects()?.bloom(x + (meta?.facing ?? 1) * size.w * .25, y + size.h * .4, { radius: .8, life: .3, colour: '#ffcf6a' });
        break;
      }
      case 'wall_damaged': case 'island_damaged': {
        // The pirates' shot: a short flat arc from the ship to what it hit (drawn only). T50: a landed ball (ship_fired) flew already.
        if (event.landed) break;
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
          hit: true, enemy: true, splashed: false, kind: 'cannon', dust: event.type === 'wall_damaged' ? 'wall' : 'shore', wallId: event.wallId }));
        else if (event.type === 'wall_damaged') wallFlash.set(event.wallId, clock + FLASH_SECONDS);
        break;
      }
      case 'wall_repaired': effects()?.bloom(x, y + 1, { radius: 1.4, life: .6, colour: '#bfe6a8' }); break;
      case 'harpoon_thrown': {
        // The harpoon tower (GAME-V3.md §5): a flat, quick flight of the harpoon with its rope behind it.
        balls.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt,
          hit: true, enemy: false, splashed: false, manual: false, kind: 'harpoon' }));
        const flip = facingTo(event) < 0;
        fire.set(event.towerId, { until: clock + FIRE_SECONDS * 1.3, flip });
        const post = posts.find(item => item.id === event.towerId); if (post) post.flip = flip;
        effects()?.bloom(x + (flip ? -1.4 : 1.4), y + 1.4, { radius: .8, life: .3, colour: '#f4ecd6' });
        break;
      }
      case 'culverin_fired': {
        // The culverin (T43): a fast, flat, heavy shot from the long barrel, a long muzzle flash and a ring of smoke.
        balls.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt,
          hit: true, enemy: false, splashed: false, manual: false, kind: 'culverin' }));
        const flip = facingTo(event) < 0;
        fire.set(event.towerId, { until: clock + FIRE_SECONDS * 1.4, flip });
        const post = posts.find(item => item.id === event.towerId); if (post) post.flip = flip;
        const mx = x + (flip ? -1.8 : 1.8), my = y + 1.1;
        if (!low() && !still()) spark(mx, my, { count: 12, speed: [.4, 1.4], angle: Math.PI / 2, spread: 1.8, gravity: -.8, life: [.6, 1.2], colour: '#d9d6c8', size: [1, 2] });
        effects()?.bloom(mx, my, { radius: 1.4, life: .45, colour: '#ffcf6a' });
        effects()?.ring(mx, my, { radius: 1.6, life: .6, colour: '#e8e4d8' });
        break;
      }
      case 'swivel_fired': {
        // The swivel-gun nest (D055): a quick spray of pellets at the boarders (one streak per pellet), a small fan of flashes.
        const flip = facingTo(event) < 0, n = Math.max(1, Math.min(6, event.pellets ?? 3)), d = Math.hypot(event.toX - event.x, event.toZ - event.z);
        for (let k = 0; k < n; k++) {
          const side = (k - (n - 1) / 2) * .45;
          balls.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX + side * .6, toZ: event.toZ + side, from: event.t, to: event.t + Math.max(.08, d / 40),
            hit: true, enemy: false, splashed: false, manual: false, kind: 'swivel' }));
        }
        fire.set(event.towerId, { until: clock + FIRE_SECONDS * .8, flip });
        const post = posts.find(item => item.id === event.towerId); if (post) post.flip = flip;
        effects()?.bloom(x + (flip ? -1.3 : 1.3), y + 1.2, { radius: .7, life: .2, colour: '#ffd98a' });
        break;
      }
      case 'ship_slowed': {
        // A harpoon caught the ship (Chain shot slows too, with no rope): a ring on the water and a few drops.
        const meta = ships.get(event.shipId), ship = latest?.ships?.find(item => item.id === event.shipId);
        if (!ship) break;
        if (meta) meta.caughtAt = clock;
        const at = projectGround(ship.x, ship.z);
        effects()?.ring(at.x, at.y + .1, { radius: 2.2, life: .5, colour: '#bfeaf6' });
        spark(at.x, at.y + .8, { count: 8, speed: [.6, 2], angle: Math.PI / 2, spread: 2, gravity: 6, life: [.3, .7], colour: '#dff6ff', size: [1, 2] });
        break;
      }
      case 'mortar_fired': {
        shells.add(item => Object.assign(item, { x: event.x, z: event.z, toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt, bomb: false, radius: event.radius ?? 4 }));
        fire.set(event.towerId, { until: clock + FIRE_SECONDS * 1.6, flip: facingTo(event) < 0 });
        const post = posts.find(item => item.id === event.towerId); if (post) post.flip = facingTo(event) < 0;
        effects()?.bloom(x, y + 1.2, { radius: 1.4, life: .45, colour: '#ffcf6a' });
        spark(x, y + 1.3, { count: 14, speed: [.4, 1.4], angle: Math.PI / 2, spread: 1.2, gravity: -1, life: [.7, 1.3], colour: '#cfcabb', size: [1, 3] });
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
        const dir = facingTo(event);
        if (weapon === 'fire_bombs') {
          // A bomb on a low arc, then its burst (captain_blast); the pose throws it.
          const from = shooterAt(event);
          shells.add(item => Object.assign(item, { x: from.x, z: from.z, handX: dir * .6 * K(), toX: event.toX, toZ: event.toZ, from: event.t, to: event.impactAt, bomb: true, radius: event.radius ?? 3 }));
          tracers.add(item => Object.assign(item, { x: event.x, z: event.z, by: event.by ?? null, toX: event.toX, toZ: event.toZ, at: clock, flight: 0, weapon, pose: true, line: false }));
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
        shots.forEach((shot, index) => tracers.add(item => Object.assign(item, { x: event.x, z: event.z, by: event.by ?? null, toX: shot.toX, toZ: shot.toZ, at: clock,
          flight: flightTo(shot.impactAt), weapon, pose: index === 0, line: true })));
        const hand = muzzleOf(event, dir);
        effects()?.bloom(hand.x, hand.y, { radius: .8 * look.flash, life: MUSKET.fire, colour: weapon === 'long_rifle' ? '#e6f6ff' : '#fff0b0' });
        if (weapon === 'blunderbuss' && !low() && !still()) {
          // The cone puff: grey smoke rolling out of the wide muzzle.
          const heading = Number.isFinite(event.heading) ? event.heading : Math.atan2(event.toZ - event.z, event.toX - event.x);
          const direction = projectGroundVector(Math.cos(heading), Math.sin(heading)), angle = Math.atan2(direction.y, direction.x);
          spark(hand.x, hand.y, { count: 18, speed: [1.2, 3.2], angle, spread: (event.cone ?? 50) * Math.PI / 180,
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
      // The gunboat (GAME-V3.md §4.1): a flash at its deck gun and a thin line to the tower it jams; the tower
      // gets sparks and a ring, and its "jammed" mark follows the sim's state (drawn with the posts).
      case 'gunboat_fired': {
        const facing = facingTo(event), boat = ships.get(event.shipId), to = projectGround(event.toX, event.toZ);
        if (boat) boat.facing = facing; // it swings its gun round to the tower it jams
        jamShots.add(item => Object.assign(item, { x: x + facing * 1.25, y: y + 1.3, toX: to.x, toY: to.y + 1, at: clock, facing }));
        if (!low() && !still()) spark(x + facing * 1.9, y + 1.4, { count: 7, speed: [.3, 1.2], angle: Math.PI / 2, spread: 1.6, gravity: -.8, life: [.5, 1], colour: '#d9d6c8', size: [1, 2] });
        break;
      }
      case 'tower_jammed': {
        const ty = y + 1.2;
        effects()?.ring(x, ty, { radius: 1.8, life: .45, colour: '#ffe27a' });
        spark(x, ty, { count: 14, speed: [1, 3.4], angle: Math.PI / 2, spread: 2.6, gravity: 6, life: [.35, .8], colour: '#ffd35a', size: [1, 2] });
        break;
      }
      case 'ship_warning': warnings.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, boss: event.boss })); break;
      case 'boarder_landed': {
        splashes.add(item => Object.assign(item, { x: event.x, z: event.z, at: clock, big: false }));
        boarderArrived(event.boarderId);
        break;
      }
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
        // The sweep (melee, 15 Nov): a white blade arc swings once round the captain at the swing's radius, every
        // boarder inside is hit. Unlike the musket's gold tracer (ranged) it is a circle on the ground at your feet.
        // The body that swings it is the captain's own (src/pirates/poses.js).
        const dir = facingTo(event), from = shooterAt(event), radius = Number.isFinite(event.radius) ? event.radius : 2.2, at = projectGround(from.x, from.z);
        strikes.add(item => Object.assign(item, { x: from.x, z: from.z, dir, at: clock, radius }));
        effects()?.ring(at.x, at.y + .3, { radius, life: .3, colour: '#f4f8ff' });
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
      // The Tech hub's mortar skills (GAME-V3.md §5, §5.1): a Fire pot or Inferno lights the ground (Inferno wider
      // and redder); Shockwave throws a boarder back with a pale ring where it lands.
      case 'fire_lit': {
        const radius = event.radius ?? 3, hot = event.inferno === true;
        effects()?.ring(x, y, { radius, life: .9, colour: hot ? '#ff5a2a' : '#ff9a3a' });
        effects()?.bloom(x, y + .4, { radius: radius * .7, life: .8, colour: hot ? '#ff4a1a' : '#ff8a3a' });
        spark(x, y + .3, { count: hot ? 34 : 18, speed: [.6, 2.4], angle: Math.PI / 2, spread: 1.6, gravity: -2, life: [.6, 1.4], colour: hot ? '#ff6a2a' : '#ffb35a', size: [1, 3] });
        break;
      }
      case 'boarder_pushed': {
        effects()?.ring(x, y + .3, { radius: 1.4, life: .4, colour: '#e8f4ff' });
        spark(x, y + .5, { count: 8, speed: [1, 3], angle: Math.PI / 2, spread: 2.6, gravity: 6, life: [.3, .6], colour: '#d9d6c8', size: [1, 2] });
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
  return { onEvent, sync };
}
