// Research and respec only between waves (T24): the fake server's wave_running (the SQL of
// island_research() and island_respec()), the card models, and the island client's error mapping.
import {describe, expect, it} from 'vitest';
import {createFakeIslandApi, createFakeWorld} from '../../src/pirates/fake-api.js';
import {skillsModel, techModel} from '../../src/island/card-model.js';
import {campaignOf} from '../../src/campaign/index.js';

const clock = (start = Date.UTC(2026, 10, 13, 12, 0, 0)) => {
  let now = start;
  return {now: () => now, advance: seconds => { now += seconds * 1000; }};
};
async function refusal(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a refusal');
}

async function game() {
  const time = clock(), world = createFakeWorld();
  const host = createFakeIslandApi({world, playerId: 'nils', ownerName: 'Nils', now: time.now});
  const ana = createFakeIslandApi({world, playerId: 'ana', ownerName: 'Ana', now: time.now});
  const code = (await host.island()).code;
  await ana.island();
  await ana.joinGame({code, actionUid: 'join-ana-1'});
  for (const id of ['nils', 'ana']) world.players.get(id).coins = 5000;
  world.islands.get(world.players.get('nils').code).waveBest = 30;
  return {time, world, host, ana, code};
}

describe('the fake server: no research and no respec while a wave runs', () => {
  it('refuses research during the countdown and the wave, from the host and from a member; fine in the break', async () => {
    const {time, world, host, ana, code} = await game();
    const wave = await host.startWave({where: 'own', actionUid: 'start-0001'});
    const coins = world.players.get('nils').coins;
    for (const call of [host.research({branch: 'cannon', actionUid: 'tech-0001'}),
      ana.research({branch: 'cannon', actionUid: 'tech-0002', code})]) {
      const error = await refusal(call);
      expect([error.status, error.code, error.message]).toEqual([409, 'wave_running', 'A wave is under way. Research and respec between waves.']);
    }
    time.advance(30);
    expect((await refusal(host.research({branch: 'cannon', actionUid: 'tech-0003'}))).code).toBe('wave_running');
    expect(world.players.get('nils').coins).toBe(coins);
    await host.finishWave({waveId: wave.waveId, survived: true, shipsSunk: 2});
    await host.research({branch: 'cannon', actionUid: 'tech-0004'});
    expect(world.players.get('nils').coins).toBeLessThan(coins);
  });

  it('refuses a respec during a wave without charging, and does it between waves', async () => {
    const {time, world, host} = await game();
    const island = world.islands.get(world.players.get('nils').code);
    island.captain = 3; island.skills = ['steady_aim'];
    const wave = await host.startWave({where: 'own', actionUid: 'start-0002'});
    const coins = world.players.get('nils').coins;
    expect(await refusal(host.respec({actionUid: 'respec-0001'}))).toMatchObject({status: 409, code: 'wave_running'});
    expect(world.players.get('nils').coins).toBe(coins);
    expect(island.skills).toEqual(['steady_aim']);
    time.advance(30);
    await host.finishWave({waveId: wave.waveId, survived: true, shipsSunk: 2});
    const looted = world.players.get('nils').coins;
    await host.respec({actionUid: 'respec-0002'});
    expect(world.players.get('nils').coins).toBe(looted - 300);
    expect(island.skills).toEqual([]);
  });
});

describe('the cards', () => {
  const atWave = (wave, extra = {}) => campaignOf({waveBest: wave, campaign: {wave, ...extra}});
  it('the Tech hub buttons are disabled with "Between waves only." during a wave', () => {
    const campaign = atWave(30, {research: {done: ['cannon'], tiers: {cannon: {tier: 2, tier2: 'long_guns', tier3: null}}}});
    const calm = techModel({campaign, coins: 5000}), fight = techModel({campaign, coins: 5000, battle: true});
    const buttons = model => model.branches.flatMap(row => row.tiers.flatMap(tier => tier.nodes.map(node => node.button).filter(Boolean)));
    expect(buttons(calm).every(button => !button.disabled)).toBe(true);
    expect(buttons(fight).length).toBe(buttons(calm).length);
    expect(buttons(fight).every(button => button.disabled && button.reason === 'Between waves only.')).toBe(true);
  });
  it('the respec button is disabled with "Between waves only." during a wave, and stays asked-for-nothing when there is nothing to reset', () => {
    const skills = {known: ['steady_aim']};
    expect(skillsModel({skills, captainLevel: 3, coins: 500}).respec).toMatchObject({disabled: false, reason: ''});
    expect(skillsModel({skills, captainLevel: 3, coins: 500, battle: true}).respec).toMatchObject({disabled: true, reason: 'Between waves only.', price: 300});
    expect(skillsModel({skills: {known: []}, captainLevel: 3, coins: 500, battle: true}).respec.reason).toBe('Nothing to reset yet.');
  });
});
