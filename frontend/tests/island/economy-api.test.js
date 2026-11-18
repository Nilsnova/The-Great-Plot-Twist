// Shared mutation capabilities are assertions, not a client-chosen payer; uncertain retries keep their origin.
import {describe, expect, it, vi} from 'vitest';
import {createIslandApi, isIsland, isVisit} from '../../src/island/api.js';
import {economyContext} from '../../src/island/economy-view.js';
import {personalCaptain, personalReply, sharedEconomy, sharedIsland} from './economy-fixture.js';

describe('shared economy API adaptation', () => {
  it('reads exact shared funds without requiring a legacy numeric wallet field', async () => {
    const data = sharedIsland();
    expect(isIsland(data)).toBe(true);
    expect(isVisit({...data, ownerName: 'Captain Fern'})).toBe(true);
    expect(isIsland({...data, coins: 9999, economy: {...data.economy, version: 2}})).toBe(false);
    const api = createIslandApi({transport: {get: async () => ({ok: true, data}), post() {}}});
    expect((await api.getIsland()).data.economy.treasury.availableCoins).toBe('75');
  });

  it('asserts owner and epoch for a visitor crew purchase without sending a payer or account', async () => {
    const economy = sharedEconomy(), post = vi.fn(async () => ({ok: true, data: sharedIsland()}));
    const api = createIslandApi({transport: {get() {}, post}, economy: () => economy, makeUid: () => 'click000001'});
    expect((await api.hire({crew: 'gunner', code: 'ISLE-FR3ND'})).ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/api/island/hire', {crew: 'gunner', code: 'ISLE-FR3ND', actionUid: 'click000001', economy: economyContext(economy)});
    const body = post.mock.calls[0][1];
    expect(body).not.toHaveProperty('payer');
    expect(body.economy).not.toHaveProperty('accountId');
  });

  it('keeps a retry identity in one run and creates a separate identity after an epoch switch', async () => {
    let economy = sharedEconomy(), counter = 0;
    const post = vi.fn(async () => ({ok: false, status: 503, code: 'database_unavailable', message: 'Read the island before retrying.'}));
    const api = createIslandApi({transport: {get() {}, post}, economy: () => economy, makeUid: () => `click${String(++counter).padStart(6, '0')}`});
    await api.build({spot: 'wall_1', kind: 'wall'});
    await api.build({spot: 'wall_1', kind: 'wall'});
    economy = sharedEconomy({runEpoch: '44444444-4444-4444-8444-444444444444'});
    await api.build({spot: 'wall_1', kind: 'wall'});
    expect(post.mock.calls.map(call => call[1].actionUid)).toEqual(['click000001', 'click000001', 'click000002']);
    expect(post.mock.calls[2][1].economy.runEpoch).toBe(economy.runEpoch);
  });

  it('fails closed on unavailable shared context and preserves the old legacy request body', async () => {
    const post = vi.fn(async () => ({ok: true, data: {...sharedIsland(), economy: undefined, coins: 100}}));
    const invalid = createIslandApi({transport: {get() {}, post}, economy: () => null});
    expect(await invalid.build({spot: 'wall_1', kind: 'wall'})).toMatchObject({ok: false, status: 409, code: 'economy_context_required'});
    expect(post).not.toHaveBeenCalled();
    const legacy = createIslandApi({transport: {get() {}, post}, makeUid: () => 'legacy000001'});
    await legacy.build({spot: 'wall_1', kind: 'wall'});
    expect(post.mock.calls[0][1]).toEqual({spot: 'wall_1', kind: 'wall', actionUid: 'legacy000001'});
  });

  it('does not fall back to the old personal weapon shop on a shared island', async () => {
    const post = vi.fn();
    const api = createIslandApi({transport: {get() {}, post}, economy: () => sharedEconomy()});
    expect(api).not.toHaveProperty('buyWeapon');
    expect(api).not.toHaveProperty('equipWeapon');
    expect(post).not.toHaveBeenCalled();
  });

  it('does not invoke coin level or respec routes for v1 personal progression on a legacy economy', async () => {
    const post = vi.fn(async () => ({ok: true, data: personalReply()}));
    const api = createIslandApi({transport: {get() {}, post}, personalCaptain: () => personalCaptain()});
    expect(await api.upgradeCaptain()).toMatchObject({ok: false, code: 'economy_path_unavailable'});
    expect((await api.respec()).ok).toBe(true);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0]).toBe('/api/captain/respec');
    expect(post.mock.calls[0][1]).toMatchObject({progressionVersion: 1, expectedRevision: '1'});
    expect(post.mock.calls[0][1]).not.toHaveProperty('economy');
    expect(post.mock.calls[0][1]).not.toHaveProperty('code');
  });

  it('freezes a personal retry revision independently of changing treasury and profile reads', async () => {
    let profile = personalCaptain({revision: '4'}), money = sharedEconomy(), count = 0;
    const post = vi.fn(async () => ({ok: false, status: 503, code: 'database_unavailable', message: 'Read personal progress before retrying.'}));
    const api = createIslandApi({transport: {get() {}, post}, personalCaptain: () => profile, economy: () => money,
      makeUid: () => `personal${String(++count).padStart(6, '0')}`});
    await api.respec();
    profile = personalCaptain({revision: '5'}); money = sharedEconomy({runEpoch: '44444444-4444-4444-8444-444444444444'});
    await api.respec();
    expect(post.mock.calls.map(call => call[1])).toEqual([
      {progressionVersion: 1, expectedRevision: '4', actionUid: 'personal000001'},
      {progressionVersion: 1, expectedRevision: '4', actionUid: 'personal000001'},
    ]);
  });
});
