// The pure side of the islet panel: reading the server answer, notices and every card label. No DOM.
import {describe, expect, it} from 'vitest';
import {
  MESSAGES, PLAY_MONEY_NOTE, builtNotice, builtPlots, buildingNotice, createEmptyView, failureNotice, readIsletAnswer,
} from '../src/screens/islet/view.js';
import {cardLabels, walletLine} from '../src/screens/islet/labels.js';

const COST = {coins: 300, timber: 10};
const LOCKED_NOTE = 'Opens when timber starts washing up on your beach, in a later update.';

function serverSpot(fields) {
  return {plot: 'plot_2', plotName: 'Workshop plot', type: 'workshop', name: 'Workshop', about: 'A bench and tools.',
    state: 'empty', level: null, builtAt: null, cost: COST, missing: [], canBuild: true, lockedNote: null, ...fields};
}
const cabin = serverSpot({plot: 'plot_1', plotName: 'Cabin plot', type: 'cabin', name: 'Cabin', about: 'Your home.', state: 'built', cost: null, canBuild: false});
const workshop = serverSpot({});
const windmill = serverSpot({plot: 'plot_3', plotName: 'Windmill plot', type: 'windmill', name: 'Windmill', state: 'locked', canBuild: false, lockedNote: LOCKED_NOTE});
const station = serverSpot({plot: 'islet_signal_station', plotName: 'Islet signal station', type: 'signal_station', name: 'Signal station'});

function serverAnswer(fields) {
  return {coins: 1000, timber: 20, signalStationBuilt: false, playMoneyNote: PLAY_MONEY_NOTE, spots: [cabin, workshop, windmill, station], ...fields};
}
const held = (coins, timber, busyPlot = null) => ({coins, timber, busyPlot});

describe('createEmptyView', () => {
  it('starts a live view as loading, with nothing known yet', () => {
    expect(createEmptyView('live')).toEqual({
      schema: 1, mode: 'live', status: 'loading', busyPlot: null, coins: null, timber: null, playMoneyNote: PLAY_MONEY_NOTE,
      signalStationBuilt: false, spots: [], notice: null, revision: 0,
    });
  });

  it('starts a local view like a live one', () => {
    expect(createEmptyView('local')).toMatchObject({mode: 'local', status: 'loading', notice: null});
  });

  it('starts an unavailable view with the sign-in message and no loading', () => {
    expect(createEmptyView('unavailable')).toMatchObject({
      mode: 'unavailable', status: 'unavailable',
      notice: {tone: 'info', code: 'not_connected', message: 'Your islet will be saved to your account once sign-in is connected.'},
    });
  });
});

describe('readIsletAnswer', () => {
  it('copies coins, timber, the station flag and every spot in the order the server sent them', () => {
    const value = readIsletAnswer(serverAnswer({signalStationBuilt: true}));
    expect(value).toMatchObject({coins: 1000, timber: 20, signalStationBuilt: true, playMoneyNote: PLAY_MONEY_NOTE});
    expect(value.spots.map(spot => spot.plot)).toEqual(['plot_1', 'plot_2', 'plot_3', 'islet_signal_station']);
    expect(value.spots[3]).toEqual({...station, retry: false});
  });

  it('adds retry: false to every spot', () => {
    expect(readIsletAnswer(serverAnswer()).spots.every(spot => spot.retry === false)).toBe(true);
  });

  it('keeps only the fields it knows', () => {
    const value = readIsletAnswer(serverAnswer({secret: 'x', spots: [{...cabin, secret: 'y'}]}));
    expect(value).not.toHaveProperty('secret');
    expect(value.spots[0]).not.toHaveProperty('secret');
  });

  it('uses the standard play money note when the server sends none', () => {
    expect(readIsletAnswer(serverAnswer({playMoneyNote: undefined})).playMoneyNote).toBe(PLAY_MONEY_NOTE);
  });

  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['no spots', serverAnswer({spots: undefined})],
    ['spots that are not a list', serverAnswer({spots: {}})],
    ['no coins', serverAnswer({coins: undefined})],
    ['negative timber', serverAnswer({timber: -1})],
    ['fractional coins', serverAnswer({coins: 1.5})],
    ['more than ten spots', serverAnswer({spots: Array.from({length: 11}, (_, index) => serverSpot({plot: `plot_${index + 10}`}))})],
    ['two spots on the same plot', serverAnswer({spots: [workshop, workshop]})],
    ['a spot in an unknown state', serverAnswer({spots: [serverSpot({state: 'half-built'})]})],
    ['a spot without a name', serverAnswer({spots: [serverSpot({name: ''})]})],
    ['a spot with a broken cost', serverAnswer({spots: [serverSpot({cost: {coins: 'many', timber: 10}})]})],
  ])('is null for an answer with %s', (_label, answer) => {
    expect(readIsletAnswer(answer)).toBeNull();
  });
});

