// Stateful recorded account answers extend intercepted PKCE without real services or private case data.
import {randomUUID} from 'node:crypto';
import {openAuthFixture} from './online-auth-fixture.js';
import {stubIntro} from './intro-browser-fixture.js';

export const ACCOUNT_INTRO_ACTIONS = Object.freeze(['to_desk', 'take_key', 'read_log', 'desk_back',
  'to_shore', 'take_lantern', 'warn_harbor', 'shore_back', 'to_tower', 'unlock_door', 'climb', 'signal']);
const origin = 'https://placeholder.supabase.co';
const initialStats = () => ({nameInitializations: 0, rerollsGranted: 0, rerollsRefused: 0,
  introRequests: 0, kitGrants: 0, kitRepeats: 0, coinsGranted: 0,
  saveReads: 0, saveWrites: 0, saveConflicts: 0, unknownSaveOutcomes: 0,
  unknownSaveReadbacks: 0, blindSaveRetries: 0, ledgerReads: 0, deletes: 0,
  publicBearerLeaks: 0, invalidBodies: 0});
const savedReplay = (kind, actions) => ({kind, actions: [...actions], place: 'lighthouse_isle'});
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (value, expected) => plainObject(value)
  && Object.keys(value).sort().join(',') === [...expected].sort().join(',');

