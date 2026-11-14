// The island arsenal (T40, T41, D042): the fake server's rules (the SQL of 20261114120000_arsenal.sql), the card
// model, the api's click ids and the building's zone. The real invariants run on PostgreSQL in
// backend/server/tests/island_sql/test_arsenal_sql.py; these keep the browser's fake and card honest.
import {describe, expect, it} from 'vitest';
import {createFakeIslandApi, createFakeIslandTransport} from '../../src/pirates/fake-api.js';
import {arsenalModel, readArsenal, weaponStats} from '../../src/island/arsenal-model.js';
import {createArsenalApi, ARSENAL_PATHS} from '../../src/island/arsenal-api.js';
import {createArsenal} from '../../src/island/arsenal.js';
import {ARSENAL, isIslandZone, islandZones} from '../../src/island/spots.js';
import {arsenalFrames} from '../../src/art/arsenal.js';
import {islandFrame} from '../../src/art/registry.js';
import {WEAPONS} from '../../src/pirates/captain-ids.js';

// A fake world with your island (wave 10 won: every type unlocked) and a crewmate in your game.
function world(coins = 100000) {
  const transport = createFakeIslandTransport({coins, unlocking: true});
  transport.dev.setWaveBest(10);
  transport.dev.addCrew('mate', 'Captain Gull');
  return {transport, api: transport.api};
}
let clicks = 0;
const uid = () => `click-${String(++clicks).padStart(6, '0')}`;
async function refusal(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a refusal');
}
async function fill(api, count) {
  await api.arsenalBuy({weapon: 'pistols', actionUid: uid()}); // into your hands
  for (let i = 0; i < count; i++) await api.arsenalBuy({weapon: 'pistols', actionUid: uid()});
}

describe('the fake arsenal keeps the rules of the database', () => {
  it('stores 19, then 20, and refuses the 21st without charging', async () => {
    const {api} = world();
    await fill(api, 19);
    expect((await api.arsenal()).stored).toBe(19);
    expect((await api.arsenalBuy({weapon: 'pistols', actionUid: uid()})).stored).toBe(20);
    const coins = (await api.arsenal()).coins;
    const full = await refusal(api.arsenalBuy({weapon: 'blunderbuss', actionUid: uid()}));
    expect([full.status, full.code]).toEqual([409, 'arsenal_full']);
    expect((await api.arsenal()).coins).toBe(coins);
  });
  it('refuses a return into a full rack and the copy stays in your hands; a swap still works', async () => {
    const {api} = world();
    await fill(api, 20);
    const before = await api.arsenal();
    const full = await refusal(api.arsenalReturn({actionUid: uid()}));
    expect(full.code).toBe('arsenal_full');
    expect((await api.arsenal()).mine).toBe(before.mine);
    const stored = before.copies.find(copy => copy.holder === null);
    const swapped = await api.arsenalTake({copy: stored.id, actionUid: uid()});
    expect([swapped.mine, swapped.stored]).toEqual([stored.id, 20]);
  });
  it('gives one copy to one captain: a second captain is refused taken', async () => {
    const {transport, api} = world();
    const copy = (await api.arsenalBuy({weapon: 'long_rifle', actionUid: uid()})).mine;
    const mate = createFakeIslandApiFor(transport, 'mate');
    const code = (await api.arsenal()).code;
    const taken = await refusal(mate.arsenalTake({copy, actionUid: uid(), code}));
    expect(taken.code).toBe('taken');
    await api.arsenalReturn({actionUid: uid()});
    const answer = await mate.arsenalTake({copy, actionUid: uid(), code});
    expect(answer.copies.find(item => item.id === copy)).toMatchObject({holderName: 'Captain Gull', you: true});
  });
  it('keeps same-type copies apart with their own numbers, and a repeated click changes nothing', async () => {
    const {api} = world();
    const click = uid();
    const first = await api.arsenalBuy({weapon: 'pistols', actionUid: click});
    const again = await api.arsenalBuy({weapon: 'pistols', actionUid: click});
    expect(again).toEqual(first);
    const second = await api.arsenalBuy({weapon: 'pistols', actionUid: uid()});
    expect(second.copies.map(copy => `${copy.weapon}#${copy.no}`)).toEqual(['pistols#1', 'pistols#2']);
    expect(new Set(second.copies.map(copy => copy.id)).size).toBe(2);
    expect((await refusal(api.arsenalReturn({actionUid: click}))).code).toBe('action_used');
  });
  it('refuses the musket, a locked type and too few coins', async () => {
    const transport = createFakeIslandTransport({coins: 10, unlocking: true});
    expect((await refusal(transport.api.arsenalBuy({weapon: 'musket', actionUid: uid()}))).code).toBe('standard_weapon');
    expect((await refusal(transport.api.arsenalBuy({weapon: 'fire_bombs', actionUid: uid()}))).code).toBe('locked');
    transport.dev.setWaveBest(10);
    expect((await refusal(transport.api.arsenalBuy({weapon: 'pistols', actionUid: uid()}))).code).toBe('insufficient_funds');
  });
});

