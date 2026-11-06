// Settles due fake jobs when asked. No background timer or screen decides a completed result.
import {recordPartnerEvent} from './partner-life.js';
import {pinCard} from './board.js';
import {cardTitles} from './data.js';
export function settleJobs(state) {
  let changed=false;
  for(const job of state.jobs){if(job.done||job.readyAt>state.now)continue;job.done=true;changed=true;
    if(['search','fetch'].includes(job.order)){
      if(job.cardId){if(!state.found[job.seat].includes(job.cardId))state.found[job.seat].push(job.cardId);job.report=`${cardTitles[job.cardId]} is in seat ${job.seat}’s journal.`;}else job.report='No card found.';
    }
    if(job.order==='pin'){pinCard(state,job.cardId,job.seat,job.orderedBy);job.report=`${cardTitles[job.cardId]} is pinned under seat ${job.seat}.`;}
    if(job.order==='man_light'&&!job.partnerDeparted){state.duties.push({seat:job.seat,lightId:job.target});const post=state.night?.posts.find(post=>post.seat===job.seat);if(post)post.reserved=false;job.report='On post at the light.';}
    if(job.order==='take_post'){const post=state.night?.posts.find(post=>post.seat===job.seat&&post.lightId===job.target);if(post)post.reserved=false;job.report='On post at the light.';}
    if(job.order==='build_light'){if(job.target==='ruin_light')state.ruinReady=true;else state.stations=true;job.report='The light is ready.';}
    if(job.order==='wait')job.report='Standing by.';
    if(state.crew?.seats.find(seat=>seat.seat===job.seat)?.kind==='npc')recordPartnerEvent(state,{seat:job.seat,type:job.order==='pin'?'pinned_card':job.order==='man_light'?'manning_light':job.cardId?'found_card':job.order==='wait'?'arrived':'found_nothing',order:job.order});
    state.lastReport=job.report;
  }
  return changed;
}
