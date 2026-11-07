// Runtime-generated accounts and authoritative crew snapshots, through intercepted endpoints only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openAuthFixture} from './online-auth-fixture.js';
import {installPresenceWire} from './online-presence-wire-fixture.js';

const copy = value => structuredClone(value);
const openSeat = seatNo => ({seatNo, holder: 'open', name: null, kit: null, partnerId: null, isMe: false});
const ownSeat = seatNo => ({seatNo, holder: 'player', name: 'Recorded Captain', kit: 'stranger', partnerId: null, isMe: true});
const peerSeat = seatNo => ({seatNo, holder: 'player', name: 'Recorded Second Captain', kit: 'witness', partnerId: null, isMe: false});
const normalCode = value => typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : null;

export async function openCrewPresenceFixture({presence = false, named = true, startPlace = 'lighthouse_isle'} = {}) {
  const env = await openAuthFixture(), {page} = env;
  const wire = await installPresenceWire(page, {playerId: env.fixtureUserId});
  const playerIds = [env.fixtureUserId, ...wire.peerIds];
  const ledger = [], faults = [], holds = new Set(), controlledResponses = [];
  let crew = null, target = null, livePresence = presence, generatedName = named;
  let save = {version:1,data:{kind:'world',actions:[],place:startPlace},updatedAt:'2026-11-07T00:00:00Z'};
  const fresh = ({mySeat = 1, second = false, status = 'forming', code = 'RECORDED20'} = {}) => ({
    id: randomUUID(), code, status, mode: second ? 'crew' : 'solo', mySeat,
    startedAt: status === 'forming' ? null : '2026-11-07T00:00:00Z',
    seats: [1, 2, 3, 4].map(seatNo => seatNo === mySeat ? ownSeat(seatNo)
      : second && seatNo === (mySeat === 1 ? 2 : 1) ? peerSeat(seatNo) : openSeat(seatNo)),
  });
  function setCrew(scenario = 'none') {
    crew = scenario === 'none' ? null : fresh({mySeat: scenario === 'nonhost' ? 2 : 1,
      second: scenario === 'two' || scenario === 'nonhost', status: scenario === 'finished' ? 'finished' : 'forming'});
    target = fresh({mySeat: 2, second: true});
  }
  function apply(path, body) {
    if (path === '/api/crews') {
      if (crew && crew.status !== 'finished') return {status: 409, code: 'already_in_crew'};
      crew = fresh(); return {status: 200, data: {crew: copy(crew)}};
    }
    if (path === '/api/crews/join') {
      if (crew?.id === target.id) return {status: 409, code: 'already_seated'};
      if (body?.code !== target.code) return {status: 404, code: 'wrong_code'};
      crew = copy(target); return {status: 200, data: {crew: copy(crew)}};
    }
    if (!crew) return {status: 404, code: 'no_crew'};
    if (crew.status === 'active') return {status: 409, code: 'already_started'};
    if (crew.status === 'finished') return {status: 409, code: 'crew_finished'};
    crew.status = 'active'; crew.startedAt = '2026-11-07T00:00:00Z';
    crew.seats = crew.seats.map(seat => seat.holder !== 'open' ? seat : {...seat, holder: 'partner',
      name: `Recorded partner ${seat.seatNo}`, kit: 'informant', partnerId: `recorded_partner_${seat.seatNo}`});
    return {status: 200, data: {crew: copy(crew)}};
  }
  const fulfill = (route, reply) => {
    if (reply.status !== 200) controlledResponses.push({path: new URL(route.request().url()).pathname, status: reply.status});
    return route.fulfill({status: reply.status, headers: reply.status === 429 ? {'Retry-After': '3'} : {},
      json: reply.data ?? {error: {code: reply.code, message: 'Recorded crew refusal.'}}});
  };
  const handler = async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    const owned = ['/api/config', '/api/me', '/api/me/name', '/api/save', '/api/crews/me', '/api/crews', '/api/crews/join', '/api/crews/me/start'];
    if (!owned.includes(path)) return route.fallback();
    const body = request.postData() ? request.postDataJSON() : undefined;
    ledger.push({path, method, authorized: !!request.headers().authorization,
      bodyKeys: Object.keys(body ?? {}).sort(), codeLength: body?.code?.length ?? null,
      codeNormalized: body?.code ? body.code === normalCode(body.code) : null});
    if (path === '/api/config') {
      assert.equal(request.headers().authorization, undefined, 'Public config never receives a bearer');
      return fulfill(route, {status: 200, data: {flags: {sign_in: true, live_presence: livePresence,
        market: false, predictions: false, arena: false, case: false, bulletin: false}, auth: {provider: 'github'}}});
    }
    assert.ok(request.headers().authorization, 'Private own-account and crew fixture routes receive a generated bearer');
    if (path === '/api/me' && method === 'DELETE') {
      assert.ok(body?.confirm === true && Object.keys(body).length === 1, 'Deletion is explicitly confirmed');
      crew = null; save = {version:1,data:{},updatedAt:null};
      return fulfill(route, {status: 200, data: {deleted: true}});
    }
    if(path==='/api/save'){
      if(method==='GET')return fulfill(route,{status:200,data:copy(save)});
      assert.equal(method,'PUT','Recorded saves use the published PUT route');
      assert.deepEqual(Object.keys(body).sort(),['data','version']);
      assert.deepEqual(Object.keys(body.data).sort(),['actions','kind','place']);
      assert.ok(Array.isArray(body.data.actions)&&['intro','world'].includes(body.data.kind));
      if(body.version!==save.version)return fulfill(route,{status:409,code:'stale_save'});
      save={version:save.version+1,data:copy(body.data),updatedAt:'2026-11-07T00:00:01Z'};
      return fulfill(route,{status:200,data:copy(save)});
    }
    if (path === '/api/me') return fulfill(route, {status: 200, data: {id: env.fixtureUserId,
      captainName: generatedName ? 'Recorded Captain' : null, coins: 0, crews: [], kit: 'stranger', place: startPlace}});
    if (path === '/api/me/name') return fulfill(route, {status: 200, data: {
      captainName: generatedName ? 'Recorded Captain' : null, rerollsLeft: 1}});
    const hold = [...holds].find(value => !value.used && value.path === path && value.method === method);
    if (hold) { hold.used = true; hold.startedResolve(); await hold.released; }
    if (method === 'GET' && path === '/api/crews/me') return fulfill(route, {status: 200, data: {crew: copy(crew)}});
    assert.equal(method, 'POST');
    if (path.endsWith('/join')) assert.deepEqual(Object.keys(body ?? {}), ['code'], 'Join sends only its normalized code');
    else assert.equal(request.postData(), null, 'Create and muster have no request body');
    const nextFault = faults[0]?.path === path ? faults.shift() : null;
    if (nextFault) {
      if (nextFault.apply) apply(path, body);
      if (nextFault.status === 0) return route.abort('failed');
      return fulfill(route, nextFault);
    }
    return fulfill(route, apply(path, body));
  };
  await page.route('**/api/**', handler);
  const cors = {'access-control-allow-origin': env.url, 'access-control-allow-headers':
    'authorization,apikey,content-type,x-client-info,x-supabase-api-version', 'access-control-allow-methods': 'GET,OPTIONS'};
  await page.route('https://placeholder.supabase.co/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
    assert.equal(request.method(), 'GET', 'Realtime table access is read only');
    assert.ok(request.headers().authorization, 'Read-only profiles/crew seats use the generated session');
    if (url.pathname === '/rest/v1/profiles') {
      return route.fulfill({headers: cors, json: wire.peerIds.map((id, index) => ({id,
        display_name: index === 0 ? null : `Recorded peer ${index + 1}`}))});
    }
    if (url.pathname === '/rest/v1/crew_seats') {
      assert.ok(crew && url.searchParams.get('crew_id') === `eq.${crew.id}`, 'Only the held own crew is read');
      return route.fulfill({headers: cors, json: crew.seats.filter(seat => seat.holder === 'player').map(seat => ({
        player_id: playerIds[seat.isMe ? 0 : 1], seat_no: seat.seatNo}))});
    }
    return route.fallback();
  });
  setCrew();
  return {...env, wire, crewRequests: ledger, controlledCrewResponses: controlledResponses,
    setCrew, setPresence(value) { livePresence = value; }, setNamed(value) { generatedName = value; },
    setJoinCode(value) { assert.match(value, /^[A-Z0-9]{1,20}$/); target.code = value; },
    secondCaptainJoins() { assert.ok(crew); crew.mode = 'crew'; crew.seats[1] = peerSeat(2); },
    crewSnapshot() { return copy(crew); },
    faultCrew(path, {status, code, apply: applies = false}) { faults.push({path, status, code, apply: applies}); },
    holdCrew(path, method = 'POST') {
      let startedResolve, release;
      const started = new Promise(resolve => { startedResolve = resolve; });
      const released = new Promise(resolve => { release = resolve; });
      const hold = {path, method, used: false, startedResolve, released, release}; holds.add(hold);
      return {started, release() { release(); holds.delete(hold); }};
    },
    resetCrew(scenario) { faults.length = 0; setCrew(scenario); },
    async close() { for (const hold of holds) hold.release(); holds.clear(); await wire.dispose(); await env.close(); },
  };
}
