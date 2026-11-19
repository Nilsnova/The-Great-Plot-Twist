// The fake server's island routes (fake-server.js): build and upgrade, the wreck and the boat game, tear-downs, the
// fresh start, moving a spot, the walls and their repair, and Pirate Point. A closure over `srv`, the fake server's
// setup, and `api` (its other routes).
import { waveOf } from '../campaign/index.js';
import { BOAT as BOAT_RULES, coinsFor as boatCoins } from './boat/rules.js';
import { positionsOf, checkMove } from '../island/placement.js';
import { canonicalSpot, kindOfSpot, refuse, invalid, ISLAND_RULES, lockedMessage, readIslandCode, restorePrice,
  rebuildPrice } from './fake-rules.js';

export function createIslandRoutes(srv, api) {
  const { world, me, visited, buildOn, islandSpots, islandAllowed, view, visitedView, healthAt, nowMs,
    upgradeOn, uid, unlocking, demolishable, playerId, waveGuard, activeOf, newIsland, spots, wallsView, pointView,
    allowed } = srv;
  return {
    async build({ code, ...body } = {}) {
      body.spot = canonicalSpot(body.spot);
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code);
      buildOn(island, islandSpots, body, islandAllowed(island));
      return island === mine ? view() : visitedView(island);
    },
    async upgrade({ code, ...body } = {}) {
      body.spot = canonicalSpot(body.spot);
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code);
      // D039 (T47): a damaged or destroyed wall is repaired first; an upgrade never heals it.
      if (island.built.has(body.spot) && kindOfSpot(body.spot) === 'wall' && !me().actions.has(`upgrade:${body.actionUid}`)
        && healthAt(island, body.spot, nowMs()) < 100) refuse(409, 'needs_repair', 'Repair this wall before you upgrade it.');
      upgradeOn(island, islandSpots, body, islandAllowed(island));
      return island === mine ? view() : visitedView(island);
    },
    // GAME-V3.md §4: coins into the island's wreck, never past the goal.
    async repairWreck({ amount, actionUid, code } = {}) {
      if (!Number.isSafeInteger(amount) || !uid(actionUid)) invalid('Send the amount and an action id.');
      const mine = world.islands.get(me().code), island = code === undefined ? mine : visited(code), player = me();
      if (!ISLAND_RULES.wreck.gifts.includes(amount)) refuse(400, 'bad_gift', 'Pick one of the amounts shown.');
      if (player.actions.has(`wreck:${actionUid}`)) return island === mine ? view() : visitedView(island);
      if (unlocking && island.waveBest < waveOf('wreck')) refuse(409, 'locked', lockedMessage(waveOf('wreck')));
      const paid = island.wreck ?? 0, goal = ISLAND_RULES.wreck.goal;
      if (paid >= goal) refuse(409, 'repaired', 'The wreck is repaired. She sails after wave 30.');
      const gift = Math.min(amount, goal - paid);
      if (player.coins < gift) refuse(409, 'insufficient_funds', `That costs ${gift} coins. You need more coins.`);
      player.coins -= gift; island.wreck = paid + gift; player.actions.set(`wreck:${actionUid}`, true);
      return island === mine ? view() : visitedView(island);
    },
    // D057: the island's own boat after wave 30 (the server's boat.py, word for word): whether she sails, and one
    // round's coins, paid once per game, player, island and best won wave.
    async boatStatus({ code } = {}) {
      const island = code === undefined || code === null ? world.islands.get(me().code) : visited(code), player = me();
      const wave = island.waveBest, left = ISLAND_RULES.wreck.goal - Math.min(island.wreck ?? 0, ISLAND_RULES.wreck.goal);
      const reason = wave < waveOf('ship') ? 'locked' : left > 0 ? 'not_repaired' : null;
      return { open: reason === null, reason, message: reason === 'locked' ? lockedMessage(waveOf('ship')) : reason ? `Finish the wreck's repair first: ${left} coins to go.` : null,
        wave, unlockWave: waveOf('ship'), wreck: { paid: ISLAND_RULES.wreck.goal - left, goal: ISLAND_RULES.wreck.goal },
        games: BOAT_RULES.games.map(id => ({ id, paid: player.actions.has(`boat:${island.code}:${wave}:${id}`), best: boatCoins(BOAT_RULES.stars, wave) })) };
    },
    async boatReward({ game, stars, code } = {}) {
      if (!BOAT_RULES.games.includes(game)) refuse(400, 'bad_game', 'There is no such boat game.');
      if (!Number.isSafeInteger(stars) || stars < 0 || stars > BOAT_RULES.stars) refuse(422, 'bad_stars', 'Stars are a whole number from 0 to 3.');
      const state = await api.boatStatus({ code }), island = code === undefined || code === null ? world.islands.get(me().code) : visited(code), player = me();
      if (!state.open) refuse(409, state.reason, state.message);
      const ref = `boat:${island.code}:${state.wave}:${game}`, coins = boatCoins(stars, state.wave);
      const already = player.actions.has(ref);
      if (already || coins <= 0) return { game, stars, coins: 0, paid: false, already, balance: null, wave: state.wave };
      player.actions.set(ref, true); player.coins += coins;
      return { game, stars, coins, paid: true, already: false, balance: player.coins, wave: state.wave };
    },
    // GAME-V3.md §4.2: what a tear-down gives back, and the tear-down (any member, between waves only).
    async demolishQuote({ spot, code } = {}) {
      if (typeof spot !== 'string') invalid('Send the spot.');
      const mine = world.islands.get(me().code), island = code === undefined || code === null ? mine : visited(code);
      return { ...demolishable(island, canonicalSpot(spot)), repeat: false };
    },
    async demolish({ spot, actionUid, code } = {}) {
      if (typeof spot !== 'string' || !uid(actionUid)) invalid('Send the spot and an action id.');
      const mine = world.islands.get(me().code), island = code === undefined || code === null ? mine : visited(code), player = me();
      const answer = () => (island === mine ? view() : visitedView(island));
      const done = player.actions.get(`demolish:${actionUid}`);
      if (done) return { ...answer(), demolished: { ...done, repeat: true } };
      spot = canonicalSpot(spot);
      const quote = demolishable(island, spot);
      for (const refund of quote.refunds) { const payer = world.players.get(refund.id); if (payer) payer.coins += refund.coins; }
      island.built.delete(spot); island.levels?.delete(spot); island.kinds?.delete(spot);
      if (island.walls instanceof Map) island.walls.delete(spot); // D039: a new wall here starts whole
      if (island.specs instanceof Map) island.specs.delete(spot);
      if (island.trees instanceof Map) island.trees.delete(spot); // D055: a tree goes with its tower (no refund)
      if (island.payments instanceof Map) island.payments.delete(spot);
      player.actions.set(`demolish:${actionUid}`, quote);
      return { ...answer(), demolished: { ...quote, refunds: quote.refunds.map(item => ({ ...item, you: item.id === playerId })), repeat: false } };
    },
    // T53 (island_fresh_start(), 20261116070000): your own island back to a fresh start, between waves, after typing
    // its code. The members stay; the coins become a new player's (startingCoins); a repeated actionUid answers the first counts.
    async freshStart({ confirmCode, actionUid } = {}) {
      if (typeof confirmCode !== 'string' || !uid(actionUid)) invalid('Send the island code and an action id.');
      const player = me(), island = world.islands.get(player.code);
      const done = player.actions.get(`reset:${actionUid}`);
      if (done) return { reset: true, repeat: true, balance: player.coins, counts: { ...done } };
      const typed = readIslandCode(confirmCode);
      if (!typed) refuse(400, 'wrong_code', "That is not your island's code. Type the code shown.");
      if (typed !== island.code) {
        if (world.islands.has(typed)) refuse(403, 'not_owner', "Only the host can reset this game's island.");
        refuse(400, 'wrong_code', "That is not your island's code. Type the code shown.");
      }
      waveGuard(island, 'A wave is under way. Reset your island between waves.');
      let waves = 0;
      for (const [id, run] of world.waves) if (run.place === island.code) { world.waves.delete(id); waves += 1; }
      const start = ISLAND_RULES.startingCoins;
      const counts = { coins: start - player.coins, saves: 0, buildings: island.built.size, research: (island.research ?? []).length,
        layout: island.positions instanceof Map ? island.positions.size : 0, arsenalMoves: 0,
        arsenalCopies: world.arsenals?.[island.code]?.copies?.length ?? 0, wallRecords: 0, waveRules: 0, waves,
        membersKept: activeOf(island) - 1 };
      if (world.arsenals) delete world.arsenals[island.code];
      world.islands.set(island.code, newIsland(island.code, island.owner, island.ownerName));
      player.coins = start; player.wonBest = 0;
      player.actions.set(`reset:${actionUid}`, counts);
      return { reset: true, repeat: false, balance: player.coins, counts: { ...counts } };
    },
    // T36 (backend/server/island/placement.py): the same rules as the server (src/island/placement.js), between waves.
    async move({ spot, x, z, code } = {}) {
      if (typeof spot !== 'string' || typeof x !== 'number' || typeof z !== 'number') invalid('Send the spot, x and z.');
      const mine = world.islands.get(me().code), island = code === undefined || code === null ? mine : visited(code);
      spot = canonicalSpot(spot);
      if (!(island.positions instanceof Map)) island.positions = new Map();
      const placed = positionsOf(spots(island)), here = placed[spot];
      if (!here || here.x !== x || here.z !== z) {
        const verdict = checkMove(spot, x, z, placed);
        if (!verdict.ok) refuse(verdict.code === 'no_such_spot' ? 404 : verdict.code === 'off_grid' ? 422 : 409, verdict.code, verdict.message);
        waveGuard(island, 'A wave is under way. Move buildings between waves.');
        island.positions.set(spot, { x, z });
      }
      return island === mine ? view() : visitedView(island);
    },
    // D039 (flag wall_recovery, routes/wall_recovery.py): the walls of your island, or of a game's island with `code`.
    async walls({ code } = {}) {
      const mine = world.islands.get(me().code), island = code === undefined || code === null ? mine : visited(code);
      return wallsView(island);
    },
    // Repair (damaged) or Rebuild (destroyed) at its kind and level, between waves, paid by the caller; a repeated
    // actionUid charges nothing and answers the walls as they are; a whole wall is refused intact (island_wall_restore()).
    async repairWall({ spot, actionUid, code } = {}) {
      if (typeof spot !== 'string' || !uid(actionUid)) invalid('Send the spot and an action id.');
      const player = me(), mine = world.islands.get(player.code), island = code === undefined || code === null ? mine : visited(code);
      if (player.actions.has(`repair:${actionUid}`)) return wallsView(island);
      spot = canonicalSpot(spot);
      if (!islandSpots.includes(spot)) refuse(404, 'no_such_spot', 'There is no such build spot here.');
      if (kindOfSpot(spot) !== 'wall') refuse(422, 'wrong_kind', 'Only walls are repaired here.');
      if (!island.built.has(spot)) refuse(409, 'not_built', 'Build a wall on this spot first.');
      waveGuard(island, 'Repair it between waves, or press E at it now.');
      const health = healthAt(island, spot, nowMs());
      if (health >= 100) refuse(409, 'intact', 'This wall is whole already.');
      const price = restorePrice(rebuildPrice(island.levels?.get(spot) ?? 1), health);
      if (player.coins < price) refuse(409, 'insufficient_funds', `The repair costs ${price} coins. You need more coins.`);
      if (!(island.walls instanceof Map)) island.walls = new Map();
      player.coins -= price; island.walls.set(spot, { health: 100, damagedAt: null }); player.actions.set(`repair:${actionUid}`, price);
      return wallsView(island);
    },
    async piratePoint() { me(); return pointView(); },
    async pointBuild(body = {}) { buildOn(world.point, ISLAND_RULES.pointSpots, body, allowed(world.islands.get(me().code))); return pointView(); },
    async pointUpgrade(body = {}) { upgradeOn(world.point, ISLAND_RULES.pointSpots, body, allowed(world.islands.get(me().code))); return pointView(); },
    piratePointBuild(body) { return api.pointBuild(body); },
    piratePointUpgrade(body) { return api.pointUpgrade(body); },
  };
}