// A second captain on the same fake world.
const createFakeIslandApiFor = (transport, playerId) => createFakeIslandApi({world: transport.world, playerId, unlocking: true});

describe('the old weapon shop and the flag', () => {
  it('answers 409 use_arsenal while the flag is on, as the server, and still sells while it is off', async () => {
    const on = createFakeIslandTransport({coins: 1000, unlocking: true, flags: {arsenal: true}});
    on.dev.setWaveBest(10);
    const coins = (await on.api.island()).coins;
    const refused = await refusal(on.api.buyWeapon({weapon: 'pistols', actionUid: uid()}));
    expect([refused.status, refused.code]).toEqual([409, 'use_arsenal']);
    expect((await on.api.island()).coins).toBe(coins);
    const off = createFakeIslandTransport({coins: 1000, unlocking: true});
    off.dev.setWaveBest(10);
    expect((await off.api.buyWeapon({weapon: 'pistols', actionUid: uid()})).weapons.equipped).toBe('pistols');
  });
});

describe('the arsenal card', () => {
  const answer = (overrides = {}) => ({code: 'ISLE-K7Q2M', capacity: 20, stored: 1, mine: 'a', carried: 'pistols', waveRunning: false,
    coins: 100, unlockWave: 4, copies: [{id: 'a', no: 1, weapon: 'pistols', holder: 'me', holderName: 'You', away: false, you: true},
      {id: 'b', no: 2, weapon: 'blunderbuss', holder: null, holderName: null, away: false, you: false},
      {id: 'c', no: 3, weapon: 'pistols', holder: 'x', holderName: 'Captain Gull', away: true, you: false}],
    types: WEAPONS.map(type => ({id: type.id, name: type.name, price: type.price, unlockWave: type.unlockWave, unlocked: type.unlockWave <= 4})), ...overrides});
  it('shows the stored count, each copy and its holder, and what you carry', () => {
    const model = arsenalModel({answer: answer()});
    expect(model.stock).toBe('Stored: 1 of 20');
    expect(model.carry.name).toBe('Pistols #1');
    expect(model.rack.map(row => [row.label, row.holder, row.button?.label ?? null])).toEqual([
      ['Pistols #1', 'You carry it', null], ['Blunderbuss #2', '', 'Swap'], ['Pistols #3', 'Carried by Captain Gull (left the game)', null]]);
    expect(model.shop.map(row => [row.id, row.button.label])).toEqual([['pistols', 'Buy · 🪙 60'], ['blunderbuss', 'Buy · 🪙 120'],
      ['long_rifle', 'Locked'], ['fire_bombs', 'Locked']]);
    expect(model.shop[1].button.disabled).toBe(true); // 100 coins < 120
  });
  it('a full rack: return off with its reason, swap on, buying only into empty hands', () => {
    const full = arsenalModel({answer: answer({stored: 20})});
    expect(full.stock).toBe('Stored: 20 of 20 · Full');
    expect(full.back).toMatchObject({disabled: true});
    expect(full.back.reason).toContain('swap instead');
    expect(full.rack[1].button).toMatchObject({label: 'Swap', disabled: false});
    expect(full.shop[0].button).toMatchObject({disabled: true, reason: 'The arsenal is full: return or swap a weapon first.'});
    const empty = arsenalModel({answer: answer({stored: 20, mine: null, carried: 'musket', copies: answer().copies.slice(1)})});
    expect(empty.carry.name).toBe('Musket (standard issue)');
    expect(empty.back).toBe(null);
    expect(empty.shop[0].button.disabled).toBe(false);
    expect(empty.rack[0].button.label).toBe('Take');
  });
  it('during a wave every move is off, with the reason', () => {
    const model = arsenalModel({answer: answer({waveRunning: true})});
    expect(model.rack[1].button).toMatchObject({disabled: true, reason: 'A wave is under way. Use the arsenal between waves.'});
    expect(model.back.disabled).toBe(true);
    expect(model.shop.every(row => row.button.disabled)).toBe(true);
  });
  it('shows the real numbers of each type for your captain level, and they differ', () => {
    expect(weaponStats('musket', 1)).toBe('Damage 6 · Range 14 · Reload 1.2 s');
    expect(new Set(WEAPONS.map(type => weaponStats(type.id, 1))).size).toBe(WEAPONS.length);
    expect(new Set(WEAPONS.map(type => type.price)).size).toBe(WEAPONS.length);
  });
  it('loading and a bad answer', () => {
    expect(arsenalModel({loading: true}).lead).toBe('Opening the arsenal…');
    expect(readArsenal({code: 'x'})).toBe(false);
  });
});

