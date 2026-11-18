// The Supabase parts are wired the way supabase-js wired them: project URLs, the apikey header and the
// bearer token on table reads. No network: fetch is a fake.
import {expect, it} from 'vitest';
import {createAuthClient, createRealtimeClient} from '../src/online/supabase-sdk.js';

const URL = 'https://example.supabase.co';
const KEY = 'fixture-key';

function memoryStorage() {
  const items = new Map();
  return {getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); }, removeItem: key => { items.delete(key); }};
}

it('the sign-in client reads tables with the publishable key until a session exists', async () => {
  const calls = [];
  const fetch = async (input, init) => { calls.push({url: String(input), headers: new Headers(init?.headers)}); return new Response('[]', {status: 200, headers: {'content-type': 'application/json'}}); };
  const client = createAuthClient(URL, KEY, {auth: {storage: memoryStorage(), storageKey: 'test', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce'}, global: {fetch}});
  expect(typeof client.auth.signInWithOAuth).toBe('function');
  const reply = await client.from('crew_seats').select('player_id').eq('crew_id', 'c1').limit(4);
  expect(reply.data).toEqual([]);
  const read = calls.find(call => call.url.includes('/rest/v1/'));
  expect(read.url).toBe(`${URL}/rest/v1/crew_seats?select=player_id&crew_id=eq.c1&limit=4`);
  expect(read.headers.get('apikey')).toBe(KEY);
  expect(read.headers.get('authorization')).toBe(`Bearer ${KEY}`);
  await client.auth.stopAutoRefresh?.();
});

it('the live-rooms client uses the player token for table reads and builds private rooms on the wss endpoint', async () => {
  const calls = [];
  const fetch = async (input, init) => { calls.push({url: String(input), headers: new Headers(init?.headers)}); return new Response('[]', {status: 200, headers: {'content-type': 'application/json'}}); };
  const client = createRealtimeClient(URL, KEY, {accessToken: async () => 'player-token', global: {fetch}});
  expect(client.realtime.endpointURL()).toMatch(/^wss:\/\/example\.supabase\.co\/realtime\/v1\/websocket\?apikey=fixture-key/);
  await client.from('profiles').select('id, display_name').in('id', ['a']);
  expect(calls[0].headers.get('authorization')).toBe('Bearer player-token');
  const room = client.channel('live:world', {config: {private: true}});
  expect(room.topic).toBe('realtime:live:world');
  expect(await client.removeChannel(room)).toBe('ok');
  await client.removeAllChannels();
  expect(() => createRealtimeClient('ftp://x', KEY)).toThrow('Invalid supabaseUrl');
  expect(() => createRealtimeClient(URL, '')).toThrow('supabaseKey is required');
});
