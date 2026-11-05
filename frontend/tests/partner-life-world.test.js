import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createWorldPartners} from '../src/world/partners/index.js';

function art(){return Object.fromEntries(['explorer','crew-navigator','crew-navigator-back','crew-navigator-back-walk-1','crew-navigator-back-walk-2','crew-cook','lantern'].map(id=>[id,new THREE.MeshBasicMaterial({map:new THREE.Texture()})]));}
const life=(place,extra={})=>({status:'idle',actor:{place,x:2,y:8,facing:'back',moving:false,archetype:'navigator'},travel:null,post:null,portraitId:'crew-navigator-portrait',chartLine:{from:{x:217,y:156},to:{x:112,y:76},progress:.5,active:true,label:'Saltreach to Cove'},event:null,refusal:null,...extra});

describe('world partner actors',()=>{
  it('draws only partners in the active place using supplied crew poses and posts',()=>{
    const scene=new THREE.Scene(),materials=art(),world=createWorldPartners(scene,{},materials,true);
    world.ingest({partners:[{seat:2,name:'Partner',archetype:'navigator',life:life('harbor',{actor:{place:'harbor',x:2,y:8,facing:'back',moving:true,archetype:'navigator'},post:{label:'Harbor Light',onDuty:true}})},{seat:3,name:'Away',archetype:'cook',life:life('cove',{actor:{place:'cove',x:0,y:0,facing:'front',moving:false,archetype:'cook'}})}]});
    expect(world.stats).toEqual({drawn:0,ids:[]});expect(world.update(0,{place:'harbor',now:1000})).toEqual({drawn:1,ids:[2]});
    let actor;scene.traverse(item=>{if(item.userData.partnerSeat===2)actor=item;});
    expect(actor.userData.asset).toBe('crew-navigator-back');expect(actor.parent.children).toHaveLength(2);
    expect(world.update(0,{place:'cove',now:1100})).toEqual({drawn:1,ids:[3]});
    let textureDisposed=false;materials['crew-navigator-back'].map.addEventListener('dispose',()=>{textureDisposed=true;});
    world.dispose();expect(scene.children).toHaveLength(0);expect(textureDisposed).toBe(false);
  });
  it('uses a walk frame only when motion is allowed and supplies that material',()=>{
    const scene=new THREE.Scene(),materials=art(),world=createWorldPartners(scene,{},materials,false);
    world.ingest({partners:[{seat:2,archetype:'navigator',life:life('harbor',{actor:{place:'harbor',x:0,y:0,facing:'back',moving:true,archetype:'navigator'}})}]});
    world.update(0,{place:'harbor',now:0});let actor;scene.traverse(item=>{if(item.userData.partnerSeat===2)actor=item;});
    expect(actor.userData.asset).toBe('crew-navigator-back-walk-1');world.dispose();
  });
});
