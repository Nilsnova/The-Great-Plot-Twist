import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createWorldPartners} from '../src/world/partners/index.js';
import {projectPoint} from '../src/world/art.js';
import {createCamera} from '../src/player/camera.js';
import {worldViewport} from '../src/pixel/display.js';
import {places} from '../src/world/places/registry.js';

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


function mustered(){return {mode:'online',account:{state:'signed_in',hasKit:true},partners:[],
  crew:{status:'active',mySeat:1,seats:[
    {seat:1,kind:'player',name:'Recorded captain',isYou:true,archetype:'deckhand'},
    {seat:2,kind:'player',name:'Recorded second captain',isYou:false,archetype:'salvager'},
    {seat:3,kind:'npc',name:'Recorded partner',isYou:false,archetype:'navigator'},
    {seat:4,kind:'npc',name:'Recorded partner',isYou:false,archetype:'cook'},
  ]}};}
function bodies(scene){const result=[];scene.traverse(item=>{if(item.userData.partnerSeat)result.push(item);});return result;}

describe('confirmed muster appearance',()=>{
  it('draws the two supplied NPC seats beside the harbor arrival without changing any adapter field',()=>{
    const scene=new THREE.Scene(),materials=art(),world=createWorldPartners(scene,{},materials,true),view=mustered(),before=structuredClone(view);
    world.ingest(view);expect(world.update(0,{place:'saltreach_harbor',now:0})).toEqual({drawn:2,ids:[3,4]});
    expect(bodies(scene).map(body=>body.userData.asset)).toEqual(['crew-navigator','crew-cook']);
    expect(bodies(scene).map(body=>body.parent.position.toArray())).toEqual([
      [...Object.values(projectPoint(-2,17)),0],[...Object.values(projectPoint(2,17)),0],
    ]);
    expect(view).toEqual(before);expect(view.partners).toEqual([]);
    expect(world.update(0,{place:'lighthouse_isle',now:0})).toEqual({drawn:0,ids:[]});
    expect(bodies(scene)).toHaveLength(0);world.dispose();
  });

  it('removes departed seats and closed crew states on ingestion and disposes their owned geometry',()=>{
    const scene=new THREE.Scene(),world=createWorldPartners(scene,{},art(),true),view=mustered();
    world.ingest(view);world.update(0,{place:'saltreach_harbor',now:0});
    let disposed=0;for(const body of bodies(scene))body.geometry.addEventListener('dispose',()=>disposed++);
    view.crew.seats[3]={seat:4,kind:'open',name:'Open seat',isYou:false,archetype:null};world.ingest(view);
    expect(world.stats).toEqual({drawn:1,ids:[3]});expect(bodies(scene).map(body=>body.userData.partnerSeat)).toEqual([3]);expect(disposed).toBe(1);
    view.crew.status='finished';world.ingest(view);expect(world.stats).toEqual({drawn:0,ids:[]});expect(bodies(scene)).toHaveLength(0);expect(disposed).toBe(2);
    view.crew.status='active';world.ingest(view);world.update(0,{place:'saltreach_harbor',now:0});expect(world.stats.drawn).toBe(1);
    view.account.state='signed_out';world.ingest(view);expect(bodies(scene)).toHaveLength(0);expect(world.stats.drawn).toBe(0);
    world.dispose();world.dispose();expect(scene.children).toHaveLength(0);
  });

  it.each(['forming','finished'])('does not stage crew status %s',status=>{
    const scene=new THREE.Scene(),world=createWorldPartners(scene,{},art(),false),view=mustered();view.crew.status=status;
    world.ingest(view);expect(world.update(0,{place:'saltreach_harbor',now:0})).toEqual({drawn:0,ids:[]});world.dispose();
  });

  it.each([
    view=>{view.mode='local';},view=>{view.account.state='expired';},view=>{view.account.hasKit=false;},
    view=>{view.crew.seats[3].seat=3;},view=>{view.crew.seats[3].seat=5;},view=>{view.crew.seats[3].seat='4';},
    view=>{view.crew.seats[3].archetype='unknown';},view=>{view.crew.seats[3]=null;},view=>{view.crew.seats.pop();},
    view=>{view.crew.mySeat=null;view.crew.seats[0].isYou=false;},
  ])('fails closed for a malformed or unavailable crew snapshot %#',change=>{
    const scene=new THREE.Scene(),world=createWorldPartners(scene,{},art(),true),view=mustered();change(view);
    world.ingest(view);expect(world.update(0,{place:'saltreach_harbor',now:0})).toEqual({drawn:0,ids:[]});expect(bodies(scene)).toHaveLength(0);world.dispose();
  });

  it('gives the entire scene to one authoritative partner, including an actor in another place',()=>{
    const scene=new THREE.Scene(),world=createWorldPartners(scene,{},art(),true),view=mustered();
    world.ingest(view);world.update(0,{place:'saltreach_harbor',now:0});expect(world.stats.drawn).toBe(2);
    view.partners=[{seat:3,archetype:'navigator',life:life('saltreach_harbor',{actor:{place:'saltreach_harbor',x:9,y:10.6,facing:'back',moving:false}})}];
    world.ingest(view);expect(bodies(scene)).toHaveLength(0);
    expect(world.update(0,{place:'saltreach_harbor',now:0})).toEqual({drawn:1,ids:[3]});
    expect(bodies(scene)[0].parent.position.toArray()).toEqual([...Object.values(projectPoint(9,10.6)),0]);
    view.partners[0].life.actor.place='smugglers_cove';world.ingest(view);
    expect(world.update(0,{place:'saltreach_harbor',now:0})).toEqual({drawn:0,ids:[]});
    expect(world.update(0,{place:'smugglers_cove',now:0})).toEqual({drawn:1,ids:[3]});world.dispose();
  });

  it.each([[320,667],[375,400],[1280,720]])('keeps idle muster sprites inside the normal %s by %s arrival frame', (width,height)=>{
    const scene=new THREE.Scene(),world=createWorldPartners(scene,{},art(),true),view=mustered();
    view.crew.seats[1]={seat:2,kind:'npc',name:'Recorded partner',isYou:false,archetype:'cook'};
    world.ingest(view);world.update(0,{place:'saltreach_harbor',now:0});
    const framing=createCamera({pointer:{wheel:0}}),[x,z]=places.saltreach_harbor.spawn;
    framing.setPlace('saltreach_harbor',new THREE.Vector3(x,1.03,z));
    const camera=framing.camera;Object.assign(camera,worldViewport(width,height,camera.userData.viewHeight));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
    expect(world.stats.drawn).toBe(3);
    for(const body of bodies(scene)){
      const box=new THREE.Box3().setFromObject(body);
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y]){
        const point=new THREE.Vector3(x,y,0).project(camera);
        expect(point.x).toBeGreaterThanOrEqual(-1);expect(point.x).toBeLessThanOrEqual(1);
        expect(point.y).toBeGreaterThanOrEqual(-1);expect(point.y).toBeLessThanOrEqual(1);
      }
    }
    world.dispose();
  });
});
