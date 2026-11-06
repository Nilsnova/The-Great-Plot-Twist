// The local stand-in for the two islet routes must answer like the real server: same statuses, codes and check order.
import {describe, expect, it} from 'vitest';
import {createFakeIsletTransport} from '../src/screens/islet/fake-transport.js';

const ISLET = '/api/islet';
const BUILD = '/api/islet/build';
const STATION = {plot: 'islet_signal_station', type: 'signal_station'};
const WORKSHOP = {plot: 'plot_2', type: 'workshop'};

let clicks = 0;
const click = fields => ({actionUid: `click-${String(++clicks).padStart(6, '0')}`, ...fields});
const makeFake = () => createFakeIsletTransport({now: () => new Date('2026-11-16T10:00:00.456Z')});
const spotOf = (answer, plot) => answer.data.spots.find(spot => spot.plot === plot);
const refusal = (status, code) => expect.objectContaining({ok: false, status, code});

describe('GET /api/islet', () => {
  it('shows a new player 1000 coins, the starter pack of 20 timber and the five spots in file order', async () => {
    const answer = await makeFake().get(ISLET);
    expect(answer).toMatchObject({ok: true, status: 200, data: {coins: 1000, timber: 20, signalStationBuilt: false}});
    expect(answer.data.spots.map(spot => spot.plot)).toEqual(['plot_1', 'plot_2', 'plot_3', 'plot_4', 'islet_signal_station']);
  });

  it('shows the cabin standing from the start, with no price and no level', async () => {
    const cabin = spotOf(await makeFake().get(ISLET), 'plot_1');
    expect(cabin).toMatchObject({state: 'built', level: null, builtAt: null, cost: null, missing: [], canBuild: false, lockedNote: null});
  });

  it('shows the workshop and the station as empty and buildable, the windmill and the greenhouse as locked', async () => {
    const answer = await makeFake().get(ISLET);
    const cost = {coins: 300, timber: 10};
    expect(spotOf(answer, 'plot_2')).toMatchObject({state: 'empty', cost, missing: [], canBuild: true});
    expect(spotOf(answer, 'islet_signal_station')).toMatchObject({state: 'empty', cost, canBuild: true});
    expect(spotOf(answer, 'plot_3')).toMatchObject({state: 'locked', cost, missing: [], canBuild: false});
    expect(spotOf(answer, 'plot_4').lockedNote).toMatch(/^Opens when timber starts washing up/);
  });

  it('names what is missing, coins before timber, and turns canBuild off', async () => {
    const fake = makeFake();
    fake.dev.setCoins(100);
    fake.dev.setTimber(4);
    expect(spotOf(await fake.get(ISLET), 'plot_2')).toMatchObject({missing: ['coins', 'timber'], canBuild: false});
  });

  it('has exactly the fields of the contract on every spot', async () => {
    const [first] = (await makeFake().get(ISLET)).data.spots;
    expect(Object.keys(first).sort()).toEqual(
      ['about', 'builtAt', 'canBuild', 'cost', 'level', 'lockedNote', 'missing', 'name', 'plot', 'plotName', 'state', 'type'],
    );
  });

  it('answers an unknown address with 404 not_found', async () => {
    expect(await makeFake().get('/api/nothing')).toEqual(refusal(404, 'not_found'));
  });
});

