// Presence actors are visual only; input samples and visibility filters come from the caller.
import * as THREE from 'three';
import {artSizes,projectPoint} from '../art.js';
import {PRESENCE_LIMITS,placePresenceLabels,resolveActorAsset,samplePosition,selectNearby,shouldSnapSample} from './logic.js';
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
export function createOtherCaptains(scene,container,art,reducedMotion=false){
  const root=new THREE.Group();root.name='other-captains';scene.add(root);
  const records=new Map();let input={status:'off',place:null,others:[],hiddenCount:0,sampledAt:0},clock=0,stats={drawn:0,hidden:0,ids:[]};let disposed=false;
  function releaseRenderable(record){
    if(!record.group)return;
    root.remove(record.group);record.body.geometry.dispose();record.emoteMesh?.geometry.dispose();
    record.ownedMaterial?.dispose();record.ownedEmoteMaterial?.dispose();record.label.remove();
    Object.assign(record,{group:null,body:null,emoteMesh:null,label:null,ownedMaterial:null,ownedEmoteMaterial:null,emoteId:null});
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
    const label=document.createElement('div');label.className='other-captain-label';label.style.cssText='position:absolute;z-index:31;box-sizing:border-box;width:180px;min-height:26px;padding:2px 6px;background:#20392de8;color:#fff0c5;border:1px solid #82966f;font:16px/1.2 Courier New,monospace;white-space:nowrap;text-align:center;pointer-events:none;overflow:hidden;text-overflow:ellipsis;';
    label.setAttribute('aria-hidden','true');container.append(label);
    Object.assign(record,{group,body,label,asset,emoteMesh:null,ownedMaterial:null,ownedEmoteMaterial:null,emoteId:null});
    body.userData.peerId=record.id;root.add(group);
  }
  function createRecord(peer,time){
    const record={id:peer.id,group:null,body:null,emoteMesh:null,label:null,asset:null,peer:{...peer},from:{x:peer.x,y:peer.y},to:{x:peer.x,y:peer.y},fromAt:time,toAt:time,
      place:peer.place,receivedAt:time,joinedAt:time,leavingAt:null,ownedMaterial:null,ownedEmoteMaterial:null,emoteId:null};
    records.set(peer.id,record);return record;
  }
  const positionAt=(record,time)=>samplePosition({...record,time,moving:record.peer.moving});
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
  }
  function update(dt,{place,player,camera,canvas,now,filter='everyone',blocked=false}={}){
    if(disposed)return stats;clock=Number.isFinite(now)?now:clock+Math.max(0,dt||0)*1000;
    const {selected,hidden}=selectNearby([...records.values()],{place,player:{x:player?.x??0,y:player?.y??0},now:clock,filter,blocked});
    const chosen=new Set(selected.map(record=>record.id));
    const motionOff=typeof reducedMotion==='function'?reducedMotion():reducedMotion;
    const assets=new Map(selected.map(record=>[record.id,resolveActorAsset(record.peer,{facing:record.peer.facing,moving:!motionOff&&record.peer.moving,frame:Math.floor(clock/180)%2+1,hasAsset:id=>Boolean(art[id])})]));
    for(const record of [...records.values()]){
      if(record.leavingAt!==null&&clock-record.leavingAt>=PRESENCE_LIMITS.fadeMs){removeRecord(record);continue;}
      if(chosen.has(record.id))attachRenderable(record,assets.get(record.id));else releaseRenderable(record);
    }
    for(const record of selected){
      record.group.visible=true;
      const point=positionAt(record,clock),placePoint=projectPoint(point.x,point.y);record.group.position.set(placePoint.x,placePoint.y,0);record.body.userData.logical=point;
      const bodyAsset=assets.get(record.id);record.asset=bodyAsset;record.body.userData.asset=bodyAsset;const fadeIn=clamp((clock-record.joinedAt)/260,0,1),fadeOut=record.leavingAt===null?1:clamp(1-(clock-record.leavingAt)/PRESENCE_LIMITS.fadeMs,0,1),alpha=fadeIn*fadeOut;
      setMaterial(record,record.body,materialFor(art,bodyAsset),'body',alpha);record.body.scale.x=record.peer.facing==='left'?-1:1;record.body.renderOrder=100+record.peer.y+.15;
      if(record.peer.emote&&art[`emote-${record.peer.emote}`]){
        if(record.emoteId!==record.peer.emote){if(record.emoteMesh){record.group.remove(record.emoteMesh);record.emoteMesh.geometry.dispose();record.ownedEmoteMaterial?.dispose();record.ownedEmoteMaterial=null;}
          record.emoteId=record.peer.emote;record.emoteMesh=makeMesh(`emote-${record.emoteId}`,materialFor(art,`emote-${record.emoteId}`),`emote-${record.emoteId}`);record.group.add(record.emoteMesh);}
        record.emoteMesh.position.y=1.35;setMaterial(record,record.emoteMesh,materialFor(art,`emote-${record.emoteId}`),'emote',alpha);
      }else if(record.emoteMesh){record.group.remove(record.emoteMesh);record.emoteMesh.geometry.dispose();record.ownedEmoteMaterial?.dispose();record.ownedEmoteMaterial=null;record.emoteMesh=null;record.emoteId=null;}
      record.label.textContent=record.peer.name;record.label.title=record.peer.kit?.name??'Captain';record.label.hidden=true;
      record.label.style.opacity=String(alpha);record.label.style.fontSize='16px';record.label.style.display='none';
    }
    const labels=selected.filter(()=>!blocked&&canvas&&camera).map(record=>({record,point:screenPoint(positionAt(record,clock).x,positionAt(record,clock).y,camera,canvas,container)}));
    const box=container.getBoundingClientRect?.()??{width:container.clientWidth??375,height:container.clientHeight??667};
    const positions=placePresenceLabels(labels,{width:box.width||375,height:box.height||667,maxLabels:(box.width||375)<=450?2:4});
    for(const position of positions){
      const label=labels[position.index].record.label;label.style.left=`${Math.round(position.left)}px`;label.style.top=`${Math.round(position.top)}px`;
      label.style.width=`${Math.round(position.width)}px`;label.hidden=false;label.style.display='block';
    }
    stats={drawn:selected.length,hidden:(input.hiddenCount??0)+hidden,ids:selected.map(record=>record.id)};return stats;
  }
  return {ingest,update,get stats(){return {...stats,ids:[...stats.ids]};},dispose(){if(disposed)return;disposed=true;for(const record of [...records.values()])removeRecord(record);root.removeFromParent();}};
}
