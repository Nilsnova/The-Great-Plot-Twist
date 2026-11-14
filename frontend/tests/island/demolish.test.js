// Tearing a building down (GAME-V3.md §4.2): the fake server's rules (the SQL of island_demolish()), the
// island client, the card models, the room's note for the payers' toast, and the build spot marker's frames.
import {describe, expect, it} from 'vitest';
import {createFakeIslandApi as createFunctionApi, createFakeWorld, FAKE_FRIEND} from '../../src/pirates/fake-api.js';
import {createFakeIslandApi} from './fake.js';
import {buildCardModel, demolishModel, refundToast} from '../../src/island/card-model.js';
import {isDemolishQuote, isDemolished, PATHS} from '../../src/island/api.js';
import {readWaveMessage, PROTOCOL_VERSION} from '../../src/net/live-rules.js';
import {lockWave} from '../../src/island/world.js';
import {islandFrames, NO_OUTLINE} from '../../src/art/island.js';
import {campaignFrames, LOCK_WAVES} from '../../src/art/campaign.js';

const clock = (start = Date.UTC(2026, 10, 12, 12, 0, 0)) => {
  let now = start;
  return {now: () => now, advance: seconds => { now += seconds * 1000; }};
};
async function refusal(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a refusal');
}
const coinsOf = (world, id) => world.players.get(id).coins;
const spotOf = (view, id) => view.spots.find(spot => spot.id === id);

// The host (Nils) with Ana in his game, and Max who is not in it.
async function game() {
  const time = clock(), world = createFakeWorld();
  const host = createFunctionApi({world, playerId: 'nils', ownerName: 'Nils', now: time.now});
  const ana = createFunctionApi({world, playerId: 'ana', ownerName: 'Ana', now: time.now});
  const max = createFunctionApi({world, playerId: 'max', ownerName: 'Max', now: time.now});
  const code = (await host.island()).code;
  await ana.island(); await max.island();
  await ana.joinGame({code, actionUid: 'join-ana-1'});
  for (const id of ['nils', 'ana', 'max']) world.players.get(id).coins = 1000;
  return {time, world, host, ana, max, code};
}