describe('POST /api/islet/build', () => {
  it('builds the station, charges 300 coins and 10 timber once, and sends the receipt', async () => {
    const fake = makeFake();
    const answer = await fake.post(BUILD, click(STATION));
    expect(answer).toEqual({ok: true, status: 200, data: {
      plot: 'islet_signal_station', type: 'signal_station', name: 'Signal station', level: 1,
      coinsPaid: 300, timberPaid: 10, coins: 700, timber: 10,
    }});
  });

  it('shows the building as built with whole seconds, and the station flag, afterwards', async () => {
    const fake = makeFake();
    await fake.post(BUILD, click(STATION));
    const answer = await fake.get(ISLET);
    expect(spotOf(answer, 'islet_signal_station')).toMatchObject({state: 'built', level: 1, builtAt: '2026-11-16T10:00:00Z', cost: null, canBuild: false});
    expect(answer.data.signalStationBuilt).toBe(true);
  });

  it('gives the starter pack with the first build: 20 timber buys exactly the station and the workshop', async () => {
    const fake = makeFake();
    await fake.post(BUILD, click(WORKSHOP));
    const second = await fake.post(BUILD, click(STATION));
    expect(second.data).toMatchObject({coins: 400, timber: 0});
  });

  it('allows one building on a plot and says what stands there', async () => {
    const fake = makeFake();
    await fake.post(BUILD, click(STATION));
    const again = await fake.post(BUILD, click(STATION));
    expect(again).toEqual({ok: false, status: 409, code: 'plot_occupied', message: 'A signal station already stands on Islet signal station.'});
  });

  it('answers a repeated actionUid with 409 already_applied and charges nothing', async () => {
    const fake = makeFake();
    const body = click(STATION);
    await fake.post(BUILD, body);
    expect(await fake.post(BUILD, body)).toEqual(refusal(409, 'already_applied'));
    expect((await fake.get(ISLET)).data.coins).toBe(700);
  });

  it('answers a repeat first, before it checks the plot or the type', async () => {
    const fake = makeFake();
    const body = click(STATION);
    await fake.post(BUILD, body);
    expect(await fake.post(BUILD, {...body, plot: 'plot_9', type: 'castle'})).toEqual(refusal(409, 'already_applied'));
  });

  it.each([
    ['a missing field', {plot: 'plot_2', actionUid: 'click-valid-1'}],
    ['an extra field such as coins', {...WORKSHOP, actionUid: 'click-valid-2', coins: 1}],
    ['a plot with capital letters', {plot: 'Plot_2', type: 'workshop', actionUid: 'click-valid-3'}],
    ['a number where text belongs', {plot: 2, type: 'workshop', actionUid: 'click-valid-4'}],
    ['an actionUid that is too short', {...WORKSHOP, actionUid: 'short'}],
    ['an actionUid with spaces', {...WORKSHOP, actionUid: 'has some spaces'}],
  ])('refuses %s with 422 validation_error', async (_label, body) => {
    expect(await makeFake().post(BUILD, body)).toEqual(refusal(422, 'validation_error'));
  });

  it('refuses a plot that is not on the islet with 404 no_such_plot', async () => {
    expect(await makeFake().post(BUILD, click({plot: 'plot_9', type: 'workshop'}))).toEqual(refusal(404, 'no_such_plot'));
  });

  it('refuses an unknown building with 404 no_such_building', async () => {
    expect(await makeFake().post(BUILD, click({plot: 'plot_2', type: 'castle'}))).toEqual(refusal(404, 'no_such_building'));
  });

  it('refuses a building on the wrong plot with 422 wrong_plot', async () => {
    expect(await makeFake().post(BUILD, click({plot: 'plot_2', type: 'signal_station'}))).toEqual(refusal(422, 'wrong_plot'));
  });

  it('refuses the cabin plot with 409 plot_occupied, because the cabin stands from the start', async () => {
    const answer = await makeFake().post(BUILD, click({plot: 'plot_1', type: 'cabin'}));
    expect(answer).toEqual({ok: false, status: 409, code: 'plot_occupied', message: 'Your cabin already stands here.'});
  });

  it('refuses the windmill with 409 not_buildable_yet and the locked note', async () => {
    const answer = await makeFake().post(BUILD, click({plot: 'plot_3', type: 'windmill'}));
    expect(answer).toMatchObject({ok: false, status: 409, code: 'not_buildable_yet'});
    expect(answer.message).toMatch(/^Opens when timber starts washing up/);
  });

  it('checks the plot first, then the type, then whether the two belong together', async () => {
    const fake = makeFake();
    expect(await fake.post(BUILD, click({plot: 'plot_9', type: 'castle'}))).toEqual(refusal(404, 'no_such_plot'));
    expect(await fake.post(BUILD, click({plot: 'plot_2', type: 'castle'}))).toEqual(refusal(404, 'no_such_building'));
  });

  it('refuses with 409 not_enough_timber and says how much timber the player has', async () => {
    const fake = makeFake();
    fake.dev.setTimber(5);
    const answer = await fake.post(BUILD, click(STATION));
    expect(answer).toEqual({ok: false, status: 409, code: 'not_enough_timber', message: 'The signal station needs 10 timber. You have 5.'});
  });

  it('refuses with 409 insufficient_funds and names the price', async () => {
    const fake = makeFake();
    fake.dev.setCoins(100);
    const answer = await fake.post(BUILD, click(STATION));
    expect(answer).toEqual({ok: false, status: 409, code: 'insufficient_funds', message: 'The signal station costs 300 coins. You do not have enough coins.'});
  });

  it('checks the timber before the coins, as islet_build() does', async () => {
    const fake = makeFake();
    fake.dev.setCoins(100);
    fake.dev.setTimber(0);
    expect(await fake.post(BUILD, click(STATION))).toEqual(refusal(409, 'not_enough_timber'));
  });

  it('spends the whole balance when it is exactly the price', async () => {
    const fake = makeFake();
    fake.dev.setCoins(300);
    expect((await fake.post(BUILD, click(STATION))).data).toMatchObject({coins: 0, timber: 10});
  });

  it('changes nothing when it refuses', async () => {
    const fake = makeFake();
    fake.dev.setCoins(100);
    const before = await fake.get(ISLET);
    await fake.post(BUILD, click(STATION));
    expect(await fake.get(ISLET)).toEqual(before);
  });
});

