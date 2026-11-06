// The same schema-1 suite runs against recorded real routes with fresh private state per adapter.
import {expect, vi} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createRealCaseAdapter} from '../src/online/case-adapter/index.js';
import {defineAdapterConformance} from '../src/adapter/conformance/suite.js';

const success = data => ({ok: true, status: 200, data: structuredClone(data)});
const profile = {ending: 'ending_rescue', decision: 'warned', readLog: false, kit: {
  id: 'true_keeper', name: 'True Keeper', startPlace: 'saltreach_harbor', coins: 5,
  item: {id: 'item-placeholder', name: 'Placeholder item', text: 'Placeholder item text.'},
}, coinsPaid: 5, alreadyGranted: false};
const initialMe = {
  id: 'player-placeholder', captainName: 'Placeholder captain', coins: 0, kit: null, place: null, crews: [],
};
const formed = {
  id: 'crew-placeholder', code: 'PLACEHOLDER', status: 'forming', mode: 'solo', mySeat: 1,
  seats: [
    {seatNo: 1, holder: 'player', isMe: true, name: 'Placeholder captain', kit: 'true_keeper'},
    ...[2, 3, 4].map(seatNo => ({seatNo, holder: 'open', isMe: false, name: null, kit: null})),
  ],
};
const started = {...formed, status: 'active', startedAt: '2026-11-06T12:00:00Z', seats: [
  formed.seats[0],
  ...[2, 3, 4].map(seatNo => ({seatNo, holder: 'partner', isMe: false,
    name: 'Placeholder partner', kit: 'true_keeper'})),
]};

function createRecordedAdapter() {
  const session = createSession();
  session.setToken(String(Math.random()));
  let me = structuredClone(initialMe);
  let crew = null;
  let mustered = false;
  const api = {
    async get(route) {
      if (route === '/api/config') return success({flags: {sign_in: true}});
      if (route === '/api/me') return success(me);
      if (route === '/api/save') return success({version: 1, data: {}, updatedAt: null});
      if (route === '/api/crews/me') return success({crew});
      return {ok: false, status: 404, code: 'feature_off'};
    },
    async post(route) {
      if (route === '/api/intro/complete') {
        me = {...initialMe, kit: 'true_keeper', place: 'saltreach_harbor'};
        return success(profile);
      }
      if (route === '/api/crews') {
        crew = structuredClone(formed);
        return success({crew});
      }
      if (route === '/api/crews/me/start') {
        crew = structuredClone(started);
        if (mustered) return {ok: false, status: 409, code: 'already_started'};
        mustered = true;
        return success({crew});
      }
      return {ok: false, status: 404, code: 'feature_off'};
    },
    async del() { return {ok: false, status: 404, code: 'feature_off'}; },
  };
  return createRealCaseAdapter({session, api, publicApi: api, document: {}, window: {}});
}

defineAdapterConformance('real', createRecordedAdapter, {
  create: createRecordedAdapter,
  prepare: adapter => vi.waitFor(() => {
    expect(adapter.read().account.captainName).toBe(initialMe.captainName);
  }),
  sequence: [
    {method: 'completeIntro', args: [{actions: ['to_desk']}]},
    {method: 'createCrew'},
    {method: 'muster', repeat: true},
  ],
  assertProgress: view => {
    expect(view.mode).toBe('online');
    expect(view.arrival.status).toBe('ready');
    expect(view.crew).toMatchObject({status: 'active', mode: 'solo', mySeat: 1});
    expect(view.crew.seats[0]).toMatchObject({name: initialMe.captainName, kind: 'player', isYou: true});
    expect(view.crew.seats[1]).toMatchObject({name: 'Placeholder partner', kind: 'npc'});
  },
});
