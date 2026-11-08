// Owns optional live actors and their HUD. Receives snapshots; sends bounded position/emote intents only.
import {loadArt,placeArt,projectPoint} from './art.js';
import {characterArtIds} from '../pixel/story-catalog.js';
import {createPositionReporter} from '../controls/presence-report.js';
export function createWorldExperience(ctx){
  let latest=null,others=null,hud=null,coins=null,partners=null,ownedArt=null,pending=null,disposed=false,facing='front',previous=null,localBubble=null;
  const reporter=createPositionReporter(sample=>ctx.send('reportPosition',sample));
  async function prepare(){
    if(pending||others||disposed)return;
    const ids=['deckhand','navigator','cook','salvager'].flatMap(role=>characterArtIds(`crew-${role}`));
    ids.push('lantern',...['wave','cheer','point','lantern','shrug'].map(id=>`emote-${id}`));
    pending=Promise.all([import('./others/index.js'),import('../screens/presence/index.js'),loadArt(ids),import('../screens/rewards/counter.js'),import('./partners/index.js')]).then(([actors,ui,art,rewards,npcs])=>{
      if(disposed){releaseArt(art);return;}
      ownedArt=art;partners=npcs.createWorldPartners(ctx.scene,ctx.container,{...ctx.art,...art},ctx.reducedMotion);partners.ingest(latest);localBubble=placeArt(ctx.scene,art,'emote-wave',0,0);localBubble.name='local-captain-emote';localBubble.visible=false;localBubble.renderOrder=942;others=actors.createOtherCaptains(ctx.scene,ctx.container,{...ctx.art,...art},ctx.reducedMotion);
      coins=rewards.createCoinCounter({reducedMotion:ctx.reducedMotion});
      (ctx.container.querySelector('.captain-status')??ctx.container).append(coins.element);
      hud=ui.createPresenceHud({send:ctx.send,onCrew:ctx.openCrew});
      (ctx.container.querySelector('.hud')??ctx.container).append(hud.element);
      if(latest){others.ingest(latest.presence);hud.update(latest);coins.update(latest.rewards);}
    }).catch(()=>{}).finally(()=>{pending=null;});
  }
  function releaseArt(art){for(const material of Object.values(art??{})){material.map?.dispose();material.dispose();}}
  function apply(view){
    if(coins&&view.rewards.balance!==latest?.rewards.balance)coins.update(view.rewards);
    latest=view;
    const mustered=view.mode==='online'&&view.account?.state==='signed_in'&&view.account?.hasKit===true
      &&view.crew?.status==='active'&&Array.isArray(view.crew.seats)&&view.crew.seats.some(seat=>seat?.kind==='npc');
    if(view.presence.status!=='off'||view.rewards.balance!==null||view.partners.length||mustered)void prepare();
    partners?.ingest(view);others?.ingest(view.presence);hud?.update(view);
  }
  function update(dt,{speed=0}={}){
    if(!latest||disposed)return;
    const place=ctx.world.current?.id,player=ctx.player;
    if(previous){const dx=player.position.x-previous.x,dz=player.position.z-previous.y;
      if(Math.abs(dx)+Math.abs(dz)>.001)facing=Math.abs(dx)>Math.abs(dz)?dx<0?'left':'right':dz<0?'back':'front';}
    previous={x:player.position.x,y:player.position.z};
    const filter=ctx.preferences().showCaptains??'everyone',presence=latest.presence;
    if(place)reporter.update({place,...previous,facing,moving:speed>.05},performance.now(),{
      enabled:!ctx.isDemo()&&!ctx.isIntro()&&['live','reconnecting'].includes(presence.status),
    });
    const emote=presence.localEmote;if(localBubble){localBubble.visible=!!emote&&emote.until>Date.now()&&!ctx.isBlocked();if(localBubble.visible){const point=projectPoint(player.position.x,player.position.z);localBubble.material=ownedArt[`emote-${emote.id}`]??ownedArt['emote-wave'];localBubble.position.set(Math.round(point.x*16)/16,Math.round((point.y+2.05)*16)/16,0);localBubble.userData.emoteId=emote.id;}}
    partners?.update(dt,{place,now:Date.now()});
    if(!others)return;
    const stats=others.update(dt,{place,player:previous,camera:ctx.camera,canvas:ctx.canvas,now:Date.now(),
      filter:presence.status==='off'?'off':filter,blocked:ctx.isBlocked()});
    hud?.setCounts(stats);
    if(hud)hud.element.hidden=presence.status==='off'||ctx.isBlocked();
  }
  return {apply,update,get stats(){return others?.stats??{drawn:0,hidden:0,ids:[]};},
    dispose(){if(disposed)return;disposed=true;reporter.reset();others?.dispose();partners?.dispose();hud?.dispose();coins?.dispose();localBubble?.removeFromParent();localBubble?.geometry.dispose();releaseArt(ownedArt);},
  };
}
