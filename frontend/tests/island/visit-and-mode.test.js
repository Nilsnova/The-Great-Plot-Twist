// Island codes, visits by code, the islands flag and where Play lands.
import {describe, expect, it} from 'vitest';
import {islandCode, displayIslandCode, islandRoom, visitUrl, rememberVisit, readVisit, storeVisit, forgetVisit, VISIT_KEY} from '../../src/island/codes.js';
import {islandsMode, resolveIslandsMode, startPlace} from '../../src/island/mode.js';
import {placeTopic, isPrivatePlace} from '../../src/net/live-rules.js';
import {createFakeIslandApi} from './fake.js';

function memory() {
  const map = new Map();
  return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map};
}

describe('island codes', () => {
  it('reads ISLE codes in any spelling and refuses others', () => {
    for (const text of ['ISLE-K7Q2M', 'isle-k7q2m', 'ISLEK7Q2M', ' isle k7q2m ', 'K7Q2M']) expect(islandCode(text)).toBe('K7Q2M');
    for (const text of ['ISLE-K7Q2', 'ISLE-K7Q2M1', 'ISLE-O0I1L', '', null, 'x'.repeat(40)]) expect(islandCode(text)).toBe(null);
    expect(islandCode('K7Q2M', {requirePrefix: true})).toBe(null); // a bare code on Join is a class code
    expect(islandCode('isle-k7q2m', {requirePrefix: true})).toBe('K7Q2M');
    expect(displayIslandCode('k7q2m')).toBe('ISLE-K7Q2M');
  });
  it('names the island presence room after BUILD-PLAN 3.6', () => {
    expect(islandRoom('ISLE-K7Q2M')).toBe('isle_k7q2m');
    expect(placeTopic(islandRoom('ISLE-K7Q2M'), 1)).toBe('live:place:isle_k7q2m:1');
    expect(isPrivatePlace('isle_k7q2m')).toBe(false);
    expect(islandRoom('nope')).toBe(null);
  });
  it('remembers a visit link for the tab only', () => {
    const storage = memory();
    expect(visitUrl('K7Q2M')).toBe('https://the-great-plot-twist.vercel.app/?visit=ISLE-K7Q2M');
    expect(rememberVisit('?visit=isle-fr3nd', storage)).toBe('FR3ND');
    expect(storage.map.get(VISIT_KEY)).toBe('FR3ND');
    expect(readVisit(storage)).toBe('FR3ND');
    expect(rememberVisit('?visit=<script>', storage)).toBe(null);
    expect(storeVisit('ISLE-K7Q2M', storage)).toBe('K7Q2M');
    forgetVisit(storage);
    expect(readVisit(storage)).toBe(null);
  });
  it('visits a friend by code through the api, and refuses an unknown one with the plain message', async () => {
    const api = createFakeIslandApi();
    const friend = await api.visit(readVisit({getItem: () => 'FR3ND'}));
    expect(friend.data.ownerName).toBe('Captain Gull');
    expect(friend.data.spots.filter(spot => spot.built).map(spot => spot.id)).toEqual(['wall_1', 'wall_2', 'cannon_1', 'tower_1']);
    expect(await api.visit('ISLE-ZZZZZ')).toMatchObject({ok: false, status: 404, code: 'no_such_island', message: 'There is no island with that code.'});
    // A visitor rings the friend's bell with the code as "where".
    expect((await api.startWave({where: 'ISLE-FR3ND'})).data.wave).toBe(3);
  });
});

describe('the islands flag and where Play lands', () => {
  it('is fake only in a dev build, live with the flag, otherwise off', () => {
    expect(islandsMode({search: '?islands=fake', dev: true})).toBe('fake');
    expect(islandsMode({search: '?islands=fake', dev: false})).toBe('off');
    expect(islandsMode({flags: {islands: true}})).toBe('live');
    expect(islandsMode({flags: {islands: false}})).toBe('off');
    expect(islandsMode({})).toBe('off');
  });
  it('waits a moment for the flags of an online adapter only', async () => {
    let calls = 0, flags = null;
    const wait = async () => { calls += 1; if (calls === 3) flags = {islands: true}; };
    expect(await resolveIslandsMode({online: true, readFlags: () => flags, wait})).toBe('live');
    expect(calls).toBe(3);
    calls = 0;
    expect(await resolveIslandsMode({online: false, readFlags: () => null, wait})).toBe('off');
    expect(calls).toBe(0);
    expect(await resolveIslandsMode({online: true, readFlags: () => null, wait: async () => {}, timeoutMs: 300})).toBe('off');
  });
  it('lands on your island, but keeps the class harbor for a class code', () => {
    expect(startPlace({mode: 'live'})).toBe('home_islet');
    expect(startPlace({mode: 'fake'})).toBe('home_islet');
    expect(startPlace({mode: 'live', classHarbor: true})).toBe('saltreach_harbor');
    expect(startPlace({mode: 'live', classHarbor: true, visiting: true})).toBe('home_islet');
    expect(startPlace({mode: 'off'})).toBe('saltreach_harbor');
    expect(startPlace({mode: 'off', visiting: true})).toBe('saltreach_harbor');
    expect(startPlace({mode: 'live', destination: 'lighthouse_isle'})).toBe('lighthouse_isle');
  });
});
