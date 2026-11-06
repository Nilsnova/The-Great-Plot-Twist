// Starting live presence and stopping it while the Supabase library is still loading. The library is
// loaded on demand (`await import('@supabase/supabase-js')`), so that it stays out of the title screen's
// budget. Here the library is a stand-in module that "is still loading" until the test lets it finish,
// so that a test can call stop() inside that gap. Real timers: the gap is a few milliseconds, and the
// start delay is switched off by a random() that always says 0. There is no network.
import { describe, expect, it, vi } from 'vitest';
import { startRealtime } from '../src/online/realtime.js';
import { playerId } from './realtime-fakes.js';

const ME = playerId(1);
const URL = 'https://example.supabase.co';
const KEY = 'test-publishable-key'; // a stand-in: the module never checks the key's form

// The stand-in for '@supabase/supabase-js': `started` says that somebody asked for it, and it arrives
// when the test calls finishLoading().
const library = vi.hoisted(() => {
  const standIn = { started: false, createClient: null };
  standIn.loaded = new Promise(resolve => { standIn.finishLoading = resolve; });
  return standIn;
});
vi.mock('@supabase/supabase-js', async () => {
  library.started = true;
  await library.loaded;
  return { createClient: (...args) => library.createClient(...args) };
});

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function start(over = {}) {
  const events = [];
  const live = startRealtime({
    enabled: true, playerId: ME, getAccessToken: async () => 'token-1', supabaseUrl: URL, publishableKey: KEY,
    emit: event => events.push(event), random: () => 0, ...over,
  });
  return { live, states: () => events.map(event => event.state) };
}

describe('loading the library on demand', () => {
  it('does not load the library while it is switched off', async () => {
    const { live } = start({ enabled: false });

    live.setPlace('saltreach_harbor');
    await pause(50);

    expect(library.started).toBe(false);
  });

  it('does not load the library when nobody is signed in', async () => {
    const { live, states } = start({ getAccessToken: async () => null });

    await pause(50);

    expect(library.started).toBe(false);
    expect(states()).toEqual(['connecting', 'off']);
    live.stop();
  });

  it('creates no client and opens no room when stop() comes while the library is still loading', async () => {
    library.createClient = vi.fn();
    const { live, states } = start();
    await vi.waitFor(() => expect(library.started).toBe(true)); // it has its token and waits for the library

    live.stop();
    library.finishLoading(); // and the library arrives too late
    await pause(50);

    expect(library.createClient).not.toHaveBeenCalled();
    expect(states()).toEqual(['connecting', 'off']);
  });
});
