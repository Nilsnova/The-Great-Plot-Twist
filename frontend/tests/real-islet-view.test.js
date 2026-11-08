// Pure recorded L2 display data. No SDK, network, case content or credentials are used.
import {describe, expect, it} from 'vitest';
import {projectIsletDisplay} from '../src/online/case-adapter/islet-view.js';

const STATION = 'islet_signal_station';
const REMINDER = {message: 'Build your signal station before nightfall: it is your crew’s third light', actionLabel: 'Open your islet'};
function snapshot(stationFields = {}, fields = {}) {
  const spot = (plot, type, state) => ({plot, type, state, plotName: 'Recorded plot', name: 'Recorded building',
    about: 'Recorded description.', level: null, builtAt: null, cost: null, missing: [], canBuild: false, lockedNote: null, retry: false});
  return {schema: 1, mode: 'live', status: 'ready', coins: 1000, timber: 20, signalStationBuilt: false,
    busyPlot: null, playMoneyNote: 'Recorded play-money note.', spots: [
      spot('plot_1', 'cabin', 'built'), spot('plot_2', 'workshop', 'empty'), spot('plot_3', 'windmill', 'locked'), spot('plot_4', 'greenhouse', 'locked'),
      {...spot(STATION, 'signal_station', 'empty'), name: 'Recorded signal station', cost: {coins: 275, timber: 7}, canBuild: true, ...stationFields},
    ], ...fields};
}
function ownCrew(mySeat = 2, fields = {}) {
  return {status: 'active', mySeat, seats: [1, 2, 3, 4].map(seat => ({seat, kind: seat === mySeat ? 'player' : 'open', isYou: seat === mySeat})), ...fields};
}
const project = (value = snapshot(), crew = ownCrew()) => projectIsletDisplay(value, {signedIn: true, crew});
const changedSeat = (crew, number, fields) => ({...crew, seats: crew.seats.map(seat => seat.seat === number ? {...seat, ...fields} : seat)});

describe('authoritative own islet display', () => {
  it('keeps an unknown station distinct from a known unbuilt station', () => {
    expect(projectIsletDisplay(null, {signedIn: true, crew: ownCrew()})).toEqual({station: null, reminder: null});
    expect(project()).toEqual({station: {id: STATION, name: 'Recorded signal station', built: false, canBuild: true,
      buildLabel: 'Build the recorded signal station for 275 coins and 7 timber', caption: 'Cost: 275 coins and 7 timber'}, reminder: REMINDER});
  });

  it.each([false, 'true', 1, undefined])('shows no private islet display when signedIn is %s', signedIn => {
    expect(projectIsletDisplay(snapshot(), {signedIn, crew: ownCrew()})).toEqual({station: null, reminder: null});
  });

  it.each([
    ['local', {mode: 'local'}], ['unavailable', {mode: 'unavailable'}], ['loading', {status: 'loading'}],
    ['error', {status: 'error'}], ['missing boolean', {signalStationBuilt: undefined}],
    ['string boolean', {signalStationBuilt: 'false'}], ['contradictory built flag', {signalStationBuilt: true}],
    ['missing catalogue', {spots: []}], ['malformed catalogue', {spots: null}],
  ])('does not turn a %s snapshot into a false station or a reminder', (_label, fields) => {
    expect(project(snapshot({}, fields))).toEqual({station: null, reminder: null});
  });

  it('rejects a station built state that disagrees with the flag and an unpublished type', () => {
    expect(project(snapshot({state: 'built'}))).toEqual({station: null, reminder: null});
    expect(project(snapshot({type: 'workshop'}))).toEqual({station: null, reminder: null});
  });

  it('shows a confirmed built station without inventing case lights or a reminder', () => {
    expect(project(snapshot({state: 'built', level: 1, cost: null, canBuild: false}, {signalStationBuilt: true}))).toEqual({
      station: {id: STATION, name: 'Recorded signal station', built: true, canBuild: false, buildLabel: null, caption: 'Standing'}, reminder: null,
    });
  });

  it('uses server prices and permission rather than the held wallet or a readback busyPlot', () => {
    const view = project(snapshot({}, {coins: 0, timber: 0, busyPlot: STATION}));
    expect(view.station).toMatchObject({canBuild: true, buildLabel: 'Build the recorded signal station for 275 coins and 7 timber', caption: 'Cost: 275 coins and 7 timber'});
    expect(project(snapshot({cost: {coins: 1, timber: 0}}, {coins: 0, timber: 0})).station.buildLabel).toBe('Build the recorded signal station for 1 coin');
    expect(project(snapshot({canBuild: false}, {coins: 99999, timber: 99999})).station.canBuild).toBe(false);
  });

  it.each([false, 'true', 1, undefined])('does not enable a build for non-true server canBuild %s', canBuild => {
    expect(project(snapshot({canBuild})).station.canBuild).toBe(false);
  });

  it('keeps the same public station target for a safe held retry without requiring a guessed wallet balance', () => {
    expect(project(snapshot({canBuild: false, retry: true, missing: ['coins', 'timber']}, {coins: 0, timber: 0})).station).toMatchObject({
      id: STATION, canBuild: true, buildLabel: 'Try again: build the recorded signal station (it will not charge twice)',
    });
    expect(project(snapshot({canBuild: false, retry: 'true'})).station.canBuild).toBe(false);
  });

  it('keeps the server locked explanation and price while its build stays disabled', () => {
    expect(project(snapshot({state: 'locked', canBuild: false, lockedNote: 'Recorded locked explanation.'})).station).toMatchObject({
      built: false, canBuild: false, caption: 'Price when it opens: 275 coins and 7 timber Recorded locked explanation.',
    });
  });

  it('returns only display fields and detached values, without raw DTO extras or membership identifiers', () => {
    const value = snapshot({privateExtra: 'private-station-extra'}, {privateExtra: 'private-snapshot-extra'});
    const crew = ownCrew(2, {id: 'private-crew-extra', code: 'private-code-extra'});
    const before = structuredClone(value), display = project(value, crew);
    expect(Object.keys(display)).toEqual(['station', 'reminder']);
    expect(Object.keys(display.station)).toEqual(['id', 'name', 'built', 'canBuild', 'buildLabel', 'caption']);
    expect(JSON.stringify(display)).not.toContain('private-');
    display.station.name = 'Changed display'; display.reminder.message = 'Changed display';
    expect(value).toEqual(before); expect(project(value, crew).station.name).toBe('Recorded signal station');
    expect(project(value, crew).reminder).toEqual(REMINDER);
  });
});