describe('tearing down on the fake server (the rules of island_demolish)', () => {
  it('two payers each get back half of what they paid themselves, rounded down; the spot is empty for both', async () => {
    const {world, host, ana, code} = await game();
    await host.build({spot: 'cannon_1', kind: 'cannon', actionUid: 'build-0001'}); // 🪙 30, the host
    await ana.upgrade({spot: 'cannon_1', actionUid: 'upgrade-001', code}); // 🪙 60, Ana
    await host.upgrade({spot: 'cannon_1', actionUid: 'upgrade-002'}); // 🪙 120, the host
    const quote = await ana.demolishQuote({spot: 'cannon_1', code});
    expect(quote).toMatchObject({spot: 'cannon_1', kind: 'cannon', name: 'Cannon', level: 3});
    expect(quote.refunds).toEqual([{id: 'nils', name: 'Nils', coins: 75, you: false}, {id: 'ana', name: 'Ana', coins: 30, you: true}]);
    expect([coinsOf(world, 'nils'), coinsOf(world, 'ana')]).toEqual([850, 940]); // the quote changes nothing
    const done = await ana.demolish({spot: 'cannon_1', actionUid: 'demolish-01', code});
    expect(done.demolished).toMatchObject({kind: 'cannon', level: 3, repeat: false});
    expect([coinsOf(world, 'nils'), coinsOf(world, 'ana')]).toEqual([925, 970]);
    expect(done.coins).toBe(970);
    expect(spotOf(done, 'cannon_1')).toMatchObject({built: false});
    expect(spotOf(await host.island(), 'cannon_1')).toMatchObject({built: false});
  });

  it('a legacy building (no payment rows) pays the host half its catalogue value; later levels go to their payer', async () => {
    const time = clock(), world = createFakeWorld({friends: [FAKE_FRIEND]}), FAKE_FRIEND_CODE = `ISLE-${FAKE_FRIEND.code}`;
    const me = createFunctionApi({world, now: time.now});
    await me.island(); world.players.get('me').coins = 500;
    // Captain Gull's island (FR3ND): wall_1, wall_2, cannon_1 and tower_1 stand from before, nobody's rows.
    const before = coinsOf(world, 'friend');
    expect((await me.demolishQuote({spot: 'cannon_1', code: FAKE_FRIEND_CODE})).refunds).toEqual([{id: 'friend', name: 'Captain Gull', coins: 15, you: false}]);
    await me.demolish({spot: 'cannon_1', actionUid: 'demolish-02', code: FAKE_FRIEND_CODE});
    expect(coinsOf(world, 'friend')).toBe(before + 15);
    expect(coinsOf(world, 'me')).toBe(500);
    await me.upgrade({spot: 'wall_1', actionUid: 'upgrade-003', code: FAKE_FRIEND_CODE}); // level 2: 🪙 20, me
    expect((await me.demolishQuote({spot: 'wall_1', code: FAKE_FRIEND_CODE})).refunds)
      .toEqual([{id: 'me', name: 'You', coins: 10, you: true}, {id: 'friend', name: 'Captain Gull', coins: 5, you: false}]);
  });

  it('a repeated click pays nothing twice; another click finds nothing standing', async () => {
    const {world, host} = await game();
    await host.build({spot: 'wall_1', kind: 'wall', actionUid: 'build-0002'});
    await host.upgrade({spot: 'wall_1', actionUid: 'upgrade-004'});
    const first = await host.demolish({spot: 'wall_1', actionUid: 'demolish-03'});
    expect(coinsOf(world, 'nils')).toBe(1000 - 30 + 15);
    const again = await host.demolish({spot: 'wall_1', actionUid: 'demolish-03'});
    expect(again.demolished).toMatchObject({...first.demolished, repeat: true});
    expect(coinsOf(world, 'nils')).toBe(985);
    expect((await refusal(host.demolish({spot: 'wall_1', actionUid: 'demolish-04'}))).code).toBe('not_built');
  });

  it('nothing comes down while a wave runs or counts down; in the break it does', async () => {
    const {time, host, ana, code} = await game();
    await host.build({spot: 'cannon_2', kind: 'cannon', actionUid: 'build-0003'});
    const wave = await host.startWave({where: 'own', actionUid: 'start-0001'});
    for (const call of [host.demolishQuote({spot: 'cannon_2'}), host.demolish({spot: 'cannon_2', actionUid: 'demolish-05'}),
      ana.demolish({spot: 'cannon_2', actionUid: 'demolish-06', code})]) {
      expect(await refusal(call)).toMatchObject({status: 409, code: 'wave_running'});
    }
    time.advance(30);
    await host.finishWave({waveId: wave.waveId, survived: true, shipsSunk: 2});
    expect((await host.demolish({spot: 'cannon_2', actionUid: 'demolish-07'})).demolished.refunds).toEqual([{id: 'nils', name: 'Nils', coins: 15, you: true}]);
  });

  it('only a member of the game tears down', async () => {
    const {host, max, code} = await game();
    await host.build({spot: 'house_1', kind: 'house', actionUid: 'build-0004'});
    expect(await refusal(max.demolishQuote({spot: 'house_1', code}))).toMatchObject({status: 403, code: 'not_member'});
    expect(await refusal(max.demolish({spot: 'house_1', actionUid: 'demolish-08', code}))).toMatchObject({status: 403, code: 'not_member'});
    expect(spotOf(await host.island(), 'house_1').built).toBe(true);
  });

  it('the heart, the bell and the campaign buildings never come down', async () => {
    const {host} = await game();
    for (const spot of ['cabin', 'heart', 'island_bell', 'island_harbor', 'island_techhub', 'island_wreck']) {
      expect(await refusal(host.demolish({spot, actionUid: 'demolish-09'}))).toMatchObject({status: 409, code: 'protected'});
    }
    expect(await refusal(host.demolish({spot: 'wall_13', actionUid: 'demolish-10'}))).toMatchObject({status: 404, code: 'no_such_spot'});
  });

  it('a building rebuilt on the same spot starts with no payments and no tower skill', async () => {
    const {world, host, ana, code} = await game();
    await host.build({spot: 'cannon_3', kind: 'cannon', actionUid: 'build-0005'});
    await host.upgrade({spot: 'cannon_3', actionUid: 'upgrade-005'});
    world.islands.get(code.replace('ISLE-', '')).specs = new Map([['cannon_3', 'heavy']]);
    expect(spotOf(await host.island(), 'cannon_3').spec).toBe('heavy');
    await host.demolish({spot: 'cannon_3', actionUid: 'demolish-11'});
    await ana.build({spot: 'cannon_3', kind: 'cannon', actionUid: 'build-0006', code});
    expect(spotOf(await host.island(), 'cannon_3')).toMatchObject({built: true, level: 1, spec: null});
    expect((await host.demolishQuote({spot: 'cannon_3'})).refunds).toEqual([{id: 'ana', name: 'Ana', coins: 15, you: false}]);
  });

  it('answers the routes with the real JSON, and a bad body is a 422', async () => {
    const {host} = await game();
    await host.build({spot: 'wall_4', kind: 'wall', actionUid: 'build-0007'});
    const quote = await host.fetch('/api/island/demolish?spot=wall_4');
    expect(quote.status).toBe(200);
    expect(await quote.json()).toMatchObject({spot: 'wall_4', kind: 'wall', level: 1, refunds: [{id: 'nils', coins: 5, you: true}]});
    const bad = await host.fetch('/api/island/demolish', {method: 'POST', body: JSON.stringify({spot: 'wall_4'})});
    expect(bad.status).toBe(422);
    const done = await host.fetch('/api/island/demolish', {method: 'POST', body: JSON.stringify({spot: 'wall_4', actionUid: 'demolish-12'})});
    expect(done.status).toBe(200);
    expect((await done.json()).demolished).toMatchObject({spot: 'wall_4', repeat: false});
  });
});

