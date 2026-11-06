import {describe,expect,it} from 'vitest';
import {rooms,entranceFor,canEnterRoom} from '../src/world/interiors/rooms.js';
import {moveInRoom,nearestHotspot,atExit} from '../src/world/interiors/logic.js';
import {captainAssets,captainPose,createCaptainArt} from '../src/world/interiors/captain-art.js';

describe('separate room navigation',()=>{
  it.each(Object.entries(rooms))('finds the %s doorway without changing the island ID',(id,room)=>{
    expect(entranceFor(room.placeId,room.entrance)).toEqual({roomId:id,placeId:'lighthouse_isle',requiresOpenedDoor:!!room.requiresOpenedDoor});
    expect(entranceFor('saltreach_harbor',room.entrance)).toBeNull();
    expect(entranceFor(room.placeId,room.outside)).toBeNull();
  });
  it('refuses malformed coordinates, unknown rooms and an unopened lighthouse',()=>{
    for(const value of [null,{}, {x:NaN,z:2},{x:0,z:Infinity}])expect(entranceFor('lighthouse_isle',value)).toBeNull();
    for(const id of ['missing','__proto__','constructor'])expect(canEnterRoom(id,{ended:true})).toBe(false);
    expect(canEnterRoom('lighthouse',{scene:'tower_door',inventory:['brass_key']})).toBe(false);
    expect(canEnterRoom('lighthouse',{scene:'stairwell'})).toBe(true);
    expect(canEnterRoom('lighthouse',{scene:'lamp_room'})).toBe(true);
    expect(canEnterRoom('lighthouse',{ended:true})).toBe(true);
    expect(canEnterRoom('cottage',null)).toBe(true);
  });
  it('keeps normalized diagonal movement bounded and caps a stalled frame',()=>{
    const start={x:.5,y:.7},straight=moveInRoom(start,{x:1,y:0},.05),diagonal=moveInRoom(start,{x:1,y:1},.05);
    expect(Math.hypot(diagonal.x-start.x,diagonal.y-start.y)).toBeCloseTo(straight.x-start.x);
    expect(moveInRoom(start,{x:1,y:1},60)).toEqual(diagonal);
    expect(start).toEqual({x:.5,y:.7});
  });
  it('slides alongside furniture while refusing to cross it or a room wall',()=>{
    const object={x:.5,y:.3,w:.2,h:.4};
    const moved=moveInRoom({x:.47,y:.5},{x:1,y:1},.05,[object]);
    expect(moved.x).toBe(.47);expect(moved.y).toBeGreaterThan(.5);
    let corner={x:.5,y:.8};for(let i=0;i<600;i++)corner=moveInRoom(corner,{x:1,y:1},.05);
    expect(corner.x).toBeLessThanOrEqual(.905);expect(corner.y).toBeLessThanOrEqual(.915);
    for(const delta of [0,-1,NaN,Infinity])expect(moveInRoom({x:.4,y:.4},{x:1,y:0},delta)).toEqual({x:.4,y:.4});
  });
  it('exposes only the existing story hotspots and a reachable exit',()=>{
    for(const room of Object.values(rooms))for(const spot of room.hotspots)expect(nearestHotspot(room,spot)).toBe(spot);
    expect(rooms.cottage.hotspots[0].id).toBe('desk');expect(rooms.boathouse.hotspots[0].id).toBe('shore');
    expect(rooms.lighthouse.hotspots[0]).toMatchObject({id:'tower_door',resume:true});
    expect(nearestHotspot(rooms.cottage,rooms.cottage.spawn)).toBeNull();
    expect(atExit({x:.5,y:.92})).toBe(true);expect(atExit({x:.8,y:.92})).toBe(false);expect(atExit({x:.5,y:.8})).toBe(false);
  });
});

describe('illustrated room explorer',()=>{
  it('selects directional walking poses and keeps reduced-motion poses still',()=>{
    expect(captainPose({x:0,y:-1})).toEqual({key:'explorer-back',view:'explorer-back',mirror:false});
    expect(captainPose({x:-1,y:0},.2)).toEqual({key:'explorer-side-walk-1',view:'explorer-side',mirror:true});
    expect(captainPose({x:1,y:0},Math.PI+.2)).toEqual({key:'explorer-side-walk-2',view:'explorer-side',mirror:false});
    expect(captainPose({x:0,y:1},.2,true)).toEqual({key:'explorer',view:'explorer',mirror:false});
  });
  it('loads nine assets lazily once, falls back on failure and releases late image callbacks',()=>{
    const created=[];let ready=0;
    const art=createCaptainArt({onReady:()=>ready++,imageFactory:()=>{const image={naturalWidth:96,naturalHeight:128};created.push(image);return image;}});
    const side=captainPose({x:1,y:0},.2);
    expect(created).toHaveLength(0);expect(art.get(side)).toBeNull();art.load();art.load();
    expect(created).toHaveLength(9);expect(created.map(image=>image.src)).toEqual(captainAssets.map(key=>`/pixel/hd/${key}.png`));
    created[0].onload();created[7].onerror();expect(art.get(side)).toBe(created[0]);expect(ready).toBe(1);
    art.dispose();expect(created[1].onload).toBeNull();expect(created[1].onerror).toBeNull();expect(art.get(side)).toBeNull();art.load();expect(created).toHaveLength(9);
  });
});
