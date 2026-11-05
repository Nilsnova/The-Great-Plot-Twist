// Pure presence math shared by the renderer and its focused tests.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const PRESENCE_LIMITS=Object.freeze({visible:8,interpolationMs:200,extrapolationMs:250,snapGapMs:2000,fadeMs:420});
export const crewSkinByKit=Object.freeze({true_keeper:'navigator',witness:'cook',informant:'salvager',stranger:'deckhand'});
const validArchetypes=new Set(['navigator','cook','salvager','deckhand']);

export function resolveActorAsset(peer,{facing='front',moving=false,frame=1,hasAsset=()=>false}={}){
  const archetype=validArchetypes.has(peer?.archetype)?peer.archetype:crewSkinByKit[peer?.kit?.id];
  const view=facing==='back'?'-back':facing==='left'||facing==='right'?'-side':'';
  const walk=moving?`-walk-${frame}`:'';
  const choices=[archetype?`crew-${archetype}${view}${walk}`:null,`explorer${view}${walk}`,`explorer${view}`,'explorer'].filter(Boolean);
  return choices.find(hasAsset)??'explorer';
}

export function samplePosition({from,to,fromAt,toAt,time,moving=true}){
  const span=Math.max(0,toAt-fromAt),progress=span?clamp((time-fromAt)/span,0,1):1;
  let x=from.x+(to.x-from.x)*progress,y=from.y+(to.y-from.y)*progress;
  const extra=clamp(time-toAt,0,PRESENCE_LIMITS.extrapolationMs);
  if(extra&&moving&&span){
    x+=clamp((to.x-from.x)/span,-.006,.006)*extra;
    y+=clamp((to.y-from.y)/span,-.006,.006)*extra;
  }
  return {x,y};
}

export function shouldSnapSample({place,previousPlace,sampledAt,lastReceivedAt}){
  return place!==previousPlace||sampledAt-lastReceivedAt>PRESENCE_LIMITS.snapGapMs;
}

export function selectNearby(records,{place,player={x:0,y:0},now,filter='everyone',blocked=false,max=PRESENCE_LIMITS.visible}={}){
  const eligible=records.filter(record=>record.place===place&&(
    record.leavingAt===null||record.leavingAt===undefined||now-record.leavingAt<PRESENCE_LIMITS.fadeMs))
    .filter(record=>filter==='everyone'||filter==='crew'&&record.peer.isCrew)
    .sort((a,b)=>Math.hypot(a.to.x-player.x,a.to.y-player.y)-Math.hypot(b.to.x-player.x,b.to.y-player.y)||a.id.localeCompare(b.id));
  const selected=blocked||filter==='off'?[]:eligible.slice(0,max);
  return {selected,hidden:blocked||filter==='off'?0:Math.max(0,eligible.length-selected.length)};
}

export function placePresenceLabels(entries,{width,height,top=258,bottom=230,labelWidth=180,labelHeight=26,gap=6,maxLabels=2}={}){
  const safeWidth=Math.max(0,Math.min(labelWidth,width-16)),maxTop=height-bottom-labelHeight;
  if(safeWidth<=0||maxTop<top)return [];
  const placed=[],max=Math.min(entries.length,maxLabels);
  for(let index=0;index<max;index++){
    const point=entries[index].point;if(!point)continue;
    if(point.y<top-labelHeight-10||point.y>maxTop+labelHeight+10)continue;
    const left=clamp(point.x-safeWidth/2,8,Math.max(8,width-safeWidth-8));
    const choices=[point.y-labelHeight-10,point.y+10,top,maxTop].map(y=>clamp(y,top,maxTop));
    let y=choices.find(candidate=>placed.every(item=>candidate+labelHeight+gap<=item.top||item.top+item.height+gap<=candidate));
    if(y===undefined)continue;
    placed.push({index,left,top:y,width:safeWidth,height:labelHeight});
  }
  return placed;
}
