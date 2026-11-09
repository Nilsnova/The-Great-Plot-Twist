// G29 C2/C3: the class harbor's room through the real live-presence client and Supabase fakes: no start
// delay, room 1 holds 40 drawn captains, the extras lane (lamps, duel invitations, quick emotes) and what
// is accepted from other phones. The normal rooms keep their numbers (tests/realtime.test.js).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startRealtime} from '../src/online/realtime.js';
import {createFakeClient,playerId,worldOf} from './realtime-fakes.js';

const ME=playerId(1),CLASS='class_harbor',ROOM='live:place:class_harbor:1';
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(console,'warn').mockImplementation(()=>{});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
const settle=(ms=0)=>vi.advanceTimersByTimeAsync(ms);

function start({classHarbor=true,dice=0}={}){
  const client=createFakeClient(),events=[];
  const live=startRealtime({enabled:true,playerId:ME,getAccessToken:async()=>'token-1',supabaseUrl:'https://example.supabase.co',publishableKey:'test-publishable-key',
    emit:event=>events.push(event),createClient:()=>client,random:()=>dice,now:()=>Date.now(),classHarbor});
  return {live,client,events};
}
async function inClassRoom(ctx,count){
  const people=Object.fromEntries(Array.from({length:count},(_,i)=>[playerId(10+i),[CLASS,1]]));
  ctx.live.setPlace(CLASS);await settle();
  const world=ctx.client.open('live:world');world.status('SUBSCRIBED');world.presence(worldOf(people));await settle();
  const room=ctx.client.open(ROOM);room.status('SUBSCRIBED');await settle(5000);
  return {world,room};
}
const extras=room=>room.messages.filter(message=>['lamp','duel'].includes(message.event));

describe('class harbor room',()=>{
  it('starts at once even when the dice would wait, and joins room 1 with 39 others',async()=>{
    const ctx=start({dice:.99});
    await settle();
    expect(ctx.client.open('live:world')).toBeTruthy();
    const {room}=await inClassRoom(ctx,39);
    expect(room.topic).toBe(ROOM);
    const shown=ctx.events.filter(event=>event.type==='live_presence_changed').at(-1);
    expect(shown.shown).toHaveLength(39);expect(shown.hiddenCount).toBe(0);
  });
  it('sends lamp states in the extras lane at once, at most one a second, newest first',async()=>{
    const ctx=start();const {room}=await inClassRoom(ctx,3);
    expect(ctx.live.extra('lamp',{v:1,step:1})).toBe(true);
    expect(ctx.live.extra('lamp',{v:1,step:2})).toBe(true);
    expect(ctx.live.extra('lamp',{v:1,step:3})).toBe(true);
    await settle(0);
    expect(extras(room).map(message=>message.payload.data.step)).toEqual([1]);
    await settle(1000);
    expect(extras(room).map(message=>message.payload.data.step)).toEqual([1,3]);
    expect(extras(room)[0].payload).toMatchObject({v:1,id:ME});
    expect(ctx.live.extra('chat',{v:1})).toBe(false);
  });
  it('shows a wave at once instead of waiting for the next move slot',async()=>{
    const ctx=start();const {room}=await inClassRoom(ctx,30);
    ctx.live.update({x:1,z:1,facing:'down',moving:true});await settle(100);
    expect(ctx.live.emote('wave')).toBe(true);await settle(50);
    expect(room.messages.filter(message=>message.event==='emote')).toHaveLength(1);
  });
  it('hears extras only from captains in the class room',async()=>{
    const ctx=start();const {room}=await inClassRoom(ctx,2);
    room.broadcast('lamp',{v:1,id:playerId(10),seq:5,data:{v:1,lamps:[0,null,null]}});
    room.broadcast('lamp',{v:1,id:playerId(10),seq:5,data:{v:1}}); // the same seq again: dropped
    room.broadcast('lamp',{v:1,id:playerId(99),seq:6,data:{v:1}}); // not in our room
    room.broadcast('duel',{v:1,id:playerId(11),seq:7,data:{v:1,to:'Ana',duel:'d1'}});
    const heard=ctx.events.filter(event=>event.type==='live_peer_extra');
    expect(heard).toEqual([{type:'live_peer_extra',id:playerId(10),event:'lamp',data:{v:1,lamps:[0,null,null]}},
      {type:'live_peer_extra',id:playerId(11),event:'duel',data:{v:1,to:'Ana',duel:'d1'}}]);
  });
  it('has no extras lane in a normal room',async()=>{
    const ctx=start({classHarbor:false});
    ctx.live.setPlace('saltreach_harbor');await settle(5000);
    const world=ctx.client.open('live:world');world.status('SUBSCRIBED');world.presence(worldOf({[playerId(10)]:['saltreach_harbor',1]}));await settle();
    const room=ctx.client.open('live:place:saltreach_harbor:1');room.status('SUBSCRIBED');await settle(11000);
    expect(ctx.live.extra('lamp',{v:1})).toBe(false);
    expect(room.bindings.filter(binding=>binding.filter.event==='lamp')).toHaveLength(0);
  });
});
