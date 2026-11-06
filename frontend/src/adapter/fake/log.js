// Read-only Captain's Log projection. It copies accepted fake state and keeps reveal lines gated.
import {cardTitles,deductionData,kits} from './data.js';
import {routes,spotNames} from './routes.js';
import {revealLines} from './reveal.js';

const actionLabels={to_desk:'Searched the writing desk',to_shore:'Walked to the shore',to_tower:'Climbed toward the lighthouse',take_key:'Took the brass key',read_log:'Read Elena’s last log entry',desk_back:'Returned to the cottage',take_lantern:'Took the oil lantern',trust_fisherman:'Trusted the fisherman',warn_harbor:'Sent a note to the harbor master',shore_back:'Returned to the cottage',unlock_door:'Unlocked the lighthouse door',climb:'Climbed the lighthouse stairs',signal:'Flashed the harbor alarm',untie:'Hid with Elena'};
const endingLabels={ending_rescue:'Rescue ending',ending_trapped:'Tower ending'};
const minuteAt=value=>Number.isFinite(value)?Math.max(0,Math.floor(value/60)):null;
const displayAction=id=>actionLabels[id]??String(id).replaceAll('_',' ');

function introView(profile){
  if(!profile)return null;
  const kit=kits[profile.kitId];
  return {ending:endingLabels[profile.ending]??'Intro ending',kit:kit?.name??'Confirmed kit',actions:(profile.actions??[]).map(id=>({id,label:displayAction(id)})),readLog:!!profile.readLog};
}

function cardEntries(state){
  const entries=[];
  for(const [seat,cards] of Object.entries(state.found??{}))for(const id of cards??[]){
    const job=(state.jobs??[]).filter(item=>item.done&&item.cardId===id&&String(item.seat)===seat&&['search','fetch'].includes(item.order)).at(-1);
    const starter=id==='C2'&&state.crew?.seats.find(member=>member.seat===Number(seat))?.kitId==='witness';
    const route=job?routes.find(item=>item.cardId===id&&item.spot===job.spot):null;
    entries.push({id,title:cardTitles[id]??id,seat:Number(seat),where:job?(spotNames[job.spot]??job.spot):starter?'Arrival kit':'Crew journal',place:route?.place??(starter?kits.witness.startPlace:null),caseMinute:job?minuteAt(job.readyAt):starter?0:null});
  }
  return entries;
}

function partnerReports(state){
  const crew=new Map((state.crew?.seats??[]).map(seat=>[seat.seat,seat.name??`Seat ${seat.seat}`]));
  return (state.jobs??[]).filter(job=>job.orderedBy!=null&&job.report).map(job=>({id:job.id,seat:job.seat,name:crew.get(job.seat)??`Seat ${job.seat}`,order:job.order,report:job.report,done:!!job.done,caseMinute:minuteAt(job.done?job.readyAt:job.orderedAt)}));
}

function nightEntries(state){
  return [...(state.nightHistory??[]),...(state.night?[state.night]:[])].map(night=>{const lights=(night.locks??[]).map(lock=>lock.lightId);return {phase:night.phase,startedAt:minuteAt(night.startedAt),lights,report:night.phase==='success'?'The schooner was revealed.':night.phase==='dawn'?'The fog stayed.':night.phase==='night'?'Night is underway.':'Night record.'};});
}

export function caseLogView(state){
  const reveal=state.solved?revealLines(state).map(line=>({id:line.id,title:line.title,text:line.text,cites:[...line.cites]})):[];
  return {intro:introView(state.profile),cards:cardEntries(state),deductions:(state.deductions??[]).map(id=>deductionData.find(item=>item.id===id)).filter(Boolean).map(item=>({id:item.id,title:item.title,cards:[...item.cards]})),partnerReports:partnerReports(state),nights:nightEntries(state),reveal};
}