describe('tearing down through the island client', () => {
  it('asks the quote, tears down, and refuses what does not stand or a bad code', async () => {
    let n = 0;
    const api = createFakeIslandApi({makeUid: () => `click${String(++n).padStart(6, '0')}`});
    await api.getIsland();
    await api.build({spot: 'cannon_1', kind: 'cannon'});
    const quote = await api.demolishQuote({spot: 'cannon_1'});
    expect(quote).toMatchObject({ok: true, data: {spot: 'cannon_1', kind: 'cannon', level: 1}});
    expect(quote.data.refunds).toMatchObject([{coins: 15, you: true}]);
    const done = await api.demolish({spot: 'cannon_1'});
    expect(done.ok).toBe(true);
    expect(done.data.demolished).toMatchObject({kind: 'cannon', level: 1});
    expect(done.data.spots.find(spot => spot.id === 'cannon_1').built).toBe(false);
    expect(await api.demolish({spot: 'cannon_1'})).toMatchObject({ok: false, code: 'not_built'});
    expect(await api.demolish({spot: 'cannon_1', code: 'nope'})).toMatchObject({ok: false, code: 'validation_error'});
  });
  it('the paths and the answer checks', () => {
    expect(PATHS.demolish).toBe('/api/island/demolish');
    expect(PATHS.demolishQuote('cannon_1')).toBe('/api/island/demolish?spot=cannon_1');
    expect(PATHS.demolishQuote('cannon_1', 'ISLE-K7Q2M')).toBe('/api/island/demolish?spot=cannon_1&code=ISLE-K7Q2M');
    const quote = {spot: 'cannon_1', kind: 'cannon', name: 'Cannon', level: 3, refunds: [{id: 'a', name: 'Ana', coins: 30, you: false}]};
    expect(isDemolishQuote(quote)).toBe(true);
    for (const bad of [null, {...quote, level: 0}, {...quote, refunds: [{id: 'a', name: 'Ana', coins: -1, you: false}]},
      {...quote, refunds: Array.from({length: 11}, () => quote.refunds[0])}, {...quote, refunds: [{id: 'a', coins: 3, you: false}]}]) {
      expect(isDemolishQuote(bad)).toBe(false);
    }
    expect(isDemolished({spots: [], coins: 3, demolished: quote})).toBe(true);
    expect(isDemolished({spots: [], coins: 3})).toBe(false);
  });
});

