// Pure schema-1 projection over recorded L2 display data and safe client failures; no service or SDK.
import {randomUUID} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {composeRealView} from '../src/online/case-adapter/view.js';
import {caseViewKeys} from '../src/adapter/contract.js';

const STATION = 'islet_signal_station';
const REMINDER = {message: 'Build your signal station before nightfall: it is your crew’s third light', actionLabel: 'Open your islet'};
const REFUSAL = {accepted: false, reason: 'materials_required', message: 'More timber is needed to build the signal station.', status: 409};
function recordedIslet(stationFields = {}, fields = {}) {
  const spot = (plot, type, state) => ({plot, type, state, plotName: 'Recorded plot', name: 'Recorded building', about: 'Recorded description.',
    level: null, builtAt: null, cost: null, missing: [], canBuild: false, retry: false, lockedNote: null});
  return {schema: 1, mode: 'live', status: 'ready', coins: 1000, timber: 20, signalStationBuilt: false, busyPlot: null,
    playMoneyNote: 'Recorded play-money note.', spots: [spot('plot_1', 'cabin', 'built'), spot('plot_2', 'workshop', 'empty'),
      spot('plot_3', 'windmill', 'locked'), spot('plot_4', 'greenhouse', 'locked'),
      {...spot(STATION, 'signal_station', 'empty'), name: 'Recorded signal station', cost: {coins: 275, timber: 7}, canBuild: true, ...stationFields}], ...fields};
}
function activeCrew(fields = {}) {
  return {status: 'active', mode: 'crew', mySeat: 2, code: 'RECORDED', seats: [1, 2, 3, 4].map(seatNo => ({seatNo,
    holder: seatNo === 2 ? 'player' : 'open', isMe: seatNo === 2, name: seatNo === 2 ? 'Recorded captain' : null, kit: null})), ...fields};
}
function signedInState(fields = {}) {
  return {accountState: 'signed_in', me: {captainName: 'Recorded captain', coins: 0},
    nameReply: {captainName: 'Recorded captain', rerollsLeft: 1}, crew: activeCrew(), isletSnapshot: recordedIslet(), ...fields};
}
const failureView = failure => composeRealView(signedInState({isletFailure: failure})).finale.isletFailure;

describe('islet additions to the real schema-1 view', () => {
  it('adds only nested display fields and retains the exact existing 24 top-level keys', () => {
    const view = composeRealView(signedInState());
    expect(view.schema).toBe(1); expect(Object.keys(view)).toHaveLength(24);
    expect(Object.keys(view).sort()).toEqual([...caseViewKeys].sort());
    expect(view).not.toHaveProperty('islet'); expect(view).not.toHaveProperty('isletFailure');
    expect(view.crew.isletReminder).toEqual(REMINDER);
    expect(view.finale.islet).toEqual({id: STATION, name: 'Recorded signal station', built: false, canBuild: true,
      buildLabel: 'Build the recorded signal station for 275 coins and 7 timber', caption: 'Cost: 275 coins and 7 timber'});
    expect(view.finale).toMatchObject({phase: 'waiting', lights: [], isletFailure: null});
    expect(view.finale).not.toHaveProperty('buildJobs'); expect(view.finale).not.toHaveProperty('canCall');
  });

  it.each(['signed_out', 'signing_in', 'expired', 'error'])('hides retained private islet state while account is %s', accountState => {
    const view = composeRealView(signedInState({accountState, isletFailure: REFUSAL}));
    expect(view.finale.islet).toBeNull(); expect(view.finale.isletFailure).toBeNull(); expect(view.crew.isletReminder).toBeNull();
  });

  it('keeps unknown islet data separate from a known unbuilt station on a fresh account', () => {
    const view = composeRealView(signedInState({crew: null, isletSnapshot: null, isletFailure: null}));
    expect(view.finale.islet).toBeNull(); expect(view.finale.isletFailure).toBeNull(); expect(view.crew.isletReminder).toBeNull();
    expect(composeRealView(signedInState({crew: null})).finale.islet.built).toBe(false);
  });

  it('uses authoritative built state without inventing case light readiness or a reminder', () => {
    const view = composeRealView(signedInState({isletSnapshot: recordedIslet({state: 'built', level: 1, cost: null, canBuild: false}, {signalStationBuilt: true})}));
    expect(view.finale.islet).toMatchObject({id: STATION, built: true, canBuild: false, buildLabel: null});
    expect(view.crew.isletReminder).toBeNull(); expect(view.finale.lights).toEqual([]); expect(view.finale.phase).toBe('waiting');
  });

  it.each(['forming', 'finished', 'none'])('keeps station knowledge but removes the reminder for crew status %s', status => {
    const view = composeRealView(signedInState({crew: activeCrew({status})}));
    expect(view.finale.islet.built).toBe(false); expect(view.crew.isletReminder).toBeNull();
  });

  it('requires the projected self player to match mySeat after membership changes', () => {
    const lost = activeCrew(); lost.seats[1] = {...lost.seats[1], holder: 'open', isMe: false};
    const moved = activeCrew({mySeat: 3});
    const duplicate = activeCrew(); duplicate.seats[2] = {...duplicate.seats[2], holder: 'player', isMe: true};
    for (const crew of [null, lost, moved, duplicate]) {
      const view = composeRealView(signedInState({crew}));
      expect(view.crew.isletReminder).toBeNull(); expect(view.finale.islet.built).toBe(false);
    }
  });

  it('does not let an earlier mutable read change a future view or its private inputs', () => {
    const state = signedInState({isletFailure: REFUSAL}), before = structuredClone(state);
    const view = composeRealView(state); view.finale.islet.name = 'Changed'; view.finale.isletFailure.message = 'Changed'; view.crew.isletReminder.message = 'Changed';
    expect(state).toEqual(before);
    const next = composeRealView(state); expect(next.finale.islet.name).toBe('Recorded signal station');
    expect(next.finale.isletFailure.message).toBe(REFUSAL.message); expect(next.crew.isletReminder).toEqual(REMINDER);
  });
});

