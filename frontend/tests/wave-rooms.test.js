// The wave rooms (BUILD-PLAN 3.6): which rooms carry the pirate waves, which messages pass, and
// openRoom(topic) over the presence's bridge and the bus.
import {describe, expect, it} from 'vitest';
import {WAVE_EVENTS, chooseRoom, isWavePlace, readWaveMessage, shownLimit, waveTopic} from '../src/net/live-rules.js';
import {openRoom} from '../src/net/wave-rooms.js';
import {ROOM_EVENTS, toMessage} from '../src/pirates/sync.js';
import {attachWaveSender, sendWave} from '../src/net/live-extras.js';

const ID = '0b5e2c4a-1f2d-4c3b-9a8e-7d6c5b4a3f21';
const msg = (data, extra = {}) => ({v: 1, id: ID, seq: 4, data, ...extra});
const shot = {by: 'p-abc', seq: 3, t: 12.4, waveId: 'fake-wave-1', cannonId: 'cannon_1', targetId: 'ship_2'};

describe('the wave rooms', () => {
  it('are an island room or Pirate Point, room 1 for every defender', () => {
    expect(isWavePlace('isle_k7q2m')).toBe(true);
    expect(isWavePlace('pirate_point')).toBe(true);
    expect(isWavePlace('isle_k7q2')).toBe(false);
    expect(isWavePlace('isle_k7q2o')).toBe(false); // O is not in the code alphabet
    expect(isWavePlace('saltreach_harbor')).toBe(false);
    expect(waveTopic('isle_k7q2m')).toBe('live:place:isle_k7q2m:1');
    expect(waveTopic('pirate_point')).toBe('live:place:pirate_point:1');
    expect(waveTopic('home_islet')).toBe(null);
    expect(chooseRoom({place: 'pirate_point', roomCounts: {1: 60}})).toBe(1);
    expect(chooseRoom({place: 'isle_k7q2m', crewmateRooms: [3]})).toBe(1);
    expect(shownLimit('pirate_point')).toBe(40);
  });
  it('pass the wave events with exactly their fields and drop anything else', () => {
    expect(WAVE_EVENTS).toEqual(['wave_start', 'cannon_shot', 'wall_repair', 'lamps_lit', 'lamp', 'captain_shot', 'island_changed',
      'wall_rebuild', 'captain_strike']);
    expect(readWaveMessage('cannon_shot', msg(shot))).toEqual({id: ID, event: 'cannon_shot', seq: 4, data: shot});
    expect(readWaveMessage('wall_repair', msg({by: 'p-abc', seq: 1, t: 3, waveId: 'w1', wallId: 'wall_2'}))).not.toBe(null);
    expect(readWaveMessage('lamps_lit', msg({by: 'p-abc', seq: 9, t: 40, waveId: 'w1'}))).not.toBe(null);
    expect(readWaveMessage('wave_start', msg({waveId: 'w1', seed: 42, startsAt: '2026-11-11T10:00:10Z'}))).not.toBe(null);
    expect(readWaveMessage('lamp', msg({v: 1, lamps: [1200, null, null], relit: null, started: 1500, waveId: 'w1'}))).not.toBe(null);
    // The musket (src/pirates/sync.js toMessage) and the co-op build hint pass too.
    const musket = {by: 'p-abc', seq: 5, t: 20.15, waveId: 'fake-wave-1', targetId: 'ship_3', level: 2, x: -9.5, z: 11.25};
    expect(readWaveMessage('captain_shot', msg(musket))).toEqual({id: ID, event: 'captain_shot', seq: 4, data: musket});
    expect(readWaveMessage('island_changed', msg({spot: 'wall_2'}))).toEqual({id: ID, event: 'island_changed', seq: 4, data: {spot: 'wall_2'}});
    // Boarding (TOWER-DEFENSE.md §12): the cutlass has the musket's shape, a rebuild the repair's.
    const blade = {...musket, targetId: 'boarder_7'};
    expect(readWaveMessage('captain_strike', msg(blade))).toEqual({id: ID, event: 'captain_strike', seq: 4, data: blade});
    expect(readWaveMessage('wall_rebuild', msg({by: 'p-abc', seq: 2, t: 4, waveId: 'w1', wallId: 'wall_9'}))).not.toBe(null);
    for (const bad of [{...blade, level: 0}, {...blade, targetId: 'a b'}, {...blade, extra: 1}]) expect(readWaveMessage('captain_strike', msg(bad))).toBe(null);
    expect(readWaveMessage('wall_rebuild', msg({by: 'p-abc', seq: 2, t: 4, waveId: 'w1', wallId: '<b>'}))).toBe(null);
    for (const [event, payload] of [
      ['captain_shot', msg({...musket, level: 6})], ['captain_shot', msg({...musket, x: 'far'})], ['captain_shot', msg({...musket, z: 900})],
      ['island_changed', msg({spot: 'wall 2'})], ['island_changed', msg({spot: 'wall_2', extra: 1})],
      ['cannon_shot', msg({...shot, extra: 1})], ['cannon_shot', msg({...shot, cannonId: '<b>'})], ['cannon_shot', msg({...shot, t: 901})],
      ['cannon_shot', msg(shot, {v: 2})], ['cannon_shot', msg(shot, {id: 'someone'})], ['cannon_shot', msg({...shot, waveId: 'a b'})],
      ['wave_start', msg({waveId: 'w1', seed: -1, startsAt: '2026-11-11T10:00:10Z'})], ['wave_start', msg({waveId: 'w1', seed: 1, startsAt: 'soon'})],
      ['lamp', msg({v: 1, lamps: [1, 2], relit: null, started: null, waveId: 'w1'})], ['duel', msg({waveId: 'w1'})],
      ['lamps_lit', msg({by: 'p'.repeat(65), seq: 1, t: 1, waveId: 'w1'})], ['lamps_lit', null],
    ]) expect(readWaveMessage(event, payload)).toBe(null);
  });
  it('pass every input the wave controller sends, exactly as sync.js writes it (the live room must not drop one)', () => {
    const inputs = [{type: 'fire', cannonId: 'cannon_2', targetId: 'ship_1'}, {type: 'repair', wallId: 'wall_1'}, {type: 'lamps_lit'},
      {type: 'captain_shot', by: 'p-abc', targetId: 'ship_4', level: 3, x: 12.5, z: -3.25},
      {type: 'captain_strike', by: 'p-abc', targetId: 'boarder_4', level: 3, x: 2.5, z: 3.25}, {type: 'rebuild', wallId: 'wall_9'}];
    for (const input of inputs) {
      const message = toMessage(input, {by: 'p-abc', seq: 2, tick: 104, waveId: 'fake-wave-3'});
      expect(Object.values(ROOM_EVENTS)).toContain(message.type);
      expect(WAVE_EVENTS).toContain(message.type);
      expect(readWaveMessage(message.type, msg(message.payload)), message.type).not.toBe(null);
    }
  });
  it('openRoom sends through the bridge only for wave events and hears its own topic only', () => {
    const sent = [], listeners = [];
    const on = (type, listener) => { listeners.push([type, listener]); return () => listeners.splice(listeners.findIndex(item => item[1] === listener), 1); };
    const room = openRoom('live:place:isle_k7q2m:1', {on, send: (...args) => { sent.push(args); return true; }});
    expect(openRoom('live:place:saltreach_harbor:1')).toBe(null);
    expect(room.send('cannon_shot', shot)).toBe(true);
    expect(room.send('position', {})).toBe(false);
    const heard = [];
    room.on('cannon_shot', data => heard.push(data));
    for (const [, listener] of listeners) {
      listener({type: 'live_room_message', topic: 'live:place:isle_k7q2m:1', event: 'cannon_shot', data: shot});
      listener({type: 'live_room_message', topic: 'live:place:isle_aaaaa:1', event: 'cannon_shot', data: shot});
      listener({type: 'live_room_message', topic: 'live:place:isle_k7q2m:1', event: 'wall_repair', data: {}});
    }
    expect(sent).toEqual([['live:place:isle_k7q2m:1', 'cannon_shot', shot]]);
    expect(heard).toEqual([shot]);
    room.close();
    expect(listeners).toHaveLength(0);
    expect(room.send('cannon_shot', shot)).toBe(false);
  });
  it('the bridge sends only while a presence is attached', () => {
    expect(sendWave('live:place:pirate_point:1', 'lamps_lit', {})).toBe(false);
    const seen = [], detach = attachWaveSender((...args) => { seen.push(args); return true; });
    expect(sendWave('live:place:pirate_point:1', 'lamps_lit', {waveId: 'w1'})).toBe(true);
    detach();
    expect(sendWave('live:place:pirate_point:1', 'lamps_lit', {})).toBe(false);
    expect(seen).toHaveLength(1);
  });
});
