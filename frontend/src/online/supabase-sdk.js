// The Supabase parts the game uses (auth, realtime and table reads), built the way supabase-js's
// createClient builds them, without the umbrella package (its storage and functions clients are never
// used here). Loaded lazily by online/auth.js (sign-in) and online/realtime.js (live rooms).
import {AuthClient} from '@supabase/auth-js';
import {PostgrestClient} from '@supabase/postgrest-js';
import {RealtimeClient} from '@supabase/realtime-js';

function projectUrl(supabaseUrl) {
  const trimmed = String(supabaseUrl ?? '').trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.');
  return new URL(trimmed.endsWith('/') ? trimmed : `${trimmed}/`);
}

function requireKey(key) {
  if (!key) throw new Error('supabaseKey is required.');
  return key;
}

// supabase-js's fetch for table reads and REST broadcasts: the apikey header, and the player's token
// (or else the publishable key) as the bearer, unless the request already sets them.
function authedFetch(key, getToken, customFetch) {
  return async (input, init) => {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    if (!headers.has('apikey')) headers.set('apikey', key);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token ?? key}`);
    return (customFetch ?? fetch)(input, {...init, headers});
  };
}

function tables(base, fetchImpl) {
  const rest = new PostgrestClient(new URL('rest/v1', base).href, {headers: {}, schema: 'public', fetch: fetchImpl});
  return relation => rest.from(relation);
}

// The sign-in client: `auth` (GoTrue on <project>/auth/v1) and `from` (table reads with the session's
// token), as supabase-js sets them up.
export function createAuthClient(supabaseUrl, supabaseKey, {auth = {}, global = {}} = {}) {
  const base = projectUrl(supabaseUrl), key = requireKey(supabaseKey);
  const client = {auth: new AuthClient({
    url: new URL('auth/v1', base).href,
    headers: {Authorization: `Bearer ${key}`, apikey: key, ...global.headers},
    storageKey: auth.storageKey ?? `sb-${base.hostname.split('.')[0]}-auth-token`,
    autoRefreshToken: auth.autoRefreshToken ?? true,
    persistSession: auth.persistSession ?? true,
    detectSessionInUrl: auth.detectSessionInUrl ?? true,
    storage: auth.storage,
    flowType: auth.flowType ?? 'implicit',
    debug: auth.debug,
    fetch: global.fetch,
    hasCustomAuthorizationHeader: Object.keys(global.headers ?? {}).some(name => name.toLowerCase() === 'authorization'),
  })};
  const sessionToken = async () => (await client.auth.getSession()).data.session?.access_token ?? null;
  client.from = tables(base, authedFetch(key, sessionToken, global.fetch));
  return client;
}

// The live-rooms client: channel/removeChannel/removeAllChannels on <project>/realtime/v1 (wss) and
// `from` (table reads), with the token from `accessToken()` (falling back to the publishable key, as
// supabase-js does).
// `realtime` (socket options) and `global.fetch` are supabase-js's options of the same name (tests use them).
export function createRealtimeClient(supabaseUrl, supabaseKey, {accessToken, realtime: socketOptions = {}, global = {}} = {}) {
  const base = projectUrl(supabaseUrl), key = requireKey(supabaseKey);
  const endpoint = new URL('realtime/v1', base);
  endpoint.protocol = endpoint.protocol.replace('http', 'ws');
  const token = async () => (await accessToken?.()) ?? null;
  const fetchImpl = authedFetch(key, token, global.fetch);
  const realtime = new RealtimeClient(endpoint.href, {
    accessToken: async () => (await token()) ?? key, fetch: fetchImpl,
    ...socketOptions, params: {apikey: key, ...socketOptions.params},
  });
  if (accessToken) {
    Promise.resolve(accessToken()).then(value => realtime.setAuth(value))
      .catch(error => console.warn('Failed to set initial Realtime auth token:', error));
  }
  return {
    realtime,
    from: tables(base, fetchImpl),
    channel: (name, options = {config: {}}) => realtime.channel(name, options),
    getChannels: () => realtime.getChannels(),
    removeChannel: channel => realtime.removeChannel(channel),
    removeAllChannels: () => realtime.removeAllChannels(),
  };
}