describe('safe nested islet failure presentation', () => {
  it('copies only a known normalized refusal and its safe named fields', () => {
    const secret = `private-${randomUUID()}`;
    const state = signedInState({isletFailure: {...REFUSAL, actionUid: randomUUID(), playerId: randomUUID(), error: {message: secret}, rawBody: secret}});
    const view = composeRealView(state);
    expect(view.finale.isletFailure).toEqual({reason: 'materials_required', message: REFUSAL.message, status: 409});
    expect(JSON.stringify(view.finale.isletFailure)).not.toContain(secret);
    expect(view.finale.isletFailure).not.toHaveProperty('accepted');
    expect(view.finale.isletFailure).not.toHaveProperty('actionUid'); expect(view.finale.isletFailure).not.toHaveProperty('playerId');
  });

  it.each([null, undefined, {}, {accepted: true, reason: 'materials_required'}, {reason: 'materials_required'},
    {accepted: false, reason: 'unknown_server_code'}, {accepted: false, reason: 'constructor'}, {accepted: false, reason: '__proto__'},
    {accepted: false, reason: null}, {accepted: false, reason: {value: 'materials_required'}}])('does not expose an unrecognized failure %s', failure => {
    expect(failureView(failure)).toBeNull();
  });

  it.each([null, undefined, 7, {}, []].map(message => [message]))('replaces a malformed message %s with empty display copy', message => {
    expect(failureView({...REFUSAL, message})).toEqual({reason: 'materials_required', message: '', status: 409});
  });

  it.each([0, 401, 429, 503, 599])('retains safe integer status %s without copying the rest of the reply', status => {
    expect(failureView({...REFUSAL, status})).toEqual({reason: 'materials_required', message: REFUSAL.message, status});
  });

  it.each([-1, 600, 1.5, NaN, Infinity, '503', null, undefined])('omits malformed status %s', status => {
    expect(failureView({...REFUSAL, status})).toEqual({reason: 'materials_required', message: REFUSAL.message});
  });

  it.each([[0, 0], [1.5, 2], [86400, 86400]])('bounds and rounds retry seconds %s to %s', (retryAfterSeconds, expected) => {
    expect(failureView({accepted: false, reason: 'rate_limited', message: 'Too many attempts.', retryAfterSeconds})).toEqual({
      reason: 'rate_limited', message: 'Too many attempts.', retryAfterSeconds: expected,
    });
  });

  it.each([-1, 86400.1, NaN, Infinity, '2', null, undefined])('omits malformed retry seconds %s', retryAfterSeconds => {
    expect(failureView({accepted: false, reason: 'rate_limited', message: 'Too many attempts.', retryAfterSeconds})).toEqual({reason: 'rate_limited', message: 'Too many attempts.'});
  });

  it('retains the original fractional client deadline across reads rather than restarting rounded seconds', () => {
    const state = signedInState({now: 1500, isletFailure: {accepted: false, reason: 'rate_limited', message: 'Too many attempts.',
      status: 429, retryAfterSeconds: 2, retryAt: 3000.5}});
    expect(composeRealView(state).finale.isletFailure).toEqual({reason: 'rate_limited', message: 'Too many attempts.', status: 429, retryAfterSeconds: 2, retryUntil: 3000.5});
    expect(composeRealView({...state, now: 2999}).finale.isletFailure.retryUntil).toBe(3000.5);
    expect(failureView({...REFUSAL, retryAt: 3000.5})).not.toHaveProperty('retryUntil');
  });

  it.each([0, Number.MAX_SAFE_INTEGER])('retains a bounded client deadline %s only as retryUntil', retryAt => {
    const result = failureView({accepted: false, reason: 'rate_limited', message: 'Too many attempts.', retryAt});
    expect(result.retryUntil).toBe(retryAt); expect(result).not.toHaveProperty('retryAt');
  });

  it.each([-1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '3000', null, undefined])('omits malformed client deadline %s', retryAt => {
    expect(failureView({accepted: false, reason: 'rate_limited', message: 'Too many attempts.', retryAt})).toEqual({reason: 'rate_limited', message: 'Too many attempts.'});
  });
});