describe('the arsenal api and controller', () => {
  it('sends the same click id again after an unknown outcome, a new one after a clear answer', async () => {
    const sent = [];
    let answer = {ok: false, status: 503, code: 'database_unavailable', message: 'Try again.'};
    const transport = {get: async () => answer, post: async (path, body) => { sent.push([path, body.actionUid]); return answer; }};
    const api = createArsenalApi({transport, makeUid: (() => { let n = 0; return () => `uid-${String(++n).padStart(5, '0')}`; })()});
    await api.giveBack();
    await api.giveBack();
    answer = {ok: false, status: 409, code: 'nothing_held', message: 'No.'};
    await api.giveBack();
    await api.giveBack();
    expect(sent.map(item => item[1])).toEqual(['uid-00001', 'uid-00001', 'uid-00001', 'uid-00002']);
    expect(ARSENAL_PATHS.state('ISLE-K7Q2M')).toBe('/api/island/arsenal?code=ISLE-K7Q2M');
  });
  it('a refused move keeps its reason on the card after the arsenal is read again', async () => {
    const {transport, api} = world();
    await api.arsenalBuy({weapon: 'pistols', actionUid: uid()}); // stored copy #1 goes into your hands
    await api.arsenalReturn({actionUid: uid()});
    const copy = (await api.arsenal()).copies[0].id;
    const cards = [];
    const ui = {open: 'arsenal', arsenalCard: model => cards.push(model), toast: () => {}};
    let taken = false;
    const real = createArsenalApi({transport});
    const arsenalApi = {...real, take: async args => (taken ? {ok: false, status: 409, code: 'taken', message: 'Another captain took that weapon just now.'} : real.take(args))};
    const arsenal = createArsenal({api: arsenalApi, ui, enabled: () => true});
    await arsenal.refresh();
    taken = true;
    arsenal.handlers.take(copy);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(cards.at(-1).message).toBe('Another captain took that weapon just now.');
  });
  it('the weapon you carry follows the server; nothing while the flag is off', async () => {
    const transport = createFakeIslandTransport({coins: 1000, unlocking: false});
    const cards = [], toasts = [], events = [];
    const ui = {open: 'arsenal', arsenalCard: model => cards.push(model), toast: text => toasts.push(text)};
    let on = true;
    const arsenal = createArsenal({api: createArsenalApi({transport}), ui, emit: event => events.push(event), enabled: () => on});
    await arsenal.refresh();
    expect(arsenal.weapon()).toBe('musket');
    arsenal.handlers.buy('long_rifle'); await new Promise(resolve => setTimeout(resolve, 0)); await arsenal.refresh();
    expect(arsenal.weapon()).toBe('long_rifle');
    expect(toasts.at(-1)).toBe('Long rifle #1 bought: you carry it now.');
    expect(events.map(event => event.spot ?? event.carried)).toEqual(['island_arsenal', 'long_rifle']);
    arsenal.handlers.giveBack(); await new Promise(resolve => setTimeout(resolve, 0)); await arsenal.refresh();
    expect(arsenal.weapon()).toBe('musket');
    on = false;
    await arsenal.refresh();
    expect(arsenal.weapon()).toBe(null);
    expect(cards.at(-1).title).toBe('Arsenal');
  });
});

describe('the arsenal building', () => {
  it('has its own zone only while the flag is on, on land, with walk-up reach', () => {
    expect(islandZones().some(zone => zone.id === ARSENAL.id)).toBe(false);
    const zone = islandZones({arsenal: true}).find(item => item.id === ARSENAL.id);
    expect(zone).toMatchObject({name: 'Arsenal'});
    expect(Math.hypot(zone.x - ARSENAL.x, zone.z - ARSENAL.z)).toBeLessThan(3);
    expect(isIslandZone(ARSENAL.id)).toBe(true);
  });
  it('is an original drawing in the cartoon pipeline', () => {
    expect(arsenalFrames()['island-arsenal'].slice(0, 3)).toEqual([80, 80, 8]);
    expect(islandFrame('island-arsenal')).not.toBe(null);
  });
});
