// Production auth checks use generated credentials and intercepted placeholder endpoints only.
import {randomBytes, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {build} from 'vite';
import {openWorldBrowser} from './world-browser-tools.js';
import {buildSecurityHeaders} from './security-headers.js';
import {stubIntro} from './intro-browser-fixture.js';

const origin = 'https://placeholder.supabase.co';
// Earlier auth/crew journeys keep the recorded captain at zero coins and do not build on the islet.
// The later islet fixture owns its own route and wallet; this GET-only baseline grants nothing.
const recordedIslet = () => ({coins: 0, timber: 0, signalStationBuilt: false,
  playMoneyNote: 'Play money. No cash value. It cannot be bought or cashed out.',
  spots: [
    ['plot_1', 'cabin', 'Cabin', 'built'], ['plot_2', 'workshop', 'Workshop', 'empty'],
    ['plot_3', 'windmill', 'Windmill', 'locked'], ['plot_4', 'greenhouse', 'Greenhouse', 'locked'],
    ['islet_signal_station', 'signal_station', 'Signal station', 'empty'],
  ].map(([plot, type, name, state]) => ({plot, type, name, state, plotName: `Recorded ${name.toLowerCase()} plot`,
    about: 'Recorded building information.', level: null, builtAt: null,
    cost: state === 'built' ? null : {coins: 300, timber: 10},
    missing: state === 'empty' ? ['coins', 'timber'] : [], canBuild: false,
    lockedNote: state === 'locked' ? 'This recorded plot opens later.' : null}))});
export async function openAuthFixture() {
  const outDir = '.test-cache/g9-online-dist';
  const key = ['sb', 'publishable', randomBytes(24).toString('hex')].join('_');
  // A preceding practice server can leave NODE_ENV=development in this sequential test process.
  const previousNodeEnv=process.env.NODE_ENV;
  process.env.NODE_ENV='production';
  try{
    await build({mode:'production',logLevel: 'silent', define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(origin),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(key),
    }, build: {outDir, emptyOutDir: true}});
  }finally{
    if(previousNodeEnv===undefined)delete process.env.NODE_ENV;
    else process.env.NODE_ENV=previousNodeEnv;
  }
  execFileSync(process.execPath, ['scripts/check-spoilers.js', outDir], {stdio: 'pipe'});
  const platformConfig = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const headers = {...buildSecurityHeaders(undefined, {platformConfig})};
  for (const name of ['Content-Security-Policy', 'Content-Security-Policy-Report-Only']) {
    if (!headers[name]) continue;
    headers[name] = headers[name].replace(/(https|wss):\/\/[a-z0-9-]+\.supabase\.co/g,
      value => value.startsWith('https:') ? origin : origin.replace('https:', 'wss:'));
  }
  const env = await openWorldBrowser({preview: true, outDir, headers});
  const userId = randomUUID();
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = () => [encode({alg: 'HS256', typ: 'JWT'}),
    encode({sub: userId, role: 'authenticated', aud: 'authenticated', exp: expires}),
    randomBytes(32).toString('base64url')].join('.');
  const requests = [];
  const checks = {pkce: false, exchanged: false, refreshed: false, signedOut: false};
  await env.page.routeWebSocket('wss://placeholder.supabase.co/**', socket => {
    checks.socketOpened = true;
    socket.close();
  });
  const user = {id: userId, aud: 'authenticated', role: 'authenticated',
    app_metadata: {provider: 'github'}, user_metadata: {}, created_at: new Date().toISOString()};
  const cors = {'access-control-allow-origin': env.url, 'access-control-allow-headers':
    'authorization,apikey,content-type,x-client-info,x-supabase-api-version',
  'access-control-allow-methods': 'GET,POST,OPTIONS'};
  await env.page.route(origin + '/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({path: url.pathname, method: request.method()});
    if (request.method() === 'OPTIONS') return route.fulfill({status: 204, headers: cors});
    if (url.pathname === '/auth/v1/authorize') {
      checks.pkce = url.searchParams.get('code_challenge_method') === 's256'
        && !!url.searchParams.get('code_challenge') && url.searchParams.get('provider') === 'github';
      const target = new URL(url.searchParams.get('redirect_to'));
      if (target.origin !== env.url) return route.abort();
      target.searchParams.set('code', randomBytes(24).toString('hex'));
      return route.fulfill({status: 302, headers: {location: target.href}, body: ''});
    }
    if (url.pathname === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'pkce') checks.exchanged = typeof request.postDataJSON()?.code_verifier === 'string';
      if (grant === 'refresh_token') checks.refreshed = true;
      return route.fulfill({status: 200, headers: cors, json: {
        access_token: token(), refresh_token: randomBytes(32).toString('hex'),
        token_type: 'bearer', expires_in: 3600, expires_at: expires, user,
      }});
    }
    if (url.pathname === '/auth/v1/logout') {
      checks.signedOut = true;
      return route.fulfill({status: 204, headers: cors});
    }
    if (url.pathname === '/auth/v1/user') return route.fulfill({headers: cors, json: user});
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({headers: cors, json: []});
    return route.abort();
  });
  await env.page.route('**/api/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/weather') return route.fallback();
    requests.push({path, method: request.method(), authorized: !!request.headers().authorization});
    let data;
    if (path === '/api/config') data = {flags: {sign_in: true, live_presence: false,
      market: false, predictions: false, arena: false, case: false, bulletin: false}, auth: {provider: 'github'}};
    if (path === '/api/me') data = {id: userId, displayName: 'Recorded Captain', captainName: 'Recorded Captain',
      coins: 0, crews: [], kit: null, place: null};
    if (path === '/api/me/name') data = {captainName: 'Recorded Captain', rerollsLeft: 1};
    if (path === '/api/crews/me') data = {crew: null};
    if (path === '/api/save') data = {version: 1, data: {}, updatedAt: null};
    if (path === '/api/islet' && request.method() === 'GET') {
      if (!request.headers().authorization) return route.fulfill({status: 401,
        json: {error: {code: 'unauthorized', message: 'Recorded sign-in is required.'}}});
      data = recordedIslet();
    }
    return route.fulfill({status: data ? 200 : 503, json: data
      ?? {error: {code: 'unavailable', message: 'Recorded offline service.'}}});
  });
  await stubIntro(env.page);
  return {...env, checks, requests, fixtureUserId: userId};
}
