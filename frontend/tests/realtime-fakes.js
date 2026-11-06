// Stand-ins for Supabase in the tests of src/online/realtime.js. There is no network: a fake
// client hands out fake rooms, and a test drives a room by hand with status(), broadcast(),
// presence() and system(), the way the real server would. Not a test file itself (Vitest only
// runs *.test.js).
//
// Used by: tests/realtime.test.js.
import { vi } from 'vitest';

// A player id for the nth made-up player: a lowercase uuid, like the real ones.
export const playerId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// What presenceState() gives for one captain: a list with one entry (one open tab).
export const presenceOf = (place, room, kit = null) => [{ presence_ref: 'ref', v: 1, place, room, kit }];

// A whole presenceState() from { id: [place, room, kit] }.
export function worldOf(people) {
  return Object.fromEntries(Object.entries(people).map(([id, [place, room, kit]]) => [id, presenceOf(place, room, kit ?? null)]));
}

// One fake room (a Supabase "channel"). It remembers everything the code under test does to it.
export class FakeRoom {
  constructor(topic, options) {
    this.topic = topic;
    this.options = options; // what the code passed to client.channel(topic, options)
    this.bindings = []; // every .on(type, filter, callback)
    this.statusCallback = null; // what .subscribe(callback) was given
    this.messages = []; // every .send(message), in order
    this.times = []; // when each message was sent (Date.now(), which fake timers move)
    this.tracks = []; // every .track(payload), in order
    this.createdAt = Date.now(); // when the code under test made this room
    this.people = {}; // what presenceState() answers
    this.state = 'closed'; // the library's own channel state: closed, joined or errored
    this.removed = false;
  }

  // --- what the code under test calls ---
  on(type, filter, callback) {
    this.bindings.push({ type, filter, callback });
    return this;
  }

  subscribe(callback) {
    this.statusCallback = callback;
    return this;
  }

  send(message) {
    this.messages.push(message);
    this.times.push(Date.now());
    return Promise.resolve('ok');
  }

  track(payload) {
    this.tracks.push(payload);
    return Promise.resolve('ok');
  }

  presenceState() {
    return this.people;
  }

  // --- what a test does, like the server ---
  status(name, error) {
    if (name === 'SUBSCRIBED') this.state = 'joined';
    else if (name === 'CLOSED') this.state = 'closed';
    else this.state = 'errored';
    this.statusCallback?.(name, error);
  }

  broadcast(event, payload) {
    for (const binding of this.bindings) {
      if (binding.type === 'broadcast' && binding.filter.event === event) binding.callback({ type: 'broadcast', event, payload });
    }
  }

  presence(people) {
    this.people = people;
    for (const binding of this.bindings) {
      if (binding.type === 'presence' && binding.filter.event === 'sync') binding.callback();
    }
  }

  system(payload) {
    for (const binding of this.bindings) {
      if (binding.type === 'system') binding.callback(payload);
    }
  }

  // --- what a test looks at ---
  get positions() {
    return this.messages.filter(message => message.event === 'position').map(message => message.payload);
  }

  get emotes() {
    return this.messages.filter(message => message.event === 'emote').map(message => message.payload);
  }

  get config() {
    return this.options?.config;
  }
}

// A fake Supabase client with the things the code uses: channel, removeChannel, removeAllChannels,
// from('profiles').select(...).in(...) and realtime.isConnected().
// `names` is { id: display_name }: the pretend content of the profiles table.
export function createFakeClient({ names = {} } = {}) {
  const client = {
    rooms: [], // every room ever created
    reads: [], // every read of a table: { table, columns, column, values }
    names,
    failReads: false, // set to true to make the next reads fail
    allRemoved: false,
    connected: true, // set to false to pretend that the socket is closing
    realtime: { isConnected: () => client.connected },

    channel(topic, options) {
      const room = new FakeRoom(topic, options);
      client.rooms.push(room);
      return room;
    },

    removeChannel: vi.fn(room => {
      room.removed = true;
      return Promise.resolve('ok');
    }),

    removeAllChannels: vi.fn(() => {
      client.allRemoved = true;
      for (const room of client.rooms) room.removed = true;
      return Promise.resolve([]);
    }),

    from(table) {
      return {
        select: columns => ({
          in: (column, values) => {
            client.reads.push({ table, columns, column, values });
            if (client.failReads) return Promise.resolve({ data: null, error: { message: 'pretend read failure' } });
            const data = values.filter(id => id in client.names).map(id => ({ id, display_name: client.names[id] }));
            return Promise.resolve({ data, error: null });
          },
        }),
      };
    },

    // --- what a test looks at ---
    // Every room ever made for this topic, oldest first.
    all: topic => client.rooms.filter(room => room.topic === topic),
    // The room for this topic that is still open (the newest one that was not removed), or undefined.
    open: topic => client.rooms.filter(room => room.topic === topic && !room.removed).at(-1),
    // The topics of all rooms that are open now.
    openTopics: () => client.rooms.filter(room => !room.removed).map(room => room.topic),
  };
  return client;
}
