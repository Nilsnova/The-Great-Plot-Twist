// Actual private presence -> A4 sender/view -> wave proxy routing, with injected SDK channels only.
import {it,expect,vi,afterEach} from 'vitest';
import {createSession} from '../src/online/session.js';
import {createOnlinePresence} from '../src/online/adapter/presence.js';
import {startRealtime} from '../src/online/realtime.js';
import {openRoom} from '../src/net/wave-rooms.js';
import {createFakeClient,playerId,worldOf} from './realtime-fakes.js';
const first='isle_k7q2m_0123456789abcdef01234567',second='isle_k7q2m_abcdef0123456789abcdef01';
afterEach(()=>{vi.useRealTimers();});
it('routes the exact current nonce through room1 and rejects stale-room sends/events after rotation and clear',async()=>{
 vi.useFakeTimers();const client=createFakeClient(),listeners=new Set(),events=[],session=createSession();session.setToken('test-session-native-room');
 const state={config:{flags:{live_presence:true}},me:{id:playerId(1),captainName:'Captain One',kit:'true_keeper'},crew:null};
 const presence=createOnlinePresence({state,session,store:{scope:()=>0,isClosed:()=>false,commit:patch=>Object.assign(state,patch)},
  auth:{getAccessToken:async()=>session.getToken(),readCrewSeats:async()=>({ok:true,seats:[]})},now:()=>Date.now(),random:()=>0,
  accept:message=>({accepted:true,message}),refuse:reason=>({accepted:false,reason})},
  {supabaseUrl:'https://example.supabase.co',publishableKey:'test-public-key',loadRealtime:async()=>({startRealtime:args=>startRealtime({...args,createClient:()=>client})}),
   emit:event=>{events.push(event);for(const run of listeners)run(event);}});
 try{
  await presence.refresh();presence.reportPosition({place:first,x:0,y:0,facing:'front',moving:false});await vi.advanceTimersByTimeAsync(0);
  const world=client.open('live:world');world.status('SUBSCRIBED');world.presence(worldOf({[playerId(2)]:[first,1]}));await vi.advanceTimersByTimeAsync(0);
  const channel=client.open(`live:place:${first}:1`);expect(channel).toBeDefined();channel.status('SUBSCRIBED');await vi.advanceTimersByTimeAsync(1000);
  const on=(_type,run)=>{listeners.add(run);return()=>listeners.delete(run);},proxy=openRoom(`live:place:${first}:1`,{on});
  expect(proxy).not.toBeNull();const heard=[];proxy.on('wave_start',data=>heard.push(data));
  const data={waveId:'native_wave_001',seed:77,startsAt:'2026-11-19T00:00:00Z'};
  expect(proxy.send('wave_start',data)).toBe(true);await vi.advanceTimersByTimeAsync(1000);expect(channel.messages.some(row=>row.event==='wave_start')).toBe(true);
  channel.broadcast('wave_start',{v:1,id:playerId(2),seq:1,data});expect(heard).toEqual([data]);
  presence.reportPosition({place:second,x:1,y:2,facing:'right',moving:true});await vi.advanceTimersByTimeAsync(1000);
  const next=client.open(`live:place:${second}:1`);expect(next).toBeDefined();next.status('SUBSCRIBED');await vi.advanceTimersByTimeAsync(1000);
  expect(channel.removed).toBe(true);expect(proxy.send('wave_start',data)).toBe(false);channel.broadcast('wave_start',{v:1,id:playerId(2),seq:2,data});expect(heard).toHaveLength(1);
  expect(presence.reportPosition({place:null}).accepted).toBe(true);await vi.advanceTimersByTimeAsync(0);
  expect(next.removed).toBe(true);expect(state.presence.place).toBeNull();expect(state.presence.others).toEqual([]);proxy.close();
  for(const invalid of [`live:place:${first.slice(0,-1)}:1`,`live:place:${first.toUpperCase()}:1`,`live:place:${second}:2`])expect(openRoom(invalid,{on})).toBeNull();
 }finally{presence.dispose();}
});
