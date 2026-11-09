// G29 C2: the class harbor rules (presence place, joined toast, spots, demo path) and the projector's words.
import {describe,expect,it} from 'vitest';
import {JOIN_CODE,JOIN_URL,LAMP_SPOTS,LOCK_SPOT,arrivals,joinedText,nearestSpot,openDemoBody,presencePlace,projectorModel,readInvite,readPath,rememberInvite,writePath} from '../src/class-demo/harbor.js';
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
  it('remembers the invitation and the chosen path',()=>{
    const session=memory(),local=memory();
    expect(readInvite(session)).toBe(false);rememberInvite(session);expect(readInvite(session)).toBe(true);
    expect(readPath(local)).toBe('demo');writePath(local,'full');expect(readPath(local)).toBe('full');writePath(local,'demo');expect(readPath(local)).toBe('demo');
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
  const now=Date.parse('2026-11-09T13:00:00Z');
  it('shows the join address, the code and a live count',()=>{
    const model=projectorModel({count:12,now});
    expect(model).toMatchObject({url:'https://the-great-plot-twist.vercel.app/?join=harbor',code:'HARBOR',countText:'12 captains in the harbor',canOpen:false});
    expect(JOIN_URL).toBe(model.url);expect(JOIN_CODE).toBe('HARBOR');
    expect(projectorModel({count:1,now}).countText).toBe('1 captain in the harbor');
  });
  it('states the demo window and lets only the host open it',()=>{
    expect(projectorModel({demo:{flagOn:true,open:false,openUntil:null},host:true,now})).toMatchObject({windowText:'Demo closed: guests cannot join yet.',canOpen:true,buttonLabel:'Open demo for 2 hours'});
    expect(projectorModel({demo:{flagOn:true,open:true,openUntil:'2026-11-09T15:00:00Z'},host:true,now})).toMatchObject({open:true,buttonLabel:'Keep open for 2 more hours'});
    expect(projectorModel({demo:{flagOn:true,open:true,openUntil:'2026-11-09T12:00:00Z'},host:true,now}).open).toBe(false);
    expect(projectorModel({demo:{flagOn:false},host:true,now})).toMatchObject({canOpen:false,windowText:'The demo flag is off on the server.'});
    expect(projectorModel({host:false,now}).canOpen).toBe(false);
    expect(projectorModel({host:true,pending:true,now})).toMatchObject({canOpen:false,buttonLabel:'Opening…'});
    expect(projectorModel({rehearsal:true,now}).windowText).toMatch(/Rehearsal/);
    expect(openDemoBody('uid-1')).toEqual({hours:2,actionUid:'uid-1'});
  });
});
