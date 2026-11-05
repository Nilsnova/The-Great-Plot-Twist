// Temporary night rules, owned only by the local fake. Views carry no correct-bearing field.
import {accept,refuse,playerSeat,effect} from './state.js';
import {bearingBetween,angularDistance,normaliseDegrees} from '../../screens/beam-math.js';
export const lightLocations=[
  {id:'keepers_lamp',name:'Keeper’s lamp',x:96,y:169,public:true},
  {id:'harbor_light',name:'Harbor Light',x:222,y:157,public:true},
  {id:'islet_signal_station',name:'Islet signal station',x:302,y:193,public:false},
  {id:'ruin_light',name:'Watchtower ruin',x:363,y:61,public:false},
];
export const rehearsalGlow={x:250,y:40};
const ready=(state,id)=>['keepers_lamp','harbor_light'].includes(id)||(id==='islet_signal_station'?state.stations:id==='ruin_light'&&state.ruinReady);
export function buildLight(state,id){
  if(state.crew?.status!=='active')return refuse('crew_required','Muster your crew first.');
  if(!['islet_signal_station','ruin_light'].includes(id))return refuse('unknown_light','That light cannot be built.');
  if(ready(state,id))return refuse('already_built','This light is ready.');
  if(id==='ruin_light'&&!state.deductions.includes('D3'))return refuse('deduction_required','D3 opens the lens workshop.');
  if(state.jobs.some(job=>!job.done&&job.order==='build_light'))return refuse('busy','A light is already being prepared.');
  if(state.coins<300||state.timber<10)return refuse('materials_required','This work needs 300 coins and 10 timber.');
  state.coins-=300;state.timber-=10;
  state.jobs.push({id:++state.jobId,seat:playerSeat(state),order:'build_light',target:id,orderedAt:state.now,readyAt:state.now+(id==='ruin_light'?300:0),done:false});
  return accept(id==='ruin_light'?'Lens craft started · three minutes, then two minutes to fit it.':'Signal station built.');
}
export function callNightfall(state){
  if(state.crew?.status!=='active')return refuse('crew_required','Muster your crew first.');
  if(!state.deductions.includes('D1'))return refuse('deduction_required','Complete D1 at the Captain’s Table first.');
  if(state.night?.phase==='night'||state.schooner)return refuse('night_in_progress','This night has already begun.');
  if(state.night?.phase==='dawn'&&state.night.retryAt>state.now)return refuse('dawn_wait','Wait for the next night.');
  const posts=state.duties.filter(duty=>['keepers_lamp','harbor_light'].includes(duty.lightId)).map(duty=>({...duty,reserved:false,readyAt:state.now}));
  if(state.night)(state.nightHistory??=[]).push(structuredClone(state.night));
  state.night={phase:'night',startedAt:state.now,endsAt:state.now+1200,retryAt:0,posts,locks:[],missUntil:{},bearings:{}};
  return accept('Nightfall. Three seats must hold three lights at once.');
}
export function takePost(state,id){
  if(state.night?.phase!=='night')return refuse('night_required','Call nightfall first.');
  if(!ready(state,id))return refuse('light_not_ready','Build or restore this light first.');
  const seat=playerSeat(state),post=state.night.posts.find(post=>post.lightId===id);
  if(post&&post.seat!==seat)return refuse('post_taken','Another seat holds that light.');
  if(post?.seat===seat)return refuse('already_on_post','You already hold this post.');
  if(state.jobs.some(job=>job.seat===seat&&!job.done))return refuse('busy','Finish your current task first.');
  state.night.posts=state.night.posts.filter(item=>item.seat!==seat);state.night.locks=state.night.locks.filter(item=>item.seat!==seat);
  state.night.posts.push({seat,lightId:id,reserved:true,readyAt:state.now+60});
  state.jobs.push({id:++state.jobId,seat,order:'take_post',target:id,orderedAt:state.now,readyAt:state.now+60,done:false});
  return accept('Climbing to the post · one case minute.');
}
export function aim(state,id,degrees){
  const night=state.night,light=lightLocations.find(light=>light.id===id);
  if(night?.phase!=='night')return refuse('night_required','There is no active night.');
  if(!light||!Number.isFinite(degrees))return refuse('invalid_bearing','Choose a bearing in degrees.');
  const post=night.posts.find(post=>post.lightId===id);
  if(!post||post.reserved)return refuse('post_not_ready','A crew member must reach this post first.');
  if(post.seat!==playerSeat(state)&&!state.duties.some(duty=>duty.seat===post.seat&&duty.lightId===id))return refuse('post_not_owned','Your crew does not control this post.');
  if((night.missUntil[id]??0)>state.now)return refuse('aim_cooldown','Wait five seconds before another lock attempt.');
  if(angularDistance(degrees,bearingBetween(light,rehearsalGlow))>5){night.missUntil[id]=state.now+5;return refuse('off_target','No lock. Watch the glow and try another bearing.');}
  night.bearings[id]=normaliseDegrees(degrees);night.locks=night.locks.filter(lock=>lock.lightId!==id);night.locks.push({lightId:id,seat:post.seat,aimedBy:playerSeat(state),until:state.now+90});settleNight(state);
  return accept(state.schooner?'Three lights locked. The fog parts.':'Beam locked · held for 90 seconds.');
}
export function settleNight(state){
  const night=state.night;if(!night)return false;let changed=false;
  const kept=night.locks.filter(lock=>lock.until>state.now&&night.posts.some(post=>post.lightId===lock.lightId&&post.seat===lock.seat&&!post.reserved));
  if(kept.length!==night.locks.length){night.locks=kept;changed=true;}
  if(night.phase==='night'&&state.now>=night.endsAt){night.phase='dawn';night.retryAt=state.now+180;night.locks=[];state.lastReport='Dawn. The fog stayed. Your cards and buildings are safe.';return true;}
  if(night.phase==='night'&&new Set(night.locks.map(lock=>lock.seat)).size>=3&&new Set(night.locks.map(lock=>lock.lightId)).size>=3){night.phase='success';state.schooner=true;changed=true;
    effect(state,'three_lights',{lights:night.locks.slice(0,3).map(lock=>lock.lightId),target:rehearsalGlow});effect(state,'fog_lift');effect(state,'schooner_reveal');state.lastReport='Three lights meet. The schooner is within reach.';}
  return changed;
}
export function nightView(state){
  const night=state.night,phase=night?.phase??'waiting',crewReady=state.crew?.status==='active',mine=playerSeat(state);
  return {phase,remaining:night?Math.max(0,night.endsAt-state.now):1200,dawnRemaining:phase==='dawn'?Math.max(0,night.retryAt-state.now):0,
    status:phase==='success'?'The schooner is revealed.':phase==='dawn'?'Dawn. Prepare for another night.':phase==='night'?'Aim toward the glow. Lock three lights from three seats at once.':'Complete D1, then call nightfall.',
    canCall:crewReady&&state.deductions.includes('D1')&&!state.schooner&&phase!=='night'&&(phase!=='dawn'||night.retryAt<=state.now),
    glow:phase==='night'?rehearsalGlow:null,chartDescription:phase==='night'?`Chart coordinates: north is up. Gold glow at x ${rehearsalGlow.x}, y ${rehearsalGlow.y}. ${lightLocations.map(light=>`${light.name}: x ${light.x}, y ${light.y}`).join('; ')}.`:null,materials:{coins:state.coins,timber:state.timber},
    buildJobs:state.jobs.filter(job=>job.order==='build_light').map(job=>({id:job.id,target:job.target,total:job.readyAt-job.orderedAt,remaining:Math.max(0,job.readyAt-state.now),done:job.done,report:job.report})),
    lights:lightLocations.map(light=>{const post=night?.posts.find(post=>post.lightId===light.id),lock=night?.locks.find(lock=>lock.lightId===light.id),built=ready(state,light.id),pendingBuild=state.jobs.some(job=>!job.done&&job.order==='build_light');return {...light,ready:built,post:post?{seat:post.seat,label:state.crew?.seats.find(member=>member.seat===post.seat)?.name??`Seat ${post.seat}`,reserved:post.reserved,remaining:Math.max(0,post.readyAt-state.now)}:null,
      bearing:night?.bearings[light.id]??0,lock:lock?{remaining:Math.max(0,lock.until-state.now)}:null,
      canTake:phase==='night'&&built&&!post&&!state.jobs.some(job=>job.seat===mine&&!job.done),canAim:phase==='night'&&!!post&&!post.reserved&&(post.seat===mine||state.duties.some(duty=>duty.seat===post.seat))&&(night.missUntil[light.id]??0)<=state.now,
      canBuild:crewReady&&!built&&!pendingBuild&&!light.public&&(light.id!=='ruin_light'||state.deductions.includes('D3'))&&state.coins>=300&&state.timber>=10,buildLabel:light.id==='ruin_light'?'Craft and fit lens · 300 coins + 10 timber · 5 min':'Build signal · 300 coins + 10 timber'};})};
}