describe('first-building reminder membership', () => {
  it.each([1, 2, 3, 4])('recognizes the current player at seat %s after muster', seat => {
    expect(project(snapshot(), ownCrew(seat)).reminder).toEqual(REMINDER);
  });

  it.each([null, undefined, {status: 'none'}, ownCrew(2, {status: 'forming'}), ownCrew(2, {status: 'finished'})])(
    'suppresses a reminder without an active own crew: %s', crew => {
      const result = projectIsletDisplay(snapshot(), {signedIn: true, crew});
      expect(result.reminder).toBeNull(); expect(result.station.built).toBe(false);
    });

  it.each([null, 0, 5, 1.5, '2', undefined])('requires a valid numeric current seat: %s', mySeat => {
    expect(project(snapshot(), ownCrew(2, {mySeat})).reminder).toBeNull();
  });

  it.each([
    ['membership removed', changedSeat(ownCrew(), 2, {kind: 'open', isYou: false})],
    ['self marker removed', changedSeat(ownCrew(), 2, {isYou: false})],
    ['self marker moved', changedSeat(changedSeat(ownCrew(), 2, {isYou: false}), 3, {kind: 'player', isYou: true})],
    ['two self markers', changedSeat(ownCrew(), 3, {kind: 'player', isYou: true})],
    ['NPC self marker', changedSeat(ownCrew(), 2, {kind: 'npc'})],
    ['open self marker', changedSeat(ownCrew(), 2, {kind: 'open'})],
    ['non-boolean self marker', changedSeat(ownCrew(), 2, {isYou: 'true'})],
    ['a missing seat', ownCrew(2, {seats: ownCrew().seats.slice(0, 3)})],
    ['a duplicated seat', changedSeat(ownCrew(), 4, {seat: 3})],
    ['raw DTO seat fields', ownCrew(2, {seats: [1, 2, 3, 4].map(seatNo => ({seatNo, holder: 'player', isMe: seatNo === 2}))})],
  ])('clears only the reminder for %s', (_label, crew) => {
    const result = project(snapshot(), crew); expect(result.reminder).toBeNull(); expect(result.station.built).toBe(false);
  });
});
