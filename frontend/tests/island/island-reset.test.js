// D054, Start fresh: the fake server's island_reset_own() rules, the island client's call and the confirm word.
import {describe, expect, it} from 'vitest';
import {createFakeIslandApi, createFakeIslandTransport, createFakeWorld, ISLAND_RULES} from '../../src/pirates/fake-api.js';
import {createIslandApi, PATHS} from '../../src/island/api.js';
import {confirmed, CONFIRM_WORD} from '../../src/island/island-reset.js';

const clock = (start = Date.UTC(2026, 10, 16, 12, 0, 0)) => {
  let now = start;
  return {now: () => now, advance: seconds => { now += seconds * 1000; }};
};
async function refusal(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a refusal');
}

async function played() {
  const time = clock(), world = createFakeWorld();
  const host = createFakeIslandApi({world, playerId: 'nils', ownerName: 'Nils', now: time.now});
  const ana = createFakeIslandApi({world, playerId: 'ana', ownerName: 'Ana', now: time.now});
  const code = (await host.island()).code;
  await ana.island();
  await ana.joinGame({code, actionUid: 'join-ana-1'});
  for (const id of ['nils', 'ana']) world.players.get(id).coins = 1000;
  await host.build({spot: 'cannon_1', kind: 'cannon', actionUid: 'build-0001'});
  await host.build({spot: 'wall_1', kind: 'wall', actionUid: 'build-0002'});
  await host.hire({crew: 'gunner', actionUid: 'hire-00001'});
  const island = world.islands.get(code.replace('ISLE-', ''));
  Object.assign(island, {waveBest: 9, flags: 3, nextWave: 10, captain: 3, skills: ['steady_aim'], role: 'medic', wreck: 50});
  return {time, world, host, ana, code};
}

describe('Start fresh on the fake server (the rules of island_reset_own)', () => {
  it('your island, coins and progress go back to the start; the code stays; the other members leave', async () => {
    const {world, host, code} = await played();
    const view = await host.resetIsland({confirm: 'RESET', actionUid: 'reset-0001'});
    expect(view.code).toBe(code);
    expect(view.coins).toBe(ISLAND_RULES.startingCoins);
    expect(view.spots.filter(spot => spot.built)).toEqual([]);
    expect({waveBest: view.waveBest, nextWave: view.nextWave, flags: view.flags, captain: view.captain.level, crew: view.crew})
      .toEqual({waveBest: 0, nextWave: 1, flags: 0, captain: 1, crew: {gunner: 0, carpenter: 0, lookout: 0, guard: 0}});
    expect({known: view.skills.known, role: view.skills.role, wreck: view.campaign.wreck.paid}).toEqual({known: [], role: null, wreck: 0});
    expect([...world.members.get(code.replace('ISLE-', '')).keys()]).not.toContain('ana');
    expect(world.players.get('ana').coins).toBe(1000); // a member's own wallet is not touched
  });

  it('only your own island: the friend\'s island you are in stays as it was', async () => {
    const {world, host} = await played();
    const friend = world.islands.get('K7Q2M'), before = {built: [...friend.built], waveBest: friend.waveBest};
    await host.resetIsland({confirm: 'RESET', actionUid: 'reset-0001'});
    expect({built: [...world.islands.get('K7Q2M').built], waveBest: world.islands.get('K7Q2M').waveBest}).toEqual(before);
  });

  it('a repeated click changes nothing, the word must be RESET and no reset runs during a wave', async () => {
    const {world, host, time} = await played();
    await host.resetIsland({confirm: 'RESET', actionUid: 'reset-0001'});
    await host.build({spot: 'wall_1', kind: 'wall', actionUid: 'build-0003'});
    const again = await host.resetIsland({confirm: 'RESET', actionUid: 'reset-0001'});
    expect(again.spots.find(spot => spot.id === 'wall_1').built).toBe(true);
    expect((await refusal(host.resetIsland({confirm: 'reset', actionUid: 'reset-0002'}))).code).toBe('validation_error');
    await host.startWave({where: 'own', actionUid: 'bell-00001'});
    time.advance(30);
    const running = await refusal(host.resetIsland({confirm: 'RESET', actionUid: 'reset-0003'}));
    expect([running.status, running.code]).toEqual([409, 'wave_running']);
    expect(world.players.get('nils').coins).toBe(ISLAND_RULES.startingCoins - 10);
  });
});

describe('the island client and the transport', () => {
  it('sends confirm RESET with one click id, kept after an unknown outcome', async () => {
    const sent = [];
    let answer = {ok: false, status: 503, code: 'database_unavailable', message: 'Try again.'};
    const api = createIslandApi({transport: {get: async () => ({ok: false, status: 0}), post: async (path, body) => { sent.push([path, body]); return answer; }},
      makeUid: (() => { let n = 0; return () => `uid-${String(++n).padStart(5, '0')}`; })()});
    expect((await api.resetIsland()).ok).toBe(false);
    answer = {ok: false, status: 409, code: 'wave_running', message: 'A wave is under way.'};
    await api.resetIsland();
    await api.resetIsland();
    expect(sent.map(([path, body]) => [path, body.confirm, body.actionUid])).toEqual([
      [PATHS.reset, 'RESET', 'uid-00001'], [PATHS.reset, 'RESET', 'uid-00001'], [PATHS.reset, 'RESET', 'uid-00002']]);
  });

  it('the dev fake answers POST /api/island/reset like the server, extra keys refused', async () => {
    const transport = createFakeIslandTransport({coins: 500});
    const api = createIslandApi({transport});
    await api.build({spot: 'wall_1', kind: 'wall'});
    const reset = await api.resetIsland();
    expect(reset.ok).toBe(true);
    expect([reset.data.coins, reset.data.spots.some(spot => spot.built)]).toEqual([ISLAND_RULES.startingCoins, false]);
    const extra = await transport.post(PATHS.reset, {confirm: 'RESET', actionUid: 'reset-0009', code: 'ISLE-K7Q2M'});
    expect([extra.ok, extra.code]).toEqual([false, 'validation_error']);
  });

  it('the confirm word is RESET, typed in any case', () => {
    expect(CONFIRM_WORD).toBe('RESET');
    expect([confirmed('RESET'), confirmed(' reset '), confirmed('Reset'), confirmed('RESE'), confirmed(''), confirmed(null)])
      .toEqual([true, true, true, false, false, false]);
  });
});