export async function openAccountFixture() {
  const env = await openAuthFixture();
  const playerId = env.fixtureUserId ?? randomUUID();
  const requests = [];
  const controlledResponses = [];
  let state;
  function reset() {
    state = {named: false, captainName: 'Recorded Captain', rerollsLeft: 1, staleNameOnce: false,
      granted: false, deleted: false, nextSaveFault: null, waitingForSaveReadback: false,
      save: {version: 1, data: {}, updatedAt: null}, stats: initialStats(), rerollReceipts: new Map()};
    Object.assign(env.checks, {pkce: false, exchanged: false, refreshed: false, signedOut: false});
  }
  reset();
  const error = (route, status, code) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/save' && status === 503 && code === 'unavailable'
      || path === '/api/me/name/reroll' && status === 409 && code === 'no_rerolls_left') {
      controlledResponses.push({path, status});
    }
    return route.fulfill({status, json: {error: {code, message: 'Recorded account refusal.'}}});
  };
  const stamp = () => new Date().toISOString();
  const me = () => ({id: playerId, displayName: 'Recorded Captain', captainName: state.named ? state.captainName : null,
    coins: state.granted ? 1000 : 0, crews: [], kit: state.granted ? 'true_keeper' : null,
    place: state.granted ? 'lighthouse_isle' : null});
  function nameReply() {
    const rerollsLeft = state.staleNameOnce ? 1 : state.rerollsLeft;
    state.staleNameOnce = false;
    return {captainName: state.captainName, rerollsLeft};
  }
  function introReply(repeat) {
    return {ending: 'ending_rescue', decision: 'warned', readLog: true,
      kit: {id: 'true_keeper', name: 'Recorded Kit', startPlace: 'lighthouse_isle', coins: 1000,
        item: {id: 'recorded_item', name: 'Recorded item', text: 'Recorded item description.'},
        cheapCard: 'recorded_card'}, coinsPaid: repeat ? 0 : 1000, alreadyGranted: repeat};
  }
  function readBody(request) {
    try { return request.postDataJSON(); } catch { return null; }
  }
  function invalid(route) {
    state.stats.invalidBodies += 1;
    return error(route, 422, 'validation_error');
  }
  await env.page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    if (!['/api/config', '/api/me', '/api/me/name', '/api/me/name/reroll',
      '/api/intro/complete', '/api/save', '/api/crews/me'].includes(path)) return route.fallback();
    const body = readBody(request);
    const record = {path, method, bodyKeys: plainObject(body) ? Object.keys(body).sort() : [],
      authorized: !!request.headers().authorization};
    requests.push(record);
    if (path === '/api/config') {
      if (record.authorized) state.stats.publicBearerLeaks += 1;
      return route.fulfill({json: {flags: {sign_in: true, live_presence: false, case: false,
        market: false, predictions: false, arena: false, bulletin: false}, auth: {provider: 'github'}}});
    }
    if (!record.authorized || state.deleted) return error(route, 401, 'unauthorized');
    if (path === '/api/me' && method === 'GET') return route.fulfill({json: me()});
    if (path === '/api/crews/me' && method === 'GET') return route.fulfill({json: {crew: null}});
    if (path === '/api/me/name' && method === 'POST') {
      if (body !== null && (!plainObject(body) || Object.keys(body).length)) return invalid(route);
      state.named = true; state.stats.nameInitializations += 1;
      return route.fulfill({json: nameReply()});
    }
    if (path === '/api/me/name/reroll' && method === 'POST') {
      if (!sameKeys(body, ['actionUid']) || typeof body.actionUid !== 'string') return invalid(route);
      if (state.rerollReceipts.has(body.actionUid)) return route.fulfill({json: state.rerollReceipts.get(body.actionUid)});
      if (!state.named) return error(route, 409, 'no_name_yet');
      if (state.rerollsLeft === 0) { state.stats.rerollsRefused += 1; return error(route, 409, 'no_rerolls_left'); }
      state.rerollsLeft = 0; state.captainName = 'Recorded Captain Two'; state.stats.rerollsGranted += 1;
      const reply = nameReply(); state.rerollReceipts.set(body.actionUid, reply);
      return route.fulfill({json: reply});
    }
    if (path === '/api/intro/complete' && method === 'POST') {
      if (!sameKeys(body, ['actions']) || !Array.isArray(body.actions)
        || body.actions.join(',') !== ACCOUNT_INTRO_ACTIONS.join(',')) return invalid(route);
      const repeat = state.granted;
      state.granted = true; state.stats.introRequests += 1;
      if (repeat) state.stats.kitRepeats += 1;
      else { state.stats.kitGrants += 1; state.stats.coinsGranted += 1000; }
      return route.fulfill({json: introReply(repeat)});
    }
    if (path === '/api/save' && method === 'GET') {
      state.stats.saveReads += 1;
      if (state.waitingForSaveReadback) {
        state.waitingForSaveReadback = false; state.stats.unknownSaveReadbacks += 1;
        record.outcome = 'unknown_write_readback';
      }
      return route.fulfill({json: state.save});
    }
    if (path === '/api/save' && method === 'PUT') {
      if (!sameKeys(body, ['version', 'data']) || !sameKeys(body.data, ['kind', 'actions', 'place'])
        || !['intro', 'world'].includes(body.data.kind) || !Array.isArray(body.data.actions)
        || !body.data.actions.every(action => typeof action === 'string' && /^[a-z0-9_]{1,40}$/.test(action))
        || body.data.actions.length > 300 || typeof body.data.place !== 'string') return invalid(route);
      if (state.waitingForSaveReadback) state.stats.blindSaveRetries += 1;
      state.stats.saveWrites += 1;
      const fault = state.nextSaveFault; state.nextSaveFault = null;
      if (body.version !== state.save.version || fault === 'conflict') {
        state.stats.saveConflicts += 1; record.outcome = 'conflict';
        return error(route, 409, 'stale_save');
      }
      state.save = {version: state.save.version + 1, data: structuredClone(body.data), updatedAt: stamp()};
      if (fault === 'unknown_committed') {
        state.waitingForSaveReadback = true; state.stats.unknownSaveOutcomes += 1;
        record.outcome = 'unknown_committed';
        return error(route, 503, 'unavailable');
      }
      record.outcome = 'saved';
      return route.fulfill({json: state.save});
    }
    if (path === '/api/me' && method === 'DELETE') {
      if (!sameKeys(body, ['confirm']) || body.confirm !== true) return invalid(route);
      state.stats.deletes += 1; state.deleted = true;
      return route.fulfill({json: {deleted: true}});
    }
    return error(route, 503, 'unavailable');
  });
  // Re-register after the account wildcard so only the existing approved public intro supplies prose.
  await stubIntro(env.page);
  const cors = {'access-control-allow-origin': env.url, 'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,x-supabase-api-version'};
  await env.page.route(origin + '/rest/v1/wallet_transactions**', route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
    state.stats.ledgerReads += 1;
    requests.push({path: '/rest/v1/wallet_transactions', method: request.method(), bodyKeys: [],
      authorized: !!request.headers().authorization});
    return route.fulfill({headers: cors, json: state.granted && !state.deleted
      ? [{delta: 1000, reason: 'kit_grant', created_at: stamp()}] : []});
  });
  return {...env, accountRequests: requests, controlledResponses, resetAccount: reset,
    accountStats: () => ({...state.stats}),
    faultNextSave(mode) { state.nextSaveFault = mode; },
    showStaleRerollOnce() { state.staleNameOnce = true; },
    setCloudReplay(kind = 'intro', actions = []) {
      state.save = {version: state.save.version + 1, data: savedReplay(kind, actions), updatedAt: stamp()};
    },
  };
}
