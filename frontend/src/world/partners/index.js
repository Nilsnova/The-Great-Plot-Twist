// NPCs use the shared crew art cache; this renderer owns only its small geometries.
import * as THREE from 'three';
import {artSizes,projectPoint} from '../art.js';
import {resolveActorAsset} from '../others/logic.js';

const materialFor=(art,id)=>art[id]??art.explorer;
const harbor='saltreach_harbor',archetypes=new Set(['deckhand','navigator','cook','salvager']);
const positionOf=partner=>partner?.mustered?partner.pose:partner?.life?.actor;
const validPosition=position=>typeof position?.place==='string'&&Number.isFinite(position.x)&&Number.isFinite(position.y);
function musterAppearance(view){
  const crew=view?.crew,seats=crew?.seats;
  if(view?.mode!=='online'||view.account?.state!=='signed_in'||view.account?.hasKit!==true
    ||crew?.status!=='active'||!Array.isArray(seats)||seats.length!==4)return [];
  if(new Set(seats.map(seat=>seat?.seat)).size!==4||seats.some(seat=>!Number.isInteger(seat?.seat)||seat.seat<1||seat.seat>4
    ||!['player','npc','open'].includes(seat.kind)||seat.kind==='npc'&&!archetypes.has(seat.archetype)))return [];
  if(!seats.some(seat=>seat.kind==='player'&&(seat.isYou===true||seat.seat===crew.mySeat)))return [];
  const npcs=seats.filter(seat=>seat.kind==='npc').sort((a,b)=>a.seat-b.seat);
  if(!npcs.length||npcs.length>3)return [];
  // Confirmed crew seats gather beside the harbor arrival at [0,19]. These idle art poses
  // stay inside this renderer; they supply no case location, job, order or chart state.
  const poses=npcs.length===1?[[0,16.25]]:npcs.length===2?[[-2,17],[2,17]]:[[-2,17],[0,16.25],[2,17]];
  return npcs.map((seat,index)=>({seat:seat.seat,archetype:seat.archetype,mustered:true,
    pose:{place:harbor,x:poses[index][0],y:poses[index][1],facing:'front',moving:false}}));
}
function sprite(asset,material){
  const [width,height,anchor]=artSizes[asset]??artSizes.explorer,geometry=new THREE.PlaneGeometry(width,height);
  geometry.translate(0,height*(.5-anchor),0);const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;return mesh;
}

export function createWorldPartners(scene,container,art,reducedMotion=false){
  const root=new THREE.Group();root.name='npc-partners';scene.add(root);const actors=new Map();let partners=[],clock=0,stats={drawn:0,ids:[]},disposed=false;
  function remove(id,actor){root.remove(actor.group);actor.body.geometry.dispose();actor.lantern?.geometry.dispose();actors.delete(id);}
  function create(partner){
    const group=new THREE.Group(),body=sprite('explorer',materialFor(art,'explorer'));body.userData.partnerSeat=partner.seat;group.add(body);
    const actor={group,body,lantern:null,asset:'explorer',mustered:partner.mustered===true,archetype:positionOf(partner)?.archetype??partner.archetype};root.add(group);actors.set(partner.seat,actor);return actor;
  }
  function ingest(view){
    if(disposed)return;
    const supplied=Array.isArray(view)?view:Array.isArray(view?.partners)?view.partners:[];
    // Any supplied case partner list owns the whole scene, including partners in another place.
    partners=supplied.length?supplied.filter(partner=>Number.isInteger(partner?.seat)&&partner.seat>=1&&partner.seat<=4)
      .map(partner=>({...partner,mustered:false,life:partner.life?{...partner.life,actor:partner.life.actor?{...partner.life.actor}:null}:null})):musterAppearance(view);
    const kept=new Map(partners.filter(partner=>validPosition(positionOf(partner))).map(partner=>[partner.seat,partner]));
    for(const [seat,actor] of [...actors]){
      const next=kept.get(seat);
      if(!next||actor.mustered!==(next.mustered===true)||actor.archetype!==(positionOf(next)?.archetype??next.archetype))remove(seat,actor);
    }
    stats={drawn:stats.ids.filter(seat=>actors.has(seat)).length,ids:stats.ids.filter(seat=>actors.has(seat))};
  }
  function update(dt,{place,now}={}){
    if(disposed)return stats;clock=Number.isFinite(now)?now:clock+Math.max(0,dt||0)*1000;
    const visible=partners.filter(partner=>validPosition(positionOf(partner))&&positionOf(partner).place===place),visibleSeats=new Set(visible.map(partner=>partner.seat));
    for(const [seat,actor] of [...actors])if(!visibleSeats.has(seat))remove(seat,actor);
    const motionOff=typeof reducedMotion==='function'?reducedMotion():reducedMotion,ids=[];
    for(const partner of visible){
      const life=partner.life,position=positionOf(partner);ids.push(partner.seat);let actor=actors.get(partner.seat)??create(partner);
      const asset=resolveActorAsset({archetype:position.archetype??partner.archetype},{facing:position.facing,moving:position.moving&&!motionOff,frame:Math.floor(clock/180)%2+1,hasAsset:id=>Boolean(art[id])});
      if(actor.asset!==asset){actor.body.material=materialFor(art,asset);actor.asset=asset;actor.body.userData.asset=asset;}
      const point=projectPoint(position.x,position.y);actor.group.position.set(point.x,point.y,0);actor.body.scale.x=position.facing==='left'?-1:1;actor.body.renderOrder=100+position.y+.15;
      if(life?.post){if(!actor.lantern&&art.lantern){actor.lantern=sprite('lantern',art.lantern);actor.group.add(actor.lantern);}if(actor.lantern){actor.lantern.visible=true;actor.lantern.position.y=1.55;}}
      else if(actor.lantern)actor.lantern.visible=false;
    }
    stats={drawn:ids.length,ids};return stats;
  }
  return {ingest,update,get stats(){return {drawn:stats.drawn,ids:[...stats.ids]};},dispose(){if(disposed)return;disposed=true;for(const [id,actor] of [...actors])remove(id,actor);root.removeFromParent();partners=[];}};
}