describe('dev helpers', () => {
  it('failNext timeout applies the build and loses the answer', async () => {
    const fake = makeFake();
    fake.dev.failNext('timeout');
    expect(await fake.post(BUILD, click(STATION))).toMatchObject({ok: false, status: 0, code: 'timeout'});
    const answer = await fake.get(ISLET);
    expect(spotOf(answer, 'islet_signal_station').state).toBe('built');
    expect(answer.data.coins).toBe(700);
  });

  it('failNext network loses the request before it arrives', async () => {
    const fake = makeFake();
    fake.dev.failNext('network');
    expect(await fake.post(BUILD, click(STATION))).toMatchObject({ok: false, status: 0, code: 'network_error'});
    expect((await fake.get(ISLET)).data.coins).toBe(1000);
  });

  it('failNext server answers 503 database_unavailable and builds nothing', async () => {
    const fake = makeFake();
    fake.dev.failNext('server');
    expect(await fake.post(BUILD, click(STATION))).toMatchObject({ok: false, status: 503, code: 'database_unavailable'});
    expect((await fake.get(ISLET)).data.coins).toBe(1000);
  });

  it('failNext queues one failure for each of the next requests, then answers normally', async () => {
    const fake = makeFake();
    fake.dev.failNext('network');
    fake.dev.failNext('server');
    expect(await fake.get(ISLET)).toMatchObject({status: 0});
    expect(await fake.get(ISLET)).toMatchObject({status: 503});
    expect(await fake.get(ISLET)).toMatchObject({ok: true});
  });

  it('refuses a failure kind it does not know', () => {
    expect(() => makeFake().dev.failNext('lightning')).toThrow(TypeError);
  });

  it('setTimber makes the islet row, so the starter pack no longer shows', async () => {
    const fake = makeFake();
    fake.dev.setTimber(3);
    expect((await fake.get(ISLET)).data.timber).toBe(3);
  });

  it('reset goes back to a new player and forgets queued failures', async () => {
    const fake = makeFake();
    await fake.post(BUILD, click(STATION));
    fake.dev.failNext('network');
    fake.dev.reset();
    const answer = await fake.get(ISLET);
    expect(answer.data).toMatchObject({coins: 1000, timber: 20, signalStationBuilt: false});
  });

  it('refuses coins or timber that are not whole numbers from zero up', () => {
    const fake = makeFake();
    expect(() => fake.dev.setCoins(-1)).toThrow(TypeError);
    expect(() => fake.dev.setTimber(1.5)).toThrow(TypeError);
  });
});
