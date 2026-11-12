// Presence actors are visual only; input samples and visibility filters come from the caller.
import './labels.css';
import * as THREE from 'three';
import {artSizes,projectPoint} from '../art.js';
import {PRESENCE_LIMITS,captainVariant,placePresenceLabels,resolveActorAsset,samplePosition,selectNearby,shouldSnapSample} from './logic.js';
import {poseFrame} from '../../pirates/poses.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const materialFor=(art,id)=>art[id]??art.explorer;
function makeMesh(name,material,asset){
  const fallback=asset.startsWith('emote-')?[1.5,1.5,.5]:artSizes.explorer;
  const [width,height,anchor]=artSizes[asset]??fallback;
  const geometry=new THREE.PlaneGeometry(width,height);
  geometry.translate(0,height*(0.5-anchor),0);
  const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=121;mesh.frustumCulled=false;return mesh;
}
function screenPoint(x,z,camera,canvas,container){
  const world=projectPoint(x,z),point=new THREE.Vector3(world.x,world.y,0).project(camera),rect=canvas.getBoundingClientRect(),box=container.getBoundingClientRect?.()??{left:0,top:0};
  return {x:rect.left+(point.x+1)*rect.width/2-box.left,y:rect.top+(1-point.y)*rect.height/2-box.top};
}
// colourOf(id): a captain's lobby colour 0-9 (GAME-V3.md §7), or null; scale(): how big captains draw (1.4 in a wave).
export function createOtherCaptains(scene,container,art,reducedMotion=false,{colourOf=()=>null,scale=()=>1}={}){
  const root=new THREE.Group();root.name='other-captains';scene.add(root);
  const readScale=()=>{try{const k=Number(scale());return Number.isFinite(k)&&k>0?k:1;}catch{return 1;}};
  const withColour=peer=>{let own=null;try{own=colourOf(peer?.id);}catch{own=null;}return Number.isInteger(own)&&own>=0&&own<10?{...peer,colour:own+1}:peer;};
  const records=new Map();let input={status:'off',place:null,others:[],hiddenCount:0,sampledAt:0},clock=0,stats={drawn:0,hidden:0,ids:[]};let disposed=false,ingested=0,ripples=0;
  function releaseRenderable(record){
    if(!record.group)return;
    root.remove(record.group);record.body.geometry.dispose();record.emoteMesh?.geometry.dispose();record.poseMesh?.geometry.dispose();
    record.ownedMaterial?.dispose();record.ownedEmoteMaterial?.dispose();record.label.remove();
    Object.assign(record,{group:null,body:null,emoteMesh:null,poseMesh:null,label:null,ownedMaterial:null,ownedEmoteMaterial:null,emoteId:null});
  }
  function removeRecord(record){
    releaseRenderable(record);records.delete(record.id);
  }
  function setMaterial(record,mesh,base,which,opacity){
    const ownKey=which==='body'?'ownedMaterial':'ownedEmoteMaterial';
    if(opacity<.999){
      if(!record[ownKey]||record[ownKey].userData.base!==base){record[ownKey]?.dispose();record[ownKey]=base.clone();record[ownKey].userData.base=base;}
      record[ownKey].opacity=opacity;mesh.material=record[ownKey];
    }else if(record[ownKey]){record[ownKey].dispose();record[ownKey]=null;mesh.material=base;}
    else mesh.material=base;
  }
  function attachRenderable(record,asset){
    if(record.group)return;
    const group=new THREE.Group(),body=makeMesh(asset,materialFor(art,asset),asset);group.add(body);
    const label=document.createElement('div');label.className='other-captain-label';
    label.setAttribute('aria-hidden','true');container.append(label);
    Object.assign(record,{group,body,label,asset,emoteMesh:null,ownedMaterial:null,ownedEmoteMaterial:null,emoteId:null});
    body.userData.peerId=record.id;root.add(group);
  }
  function createRecord(peer,time){
    const record={id:peer.id,group:null,body:null,emoteMesh:null,poseMesh:null,label:null,asset:null,peer:{...peer},from:{x:peer.x,y:peer.y},to:{x:peer.x,y:peer.y},fromAt:time,toAt:time,
      place:peer.place,receivedAt:time,joinedAt:time,leavingAt:null,ownedMaterial:null,ownedEmoteMaterial:null,emoteId:null,quiet:ingested===0,announced:false,emoteAt:0};
    records.set(peer.id,record);return record;
  }
  const positionAt=(record,time)=>samplePosition({...record,time,moving:record.peer.moving});
  // A captain lands: a ring of light opens on the ground and a few pale sparks rise (at most a few at once).
  let rippleClock=0;
  function arrive(point,still){
    const fx=scene.userData?.pixelFx;if(!fx)return;
    if(clock-rippleClock>1000){rippleClock=clock;ripples=0;}if(++ripples>6)return;
    fx.bloom(point.x,point.y+.6,{radius:1.4,life:.9,colour:'#bfe6dc'});
    if(still)return;
    fx.ring(point.x,point.y,{radius:1.8,life:.75,colour:'#d8f0e6'});fx.ring(point.x,point.y,{radius:3.2,life:1,delay:.12,colour:'#9fd0c4'});
    fx.burst(point.x,point.y+.2,{count:14,speed:[1.2,3],angle:Math.PI/2,spread:1.2,gravity:2.5,life:[.5,1],colour:'#e3f6ee',size:[1,1]});
  }
  function ingest(presence){
    if(disposed)return;input=presence??input;const time=Number.isFinite(input.sampledAt)?input.sampledAt:clock,seen=new Set();
    for(const sample of input.others??[]){
      const peer={...sample,place:sample?.place??input.place};
      if(!peer?.id||!Number.isFinite(peer.x)||!Number.isFinite(peer.y))continue;seen.add(peer.id);
      let record=records.get(peer.id);if(!record)record=createRecord(peer,time);
      else if(shouldSnapSample({place:peer.place,previousPlace:record.place,sampledAt:time,lastReceivedAt:record.receivedAt})){record.from={x:peer.x,y:peer.y};record.to={...record.from};record.fromAt=record.toAt=time;record.joinedAt=time;record.leavingAt=null;record.place=peer.place;}
      else if(time>record.toAt){record.from=positionAt(record,time);record.to={x:peer.x,y:peer.y};record.fromAt=time;record.toAt=time+PRESENCE_LIMITS.interpolationMs;record.place=peer.place;record.leavingAt=null;}
      record.peer={...peer};record.receivedAt=time;record.leavingAt=null;
    }
    for(const record of records.values())if(!seen.has(record.id)&&record.leavingAt===null)record.leavingAt=time;
    ingested++;
  }
  // max: how many captains are drawn (40 in the class harbor); emoteScale: bigger emote bubbles there.
  // hide: ids not to draw now (a captain who has fallen in the wave lies in the wave's own drawing,
  // src/pirates/figures.js); they stay chosen, so figures() still knows where they are.
  // poses: Map(id -> {kind, flip, age}): a captain who fires or strikes shows the pose in their own colour
  // on this figure (src/pirates/poses.js), facing the shot, instead of a second captain where they fired.
  function update(dt,{place,player,camera,canvas,now,filter='everyone',blocked=false,max=PRESENCE_LIMITS.visible,emoteScale=1,hide=null,poses=null}={}){
    if(disposed)return stats;clock=Number.isFinite(now)?now:clock+Math.max(0,dt||0)*1000;
    const {selected,hidden}=selectNearby([...records.values()],{place,player:{x:player?.x??0,y:player?.y??0},now:clock,filter,blocked,max});
    const chosen=new Set(selected.map(record=>record.id));
    const motionOff=typeof reducedMotion==='function'?reducedMotion():reducedMotion;
    const assets=new Map(selected.map(record=>[record.id,resolveActorAsset(withColour(record.peer),{facing:record.peer.facing,moving:!motionOff&&record.peer.moving,frame:Math.floor(clock/180)%2+1,hasAsset:id=>Boolean(art[id])})]));
    for(const record of [...records.values()]){
      if(record.leavingAt!==null&&clock-record.leavingAt>=PRESENCE_LIMITS.fadeMs){removeRecord(record);continue;}
      if(chosen.has(record.id))attachRenderable(record,assets.get(record.id));else releaseRenderable(record);
    }
    const hiddenNow=id=>!!hide&&typeof hide.has==='function'&&hide.has(id);
    for(const record of selected){
      record.group.visible=!hiddenNow(record.id);
      const point=positionAt(record,clock),placePoint=projectPoint(point.x,point.y);record.group.position.set(placePoint.x,placePoint.y,0);record.body.userData.logical=point;
      if(!record.announced){record.announced=true;if(!record.quiet&&clock-record.joinedAt<1500)arrive(placePoint,motionOff);}
      const bodyAsset=assets.get(record.id);record.asset=bodyAsset;record.body.userData.asset=bodyAsset;const fadeIn=clamp((clock-record.joinedAt)/260,0,1),fadeOut=record.leavingAt===null?1:clamp(1-(clock-record.leavingAt)/PRESENCE_LIMITS.fadeMs,0,1),alpha=fadeIn*fadeOut;
      setMaterial(record,record.body,materialFor(art,bodyAsset),'body',alpha);{const k=readScale();record.body.scale.set((record.peer.facing==='left'?-1:1)*k,k,1);}record.body.renderOrder=100+record.peer.y+.15;
      {const pose=typeof poses?.get==='function'?poses.get(record.id):null,posed=pose?poseFrame(pose,captainVariant(withColour(record.peer))-1):null;
        if(posed&&art[posed]){
          if(!record.poseMesh){record.poseMesh=makeMesh(posed,art[posed],posed);record.poseMesh.name='captain-pose';record.group.add(record.poseMesh);}
          const k=readScale();record.poseMesh.material=art[posed];record.poseMesh.userData.pose=posed;record.poseMesh.scale.set((pose.flip?-1:1)*k,k,1);
          record.poseMesh.renderOrder=record.body.renderOrder;record.poseMesh.visible=true;record.body.visible=false;
        }else{if(record.poseMesh)record.poseMesh.visible=false;record.body.visible=true;}}
      if(record.peer.emote&&art[`emote-${record.peer.emote}`]){
        if(record.emoteId!==record.peer.emote){if(record.emoteMesh){record.group.remove(record.emoteMesh);record.emoteMesh.geometry.dispose();record.ownedEmoteMaterial?.dispose();record.ownedEmoteMaterial=null;}
          record.emoteId=record.peer.emote;record.emoteMesh=makeMesh(`emote-${record.emoteId}`,materialFor(art,`emote-${record.emoteId}`),`emote-${record.emoteId}`);record.emoteMesh.renderOrder=942;record.group.add(record.emoteMesh);record.emoteAt=clock;}
        // Pop in: whole-pixel scale steps (small, overshoot, settle) and a short hop, never fractional.
        const pop=motionOff?1:clamp((clock-record.emoteAt)/240,0,1),scale=pop<.3?Math.max(1,emoteScale-1):pop<.65?emoteScale+1:emoteScale;
        record.emoteMesh.position.y=Math.round((1.35+(scale-1)*.75+(pop<1?(1-pop)*.5:0))*16)/16;record.emoteMesh.scale.setScalar(scale);setMaterial(record,record.emoteMesh,materialFor(art,`emote-${record.emoteId}`),'emote',alpha);
      }else if(record.emoteMesh){record.group.remove(record.emoteMesh);record.emoteMesh.geometry.dispose();record.ownedEmoteMaterial?.dispose();record.ownedEmoteMaterial=null;record.emoteMesh=null;record.emoteId=null;}
      record.label.textContent=record.peer.name;record.label.title=record.peer.kit?.name??'Captain';record.label.hidden=true;
      record.label.style.opacity=String(alpha);record.label.style.fontSize='16px';record.label.style.display='none';
    }
    const labels=selected.filter(record=>!blocked&&canvas&&camera&&!hiddenNow(record.id)).map(record=>({record,point:screenPoint(positionAt(record,clock).x,positionAt(record,clock).y,camera,canvas,container)}));
    const box=container.getBoundingClientRect?.()??{width:container.clientWidth??375,height:container.clientHeight??667};
    const positions=placePresenceLabels(labels,{width:box.width||375,height:box.height||667,maxLabels:(box.width||375)<=450?2:4});
    for(const position of positions){
      const label=labels[position.index].record.label;label.style.left=`${Math.round(position.left)}px`;label.style.top=`${Math.round(position.top)}px`;
      label.style.width=`${Math.round(position.width)}px`;label.hidden=false;label.style.display='block';
    }
    stats={drawn:selected.length,hidden:(input.hiddenCount??0)+hidden,ids:selected.map(record=>record.id)};return stats;
  }
  // The figures chosen in the last update, where they stand now: [{id, x, z, colour}] (colour: the lobby
  // colour 0-9, or null when not known), for the wave to match its captains to (src/pirates/figures.js).
  function figures(){
    const list=[];
    for(const record of records.values()){
      if(!record.group||record.leavingAt!==null)continue;
      const point=positionAt(record,clock);let colour=null;try{colour=colourOf(record.id);}catch{colour=null;}
      list.push({id:record.id,x:point.x,z:point.y,colour:Number.isInteger(colour)&&colour>=0&&colour<10?colour:null});
    }
    return list;
  }
  return {ingest,update,figures,get stats(){return {...stats,ids:[...stats.ids]};},dispose(){if(disposed)return;disposed=true;for(const record of [...records.values()])removeRecord(record);root.removeFromParent();}};
}
