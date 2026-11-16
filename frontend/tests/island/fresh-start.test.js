// Reset my island (T53): the fake server's rules (the SQL of island_fresh_start()), the island client's
// freshStart(), the Settings section's model, the Settings section registry and the narrator forgetting a
// reset island so its opening plays again.
import {describe, expect, it, vi} from 'vitest';
import {createFakeIslandApi as createFunctionApi, createFakeWorld, FAKE_FRIEND, ISLAND_RULES} from '../../src/pirates/fake-api.js';
import {createFakeIslandApi} from './fake.js';
import {isFreshStart, PATHS} from '../../src/island/api.js';
import {codeMatches, doneLine, resetModel, resetWhat, MEMBER_LINE, WAVE_LINE} from '../../src/island/reset.js';
import {addSettingsSection, settingsSections} from '../../src/shell/settings-extras.js';
import {createNarrator} from '../../src/narrator/index.js';

async function refusal(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a refusal');
}

// The host (Nils) with Ana in his game, both with things on their islands.
async function game() {
  const world = createFakeWorld();
  const host = createFunctionApi({world, playerId: 'nils', ownerName: 'Nils'});
  const ana = createFunctionApi({world, playerId: 'ana', ownerName: 'Ana'});
  const code = (await host.island()).code;
  const anaCode = (await ana.island()).code;
  await ana.joinGame({code, actionUid: 'join-ana-1'});
  for (const id of ['nils', 'ana']) world.players.get(id).coins = 1000;
  await host.build({spot: 'cannon_1', kind: 'cannon', actionUid: 'build-0001'});
  await host.build({spot: 'wall_1', kind: 'wall', actionUid: 'build-0002'});
  await ana.build({spot: 'wall_2', kind: 'wall', actionUid: 'build-0003', code});
  await ana.build({spot: 'wall_1', kind: 'wall', actionUid: 'build-0004'}); // on Ana's own island
  const island = world.islands.get(code.slice(5));
  Object.assign(island, {waveBest: 4, flags: 4, captain: 3, skills: ['steady_aim'], nextWave: 5, wreck: 125, research: ['cannon']});
  island.crew.gunner = 2;
  return {world, host, ana, code, anaCode};
}

describe('resetting an island on the fake server (the rules of island_fresh_start)', () => {
  it('the owner resets: everything is back to the start, the coins are a new player\'s and Ana stays in the game', async () => {
    const start = ISLAND_RULES.startingCoins;
    const {world, host, code} = await game();
    const answer = await host.freshStart({confirmCode: code.toLowerCase(), actionUid: 'reset-0001'});
    expect(answer).toMatchObject({reset: true, repeat: false, balance: start,
      counts: {coins: start - 1000 + 30 + 10, buildings: 3, research: 1, membersKept: 1}});
    expect(isFreshStart(answer)).toBe(true);
    const view = await host.island();
    expect(view).toMatchObject({code, coins: start, waveBest: 0, flags: 0, nextWave: 1, captain: {level: 1}, crew: {gunner: 0, carpenter: 0, lookout: 0, guard: 0}});
    expect(view.spots.filter(spot => spot.built)).toEqual([]);
    expect(view.campaign.research.done).toEqual([]);
    expect(view.campaign.wreck.paid).toBe(0);
    expect(world.members.get(code.slice(5)).get('ana')).toMatchObject({role: 'member', left: null});
  });

  it('a member types the host code: not_owner; a wrong code: wrong_code; nothing changes', async () => {
    const {host, ana, code} = await game();
    const notOwner = await refusal(ana.freshStart({confirmCode: code, actionUid: 'reset-0002'}));
    expect([notOwner.status, notOwner.code, notOwner.message]).toEqual([403, 'not_owner', MEMBER_LINE]);
    const wrong = await refusal(host.freshStart({confirmCode: 'ISLE-ZZZZZ', actionUid: 'reset-0003'}));
    expect([wrong.status, wrong.code]).toEqual([400, 'wrong_code']);
    expect((await host.island()).spots.filter(spot => spot.built).length).toBe(3);
  });

  it('no reset while a wave runs on the island; a repeat answers the first counts', async () => {
    const {host, code} = await game();
    await host.startWave({where: 'own', actionUid: 'bell-0001'});
    const running = await refusal(host.freshStart({confirmCode: code, actionUid: 'reset-0004'}));
    expect([running.status, running.code, running.message]).toEqual([409, 'wave_running', WAVE_LINE]);
  });

  it('a repeated click resets nothing again; another island is untouched', async () => {
    const {host, ana, code, anaCode} = await game();
    const first = await host.freshStart({confirmCode: code, actionUid: 'reset-0005'});
    await host.build({spot: 'wall_3', kind: 'wall', actionUid: 'build-0009'});
    const again = await host.freshStart({confirmCode: code, actionUid: 'reset-0005'});
    expect(again).toEqual({...first, repeat: true, balance: ISLAND_RULES.startingCoins - 10});
    expect((await host.island()).spots.filter(spot => spot.built).map(spot => spot.id)).toEqual(['wall_3']);
    const anaIsland = await ana.island();
    expect(anaIsland.code).toBe(anaCode);
    expect(anaIsland.spots.filter(spot => spot.built).map(spot => spot.id)).toEqual(['wall_1']);
  });

  it('the island client: the route, a click id kept for a retry, and a code that cannot be one', async () => {
    const api = createFakeIslandApi();
    const code = (await api.getIsland()).data.code;
    expect(PATHS.freshStart).toBe('/api/island/fresh-start');
    const bad = await api.freshStart({confirmCode: 'nope'});
    expect(bad).toMatchObject({ok: false, status: 400, code: 'wrong_code'});
    const done = await api.freshStart({confirmCode: code.toLowerCase()});
    expect(done).toMatchObject({ok: true, data: {reset: true, repeat: false, balance: ISLAND_RULES.startingCoins}});
    const wrong = await api.freshStart({confirmCode: FAKE_FRIEND.code});
    expect(wrong).toMatchObject({ok: false, status: 403, code: 'not_owner'});
  });
});

