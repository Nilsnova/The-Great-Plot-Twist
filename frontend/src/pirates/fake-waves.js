// The fake server's games, visits and wave routes (fake-server.js): the friend invite, games (create, join, list, lobby,
// leave), visits, and the waves (start, join, current, finish, revive) with the weather. A closure over `srv`, the fake
// server's setup, and `api` (its other routes).
import { eventFor, bonusLoot } from './wave-events.js';
import { rescueAllowed } from './finisher/rescue.js'; // T38: which lost waves a rescue can soften
import { hasTavern, revivePrice } from './sim.js';
import { ISLAND_RULES, invalid, refuse, readIslandCode, campaignAt, layoutOf, TD_RULES, isWallReport, isBoss,
  lootFor, bossMultiplierFor, spotView } from './fake-rules.js';

export function createWaveRoutes(srv, api) {
  const { weather, uid, world, playerId, me, enterGame, gameView, gameByCode, membersOf, isMember, mustBeMember,
    nameOf, stamp, spots, shape, placeOf, running, nowMs, v2, recordWalls } = srv;
  let weatherKind = weather;
  return {
    setWeather(kind) { weatherKind = Object.hasOwn(ISLAND_RULES.weather, kind) ? kind : 'calm'; },
    // The friend invite (§6) is an alias of joinGame (GAME-V3.md §2); only its 404 code differs.
    async inviteJoin({ code, actionUid } = {}) {
      if (typeof code !== 'string' || !uid(actionUid)) invalid('Send the island code and an action id.');
      return api.joinGame({ code, actionUid }, 'no_such_island');
    },
    async createGame() {
      const created = !world.players.get(playerId)?.code, island = world.islands.get(me().code);
      enterGame(island);
      return { game: gameView(island, 'host'), created };
    },
    async joinGame({ code, actionUid } = {}, missing = 'no_such_game') {
      if (typeof code !== 'string' || !uid(actionUid)) invalid('Send the game code and an action id.');
      const island = gameByCode(code, missing);
      me();
      const role = enterGame(island);
      return { admitted: true, game: gameView(island, role), island: { code: `ISLE-${island.code}`, ownerName: island.ownerName } };
    },
    async games() {
      me();
      // Your own island counts once it was opened as a game or played on (the server lists it once
      // island_open made it, which the fake does at once for every captain).
      const played = island => membersOf(island.code).has(playerId) || island.waveBest > 0 || island.built.size > 0;
      const mine = [...world.islands.values()].filter(island => isMember(island) && (island.owner !== playerId || played(island)))
        .map(island => ({ island, opened: membersOf(island.code).get(playerId)?.opened ?? 0 }))
        .sort((a, b) => b.opened - a.opened);
      return { games: mine.slice(0, 20).map(({ island }) => gameView(island, island.owner === playerId ? 'host' : 'member')) };
    },
    async lobby(code) {
      const island = gameByCode(code);
      mustBeMember(island);
      const rows = [...membersOf(island.code)].filter(([id, row]) => id !== island.owner && !row.left).sort((a, b) => a[1].joined - b[1].joined);
      const roleOfPlayer = id => world.roles?.get(id) ?? [...world.islands.values()].find(item => item.owner === id)?.role ?? null;
      const members = [{ id: island.owner, name: island.ownerName, role: 'host', you: island.owner === playerId, captainRole: roleOfPlayer(island.owner) },
        ...rows.map(([id]) => ({ id, name: nameOf(id), role: 'member', you: id === playerId, captainRole: roleOfPlayer(id) }))];
      return { game: gameView(island, island.owner === playerId ? 'host' : 'member'), members };
    },
    async leaveGame({ code } = {}) {
      if (typeof code !== 'string') invalid('Send the game code.');
      const island = gameByCode(code);
      if (island.owner === playerId) refuse(409, 'host_cannot_leave', 'You host this game, so you cannot leave it.');
      const row = membersOf(island.code).get(playerId);
      if (!row || row.left) return { left: false };
      row.left = stamp();
      return { left: true };
    },

    async visit(code) {
      const found = readIslandCode(code), island = found && world.islands.get(found);
      if (!island) refuse(404, 'no_such_island', 'There is no island with that code.');
      mustBeMember(island); // GAME-V3.md §2: join the game first (the owner always gets in)
      // The crew and the captain too, so host and visitors run the same wave (§8).
      return { code: `ISLE-${island.code}`, ownerName: island.ownerName, waveBest: island.waveBest, spots: spots(island),
        crew: { ...island.crew }, captain: { level: island.captain ?? 1 }, campaign: campaignAt(island), layout: layoutOf(island) };
    },

    async startWave({ where, actionUid } = {}) {
      if (typeof where !== 'string' || !uid(actionUid)) invalid('Send where the wave starts and an action id.');
      const player = me(), repeat = player.actions.get(`start:${actionUid}`);
      if (repeat) return shape(world.waves.get(repeat));
      const place = placeOf(where);
      if (place.island && place.member === false) mustBeMember(place.island); // only members ring the bell there
      for (const run of world.waves.values()) {
        if (run.place === place.key && !run.finishedAt && !running(run)) { run.finishedAt = nowMs(); run.expired = true; }
        if (run.place === place.key && running(run)) refuse(409, 'wave_running', 'A wave is already under way on this island.');
      }
      const next = place.island ? place.island.nextWave ?? place.island.waveBest + 1 : world.pointBest + 1;
      const run = { waveId: `fake-wave-${world.nextWave++}`, place: place.key, island: place.island,
        wave: Math.min(next, TD_RULES.highestWave), seed: Math.floor(world.random() * 2 ** 31),
        startsAtMs: Math.floor(nowMs() / 1000) * 1000 + ISLAND_RULES.waves.countdownSeconds * 1000,
        weather: { ...(ISLAND_RULES.weather[weatherKind] ?? ISLAND_RULES.weather.calm) }, flagship: place.key === 'pirate_point',
        participants: new Set([playerId]), results: new Map(), finishedAt: null, counted: false, expired: false };
      world.waves.set(run.waveId, run); player.actions.set(`start:${actionUid}`, run.waveId);
      return shape(run);
    },

    async joinWave({ waveId } = {}) {
      if (typeof waveId !== 'string') invalid('Say which wave.');
      const run = world.waves.get(waveId);
      if (!run) refuse(404, 'no_such_wave', 'There is no such wave.');
      if (run.island) mustBeMember(run.island); // a wave on a game's island: its members (Pirate Point: anybody)
      if (!running(run)) refuse(409, 'wave_over', 'This wave is over. Ring the bell for the next one.');
      run.participants.add(playerId); me();
      return shape(run);
    },

    async currentWave(where) {
      if (typeof where !== 'string') invalid('Say where.');
      const place = placeOf(where);
      for (const run of world.waves.values()) if (run.place === place.key && running(run)) return shape(run);
      return null;
    },

    async finishWave({ waveId, survived, shipsSunk, bonuses, rescued, walls } = {}) {
      if (typeof waveId !== 'string' || typeof survived !== 'boolean' || !Number.isInteger(shipsSunk) || shipsSunk < 0 || shipsSunk > 1000
        || (bonuses !== undefined && !(Array.isArray(bonuses) && bonuses.length <= 2 && bonuses.every(kind => kind === 'galleon' || kind === 'finisher')))
        || (rescued !== undefined && typeof rescued !== 'boolean') || (walls !== undefined && walls !== null && !isWallReport(walls))) {
        invalid('Send the wave, whether the island held and the ships sunk (0 to 1000).');
      }
      const player = me(), run = world.waves.get(waveId);
      if (!run) refuse(404, 'no_such_wave', 'There is no such wave.');
      if (!run.participants.has(playerId)) refuse(403, 'not_in_wave', 'Join the wave first: you are not in this wave.');
      const placeBest = () => (run.island ? { waveBest: run.island.waveBest, flags: run.island.flags } : { waveBest: world.pointBest, flags: world.pointFlags });
      const stored = run.results.get(playerId);
      const runInfo = () => (v2 && run.island ? { nextWave: run.island.nextWave, boss: isBoss(run) } : {});
      if (stored !== undefined) { recordWalls(run, walls); return { loot: stored, coins: player.coins, ...placeBest(), ...runInfo() }; }
      const elapsed = (nowMs() - run.startsAtMs) / 1000;
      if (elapsed < ISLAND_RULES.waves.minimumSeconds) {
        const wait = Math.max(1, Math.ceil(ISLAND_RULES.waves.minimumSeconds - elapsed));
        refuse(409, 'wave_too_early', `The wave is not over yet. Try again in ${wait} seconds.`, wait);
      }
      const late = elapsed > ISLAND_RULES.waves.maximumSeconds;
      // §4: houses pay 5 a level (5, 10, 15), a boss wave pays bossMultiplierFor(wave) times (3; wave 40: 5).
      const houseBonus = run.island ? [...run.island.built].filter(id => id.startsWith('house_'))
        .reduce((sum, id) => sum + 5 * (run.island.levels?.get(id) ?? 1), 0) : 0;
      // v3 waves: the bonuses the wave allows (wave_events.py): the galleon on a galleon wave, a finisher on a boss wave.
      const allowed = run.island ? [...new Set(bonuses ?? [])].filter(kind => (kind === 'galleon' ? eventFor(run.wave, run.seed) === 'treasure_galleon' : isBoss(run))) : [];
      const extra = allowed.reduce((sum, kind) => sum + bonusLoot(kind, run.wave), 0);
      const loot = survived && !late ? (lootFor(run.wave, 0, !run.island) + houseBonus + extra) * (isBoss(run) ? bossMultiplierFor(run.wave) : 1) : 0;
      if (survived && !late && !run.island) player.pointBest = Math.max(player.pointBest ?? 0, run.wave);
      if (survived && !late) player.wonBest = Math.max(player.wonBest ?? 0, run.wave); // won_wave_best: any wave you fought and won
      if (!run.finishedAt) { run.finishedAt = nowMs(); run.expired = late; }
      if (run.island && !run.nextSet) {
        run.nextSet = true;
        // §1: carry on after a win; after a loss the next bell restarts at best − 2 (at least 1).
        // T38 (rescue.py): a won rescue on a lost wave from wave 4 to 100 falls back one wave less (flag rescue on).
        const back = TD_RULES.restartBack - (!survived && !late && rescued === true && rescueAllowed(run.wave) ? 1 : 0);
        run.island.nextWave = survived && !late ? Math.min(run.wave + 1, TD_RULES.highestWave)
          : Math.max(1, run.island.waveBest - back);
      }
      if (survived && !late && !run.counted) {
        run.counted = true;
        if (run.island) { run.island.waveBest = Math.max(run.island.waveBest, run.wave); run.island.flags++; }
        else { world.pointBest = Math.max(world.pointBest, run.wave); world.pointFlags++; }
      }
      player.coins += loot; run.results.set(playerId, loot);
      recordWalls(run, walls); // D039: the first finish of the wave keeps its walls (won or lost)
      return { loot, coins: player.coins, ...placeBest(), ...runInfo() };
    },

    // Captain health (GAME-V3.md §3): the reviver pays 20 + 5 × wave, once per actionUid; only a member of
    // the game who is in this wave and has not finished it yet (the rules of wave_revive()). One fall (the
    // fallen captain at the tick downAt) is paid for once: a second helper is refused already_up.
    async reviveCaptain({ waveId, fallen, downAt, actionUid } = {}) {
      if (typeof waveId !== 'string' || typeof fallen !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(fallen) || !uid(actionUid)
        || !Number.isSafeInteger(downAt) || downAt < 0 || downAt > 100000) {
        invalid('Send the wave, the fallen captain, when they fell and an action id.');
      }
      const player = me(), repeat = player.actions.get(`revive:${actionUid}`);
      if (repeat) return { price: repeat, coins: player.coins, repeat: true };
      const run = world.waves.get(waveId);
      if (!run) refuse(404, 'no_such_wave', 'There is no such wave.');
      if (run.island) mustBeMember(run.island);
      if (!run.participants.has(playerId)) refuse(403, 'not_in_wave', 'Join the wave first: you are not in this wave.');
      const elapsed = (nowMs() - run.startsAtMs) / 1000;
      if (run.results.has(playerId) || elapsed < 0 || elapsed > ISLAND_RULES.waves.maximumSeconds) refuse(409, 'wave_over', 'This wave is over.');
      // A Tavern on the island (level 2 or more) takes 25% off, as wave_revive() checks the island's buildings.
      const tavern = !!run.island && hasTavern([...run.island.built].map(id => ({ ...spotView(run.island, id), x: 0, z: 0 })));
      const price = revivePrice(run.wave, { tavern });
      if (player.coins < price) refuse(409, 'insufficient_funds', `Helping a captain up costs ${price} coins. You need more coins.`);
      run.revived ??= new Set();
      const fall = `${fallen}@${downAt}`;
      if (run.revived.has(fall)) refuse(409, 'already_up', 'Already up: a teammate helped them first.');
      run.revived.add(fall);
      player.coins -= price; player.actions.set(`revive:${actionUid}`, price);
      return { price, coins: player.coins, repeat: false };
    },
  };
}
