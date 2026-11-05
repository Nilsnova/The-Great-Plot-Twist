import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createOtherCaptains} from '../src/world/others/index.js';
import {PRESENCE_LIMITS,placePresenceLabels,resolveActorAsset,samplePosition,selectNearby,shouldSnapSample} from '../src/world/others/logic.js';

function element(width=375,height=667){return {clientWidth:width,clientHeight:height,children:[],append(child){this.children.push(child);child.parentElement=this;},removeChild(child){this.children=this.children.filter(item=>item!==child);},getBoundingClientRect(){return {left:0,top:0,width,height};}};}
function labelElement(){return {style:{},dataset:{},hidden:false,setAttribute(){},remove(){this.parentElement?.removeChild(this);}};}
function makeArt(){return Object.fromEntries(['explorer','explorer-back','explorer-side',...['wave','cheer','point','lantern','shrug'].map(id=>`emote-${id}`)].map(id=>[id,new THREE.MeshBasicMaterial({map:new THREE.Texture()})]));}
const peer=(id,x,y,extra={})=>({id,name:`Captain ${id}`,kit:{id:'witness',name:'Witness'},place:'saltreach_harbor',x,y,facing:'front',moving:true,emote:null,isCrew:false,at:1000,...extra});

describe('other-captain renderer',()=>{
  it('exposes empty stable stats before its first render',()=>{
    const previous=globalThis.document;globalThis.document={createElement:()=>labelElement()};
    try{const scene=new THREE.Scene(),layer=createOtherCaptains(scene,element(),makeArt(),true);expect(layer.stats).toEqual({drawn:0,hidden:0,ids:[]});layer.dispose();}
    finally{globalThis.document=previous;}
  });
  it('draws nearest eight, filters by crew/place, and stacks labels at phone width',()=>{
    const previous=globalThis.document;globalThis.document={createElement:()=>labelElement()};
    try{
    const scene=new THREE.Scene(),container=element(),art=makeArt(),camera=new THREE.OrthographicCamera(-20,20,20,-20,.1,200);camera.position.set(0,0,100);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
    const canvas={getBoundingClientRect:()=>({left:0,top:0,width:375,height:667})};
    const layer=createOtherCaptains(scene,container,art,true);
    layer.ingest({sampledAt:1000,others:Array.from({length:12},(_,i)=>peer(`p${i}`,i-6,0,{isCrew:i%2===0}))});
    layer.update(0,{place:'saltreach_harbor',player:{x:0,y:0},camera,canvas,now:1000,filter:'everyone'});
    expect(layer.stats.drawn).toBe(8);expect(layer.stats.hidden).toBe(4);
    expect(scene.children[0].children).toHaveLength(8);
    const labels=container.children.filter(item=>!item.hidden);expect(labels).toHaveLength(2);expect(container.children).toHaveLength(8);expect(labels.every(item=>item.style.fontSize==='16px')).toBe(true);
    let body;scene.traverse(item=>{if(item.userData.peerId==='p6')body=item;});expect(body.geometry.parameters.width).toBe(1.5);expect(body.renderOrder).toBeCloseTo(100.15);
    expect(labels.every(item=>item.textContent.split('\n').length===1)).toBe(true);
    layer.update(0,{place:'saltreach_harbor',player:{x:0,y:0},camera,canvas,now:1000,filter:'crew'});expect(layer.stats.drawn).toBe(6);
    layer.update(0,{place:'saltreach_harbor',player:{x:0,y:0},camera,canvas,now:1000,filter:'off'});expect(layer.stats.drawn).toBe(0);
    layer.dispose();expect(container.children).toHaveLength(0);expect(scene.children).toHaveLength(0);
    }finally{globalThis.document=previous;}
  });
  it('caps active actors and fading departures together at eight',()=>{
    const previous=globalThis.document;globalThis.document={createElement:()=>labelElement()};
    try{
      const scene=new THREE.Scene(),container=element(),layer=createOtherCaptains(scene,container,makeArt(),true);
      layer.ingest({sampledAt:1000,others:Array.from({length:7},(_,i)=>peer(`old${i}`,i,0))});
      layer.update(0,{place:'saltreach_harbor',player:{x:0,y:0},now:1000,filter:'everyone'});
      layer.ingest({sampledAt:1100,others:Array.from({length:3},(_,i)=>peer(`new${i}`,10+i,0))});
      layer.update(0,{place:'saltreach_harbor',player:{x:0,y:0},now:1100,filter:'everyone'});
      expect(layer.stats.drawn).toBe(8);expect(layer.stats.ids).toHaveLength(8);
      let visible=0;scene.traverse(item=>{if(item.userData.peerId&&item.parent.visible)visible++;});expect(visible).toBe(8);
      layer.dispose();expect(container.children).toHaveLength(0);expect(scene.children).toHaveLength(0);
    }finally{globalThis.document=previous;}
  });
  it('interpolates fresh samples and snaps after a two-second gap or place change',()=>{
    const previous=globalThis.document;globalThis.document={createElement:()=>labelElement()};
    try{
    const scene=new THREE.Scene(),container=element(),art=makeArt(),camera=new THREE.OrthographicCamera(-20,20,20,-20,.1,200);camera.position.set(0,0,100);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
    const layer=createOtherCaptains(scene,container,art,true),canvas={getBoundingClientRect:()=>({left:0,top:0,width:375,height:667})};
    layer.ingest({sampledAt:1000,others:[peer('p',0,0)]});layer.update(0,{place:'saltreach_harbor',player:{x:0,y:0},camera,canvas,now:1100,filter:'everyone'});
    layer.ingest({sampledAt:1200,others:[peer('p',10,0,{at:1200})]});layer.update(0,{place:'saltreach_harbor',player:{x:0,y:0},camera,canvas,now:1300,filter:'everyone'});
    let mesh;scene.traverse(item=>{if(item.userData.peerId==='p')mesh=item;});expect(mesh.userData.logical.x).toBeGreaterThan(0);expect(mesh.userData.logical.x).toBeLessThan(10);
    layer.ingest({sampledAt:4000,others:[peer('p',20,0,{at:4000})]});layer.update(0,{place:'saltreach_harbor',player:{x:0,y:0},camera,canvas,now:4000,filter:'everyone'});expect(mesh.userData.logical.x).toBe(20);
    layer.ingest({sampledAt:4100,others:[peer('p',30,0,{at:4100,place:'home_islet'})]});layer.update(0,{place:'home_islet',player:{x:0,y:0},camera,canvas,now:4100,filter:'everyone'});expect(mesh.userData.logical.x).toBe(30);
    let textureDisposed=false;art.explorer.map.addEventListener('dispose',()=>{textureDisposed=true;});
    layer.dispose();expect(textureDisposed).toBe(false);
    }finally{globalThis.document=previous;}
  });
});