describe('the Settings section model', () => {
  it('enables the red button only for the island code, and never mid-wave', () => {
    expect(codeMatches('isle-k7q2m', 'ISLE-K7Q2M')).toBe(true);
    expect(codeMatches(' K7Q-2M ', 'ISLE-K7Q2M')).toBe(true);
    expect(codeMatches('K7Q2N', 'ISLE-K7Q2M')).toBe(false);
    expect(codeMatches('', '')).toBe(false);
    const owner = {kind: 'owner', code: 'ISLE-K7Q2M'};
    expect(resetModel(owner, '')).toMatchObject({kind: 'owner', enabled: false, hint: 'Type ISLE-K7Q2M to confirm.'});
    expect(resetModel(owner, 'k7q2m')).toMatchObject({enabled: true, matches: true});
    expect(resetModel(owner, 'k7q2m', {busy: true})).toMatchObject({enabled: false});
    expect(resetModel({...owner, wave: true}, 'K7Q2M')).toMatchObject({enabled: false, hint: WAVE_LINE});
    expect(resetModel({kind: 'member'})).toEqual({kind: 'member', line: MEMBER_LINE});
    expect(resetModel(null).kind).toBe('none');
  });

  it('names the starting coins when the island answer has them, else says "your starting coins"', () => {
    expect(resetWhat(200)).toContain('your coins become 🪙 200.');
    expect(resetWhat(undefined)).toContain('your coins become your starting coins.');
    expect(doneLine(200)).toBe('Your island starts fresh: 🪙 200 and wave 1. Ring the bell when you are ready.');
    expect(doneLine(null)).toContain('your starting coins and wave 1');
  });

  it('the registry skips a provider that breaks or gives nothing', () => {
    const element = {nodeType: 1};
    const stops = [addSettingsSection(() => element), addSettingsSection(() => { throw new Error('x'); }), addSettingsSection(() => null)];
    expect(settingsSections()).toEqual([element]);
    for (const stop of stops) stop();
    expect(settingsSections()).toEqual([]);
  });
});

describe('the narrator after a reset', () => {
  it('forgets the island game, so the game_started that follows plays the opening again', async () => {
    vi.useFakeTimers();
    try {
      const listeners = new Map();
      const on = (type, listener) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); return () => listeners.get(type).delete(listener); };
      const emit = event => { for (const listener of listeners.get(event.type) ?? []) listener(event); };
      const map = new Map(), storage = {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value))};
      const shown = [];
      const narrator = createNarrator({on, storage, getGame: () => ({code: 'ISLE-K7Q2M', waveBest: 0}), preferences: () => ({narrator: true, captions: true}),
        onPreferences: () => () => {}, fetchImpl: null,
        lines: [{id: 'opening_1', trigger: 'game_opening', text: 'The light is out.'}, {id: 'back_1', trigger: 'game_welcome_back', text: 'Welcome back.'}],
        createCard: () => ({show: line => shown.push(line.id), hide() {}, dispose() {}})});
      emit({type: 'game_started', code: 'ISLE-K7Q2M', first: true});
      await vi.advanceTimersByTimeAsync(10000);
      emit({type: 'game_started', code: 'ISLE-K7Q2M', first: true}); // the same page: nothing again
      await vi.advanceTimersByTimeAsync(10000);
      emit({type: 'island_reset', code: 'ISLE-K7Q2M'});
      emit({type: 'game_started', code: 'ISLE-K7Q2M', first: true, fresh: true});
      await vi.advanceTimersByTimeAsync(10000);
      expect(shown).toEqual(['opening_1', 'opening_1']);
      narrator.dispose();
    } finally { vi.useRealTimers(); }
  });
});