describe('builtPlots', () => {
  it('lists every built plot in file order, the cabin included', () => {
    const spots = [cabin, workshop, windmill, {...station, state: 'built'}].map(spot => ({...spot, retry: false}));
    expect(builtPlots({spots})).toEqual(['plot_1', 'islet_signal_station']);
  });

  it('is empty before the first answer', () => {
    expect(builtPlots(createEmptyView('live'))).toEqual([]);
  });
});

describe('cardLabels', () => {
  const spot = fields => ({retry: false, ...serverSpot(fields)});

  it('shows the cabin as standing, with no price and no button', () => {
    expect(cardLabels(spot(cabin), held(1000, 20))).toEqual({badge: 'Standing', tone: 'built', cost: null, missing: null, note: null, button: null});
  });

  it('shows a built workshop with its level and the date it was built, and no button', () => {
    const built = spot({state: 'built', level: 1, builtAt: '2026-11-16T10:00:00Z', cost: null, canBuild: false});
    expect(cardLabels(built, held(700, 10))).toMatchObject({badge: 'Standing', note: 'Level 1, built 16 Nov 2026', button: null, cost: null});
  });

  it('shows an empty plot with its price and an enabled build button', () => {
    expect(cardLabels(spot({}), held(1000, 20))).toEqual({
      badge: 'Empty plot', tone: 'empty', cost: 'Cost: 300 coins and 10 timber', missing: null, note: null,
      button: {label: 'Build the workshop for 300 coins and 10 timber', disabled: false},
    });
  });

  it('says how many coins are missing and disables the button', () => {
    const short = spot({missing: ['coins'], canBuild: false});
    expect(cardLabels(short, held(180, 20))).toMatchObject({missing: 'You need 120 more coins', button: {disabled: true}});
  });

  it('says how much timber is missing', () => {
    const short = spot({missing: ['timber'], canBuild: false});
    expect(cardLabels(short, held(1000, 5)).missing).toBe('You need 5 more timber');
  });

  it('says what is missing when both coins and timber are short', () => {
    const short = spot({missing: ['coins', 'timber'], canBuild: false});
    expect(cardLabels(short, held(100, 0)).missing).toBe('You need 200 more coins and 10 more timber');
  });

  it('says 1 coin, not 1 coins', () => {
    const short = spot({missing: ['coins'], canBuild: false});
    expect(cardLabels(short, held(299, 20)).missing).toBe('You need 1 more coin');
  });

  it('says only that more is needed when the amount held is not known', () => {
    const short = spot({missing: ['coins'], canBuild: false});
    expect(cardLabels(short, held(null, null)).missing).toBe('You need more coins');
  });

  it('shows a locked plot as coming later, with the note, the future price and a disabled button', () => {
    expect(cardLabels(spot(windmill), held(1000, 20))).toEqual({
      badge: 'Coming later', tone: 'locked', cost: 'Price when it opens: 300 coins and 10 timber', missing: null, note: LOCKED_NOTE,
      button: {label: 'Build the windmill for 300 coins and 10 timber', disabled: true},
    });
  });

  it('offers a safe retry when the last build has an unknown outcome, even if canBuild is false', () => {
    const unknown = spot({canBuild: false, missing: ['coins'], retry: true});
    expect(cardLabels(unknown, held(100, 20)).button).toEqual({label: 'Try again: build the workshop (it will not charge twice)', disabled: false});
  });

  it('names the building in the retry button, so two retry buttons never share a name', () => {
    const labels = [workshop, station].map(fields => cardLabels(spot({...fields, retry: true}), held(1000, 20)).button.label);
    expect(labels).toEqual([
      'Try again: build the workshop (it will not charge twice)',
      'Try again: build the signal station (it will not charge twice)',
    ]);
  });

  it('names the building in every build button, so no two buttons on the page share a name', () => {
    const greenhouse = serverSpot({plot: 'plot_4', plotName: 'Greenhouse plot', type: 'greenhouse', name: 'Greenhouse', state: 'locked', canBuild: false, lockedNote: LOCKED_NOTE});
    const spots = [workshop, windmill, greenhouse, station];
    const labels = spots.map(fields => cardLabels(spot(fields), held(1000, 20)).button.label);
    expect(new Set(labels).size).toBe(spots.length);
    spots.forEach((fields, index) => expect(labels[index]).toContain(fields.name.toLowerCase()));
  });

  it('disables every button while a build is running and says Building on that card', () => {
    const running = cardLabels(spot({}), held(1000, 20, 'plot_2'));
    const other = cardLabels(spot(station), held(1000, 20, 'plot_2'));
    expect(running.button).toEqual({label: 'Building...', disabled: true});
    expect(other.button).toEqual({label: 'Build the signal station for 300 coins and 10 timber', disabled: true});
  });

  it('never enables a button the server did not allow, however many coins the view holds', () => {
    const refused = spot({canBuild: false, missing: []});
    expect(cardLabels(refused, held(99999, 99999)).button.disabled).toBe(true);
  });

  it('keeps a button enabled when the server allows it, even if the browser would guess otherwise', () => {
    expect(cardLabels(spot({canBuild: true}), held(0, 0)).button.disabled).toBe(false);
  });
});

