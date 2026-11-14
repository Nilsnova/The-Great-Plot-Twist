// The captain tree (docs/GAME-V3.md "Captain tree and roles"): prerequisites, exclusive forks, role gating,
// the respec, the cards that show them and the lobby's role icons. Pure functions plus the fake server.
import {describe, expect, it} from 'vitest';
import {skillsModel} from '../../src/island/card-model.js';
import {lobbyModel} from '../../src/island/lobby.js';
import {isLobby} from '../../src/island/api.js';
import {createFakeIslandApi} from './fake.js';
import {respecPrice} from '../../src/pirates/captain-ids.js';

const states = model => Object.fromEntries(model.branches.flatMap(branch => branch.nodes).map(node => [node.id, node.state]));

describe('skillsModel', () => {
  it('shows both options of a fork before the choice and greys the closed twin after it', () => {
    const before = skillsModel({skills: {known: ['steady_aim'], points: 9}});
    expect([states(before).long_barrel, states(before).hot_shot]).toEqual(['ready', 'ready']);
    expect(before.branches[0].tiers.map(tier => tier.fork)).toEqual([false, true, false, true, false]);
    const after = skillsModel({skills: {known: ['steady_aim', 'hot_shot'], points: 9}});
    expect([states(after).hot_shot, states(after).long_barrel]).toEqual(['learned', 'closed']);
    expect(after.branches[0].nodes.find(node => node.id === 'long_barrel').reason).toMatch(/Hot shot.*closed/);
    expect(states(after).quick_hands).toBe('ready'); // either pick opens the next tier
  });
  it('locks a tier until a skill of the tier above is known, and a capstone until the role matches', () => {
    expect(states(skillsModel({skills: {known: ['steady_aim'], points: 9}})).quick_hands).toBe('locked');
    const known = ['steady_aim', 'long_barrel', 'quick_hands', 'far_sight'];
    const none = skillsModel({skills: {known, points: 9}}), wrong = skillsModel({skills: {known, points: 9, role: 'medic'}}), right = skillsModel({skills: {known, points: 9, role: 'gunner'}});
    const eye = model => model.branches[0].nodes.find(node => node.id === 'dead_eye');
    expect([eye(none).state, eye(none).reason]).toEqual(['locked', 'Pick the Gunner role first.']);
    expect([eye(wrong).state, eye(wrong).reason]).toEqual(['locked', 'Only a Gunner can learn this.']);
    expect(eye(right).state).toBe('ready');
  });
  it('opens the role choice at captain level 3 only, once, and the respec costs 100 coins a level', () => {
    const low = skillsModel({skills: {known: []}, captainLevel: 2}).role, open = skillsModel({skills: {known: []}, captainLevel: 3}).role;
    expect([low.locked, low.choices.map(choice => choice.state)]).toEqual([true, ['locked', 'locked', 'locked']]);
    expect([open.locked, open.choices.map(choice => choice.state), open.detail.disabled]).toEqual([false, ['ready', 'ready', 'ready'], false]);
    const set = skillsModel({skills: {known: [], role: 'engineer'}, captainLevel: 3}).role;
    expect([set.current, set.choices.map(choice => choice.state), set.detail.disabled]).toEqual(['engineer', ['closed', 'picked', 'closed'], true]);
    const poor = skillsModel({skills: {known: ['steady_aim']}, captainLevel: 4, coins: 10}).respec;
    expect([poor.price, poor.disabled]).toEqual([400, true]);
    expect(skillsModel({skills: {known: ['steady_aim']}, captainLevel: 4, coins: 500}).respec.disabled).toBe(false);
    expect(skillsModel({skills: {known: []}, captainLevel: 4, coins: 500}).respec.disabled).toBe(true);
  });
});

describe('the fake server follows the same rules', () => {
  const setup = (level = 3, won = 40, coins = 1000) => {
    const api = createFakeIslandApi();
    api.dev.setWaveBest(won); api.dev.setCoins(coins); api.dev.setCaptain(level);
    return api;
  };
  const code = async promise => (await promise).code;
  it('refuses a closed twin, a locked tier, a capstone without the role and a role below level 3', async () => {
    const api = setup(2);
    await api.learnSkill({skill: 'steady_aim'});
    await api.learnSkill({skill: 'hot_shot'});
    expect(await code(api.learnSkill({skill: 'long_barrel'}))).toBe('closed');
    expect(await code(api.learnSkill({skill: 'far_sight'}))).toBe('locked');
    expect(await code(api.pickRole({role: 'medic'}))).toBe('locked');
    expect(await code(api.pickRole({role: 'pirate'}))).toBe('bad_role');
  });
  it('picks one role, gates the capstone by it, and a respec costs coins and clears everything', async () => {
    const api = setup(3, 80, 1000);
    for (const skill of ['steady_aim', 'long_barrel', 'quick_hands', 'far_sight']) expect((await api.learnSkill({skill})).ok).toBe(true);
    expect(await code(api.learnSkill({skill: 'dead_eye'}))).toBe('wrong_role');
    expect((await api.pickRole({role: 'medic'})).data.skills.role).toBe('medic');
    expect(await code(api.pickRole({role: 'gunner'}))).toBe('role_known');
    expect(await code(api.learnSkill({skill: 'dead_eye'}))).toBe('wrong_role');
    const done = (await api.respec()).data;
    expect([done.skills.known, done.skills.role, done.coins]).toEqual([[], null, 1000 - respecPrice(3)]);
    expect(await code(api.respec())).toBe('nothing_to_reset');
    await api.pickRole({role: 'gunner'});
    expect((await api.learnSkill({skill: 'steady_aim'})).data.skills.role).toBe('gunner');
  });
  it('lists each captain\'s role in the lobby', async () => {
    const api = setup();
    await api.pickRole({role: 'engineer'});
    await api.createGame();
    const lobby = (await api.lobby('ISLE-K7Q2M')).data ?? (await api.lobby((await api.games()).data.games[0].code)).data;
    expect(lobby.members.some(member => member.captainRole === 'engineer')).toBe(true);
    expect(isLobby(lobby)).toBe(true);
  });
});

describe('lobbyModel', () => {
  it('gives each row the role icon of its captain, none for an unknown role', () => {
    const members = [{id: 'a', name: 'Ann', role: 'host', captainRole: 'medic'}, {id: 'b', name: 'Bo', role: 'member', captainRole: 'gunner'},
      {id: 'c', name: 'Cy', role: 'member', captainRole: 'wizard'}, {id: 'd', name: 'Di', role: 'member'}];
    const rows = lobbyModel({code: 'K7Q2M', members, me: 'a', hostId: 'a'}).rows;
    expect(rows.map(row => [row.captainRole, row.roleIcon])).toEqual([['medic', '🩹'], ['gunner', '🔫'], [null, ''], [null, '']]);
  });
});
