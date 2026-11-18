// The wave's guns (sim.js): damage to ships, boarders, walls and the heart, the gunboat's jam, the towers' aim
// (aimTower) and shots (cannon, mortar, harpoon, culverin, swivel nest), and, each tick, the balls, shells and
// fires that land (landShots) and the towers that reload and fire (fireTowers). A closure over `sim` (sim-setup.js).

import { round2, distance } from './sim-read.js';
import { DEFENSES_V2 } from './defenses-v2.js';

export function createWeapons(sim) {
  const { C, random, heart, happening, finisher, fogShare, towers, towerHealth, jammed, ships, wrecks, balls, shells,
    boarders, fires, now, statsOf, end } = sim;
  function damageShip(ship, amount, by, events, extra = {}) {
    let damage = amount;
    if (ship.kind === 'flagship' && extra.source !== 'lamps') damage *= sim.lampsLit ? C.flagship.exposed : C.flagship.armor;
    damage = Math.min(ship.hp, round2(damage));
    ship.hp = round2(ship.hp - damage);
    // v3 waves: a boss below a quarter of its hull is held at 1 hp for its finisher (finisher/rules.js).
    if (finisher.watch(ship) || finisher.holds(ship)) { const before = ship.hp + damage; ship.hp = Math.max(1, ship.hp); damage = round2(before - ship.hp); }
    events.push({ type: 'ship_hit', t: now(), shipId: ship.id, kind: ship.kind, by, damage, hp: ship.hp,
      x: round2(ship.x), z: round2(ship.z), blocked: damage === 0, ...extra });
    if (ship.hp > 0) return;
    ships.splice(ships.indexOf(ship), 1); sim.sunk++;
    wrecks.push({ id: ship.id, kind: ship.kind, x: round2(ship.x), z: round2(ship.z), t: now() });
    events.push({ type: 'ship_sunk', t: now(), shipId: ship.id, kind: ship.kind, by, boss: ship.boss, x: round2(ship.x), z: round2(ship.z),
      ...(ship.crew > 0 ? { crewLost: ship.crew } : {}), ...(extra.finisher ? { finisher: true } : {}) });
    happening.onSunk(ship, events);
  }
  // A gunboat at anchor: every `interval` it jams the nearest tower in range that is not jammed yet (else the
  // nearest one, which only starts its jam again). Towers have no hp, so nothing is damaged.
  function gunboatFire(ship, t, events) {
    if ((ship.attackIn -= C.tick) > 1e-9) return;
    ship.attackIn += statsOf(ship.kind).interval;
    const G = C.gunboat;
    let free = null, freeD = Infinity, any = null, anyD = Infinity;
    for (const tower of towers) {
      if (!towerHealth.canFire(tower)) continue; // T33: a broken tower is not worth jamming
      const d = distance(tower.x, tower.z, ship.x, ship.z);
      if (d > G.range + 1e-9) continue;
      if (d < anyD) { any = tower; anyD = d; }
      if (!jammed(tower, t) && d < freeD) { free = tower; freeD = d; }
    }
    const target = free ?? any;
    if (!target) return;
    target.jammedUntil = round2(t + G.jam);
    events.push({ type: 'gunboat_fired', t: now(), shipId: ship.id, targetId: target.id, x: round2(ship.x), z: round2(ship.z), toX: target.x, toZ: target.z });
    events.push({ type: 'tower_jammed', t: now(), towerId: target.id, shipId: ship.id, until: target.jammedUntil, x: target.x, z: target.z });
  }
  function damageBoarder(boarder, amount, by, events, extra = {}) {
    const damage = Math.min(boarder.hp, round2(amount));
    boarder.hp = round2(boarder.hp - damage);
    events.push({ type: 'boarder_hit', t: now(), boarderId: boarder.id, by, damage, hp: boarder.hp, x: round2(boarder.x), z: round2(boarder.z), ...extra });
    if (boarder.hp > 0) return;
    boarders.splice(boarders.indexOf(boarder), 1); sim.killed++;
    events.push({ type: 'boarder_killed', t: now(), boarderId: boarder.id, by, x: round2(boarder.x), z: round2(boarder.z), ...extra });
  }
  // v3 waves: what the wave's event and the finisher may do to the battle (wave-events.js, finisher/rules.js).
  function hitWall(wall, amount, events, extra = {}) {
    const damage = Math.min(wall.hp, round2(amount));
    wall.hp = round2(Math.max(0, wall.hp - damage));
    if (wall.hp === 0) { wall.repairLeft = 0; wall.rebuilding = 0; }
    events.push({ type: 'wall_damaged', t: now(), wallId: wall.id, damage, hp: wall.hp, broken: wall.hp === 0, x: wall.x, z: wall.z, ...extra });
  }
  function hurtIsland(amount, events, extra = {}) {
    const damage = Math.min(sim.islandHp, round2(amount));
    sim.islandHp = round2(sim.islandHp - damage);
    events.push({ type: 'island_damaged', t: now(), damage, hp: sim.islandHp, x: heart.x, z: heart.z, ...extra });
    if (sim.islandHp <= 0) end('island_lost', events);
  }
  const damageTarget = (target, amount, by, events, extra) => (target.boarder
    ? damageBoarder(target, amount, by, events, extra) : damageShip(target, amount, by, events, extra));
  const findTarget = id => (typeof id !== 'string' ? undefined
    : id.startsWith('boarder_') ? boarders.find(item => item.id === id) : ships.find(item => item.id === id));

  // Where a ship or a boarder will be after `seconds`: along its course, stopping at its anchor or wall.
  const ahead = (target, seconds) => {
    if (target.boarder) return target.state === 'walking'
      ? { x: target.x + target.vx * seconds, z: target.z + target.vz * seconds } : { x: target.x, z: target.z };
    const lead = target.state === 'sailing' ? Math.min(target.speed * seconds, target.left) : 0;
    return { x: target.x + target.dx * lead, z: target.z + target.dz * lead };
  };
  const targetKey = target => (target.boarder ? { boarderId: target.id } : { shipId: target.id });

  function fire(cannon, target, manual, events) {
    const flight = distance(cannon.x, cannon.z, target.x, target.z) / C.cannon.ballSpeed;
    const aim = ahead(target, flight);
    let toX = aim.x, toZ = aim.z;
    const hit = manual || random() < (target.boarder ? cannon.skill?.accuracy ?? C.cannon.boarderAccuracy : C.cannon.accuracy) * happening.aim(target);
    if (!hit) { const a = random() * Math.PI * 2, r = 1 + random() * (C.cannon.missSpread - 1); toX += Math.cos(a) * r; toZ += Math.sin(a) * r; }
    const blown = !hit && happening.drift(1); // v3 waves: the storm's wind carries a miss away
    if (blown) { toX += blown.x; toZ += blown.z; }
    const damage = cannon.damage * (manual ? C.cannon.manualMultiplier : 1);
    const impactAt = round2(sim.ticks * C.tick + flight);
    const ball = { cannonId: cannon.id, targetId: target.id, ...targetKey(target), hit, damage, manual, impactAt,
      ...(cannon.spec === 'chain' && !target.boarder ? { chain: cannon.skill } : {}),
      ...(cannon.spec === 'grapeshot' && target.boarder ? { grape: cannon.skill } : {}) };
    // Broadside (tier 3): every n-th shot is two balls (the second one rides the same aim, no extra dice).
    const volley = cannon.spec === 'broadside' && (cannon.shots + 1) % cannon.skill.every === 0 ? 2 : 1;
    for (let k = 0; k < volley; k++) balls.push({ ...ball });
    cannon.reload = cannon.baseReload; cannon.lastShot = sim.ticks * C.tick; cannon.shots++;
    for (let k = 0; k < volley; k++) {
      events.push({ type: 'cannon_fired', t: now(), cannonId: cannon.id, targetId: target.id, manual, hit, damage, level: cannon.level,
        x: cannon.x, z: cannon.z + k * .8, toX: round2(toX), toZ: round2(toZ + k * .8), impactAt, ...(target.boarder ? { boarder: true } : {}),
        ...(volley > 1 ? { broadside: true } : {}) });
    }
  }

  function lob(mortar, target, events) {
    const d = distance(mortar.x, mortar.z, target.x, target.z), flight = round2(C.mortar.flight + d * C.mortar.flightPerUnit);
    const aim = ahead(target, flight), a = random() * Math.PI * 2, r = random() * (C.mortar.scatter + happening.scatter());
    const blown = happening.drift(.5) ?? { x: 0, z: 0 }; // v3 waves: the storm pushes the shells downwind
    const toX = round2(aim.x + Math.cos(a) * r + blown.x), toZ = round2(aim.z + Math.sin(a) * r + blown.z), impactAt = round2(sim.ticks * C.tick + flight);
    const radius = mortar.radius ?? C.mortar.radius;
    shells.push({ towerId: mortar.id, x: mortar.x, z: mortar.z, toX, toZ, damage: mortar.damage, impactAt, from: now(),
      ...(radius !== C.mortar.radius ? { radius } : {}),
      ...(['cluster', 'fire_pot', 'shockwave', 'inferno'].includes(mortar.spec) ? { spec: mortar.spec, skill: mortar.skill } : {}) });
    mortar.reload = mortar.baseReload; mortar.lastShot = sim.ticks * C.tick; mortar.shots++;
    events.push({ type: 'mortar_fired', t: now(), towerId: mortar.id, targetId: target.id, damage: mortar.damage, level: mortar.level,
      x: mortar.x, z: mortar.z, toX, toZ, impactAt, radius });
  }

  const roped = ship => balls.some(ball => ball.harpoon && ball.targetId === ship.id); // a harpoon is already on its way
  const slowedUntil = ship => ship.slowUntil ?? -Infinity;
  // The harpoon tower throws (T1): always a hit (a rope, no dice, so the random stream is untouched), a quick flat flight.
  function throwHarpoon(tower, target, events) {
    const flight = distance(tower.x, tower.z, target.x, target.z) / C.harpoon.speed, aim = ahead(target, flight);
    const impactAt = round2(sim.ticks * C.tick + flight);
    balls.push({ cannonId: tower.id, targetId: target.id, ...targetKey(target), hit: true, damage: tower.damage, manual: false, impactAt, harpoon: tower.slow });
    tower.reload = tower.baseReload; tower.lastShot = sim.ticks * C.tick; tower.shots++;
    events.push({ type: 'harpoon_thrown', t: now(), towerId: tower.id, targetId: target.id, damage: tower.damage, level: tower.level,
      x: tower.x, z: tower.z, toX: round2(aim.x), toZ: round2(aim.z), impactAt });
  }
  // The culverin fires (T43): like the harpoon, always a hit (no dice, so the random stream is untouched), a fast flat
  // flight aimed ahead of the ship. The ball lands through the same impact code as a cannon's (ship_hit, ship_sunk).
  function fireCulverin(tower, target, events) {
    const flight = distance(tower.x, tower.z, target.x, target.z) / C.culverin.shotSpeed, aim = ahead(target, flight);
    const impactAt = round2(sim.ticks * C.tick + flight);
    balls.push({ cannonId: tower.id, targetId: target.id, ...targetKey(target), hit: true, damage: tower.damage, manual: false, impactAt, culverin: true });
    tower.reload = tower.baseReload; tower.lastShot = sim.ticks * C.tick; tower.shots++;
    events.push({ type: 'culverin_fired', t: now(), towerId: tower.id, targetId: target.id, damage: tower.damage, level: tower.level,
      x: tower.x, z: tower.z, toX: round2(aim.x), toZ: round2(aim.z), impactAt });
  }
  // The swivel nest fires (D055): `pellets` pellets that always hit (no dice, so the random stream is untouched): one at
  // the target, one at each boarder round it (nearest first, within CONFIG.swivel.spread), the rest at the target again.
  // Each pellet is a fast ball that lands through the impact code of the cannon's (boarder_hit, boarder_killed).
  function fireSwivel(tower, target, events) {
    const near = boarders.filter(item => item !== target && distance(item.x, item.z, target.x, target.z) <= C.swivel.spread)
      .sort((p, q) => distance(p.x, p.z, target.x, target.z) - distance(q.x, q.z, target.x, target.z) || (p.id < q.id ? -1 : 1));
    const hits = [target, ...near.slice(0, tower.pellets - 1)];
    while (hits.length < tower.pellets) hits.push(target);
    for (const item of hits) {
      const impactAt = round2(sim.ticks * C.tick + distance(tower.x, tower.z, item.x, item.z) / C.swivel.shotSpeed);
      balls.push({ cannonId: tower.id, targetId: item.id, ...targetKey(item), hit: true, damage: tower.damage, manual: false, impactAt, swivel: true });
    }
    tower.reload = tower.baseReload; tower.lastShot = sim.ticks * C.tick; tower.shots++;
    events.push({ type: 'swivel_fired', t: now(), towerId: tower.id, targetId: target.id, damage: tower.damage, pellets: tower.pellets, level: tower.level,
      x: tower.x, z: tower.z, toX: round2(target.x), toZ: round2(target.z), hits: [...new Set(hits.map(item => item.id))] });
  }
  const pending = target => balls.reduce((sum, ball) => sum + (ball.targetId === target.id && ball.hit ? ball.damage : 0), 0);
  // v3 waves: at night a lit target (near the heart, a fire, or burning) is seen at the full range.
  const sees = (tower, target, d) => d <= tower.sight || (happening.lit(target, fires) && d <= tower.range * fogShare);
  const visible = (cannon, target) => sees(cannon, target, distance(cannon.x, cannon.z, target.x, target.z));
  const armoured = ship => ship.kind === 'flagship' && !sim.lampsLit && ships.length > 1; // escorts first while armoured
  const shoreOrder = (a, b) => (a.state === 'attacking') !== (b.state === 'attacking') ? (a.state === 'attacking' ? -1 : 1) : a.left - b.left;
  const toHeart = item => distance(item.x, item.z, heart.x, heart.z);

  function aimTower(tower) {
    let target = null, best = Infinity;
    if (tower.kind === 'mortar') {
      // The shell goes where most pirates are (within its radius), the gunner's to the threat nearest the
      // heart (a boarder before any ship), then to the ship nearest the shore.
      const all = [...boarders, ...ships];
      for (const item of all) {
        const d = distance(tower.x, tower.z, item.x, item.z);
        if (!sees(tower, item, d) || d < C.mortar.minRange || (!item.boarder && armoured(item))) continue;
        let score = 0;
        for (const other of all) if (distance(other.x, other.z, item.x, item.z) <= C.mortar.radius) score++;
        const rank = tower.manned
          ? (item.boarder ? -2e4 + toHeart(item) : (item.state === 'attacking' ? 0 : 1) * 1e4 + item.left) - score * .01
          : -score * 1e4 + d;
        if (rank < best) { target = item; best = rank; }
      }
      return target;
    }
    if (tower.kind === 'harpoon') {
      // A harpoon only wants a ship that is still sailing (an anchored one is not going anywhere) and has no harpoon on
      // its way: one that is not slowed yet first, then the one nearest its anchorage.
      for (const ship of ships) {
        const d = distance(tower.x, tower.z, ship.x, ship.z);
        if (ship.state !== 'sailing' || !sees(tower, ship, d) || armoured(ship) || roped(ship)) continue;
        const rank = (slowedUntil(ship) > now() + 1e-9 ? 1e4 : 0) + ship.left;
        if (rank < best) { target = ship; best = rank; }
      }
      return target;
    }
    if (tower.kind === 'culverin') {
      // A culverin only wants ships (never boarders), not closer than its minimum range, and not one already doomed by
      // the balls on their way: a ship that attacks towers first (the gunboat, the siege barge), then the one with the
      // most hp left; a tie goes to the lower ship id.
      const priority = DEFENSES_V2.culverin.priority, order = ship => Number(String(ship.id).replace(/\D/g, '')) || 0;
      for (const ship of ships) {
        const d = distance(tower.x, tower.z, ship.x, ship.z);
        if (!sees(tower, ship, d) || d < C.culverin.minRange || armoured(ship) || pending(ship) >= ship.hp) continue;
        const rank = (priority.includes(ship.kind) ? -1e6 : 0) - ship.hp;
        if (rank < best || (rank === best && order(ship) < order(target))) { target = ship; best = rank; }
      }
      return target;
    }
    // The swivel nest (D055) takes only boarders: the one nearest the heart that the pellets on their way do not kill.
    if (tower.kind === 'swivel') {
      for (const boarder of boarders) {
        if (!visible(tower, boarder) || pending(boarder) >= boarder.hp) continue;
        const d = toHeart(boarder);
        if (d < best) { target = boarder; best = d; }
      }
      return target;
    }
    // A cannon takes the boarder nearest the heart first (the closest threat), else a ship as before.
    for (const boarder of boarders) {
      if (!visible(tower, boarder) || pending(boarder) >= boarder.hp) continue;
      const d = toHeart(boarder);
      if (d < best) { target = boarder; best = d; }
    }
    if (target) return target;
    for (const ship of ships) {
      const d = distance(tower.x, tower.z, ship.x, ship.z);
      if (!sees(tower, ship, d) || pending(ship) >= ship.hp || armoured(ship)) continue;
      if (tower.manned ? !target || shoreOrder(ship, target) < 0 : d < best) { target = ship; best = d; }
    }
    return target;
  }
  // The balls, shells and fires of the tick land (part of tick(), sim-tick.js).
  function landShots(t, events) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      if (ball.impactAt > t + 1e-9) continue;
      balls.splice(i, 1);
      const target = findTarget(ball.targetId);
      if (ball.hit && target) {
        damageTarget(target, ball.damage, ball.cannonId, events, ball.captain ? { manual: true, captain: true }
          : { manual: ball.manual, ...(ball.culverin ? { culverin: true } : {}), ...(ball.swivel ? { swivel: true } : {}) });
        // Chain shot (GAME-V3.md §5): a ship that floats on is slowed for a few seconds.
        if (ball.chain && !target.boarder && target.hp > 0) { target.slowUntil = round2(t + ball.chain.seconds); target.slowBy = ball.chain.slow; events.push({ type: 'ship_slowed', t: now(), shipId: target.id, until: target.slowUntil }); }
        // A harpoon (T1): the ship floats on slowed; a new hit refreshes the time (and never weakens a stronger slow).
        if (ball.harpoon && !target.boarder && target.hp > 0) {
          const active = slowedUntil(target) > t + 1e-9;
          target.slowUntil = round2(t + ball.harpoon.seconds); target.slowBy = Math.max(active ? target.slowBy ?? 0 : 0, ball.harpoon.slow);
          events.push({ type: 'ship_slowed', t: now(), shipId: target.id, until: target.slowUntil, slow: target.slowBy, harpoon: true });
        }
        // Grapeshot (tier 3): the shot shreds the boarders around the one it hit.
        if (ball.grape) for (const other of boarders.filter(item => item !== target && distance(item.x, item.z, target.x, target.z) <= ball.grape.radius)) {
          damageBoarder(other, round2(ball.damage * ball.grape.share), ball.cannonId, events, { grape: true });
        }
      }
    }
    for (let i = 0; i < shells.length;) {
      const shell = shells[i];
      if (shell.impactAt > t + 1e-9) { i++; continue; }
      shells.splice(i, 1);
      // A mortar shell or a captain's fire bomb: every ship and every boarder within its radius.
      const radius = shell.radius ?? C.mortar.radius, extra = shell.captain ? { area: true, manual: true, captain: true } : { area: true };
      // Cluster (GAME-V3.md §5): three smaller blasts around the impact instead of one (wider with Heavy shells).
      const cluster = shell.spec === 'cluster' ? shell.skill : null, wide = radius / C.mortar.radius;
      const blasts = cluster
        ? Array.from({ length: cluster.blasts }, (_, k) => { const a = k / cluster.blasts * Math.PI * 2 + shell.toX;
          return { x: round2(shell.toX + Math.cos(a) * cluster.spread), z: round2(shell.toZ + Math.sin(a) * cluster.spread),
            radius: round2(cluster.radius * wide), damage: round2(shell.damage * cluster.damage) }; })
        : [{ x: shell.toX, z: shell.toZ, radius, damage: shell.damage }];
      for (const blast of blasts) {
        const hits = ships.filter(ship => distance(ship.x, ship.z, blast.x, blast.z) <= blast.radius);
        const crowdHits = boarders.filter(boarder => distance(boarder.x, boarder.z, blast.x, blast.z) <= blast.radius);
        events.push({ type: shell.captain ? 'captain_blast' : 'mortar_impact', t: now(), [shell.captain ? 'by' : 'towerId']: shell.towerId,
          x: blast.x, z: blast.z, radius: blast.radius, hits: hits.length + crowdHits.length, ...(shell.spec ? { spec: shell.spec } : {}) });
        for (const ship of hits) damageShip(ship, blast.damage, shell.towerId, events, extra);
        for (const boarder of crowdHits) damageBoarder(boarder, blast.damage, shell.towerId, events, extra);
        // Shockwave (tier 3): the boarders who stand it are thrown back, away from the heart, and start again.
        if (shell.spec === 'shockwave') for (const boarder of crowdHits.filter(item => item.hp > 0)) {
          const away = Math.atan2(boarder.z - heart.z, boarder.x - heart.x), push = shell.skill.push;
          boarder.x = round2(boarder.x + Math.cos(away) * push); boarder.z = round2(boarder.z + Math.sin(away) * push);
          if (boarder.state !== 'walking') { boarder.state = 'walking'; boarder.wallId = null; boarder.foe = null; }
          boarder.goal = null;
          events.push({ type: 'boarder_pushed', t: now(), boarderId: boarder.id, towerId: shell.towerId, x: boarder.x, z: boarder.z });
        }
      }
      // Fire pot (GAME-V3.md §5) and Inferno (its tier-3 capstone): the ground burns where it lands for a few seconds.
      if (shell.spec === 'fire_pot' || shell.spec === 'inferno') {
        const burn = shell.skill;
        fires.push({ towerId: shell.towerId, x: shell.toX, z: shell.toZ, radius: burn.radius, until: round2(t + burn.seconds), every: burn.every,
          damage: round2(shell.damage * burn.share * burn.every), next: round2(t + burn.every) });
        events.push({ type: 'fire_lit', t: now(), towerId: shell.towerId, x: shell.toX, z: shell.toZ, radius: burn.radius, until: round2(t + burn.seconds),
          ...(shell.spec === 'inferno' ? { inferno: true } : {}) });
      }
    }
    for (let i = fires.length - 1; i >= 0; i--) {
      const fire = fires[i];
      if (fire.until <= t + 1e-9) { fires.splice(i, 1); continue; }
      if (fire.next > t + 1e-9) continue;
      fire.next = round2(fire.next + fire.every);
      for (const ship of ships.filter(item => distance(item.x, item.z, fire.x, fire.z) <= fire.radius)) damageShip(ship, fire.damage, fire.towerId, events, { area: true, fire: true });
      for (const boarder of boarders.filter(item => distance(item.x, item.z, fire.x, fire.z) <= fire.radius)) damageBoarder(boarder, fire.damage, fire.towerId, events, { area: true, fire: true });
    }
  }
  // The towers reload and fire (part of tick()).
  function fireTowers(t, events) {
    for (const tower of towers) {
      if (!towerHealth.canFire(tower)) continue; // T33: a broken tower does not reload or fire (no ghost shots)
      if (happening.silenced(tower, t) || jammed(tower, t)) continue; // v3 waves: shelled by the siege barge; jammed by a gunboat
      tower.reload = Math.max(0, tower.reload - C.tick);
      if (tower.reload > 1e-9) continue;
      const target = aimTower(tower);
      if (target && tower.kind === 'mortar') lob(tower, target, events);
      else if (target && tower.kind === 'harpoon') throwHarpoon(tower, target, events);
      else if (target && tower.kind === 'culverin') fireCulverin(tower, target, events);
      else if (target && tower.kind === 'swivel') fireSwivel(tower, target, events);
      else if (target) fire(tower, target, false, events);
    }
  }
  return { damageShip, gunboatFire, damageBoarder, hitWall, hurtIsland, damageTarget, findTarget, ahead, targetKey,
    fire, lob, roped, slowedUntil, throwHarpoon, fireCulverin, fireSwivel, pending, sees, visible, armoured,
    shoreOrder, toHeart, aimTower, landShots, fireTowers };
}
