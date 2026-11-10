// G29 C2: the class harbor rules (presence place, joined toast, spots) and the projector's words.
import {describe,expect,it} from 'vitest';
import {GAME_URL,LAMP_SPOTS,LOCK_SPOT,REHEARSAL_CODE,arrivals,joinUrl,joinedText,nearestSpot,newCodeBody,presencePlace,projectorModel,readInvite,rememberInvite} from '../src/class-demo/harbor.js';
import {CLASS_ROOM_SIZE,MAX_SHOWN,chooseRoom,placeTopic,readExtra,shownLimit,startDelayMs,trackJitterMs} from '../src/net/live-rules.js';

function memory(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

describe('class harbor',()=>{
  it('announces the class place only for joined players in Saltreach Harbor',()=>{
    expect(presencePlace('saltreach_harbor',true)).toBe('class_harbor');
    expect(presencePlace('saltreach_harbor',false)).toBe('saltreach_harbor');
    expect(presencePlace('smugglers_cove',true)).toBe('smugglers_cove');
    expect(placeTopic('class_harbor',1)).toBe('live:place:class_harbor:1');
  });
  it('raises the room to 40 drawn captains and starts without delay, only for the class room',()=>{
    expect(shownLimit('class_harbor')).toBe(40);expect(shownLimit('saltreach_harbor')).toBe(MAX_SHOWN);
    expect(chooseRoom({roomCounts:{1:39},online:60,place:'class_harbor'})).toBe(1);
    expect(chooseRoom({roomCounts:{1:CLASS_ROOM_SIZE},online:60,place:'class_harbor'})).toBe(2);
    expect(chooseRoom({roomCounts:{1:4},online:30,place:'saltreach_harbor'})).toBe(2);
    expect(chooseRoom({roomCounts:{1:3},crewmateRooms:[2],online:30,place:'class_harbor'})).toBe(1);
    expect(startDelayMs(true,()=>.99)).toBe(0);expect(startDelayMs(false,()=>.5)).toBe(2500);
    expect(trackJitterMs(true,()=>1)).toBe(4000);expect(trackJitterMs(false,()=>1)).toBe(10000);
  });
  it('reads only small lamp and duel extras',()=>{
    expect(readExtra('lamp',{v:1,id:id(1),seq:3,data:{v:1}})).toEqual({id:id(1),event:'lamp',seq:3,data:{v:1}});
    expect(readExtra('chat',{v:1,id:id(1),seq:3,data:{}})).toBeNull();
    expect(readExtra('duel',{v:1,id:'nope',seq:3,data:{}})).toBeNull();
    expect(readExtra('duel',{v:1,id:id(1),seq:3,data:{text:'x'.repeat(600)}})).toBeNull();
    expect(readExtra('duel',{v:1,id:id(1),seq:3,data:[1]})).toBeNull();
  });
  it('remembers the invitation',()=>{
    const session=memory();
    expect(readInvite(session)).toBe(false);rememberInvite(session);expect(readInvite(session)).toBe(true);
    expect(session.getItem('plot_twist_join_v1')).toBe('harbor');
    // A class code from the QR or the Join page also means "in the class harbor", and the in-game
    // button keeps that code instead of overwriting it.
    const coded=memory();coded.setItem('plot_twist_join_v1','K7QXM');
    expect(readInvite(coded)).toBe(true);rememberInvite(coded);expect(coded.getItem('plot_twist_join_v1')).toBe('K7QXM');
    const odd=memory();odd.setItem('plot_twist_join_v1','<b>');expect(readInvite(odd)).toBe(false);
  });
  it('toasts new named captains in one short line',()=>{
    const known=new Set(['a']);
    expect(arrivals(known,[{id:'a',name:'Ana'},{id:'b',name:'Ben'}]).map(peer=>peer.id)).toEqual(['b']);
    expect(joinedText(['Ana'])).toBe('Ana joined');expect(joinedText(['Ana','Ben'])).toBe('Ana and Ben joined');
    expect(joinedText(['Ana','Ben','Chiara','Duarte'])).toBe('Ana and 3 others joined');expect(joinedText([])).toBe('');
  });
  it('finds the lock and the lamp next to the player',()=>{
    expect(nearestSpot([LOCK_SPOT],{x:LOCK_SPOT.x+.5,z:LOCK_SPOT.z})?.id).toBe('keepers_lock');
    expect(nearestSpot(LAMP_SPOTS,{x:LAMP_SPOTS[2].x,z:LAMP_SPOTS[2].z+1})?.index).toBe(2);
    expect(nearestSpot(LAMP_SPOTS,{x:30,z:30})).toBeNull();
  });
});

describe('projector panel words',()=>{
  const demo={flagOn:true,code:'K7QXM',codeSetAt:'2026-11-09T14:00:00Z',guests:12};
  it('shows the QR address with the current code, the code in big letters and a live count',()=>{
    const model=projectorModel({demo,count:12});
    expect(model).toMatchObject({url:'https://the-great-plot-twist.vercel.app/?join=K7QXM',code:'HARBOR-K7QXM',hasCode:true,
      countText:'12 captains in the harbor',statusText:'12 guests joined with a code',canRenew:false});
    expect(model.steps.join(' ')).toContain('HARBOR-K7QXM');
    expect(joinUrl('k7qxm')).toBe(`${GAME_URL}?join=K7QXM`);expect(joinUrl('nope')).toBe('');
    expect(projectorModel({demo:{...demo,guests:1},count:1})).toMatchObject({countText:'1 captain in the harbor',statusText:'1 guest joined with a code'});
  });
  it('lets only a host make a new code, with a confirm text, and says when there is none yet',()=>{
    expect(projectorModel({demo,host:true})).toMatchObject({canRenew:true,buttonLabel:'New class code'});
    expect(projectorModel({demo,host:true}).confirmText).toMatch(/old code stops working for new joins/);
    expect(projectorModel({demo,host:false}).canRenew).toBe(false);
    expect(projectorModel({demo,host:true,pending:true})).toMatchObject({canRenew:false,buttonLabel:'Making a new code…'});
    expect(projectorModel({demo:{...demo,code:null},host:true})).toMatchObject({hasCode:false,url:'',code:'No code yet',canRenew:true,
      statusText:'No class code yet. Make one to let guests in.'});
    expect(projectorModel({demo:{...demo,code:'<img>'}})).toMatchObject({hasCode:false,url:''});
    expect(projectorModel({demo:{flagOn:false,code:'K7QXM',guests:0},host:true}).statusText).toMatch(/flag is off/);
    expect(projectorModel({host:true}).canRenew).toBe(false);
    expect(newCodeBody('uid-1')).toEqual({actionUid:'uid-1'});
  });
  it('shows a made-up practice code in a rehearsal without a host',()=>{
    expect(REHEARSAL_CODE).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(projectorModel({rehearsal:true})).toMatchObject({code:`HARBOR-${REHEARSAL_CODE}`,url:`${GAME_URL}?join=${REHEARSAL_CODE}`,canRenew:false});
    expect(projectorModel({rehearsal:true}).statusText).toMatch(/Rehearsal/);
  });
});