describe('presence rendering math',()=>{
  it('selects the matching crew walk pose and falls back when it is not loaded',()=>{
    const exists=id=>id==='crew-navigator-back-walk-2'||id==='explorer-side';
    expect(resolveActorAsset({kit:{id:'true_keeper'}},{facing:'back',moving:true,frame:2,hasAsset:exists})).toBe('crew-navigator-back-walk-2');
    expect(resolveActorAsset({archetype:'deckhand',kit:{id:'witness'}},{facing:'left',moving:true,frame:2,hasAsset:exists})).toBe('explorer-side');
    expect(resolveActorAsset({kit:{id:'unknown'}},{facing:'front',hasAsset:id=>id==='explorer'})).toBe('explorer');
  });
  it('interpolates for 200ms and caps extrapolation at 250ms',()=>{
    const sample={from:{x:0,y:0},to:{x:10,y:-10},fromAt:1000,toAt:1200,moving:true};
    expect(samplePosition({...sample,time:1100})).toEqual({x:5,y:-5});
    expect(samplePosition({...sample,time:1450})).toEqual({x:11.5,y:-11.5});
    expect(samplePosition({...sample,time:1900})).toEqual({x:11.5,y:-11.5});
    expect(PRESENCE_LIMITS.interpolationMs).toBe(200);expect(PRESENCE_LIMITS.extrapolationMs).toBe(250);
  });
  it('snaps after two seconds or a place transition',()=>{
    expect(shouldSnapSample({place:'harbor',previousPlace:'harbor',sampledAt:3001,lastReceivedAt:1000})).toBe(true);
    expect(shouldSnapSample({place:'home',previousPlace:'harbor',sampledAt:1100,lastReceivedAt:1000})).toBe(true);
    expect(shouldSnapSample({place:'harbor',previousPlace:'harbor',sampledAt:3000,lastReceivedAt:1000})).toBe(false);
  });
  it('keeps fading departures in the eight-nearest cap and expires the fade',()=>{
    const records=Array.from({length:10},(_,i)=>({id:`p${i}`,place:'harbor',peer:{isCrew:i%2===0},to:{x:i===8?-.1:i,y:0},leavingAt:i===9?580:i===8?581:null}));
    const result=selectNearby(records,{place:'harbor',player:{x:0,y:0},now:1000});
    expect(result.selected).toHaveLength(8);expect(result.selected.map(row=>row.id)).toContain('p8');expect(result.selected.map(row=>row.id)).not.toContain('p9');
    expect(result.hidden).toBe(1);
  });
  it('shows at most two 16px phone labels in bounded actor-anchored space',()=>{
    const labels=placePresenceLabels(Array.from({length:8},(_,index)=>({point:{x:80+index*5,y:325}})),{width:375,height:667});
    expect(labels).toHaveLength(2);
    for(const label of labels){expect(label.left).toBeGreaterThanOrEqual(8);expect(label.left+label.width).toBeLessThanOrEqual(367);expect(label.top).toBeGreaterThanOrEqual(258);expect(label.top+label.height).toBeLessThanOrEqual(437);expect(label.height).toBe(26);expect(label.width).toBe(180);}
    for(let a=0;a<labels.length;a++)for(let b=a+1;b<labels.length;b++){
      const left=labels[a],right=labels[b],overlapX=left.left<right.left+right.width&&right.left<left.left+left.width,overlapY=left.top<right.top+right.height&&right.top<left.top+left.height;
      expect(overlapX&&overlapY).toBe(false);
    }
  });
  it('hides names when actor anchors are outside the protected phone area',()=>{
    expect(placePresenceLabels([{point:{x:180,y:90}}],{width:375,height:667})).toHaveLength(0);
  });
});