describe('the cards', () => {
  const cannon = (level = 3) => ({id: 'cannon_1', kind: 'cannon', built: true, level, cost: 30});
  it('a built building has a secondary Tear down, off while a wave runs; an empty spot and Pirate Point have none', () => {
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon()}).demolish).toEqual({label: 'Tear down', disabled: false, reason: ''});
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon(5)}).demolish).toMatchObject({disabled: false}); // at its highest level too
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon(), battle: true}).demolish)
      .toEqual({label: 'Tear down', disabled: true, reason: 'You can tear it down between waves.'});
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon(), busy: 'upgrade'}).demolish.disabled).toBe(true);
    expect(buildCardModel({spotId: 'cannon_1', spot: {id: 'cannon_1', kind: 'cannon', built: false, level: 0, cost: 30}}).demolish).toBe(null);
    expect(buildCardModel({spotId: 'pp_tower_1', spot: cannon(), point: true}).demolish).toBe(null);
  });
  it('the confirmation says what each payer gets back, you first, and waits for the quote', () => {
    expect(demolishModel()).toMatchObject({title: 'Tear down?', disabled: true, keep: 'Keep it', question: 'Working out who gets coins back…'});
    const quote = {kind: 'cannon', name: 'Cannon', level: 3, refunds: [{id: 'nils', name: 'Nils', coins: 75, you: false}, {id: 'ana', name: 'Ana', coins: 30, you: true}]};
    const model = demolishModel({quote});
    expect(model.question).toBe('Tear down this Cannon (level 3)?');
    expect(model.lines).toEqual(['You get back 🪙 30.', 'Nils gets back 🪙 75.']);
    expect(model).toMatchObject({button: 'Tear down', disabled: false, note: 'Everyone gets back half of what they paid for it.'});
    expect(demolishModel({quote, busy: true})).toMatchObject({button: 'Tearing down…', disabled: true});
    expect(demolishModel({quote: {...quote, refunds: [{id: 'nils', name: 'Nils', coins: 75, you: false}]}}).lines)
      .toEqual(['You paid nothing for it, so you get nothing back.', 'Nils gets back 🪙 75.']);
    expect(demolishModel({message: 'A wave is under way. Tear it down between waves.'}).question).toBe('');
  });
  it('a toast for a payer whose refund arrived, not for the one who tore it down', () => {
    const demolished = {who: 'nils', kind: 'cannon', level: 3, refunds: [{id: 'nils', coins: 75}, {id: 'ana', coins: 30}, {id: 'max', coins: 0}]};
    expect(refundToast({demolished, me: 'ana', whoName: 'Nils'})).toBe('Nils tore down the Cannon. You got back 🪙 30.');
    expect(refundToast({demolished, me: 'ana'})).toBe('A teammate tore down the Cannon. You got back 🪙 30.');
    expect(refundToast({demolished, me: 'nils'})).toBe(null);
    expect(refundToast({demolished, me: 'max'})).toBe(null);
    expect(refundToast({demolished, me: 'ben'})).toBe(null);
  });
});

describe("the room's note for the payers' toast", () => {
  const msg = data => ({v: PROTOCOL_VERSION, id: '0b5e2c4a-1f2d-4c3b-9a8e-7d6c5b4a3f21', seq: 4, data});
  const uuid = n => `${String(n).repeat(8)}-1111-2222-3333-444455556666`;
  it('island_changed may carry who tore down what and who got how many coins back (the largest note fits)', () => {
    const note = {who: uuid(1), kind: 'watchtower', level: 5, refunds: Array.from({length: 6}, (_, i) => ({id: uuid(i + 1), coins: 1000000}))};
    expect(readWaveMessage('island_changed', msg({spot: 'tower_1', demolished: note}))).toMatchObject({data: {spot: 'tower_1', demolished: note}});
    expect(readWaveMessage('island_changed', msg({spot: 'tower_1', demolished: {kind: 'wall', level: 1, refunds: []}}))).not.toBe(null);
    for (const bad of [{...note, level: 6}, {...note, kind: '<b>'}, {...note, refunds: [...note.refunds, note.refunds[0]]},
      {...note, refunds: [{id: 'a', coins: -1}]}, {...note, refunds: [{id: 'a', coins: 1, extra: 1}]}, {...note, extra: 1}, 'cannon']) {
      expect(readWaveMessage('island_changed', msg({spot: 'tower_1', demolished: bad}))).toBe(null);
    }
  });
});

describe('the build spot marker (src/art/island.js, src/art/campaign.js)', () => {
  it('one gold "+" badge for every kind, a slate padlock with the wave for a spot that opens later', () => {
    const island = islandFrames(), campaign = campaignFrames();
    expect(island['build-badge'].slice(0, 3)).toEqual([24, 24, 0]);
    expect(island['build-ring'].slice(0, 3)).toEqual([48, 24, 0]);
    for (const kind of ['wall', 'tower', 'cannon', 'watchtower', 'house']) expect(island[`build-badge-${kind}`][3]).toBe(island['build-badge'][3]);
    expect(campaign['build-ring-locked'].slice(0, 3)).toEqual([48, 24, 0]);
    for (const wave of LOCK_WAVES) expect(campaign[`build-badge-locked-${wave}`].slice(0, 3)).toEqual([24, 24, 0]);
    expect(NO_OUTLINE.has('build-ring-locked')).toBe(true);
  });
  it('the padlock shows the first wave any kind of the spot opens after', () => {
    expect(lockWave(['house'], null)).toBe(1);
    expect(lockWave(['watchtower'], {locked: {'watchtower:1': 3}})).toBe(3);
    expect(lockWave([], null)).toBe(null);
  });
});