describe('walletLine', () => {
  it('names the coins with thousands separators and the timber', () => {
    expect(walletLine(held(1000, 20))).toBe('You have 1,000 coins and 20 timber.');
  });

  it('says 1 coin, not 1 coins', () => {
    expect(walletLine(held(1, 0))).toBe('You have 1 coin and 0 timber.');
  });

  it('is empty before the first answer', () => {
    expect(walletLine(createEmptyView('live'))).toBeNull();
  });
});

describe('notices', () => {
  const stationSpot = {...station, retry: false};

  it('thanks the player with the receipt after a good build', () => {
    const receipt = {coinsPaid: 300, timberPaid: 10, coins: 700, timber: 10};
    expect(builtNotice(stationSpot, receipt, true)).toEqual({
      tone: 'success', code: 'built', message: 'Signal station built. You have 700 coins and 10 timber left.',
    });
  });

  it('still says the building stands when the receipt has no numbers', () => {
    expect(builtNotice(stationSpot, null, true).message).toBe('Signal station built.');
  });

  it('says so when the islet could not be reloaded after a good build', () => {
    const receipt = {coins: 700, timber: 10};
    expect(builtNotice(stationSpot, receipt, false).message).toBe(
      'Signal station built. You have 700 coins and 10 timber left. We could not reload your islet. Press Refresh.',
    );
  });

  it('says what is being built while the request runs', () => {
    expect(buildingNotice(stationSpot)).toEqual({tone: 'info', code: 'building', message: 'Building the signal station...'});
  });

  it('shows the message of the server for a failure', () => {
    const result = {ok: false, status: 409, code: 'insufficient_funds', message: 'The signal station costs 300 coins. You do not have enough coins.'};
    expect(failureNotice(result)).toEqual({tone: 'error', code: 'insufficient_funds', message: result.message});
  });

  it('has a plain message for a failure that brought none', () => {
    expect(failureNotice({ok: false, status: 401, code: 'unauthorized', message: ''}).message).toBe('Please sign in again.');
    expect(failureNotice({ok: false, status: 0, code: 'network_error'}).message).toBe(MESSAGES.network);
    expect(failureNotice({ok: false, status: 503, code: 'database_unavailable'}).message).toBe(MESSAGES.server);
    expect(failureNotice({ok: false, status: 418, code: 'teapot'}).message).toBe(MESSAGES.unknown);
  });

  it('gives a failure without a code the code error', () => {
    expect(failureNotice({ok: false, status: 0}).code).toBe('error');
  });
});
